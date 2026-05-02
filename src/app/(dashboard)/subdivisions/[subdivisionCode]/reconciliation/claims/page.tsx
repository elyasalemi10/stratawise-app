import { redirect } from "next/navigation";
import { format } from "date-fns";

import { getCurrentProfile } from "@/lib/auth";
import { resolveSubdivisionFromCode } from "@/lib/subdivision-resolver";
import { listPendingPaymentClaims } from "@/lib/actions/owner-payment-claims";
import { OWNER_CLAIM_PAYMENT_METHOD_LABELS } from "@/lib/validations/owner-payment-claims";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const formatCurrency = (n: number) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(n);

export default async function PaymentClaimsQueuePage({
  params,
}: {
  params: Promise<{ subdivisionCode: string }>;
}) {
  const { subdivisionCode } = await params;
  const resolved = await resolveSubdivisionFromCode(subdivisionCode);
  if (!resolved) redirect("/dashboard");
  const subdivisionId = resolved.id;

  const profile = await getCurrentProfile();
  if (!profile) redirect("/sign-in");
  if (profile.role === "lot_owner") redirect(`/subdivisions/${subdivisionCode}`);

  const { rows } = await listPendingPaymentClaims(subdivisionId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Payment claims</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Pending claims submitted by lot owners. Review actions land in PP5-D.
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-sm text-muted-foreground">
                No pending payment claims to review.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {rows.map((claim) => (
                <div key={claim.id} className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-2 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <span className="text-sm font-semibold tabular-nums">
                          {formatCurrency(claim.amount)}
                        </span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-sm font-medium">{claim.owner_display_name}</span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-sm">{claim.lot_label}</span>
                      </div>
                      <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
                        <span>
                          Paid {format(new Date(`${claim.claim_date}T00:00:00`), "d MMM yyyy")}
                        </span>
                        <span>·</span>
                        <span>{OWNER_CLAIM_PAYMENT_METHOD_LABELS[claim.payment_method]}</span>
                        {claim.reference && (
                          <>
                            <span>·</span>
                            <span>Ref: {claim.reference}</span>
                          </>
                        )}
                        <span>·</span>
                        <span>
                          Submitted {format(new Date(claim.created_at), "d MMM yyyy")}
                        </span>
                      </div>
                      {claim.notes && (
                        <div className="text-xs text-muted-foreground italic">
                          {claim.notes}
                        </div>
                      )}
                    </div>
                    <div className="shrink-0">
                      <Badge className="rounded-full bg-amber-100 text-amber-900 hover:bg-amber-100">
                        Pending review
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
