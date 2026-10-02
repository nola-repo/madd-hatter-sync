// Review Queue tab: ambiguous / conflicting / held mappings awaiting a decision.
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/page-header";
import { STATUS_COLORS } from "./shared";
import { Pager, usePagination } from "./pagination";

export type ReviewQueueRow = {
  customerName: string;
  email: string | null;
  phone: string | null;
  matchStatus: string;
  reason: string | null;
};

export function ReviewQueueTab({ rows }: { rows: ReviewQueueRow[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4" /> Needs Review ({rows.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            title="No items need review"
            description="Ambiguous identifiers and conflicts will appear here. Customers without identifiers are skipped automatically."
          />
        ) : (
          <ReviewTable rows={rows} />
        )}
      </CardContent>
    </Card>
  );
}

function ReviewTable({ rows }: { rows: ReviewQueueRow[] }) {
  const { page, setPage, totalPages, pagedRows, total } = usePagination(rows);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th className="pb-2 pr-4 font-medium">Customer</th>
            <th className="pb-2 pr-4 font-medium">Email / Phone</th>
            <th className="pb-2 pr-4 font-medium">Status</th>
            <th className="pb-2 font-medium">Reason</th>
          </tr>
        </thead>
        <tbody>
          {pagedRows.map((r, i) => (
            <tr key={i} className="border-b border-border/50">
              <td className="py-2.5 pr-4 font-medium text-foreground">{r.customerName}</td>
              <td className="py-2.5 pr-4 text-xs text-muted-foreground">
                {r.email || r.phone || "—"}
              </td>
              <td className="py-2.5 pr-4">
                <Badge
                  variant={(STATUS_COLORS[r.matchStatus] as any) ?? "outline"}
                  className="text-[10px]"
                >
                  {r.matchStatus}
                </Badge>
              </td>
              <td className="py-2.5 text-xs text-muted-foreground">{r.reason}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pager page={page} totalPages={totalPages} setPage={setPage} total={total} />
    </div>
  );
}
