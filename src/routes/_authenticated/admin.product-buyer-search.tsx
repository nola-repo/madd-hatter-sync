import { createFileRoute } from "@tanstack/react-router";
import { ProductBuyerSearchPage } from "@/components/product-buyer-search-page";

export const Route = createFileRoute("/_authenticated/admin/product-buyer-search")({
  head: () => ({
    meta: [
      { title: "Product Buyer Search — Madd Hatter POS Sync" },
      {
        name: "description",
        content: "Find every customer who purchased a specific product across a custom date range.",
      },
    ],
  }),
  component: ProductBuyerSearchPage,
});
