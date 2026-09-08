"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useScrimSlot } from "@/components/ui/use-scrim-stack";
import { BrandLoader } from "@/components/shared/brand-mark";

// Full-screen document viewer.
//
// Not a dialog. A dialog is a panel with a border, a header and a close
// button, and every one of those is a thing between the reader and the page
// they are trying to read. This is the document on a dimmed backdrop: click
// anywhere off it, press Escape, or arrow between documents.
//
// PDFs are rendered by us, page after page down a single scroll, rather than
// handed to the browser's built-in viewer in an <iframe>. The native viewer
// brings its own toolbar, scrollbar, theme and idea of zoom, looks different
// in every browser, and on iOS frequently refuses to render inline at all.

export interface LightboxItem {
  id: string;
  url: string;
  mimeType: string | null;
  pdfReady?: boolean;
}

function PdfPages({ url }: { url: string }) {
  const hostRef = React.useRef<HTMLDivElement>(null);
  const [status, setStatus] = React.useState<"loading" | "ready" | "failed">("loading");

  React.useEffect(() => {
    let cancelled = false;
    const canvases: HTMLCanvasElement[] = [];
    setStatus("loading");

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

        // Rendered into a detached fragment and attached in one go, so the
        // reader never watches pages appear one at a time.
        const frag = document.createDocumentFragment();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const targetWidth = Math.min(host.clientWidth || 900, 1000);

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
          await page.render({ canvas, canvasContext: ctx, viewport }).promise;
          frag.appendChild(canvas);
          canvases.push(canvas);
        }
        if (cancelled) return;
        host.replaceChildren(frag);
        setStatus("ready");
      } catch (err) {
        console.error("[lightbox] could not render the PDF:", err);
        if (!cancelled) setStatus("failed");
      }
    })();

    return () => {
      cancelled = true;
      // Free the bitmaps rather than waiting for GC: a long document is a
      // lot of memory to leave behind when the viewer moves on.
      for (const c of canvases) {
        c.width = 0;
        c.height = 0;
      }
    };
  }, [url]);

  return (
    <>
      {status === "loading" && <BrandLoader className="py-24" size="h-12 w-12" />}
      {status === "failed" && (
        <p className="py-24 text-center text-sm text-white/70">
          This one can&apos;t be shown here. Download it to open it.
        </p>
      )}
      <div
        ref={hostRef}
        className={`flex w-full flex-col items-center gap-4 ${status === "ready" ? "" : "hidden"}`}
      />
    </>
  );
}

function ImagePage({ url }: { url: string }) {
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => setReady(false), [url]);
  return (
    <>
      {!ready && <BrandLoader className="py-24" size="h-12 w-12" />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        decoding="async"
        onLoad={() => setReady(true)}
        onError={() => setReady(true)}
        className={`mx-auto max-h-[85vh] w-auto rounded-sm object-contain shadow-lg ${ready ? "" : "hidden"}`}
      />
    </>
  );
}

export function DocumentLightbox({
  open,
  items,
  index,
  onIndexChange,
  onClose,
}: {
  open: boolean;
  /** Everything on the page, so the viewer can move between them. */
  items: LightboxItem[];
  index: number;
  onIndexChange: (next: number) => void;
  onClose: () => void;
}) {
  // Only while actually open. This component is rendered unconditionally by
  // the documents page and decides for itself whether to show, so an
  // unconditional slot dimmed the entire page from the moment you arrived.
  useScrimSlot(open);

  const count = items.length;
  const current = items[index];

  const go = React.useCallback(
    (delta: number) => {
      if (count < 2) return;
      // Wraps, because a viewer that stops at the end makes you close it and
      // start again to see the one you passed.
      onIndexChange((index + delta + count) % count);
    },
    [index, count, onIndexChange],
  );

  React.useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    }
    window.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose, go]);

  if (!open || !current || typeof document === "undefined") return null;

  const isImage = current.mimeType?.startsWith("image/");
  const isPdf = current.mimeType === "application/pdf" || current.pdfReady;

  return createPortal(
    <div
      // z-50 puts it above the shared scrim at z-40, which is what dims the
      // page. No colour of its own, so two overlays never double up.
      className="fixed inset-0 z-50 overflow-y-auto overscroll-contain"
      onClick={onClose}
      role="presentation"
    >
      {count > 1 && (
        <>
          {/* Fixed, not in the scroll flow: on a long PDF the arrows have to
              stay reachable without scrolling back to the top. */}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); go(-1); }}
            aria-label="Previous document"
            className="fixed left-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-colors hover:bg-black/65"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); go(1); }}
            aria-label="Next document"
            className="fixed right-3 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-colors hover:bg-black/65"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}

      {/* min-h-full + items-center centres a short document in the viewport
          and lets a long one scroll from its top, which is what you want for
          a PDF: page one, at the top, not the middle of the document. */}
      <div className="flex min-h-full w-full items-center justify-center p-4 sm:p-8">
        <div onClick={(e) => e.stopPropagation()} className="w-full max-w-4xl">
          {count > 1 && (
            <p className="mb-3 text-center text-sm font-medium text-white/80 tabular-nums">
              {index + 1} of {count}
            </p>
          )}
          {isImage ? (
            <ImagePage url={current.url} />
          ) : isPdf ? (
            <PdfPages url={current.url} />
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
