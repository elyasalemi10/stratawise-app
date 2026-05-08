import { Building2, MapPin, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface InviteAcceptContentProps {
  invitation: {
    id: string;
    email: string;
    name: string | null;
    role: string;
    status: string;
    isExpired: boolean;
    subdivision: { id: string; name: string; address: string; plan_number: string } | null;
    lot: { lot_number: number; unit_number: string | null } | null;
  };
}

export function InviteAcceptContent({ invitation }: InviteAcceptContentProps) {
  const lotLabel = invitation.lot
    ? `Lot ${invitation.lot.lot_number}${invitation.lot.unit_number ? ` (Unit ${invitation.lot.unit_number})` : ""}`
    : null;

  return (
    <div className="max-w-md mx-auto py-12 px-4">
      <div className="text-center mb-6">
        <CheckCircle2 className="h-12 w-12 text-[hsl(160,100%,37%)] mx-auto" />
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">
          Thank you{invitation.name ? `, ${invitation.name}` : ""}.
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your invitation has been received.
        </p>
      </div>

      <Card>
        <CardContent className="pt-5 space-y-3">
          {invitation.subdivision && (
            <>
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  {invitation.subdivision.name}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {invitation.subdivision.address}
                </span>
              </div>
            </>
          )}

          {lotLabel && (
            <div className="flex items-center gap-2 border-t border-border pt-3">
              <span className="text-sm text-muted-foreground">Lot:</span>
              <span className="text-sm font-medium text-foreground">{lotLabel}</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
