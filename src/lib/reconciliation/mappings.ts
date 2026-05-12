// ============================================================================
// bank_payer_mappings — CRUD + collision detection + sweep + detectRepeated
// ----------------------------------------------------------------------------
// Pure helpers (no "use server"). Server actions in
// src/lib/actions/reconciliation.ts wrap these for the manual-match path.
//
// Status lifecycle (PP4-A schema):
//   active     — used by Strategy 3 (known_payer) for auto-match
//   ambiguous  — collision detected; manager must resolve before auto-match
//   disabled   — soft-deleted; never auto-matches; doesn't occupy the
//                "active per canonical_name" slot (partial UNIQUE index)
//
// Collision design (resolved Gap 1, Gap E):
//   - createBankPayerMapping checks COLLISION first.
//   - Collision = OTHER lots in the same subdivision with the same
//     canonical_sender_name in status active OR ambiguous.
//   - On collision: refuse new mapping, flip any active collisions to
//     ambiguous (audit each), return collision payload for the three-way
//     dialog.
//   - No collision + same-tuple disabled exists → re-activate (Gap E).
//   - No collision + same-tuple ambiguous exists → re-activate (collision
//     that previously caused the ambiguity is gone).
//   - No collision + no same-tuple → INSERT new active.
//
// Race resolution (Gap G): resolveCollision re-checks the colliding-mapping
// IDs at submit time and reports a divergence_type when state has shifted.
//
// Sweep (Addition 2): sweepMappingsForOwnerChange ONLY flips
// active → ambiguous, never the reverse. Disambiguation requires a manager
// action via the mapping management page (PP4-D).
// ============================================================================

import { createServerClient } from "@/lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────

export type MappingStatus = "active" | "ambiguous" | "disabled";

export interface BankPayerMapping {
  id: string;
  subdivision_id: string;
  canonical_sender_name: string;
  lot_id: string;
  status: MappingStatus;
  status_reason: string | null;
  raw_examples: unknown[];
  created_by: string;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
}

export interface CreateMappingInput {
  subdivision_id: string;
  canonical_sender_name: string;
  lot_id: string;
  raw_example?: string; // raw description that prompted this mapping
  created_by: string;
}

export interface CollidingMappingSnapshot {
  id: string;
  lot_id: string;
  /** Status BEFORE the createMapping call detected the collision. */
  previous_status: MappingStatus;
  /** Status AFTER createMapping flipped active→ambiguous (if any flip occurred). */
  current_status: MappingStatus;
}

export type CreateMappingResult =
  | { ok: true; mapping_id: string; was_reactivated: boolean }
  | {
      ok: false;
      kind: "collision";
      colliding_mappings: CollidingMappingSnapshot[];
      proposed: { canonical_sender_name: string; lot_id: string };
    };

export type CollisionDivergenceType =
  | "mapping_changed"
  | "mapping_deleted"
  | "new_active_mapping_appeared";

export interface ResolveCollisionInput {
  subdivision_id: string;
  canonical_sender_name: string;
  proposed_lot_id: string;
  resolution: "update" | "keep_existing" | "remove";
  /** Snapshot returned from the createBankPayerMapping collision result. */
  expected_collisions: CollidingMappingSnapshot[];
  performed_by: string;
}

export type ResolveCollisionResult =
  | {
      ok: true;
      resolution_applied: "update" | "keep_existing" | "remove";
      mapping_id: string | null;
    }
  | {
      ok: false;
      kind: "race";
      divergence_type: CollisionDivergenceType;
      details: { expected: string[]; current: string[] };
    };

export interface SweepResult {
  flipped_count: number;
  flipped_ids: string[];
}

export interface DetectRepeatedResult {
  count: number;
  /** True when count == 3 AND no existing mapping for (sub, canonical, lot). */
  proposal_flag: boolean;
}

// ─── Internal helpers ─────────────────────────────────────────────────────

