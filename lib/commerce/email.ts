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
    subject: "Your next video starts here",
    title: "Your footage. New possibilities.",
    body: "<p>Welcome to Reelform. Bring a short video and a reference photo, then choose what you want to change.</p><p>Use Genjutsu Motion Transfer to guide a character with a performance, or Object Swap to try a different product, fixture, or prop in your footage.</p><p>Start with a clear, well-lit 4-10 second clip. You’ll see the exact credit cost before you create.</p>",
    button: "Explore the studio",
  },
  first_scene: {
    subject: "Start with one clear change",
    title: "Give your edit a strong reference.",
    body: "<p>Choose a reference photo with a clear subject. Similar angles and lighting can help you describe the result you want.</p><p>Try: “Replace the chair in this video with the chair in my reference photo. Match the lighting and keep the surrounding room consistent.”</p><p>Preview the result, then refine your prompt or reference for your next iteration.</p>",
    button: "Create your first edit",
  },
  inspiration: {
    subject: "One clip. What else could it become?",
    title: "Find your next use for Reelform.",
    body: "<p>A dance performed by your character. A fixture concept in a site walkthrough. A new product in an existing shot.</p><p>Explore motion transfer and object swaps for your next post, client conversation, or creative experiment.</p>",
    button: "Find your next idea",
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
