import AuthScreen from "@/components/reelform/auth-screen";
export const metadata = { title: "Your account | Reelform" };
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  return (
    <AuthScreen
      initialMode={
        ["signup", "forgot", "reset"].includes(q.mode || "") ? q.mode! : "login"
      }
    />
  );
}