async function fetchCollidingMappings(
  subdivisionId: string,
  canonicalName: string,
  excludeLotId: string,
): Promise<Array<{ id: string; lot_id: string; status: MappingStatus }>> {
  const supabase = createServerClient();
  const { data } = await supabase
    .from("bank_payer_mappings")
    .select("id, lot_id, status")
    .eq("subdivision_id", subdivisionId)
    .eq("canonical_sender_name", canonicalName)
    .neq("lot_id", excludeLotId)
    .in("status", ["active", "ambiguous"]);
  return (data ?? []) as Array<{ id: string; lot_id: string; status: MappingStatus }>;
}

async function appendRawExample(
  mappingId: string,
  rawExample: string,
): Promise<void> {
  const supabase = createServerClient();
  const { data: row } = await supabase
    .from("bank_payer_mappings")
    .select("raw_examples")
    .eq("id", mappingId)
    .single();
  if (!row) return;
  const examples = Array.isArray(row.raw_examples) ? row.raw_examples : [];
  // Cap at 10 most-recent samples; first-in-first-out.
  const next = [...examples, rawExample].slice(-10);
  await supabase
    .from("bank_payer_mappings")
    .update({ raw_examples: next })
    .eq("id", mappingId);
}

async function auditMapping(
  performedBy: string,
  subdivisionId: string,
  mappingId: string,
  action: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  const supabase = createServerClient();
  await supabase.from("audit_log").insert({
    profile_id: performedBy,
    subdivision_id: subdivisionId,
    action,
    entity_type: "bank_payer_mapping",
    entity_id: mappingId,
    metadata,
  });
}

// ─── Public API ───────────────────────────────────────────────────────────

/**
 * Create a bank_payer_mapping. Runs collision detection FIRST. On collision,
 * refuses creation, flips any colliding active mappings to ambiguous, and
 * returns a collision payload for the three-way resolution dialog.
 *
 * Idempotent re-activation (Gap E): if no collision exists and a same-tuple
 * disabled or ambiguous mapping exists, the existing row is re-activated
 * rather than a new one being inserted.
 */
export async function createBankPayerMapping(
  input: CreateMappingInput,
): Promise<CreateMappingResult> {
  const supabase = createServerClient();

  // 1. Collision check — other lots, same canonical name, active or ambiguous.
  const colliding = await fetchCollidingMappings(
    input.subdivision_id,
    input.canonical_sender_name,
    input.lot_id,
  );

  if (colliding.length > 0) {
    const reasonText = `Another lot in this subdivision shares the canonical name '${input.canonical_sender_name}'`;
    const previousStatuses = new Map(colliding.map((m) => [m.id, m.status]));
    const stillActive = colliding.filter((m) => m.status === "active");

    if (stillActive.length > 0) {
      await supabase
        .from("bank_payer_mappings")
        .update({
          status: "ambiguous",
          status_reason: reasonText,
          updated_by: input.created_by,
        })
        .in(
          "id",
          stillActive.map((m) => m.id),
        );
      for (const m of stillActive) {
        await auditMapping(
          input.created_by,
          input.subdivision_id,
          m.id,
          "bank_payer_mapping.flipped_ambiguous",
          {
            canonical_sender_name: input.canonical_sender_name,
            from_status: "active",
            to_status: "ambiguous",
            reason: reasonText,
            triggered_by: "collision_with_proposed_mapping",
            proposed_lot_id: input.lot_id,
          },
        );
      }
    }

    return {
      ok: false,
      kind: "collision",
      colliding_mappings: colliding.map((m) => ({
        id: m.id,
        lot_id: m.lot_id,
        previous_status: previousStatuses.get(m.id) ?? m.status,
        current_status: m.status === "active" ? "ambiguous" : m.status,
      })),
      proposed: {
        canonical_sender_name: input.canonical_sender_name,
        lot_id: input.lot_id,
      },
    };
  }

  // 2. No collision — check for same-tuple existing.
  const { data: existing } = await supabase
    .from("bank_payer_mappings")
    .select("id, status")
    .eq("subdivision_id", input.subdivision_id)
    .eq("canonical_sender_name", input.canonical_sender_name)
    .eq("lot_id", input.lot_id)
    .maybeSingle();

  if (existing) {
    if (existing.status === "active") {
      // Idempotent — append the raw example, return the existing id.
      if (input.raw_example) await appendRawExample(existing.id, input.raw_example);
      return { ok: true, mapping_id: existing.id, was_reactivated: false };
    }
    // disabled or ambiguous → re-activate (no collision, safe).
    await supabase
      .from("bank_payer_mappings")
      .update({
        status: "active",
        status_reason: null,
        updated_by: input.created_by,
      })
      .eq("id", existing.id);
    if (input.raw_example) await appendRawExample(existing.id, input.raw_example);
    await auditMapping(
      input.created_by,
      input.subdivision_id,
      existing.id,
      "bank_payer_mapping.reactivated",
      { from_status: existing.status, to_status: "active" },
    );
    return { ok: true, mapping_id: existing.id, was_reactivated: true };
  }

  // 3. No same-tuple, no collision → INSERT new active.
  const { data: created, error } = await supabase
    .from("bank_payer_mappings")
    .insert({
      subdivision_id: input.subdivision_id,
      canonical_sender_name: input.canonical_sender_name,
      lot_id: input.lot_id,
      status: "active",
      raw_examples: input.raw_example ? [input.raw_example] : [],
      created_by: input.created_by,
    })
    .select("id")
    .single();
  if (error || !created) {
    throw new Error(
      `createBankPayerMapping: insert failed: ${error?.message ?? "unknown"}`,
    );
  }

  await auditMapping(
    input.created_by,
    input.subdivision_id,
    created.id,
    "bank_payer_mapping.created",
    {
      canonical_sender_name: input.canonical_sender_name,
      lot_id: input.lot_id,
    },
  );

  return { ok: true, mapping_id: created.id, was_reactivated: false };
}

