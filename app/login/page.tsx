import { redirect } from "next/navigation";
import { currentUser } from "@/lib/supabase/server";
import { authDestination } from "@/lib/auth-destination";
import AuthScreen from "@/components/reelform/auth-screen";
export const metadata = { title: "Your account | Reelform" };
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const q = await searchParams;
  if ((!q.mode || q.mode === "login" || q.mode === "signup") && !q.error) {
    const user = await currentUser();
    if (user?.email_confirmed_at) redirect(authDestination(q.next));
  }
  return (
    <AuthScreen
      returnTo={authDestination(q.next)}
      initialError={q.error === "google" ? "Google sign-in was cancelled or expired. Please try again." : ""}
      initialMode={
        ["signup", "forgot", "reset"].includes(q.mode || "") ? q.mode! : "login"
      }
    />
  );
}
