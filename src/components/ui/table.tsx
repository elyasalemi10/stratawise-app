"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

// Two named variants — picked by the consumer once on the Table root, not
// row-by-row. Stripe is the default because data-dense ops surfaces (Lots,
// Levies, Reconciliation, Banking) need horizontal tracking. Configuration
// / sparse / mostly-empty tables (Settings rows, OC overviews) want
// bordered, which reads as "key:value list" rather than "data grid".
//
//   striped  — odd rows bg-card, even rows bg-muted, hover bg-secondary-hover,
//              no per-row border, header underline only.
//   bordered — every row bg-card, border-b border-border per row, hover
//              bg-muted (lighter than striped's hover since there's no
//              alternating context to compete with).
//
// The variant propagates from <Table> → <TableRow> via context so callers
// don't have to thread props through.

type TableVariant = "striped" | "bordered";

const TableVariantContext = React.createContext<TableVariant>("striped");

function Table({
  className,
  variant = "striped",
  ...props
}: React.ComponentProps<"table"> & { variant?: TableVariant }) {
  return (
    <TableVariantContext.Provider value={variant}>
      <div data-slot="table-container" className="relative w-full overflow-x-auto">
        <table
          data-slot="table"
          data-variant={variant}
          className={cn("w-full caption-bottom text-base", className)}
          {...props}
        />
      </div>
    </TableVariantContext.Provider>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      // Navy header on top of the striped/bordered body. Reads as a
      // primary surface label (the column names ARE the contract for
      // every row below) instead of a passive muted strip. Children
      // (TableHead) inherit text-primary-foreground via text-inherit.
      // Per CLAUDE.md the labels themselves stay normal-case.
      className={cn("bg-primary text-primary-foreground [&_tr]:border-b [&_tr]:border-border", className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  const variant = React.useContext(TableVariantContext);
  return (
    <tbody
      data-slot="table-body"
      className={cn(
        // Striped — alternating rows. Hover lifts to secondary-hover which
        // is darker than muted (the stripe), so the cursor row is distinct
        // regardless of whether it landed on white or muted.
        variant === "striped" &&
          "[&_tr:nth-child(odd)]:bg-card [&_tr:nth-child(even)]:bg-muted/40 [&_tr:hover]:!bg-secondary-hover",
        // Bordered — flat white rows + per-row underline; hover bumps to
        // muted (works because there's no stripe to compete with).
        variant === "bordered" &&
          "[&_tr]:bg-card [&_tr]:border-b [&_tr]:border-border [&_tr:last-child]:border-0 [&_tr:hover]:bg-muted",
        className,
      )}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t border-border bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className,
      )}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn("h-14 transition-colors duration-150", className)}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        // Normal case (no uppercase). text-inherit so we pick up
        // text-primary-foreground from the navy <TableHeader>; no
        // standalone colour token so a bordered variant on a card-only
        // surface could re-skin the header without rewriting TableHead.
        "h-12 px-4 text-left align-middle text-sm font-medium text-inherit whitespace-nowrap [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-4 align-middle text-base [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
  type TableVariant,
};
