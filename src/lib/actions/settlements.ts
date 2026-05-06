"use server";

import { revalidatePath } from "next/cache";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { requireCompanyRole, requireSubdivisionAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { parseSettlementPdf, type ParsedSettlement } from "@/lib/pdf/parse-settlement";
import {
  applySettlementSchema,
  type ApplySettlementInput,
  type OwnershipHistoryEntry,
} from "@/lib/validations/settlement";

// ─── R2 helper ─────────────────────────────────────────────────

const R2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME ?? "msm-company-logos";

async function fetchDocumentBytes(filePath: string): Promise<Buffer> {
  const out = await R2.send(new GetObjectCommand({ Bucket: BUCKET, Key: filePath }));
  const body = out.Body;
  if (!body) throw new Error("Document body was empty");
  // SDK v3 stream — transformToByteArray() is on the SdkStream mixin.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bytes: Uint8Array = await (body as any).transformToByteArray();
  return Buffer.from(bytes);
}

// ─── parseSettlementForReview ──────────────────────────────────

export interface SettlementReview {
  parsed: Omit<ParsedSettlement, "rawText">;
  matches: {
    lotNumber: boolean | null;   // null = couldn't be checked (missing data)
    planNumber: boolean | null;
  };
  currentOwner: {
    profileId: string | null;
    name: string | null;
    email: string | null;
    joinedAt: string | null;
  } | null;
  pendingInvitationId: string | null;  // existing pending invite that would be replaced
  documentName: string;
  matchedLot: {
    id: string;
    lotNumber: number;
    unitNumber: string | null;
  } | null;                            // populated only by parseAndMatchSettlement
}

export async function parseSettlementForReview(
  documentId: string,
  lotId: string,
): Promise<{ data?: SettlementReview; error?: string }> {
  await requireCompanyRole();
  const supabase = createServerClient();

  const { data: doc } = await supabase
    .from("documents")
    .select("id, subdivision_id, lot_id, file_name, file_path, mime_type")
    .eq("id", documentId)
    .single();

  if (!doc) return { error: "Document not found" };
  if (doc.lot_id !== lotId) return { error: "Document is not attached to this lot" };
  await requireSubdivisionAccess(doc.subdivision_id);

  const { data: lot } = await supabase
    .from("lots")
    .select("id, lot_number, subdivisions:subdivisions!inner(id, plan_number)")
    .eq("id", lotId)
    .single();

  if (!lot) return { error: "Lot not found" };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const planNumber: string | null = (lot as any).subdivisions?.plan_number ?? null;

  let parsed: ParsedSettlement;
  try {
    const bytes = await fetchDocumentBytes(doc.file_path);
    parsed = await parseSettlementPdf(bytes);
  } catch {
    return { error: "Failed to read the uploaded PDF. Please re-upload or assign the owner manually." };
  }

  const matches = {
    lotNumber:
      parsed.lotNumber == null
        ? null
        : Number(parsed.lotNumber) === Number(lot.lot_number),
    planNumber:
      !planNumber || !parsed.planNumber
        ? null
        : parsed.planNumber.toUpperCase() === planNumber.toUpperCase(),
  };

  // Current active owner (will be ended on confirm).
  const { data: activeMember } = await supabase
    .from("subdivision_members")
    .select("profile_id, joined_at, profiles!inner(first_name, last_name, email)")
    .eq("lot_id", lotId)
    .eq("role", "lot_owner")
    .is("left_at", null)
    .maybeSingle();

  let currentOwner: SettlementReview["currentOwner"] = null;
  if (activeMember) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = (activeMember as any).profiles;
    const name = [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim() || null;
    currentOwner = {
      profileId: activeMember.profile_id,
      name,
      email: p?.email ?? null,
      joinedAt: activeMember.joined_at,
    };
  }

  // Existing pending invitation (will be marked replaced on confirm).
  const { data: pendingInv } = await supabase
    .from("invitations")
    .select("id")
    .eq("lot_id", lotId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Strip rawText — too large for the wire and not needed by the UI.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { rawText: _rawText, ...display } = parsed;

  return {
    data: {
      parsed: display,
      matches,
      currentOwner,
      pendingInvitationId: pendingInv?.id ?? null,
      documentName: doc.file_name,
      matchedLot: null,
    },
  };
}

// ─── parseSettlementAndMatchLot ──────────────────────────────
// Bulk-upload entry point. The manager drops a PDF on the subdivision-level
// lots page; we parse it, look up the lot in *this* subdivision by parsed lot
// number + plan number, and if found update the document to attach it to the
// lot. The manager confirms a single subsequent applySettlementToLot call.

export async function parseSettlementAndMatchLot(
  documentId: string,
  subdivisionId: string,
): Promise<{ data?: SettlementReview; error?: string }> {
  await requireCompanyRole();
  await requireSubdivisionAccess(subdivisionId);
  const supabase = createServerClient();

  const { data: doc } = await supabase
    .from("documents")
    .select("id, subdivision_id, lot_id, file_name, file_path, mime_type")
    .eq("id", documentId)
    .single();

  if (!doc) return { error: "Document not found" };
  if (doc.subdivision_id !== subdivisionId) {
    return { error: "Document is not in this subdivision" };
  }

  let parsed: ParsedSettlement;
  try {
    const bytes = await fetchDocumentBytes(doc.file_path);
    parsed = await parseSettlementPdf(bytes);
  } catch {
    return { error: "Failed to read the uploaded PDF. Please re-upload or assign the owner manually." };
  }

  if (parsed.lotNumber == null) {
    return {
      error: "Could not find a lot number in the document. Open the lot manually and upload from there.",
    };
  }

  // Look up the lot in this subdivision by lot number. Plan number is verified
  // as a match indicator, but lot number is the matching key — multiple
  // subdivisions never share both within the same management company.
  const { data: candidateLots } = await supabase
    .from("lots")
    .select("id, lot_number, unit_number, subdivisions!inner(id, plan_number)")
    .eq("subdivision_id", subdivisionId)
    .eq("lot_number", parsed.lotNumber);

  const lot = (candidateLots ?? [])[0];
  if (!lot) {
    return {
      error: `No lot ${parsed.lotNumber} found in this subdivision. Verify the document matches and assign manually.`,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const planNumber: string | null = (lot as any).subdivisions?.plan_number ?? null;

  const matches = {
    lotNumber: true,                   // we matched on it, so it's true
    planNumber:
      !planNumber || !parsed.planNumber
        ? null
        : parsed.planNumber.toUpperCase() === planNumber.toUpperCase(),
  };

  // Attach the document to the matched lot so the existing applySettlementToLot
  // path works unchanged. Skip the update if it's already pointing at this lot.
  if (doc.lot_id !== lot.id) {
    await supabase.from("documents").update({ lot_id: lot.id }).eq("id", doc.id);
  }

  // Current active owner of the matched lot.
  const { data: activeMember } = await supabase
    .from("subdivision_members")
    .select("profile_id, joined_at, profiles(first_name, last_name, email)")
    .eq("lot_id", lot.id)
    .eq("role", "lot_owner")
    .is("left_at", null)
    .maybeSingle();

  let currentOwner: SettlementReview["currentOwner"] = null;
  if (activeMember) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = (activeMember as any).profiles;
    const name = [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim() || null;
    currentOwner = {
      profileId: activeMember.profile_id,
      name,
      email: p?.email ?? null,
      joinedAt: activeMember.joined_at,
    };
  }

  const { data: pendingInv } = await supabase
    .from("invitations")
    .select("id")
    .eq("lot_id", lot.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { rawText: _rawText, ...display } = parsed;

  return {
    data: {
      parsed: display,
      matches,
      currentOwner,
      pendingInvitationId: pendingInv?.id ?? null,
      documentName: doc.file_name,
      matchedLot: {
        id: lot.id,
        lotNumber: lot.lot_number,
        unitNumber: lot.unit_number,
      },
    },
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
    .select("id, subdivision_id, lot_id, file_name")
    .eq("id", documentId)
    .single();

  if (!doc) return { error: "Document not found" };
  if (doc.lot_id !== lotId) return { error: "Document is not attached to this lot" };
  await requireSubdivisionAccess(doc.subdivision_id);

  const { data: lot } = await supabase
    .from("lots")
    .select("id, lot_number")
    .eq("id", lotId)
    .eq("subdivision_id", doc.subdivision_id)
    .single();

  if (!lot) return { error: "Lot not found in this subdivision" };

  const settlementTimestamp = new Date(`${settlementDate}T00:00:00Z`).toISOString();

  // 1. End the current active member, if any.
  const { data: activeMember } = await supabase
    .from("subdivision_members")
    .select("id, profile_id, joined_at, role, is_primary_contact, is_financial")
    .eq("lot_id", lotId)
    .eq("role", "lot_owner")
    .is("left_at", null)
    .maybeSingle();

  if (activeMember) {
    const { error: updErr } = await supabase
      .from("subdivision_members")
      .update({ left_at: settlementTimestamp })
      .eq("id", activeMember.id);
    if (updErr) return { error: `Could not end existing ownership: ${updErr.message}` };

    await supabase.from("audit_log").insert({
      profile_id: profile.id,
      subdivision_id: doc.subdivision_id,
      action: "ownership_transfer",
      entity_type: "subdivision_member",
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
      subdivision_id: doc.subdivision_id,
      lot_id: lotId,
      email: newOwner.email,
      name: newOwner.name,
      phone: newOwner.phone,
      role: "lot_owner",
      invited_by: profile.id,
    })
    .select("id, token, email, name")
    .single();

  if (invErr || !invitation) {
    return { error: invErr?.message ?? "Could not create invitation" };
  }

  // 4. Audit-log the new invitation side of the transfer.
  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    subdivision_id: doc.subdivision_id,
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
    const { data: subdivision } = await supabase
      .from("subdivisions")
      .select("name, address")
      .eq("id", doc.subdivision_id)
      .single();

    const lotLabel = subdivision?.address ?? subdivision?.name ?? `Lot ${lot.lot_number}`;
    await supabase.from("notifications").insert({
      profile_id: activeMember.profile_id,
      subdivision_id: doc.subdivision_id,
      type: "ownership_ended",
      title: "Ownership transferred",
      body: `Your ownership of ${lotLabel} ended on ${settlementDate}. Your historical records remain available under Past lots.`,
      link: `/dashboard/past-lots/${lotId}`,
    });
  }

  revalidatePath("/subdivisions/[subdivisionCode]/lots/[lotId]", "page");
  revalidatePath("/subdivisions/[subdivisionCode]/manage", "page");
  revalidatePath("/dashboard", "page");

  return {
    success: true,
    invitationId: invitation.id,
    invitationToken: invitation.token,
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
    .from("subdivision_members")
    .select(
      "id, profile_id, joined_at, left_at, is_primary_contact, is_financial, profiles(first_name, last_name, email)",
    )
    .eq("lot_id", lotId)
    .eq("role", "lot_owner")
    .order("joined_at", { ascending: false });

  if (error) throw new Error(`subdivision_members query failed: ${error.message}`);
  if (!members || members.length === 0) return [];

  // Pull audit_log rows that reference these member rows so we can show the
  // settlement document for each ended tenure.
  const memberIds = members.map((m) => m.id);
  const { data: auditRows } = await supabase
    .from("audit_log")
    .select("entity_id, metadata")
    .eq("entity_type", "subdivision_member")
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
