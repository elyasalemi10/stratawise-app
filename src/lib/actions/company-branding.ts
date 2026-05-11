"use server";

// ============================================================================
// Company branding — hardened logo upload action (PP7-A).
// ----------------------------------------------------------------------------
// Hardens the legacy uploadCompanyLogo path (settings/actions.ts) with:
//   - 1MB size cap (was 2MB; tightened per pre-launch ops spec)
//   - 800×400 dimension cap for raster types (PNG/JPG)
//   - Allowed types: PNG, JPG, SVG (SVG skips dimension probe since vector)
//   - Structured { error, errorCode } shape for verification + UI surfacing
//
// Validation is split into `validateLogoFile(buffer, mimeType, byteSize)`
// (pure, exported for direct verification testing) and the server action
// `updateCompanyLogo(formData)` which composes auth + validation + R2 +
// management_companies.logo_url update + audit_log.
//
// Schema (existing): management_companies.logo_url stores the full public
// CDN URL (R2_PUBLIC_URL prefix + key). PP6-D-D-fix-logo emit helpers and
// email senders already wire this through.
// ============================================================================

import { requireCompanyRole } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { uploadObject } from "@/lib/storage/r2";
import imageSize from "image-size";

export const ALLOWED_LOGO_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/svg+xml",
] as const;

export const MAX_LOGO_BYTES = 1 * 1024 * 1024; // 1MB
export const MAX_LOGO_WIDTH = 800;
export const MAX_LOGO_HEIGHT = 400;

export type LogoValidationResult =
  | { ok: true }
  | {
      ok: false;
      errorCode: "INVALID_TYPE" | "FILE_TOO_LARGE" | "DIMENSIONS_TOO_LARGE" | "UNREADABLE";
      error: string;
    };

/**
 * Pure validator — directly exercisable from verification suites.
 *
 * Returns { ok: true } on accept, { ok: false, errorCode, error } on reject.
 * Skips dimension probing for SVG (vector; dimensions don't bound display
 * size). Returns UNREADABLE if image-size can't parse the buffer.
 */
export async function validateLogoFile(
  buffer: Buffer,
  mimeType: string,
  byteSize: number,
): Promise<LogoValidationResult> {
  if (!(ALLOWED_LOGO_MIME_TYPES as readonly string[]).includes(mimeType)) {
    return {
      ok: false,
      errorCode: "INVALID_TYPE",
      error: `Logo must be PNG, JPG, or SVG. Received ${mimeType}.`,
    };
  }
  if (byteSize > MAX_LOGO_BYTES) {
    return {
      ok: false,
      errorCode: "FILE_TOO_LARGE",
      error: `Logo must be under ${MAX_LOGO_BYTES / 1024 / 1024}MB. Received ${(byteSize / 1024 / 1024).toFixed(2)}MB.`,
    };
  }
  // SVG: skip raster dimension probe.
  if (mimeType === "image/svg+xml") {
    return { ok: true };
  }
  let dimensions: { width?: number; height?: number };
  try {
    dimensions = imageSize(new Uint8Array(buffer));
  } catch {
    return {
      ok: false,
      errorCode: "UNREADABLE",
      error: "Could not read image dimensions. File may be corrupted.",
    };
  }
  const w = dimensions.width ?? 0;
  const h = dimensions.height ?? 0;
  if (w === 0 || h === 0) {
    return {
      ok: false,
      errorCode: "UNREADABLE",
      error: "Could not determine image dimensions.",
    };
  }
  if (w > MAX_LOGO_WIDTH || h > MAX_LOGO_HEIGHT) {
    return {
      ok: false,
      errorCode: "DIMENSIONS_TOO_LARGE",
      error: `Logo must be ≤${MAX_LOGO_WIDTH}×${MAX_LOGO_HEIGHT}px. Received ${w}×${h}px.`,
    };
  }
  return { ok: true };
}

export type UpdateCompanyLogoResult =
  | { success: true; url: string }
  | {
      error: string;
      errorCode:
        | "UNAUTHORIZED"
        | "INVALID_REQUEST"
        | "INVALID_TYPE"
        | "FILE_TOO_LARGE"
        | "DIMENSIONS_TOO_LARGE"
        | "UNREADABLE"
        | "UPLOAD_FAILED";
    };

/**
 * Server action — auth + validation + R2 upload + DB update + audit log.
 */
export async function updateCompanyLogo(
  formData: FormData,
): Promise<UpdateCompanyLogoResult> {
  let profile;
  try {
    profile = await requireCompanyRole();
  } catch {
    return { error: "Not authorised", errorCode: "UNAUTHORIZED" };
  }
  if (!profile.management_company_id) {
    return { error: "No management company associated with profile", errorCode: "UNAUTHORIZED" };
  }

  const file = formData.get("file") as File | null;
  const companyId = formData.get("company_id") as string | null;
  if (!file || !companyId || companyId !== profile.management_company_id) {
    return { error: "Invalid request", errorCode: "INVALID_REQUEST" };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const validation = await validateLogoFile(buffer, file.type, file.size);
  if (!validation.ok) {
    return { error: validation.error, errorCode: validation.errorCode };
  }

  const ext = mimeToExt(file.type);
  const key = `logos/${companyId}/logo.${ext}`;

  let publicUrl: string;
  try {
    const result = await uploadObject(key, buffer, file.type);
    publicUrl = result.publicUrl;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("updateCompanyLogo: R2 upload failed", msg);
    return { error: "Upload failed. Please try again.", errorCode: "UPLOAD_FAILED" };
  }

  const supabase = createServerClient();
  const { error: dbErr } = await supabase
    .from("management_companies")
    .update({ logo_url: publicUrl })
    .eq("id", companyId);
  if (dbErr) {
    console.error("updateCompanyLogo: DB update failed", dbErr);
    return { error: "Saved the file but could not update record. Please try again.", errorCode: "UPLOAD_FAILED" };
  }

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    subdivision_id: null,
    action: "update_company_logo",
    entity_type: "management_company",
    entity_id: companyId,
    after_state: { logo_url: publicUrl },
  });

  return { success: true, url: publicUrl };
}

function mimeToExt(mimeType: string): string {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/svg+xml") return "svg";
  return "bin";
}
