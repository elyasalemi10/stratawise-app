import { NextRequest, NextResponse, after } from "next/server";
import { createServerClient } from "@/lib/supabase";
import { requireCompanyRole, requireOCAccess } from "@/lib/auth";
import { ALLOWED_DOCUMENT_TYPES, MAX_DOCUMENT_SIZE } from "@/lib/validations/documents";
import { uploadObject, publicUrlFor } from "@/lib/storage/r2";
import { ingestDocumentOcr, isIndexable } from "@/lib/ocr/ingest";
import { needsPdfConversion } from "@/lib/ocr/convert-to-pdf";
import { downscaleImage, makeThumbnail } from "@/lib/images/downscale";
import { renderPdfFirstPage } from "@/lib/images/pdf-thumbnail";

// The response goes out immediately, but after() keeps the function alive to
// convert and read the document, and a CloudConvert job can take a couple of
// minutes. On the default duration that work was killed part-way through,
// which is invisible: the upload succeeded, the preview simply never arrived
// until the ten-minute sweep picked the row back up.
export const maxDuration = 300;

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sanitiseFileName(name: string): string {
  // Strip path separators and control chars, collapse whitespace, cap length.
  const base = name.replace(/[/\\]/g, "_").replace(/[\x00-\x1f]/g, "").trim();
  return base.slice(0, 200) || "document";
}

