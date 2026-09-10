import "server-only";

// ============================================================================
// Office document → PDF.
// ----------------------------------------------------------------------------
// Document AI accepts PDFs and images and nothing else, so a .docx or .pptx
// used to be marked `skipped` on upload: never indexed, never searchable, and
// not viewable either, because no browser renders a Word file inline. A
// manager could upload the AGM minutes and then be unable to find them again
// by anything but the filename.
//
// Converting needs LibreOffice-class rendering and there is nowhere in this
// stack to run it. A Cloudflare Worker is a V8 isolate with no native
// binaries and no processes; a Vercel function has a bundle limit an order of
// magnitude smaller than a LibreOffice install. So the rendering is bought
// per file rather than hosted.
//
// The PDF is KEPT, not discarded after OCR. It is what the in-app viewer
// shows, which is the half of this that OCR alone would not have fixed.
//
// Degrades to nothing: with no API key configured the caller marks the row
// `skipped` and the document stays download-only. An upload never fails
// because conversion is unavailable, and no user-facing string names the
// provider or the variable (see the error-message rule in CLAUDE.md).
// ============================================================================

/** What the service will render for us. Keys are mime types as the browser
 *  reports them on upload; the value is the extension the service wants,
 *  which is how it picks an engine. */
const CONVERTIBLE: Record<string, string> = {
  // Word
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.oasis.opendocument.text": "odt",
  "application/rtf": "rtf",
  "text/rtf": "rtf",
  // PowerPoint
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.oasis.opendocument.presentation": "odp",
  // Excel
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.oasis.opendocument.spreadsheet": "ods",
  // Text and CSV convert too. Their TEXT is read directly (free, and better
  // than anything a renderer would give us), but a spreadsheet export with
  // no preview is a grey plate in the grid like everything else, and the
  // manager cannot tell one bank export from another without opening it.
  "text/csv": "csv",
  "text/plain": "txt",
  // Macro-enabled variants. Same engines, different mime.
  "application/vnd.ms-excel.sheet.macroEnabled.12": "xlsm",
  "application/vnd.ms-word.document.macroEnabled.12": "docm",
  "application/vnd.ms-powerpoint.presentation.macroEnabled.12": "pptm",
};

/** Every extension we can render, so a file whose mime type arrived useless
 *  is still convertible. */
const CONVERTIBLE_EXTENSIONS = new Set([
  ...Object.values(CONVERTIBLE),
  // Not reachable by mime because these three share theirs with the
  // non-macro form on some platforms.
  "xlsm", "docm", "pptm",
]);

/**
 * What to convert this file AS.
 *
 * The mime type is the browser's guess and it is frequently wrong or
 * missing: an .xlsx dragged out of an email client, off a network share, or
 * from a zip arrives as application/octet-stream more often than not, and on
 * some Windows configurations .xlsx is reported as application/vnd.ms-excel.
 * Every one of those was marked "nothing to convert" and the manager got a
 * spreadsheet with no preview and no searchable text, next to an identical
 * spreadsheet that happened to upload with the right header.
 *
 * So the mime type is asked first, because when it is right it is more
 * specific than the extension, and the extension is asked second, because
 * the manager named the file and they were not guessing.
 */
function inputFormatFor(
  mimeType: string | null | undefined,
  fileName: string | null | undefined,
): string | null {
  const byMime = CONVERTIBLE[(mimeType ?? "").toLowerCase()];
  if (byMime) return byMime;

  const ext = (fileName ?? "").includes(".")
    ? (fileName ?? "").split(".").pop()!.trim().toLowerCase()
    : "";
  return ext && CONVERTIBLE_EXTENSIONS.has(ext) ? ext : null;
}

const API_BASE = "https://api.cloudconvert.com/v2";

/** A job that has not settled inside this is treated as failed. The upload
 *  already succeeded, so giving up costs a document that stays
 *  download-only until someone retries it, not lost work. */
const JOB_TIMEOUT_MS = 120_000;
const POLL_INTERVAL_MS = 2_000;

/** Past this we do not spend the conversion. A 60MB slide deck is not
 *  something anyone reads in a preview pane, and the round trip is metered. */
const MAX_INPUT_BYTES = 50 * 1024 * 1024;

export function needsPdfConversion(
  mimeType: string | null | undefined,
  fileName?: string | null,
): boolean {
  return inputFormatFor(mimeType, fileName) !== null;
}

