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
      returnTo={q.next === "/community/share" || q.next === "/studio" ? q.next : undefined}
      initialError={q.error === "google" ? "Google sign-in was cancelled or expired. Please try again." : ""}
      initialMode={
        ["signup", "forgot", "reset"].includes(q.mode || "") ? q.mode! : "login"
      }
    />
  );
}
