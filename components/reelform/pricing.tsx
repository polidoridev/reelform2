"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowUpRight, Check, ArrowLeft, Sparkles } from "lucide-react";
import type { ApiResult } from "@/lib/commerce/types";
import Brand from "./brand";
import { PLANS, TOPUPS, money } from "@/lib/commerce/pricing";
import "./accounts.css";
export function PlanCards({
  compact = false,
  subscribed = false,
  renewDate,
}: {
  compact?: boolean;
  subscribed?: boolean;
  renewDate?: string;
}) {
  const [yearly, setYearly] = useState(false),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [review, setReview] = useState<string | null>(null);
  async function choose(plan: string, confirmed = false) {
    if (subscribed && !confirmed) {
      setReview(plan);
      return;
    }
    setBusy(plan);
    setError("");
    try {
      const r = await fetch(
        subscribed ? "/api/billing/change-plan" : "/api/billing/subscribe",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plan,
            cadence: yearly ? "year" : "month",
            requestId: crypto.randomUUID(),
          }),
        },
      );
      const d = (await r.json()) as ApiResult;
      if (r.status === 401) {
        window.location.assign("/login?mode=signup");
        return;
      }
      if (!r.ok) throw new Error(d.error);
      if (d.url) window.location.assign(d.url);
      else window.location.assign("/account?tab=billing");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  return (
    <>
      {review && (
        <div
          className="account-card"
          role="dialog"
          aria-modal="true"
          aria-label="Review plan change"
        >
          <h2>Change your next chapter.</h2>
          <p>
            Switch to {PLANS.find((p) => p.id === review)?.name} for{" "}
            {money(
              yearly
                ? PLANS.find((p) => p.id === review)!.yearly
                : PLANS.find((p) => p.id === review)!.monthly,
            )}{" "}
            / {yearly ? "year" : "month"}, starting{" "}
            {renewDate
              ? new Date(renewDate).toLocaleDateString()
              : "at your next renewal"}
            . Your current plan and credits stay available through the paid
            period. No charge today.
          </p>
          <div className="settings-grid">
            <button
              className="account-primary"
              disabled={!!busy}
              onClick={() => choose(review, true)}
            >
              Confirm plan change
            </button>
            <button
              className="account-secondary"
              onClick={() => setReview(null)}
            >
              Keep my current plan
            </button>
          </div>
        </div>
      )}
      <div className="billing-toggle" aria-label="Billing period">
        <button aria-pressed={!yearly} onClick={() => setYearly(false)}>
          Monthly
        </button>
        <button aria-pressed={yearly} onClick={() => setYearly(true)}>
          Yearly <span>2 months free</span>
        </button>
      </div>
      {error && (
        <div className="account-error" role="alert">
          {error}
          <button
            className="quiet-link"
            onClick={async () => {
              try {
                const r = await fetch("/api/billing/cancel-checkout", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: "{}",
                });
                if (r.ok)
                  setError(
                    "Pending checkout cancelled. Choose your plan again.",
                  );
              } catch {}
            }}
          >
            Cancel pending checkout
          </button>
        </div>
      )}
      <div className={`plan-grid ${compact ? "compact" : ""}`}>
        {PLANS.map((p) => (
          <article
            className={`plan-card ${p.id === "pro" ? "recommended" : ""}`}
            key={p.id}
          >
            {p.id === "pro" && (
              <span className="plan-badge">THE SWEET SPOT</span>
            )}
            <span className="account-eyebrow">{p.name}</span>
            <h3>
              {money(yearly ? p.yearly / 12 : p.monthly)}
              <small>/ month</small>
            </h3>
            <p className="billing-caption">
              {yearly
                ? `${money(p.yearly)} charged yearly`
                : "Billed monthly · cancel anytime"}
            </p>
            <p>{p.tagline}</p>
            <div className="plan-credit">
              <Sparkles size={17} />
              <strong>{p.credits.toLocaleString()}</strong> credits / month
            </div>
            <ul>
              <li>
                <Check />
                Clips up to {p.maxSeconds} seconds
              </li>
              <li>
                <Check />
                {p.fullHd ? "Up to 1080p Full HD" : "480p and 720p HD"}
              </li>
              <li>
                <Check />
                {p.concurrency === 1
                  ? "1 video at a time"
                  : `${p.concurrency} videos at a time`}
              </li>
              <li><Check />Up to {p.maxImages} reference photo{p.maxImages === 1 ? "" : "s"} per video</li>
              <li><Check />{p.generatedAudio ? "AI-generated audio on supported models" : "Silent video transformations"}</li>
              <li>
                <Check />
                Extra credit packs & optional auto-reload
              </li>
              <li>
                <Check />
                Private generation history
              </li>
            </ul>
            <button
              className={
                p.id === "pro" ? "account-primary" : "account-secondary"
              }
              onClick={() => choose(p.id)}
              disabled={!!busy}
            >
              {busy === p.id ? "Opening checkout…" : `Choose ${p.name}`}
              <ArrowUpRight size={17} />
            </button>
          </article>
        ))}
      </div>
      <p className="pricing-fine">
        Prices in USD, plus applicable taxes. Subscriptions renew automatically.
        Subscription credits are released monthly, including on annual plans. All credits
        expire 90 days after they become available. Credits expiring soonest are used first. Cancel renewal through
        your account. Resolution, clip length, audio, and reference limits also depend on the selected AI model. After your paid term ends, remaining purchased credits use Starter features.
      </p>
    </>
  );
}
export default function Pricing() {
  const [ready, setReady] = useState(true);
  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((d: unknown) =>
        setReady((d as { billingReady: boolean }).billingReady),
      )
      .catch(() => setReady(false));
  }, []);
  return (
    <div className="account-shell">
      <header className="account-header">
        <Brand />
        <nav>
          <Link prefetch={false} href="/">Home</Link>
          <Link prefetch={false} href="/studio">Studio</Link>
          <Link prefetch={false} href="/account" className="account-nav-button">
            My account <ArrowUpRight size={15} />
          </Link>
        </nav>
      </header>
      <main className="pricing-page">
        <div className="pricing-intro">
          <span className="account-eyebrow">
            A LITTLE INVESTMENT IN YOUR IMAGINATION
          </span>
          <h1>
            Your next reality.
            <br />
            <em>Your kind of plan.</em>
          </h1>
          <p>
            Start with a subscription. Create at your pace.
            <br />
            Add extra credits whenever inspiration strikes.
          </p>
        </div>
        {!ready && (
          <div className="account-notice">
            Subscriptions are coming soon. Explore the plans below while
            checkout is being connected.
          </div>
        )}
        <PlanCards />
        <section className="credit-explainer">
          <div>
            <span className="account-eyebrow">NO GUESSWORK</span>
            <h2>
              Know the cost.
              <br />
              Then create.
            </h2>
            <p>
              Every video shows its exact credit quote before you start. The
              quote depends on your clip’s length and resolution. Failed
              generations automatically return their reserved credits.
            </p>
            <p>
              For a typical 5-second 720p clip, budget around 1,000 credits. A
              5-second 480p clip uses around 450 credits.
            </p>
          </div>
          <div className="pack-grid">
            {TOPUPS.map((p) => (
              <div className="pack-card" key={p.id}>
                <span>{p.name}</span>
                <strong>
                  {p.credits.toLocaleString()} <small>credits</small>
                </strong>
                <span>{money(p.price)}</span>
              </div>
            ))}
            <p>
              Extra packs are available to active subscribers. Keep unused
              purchased credits until their 90-day expiry, even if you cancel.
            </p>
          </div>
        </section>
        <section className="reload-explainer">
          <Sparkles />
          <h2>Keep the ideas flowing.</h2>
          <p>
            Optional auto-reload adds your chosen pack when your balance falls
            below your threshold. You choose the pack, the threshold, and the
            maximum monthly spend. It starts off, and you can disable it
            anytime.
          </p>
          <Link prefetch={false} href="/account?tab=credits" className="account-secondary">
            Explore your account <ArrowUpRight size={16} />
          </Link>
        </section>
        <Link prefetch={false} href="/" className="quiet-link">
          <ArrowLeft size={15} />
          Back to Reelform
        </Link>
      </main>
    </div>
  );
}