/**
 * Resolve a three-way collision dialog. Re-checks current colliding mappings
 * and reports a structured race error if state has diverged from the
 * snapshot returned by createBankPayerMapping.
 *
 * Resolutions:
 *   update         — disable each colliding mapping; create the proposed
 *                    mapping as active.
 *   keep_existing  — restore each colliding mapping to its previous_status
 *                    (rolls back the active→ambiguous flip from collision
 *                    detection); do not create the proposed mapping.
 *   remove         — disable each colliding mapping; do not create the
 *                    proposed mapping.
 */
export async function resolveCollision(
  input: ResolveCollisionInput,
): Promise<ResolveCollisionResult> {
  const supabase = createServerClient();

  const current = await fetchCollidingMappings(
    input.subdivision_id,
    input.canonical_sender_name,
    input.proposed_lot_id,
  );
  const expectedIds = input.expected_collisions.map((m) => m.id).sort();
  const currentIds = current.map((m) => m.id).sort();

  if (JSON.stringify(expectedIds) !== JSON.stringify(currentIds)) {
    let divergence_type: CollisionDivergenceType;
    if (currentIds.length > expectedIds.length) {
      divergence_type = "new_active_mapping_appeared";
    } else if (currentIds.length < expectedIds.length) {
      divergence_type = "mapping_deleted";
    } else {
      divergence_type = "mapping_changed";
    }
    return {
      ok: false,
      kind: "race",
      divergence_type,
      details: { expected: expectedIds, current: currentIds },
    };
  }

  switch (input.resolution) {
    case "update": {
      // Disable each colliding mapping, then INSERT the proposed mapping.
      if (currentIds.length > 0) {
        await supabase
          .from("bank_payer_mappings")
          .update({
            status: "disabled",
            status_reason: "Superseded by collision-resolution update",
            updated_by: input.performed_by,
          })
          .in("id", currentIds);
        for (const id of currentIds) {
          await auditMapping(
            input.performed_by,
            input.subdivision_id,
            id,
            "bank_payer_mapping.disabled",
            {
              triggered_by: "collision_resolution_update",
              proposed_lot_id: input.proposed_lot_id,
            },
          );
        }
      }
      const created = await createBankPayerMapping({
        subdivision_id: input.subdivision_id,
        canonical_sender_name: input.canonical_sender_name,
        lot_id: input.proposed_lot_id,
        created_by: input.performed_by,
      });
      if (!created.ok) {
        // Should not happen — we just disabled all colliders.
        throw new Error(
          "resolveCollision[update]: createBankPayerMapping returned collision after collision clear",
        );
      }
      return {
        ok: true,
        resolution_applied: "update",
        mapping_id: created.mapping_id,
      };
    }

    case "keep_existing": {
      // Restore each colliding mapping to its previous_status. Only update
      // those whose current_status != previous_status (i.e. those we flipped).
      const previousByMapId = new Map(
        input.expected_collisions.map((m) => [m.id, m.previous_status]),
      );
      const toRestore = current.filter((m) => {
        const prev = previousByMapId.get(m.id);
        return prev && prev !== m.status;
      });
      for (const m of toRestore) {
        const prev = previousByMapId.get(m.id);
        if (!prev) continue;
        await supabase
          .from("bank_payer_mappings")
          .update({
            status: prev,
            status_reason: null,
            updated_by: input.performed_by,
          })
          .eq("id", m.id);
        await auditMapping(
          input.performed_by,
          input.subdivision_id,
          m.id,
          "bank_payer_mapping.restored",
          {
            from_status: m.status,
            to_status: prev,
            triggered_by: "collision_resolution_keep_existing",
          },
        );
      }
      return {
        ok: true,
        resolution_applied: "keep_existing",
        mapping_id: null,
      };
    }

    case "remove": {
      if (currentIds.length > 0) {
        await supabase
          .from("bank_payer_mappings")
          .update({
            status: "disabled",
            status_reason: "Removed during collision resolution",
            updated_by: input.performed_by,
          })
          .in("id", currentIds);
        for (const id of currentIds) {
          await auditMapping(
            input.performed_by,
            input.subdivision_id,
            id,
            "bank_payer_mapping.disabled",
            { triggered_by: "collision_resolution_remove" },
          );
        }
      }
      return {
        ok: true,
        resolution_applied: "remove",
        mapping_id: null,
      };
    }
  }
}

