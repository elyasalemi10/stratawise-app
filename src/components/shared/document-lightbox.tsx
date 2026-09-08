"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useScrimSlot } from "@/components/ui/use-scrim-stack";

// Full-screen document viewer.
//
// Not a dialog. A dialog is a panel with a border, a header and a close
// button, and every one of those is a thing between the reader and the page
// they are trying to read. This is the page on a dimmed backdrop: click
// anywhere off it, or press Escape, and it goes.
//
// PDFs are rendered by us, page after page down a single scroll, rather than
// handed to the browser's built-in viewer in an <iframe>. The native viewer
// brings its own toolbar, its own scrollbar, its own theme and its own idea
// of zoom, it looks different in every browser, and on iOS it frequently
// refuses to render inline at all. Drawing the pages onto canvases costs us
// a worker and gives us a document that looks the same everywhere and reads
// like the rest of the app.

interface PdfPage {
  canvas: HTMLCanvasElement;
}

function PdfPages({ url }: { url: string }) {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const [status, setStatus] = React.useState<"loading" | "ready" | "failed">("loading");

  React.useEffect(() => {
    let cancelled = false;
    const rendered: PdfPage[] = [];

    (async () => {
      try {
        // Imported here rather than at module scope: pdf.js is large and
        // only a viewer that is actually open needs it.
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).toString();

        const doc = await pdfjs.getDocument({ url, withCredentials: true }).promise;
        if (cancelled) return;

        const host = hostRef.current;
        if (!host) return;
        host.replaceChildren();

        // Device pixel ratio, capped: a 3x canvas of an A4 page at full
        // width is tens of megabytes of bitmap for detail nobody can see.
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const targetWidth = Math.min(host.clientWidth || 900, 1100);

        for (let n = 1; n <= doc.numPages; n++) {
          if (cancelled) return;
          const page = await doc.getPage(n);
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (targetWidth / base.width) * dpr });

          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = "100%";
          canvas.style.height = "auto";
          canvas.className = "block rounded-sm bg-white shadow-lg";
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;

          host.appendChild(canvas);
          rendered.push({ canvas });
          await page.render({ canvas, canvasContext: ctx, viewport }).promise;
          if (n === 1 && !cancelled) setStatus("ready");
        }
        if (!cancelled) setStatus("ready");
      } catch (err) {
        console.error("[lightbox] could not render the PDF:", err);
        if (!cancelled) setStatus("failed");
      }
    })();

    return () => {
      cancelled = true;
      // Free the bitmaps rather than waiting for GC: a long document is a
      // lot of memory to leave behind when the viewer closes.
      for (const p of rendered) {
        p.canvas.width = 0;
        p.canvas.height = 0;
      }
    };
  }, [url]);

  return (
    <>
      <div ref={hostRef} className="flex w-full flex-col items-center gap-4" />
      {status === "loading" && (
        <p className="py-16 text-sm text-white/70">Opening…</p>
      )}
      {status === "failed" && (
        <p className="py-16 text-sm text-white/70">
          This one can&apos;t be shown here. Download it to open it.
        </p>
      )}
    </>
  );
}

export function DocumentLightbox({
  open,
  url,
  mimeType,
  pdfReady,
  onClose,
}: {
  open: boolean;
  url: string | null;
  mimeType: string | null;
  /** An Office file that has been rendered to PDF: the view URL already
   *  serves the rendition, so it can be drawn like any other PDF. */
  pdfReady?: boolean;
  onClose: () => void;
}) {
  // Only while actually open. This component is rendered unconditionally by
  // the documents page and decides for itself whether to show, so an
  // unconditional slot dimmed the entire page from the moment you arrived.
  useScrimSlot(open);

  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    // The page behind must not scroll under the viewer.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open || !url || typeof document === "undefined") return null;

  const isImage = mimeType?.startsWith("image/");
  const isPdf = mimeType === "application/pdf" || pdfReady;

  return createPortal(
    <div
      // z-50 puts it above the shared scrim at z-40, which is what dims the
      // page. No colour of its own, so two overlays never double up.
      className="fixed inset-0 z-50 overflow-y-auto overscroll-contain"
      onClick={onClose}
      role="presentation"
    >
      <div className="flex min-h-full w-full justify-center p-4 sm:p-8">
        <div
          // Stops a click on the document itself closing the viewer, while a
          // click on the space around it still does.
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-4xl"
        >
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={url}
              alt=""
              className="mx-auto max-h-[90vh] w-auto rounded-sm object-contain shadow-lg"
            />
          ) : isPdf ? (
            <PdfPages url={url} />
          ) : (
            <div className="mx-auto max-w-sm rounded-lg bg-card p-8 text-center">
              <p className="text-sm text-muted-foreground">
                There&apos;s no preview for this file type. Download it to open it.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
