import { CommunityShare } from "@/components/reelform/community";
import { currentUser } from "@/lib/supabase/server";
export const metadata = { title: "Share your video | Reelform" };
export const dynamic = "force-dynamic";
export default async function SharePage() {
  return <CommunityShare signedIn={!!(await currentUser({ readOnly: true }))} />;
}
