"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Play, Pause } from "lucide-react";
import { normalizeForNarration } from "@/lib/blog/narrate";
import type { NarrationWordTiming } from "@/lib/actions/blog-audio";

// Renders post body HTML and highlights each word as the narration audio
// plays. Words are matched to the timing list by sequence + normalized text
// (robust to minor tokenisation differences); blocks that aren't narrated
// (tables, images, embeds, timelines, code) are skipped so the word sequence
// lines up with what ElevenLabs read.
const SKIP_SELECTOR = "table, pre, code, figure, img, .sw-timeline, [data-youtube-video], [data-type='timeline']";

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
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  // Defend against a scheme-less stored URL ("cdn.…/x.mp3" would resolve
  // relative to the page and 404). New uploads include https:// already.
  const src = /^https?:\/\//i.test(audioUrl) ? audioUrl : `https://${audioUrl}`;

  // Wrap visible words in spans and tag those that matched a timing entry.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    spansRef.current = [];
    let ptr = 0;

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
        if (norm && ptr < words.length && words[ptr].w === norm) {
          span.dataset.i = String(ptr);
          span.className = "sw-word";
          spansRef.current[ptr] = span;
          ptr++;
        }
        frag.appendChild(span);
      }
      tn.parentNode?.replaceChild(frag, tn);
    }
  }, [html, words]);

  const highlight = useCallback((t: number) => {
    // Binary search for the word whose [start,end) contains t.
    let lo = 0, hi = words.length - 1, found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (t < words[mid].start) hi = mid - 1;
      else if (t >= words[mid].end) lo = mid + 1;
      else { found = mid; break; }
    }
    if (found === activeRef.current) return;
    const prev = spansRef.current[activeRef.current];
    if (prev) prev.classList.remove("sw-word-active");
    const next = spansRef.current[found];
    if (next) {
      next.classList.add("sw-word-active");
      next.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
    activeRef.current = found;
  }, [words]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => { setCurrentTime(a.currentTime); highlight(a.currentTime); };
    const onMeta = () => setDuration(Number.isFinite(a.duration) ? a.duration : 0);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnd = () => { setPlaying(false); setCurrentTime(0); highlight(-1); };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("durationchange", onMeta);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onEnd);
    if (a.readyState >= 1) onMeta(); // metadata may already be loaded
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("durationchange", onMeta);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onEnd);
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

  function onSeek(e: React.ChangeEvent<HTMLInputElement>) {
    const a = audioRef.current;
    if (!a) return;
    const t = Number(e.target.value);
    a.currentTime = t;
    setCurrentTime(t);
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
          onChange={onSeek}
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
        className="prose prose-sm max-w-none [&_.sw-word-active]:rounded [&_.sw-word-active]:bg-[color:var(--brand-gold)]/30 [&_.sw-word-active]:text-foreground"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
