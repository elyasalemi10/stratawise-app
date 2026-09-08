import "server-only";
import sharp from "sharp";

// First page of a PDF, as a small WebP.
//
// The card used to embed the PDF in an <object>, which hands it to the
// browser's built-in viewer: a grey plate with its own chrome and its own
// loading state, different in every browser, and it downloads the WHOLE
// document to show one page. On a grid of twelve that is twelve full PDFs
// fetched to render twelve thumbnails.
//
// Rendering page one once, at upload, means the grid shows an image like any
// other and the full file is only fetched when someone opens it.
//
// Never throws. A PDF we cannot rasterise falls back to the extension plate,
// which is what every non-previewable file already shows.

const THUMB_EDGE = 480;

/** Height as a multiple of width.
 *
 *  The card's preview box is much wider than it is tall (roughly 500 by 256),
 *  so a thumbnail cut at the page's own proportions is far taller than the
 *  box and the browser has to crop it again on the way in. object-cover
 *  centres that crop, which took the slice off the TOP: the letterhead, the
 *  title and the policy number, the only part worth showing. Cutting closer
 *  to the box's shape here leaves the browser almost nothing to remove, and
 *  the card pins what is left to the top. */
const CARD_ASPECT = 0.62;

export async function renderPdfFirstPage(bytes: Buffer): Promise<Buffer | null> {
  try {
    // The legacy build is the one that runs outside a browser: the modern
    // entry point assumes DOM APIs that do not exist on the server.
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const { createCanvas } = await import("@napi-rs/canvas");

    const doc = await pdfjs.getDocument({
      data: new Uint8Array(bytes),
      // No worker on the server: spawning one per upload costs more than
      // rendering a single page inline.
      disableWorker: true,
      isEvalSupported: false,
      // A document that wants a font we do not ship should still render its
      // layout rather than failing outright.
      useSystemFonts: true,
    } as Parameters<typeof pdfjs.getDocument>[0]).promise;

    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    // Scale to WIDTH, then crop to the card's aspect from the TOP.
    //
    // Fitting the whole page inside the box shrank an A4 sheet until its
    // heading was a few pixels tall, which is unreadable and makes every
    // document look the same. The top of the first page is where the letter
    // head, the title and the policy number are, so that is what the card
    // shows: the same crop you would get if you photographed the top of the
    // page.
    const scale = THUMB_EDGE / base.width;
    const viewport = page.getViewport({ scale });
    const cropHeight = Math.min(Math.ceil(viewport.height), Math.round(THUMB_EDGE * CARD_ASPECT));

    const canvas = createCanvas(Math.ceil(viewport.width), cropHeight);
    const ctx = canvas.getContext("2d");
    // A PDF page is transparent where it is blank, which composites to black
    // in a WebP. Paint the paper first.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    await page.render({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      canvasContext: ctx as any,
      viewport,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any).promise;

    const png = canvas.toBuffer("image/png");
    await doc.cleanup();

    return await sharp(png)
      .webp({ quality: 72, effort: 6, smartSubsample: true })
      .toBuffer();
  } catch (err) {
    console.error("[pdf-thumbnail] could not render page one:", err);
    return null;
  }
}
