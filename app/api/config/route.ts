import { currentUser } from "@/lib/supabase/server";
import { isConfigured } from "@/lib/higgsfield";
import { billingEnabled } from "@/lib/commerce/stripe";
import { noStore } from "@/lib/http";
export async function GET() {
  return noStore({
    ready: isConfigured(),
    authenticated: !!(await currentUser()),
    model: "Seedance 2.5",
    billingReady: billingEnabled(),
  });
}
