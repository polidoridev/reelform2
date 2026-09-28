import { pageMetadata } from "@/lib/seo";
import Account from "@/components/reelform/account";
export const metadata = pageMetadata({ title: "Your account", path: "/account", index: false });
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const q = await searchParams;
  return <Account initialTab={q.tab} />;
}