/**
 * Sweep mappings on lot ownership change. Only flips active → ambiguous
 * (Addition 2: never auto-promotes). Disambiguation requires manager
 * action via the mapping management page.
 *
 * Algorithm: find active mappings on OTHER lots in this subdivision whose
 * canonical_sender_name equals the new owner's canonicalised name; flip
 * each to ambiguous with audit.
 */
export async function sweepMappingsForOwnerChange(
  subdivisionId: string,
  affectedLotId: string,
  newOwnerCanonicalName: string | null,
  performedBy: string,
): Promise<SweepResult> {
  if (!newOwnerCanonicalName) {
    return { flipped_count: 0, flipped_ids: [] };
  }
  const supabase = createServerClient();
  const { data: collidingActive } = await supabase
    .from("bank_payer_mappings")
    .select("id, lot_id")
    .eq("subdivision_id", subdivisionId)
    .eq("canonical_sender_name", newOwnerCanonicalName)
    .neq("lot_id", affectedLotId)
    .eq("status", "active");

  if (!collidingActive || collidingActive.length === 0) {
    return { flipped_count: 0, flipped_ids: [] };
  }

  const ids = collidingActive.map((m) => m.id);
  const reasonText = `Lot ${affectedLotId} owner now canonicalises to '${newOwnerCanonicalName}', creating ambiguity`;
  await supabase
    .from("bank_payer_mappings")
    .update({
      status: "ambiguous",
      status_reason: reasonText,
      updated_by: performedBy,
    })
    .in("id", ids);

  for (const m of collidingActive) {
    await auditMapping(
      performedBy,
      subdivisionId,
      m.id,
      "bank_payer_mapping.flipped_ambiguous",
      {
        canonical_sender_name: newOwnerCanonicalName,
        from_status: "active",
        to_status: "ambiguous",
        reason: reasonText,
        triggered_by: "ownership_change",
        affected_lot_id: affectedLotId,
      },
    );
  }

  return { flipped_count: ids.length, flipped_ids: ids };
}

/**
 * Count manual matches in the rolling 30-day window where the linked bank
 * transaction's canonicalised description equals canonicalSenderName and
 * the match links to a credit on lotId. Returns proposal_flag = true when
 * count == 3 AND no existing (active|ambiguous|disabled) mapping for
 * (subdivision, canonical, lot).
 *
 * Performance: bounded by 30-day window. Per-row canonicalisation in TS;
 * acceptable at StrataWise scale per Gap B resolution. PRE_LAUNCH_CLEANUP item
 * tracks if cost becomes meaningful at scale.
 */
