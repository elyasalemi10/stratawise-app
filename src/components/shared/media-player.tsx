"use client";

import * as React from "react";
import {
  Maximize,
  Minimize,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from "lucide-react";
import { FileTypeIllustration } from "@/components/shared/file-type-illustration";
import { cn } from "@/lib/utils";

/**
 * Our transport, over a plain <video> or <audio>.
 *
 * The native controls were the honest choice while a clip was something
 * someone watched once. They are the wrong choice now that they are the only
 * chrome in the app the browser draws: Chrome's bar is a dark slab, Safari's
 * is a frosted pill, Firefox's is neither, none of them use our palette, and
 * an audio file rendered as a 300px grey capsule floating in the middle of
 * the viewer looked like a widget the page had failed to style.
 *
 * The element still does the work. This draws the buttons and the bar, and
 * reads its state from the element's own events rather than keeping a second
 * copy: a player that thinks it is playing while the media has stalled is
 * worse than no player.
 */

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function MediaPlayer({
  src,
  kind,
  autoPlay,
  className,
}: {
  src: string;
  kind: "audio" | "video";
  autoPlay?: boolean;
  className?: string;
}) {
  const mediaRef = React.useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
  const shellRef = React.useRef<HTMLDivElement | null>(null);
  const [playing, setPlaying] = React.useState(false);
  const [current, setCurrent] = React.useState(0);
  const [duration, setDuration] = React.useState(0);
  const [volume, setVolume] = React.useState(1);
  const [muted, setMuted] = React.useState(false);
  const [fullscreen, setFullscreen] = React.useState(false);
  // While the handle is held, the bar follows the pointer and the element's
  // own timeupdate is ignored: seeking is not instant, and letting it win
  // makes the handle jump backwards under the finger dragging it.
  const [scrubbing, setScrubbing] = React.useState(false);

  const progress = duration > 0 ? (current / duration) * 100 : 0;

  function toggle() {
    const el = mediaRef.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => {});
    else el.pause();
  }

  function seekTo(fraction: number) {
    const el = mediaRef.current;
    if (!el || !Number.isFinite(el.duration)) return;
    const next = Math.min(Math.max(fraction, 0), 1) * el.duration;
    el.currentTime = next;
    setCurrent(next);
  }

  function fractionFromEvent(e: React.PointerEvent<HTMLDivElement>): number {
    const rect = e.currentTarget.getBoundingClientRect();
    return rect.width === 0 ? 0 : (e.clientX - rect.left) / rect.width;
  }

  async function toggleFullscreen() {
    const shell = shellRef.current;
    if (!shell) return;
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
    else await shell.requestFullscreen().catch(() => {});
  }

  React.useEffect(() => {
    function onChange() {
      setFullscreen(document.fullscreenElement === shellRef.current);
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const isVideo = kind === "video";

  return (
    <div
      ref={shellRef}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === " " || e.key === "k") {
          e.preventDefault();
          toggle();
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          seekTo((current - 5) / (duration || 1));
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          seekTo((current + 5) / (duration || 1));
        }
      }}
      tabIndex={0}
      className={cn(
        "mx-auto w-full overflow-hidden rounded-lg outline-none",
        isVideo ? "bg-black" : "bg-card",
        className,
      )}
    >
      {isVideo ? (
        <video
          ref={mediaRef as React.RefObject<HTMLVideoElement>}
          src={src}
          autoPlay={autoPlay}
          playsInline
          onClick={toggle}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
          onDurationChange={(e) => setDuration(e.currentTarget.duration)}
          onTimeUpdate={(e) => {
            if (!scrubbing) setCurrent(e.currentTarget.currentTime);
          }}
          onEnded={() => setPlaying(false)}
          className={cn(
            "block w-full cursor-pointer",
            fullscreen ? "h-[calc(100vh-3.5rem)] object-contain" : "max-h-[75vh]",
          )}
        />
      ) : (
        <>
          <audio
            ref={mediaRef as React.RefObject<HTMLAudioElement>}
            src={src}
            autoPlay={autoPlay}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
            onDurationChange={(e) => setDuration(e.currentTarget.duration)}
            onTimeUpdate={(e) => {
              if (!scrubbing) setCurrent(e.currentTarget.currentTime);
            }}
            onEnded={() => setPlaying(false)}
            className="hidden"
          />
          {/* Audio has nothing to look at, and an empty rectangle above a
              transport reads as a video that failed to load. The drawing
              says what it is. */}
          <div className="flex items-center justify-center py-10">
            <FileTypeIllustration kind="audio" className="h-24 w-24" />
          </div>
        </>
      )}

      <div
        className={cn(
          "flex h-14 items-center gap-3 px-3",
          isVideo ? "bg-black/85 text-white" : "border-t border-border bg-card text-foreground",
        )}
      >
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pause" : "Play"}
          className={cn(
            "flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors",
            isVideo ? "hover:bg-white/15" : "hover:bg-muted",
          )}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>

        <span className="shrink-0 text-xs tabular-nums opacity-80">
          {formatTime(current)}
        </span>

        {/* The whole strip is the hit target, not the 4px bar inside it.
            A seek bar you have to aim at is a seek bar people give up on. */}
        <div
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(current)}
          tabIndex={-1}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            setScrubbing(true);
            seekTo(fractionFromEvent(e));
          }}
          onPointerMove={(e) => {
            if (scrubbing) seekTo(fractionFromEvent(e));
          }}
          onPointerUp={(e) => {
            e.currentTarget.releasePointerCapture(e.pointerId);
            setScrubbing(false);
          }}
          className="group/seek flex h-6 min-w-0 flex-1 cursor-pointer items-center"
        >
          <div
            className={cn(
              "relative h-1 w-full rounded-full",
              isVideo ? "bg-white/25" : "bg-muted",
            )}
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-[color:var(--brand-gold)]"
              style={{ width: `${progress}%` }}
            />
            <span
              className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color:var(--brand-gold)] opacity-0 transition-opacity group-hover/seek:opacity-100"
              style={{ left: `${progress}%` }}
            />
          </div>
        </div>

        <span className="shrink-0 text-xs tabular-nums opacity-80">
          {formatTime(duration)}
        </span>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => {
              const el = mediaRef.current;
              if (!el) return;
              el.muted = !el.muted;
              setMuted(el.muted);
            }}
            aria-label={muted ? "Unmute" : "Mute"}
            className={cn(
              "flex h-9 w-9 cursor-pointer items-center justify-center rounded-full transition-colors",
              isVideo ? "hover:bg-white/15" : "hover:bg-muted",
            )}
          >
            {muted || volume === 0 ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </button>
          {/* Native range here on purpose: it is not a form control the
              manager fills in, it is a hardware knob, and every platform
              already has the drag behaviour, the keyboard steps and the
              touch target right. */}
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={muted ? 0 : volume}
            onChange={(e) => {
              const next = Number(e.target.value);
              const el = mediaRef.current;
              setVolume(next);
              setMuted(next === 0);
              if (el) {
                el.volume = next;
                el.muted = next === 0;
              }
            }}
            aria-label="Volume"
            className={cn(
              "hidden h-1 w-16 cursor-pointer appearance-none rounded-full sm:block",
              "[&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none",
              "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[color:var(--brand-gold)]",
              "[&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:border-0",
              "[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[color:var(--brand-gold)]",
              isVideo ? "bg-white/25" : "bg-muted",
            )}
          />
          {isVideo && (
            <button
              type="button"
              onClick={toggleFullscreen}
              aria-label={fullscreen ? "Exit full screen" : "Full screen"}
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full transition-colors hover:bg-white/15"
            >
              {fullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
