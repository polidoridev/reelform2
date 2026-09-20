import { Webhook } from "svix";
import { admin, checked } from "@/lib/supabase/server";
export async function POST(request: Request) {
  if (!process.env.RESEND_WEBHOOK_SECRET)
    return new Response("Not configured", { status: 503 });
  let event: { type: string; data: { email_id?: string; to?: string[] } };
  try {
    const raw = await request.text();
    new Webhook(process.env.RESEND_WEBHOOK_SECRET).verify(raw, {
      "svix-id": request.headers.get("svix-id") || "",
      "svix-timestamp": request.headers.get("svix-timestamp") || "",
      "svix-signature": request.headers.get("svix-signature") || "",
    });
    event = JSON.parse(raw);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  try {
    if (
      ["email.bounced", "email.complained", "email.suppressed"].includes(
        event.type,
      )
    ) {
      const addresses = (event.data.to || [])
        .filter((v) => typeof v === "string")
        .map((v) => v.toLowerCase());
      for (const email of addresses)
        await checked(
          admin()
            .from("rf_accounts")
            .update({
              email_suppressed: true,
              marketing_opt_in: false,
              marketing_unsubscribed_at: new Date().toISOString(),
            })
            .ilike("email", email.replace(/[%_]/g, "\\$&")),
        );
    }
    if (event.data.email_id)
      await checked(
        admin()
          .from("rf_email_log")
          .update({ status: event.type.replace("email.", "") })
          .eq("provider_id", event.data.email_id),
      );
    return Response.json({ received: true });
  } catch {
    return new Response("Try again", { status: 500 });
  }
}
