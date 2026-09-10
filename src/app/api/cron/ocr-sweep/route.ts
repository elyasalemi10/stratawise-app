import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase";
import {
  backfillPreview,
  backfillThumbnail,
  ingestDocumentOcr,
  isIndexable,
} from "@/lib/ocr/ingest";
import { needsPdfConversion } from "@/lib/ocr/convert-to-pdf";

// ============================================================================
// GET /api/cron/ocr-sweep , Vercel Cron
// ----------------------------------------------------------------------------
// Full-text OCR is deliberately never run in a request the user is waiting on.
// Uploads and the OC wizard both leave their documents row at
// ocr_status='pending'; this sweep picks those rows up and fills in ocr_text
// so the search bar can match on the contents of the file.
//
// Schedule lives in vercel.json. Vercel cron expressions are UTC only (there
// is no timezone field), which is fine here: the cadence is "every N minutes",
// not a wall-clock time, so daylight saving is irrelevant.
//
// Auth: Vercel sends `Authorization: Bearer $CRON_SECRET` on every cron
// invocation. We reject anything else so the endpoint isn't publicly runnable.
//
// Each document is processed through ingestDocumentOcr, the single source of
// truth for the pipeline. That function never throws and no-ops when the
// document row has since been deleted, so a document removed between upload
// and sweep is simply skipped.
// ============================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Documents handled per run. Each one is a Document AI round trip, so this is
// bounded to stay inside maxDuration with headroom. Anything left over is
// picked up by the next run.
const BATCH_SIZE = 10;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("ocr-sweep: CRON_SECRET is not configured");
    return NextResponse.json({ error: "unconfigured" }, { status: 503 });
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    console.warn("ocr-sweep: rejected, bad or missing bearer token");
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("documents")
    .select("id, mime_type, file_name")
    .eq("ocr_status", "pending")
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error) {
    console.error("ocr-sweep: query failed", error);
    return NextResponse.json({ error: "query_failed" }, { status: 500 });
  }

  // An Office file is not OCR-able as it stands but becomes so once
  // ingestDocumentOcr has rendered it to PDF, so it is eligible too.
  // Filtering it out here is what left every .docx pending forever.
  const eligible = (data ?? []).filter(
    (row) =>
      isIndexable(row.mime_type as string | null) ||
      needsPdfConversion(row.mime_type as string | null, row.file_name as string | null),
  );
  if (eligible.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  // Sequential, not parallel: Document AI is the slow part and running ten
  // concurrently would spike memory on a single function instance for no
  // throughput gain against the per-run cap.
  let processed = 0;
  for (const row of eligible) {
    await ingestDocumentOcr(row.id as string);
    processed++;
  }

  // Convertible files that were told there was nothing to convert.
  //
  // Two ways a row lands here. It was uploaded before conversion was
  // configured, so `skipped` was the honest answer at the time and nothing
  // revisited it. Or its mime type arrived as octet-stream, which the
  // mime-only check read as "not an Office file", and it was marked skipped
  // next to an identical file that uploaded with the right header.
  //
  // This converges: every row it touches ends `complete` or `failed`, never
  // `skipped` again, so it cannot pick the same file up twice.
  const { data: unpreviewed } = await supabase
    .from("documents")
    .select("id, mime_type, file_name")
    .eq("pdf_status", "skipped")
    .is("thumbnail_storage_key", null)
    .order("created_at", { ascending: false })
    .limit(BATCH_SIZE);

  let previews = 0;
  for (const row of (unpreviewed ?? []) as Array<{
    id: string; mime_type: string | null; file_name: string;
  }>) {
    if (!needsPdfConversion(row.mime_type, row.file_name)) continue;
    if (await backfillPreview(row.id)) previews++;
  }

  // Anything still without a thumbnail, whichever pass should have made one.
  // Documents uploaded before thumbnails existed show an extension plate in
  // the grid; this heals them without a one-off script, and picks up a
  // render that failed the first time.
  const { data: needThumbs } = await supabase
    .from("documents")
    .select("id")
    .is("thumbnail_storage_key", null)
    .order("created_at", { ascending: false })
    .limit(BATCH_SIZE);

  let thumbnails = 0;
  for (const row of (needThumbs ?? []) as Array<{ id: string }>) {
    if (await backfillThumbnail(row.id)) thumbnails++;
  }

  return NextResponse.json({ ok: true, processed, previews, thumbnails });
}
