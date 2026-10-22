import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";

export function TableSkeleton({
    rows = 6,
    columns = 5,
    className = "",
}: {
    rows?: number;
    columns?: number;
    className?: string;
}) {
    return (
        <div className={`p-4 space-y-3.5 ${className}`}>
            {/* Header placeholder */}
            <div className="flex items-center justify-between gap-4 pb-2 border-b border-[#1E1E22]">
                {Array.from({ length: columns }).map((_, i) => (
                    <Skeleton key={i} className="h-3.5 w-20 bg-zinc-800/60 rounded" />
                ))}
            </div>
            {/* Row placeholders */}
            {Array.from({ length: rows }).map((_, r) => (
                <div key={r} className="flex items-center justify-between gap-4 py-2 border-b border-[#1A1A1E]/60">
                    {Array.from({ length: columns }).map((_, c) => {
                        // Vary widths naturally
                        const width = c === 0 ? "w-28" : c === 1 ? "w-36" : c === columns - 1 ? "w-16" : "w-20";
                        return <Skeleton key={c} className={`h-4 ${width} bg-zinc-900/90 rounded`} />;
                    })}
                </div>
            ))}
        </div>
    );
}

export function MetricCardsSkeleton({ count = 4 }: { count?: number }) {
    return (
        <div className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-${count}`}>
            {Array.from({ length: count }).map((_, i) => (
                <Card key={i} className="border-[#222226] bg-[#111113]">
                    <CardContent className="p-4 space-y-2">
                        <div className="flex items-center justify-between">
                            <Skeleton className="h-3 w-24 bg-zinc-800/80 rounded" />
                            <Skeleton className="h-4 w-4 bg-zinc-800/80 rounded" />
                        </div>
                        <Skeleton className="h-7 w-28 bg-zinc-800/90 rounded" />
                        <Skeleton className="h-2.5 w-36 bg-zinc-900 rounded" />
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
