import AuraEditor from "@/components/reelform/aura-editor";
import { pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Aura edits",
  description: "Turn your clips into an aura edit. Choose a style and soundtrack, then export a finished MP4.",
  path: "/aura",
});

export default function AuraPage() { return <AuraEditor />; }
