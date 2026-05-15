"use server";

import { revalidatePath } from "next/cache";
import { requireCompanyRole, requireOCAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import {
  applySettlementSchema,
  type ApplySettlementInput,
  type OwnershipHistoryEntry,
} from "@/lib/validations/settlement";
import { fetchObject } from "@/lib/storage/r2";
import { runDocumentAiOcr } from "@/lib/google/document-ai";

import { generateInviteCode } from "@/lib/invite-code";

// ─── Settlement PDF parsing ─────────────────────────────────────
//
// First-cut: we run Document AI OCR on every uploaded settlement PDF and
// store the sanitised raw text on `documents.ocr_text` (parallel run
// pattern shared with the wizard's plan-of-subdivision flow — see
// CLAUDE.md "Document OCR" rule). The raw text powers full-text search +
// future Gemini structured extraction.
//
// Structured field extraction via Gemini (Settlement statement → new
// owner name / settlement date / sale price / etc.) is deferred. The
// parseSettlement* paths now return an empty SettlementReview so the
// manager can complete the review form manually; once the Gemini prompt
// + schema are written we drop the parsed nulls in here.

type StubReturn = { data?: SettlementReview; error: string };

// ─── parseSettlementForReview ──────────────────────────────────

export interface SettlementReview {
  parsed: {
    lotNumber: number | null;
    planNumber: string | null;
    transferee: {
      name: string | null;
      email: string | null;
      phone: string | null;
      postalAddress: string | null;
      dateOfBirth: string | null;
    };
    settlementDate: string | null;
    salePriceCents: number | null;
    contractDate: string | null;
    conveyancer: { name: string | null; email: string | null };
    additionalTransferees: Array<{ name: string | null }>;
  };
  matches: {
    lotNumber: boolean | null;
    planNumber: boolean | null;
  };
  expected: {
    lotNumber: number | null;
    planNumber: string | null;
    planNumberNormalized: string | null;
  };
  currentOwner: {
    profileId: string | null;
    name: string | null;
    email: string | null;
    joinedAt: string | null;
  } | null;
  pendingInvitationId: string | null;
  documentName: string;
  matchedLot: {
    id: string;
    lotNumber: number;
    unitNumber: string | null;
  } | null;
}

// Empty review used as a fallback when structured-field extraction isn't
// available yet (Gemini integration deferred). The manager fills the
// review form by hand; the OCR raw text is still stored on the document.
function emptyReview(args: {
  documentName: string;
  matchedLot: SettlementReview["matchedLot"];
  expected: SettlementReview["expected"];
  currentOwner: SettlementReview["currentOwner"];
  pendingInvitationId: string | null;
}): SettlementReview {
  return {
    parsed: {
      lotNumber: null,
      planNumber: null,
      transferee: {
        name: null, email: null, phone: null, postalAddress: null, dateOfBirth: null,
      },
      settlementDate: null,
      salePriceCents: null,
      contractDate: null,
      conveyancer: { name: null, email: null },
      additionalTransferees: [],
    },
    matches: { lotNumber: null, planNumber: null },
    expected: args.expected,
    currentOwner: args.currentOwner,
    pendingInvitationId: args.pendingInvitationId,
    documentName: args.documentName,
    matchedLot: args.matchedLot,
  };
}

/**
 * Document AI OCR parallel run. Fetches the PDF from R2, runs OCR, and
 * stores the sanitised raw text on the documents row. Non-fatal — a
 * failure logs server-side but doesn't break the settlement flow (the
 * manager can still complete review manually). Pattern matches the
 * wizard's plan-of-subdivision OCR step.
 */
async function ocrSettlementDocument(documentId: string): Promise<void> {
  const supabase = createServerClient();
  const { data: doc, error } = await supabase
    .from("documents")
    .select("id, file_path, mime_type, ocr_status")
    .eq("id", documentId)
    .maybeSingle();
  if (error || !doc) {
    console.error("ocrSettlementDocument: document fetch failed", error);
    return;
  }
  // Skip if already done (idempotent on retry / resume).
  if (doc.ocr_status === "complete") return;
  try {
    const bytes = await fetchObject(doc.file_path);
    const buffer = Buffer.from(bytes);
    const result = await runDocumentAiOcr(buffer, doc.mime_type ?? "application/pdf");
    await supabase
      .from("documents")
      .update({ ocr_text: result.text, ocr_status: "complete" })
      .eq("id", documentId);
  } catch (err) {
    console.error("ocrSettlementDocument: OCR failed", err);
    await supabase
      .from("documents")
      .update({ ocr_status: "failed" })
      .eq("id", documentId);
  }
}

export async function parseSettlementForReview(
  documentId: string,
  lotId: string,
): Promise<StubReturn> {
  await requireCompanyRole();
  const supabase = createServerClient();

  const { data: doc } = await supabase
    .from("documents")
    .select("id, file_name, oc_id, lot_id")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return { error: "Document not found" };
  if (doc.lot_id !== lotId) return { error: "Document is not attached to this lot" };
  await requireOCAccess(doc.oc_id);

  const { data: lot } = await supabase
    .from("lots")
    .select("id, lot_number, unit_number, oc_id")
    .eq("id", lotId)
    .maybeSingle();
  if (!lot) return { error: "Lot not found" };

  const { data: ocRow } = await supabase
    .from("owners_corporations")
    .select("plan_number")
    .eq("id", lot.oc_id)
    .maybeSingle();

  // Kick off OCR alongside the return — we don't block on it so the
  // manager sees the review form immediately, and the raw text lands on
  // the document row shortly after.
  void ocrSettlementDocument(documentId);

  return {
    error: "",
    data: emptyReview({
      documentName: doc.file_name,
      matchedLot: {
        id: lot.id,
        lotNumber: lot.lot_number,
        unitNumber: lot.unit_number,
      },
      expected: {
        lotNumber: lot.lot_number,
        planNumber: ocRow?.plan_number ?? null,
        planNumberNormalized: (ocRow?.plan_number ?? null)?.toUpperCase().replace(/\s+/g, "") ?? null,
      },
      currentOwner: null,
      pendingInvitationId: null,
    }),
  };
}

// ─── parseSettlementAndMatchLot ──────────────────────────────
// Bulk-upload entry point used from the /lots page Tools dropdown. The
// PDF is uploaded against the OC (not yet attached to a specific lot);
// once the manager picks the lot in the review form we attach it.

export async function parseSettlementAndMatchLot(
  documentId: string,
  ocId: string,
): Promise<StubReturn> {
  await requireCompanyRole();
  await requireOCAccess(ocId);
  const supabase = createServerClient();

  const { data: doc } = await supabase
    .from("documents")
    .select("id, file_name, oc_id")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc) return { error: "Document not found" };

  const { data: ocRow } = await supabase
    .from("owners_corporations")
    .select("plan_number")
    .eq("id", ocId)
    .maybeSingle();

  void ocrSettlementDocument(documentId);

  return {
    error: "",
    data: emptyReview({
      documentName: doc.file_name,
      matchedLot: null,
      expected: {
        lotNumber: null,
        planNumber: ocRow?.plan_number ?? null,
        planNumberNormalized: (ocRow?.plan_number ?? null)?.toUpperCase().replace(/\s+/g, "") ?? null,
      },
      currentOwner: null,
      pendingInvitationId: null,
    }),
  };
}

