"use client";

import { useState } from "react";
import { FileText, Download, X } from "lucide-react";
import { formatDateLong } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LevyStatusBadge } from "@/components/shared/levy-status-badge";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

interface Levy {
  id: string;
  reference_number: string;
  period_start: string;
  period_end: string;
  amount: number;
  amount_paid: number;
  status: string;
  due_date: string;
  pdf_url: string | null;
  issued_at: string | null;
  reminder_sent?: boolean;
}

export function MyLeviesContent({ levies }: { levies: Levy[] }) {
  const [selectedLevy, setSelectedLevy] = useState<Levy | null>(null);

  const totalLevied = levies.reduce((s, l) => s + (l.amount ?? 0), 0);
  const totalPaid = levies.reduce((s, l) => s + l.amount_paid, 0);
  const outstanding = totalLevied - totalPaid;

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-foreground">My levies</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total levied</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{formatCurrency(totalLevied)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total paid</p>
            <p className="mt-1 text-xl font-bold tabular-nums text-[hsl(160,100%,37%)]">{formatCurrency(totalPaid)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Outstanding</p>
            <p className="mt-1 text-xl font-bold tabular-nums">{formatCurrency(outstanding)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Levies table */}
      {levies.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/30" />
            <p className="mt-4 text-base font-medium text-foreground">No levies issued yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Your levy notices will appear here once issued by your strata manager.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-0 px-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-2.5 text-left">Period</th>
                    <th className="px-4 py-2.5 text-left">Reference</th>
                    <th className="px-4 py-2.5 text-left">Due date</th>
                    <th className="px-4 py-2.5 text-left">Status</th>
                    <th className="px-4 py-2.5 text-right">Amount</th>
                    <th className="px-4 py-2.5 text-right w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {levies.map((levy) => {
                    const remaining = levy.amount - levy.amount_paid;
                    const isPaid = remaining <= 0;
                    return (
                      <tr
                        key={levy.id}
                        onClick={() => setSelectedLevy(levy)}
                        className="border-t border-border/50 cursor-pointer hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-4 py-3 text-foreground">
                          {formatDateLong(levy.period_start)} — {formatDateLong(levy.period_end)}
                        </td>
                        <td className="px-4 py-3 text-foreground font-medium">{levy.reference_number}</td>
                        <td className="px-4 py-3 text-foreground">{formatDateLong(levy.due_date)}</td>
                        <td className="px-4 py-3">
                          <LevyStatusBadge
                            status={levy.status as "draft" | "issued" | "partially_paid" | "paid" | "overdue" | "written_off"}
                            dueDate={levy.due_date}
                            reminderSent={levy.reminder_sent}
                          />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-semibold tabular-nums">{formatCurrency(levy.amount)}</span>
                          {isPaid && <span className="ml-2 text-xs text-[hsl(160,100%,37%)]">Paid</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {levy.pdf_url ? (
                            <a
                              href={levy.pdf_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs cursor-pointer"
                              >
                                View levy
                              </Button>
                            </a>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs cursor-pointer"
                              onClick={(e) => { e.stopPropagation(); setSelectedLevy(levy); }}
                            >
                              Details
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Levy detail popup */}
      <Dialog open={!!selectedLevy} onOpenChange={() => setSelectedLevy(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Levy notice</DialogTitle>
          </DialogHeader>

          {selectedLevy && (() => {
            const remaining = selectedLevy.amount - selectedLevy.amount_paid;
            const isPaid = remaining <= 0;
            return (
              <div className="space-y-4">
                {/* Amount */}
                <div className="text-center py-2">
                  <p className="text-3xl font-bold tabular-nums text-foreground">{formatCurrency(selectedLevy.amount)}</p>
                  {isPaid ? (
                    <p className="text-sm font-medium text-[hsl(160,100%,37%)] mt-1">Paid in full</p>
                  ) : selectedLevy.amount_paid > 0 ? (
                    <p className="text-sm text-destructive mt-1">{formatCurrency(remaining)} remaining</p>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-1">Unpaid</p>
                  )}
                </div>

                {/* Details */}
                <div className="border-t border-border pt-4 space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Reference</span>
                    <span className="text-sm font-medium text-foreground">{selectedLevy.reference_number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Period</span>
                    <span className="text-sm text-foreground">{formatDateLong(selectedLevy.period_start)} — {formatDateLong(selectedLevy.period_end)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Due date</span>
                    <span className="text-sm font-medium text-foreground">{formatDateLong(selectedLevy.due_date)}</span>
                  </div>
                  {selectedLevy.issued_at && (
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Issued</span>
                      <span className="text-sm text-foreground">{formatDateLong(selectedLevy.issued_at)}</span>
                    </div>
                  )}
                  {selectedLevy.amount_paid > 0 && (
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">Paid</span>
                      <span className="text-sm font-medium text-[hsl(160,100%,37%)]">{formatCurrency(selectedLevy.amount_paid)}</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                {selectedLevy.pdf_url && (
                  <div className="border-t border-border pt-4 flex gap-2">
                    <a href={selectedLevy.pdf_url} target="_blank" rel="noopener noreferrer" className="flex-1">
                      <Button variant="default" className="w-full cursor-pointer">
                        View levy
                      </Button>
                    </a>
                    <a href={selectedLevy.pdf_url} download className="flex-1">
                      <Button variant="outline" className="w-full cursor-pointer">
                        <Download className="mr-2 h-4 w-4" />
                        Download
                      </Button>
                    </a>
                  </div>
                )}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
