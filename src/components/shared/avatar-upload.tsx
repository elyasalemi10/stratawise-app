"use client";

import { useState, useRef } from "react";
import { Camera, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

interface AvatarUploadProps {
  value: string;
  onChange: (url: string) => void;
  fallbackInitial?: string;
}

export function AvatarUpload({ value, onChange, fallbackInitial }: AvatarUploadProps) {
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!file.type.match(/^image\/(png|jpeg|webp)$/)) {
      toast.error("Use PNG, JPG, or WebP.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("File too large. Maximum 2MB.");
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? "Upload failed");
        return;
      }

      onChange(data.url);
    } catch {
      toast.error("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className={cn(
          "relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-border bg-muted overflow-hidden transition-colors hover:border-primary/30",
          uploading && "opacity-50 cursor-not-allowed"
        )}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt="Profile"
            className="h-full w-full object-cover"
          />
        ) : uploading ? (
          <Spinner />
        ) : fallbackInitial ? (
          <span className="text-lg font-semibold text-muted-foreground">
            {fallbackInitial}
          </span>
        ) : (
          <Camera className="h-5 w-5 text-muted-foreground" />
        )}
      </button>

      <div className="flex-1">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="text-sm text-primary hover:underline"
          >
            {value ? "Change photo" : "Upload photo"}
          </button>
          {value && (
            <button
              type="button"
              onClick={() => onChange("")}
              className="text-sm text-muted-foreground hover:text-destructive flex items-center gap-1"
            >
              <X className="h-3 w-3" />
              Remove
            </button>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}