// ─── applySettlementToLot ─────────────────────────────────────

export async function applySettlementToLot(input: ApplySettlementInput) {
  const profile = await requireCompanyRole();
  const parsed = applySettlementSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { documentId, lotId, newOwner, settlementDate } = parsed.data;

  const supabase = createServerClient();

  const { data: doc } = await supabase
    .from("documents")
    .select("id, oc_id, lot_id, file_name")
    .eq("id", documentId)
    .single();

  if (!doc) return { error: "Document not found" };
  if (doc.lot_id !== lotId) return { error: "Document is not attached to this lot" };
  await requireOCAccess(doc.oc_id);

  const { data: lot } = await supabase
    .from("lots")
    .select("id, lot_number")
    .eq("id", lotId)
    .eq("oc_id", doc.oc_id)
    .single();

  if (!lot) return { error: "Lot not found in this oc" };

  const settlementTimestamp = new Date(`${settlementDate}T00:00:00Z`).toISOString();

  // 1. End the current active member, if any.
  const { data: activeMember } = await supabase
    .from("oc_members")
    .select("id, profile_id, joined_at, role, is_primary_contact, is_financial")
    .eq("lot_id", lotId)
    .eq("role", "lot_owner")
    .is("left_at", null)
    .maybeSingle();

  if (activeMember) {
    const { error: updErr } = await supabase
      .from("oc_members")
      .update({ left_at: settlementTimestamp })
      .eq("id", activeMember.id);
    if (updErr) return { error: `Could not end existing ownership: ${updErr.message}` };

    await supabase.from("audit_log").insert({
      profile_id: profile.id,
      oc_id: doc.oc_id,
      action: "ownership_transfer",
      entity_type: "oc_member",
      entity_id: activeMember.id,
      before_state: { left_at: null },
      after_state: { left_at: settlementTimestamp },
      metadata: {
        settlement_document_id: documentId,
        side: "outgoing",
        lot_id: lotId,
      },
    });
  }

  // 2. Mark any existing pending invitation as revoked (replaced by this settlement).
  const { data: existingPending } = await supabase
    .from("invitations")
    .select("id, email, name")
    .eq("lot_id", lotId)
    .eq("status", "pending");

  if (existingPending && existingPending.length > 0) {
    await supabase
      .from("invitations")
      .update({ status: "revoked" })
      .in("id", existingPending.map((i) => i.id));
  }

  // 3. Create the new pending invitation. NO email is sent.
  const { data: invitation, error: invErr } = await supabase
    .from("invitations")
    .insert({
      oc_id: doc.oc_id,
      lot_id: lotId,
      email: newOwner.email,
      name: newOwner.name,
      phone: newOwner.phone,
      role: "lot_owner",
      invited_by: profile.id,
      code: generateInviteCode(),
    })
    .select("id, code, email, name")
    .single();

  if (invErr || !invitation) {
    return { error: invErr?.message ?? "Could not create invitation" };
  }

  // 4. Audit-log the new invitation side of the transfer.
  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    oc_id: doc.oc_id,
    action: "ownership_transfer",
    entity_type: "invitation",
    entity_id: invitation.id,
    after_state: {
      email: invitation.email,
      name: invitation.name,
      lot_id: lotId,
    },
    metadata: {
      settlement_document_id: documentId,
      side: "incoming",
      settlement_date: settlementDate,
      postal_address: newOwner.postalAddress,
      date_of_birth: newOwner.dateOfBirth,
      replaced_pending_invitation_ids: existingPending?.map((i) => i.id) ?? [],
    },
  });

  // 5. Notify the outgoing owner in-app (no email).
  if (activeMember?.profile_id) {
    const { data: oc } = await supabase
      .from("owners_corporations")
      .select("name, address")
      .eq("id", doc.oc_id)
      .single();

    const lotLabel = oc?.address ?? oc?.name ?? `Lot ${lot.lot_number}`;
    await supabase.from("notifications").insert({
      profile_id: activeMember.profile_id,
      oc_id: doc.oc_id,
      type: "ownership_ended",
      title: "Ownership transferred",
      body: `Your ownership of ${lotLabel} ended on ${settlementDate}. Your historical records remain available under Past lots.`,
      link: `/dashboard/past-lots/${lotId}`,
    });
  }

  revalidatePath("/ocs/[ocCode]/lots/[lotId]", "page");
  revalidatePath("/ocs/[ocCode]/manage", "page");
  revalidatePath("/dashboard", "page");

  return {
    success: true,
    invitationId: invitation.id,
    invitationCode: invitation.code,
    endedMemberId: activeMember?.id ?? null,
  };
}

