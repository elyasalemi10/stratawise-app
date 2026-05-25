import { NextResponse, type NextRequest } from "next/server";
import { zipSync, type Zippable } from "fflate";
import { getCurrentProfile, requireOCAccess } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { fetchObject, keyFromPublicUrl } from "@/lib/storage/r2";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Streams a ZIP archive of every levy PDF in the batch. Auth: must be
// authenticated AND have OC access. PDFs are fetched server-side via
// fetchObject (works for confidential bucket); legacy public URLs fall
// back to keyFromPublicUrl. The whole thing is built in memory with
// fflate then streamed back in one response.
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ batchId: string }> },
) {
  const profile = await getCurrentProfile();
  if (!profile) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { batchId } = await context.params;
  const supabase = createServerClient();

  const { data: batch } = await supabase
    .from("levy_batches")
    .select("id, oc_id, period_label, financial_year")
    .eq("id", batchId)
    .maybeSingle();
  if (!batch) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  try {
    await requireOCAccess(batch.oc_id);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: levies } = await supabase
    .from("levy_notices")
    .select("id, reference_number, pdf_url")
    .eq("batch_id", batchId)
    .order("reference_number");

  if (!levies?.length) {
    return NextResponse.json({ error: "No levies" }, { status: 404 });
  }

  // Fetch every PDF in parallel. A failure on any single one is logged but
  // the zip still ships with whatever did succeed , the manager would
  // rather get 47 / 48 PDFs than nothing.
  const files: Zippable = {};
  await Promise.all(
    levies.map(async (l) => {
      try {
        let key = `levies/${batch.oc_id}/${l.reference_number}.pdf`;
        if (l.pdf_url) {
          const legacyKey = keyFromPublicUrl(l.pdf_url);
          if (legacyKey) key = legacyKey;
        }
        const buf = await fetchObject(key);
        files[`${l.reference_number}.pdf`] = new Uint8Array(buf);
      } catch (err) {
        console.error("ZIP: PDF fetch failed", l.reference_number, err);
      }
    }),
  );
  if (Object.keys(files).length === 0) {
    return NextResponse.json({ error: "No PDFs available" }, { status: 502 });
  }

  const zipped = zipSync(files, { level: 0 }); // PDFs don't compress well; skip the work
  const filename = `${batch.period_label.replace(/[^\w-]+/g, "-")}-${batch.financial_year}.zip`;

  return new NextResponse(new Uint8Array(zipped), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