export async function POST(request: NextRequest) {
  let profile;
  try {
    profile = await requireCompanyRole();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const ocId = formData.get("oc_id") as string | null;
  const lotId = formData.get("lot_id") as string | null;
  const category = (formData.get("category") as string) || "other";

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (!ocId || !UUID_REGEX.test(ocId)) {
    return NextResponse.json({ error: "Valid oc_id is required" }, { status: 400 });
  }

  if (lotId && !UUID_REGEX.test(lotId)) {
    return NextResponse.json({ error: "Invalid lot_id" }, { status: 400 });
  }

  try {
    await requireOCAccess(ocId);
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!ALLOWED_DOCUMENT_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "File type not supported. Allowed: PDF, DOC, DOCX, XLS, XLSX, PNG, JPG, TXT, CSV" },
      { status: 400 }
    );
  }

  if (file.size > MAX_DOCUMENT_SIZE) {
    return NextResponse.json(
      { error: "File too large. Maximum 25MB." },
      { status: 400 }
    );
  }

  const supabase = createServerClient();

  // If uploading against a lot, ensure the lot belongs to this OC.
  if (lotId) {
    const { data: lot } = await supabase
      .from("lots")
      .select("id, oc_id")
      .eq("id", lotId)
      .single();
    if (!lot || lot.oc_id !== ocId) {
      return NextResponse.json({ error: "Lot does not belong to this OC" }, { status: 400 });
    }
  }

  const safeName = sanitiseFileName(file.name);
  const uuid = crypto.randomUUID();
  const folder = lotId || "oc";
  const key = `documents/${ocId}/${folder}/${uuid}-${safeName}`;
  const original = Buffer.from(await file.arrayBuffer());

  // A phone photo is twelve megapixels and several megabytes, and nothing in
  // this app renders an image wider than about a thousand pixels. Shrink it
  // before it costs every viewer the download. Degrades to the original on
  // any failure, so an upload never fails over a resize.
  const image = await downscaleImage(original, file.type);
  const buffer = image.bytes;
  const storedType = image.contentType;

  // The grid renders at ~300 CSS pixels. Handing it the 2400px file means
  // the browser decodes about 17MB of bitmap per card, so a page of twelve
  // is roughly 200MB of image for pictures shown at an eighth of that size.
  // Images shrink; PDFs get their first page rendered. Without the second
  // one the card embedded the whole PDF in an <object>, which hands it to
  // the browser's built-in viewer: a grey plate with its own chrome, and a
  // full document downloaded to show one page.
  const thumbnail =
    storedType === "application/pdf"
      ? await renderPdfFirstPage(buffer)
      : await makeThumbnail(buffer, storedType);
  const thumbnailKey = thumbnail ? `${key.replace(/\.[^./]+$/, "")}.thumb.webp` : null;

  await Promise.all([
    uploadObject(key, buffer, storedType),
    thumbnail && thumbnailKey
      ? uploadObject(thumbnailKey, thumbnail, "image/webp")
      : Promise.resolve(),
  ]);

  // The "self-OCR" categories (settlement parse, insurance parse,
  // plan-of-subdivision + OC-rules + certificate_of_currency) used to
  // SKIP the background Doc AI queue entirely because the inline
  // Gemini parse already wrote structured fields. That meant their
  // full-text wasn't searchable from the docs page.
  //
  // We now run BOTH pipelines: the upload route still queues Doc AI
  // for plain-text indexing, AND the inline caller writes its
  // structured output. Doc AI's `ocr_text` lands on the documents
  // row; the inline parse's structured columns live wherever they
  // belong (insurance_policies, settlements, oc_drafts, etc).
  // ocr_status starts "pending" so the cron sweep can flip it to
  // "complete" once Document AI finishes.
  // An Office file is not readable by OCR as it stands, but it will be once
  // it has been rendered to PDF, so it still belongs in the queue. Marking it
  // `skipped` here is what used to leave every .docx unsearchable: the sweep
  // only looks at `pending` rows, so nothing ever came back for it.
  const willConvert = needsPdfConversion(file.type);
  const willOcr = isIndexable(file.type) || willConvert;
  const { data: doc, error } = await supabase
    .from("documents")
    .insert({
      oc_id: ocId,
      lot_id: lotId || null,
      category,
      file_name: safeName,
      file_path: key,
      // The size and type we STORED, not what was handed to us: a
      // downscaled photo is a different length and can be a different
      // format, and the download route reads both back.
      file_size: buffer.byteLength,
      mime_type: storedType,
      thumbnail_storage_key: thumbnailKey,
      is_confidential: false,
      uploaded_by: profile.id,
      // Self-OCR categories carry their own status lifecycle (the inline
      // parse flips it to complete). Generic docs start pending → the
      // background job moves them to complete.
      ocr_status: willOcr ? "pending" : "skipped",
      // "skipped" here means no rendition is needed, which is the answer for
      // a PDF or an image. It is not the same as one that has not run yet.
      pdf_status: willConvert ? "pending" : "skipped",
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("audit_log").insert({
    profile_id: profile.id,
    oc_id: ocId,
    action: "upload",
    entity_type: "document",
    entity_id: doc.id,
    after_state: { file_name: safeName, category, lot_id: lotId || null },
    // metadata.lot_id is what lot-overview's activity feed filters on , without
    // it the lot's History tab never surfaces document uploads.
    metadata: lotId ? { lot_id: lotId } : null,
  });

  // Reading the document starts NOW, not in up to ten minutes.
  //
  // OCR still never runs in the request path: after() hands the response to
  // the manager first and then keeps the function alive to do the work. What
  // it replaces is waiting for the cron. A manager who uploads the minutes
  // as a .docx and clicks preview was looking at "we're still getting this
  // one ready" for up to ten minutes, because the render that makes it
  // previewable only happened on the sweep.
  //
  // The sweep stays as the backstop: it picks up anything still `pending`,
  // which covers a cold start that dropped the after() work, a conversion
  // that timed out, and every document uploaded before this existed.
  if (willOcr) {
    after(async () => {
      try {
        await ingestDocumentOcr(doc.id as string);
      } catch (err) {
        // Never throws in practice, but an unhandled rejection here would
        // be invisible and the row would sit pending until the sweep.
        console.error("[documents] post-upload ingest failed:", err);
      }
    });
  }

  return NextResponse.json({
    ...doc,
    public_url: publicUrlFor(key),
  });
}
