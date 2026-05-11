// ============================================================================
// Cloudflare R2 client helper (PP7-A).
// ----------------------------------------------------------------------------
// Consolidates 5 pre-existing inline S3Client init sites into a single
// module-scoped client with typed put/get/delete/presign helpers.
//
// R2 is S3-compatible. Configuration via env:
//   R2_ENDPOINT            — https://{account}.r2.cloudflarestorage.com
//   R2_ACCESS_KEY_ID       — auth
//   R2_SECRET_ACCESS_KEY   — auth
//   R2_BUCKET_NAME         — single multi-purpose bucket
//   R2_PUBLIC_URL          — public CDN custom domain (used for logo/levy URLs
//                            stored in management_companies.logo_url +
//                            levy_notices.pdf_url)
//
// Path-prefix convention inside the single bucket:
//   logos/{managementCompanyId}/logo.{ext}
//   logos/{managementCompanyId}/signature.{ext}
//   documents/{subdivisionId}/{documentId}.{ext}
//   levies/{subdivisionId}/{referenceNumber}.pdf
//
// Bucket public access: the bucket is fronted by a public CDN custom domain
// (R2_PUBLIC_URL). Objects can be fetched anonymously via that domain —
// logos rendered in unauthenticated SMTP-delivered email <img> tags rely on
// this. PDF retrieval inside the dashboard also uses the public URL today;
// PP7-A keeps that semantic. getSignedDownloadUrl is exported for future use
// when PII concerns push us to time-limited access.
//
// Module-scoped client is intentional — S3Client is heavy to construct and
// safely shared across requests. R2 has no per-connection limit issue on
// Vercel's lambda-per-request model.
// ============================================================================

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let _client: S3Client | null = null;

function getClient(): S3Client {
  if (_client) return _client;
  if (!process.env.R2_ENDPOINT) {
    throw new Error("R2_ENDPOINT is not configured");
  }
  if (!process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
    throw new Error("R2 credentials are not configured");
  }
  _client = new S3Client({
    region: "auto",
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  return _client;
}

export function getBucket(): string {
  // Default fallback matches the legacy uploadCompanyLogo path. The bucket is
  // multi-purpose despite the legacy name.
  return process.env.R2_BUCKET_NAME ?? "msm-company-logos";
}

/**
 * Upload an object to R2. Returns the full public CDN URL.
 */
export async function uploadObject(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<{ key: string; publicUrl: string }> {
  const client = getClient();
  await client.send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  const publicUrl = `${process.env.R2_PUBLIC_URL ?? ""}/${key}`;
  return { key, publicUrl };
}

/**
 * Fetch an object's bytes from R2. Used by the email layer to attach PDFs.
 * Throws on missing object or transport error.
 */
export async function fetchObject(key: string): Promise<Buffer> {
  const client = getClient();
  const res = await client.send(
    new GetObjectCommand({
      Bucket: getBucket(),
      Key: key,
    }),
  );
  if (!res.Body) {
    throw new Error(`R2 fetchObject: empty body for key ${key}`);
  }
  // res.Body is a Web stream in Node 18+. transformToByteArray is the
  // recommended way to materialise it.
  const bodyAsAsyncIterable = res.Body as {
    transformToByteArray: () => Promise<Uint8Array>;
  };
  const bytes = await bodyAsAsyncIterable.transformToByteArray();
  return Buffer.from(bytes);
}

/**
 * Delete an object from R2.
 */
export async function deleteObject(key: string): Promise<void> {
  const client = getClient();
  await client.send(
    new DeleteObjectCommand({
      Bucket: getBucket(),
      Key: key,
    }),
  );
}

/**
 * Build the public CDN URL for a key without performing any network call.
 * Use when storing the URL in the database after uploadObject (or to
 * reconstruct on demand).
 */
export function publicUrlFor(key: string): string {
  return `${process.env.R2_PUBLIC_URL ?? ""}/${key}`;
}

/**
 * Extract the object key from a previously-stored public CDN URL. Returns
 * null when the URL doesn't match the configured prefix (e.g. legacy or
 * external URL).
 */
export function keyFromPublicUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const prefix = process.env.R2_PUBLIC_URL;
  if (!prefix) return null;
  const trimmed = prefix.replace(/\/$/, "");
  if (!url.startsWith(trimmed + "/")) return null;
  return url.slice(trimmed.length + 1);
}

/**
 * Build a time-limited presigned download URL. Not used by the current
 * code paths (PDFs + logos are publicly readable via the CDN domain), but
 * exported for future PII-sensitive flows.
 */
export async function getSignedDownloadUrl(
  key: string,
  expiresInSeconds = 604800, // 7 days
): Promise<string> {
  const client = getClient();
  const command = new GetObjectCommand({
    Bucket: getBucket(),
    Key: key,
  });
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}
