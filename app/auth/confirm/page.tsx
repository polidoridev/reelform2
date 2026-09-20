import AuthScreen from "@/components/reelform/auth-screen";
export default async function Confirm({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  return (
    <AuthScreen
      initialMode="verify"
      tokenHash={q.token_hash || ""}
      tokenType={q.type || "email"}
    />
  );
}
