import "server-only";
import sharp from "sharp";

// ============================================================================
// Photos, at a size anyone actually needs.
// ----------------------------------------------------------------------------
// A phone camera writes 12 megapixels and four to eight megabytes. Nothing in
// this app displays an image wider than about a thousand CSS pixels, so every
// one of those bytes was paid for twice: once on the manager's upload, and
// again on every owner who opens the page. On a building with a hundred lots
// that is the difference between a page that loads and one that does not.
//
// Deliberately NOT the conversion service. Office documents need LibreOffice
// rendering we cannot host, which is worth paying per file for. Resizing a
// JPEG is a library call, and sharp already ships with Next for image
// optimisation, so sending photos out to a metered API would be paying for
// something we can do in the same process.
//
// Downscales in PLACE: the smaller file replaces the upload rather than
// sitting beside it. Keeping both would defeat the storage half of the point,
// and the cap is set high enough that nothing legible is lost.
// ============================================================================

const DOWNSCALABLE = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/tiff",
]);

/** Longest edge we keep. Roughly twice the widest the app ever renders, so a
 *  retina screen still has pixels to spare and a scanned page is still
 *  readable when zoomed. */
const MAX_EDGE = 2400;

/** Below this an image is not worth re-encoding: the saving is noise and
 *  re-encoding a small JPEG can make it bigger. */
const MIN_BYTES = 400 * 1024;

export function isDownscalableImage(mimeType: string | null | undefined): boolean {
  if (!mimeType) return false;
  return DOWNSCALABLE.has(mimeType.toLowerCase());
}

export interface Downscaled {
  bytes: Buffer;
  contentType: string;
  /** False when the original was already small enough and is being returned
   *  unchanged. */
  changed: boolean;
}

/**
 * Shrink an oversized photo. Returns the original untouched if it is already
 * small, if the format is not one we resize, or if anything goes wrong.
 *
 * Never throws. An upload must not fail because an image could not be
 * resized: the full-size file is a worse outcome than no upload, but it is
 * not a broken one.
 */
export async function downscaleImage(
  bytes: Buffer,
  mimeType: string | null | undefined,
): Promise<Downscaled> {
  const unchanged: Downscaled = {
    bytes,
    contentType: mimeType ?? "application/octet-stream",
    changed: false,
  };
  if (!isDownscalableImage(mimeType)) return unchanged;
  if (bytes.byteLength < MIN_BYTES) return unchanged;

  try {
    const image = sharp(bytes, { failOn: "none" });
    const meta = await image.metadata();
    const longest = Math.max(meta.width ?? 0, meta.height ?? 0);
    if (longest === 0) return unchanged;

    // PNG screenshots stay PNG so flat colour and text edges do not get
    // smeared by chroma subsampling; photographs become JPEG, which is
    // several times smaller than a PNG of the same picture.
    const keepPng = (mimeType ?? "").toLowerCase() === "image/png" && meta.channels !== 3;

    let pipeline = image.rotate(); // honour EXIF orientation before resizing
    if (longest > MAX_EDGE) {
      pipeline = pipeline.resize({
        width: meta.width && meta.width >= (meta.height ?? 0) ? MAX_EDGE : undefined,
        height: meta.height && (meta.height > (meta.width ?? 0)) ? MAX_EDGE : undefined,
        fit: "inside",
        withoutEnlargement: true,
      });
    }

    const out = keepPng
      ? await pipeline.png({ compressionLevel: 9, palette: true }).toBuffer()
      : await pipeline.jpeg({ quality: 82, mozjpeg: true }).toBuffer();

    // If the re-encode did not actually save anything, keep the original.
    // Re-encoding an already-optimised file usually costs bytes.
    if (out.byteLength >= bytes.byteLength) return unchanged;

    return {
      bytes: out,
      contentType: keepPng ? "image/png" : "image/jpeg",
      changed: true,
    };
  } catch (err) {
    console.error("[downscale] failed, storing the original instead:", err);
    return unchanged;
  }
}

/** Longest edge for a grid thumbnail. The card renders at roughly 300 CSS
 *  pixels, so this is retina-sharp with a little room and still about two
 *  percent of the decoded size of the 2400px original. */
const THUMB_EDGE = 480;

/**
 * A small WebP for the documents grid.
 *
 * Returns null when there is nothing to make one from. Never throws: a
 * missing thumbnail falls back to the full image, which is the behaviour
 * that existed before thumbnails did.
 */
export async function makeThumbnail(
  bytes: Buffer,
  mimeType: string | null | undefined,
): Promise<Buffer | null> {
  if (!isDownscalableImage(mimeType)) return null;
  try {
    return await sharp(bytes, { failOn: "none" })
      .rotate()
      .resize({ width: THUMB_EDGE, height: THUMB_EDGE, fit: "inside", withoutEnlargement: true })
      // WebP rather than JPEG: markedly smaller at this size, and every
      // browser that can run this app can read it.
      .webp({ quality: 72 })
      .toBuffer();
  } catch (err) {
    console.error("[thumbnail] generation failed, the grid will use the full image:", err);
    return null;
  }
}