export async function detectRepeatedManualMatch(
  subdivisionId: string,
  canonicalSenderName: string,
  lotId: string,
  canonicaliseFn: (raw: string | null | undefined) => string | null,
): Promise<DetectRepeatedResult> {
  const supabase = createServerClient();

  // Existing mapping check (any status).
  const { data: existingMapping } = await supabase
    .from("bank_payer_mappings")
    .select("id")
    .eq("subdivision_id", subdivisionId)
    .eq("canonical_sender_name", canonicalSenderName)
    .eq("lot_id", lotId)
    .maybeSingle();

  // 30-day window cutoff.
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Manual matches in window where the linked credit is on this lot.
  // Two-step query: first find ledger entries for the lot, then matches that
  // reference them. Bounded by lot-level credit volume in 30d.
  const { data: lotCredits } = await supabase
    .from("lot_ledger_entries")
    .select("id")
    .eq("lot_id", lotId)
    .eq("entry_type", "credit")
    .gte("created_at", cutoff);
  const creditIds = (lotCredits ?? []).map((c) => c.id);
  if (creditIds.length === 0) {
    return { count: 0, proposal_flag: false };
  }

  const { data: matches } = await supabase
    .from("reconciliation_matches")
    .select("bank_transaction_id, match_method, matched_at")
    .in("ledger_entry_id", creditIds)
    .eq("match_method", "manual")
    .gte("matched_at", cutoff);

  const txnIds = Array.from(
    new Set((matches ?? []).map((m) => m.bank_transaction_id)),
  );
  if (txnIds.length === 0) {
    return { count: 0, proposal_flag: false };
  }

  const { data: txns } = await supabase
    .from("bank_transactions")
    .select("id, description")
    .in("id", txnIds);

  let count = 0;
  for (const t of txns ?? []) {
    const canonical = canonicaliseFn(t.description);
    if (canonical === canonicalSenderName) count++;
  }

  return {
    count,
    proposal_flag: count === 3 && existingMapping === null,
  };
}

/**
 * List bank_payer_mappings for a subdivision. Optional status filter; when
 * omitted, returns active + ambiguous (the management page's default view —
 * disabled rows hidden unless explicitly requested).
 */
// ─── Mapping lifecycle: disable / reactivate / delete (PP4-D) ─────────────

export interface DisableMappingInput {
  mapping_id: string;
  subdivision_id: string;
  reason?: string;
  performed_by: string;
}

export type DisableMappingResult =
  | { ok: true; mapping_id: string }
  | { ok: false; error: string };

