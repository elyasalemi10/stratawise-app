"use client";

import { useCallback } from "react";
import { useCachedData } from "@/lib/use-cached-data";
import { DocumentManager } from "@/components/shared/document-manager";
import { getDocumentsPageData, type DocumentsPageData } from "./data";
import DocumentsLoading from "./loading";

// Client half of the documents library. Returning to this page paints the
// previous document list, INCLUDING an empty one, straight out of the tab
// cache. "No documents yet" is a real answer and gets cached like any other,
// so a second visit shows it immediately with the bar running rather than
// flashing skeletons at a question it has already answered.

export function DocumentsClient({ ocId, pathname }: { ocId: string; pathname: string }) {
  const fetcher = useCallback(() => getDocumentsPageData(ocId), [ocId]);
  const { data, loading } = useCachedData<DocumentsPageData>(
    `documents:${ocId}`,
    fetcher,
    { pathname },
  );

  if (loading || !data) return <DocumentsLoading />;

  return (
    <div className="space-y-6">
      <DocumentManager
        ocId={ocId}
        initialDocuments={data.documents as never}
        readOnly={data.readOnly}
      />
    </div>
  );
}