// ─── getLotOwnershipHistory (manager-side, for the lot detail page) ─

export async function getLotOwnershipHistory(
  lotId: string,
): Promise<OwnershipHistoryEntry[]> {
  try {
    return await getLotOwnershipHistoryInner(lotId);
  } catch (err) {
    console.error("getLotOwnershipHistory failed:", err);
    return [];
  }
}

async function getLotOwnershipHistoryInner(
  lotId: string,
): Promise<OwnershipHistoryEntry[]> {
  const supabase = createServerClient();

  const { data: members, error } = await supabase
    .from("oc_members")
    .select(
      "id, profile_id, joined_at, left_at, is_primary_contact, is_financial, profiles(first_name, last_name, email)",
    )
    .eq("lot_id", lotId)
    .eq("role", "lot_owner")
    .order("joined_at", { ascending: false });

  if (error) throw new Error(`oc_members query failed: ${error.message}`);
  if (!members || members.length === 0) return [];

  // Pull audit_log rows that reference these member rows so we can show the
  // settlement document for each ended tenure.
  const memberIds = members.map((m) => m.id);
  const { data: auditRows } = await supabase
    .from("audit_log")
    .select("entity_id, metadata")
    .eq("entity_type", "oc_member")
    .eq("action", "ownership_transfer")
    .in("entity_id", memberIds);

  const docIds = new Set<string>();
  const docByMember = new Map<string, string>();
  for (const row of auditRows ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta = (row as any).metadata ?? {};
    if (meta.settlement_document_id && row.entity_id) {
      docByMember.set(row.entity_id, meta.settlement_document_id);
      docIds.add(meta.settlement_document_id);
    }
  }

  const docMap = new Map<string, { fileName: string; filePath: string }>();
  if (docIds.size > 0) {
    const { data: docs } = await supabase
      .from("documents")
      .select("id, file_name, file_path")
      .in("id", Array.from(docIds));
    for (const d of docs ?? []) {
      docMap.set(d.id, { fileName: d.file_name, filePath: d.file_path });
    }
  }

  const publicBase = process.env.R2_PUBLIC_URL ?? null;

  return members.map((m) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = (m as any).profiles;
    const docId = docByMember.get(m.id) ?? null;
    const doc = docId ? docMap.get(docId) ?? null : null;
    return {
      id: m.id,
      profileId: m.profile_id,
      name: [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim() || null,
      email: p?.email ?? null,
      joinedAt: m.joined_at,
      leftAt: m.left_at,
      isPrimaryContact: m.is_primary_contact,
      isFinancial: m.is_financial,
      settlementDocument: doc
        ? {
            id: docId!,
            fileName: doc.fileName,
            publicUrl: publicBase ? `${publicBase}/${doc.filePath}` : null,
          }
        : null,
    };
  });
}
