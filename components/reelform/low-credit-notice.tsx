import Link from "next/link";
import { CircleAlert } from "lucide-react";
import { creditNotice } from "@/lib/commerce/credit-notice";
import "./low-credit-notice.css";

export default function LowCreditNotice({ balance, plan, isAdmin = false }: {
  balance: number | null;
  plan: string;
  isAdmin?: boolean;
}) {
  const notice = creditNotice(balance, plan, isAdmin);
  return <div role="status" aria-live="polite" aria-atomic="true">
    {notice && <div className="low-credit-notice">
      <CircleAlert size={18} aria-hidden="true" />
      <div><strong>{notice.title}</strong><p>{notice.detail}</p></div>
      <Link prefetch={false} href="/account?tab=credits">Manage credits <span aria-hidden="true">↗</span></Link>
    </div>}
  </div>;
}