export async function disableMapping(
  input: DisableMappingInput,
): Promise<DisableMappingResult> {
  const supabase = createServerClient();
  const { data: existing } = await supabase
    .from("bank_payer_mappings")
    .select("id, status, canonical_sender_name, lot_id")
    .eq("id", input.mapping_id)
    .eq("subdivision_id", input.subdivision_id)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Mapping not found" };
  if (existing.status === "disabled") {
    return { ok: true, mapping_id: existing.id };
  }

  const { error } = await supabase
    .from("bank_payer_mappings")
    .update({
      status: "disabled",
      status_reason: input.reason ?? "Disabled manually",
      updated_by: input.performed_by,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.mapping_id);
  if (error) return { ok: false, error: error.message };

  await auditMapping(
    input.performed_by,
    input.subdivision_id,
    input.mapping_id,
    "bank_payer_mapping.disabled",
    {
      canonical_sender_name: existing.canonical_sender_name,
      lot_id: existing.lot_id,
      previous_status: existing.status,
      triggered_by: "manual_disable",
    },
  );

  return { ok: true, mapping_id: existing.id };
}

export interface ReactivateMappingInput {
  mapping_id: string;
  subdivision_id: string;
  performed_by: string;
}

/** Same shape as createBankPayerMapping's collision result so the UI can
 *  hand the same dialog component the same payload regardless of which
 *  flow surfaced the collision. */
export type ReactivateMappingResult =
  | { ok: true; mapping_id: string }
  | {
      ok: false;
      kind: "collision";
      colliding_mappings: CollidingMappingSnapshot[];
      proposed: { canonical_sender_name: string; lot_id: string };
    }
  | { ok: false; kind: "error"; error: string };

export async function reactivateMapping(
  input: ReactivateMappingInput,
): Promise<ReactivateMappingResult> {
  const supabase = createServerClient();
  const { data: existing } = await supabase
    .from("bank_payer_mappings")
    .select("id, status, canonical_sender_name, lot_id")
    .eq("id", input.mapping_id)
    .eq("subdivision_id", input.subdivision_id)
    .maybeSingle();
  if (!existing) return { ok: false, kind: "error", error: "Mapping not found" };
  if (existing.status === "active") {
    return { ok: true, mapping_id: existing.id };
  }

  // Collision check: any OTHER active mapping for the same canonical name
  // would block our update via the partial UNIQUE index. Detect explicitly
  // so the UI can route to CollisionResolutionDialog.
  const colliders = await fetchCollidingMappings(
    input.subdivision_id,
    existing.canonical_sender_name,
    existing.lot_id,
  );
  const activeColliders = colliders.filter((m) => m.status === "active");
  if (activeColliders.length > 0) {
    return {
      ok: false,
      kind: "collision",
      colliding_mappings: activeColliders.map((m) => ({
        id: m.id,
        lot_id: m.lot_id,
        previous_status: m.status,
        current_status: m.status,
      })),
      proposed: {
        canonical_sender_name: existing.canonical_sender_name,
        lot_id: existing.lot_id,
      },
    };
  }

  const { error } = await supabase
    .from("bank_payer_mappings")
    .update({
      status: "active",
      status_reason: null,
      updated_by: input.performed_by,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.mapping_id);
  if (error) return { ok: false, kind: "error", error: error.message };

  await auditMapping(
    input.performed_by,
    input.subdivision_id,
    input.mapping_id,
    "bank_payer_mapping.reactivated",
    {
      canonical_sender_name: existing.canonical_sender_name,
      lot_id: existing.lot_id,
      previous_status: existing.status,
    },
  );

  return { ok: true, mapping_id: existing.id };
}

export interface DeleteMappingInput {
  mapping_id: string;
  subdivision_id: string;
  performed_by: string;
}

export type DeleteMappingResult =
  | { ok: true; mapping_id: string }
  | { ok: false; error: string };

export async function deleteMapping(
  input: DeleteMappingInput,
): Promise<DeleteMappingResult> {
  const supabase = createServerClient();
  const { data: existing } = await supabase
    .from("bank_payer_mappings")
    .select("id, status, canonical_sender_name, lot_id, raw_examples")
    .eq("id", input.mapping_id)
    .eq("subdivision_id", input.subdivision_id)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Mapping not found" };

  // Audit BEFORE delete so the metadata captures the row's final state.
  await auditMapping(
    input.performed_by,
    input.subdivision_id,
    input.mapping_id,
    "bank_payer_mapping.deleted",
    {
      canonical_sender_name: existing.canonical_sender_name,
      lot_id: existing.lot_id,
      final_status: existing.status,
      raw_examples_count: Array.isArray(existing.raw_examples)
        ? existing.raw_examples.length
        : 0,
    },
  );

  const { error } = await supabase
    .from("bank_payer_mappings")
    .delete()
    .eq("id", input.mapping_id);
  if (error) return { ok: false, error: error.message };

  return { ok: true, mapping_id: existing.id };
}

export async function listBankPayerMappings(
  subdivisionId: string,
  filter?: "active" | "ambiguous" | "disabled" | "all",
): Promise<BankPayerMapping[]> {
  const supabase = createServerClient();
  let query = supabase
    .from("bank_payer_mappings")
    .select("*")
    .eq("subdivision_id", subdivisionId)
    .order("created_at", { ascending: false });

  if (filter === "active") query = query.eq("status", "active");
  else if (filter === "ambiguous") query = query.eq("status", "ambiguous");
  else if (filter === "disabled") query = query.eq("status", "disabled");
  else if (filter === "all" || filter === undefined) {
    query = query.in("status", ["active", "ambiguous"]);
  }

  const { data } = await query;
  return (data ?? []) as BankPayerMapping[];
}
