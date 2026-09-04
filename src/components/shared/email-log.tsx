"use client";

import { useEffect, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight, Download, Paperclip } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  EMAIL_STATUS_LABEL,
  EMAIL_STATUS_TONE,
  emailTypeLabel,
  type EmailLogPage,
} from "@/lib/email-log-shared";

// The email log, shared by the OC view and the personal one. Same question in
// both cases , what went out, to whom, and did it arrive , so the same table.
//
// Status is the PROVIDER's word, updated by the Resend webhook after we hand
// the message over, which is why "Sent" and "Delivered" are different things
// here and why "Bounced" is worth a red badge: it is the only signal that an
// owner never got their notice.

const COLUMNS = ["Sent", "To", "Subject", "Type", "Attachment", "Status"];

function formatWhen(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function EmailLog({
  load,
  /** Shown per row when the log spans more than one OC. */
  showOC = false,
  emptyDescription,
}: {
  load: (page: number) => Promise<EmailLogPage>;
  showOC?: boolean;
  emptyDescription: string;
}) {
  const [data, setData] = useState<EmailLogPage | null>(null);
  const [page, setPage] = useState(0);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    load(page)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        console.error("[email-log] load failed:", err);
        if (!cancelled) setData({ rows: [], total: 0, page, pageSize: 25 });
      });
    return () => {
      cancelled = true;
    };
  }, [load, page]);

  const columns = showOC ? [...COLUMNS.slice(0, 2), "Owners Corporation", ...COLUMNS.slice(2)] : COLUMNS;

  if (!data) {
    return (
      <div className="overflow-hidden rounded-md border border-border bg-card">
        <Table variant="striped">
          <TableHeader>
            <TableRow>
              {columns.map((c) => (
                <TableHead key={c}>{c}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, r) => (
              <TableRow key={r}>
                {columns.map((c) => (
                  <TableCell key={c}>
                    <Skeleton className="h-4 w-24" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }

  if (data.total === 0) {
    return (
      <EmptyState
        illustration="inbox"
        title="Nothing sent yet"
        description={emptyDescription}
        card={false}
      />
    );
  }

  const lastPage = Math.max(0, Math.ceil(data.total / data.pageSize) - 1);
  const from = data.page * data.pageSize + 1;
  const to = Math.min(data.total, from + data.rows.length - 1);

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-md border border-border bg-card">
        <div className="overflow-x-auto">
          <Table variant="striped">
            <TableHeader>
              <TableRow>
                {columns.map((c) => (
                  <TableHead key={c}>{c}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-foreground">
                    {formatWhen(row.sentAt)}
                  </TableCell>
                  <TableCell className="text-foreground">
                    {row.recipientEmail}
                    {row.lotLabel && (
                      <span className="block text-xs text-muted-foreground">{row.lotLabel}</span>
                    )}
                  </TableCell>
                  {showOC && (
                    <TableCell className="text-foreground">{row.ocName}</TableCell>
                  )}
                  <TableCell className="max-w-xs truncate text-foreground">
                    {row.subject}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-foreground">
                    {emailTypeLabel(row.type)}
                  </TableCell>
                  <TableCell>
                    {row.attachments.length === 0 ? null : (
                      <div className="flex flex-col gap-1">
                        {row.attachments.map((a) => (
                          <a
                            key={a.href}
                            href={a.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                          >
                            <Paperclip className="h-3.5 w-3.5" />
                            {a.label}
                            <Download className="h-3 w-3" />
                          </a>
                        ))}
                      </div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={EMAIL_STATUS_TONE[row.status]}>
                      {EMAIL_STATUS_LABEL[row.status]}
                    </Badge>
                    {row.errorMessage && (
                      <span className="mt-1 block max-w-[16rem] truncate text-xs text-muted-foreground">
                        {row.errorMessage}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Only when there is more than one page: a pager under a short list is
          a control that does nothing. */}
      {lastPage > 0 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground tabular-nums">
            {from} to {to} of {data.total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={data.page === 0 || pending}
              onClick={() => startTransition(() => setPage((p) => Math.max(0, p - 1)))}
            >
              <ChevronLeft className="mr-1 h-3.5 w-3.5" />
              Previous
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={data.page >= lastPage || pending}
              onClick={() => startTransition(() => setPage((p) => Math.min(lastPage, p + 1)))}
            >
              Next
              <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
