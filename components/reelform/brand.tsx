import { AudioLines } from "lucide-react";
export default function Brand() {
  return (
    <a className="brand" href="/account" aria-label="Reelform dashboard">
      <span className="brand-mark">
        <AudioLines size={24} strokeWidth={2.4} />
      </span>
      reelform<span className="brand-period">.</span>
    </a>
  );
}
