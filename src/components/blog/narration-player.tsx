"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Play, Pause } from "lucide-react";
import { normalizeForNarration } from "@/lib/blog/narrate";
import type { NarrationWordTiming } from "@/lib/actions/blog-audio";

// Admin preview of the post narration. Mirrors the marketing-site
// NarrationPlayer (position-map matching, rAF polling, inline-style
// highlight) so the preview looks and behaves exactly like what readers get.
const SKIP_SELECTOR =
  "table, pre, code, figure, img, .sw-timeline, [data-youtube-video], [data-type='timeline']";

const HIGHLIGHT_STYLE =
  "background:rgba(207,167,83,0.35) !important;border-radius:3px;padding:0 1px;";

function fmtTime(s: number): string {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function NarrationPlayer({
  html,
  audioUrl,
  words,
}: {
  html: string;
  audioUrl: string;
  words: NarrationWordTiming[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const spansRef = useRef<HTMLElement[]>([]);
  const activeRef = useRef<number>(-1);
  const rafRef = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const src = /^https?:\/\//i.test(audioUrl) ? audioUrl : `https://${audioUrl}`;

  useEffect(() => {
    const root = containerRef.current;
    if (!root || !words.length) return;
    spansRef.current = new Array(words.length);

    const posByWord = new Map<string, number[]>();
    for (let i = 0; i < words.length; i++) {
      const w = words[i].w;
      const arr = posByWord.get(w);
      if (arr) arr.push(i);
      else posByWord.set(w, [i]);
    }
    const cursorByWord = new Map<string, number>();
    posByWord.forEach((_, k) => cursorByWord.set(k, 0));

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        if ((node.parentElement as HTMLElement | null)?.closest(SKIP_SELECTOR)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const textNodes: Text[] = [];
    let n: Node | null;
    while ((n = walker.nextNode())) textNodes.push(n as Text);

    let highWater = -1;
    for (const tn of textNodes) {
      const parts = (tn.nodeValue ?? "").split(/(\s+)/);
      const frag = document.createDocumentFragment();
      for (const part of parts) {
        if (!part) continue;
        if (/^\s+$/.test(part)) {
          frag.appendChild(document.createTextNode(part));
          continue;
        }
        const norm = normalizeForNarration(part);
        const span = document.createElement("span");
        span.textContent = part;
        if (norm) {
          const positions = posByWord.get(norm);
          if (positions) {
            const cursor = cursorByWord.get(norm) ?? 0;
            let pick = -1;
            for (let k = cursor; k < positions.length; k++) {
              if (positions[k] > highWater) { pick = k; break; }
            }
            if (pick !== -1) {
              const idx = positions[pick];
              span.dataset.i = String(idx);
              span.className = "sw-word";
              spansRef.current[idx] = span;
              cursorByWord.set(norm, pick + 1);
              highWater = idx;
            }
          }
        }
        frag.appendChild(span);
      }
      tn.parentNode?.replaceChild(frag, tn);
    }

    if (process.env.NODE_ENV !== "production") {
      const matched = spansRef.current.filter(Boolean).length;
      // eslint-disable-next-line no-console
      console.info(`[NarrationPlayer admin preview] matched ${matched} / ${words.length} words`);
    }
  }, [html, words]);

  const highlight = useCallback((t: number) => {
    if (!words.length) return;
    let lo = 0, hi = words.length - 1, found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (t < words[mid].start) hi = mid - 1;
      else if (t >= words[mid].end) lo = mid + 1;
      else { found = mid; break; }
    }
    if (found === -1 && t > 0 && lo > 0) found = lo - 1;
    if (found === activeRef.current) return;
    const prev = spansRef.current[activeRef.current];
    if (prev) prev.removeAttribute("style");
    const next = spansRef.current[found];
    if (next) {
      next.setAttribute("style", HIGHLIGHT_STYLE);
      next.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    activeRef.current = found;
  }, [words]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    function pump() {
      if (!a) return;
      const t = a.currentTime;
      setCurrentTime(t);
      highlight(t);
      if (!a.paused && !a.ended) {
        rafRef.current = requestAnimationFrame(pump);
      }
    }
    const onPlay = () => {
      setPlaying(true);
      if (rafRef.current == null) rafRef.current = requestAnimationFrame(pump);
    };
    const onPause = () => {
      setPlaying(false);
      if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    };
    const onEnd = () => {
      setPlaying(false);
      setCurrentTime(0);
      const prev = spansRef.current[activeRef.current];
      if (prev) prev.removeAttribute("style");
      activeRef.current = -1;
      if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    };
    const onMeta = () => setDuration(Number.isFinite(a.duration) ? a.duration : 0);
    const onSeek = () => highlight(a.currentTime);

    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("durationchange", onMeta);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onEnd);
    a.addEventListener("seeked", onSeek);
    if (a.readyState >= 1) onMeta();
    return () => {
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("durationchange", onMeta);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onEnd);
      a.removeEventListener("seeked", onSeek);
      if (rafRef.current != null) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    };
  }, [highlight]);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      a.play().catch((err) => console.error("Narration playback failed", err));
    } else {
      a.pause();
    }
  }

  function onSeekInput(e: React.ChangeEvent<HTMLInputElement>) {
    const a = audioRef.current;
    if (!a) return;
    const t = Number(e.target.value);
    a.currentTime = t;
    setCurrentTime(t);
    highlight(t);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-md border border-border bg-card p-3">
        <button
          type="button"
          onClick={toggle}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground cursor-pointer"
          aria-label={playing ? "Pause" : "Play narration"}
        >
          {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 translate-x-0.5" />}
        </button>
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={Math.min(currentTime, duration || 0)}
          onChange={onSeekInput}
          aria-label="Seek"
          className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-[color:var(--brand-gold)]"
        />
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {fmtTime(currentTime)} / {fmtTime(duration)}
        </span>
        <audio ref={audioRef} src={src} className="hidden" preload="metadata" />
      </div>
      <div
        ref={containerRef}
        className="prose prose-sm max-w-none"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
