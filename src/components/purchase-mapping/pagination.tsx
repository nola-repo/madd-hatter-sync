// Shared 15-per-page pagination for Purchase Mapping tabs.
// Pure client-side slicing of already-fetched rows — no fetch changes.
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const PAGE_SIZE = 15;

/**
 * Slice `rows` into 15-per-page pages. Pass `deps` to reset to page 1
 * whenever the underlying data identity changes (tab open, new search).
 */
export function usePagination<T>(rows: T[], deps: unknown[] = []) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  // Clamp page if the row set shrinks below the current page.
  useEffect(() => {
    if (page > totalPages) setPage(1);
  }, [totalPages, page]);

  // Reset to page 1 whenever deps change (new data identity).
  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const pagedRows = useMemo(
    () => rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [rows, page],
  );

  return { page, setPage, totalPages, pagedRows, total: rows.length };
}

export function Pager({
  page,
  totalPages,
  setPage,
  total,
}: {
  page: number;
  totalPages: number;
  setPage: (p: number) => void;
  total: number;
}) {
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between pt-3">
      <span className="text-xs text-muted-foreground">
        Page {page} of {totalPages} · {total} records
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft className="h-4 w-4" /> Prev
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          disabled={page >= totalPages}
          onClick={() => setPage(page + 1)}
        >
          Next <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
