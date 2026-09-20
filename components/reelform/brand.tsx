import Link from "next/link";
import { AudioLines } from "lucide-react";
export default function Brand() {
  return (
    <Link prefetch={false} className="brand" href="/" aria-label="Reelform home">
      <span className="brand-mark">
        <AudioLines size={24} strokeWidth={2.4} />
      </span>
      reelform<span className="brand-period">.</span>
    </Link>
  );
}
