import Account from "@/components/reelform/account";
export const metadata = { title: "Your account | Reelform" };
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const q = await searchParams;
  return <Account initialTab={q.tab} />;
}
