"use client";

// A still from a video, taken in the browser at upload time.
//
// Server-side frame extraction means ffmpeg, and there is nowhere in this
// stack to run it: a Vercel function's bundle limit is an order of magnitude
// under an ffmpeg build, the same reason Office conversion is bought rather
// than hosted. The conversion service can do video too, but it is metered,
// and the browser already has a decoder for anything it will let you upload.
//
// So the frame is captured here and sent alongside the file. It costs
// nothing, needs no new dependency, and fails to null, in which case the
// card shows the film illustration like any other unpreviewable file.

/** Longest edge, matching the server's thumbnails. */
const THUMB_EDGE = 480;

/** Where to seek. Not zero: the first frame of a phone video is very often
 *  black or a blurred pan as the camera settles. */
const SEEK_FRACTION = 0.1;
const MAX_SEEK_SECONDS = 3;

export async function captureVideoPoster(file: File): Promise<Blob | null> {
  if (!file.type.startsWith("video/")) return null;

  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.preload = "metadata";
  video.muted = true;
  video.playsInline = true;
  video.src = url;

  try {
    const blob = await new Promise<Blob | null>((resolve) => {
      // A video the browser cannot decode never fires either event, and a
      // hung promise here would hang the upload.
      const timeout = setTimeout(() => resolve(null), 10_000);

      function fail() {
        clearTimeout(timeout);
        resolve(null);
      }

      video.addEventListener("error", fail, { once: true });

      video.addEventListener(
        "loadedmetadata",
        () => {
          const duration = Number.isFinite(video.duration) ? video.duration : 0;
          video.currentTime = Math.min(duration * SEEK_FRACTION, MAX_SEEK_SECONDS);
        },
        { once: true },
      );

      video.addEventListener(
        "seeked",
        () => {
          try {
            const w = video.videoWidth;
            const h = video.videoHeight;
            if (!w || !h) return fail();

            const scale = Math.min(THUMB_EDGE / Math.max(w, h), 1);
            const canvas = document.createElement("canvas");
            canvas.width = Math.round(w * scale);
            canvas.height = Math.round(h * scale);
            const ctx = canvas.getContext("2d");
            if (!ctx) return fail();
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            canvas.toBlob(
              (out) => {
                clearTimeout(timeout);
                resolve(out);
              },
              "image/webp",
              0.72,
            );
          } catch {
            fail();
          }
        },
        { once: true },
      );
    });
    return blob;
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute("src");
    video.load();
  }
}
