"use client";

import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";

// Pick a profile picture, then frame it.
//
// The old control uploaded whatever file you chose, so a landscape photo
// became a squashed circle and there was no way to say which part of it
// mattered. Here you drag to pan and drag the slider to zoom, and what you
// see in the circle is exactly what gets uploaded.
//
// Zooming out past the point where the image covers the frame is allowed on
// purpose , sometimes the whole photo IS the picture. The gap fills with
// white rather than transparency, because a transparent PNG on a white
// avatar ring looks like a rendering fault, and on any other background it
// looks like a different photo.

const OUTPUT_PX = 512;
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3;
const MAX_BYTES = 2 * 1024 * 1024;

export function AvatarCropDialog({
  open,
  onOpenChange,
  onCropped,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Receives the framed image as a PNG blob, ready to upload. */
  onCropped: (blob: Blob) => Promise<void> | void;
}) {
  const [image, setImage] = React.useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = React.useState(1);
  const [offset, setOffset] = React.useState({ x: 0, y: 0 });
  const [saving, setSaving] = React.useState(false);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const drag = React.useRef<{ x: number; y: number } | null>(null);

  // Reset whenever the dialog opens, so the last photo's framing does not
  // carry over to the next one.
  React.useEffect(() => {
    if (open) {
      setImage(null);
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    }
  }, [open]);

  function loadFile(file: File) {
    if (!/^image\/(png|jpeg|webp|gif)$/.test(file.type)) {
      toast.error("Use a PNG, JPG, GIF or WebP.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("That image is over 2MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        setImage(img);
        // Start at "cover": the smallest zoom that fills the circle, which is
        // the framing people want the vast majority of the time.
        setZoom(OUTPUT_PX / Math.min(img.width, img.height));
        setOffset({ x: 0, y: 0 });
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  // Paint on every change. White first, so any area the image does not cover
  // is white rather than transparent.
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, OUTPUT_PX, OUTPUT_PX);
    if (!image) return;

    const w = image.width * zoom;
    const h = image.height * zoom;
    ctx.drawImage(
      image,
      OUTPUT_PX / 2 - w / 2 + offset.x,
      OUTPUT_PX / 2 - h / 2 + offset.y,
      w,
      h,
    );
  }, [image, zoom, offset]);

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!image) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY };
  }
  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drag.current || !image) return;
    // The canvas is displayed smaller than it is, so a pixel of pointer
    // movement is more than a pixel of image movement.
    const scale = OUTPUT_PX / e.currentTarget.clientWidth;
    setOffset((o) => ({
      x: o.x + (e.clientX - drag.current!.x) * scale,
      y: o.y + (e.clientY - drag.current!.y) * scale,
    }));
    drag.current = { x: e.clientX, y: e.clientY };
  }
  function onPointerUp() {
    drag.current = null;
  }

  async function save() {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    setSaving(true);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
    if (!blob) {
      setSaving(false);
      toast.error("Could not process that image.");
      return;
    }
    try {
      await onCropped(blob);
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Profile picture</DialogTitle>
          <DialogDescription>Drag to move, and use the slider to zoom.</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          <div className="relative size-56 overflow-hidden rounded-full border border-border bg-white">
            <canvas
              ref={canvasRef}
              width={OUTPUT_PX}
              height={OUTPUT_PX}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className={image ? "size-full cursor-grab active:cursor-grabbing touch-none" : "size-full"}
            />
            {!image && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="absolute inset-0 flex cursor-pointer items-center justify-center text-sm text-muted-foreground"
              >
                Choose an image
              </button>
            )}
          </div>

          <Slider
            value={[zoom]}
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            disabled={!image}
            onValueChange={(v) => setZoom(Array.isArray(v) ? v[0] : v)}
            className="w-56"
            aria-label="Zoom"
          />

          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) loadFile(f);
              e.currentTarget.value = "";
            }}
          />
        </div>

        <DialogFooter>
          <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={saving}>
            {image ? "Choose another" : "Choose image"}
          </Button>
          <Button onClick={save} disabled={!image} loading={saving}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