export function isConversionConfigured(): boolean {
  return Boolean(process.env.CLOUDCONVERT_API_KEY);
}

/** Thrown for every failure mode. The message is for `pdf_error` and the
 *  operator log, never for a toast. */
export class ConversionError extends Error {}

async function api(path: string, init: RequestInit): Promise<Response> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.CLOUDCONVERT_API_KEY}`,
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ConversionError(
      `Conversion service returned ${res.status}: ${body.slice(0, 200)}`,
    );
  }
  return res;
}

interface JobTask {
  name: string;
  status: string;
  message?: string | null;
  result?: {
    form?: { url: string; parameters: Record<string, string> };
    files?: Array<{ filename: string; url: string }>;
  };
}

/**
 * Render an Office document to PDF. Returns the PDF bytes.
 *
 * Three tasks in one job: we upload the bytes rather than handing over an R2
 * URL, so nothing about the bucket is exposed and a private object needs no
 * signed URL; then convert; then export to a URL we fetch once.
 */
export async function convertToPdf(
  bytes: Buffer,
  /** May be empty or wrong: the extension is the fallback. */
  mimeType: string,
  fileName: string,
): Promise<Buffer> {
  if (!isConversionConfigured()) {
    throw new ConversionError("Conversion is not configured for this deployment.");
  }
  const inputFormat = inputFormatFor(mimeType, fileName);
  if (!inputFormat) {
    throw new ConversionError(`Nothing to convert for ${mimeType} / ${fileName}.`);
  }
  if (bytes.byteLength > MAX_INPUT_BYTES) {
    throw new ConversionError(
      `File is ${Math.round(bytes.byteLength / 1024 / 1024)}MB, over the ${
        MAX_INPUT_BYTES / 1024 / 1024
      }MB conversion limit.`,
    );
  }

  const created = await api("/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tasks: {
        upload: { operation: "import/upload" },
        render: {
          operation: "convert",
          input: "upload",
          input_format: inputFormat,
          output_format: "pdf",
        },
        collect: { operation: "export/url", input: "render", inline: false },
      },
      // Tagged so a job left behind by a crashed deploy is identifiable in
      // the provider's dashboard rather than anonymous.
      tag: "stratawise-document",
    }),
  });
  const job = (await created.json()) as { data: { id: string; tasks: JobTask[] } };

  // Step 1: hand over the bytes through the form the upload task describes.
  const uploadTask = job.data.tasks.find((t) => t.name === "upload");
  const form = uploadTask?.result?.form;
  if (!form) throw new ConversionError("Conversion service did not offer an upload.");

  const body = new FormData();
  for (const [k, v] of Object.entries(form.parameters)) body.append(k, v);
  body.append("file", new Blob([new Uint8Array(bytes)], { type: mimeType }), fileName);
  const put = await fetch(form.url, { method: "POST", body });
  if (!put.ok) {
    throw new ConversionError(`Upload to conversion service failed (${put.status}).`);
  }

  // Step 2: wait for the job. Polling rather than a webhook because this
  // already runs in a background context (the upload route's after() hook),
  // so a webhook would need a public callback URL and a second trip through
  // auth for no gain.
  const deadline = Date.now() + JOB_TIMEOUT_MS;
  let exportTask: JobTask | undefined;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const polled = await api(`/jobs/${job.data.id}`, { method: "GET" });
    const state = (await polled.json()) as { data: { status: string; tasks: JobTask[] } };
    if (state.data.status === "error") {
      const failed = state.data.tasks.find((t) => t.status === "error");
      throw new ConversionError(
        failed?.message ?? "The conversion service could not read this file.",
      );
    }
    if (state.data.status === "finished") {
      exportTask = state.data.tasks.find((t) => t.name === "collect");
      break;
    }
  }
  if (!exportTask) {
    throw new ConversionError(`Conversion did not finish within ${JOB_TIMEOUT_MS / 1000}s.`);
  }

  // Step 3: collect the result.
  const file = exportTask.result?.files?.[0];
  if (!file?.url) throw new ConversionError("Conversion finished without producing a file.");
  const pdf = await fetch(file.url);
  if (!pdf.ok) throw new ConversionError(`Could not download the converted PDF (${pdf.status}).`);
  return Buffer.from(await pdf.arrayBuffer());
}
