"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, FileText, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { searchDocuments, type DocumentSearchHit } from "@/lib/actions/document-search";

// Global document search. Lives in the header. Postgres FTS-backed; matches
// against file name, category description, and the full OCR'd body of every
// uploaded document. Results dropdown closes on outside-click + Escape.

export function DocumentSearch() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<DocumentSearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  function onInput(v: string) {
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (v.trim().length < 2) {
      setHits([]);
      setLoading(false);
      setOpen(false);
      return;
    }
    setLoading(true);
    setOpen(true);
    debounceRef.current = setTimeout(async () => {
      const res = await searchDocuments(v);
      setHits(res.hits ?? []);
      setLoading(false);
    }, 200);
  }

  return (
    <div ref={wrapperRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search documents…"
          value={query}
          onChange={(e) => onInput(e.target.value)}
          onFocus={() => hits.length > 0 && setOpen(true)}
          className="h-9 pl-8 text-sm"
        />
        {loading && (
          <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[60vh] overflow-y-auto rounded-md border border-border bg-popover shadow-md">
          {loading && hits.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted-foreground">Searching…</p>
          ) : hits.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted-foreground">
              No documents match &ldquo;{query.trim()}&rdquo;. Try different keywords.
            </p>
          ) : (
            <ul className="py-1">
              {hits.map((hit) => (
                <li key={hit.id}>
                  <Link
                    href={hit.oc_short_code ? `/ocs/${hit.oc_short_code}/documents` : "#"}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-start gap-2 px-3 py-2 text-sm hover:bg-muted",
                    )}
                  >
                    <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium text-foreground">{hit.file_name}</p>
                        {hit.oc_name && (
                          <span className="shrink-0 text-xs text-muted-foreground">· {hit.oc_name}</span>
                        )}
                      </div>
                      {hit.snippet && (
                        <p
                          className="mt-0.5 line-clamp-2 text-xs text-muted-foreground"
                          // ts_headline returns sanitised text with <b> tags only.
                          dangerouslySetInnerHTML={{ __html: hit.snippet }}
                        />
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
