import { loadLearnedProductsPageData } from "@/app/_lib/page-data";
import { DataUnavailable } from "@/components/data-unavailable";
import { LearnedProducts } from "@/components/learned-products";

export default async function LearnedProductsPage() {
  const { dataError, learnedProducts } = await loadLearnedProductsPageData();

  if (dataError || !learnedProducts) {
    return <DataUnavailable eyebrow="Learned products" retryHref="/learned" />;
  }

  return <LearnedProducts initialLearnedProducts={learnedProducts} />;
}
