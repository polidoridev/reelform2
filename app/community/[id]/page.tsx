import { CommunityGallery } from "@/components/reelform/community";
export const metadata = { title: "A creator’s moment | Reelform community" };
export default async function PostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <CommunityGallery postId={(await params).id} />;
}
