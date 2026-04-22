import { Badge } from "@/components/ui/badge";
import type { MatchStatus } from "@/lib/validations/reconciliation";

interface MatchStatusBadgeProps {
  status: MatchStatus;
  isVoided?: boolean;
  matchedTotal?: number;
  amount?: number;
}

const STATUS_COPY: Record<MatchStatus, string> = {
  unmatched: "Unmatched",
  auto_matched: "Auto matched",
  manually_matched: "Manually matched",
  excluded: "Excluded",
};

export function MatchStatusBadge({
  status,
  isVoided = false,
  matchedTotal,
  amount,
}: MatchStatusBadgeProps) {
  if (isVoided) {
    return <Badge variant="neutral">Voided</Badge>;
  }

  const isPartial =
    status === "unmatched" &&
    typeof matchedTotal === "number" &&
    typeof amount === "number" &&
    matchedTotal > 0 &&
    matchedTotal < amount;

  if (isPartial) {
    return <Badge variant="warning">Partial match</Badge>;
  }

  switch (status) {
    case "unmatched":
      return <Badge variant="destructive">{STATUS_COPY.unmatched}</Badge>;
    case "auto_matched":
      return <Badge variant="success">{STATUS_COPY.auto_matched}</Badge>;
    case "manually_matched":
      return <Badge variant="success">{STATUS_COPY.manually_matched}</Badge>;
    case "excluded":
      return <Badge variant="neutral">{STATUS_COPY.excluded}</Badge>;
  }
}
