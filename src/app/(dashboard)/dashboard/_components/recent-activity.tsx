"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from "@/components/ui/table";

const activities = [
  { id: 1, subdivision: "Harbour View Towers", action: "Levy issued", reference: "MSM-LEV-2026-000142", status: "Issued", date: "19 Mar 2026" },
  { id: 2, subdivision: "Riverside Gardens", action: "Payment received", reference: "MSM-PAY-2026-000089", status: "Paid", date: "18 Mar 2026" },
  { id: 3, subdivision: "Carlton Residences", action: "Meeting notice sent", reference: "MSM-MTG-2026-000023", status: "Sent", date: "17 Mar 2026" },
  { id: 4, subdivision: "Docklands Quarter", action: "Levy overdue", reference: "MSM-LEV-2026-000098", status: "Overdue", date: "15 Mar 2026" },
  { id: 5, subdivision: "South Yarra Place", action: "Subdivision created", reference: "—", status: "Active", date: "14 Mar 2026" },
];

const statusVariant: Record<string, "success" | "destructive" | "info" | "neutral"> = {
  Paid: "success",
  Active: "success",
  Issued: "info",
  Sent: "info",
  Overdue: "destructive",
  Draft: "neutral",
};

export function RecentActivity() {
  return (
    <Card>
      <CardHeader className="border-b-0 px-5 pt-5 pb-0">
        <CardTitle className="text-base font-semibold normal-case tracking-normal">
          Recent activity
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0 pb-0 pt-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subdivision</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {activities.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="font-medium">{a.subdivision}</TableCell>
                <TableCell className="text-muted-foreground">{a.action}</TableCell>
                <TableCell className="text-muted-foreground font-mono text-xs">{a.reference}</TableCell>
                <TableCell>
                  <Badge variant={statusVariant[a.status] ?? "neutral"}>
                    {a.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right text-muted-foreground">{a.date}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
