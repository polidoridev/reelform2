import { pageMetadata } from "@/lib/seo";
import Pricing from "@/components/reelform/pricing";
export const metadata = pageMetadata({
  title: "Plans & credits",
  description: "Reelform plans start at $19 a month with credits for AI motion transfer and object swaps. Compare Starter, Pro, and Studio, and top up anytime.",
  path: "/pricing",
});
export default function PricingPage() {
  return <Pricing />;
}
