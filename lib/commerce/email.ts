import { Resend } from "resend";
import { admin, checked } from "@/lib/supabase/server";
import { appUrl } from "@/lib/http";
import { seal, unseal } from "./seal";
export const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function emailFrame(
  title: string,
  body: string,
  button: string,
  url: string,
  footer: string,
) {
  return `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head><body style="margin:0;background:#f3faf9;font-family:Arial,sans-serif;color:#123633"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px"><table role="presentation" width="560" style="width:100%;max-width:560px;background:#fff;border:1px solid #dceeea;border-radius:24px" cellpadding="0" cellspacing="0"><tr><td style="padding:40px"><div style="font-size:28px;font-weight:700;letter-spacing:-1.5px">reelform<span style="color:#0abab5">.</span></div><div style="height:4px;background:#0abab5;margin:28px 0"></div><h1 style="font-size:30px;line-height:1.15;letter-spacing:-1px">${escapeHtml(title)}</h1><div style="font-size:16px;line-height:1.7;color:#4c6460">${body}</div>${button ? `<p style="margin:30px 0"><a href="${escapeHtml(url)}" style="display:inline-block;background:#0abab5;color:#062b28;padding:16px 24px;border-radius:12px;font-size:15px;font-weight:bold;text-decoration:none">${escapeHtml(button)} &rarr;</a></p>` : ""}<p style="font-size:12px;line-height:1.7;color:#637a76;border-top:1px solid #e1eeeb;padding-top:24px">${footer}</p></td></tr></table></td></tr></table></body></html>`;
}
export const journeys = {
  welcome: {
    subject: "Your next reality starts here",
    title: "Make yourself the main character.",
    body: "<p>Welcome to Reelform. Bring a short clip of yourself, a few reference photos, and a scene you can’t stop imagining.</p><p>A driveway becomes a coastal villa. Your everyday outfit becomes a tailored suit. Your movements stay the starting point.</p><p>Start with a clear, well-lit 4–10 second clip. You’ll see the exact credit cost before you create.</p>",
    button: "Explore the studio",
  },
  first_scene: {
    subject: "One small trick for a more believable transformation",
    title: "The details make it real.",
    body: "<p>Choose reference photos with a similar camera angle and lighting to your source clip. Then describe the outfit, setting, and one key action.</p><p>Try: “Keep my walking motion. Put me in a cream linen suit, arriving at a quiet waterfront villa at golden hour.”</p><p>Start simple. Build your next reality one scene at a time.</p>",
    button: "Create your first scene",
  },
  inspiration: {
    subject: "Where will you go next?",
    title: "A new scene is waiting.",
    body: "<p>A morning on the Amalfi Coast. A slow walk through a modern mansion. Sunset on the deck of a yacht.</p><p>Give your everyday footage a different destination. Bring references that capture the place, the light, and the feeling you want.</p>",
    button: "Find your next scene",
  },
} as const;
export type Journey = keyof typeof journeys;
export function unsubscribeToken(user: string) {
  return seal({
    user,
    kind: "unsubscribe",
    exp: Date.now() + 100 * 365 * 86400000,
  });
}
export async function unsubscribe(token: string) {
  const p = unseal(token);
  if (p.kind !== "unsubscribe" || typeof p.user !== "string")
    throw new Error("Invalid link");
  await checked(
    admin()
      .from("rf_accounts")
      .update({
        marketing_opt_in: false,
        marketing_unsubscribed_at: new Date().toISOString(),
      })
      .eq("user_id", p.user),
  );
}
export async function sendJourney(userId: string, kind: Journey) {
  if (
    process.env.MARKETING_ENABLED !== "true" ||
    !process.env.RESEND_API_KEY ||
    !process.env.MARKETING_POSTAL_ADDRESS ||
    process.env.EMAIL_DOMAIN_VERIFIED !== "true"
  )
    return false;
  const db = admin();
  const { data: a } = await checked(
    db.from("rf_accounts").select("*").eq("user_id", userId).single(),
  );
  if (!a.marketing_opt_in || a.email_suppressed) return false;
  const dedupe = `${kind}:v1:${a.user_id}`;
  // Claim once before sending. An uncertain delivery is reviewed, never resent
  // after Resend's 24-hour idempotency window.
  const claim = await db
    .from("rf_email_log")
    .insert({ user_id: a.user_id, kind, dedupe_key: dedupe })
    .select("id")
    .single();
  if (claim.error?.code === "23505") return false;
  if (claim.error) throw claim.error;
  const item = journeys[kind],
    url = `${appUrl()}/studio`,
    token = unsubscribeToken(a.user_id),
    unsub = `${appUrl()}/unsubscribe?token=${encodeURIComponent(token)}`;
  const footer = `You’re receiving this because you opted into Reelform emails.<br>Reelform · ${escapeHtml(process.env.MARKETING_POSTAL_ADDRESS)}<br><a href="${escapeHtml(unsub)}" style="color:#356b64">Unsubscribe</a> · <a href="${appUrl()}/account?tab=settings" style="color:#356b64">Email preferences</a><br>Questions? admin@polidori.dev`;
  const greeting = a.full_name
    ? `<p>Hi ${escapeHtml(a.full_name.split(" ")[0])},</p>`
    : "";
  try {
    const result = await new Resend(process.env.RESEND_API_KEY).emails.send(
      {
        from: process.env.EMAIL_FROM || "Reelform <admin@polidori.dev>",
        replyTo: process.env.EMAIL_REPLY_TO || "admin@polidori.dev",
        to: a.email,
        subject: item.subject,
        html: emailFrame(
          item.title,
          greeting + item.body,
          item.button,
          url,
          footer,
        ),
        text: `${item.title}\n\n${item.body.replace(/<[^>]*>/g, "\n")}\n${url}\n\nReelform · ${process.env.MARKETING_POSTAL_ADDRESS}\nUnsubscribe: ${unsub}`,
        headers: {
          "List-Unsubscribe": `<${appUrl()}/api/email/unsubscribe?token=${encodeURIComponent(token)}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      },
      { idempotencyKey: dedupe },
    );
    await checked(
      db
        .from("rf_email_log")
        .update({
          status: result.error ? "failed" : "sent",
          provider_id: result.data?.id || null,
        })
        .eq("id", claim.data.id),
    );
    return !result.error;
  } catch {
    await checked(
      db
        .from("rf_email_log")
        .update({ status: "unknown" })
        .eq("id", claim.data.id),
    );
    return false;
  }
}
