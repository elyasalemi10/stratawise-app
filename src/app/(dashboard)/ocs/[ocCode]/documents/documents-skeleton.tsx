"use client";

import { Search, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  DOCUMENT_DROP_TILE,
  DOCUMENT_GRID,
  DocumentCardSkeleton,
} from "@/components/shared/document-card-skeleton";
import { OCPageTitle } from "@/components/shared/page-title";

// Loading state for the OC documents library.
//
// Mirrors components/shared/document-manager.tsx, which is now a search bar
// over a three-column grid whose first tile is the upload target. All three
// of those are things the app already knows, so they render for real: the
// heading (the OC name comes from the module-scope map, not a fetch), the
// search box, and the drop tile. Only the document cards shimmer, and they
// shimmer in the shape of a card, which is DocumentCardSkeleton: the same
// component the search uses, kept next to the card itself so the two cannot
// drift on preview aspect, padding or row heights.
//
// Owned by DocumentsClient, NOT by loading.tsx. Rendering it from both gave
// two mounts of the same skeleton with a blank gap between them.

const TILES = 5;

export function DocumentsSkeleton() {
  return (
    <div className="space-y-6">
      <OCPageTitle page="Documents" />

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input disabled placeholder="Search documents" className="pl-9" />
      </div>

      <div className={DOCUMENT_GRID}>
        <div className={DOCUMENT_DROP_TILE}>
          <Upload className="h-7 w-7 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Add a document</span>
          <span className="text-xs text-muted-foreground">Drop it here, or click to choose</span>
        </div>

        {Array.from({ length: TILES }).map((_, i) => (
          <DocumentCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
