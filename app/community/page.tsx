import { pageMetadata } from "@/lib/seo";
import { CommunityGallery } from "@/components/reelform/community";
export const metadata = pageMetadata({
  title: "Community",
  description: "Explore AI-assisted videos shared by Reelform creators. Share your own and keep ownership of your work.",
  path: "/community",
});
export default function CommunityPage() {
  return <CommunityGallery />;
}
