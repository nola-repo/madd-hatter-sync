// Synced Contacts tab: confidently matched + tagged CRM contacts.
import { CheckCircle2, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/page-header";
import { formatDateTime } from "@/lib/integration/format";
import { crmContactUrl } from "./shared";

export type SyncedContactRow = {
  customerName: string;
  email: string | null;
  phone: string | null;
  ghlContactId: string;
  matchMethod: string | null;
  tagsApplied: number;
  tagsVerified: number;
  verifiedAt: string | null;
};

export function SyncedContactsTab({ rows, total }: { rows: SyncedContactRow[]; total: number }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CheckCircle2 className="h-4 w-4" /> Synced Contacts ({total})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyState
            title="No synced contacts yet"
            description="Confidently matched CRM contacts with applied purchase tags will appear here after the automatic sync runs."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Customer</th>
                  <th className="pb-2 pr-4 font-medium">Email / Phone</th>
                  <th className="pb-2 pr-4 font-medium">CRM Contact</th>
                  <th className="pb-2 pr-4 font-medium">Match Method</th>
                  <th className="pb-2 pr-4 font-medium">Tags Applied</th>
                  <th className="pb-2 pr-4 font-medium">Tags Verified</th>
                  <th className="pb-2 font-medium">Verified At</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-2.5 pr-4 font-medium text-foreground">{c.customerName}</td>
                    <td className="py-2.5 pr-4 text-xs text-muted-foreground">
                      {c.email || c.phone || "—"}
                    </td>
                    <td className="py-2.5 pr-4">
                      <a
                        href={crmContactUrl(c.ghlContactId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        {c.ghlContactId.slice(0, 8)}…
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-muted-foreground">{c.matchMethod}</td>
                    <td className="py-2.5 pr-4">{c.tagsApplied}</td>
                    <td className="py-2.5 pr-4">
                      {c.tagsVerified > 0 ? (
                        <Badge variant="default" className="text-[10px]">
                          {c.tagsVerified} verified
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-muted-foreground">
                      {c.verifiedAt ? formatDateTime(new Date(c.verifiedAt).getTime()) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
