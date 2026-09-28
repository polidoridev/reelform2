import { pageMetadata } from "@/lib/seo";
import { CommunityShare } from "@/components/reelform/community";
import { currentUser } from "@/lib/supabase/server";
export const metadata = pageMetadata({ title: "Share your video", path: "/community/share", index: false });
export const dynamic = "force-dynamic";
export default async function SharePage() {
  return <CommunityShare signedIn={!!(await currentUser({ readOnly: true }))} />;
}
