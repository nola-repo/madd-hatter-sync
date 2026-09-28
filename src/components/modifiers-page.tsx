import { PageHeader, EmptyState } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { SlidersHorizontal } from "lucide-react";

export function ModifiersPage() {
    return (
        <div>
            <PageHeader title="Modifier Groups" description="Clover modifier groups and modifiers" />
            <Card>
                <CardContent className="py-16">
                    <EmptyState
                        title="Coming soon"
                        description="Modifier group data is captured during order ingestion and stored in Supabase. A dedicated browser for modifier groups will be added in a future phase."
                    />
                </CardContent>
            </Card>
        </div>
    );
}
