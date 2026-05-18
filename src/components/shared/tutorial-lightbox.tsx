"use client";

import Image from "next/image";
import { useEffect, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Click-to-expand image stack used by the Gmail tutorial. Holds the URLs of
// every screenshot so left/right arrow keys (or on-screen buttons) cycle
// between them. Escape closes. Click outside the image closes.

export interface LightboxImage {
  src: string;
  alt: string;
}

export function useLightbox(images: LightboxImage[]) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const open = useCallback((index: number) => setOpenIndex(index), []);
  const close = useCallback(() => setOpenIndex(null), []);

  const next = useCallback(() => {
    setOpenIndex((i) => (i === null ? null : (i + 1) % images.length));
  }, [images.length]);
  const prev = useCallback(() => {
    setOpenIndex((i) =>
      i === null ? null : (i - 1 + images.length) % images.length,
    );
  }, [images.length]);

  useEffect(() => {
    if (openIndex === null) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "ArrowRight") next();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openIndex, close, next, prev]);

  return { openIndex, open, close, next, prev };
}

export function TutorialLightbox({
  images,
  openIndex,
  onClose,
  onNext,
  onPrev,
}: {
  images: LightboxImage[];
  openIndex: number | null;
  onClose: () => void;
  onNext: () => void;
  onPrev: () => void;
}) {
  if (openIndex === null) return null;
  const current = images[openIndex];
  if (!current) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-md bg-white/10 text-white hover:bg-white/20 cursor-pointer"
        aria-label="Close"
      >
        <X className="size-5" />
      </button>

      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPrev();
            }}
            className={cn(
              "absolute left-4 top-1/2 -translate-y-1/2 inline-flex h-12 w-12 items-center justify-center rounded-md bg-white/10 text-white hover:bg-white/20 cursor-pointer",
            )}
            aria-label="Previous image"
          >
            <ChevronLeft className="size-6" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onNext();
            }}
            className={cn(
              "absolute right-4 top-1/2 -translate-y-1/2 inline-flex h-12 w-12 items-center justify-center rounded-md bg-white/10 text-white hover:bg-white/20 cursor-pointer",
            )}
            aria-label="Next image"
          >
            <ChevronRight className="size-6" />
          </button>
        </>
      )}

      <div
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[90vh] max-w-[90vw]"
      >
        <Image
          src={current.src}
          alt={current.alt}
          width={2400}
          height={1600}
          className="max-h-[90vh] w-auto max-w-[90vw] object-contain rounded-md"
          unoptimized
        />
        <p className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-md bg-black/60 px-2 py-1 text-xs text-white">
          {openIndex + 1} / {images.length}
        </p>
      </div>
    </div>
  );
}
