"use client";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  UserRound,
  WalletCards,
  Sparkles,
  History,
  Film,
  Settings,
  LogOut,
  ShieldCheck,
  Mail,
  Download,
  Check,
  LoaderCircle,
  RefreshCw,
  ChevronRight,
} from "lucide-react";
import type { AccountData, ApiResult } from "@/lib/commerce/types";
import { useReducedMotion } from "motion/react";
import Brand from "./brand";
import AppSelect from "./app-select";
import { PlanCards } from "./pricing";
import { PLANS, TOPUPS, money } from "@/lib/commerce/pricing";
import "./accounts.css";
const tabs = [
  { id: "overview", label: "Overview", icon: UserRound },
  { id: "billing", label: "Subscription & billing", icon: WalletCards },
  { id: "credits", label: "Credits & auto-reload", icon: Sparkles },
  { id: "usage", label: "Usage history", icon: History },
  { id: "creations", label: "My creations", icon: Film },
  { id: "settings", label: "Account settings", icon: Settings },
];
const date = (v: string | number | null) =>
  v
    ? new Date(typeof v === "number" ? v * 1000 : v).toLocaleDateString(
        "en-US",
        { month: "short", day: "numeric", year: "numeric" },
      )
    : "—";
async function call(url: string, body: unknown, method = "POST") {
  const r = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const d = (await r.json()) as ApiResult;
  if (!r.ok) throw new Error(d.error || "Please try again.");
  return d;
}
export default function Account({
  initialTab = "overview",
}: {
  initialTab?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [tab, setTab] = useState(
      tabs.some((t) => t.id === initialTab) ? initialTab : "overview",
    ),
    [data, setData] = useState<AccountData | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState("");
  const [reloadEnabled, setReloadEnabled] = useState(false),
    [pack, setPack] = useState("small"),
    [threshold, setThreshold] = useState(200),
    [cap, setCap] = useState(30),
    [consent, setConsent] = useState(false),
    [deleting, setDeleting] = useState(false);
  useEffect(() => {
    load();
  }, []);
  async function load() {
    try {
      const r = await fetch("/api/account", { cache: "no-store" });
      if (r.status === 401) {
        window.location.assign("/login");
        return;
      }
      const d = (await r.json()) as AccountData & ApiResult;
      if (!r.ok) throw new Error(d.error);
      setData(d);
      setReloadEnabled(d.account.auto_reload_enabled);
      setPack(d.account.auto_reload_pack);
      setThreshold(d.account.auto_reload_threshold);
      setCap(d.account.auto_reload_cap_cents / 100);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  function select(id: string) {
    setTab(id);
    setNotice("");
    setError("");
    history.replaceState(null, "", `/account?tab=${id}`);
  }
  async function action(
    id: string,
    fn: () => Promise<ApiResult | void>,
    success = "Saved.",
  ) {
    setBusy(id);
    setError("");
    setNotice("");
    try {
      const result = await fn();
      if (result?.url) {
        window.location.assign(result.url);
        return;
      }
      setNotice(result?.message || success);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  const a = data?.account,
    b = data?.balance,
    plan = PLANS.find((p) => p.id === a?.plan);
  const nav = (
    <>
      {tabs.map((t) => (
        <button
          key={t.id}
          className={tab === t.id ? "selected" : ""}
          onClick={() => select(t.id)}
        >
          <t.icon size={18} />
          {t.label}
          {tab === t.id && <ChevronRight size={15} />}
        </button>
      ))}
    </>
  );
  return (
    <div className="account-shell">
      <header className="account-header">
        <Brand />
        <nav>
          <a href="/pricing">Plans</a>
          <a href="/studio" className="account-nav-button">
            Open studio <ArrowUpRight size={16} />
          </a>
          <button
            className="account-avatar"
            aria-label="Account settings"
            onClick={() => select("settings")}
          >
            {a?.full_name?.slice(0, 1)?.toUpperCase() || (
              <UserRound size={18} />
            )}
          </button>
        </nav>
      </header>
      <div className="account-layout">
        <aside className="account-sidebar">
          <div className="sidebar-person">
            <span className="account-eyebrow">YOUR SPACE</span>
            <strong>{a?.full_name || "My account"}</strong>
            <span>{a?.email || "Welcome to Reelform"}</span>
          </div>
          <nav aria-label="Account navigation">{nav}</nav>
          <a className="sidebar-help" href="mailto:admin@polidori.dev">
            <Mail size={17} />
            Need a hand?
          </a>
          <button
            className="sidebar-logout"
            onClick={() =>
              action("logout", async () => {
                await call("/api/auth/logout", {});
                location.assign("/");
              })
            }
          >
            <LogOut size={17} />
            Sign out
          </button>
        </aside>
        <main className="account-content">
          <div className="account-title">
            <div>
              <span className="account-eyebrow">REELFORM / YOUR ACCOUNT</span>
              <h1>{tabs.find((t) => t.id === tab)?.label}</h1>
            </div>
            <button
              className="refresh-button"
              onClick={() => load()}
              aria-label="Refresh account"
            >
              <RefreshCw size={17} />
            </button>
          </div>
          {loading ? (
            <div className="account-loading">
              <LoaderCircle className="spin" />
              Getting your account ready…
            </div>
          ) : (
            <>
              {error && (
                <div role="alert" className="account-error">
                  {error}
                </div>
              )}
              {notice && (
                <div role="status" className="account-notice">
                  <Check size={16} />
                  {notice}
                </div>
              )}
              {data?.testMode && (
                <div className="account-notice">
                  Test payments are connected. This account cannot make live
                  purchases yet.
                </div>
              )}
              {a?.billing_hold && (
                <div className="account-error">
                  Billing is under review. Contact support before creating more
                  videos.
                </div>
              )}
              {a && b && data && (
                <>
                  {tab === "overview" && (
                    <>
                      <section className="account-welcome">
                        <div>
                          <span className="account-eyebrow">
                            GOOD TO SEE YOU,{" "}
                            {a.full_name.split(" ")[0] || "CREATOR"}
                          </span>
                          <h2>
                            Your next scene
                            <br />
                            is waiting.
                          </h2>
                          <p>All your creations. Every credit. One place.</p>
                          <a href="/studio" className="account-primary">
                            Create something new <ArrowUpRight size={17} />
                          </a>
                        </div>
                        <video
                          src="/media/villa.mp4"
                          poster="/media/villa.jpg"
                          muted
                          loop
                          playsInline
                          autoPlay={reduceMotion === false}
                        />
                      </section>
                      <div className="account-stat-grid">
                        <button onClick={() => select("credits")}>
                          <span>
                            Available credits <Sparkles size={16} />
                          </span>
                          <strong>{b.total.toLocaleString()}</strong>
                          <small>
                            {b.subscription.toLocaleString()} plan +{" "}
                            {b.purchased.toLocaleString()} purchased
                          </small>
                        </button>
                        <button onClick={() => select("billing")}>
                          <span>
                            Your plan <WalletCards size={16} />
                          </span>
                          <strong>{plan?.name || "Free account"}</strong>
                          <small>
                            {a.cadence
                              ? `${a.cadence === "year" ? "Yearly" : "Monthly"} billing · ${a.subscription_status}`
                              : "Choose a plan to start creating"}
                          </small>
                        </button>
                        <button onClick={() => select("creations")}>
                          <span>
                            Recent creations <Film size={16} />
                          </span>
                          <strong>
                            {
                              data.jobs.filter((j) => j.status === "completed")
                                .length
                            }
                          </strong>
                          <small>Completed videos in your recent history</small>
                        </button>
                      </div>
                      <section className="account-card">
                        <div className="card-heading">
                          <h2>Your credits, at a glance</h2>
                          <button onClick={() => select("usage")}>
                            View usage <ArrowRight size={15} />
                          </button>
                        </div>
                        <div className="credit-meter">
                          <div
                            style={{
                              width: `${plan ? Math.min(100, (b.subscription / plan.credits) * 100) : 0}%`,
                            }}
                          />
                        </div>
                        <div className="meter-caption">
                          <span>
                            {b.subscription.toLocaleString()} monthly credits
                            remaining
                          </span>
                          <span>
                            {b.nextReset
                              ? `Refreshes ${date(b.nextReset)}`
                              : "No active monthly allowance"}
                          </span>
                        </div>
                        <p className="account-muted">
                          Purchased credits stay in your account and are used
                          after your monthly allowance.
                        </p>
                      </section>
                    </>
                  )}
                  {tab === "billing" && (
                    <>
                      <section className="account-card current-plan">
                        <div>
                          <span className="account-eyebrow">
                            CURRENT SUBSCRIPTION
                          </span>
                          <h2>{plan?.name || "Free account"}</h2>
                          <p>
                            {plan
                              ? `${plan.credits.toLocaleString()} credits released each month`
                              : "Choose a subscription to unlock your first transformation."}
                          </p>
                          <span className="status-pill">
                            {a.subscription_status === "none"
                              ? "No subscription"
                              : a.subscription_status}
                          </span>
                        </div>
                        <div>
                          {plan && (
                            <strong>
                              {money(
                                a.cadence === "year"
                                  ? plan.yearly
                                  : plan.monthly,
                              )}
                              <small>
                                {" "}
                                / {a.cadence === "year" ? "year" : "month"}
                              </small>
                            </strong>
                          )}
                          <p>
                            {a.paid_until
                              ? `${a.cancel_at_period_end ? "Ends" : "Paid through"} ${date(a.paid_until)}`
                              : "No payment method required to browse"}
                          </p>
                          <button
                            className="account-secondary"
                            disabled={!!busy || !plan}
                            onClick={() =>
                              action("portal", () =>
                                call("/api/billing/portal", {}),
                              )
                            }
                          >
                            Manage subscription <ArrowUpRight size={16} />
                          </button>
                        </div>
                      </section>
                      <section className="account-card">
                        <div className="card-heading">
                          <h2>Payment method</h2>
                          <ShieldCheck size={19} />
                        </div>
                        <p>
                          {data.paymentMethod
                            ? `${data.paymentMethod.brand.toUpperCase()} ending in ${data.paymentMethod.last4} · expires ${data.paymentMethod.month}/${data.paymentMethod.year}`
                            : "No saved payment method yet."}
                        </p>
                        <p className="account-muted">
                          Card details are securely managed by Stripe.
                        </p>
                        <button
                          className="quiet-link"
                          disabled={!plan || !!busy}
                          onClick={() =>
                            action("portal", () =>
                              call("/api/billing/portal", {}),
                            )
                          }
                        >
                          Update payment details <ArrowUpRight size={15} />
                        </button>
                      </section>
                      <section className="account-card">
                        <div className="card-heading">
                          <h2>Invoices</h2>
                          <span>Latest 24</span>
                        </div>
                        {data.billingError ? (
                          <p>
                            Billing history could not load. Refresh to try
                            again.
                          </p>
                        ) : data.invoices.length ? (
                          <div className="account-table-wrap">
                            <table>
                              <thead>
                                <tr>
                                  <th>Date</th>
                                  <th>Invoice</th>
                                  <th>Amount</th>
                                  <th>Status</th>
                                  <th>Receipt</th>
                                </tr>
                              </thead>
                              <tbody>
                                {data.invoices.map((i) => (
                                  <tr key={i.id}>
                                    <td>{date(i.created)}</td>
                                    <td>{i.number || "Invoice"}</td>
                                    <td>{money(i.amount / 100)}</td>
                                    <td>
                                      <span className="status-pill">
                                        {i.status}
                                      </span>
                                    </td>
                                    <td>
                                      {i.pdf && (
                                        <a
                                          href={i.pdf}
                                          target="_blank"
                                          rel="noreferrer"
                                          aria-label={`Download invoice ${i.number}`}
                                        >
                                          <Download size={16} />
                                        </a>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <Empty
                            icon={WalletCards}
                            title="Your first chapter starts here."
                            detail="Invoices will appear after your first purchase."
                          />
                        )}
                      </section>
                      {data.pendingChange && (
                        <section className="account-card">
                          <h2>Your next plan</h2>
                          <p>
                            {data.pendingChange.name} ·{" "}
                            {money(data.pendingChange.price)} /{" "}
                            {data.pendingChange.cadence === "year"
                              ? "year"
                              : "month"}
                            , starting {date(data.pendingChange.date)}.
                          </p>
                          <button
                            className="quiet-link"
                            disabled={!!busy}
                            onClick={() =>
                              action("cancel-change", () =>
                                call("/api/billing/cancel-change", {}),
                              )
                            }
                          >
                            Cancel scheduled change
                          </button>
                        </section>
                      )}
                      {a.subscription_status === "active" && (
                        <section className="account-card">
                          <h2>
                            {a.cancel_at_period_end
                              ? "Keep your next chapter open."
                              : "Your subscription, your call."}
                          </h2>
                          <p>
                            {a.cancel_at_period_end
                              ? "Resume automatic renewal to keep your monthly credits coming."
                              : `Cancel renewal and keep your current access until ${date(a.paid_until)}. Purchased credits remain available. Auto-reload will turn off. Any scheduled plan change will be removed.`}
                          </p>
                          <button
                            className="account-secondary"
                            disabled={!!busy}
                            onClick={() =>
                              action("renewal", () =>
                                call(
                                  a.cancel_at_period_end
                                    ? "/api/billing/resume-renewal"
                                    : "/api/billing/cancel-renewal",
                                  {},
                                ),
                              )
                            }
                          >
                            {a.cancel_at_period_end
                              ? "Resume automatic renewal"
                              : "Cancel renewal"}
                          </button>
                        </section>
                      )}
                      <h2 className="account-subtitle">Find your next plan</h2>
                      <PlanCards
                        compact
                        subscribed={a.subscription_status === "active"}
                        renewDate={a.paid_until || undefined}
                      />
                    </>
                  )}
                  {tab === "credits" && (
                    <>
                      <section className="balance-banner">
                        <span className="account-eyebrow">
                          YOUR CREATIVE FUEL
                        </span>
                        <h2>
                          {b.total.toLocaleString()} <small>credits</small>
                        </h2>
                        <div>
                          <span>
                            Monthly allowance{" "}
                            <strong>{b.subscription.toLocaleString()}</strong>
                          </span>
                          <span>
                            Purchased credits{" "}
                            <strong>{b.purchased.toLocaleString()}</strong>
                          </span>
                          <span>
                            Next refresh{" "}
                            <strong>{date(b.nextReset || b.nextGrant)}</strong>
                          </span>
                        </div>
                      </section>
                      <div className="card-heading">
                        <h2>A little more possibility.</h2>
                        <span>For active subscribers</span>
                      </div>
                      <div className="pack-grid account-packs">
                        {TOPUPS.map((p) => (
                          <article className="pack-card" key={p.id}>
                            <span>{p.name}</span>
                            <strong>
                              {p.credits.toLocaleString()}{" "}
                              <small>credits</small>
                            </strong>
                            <p>{money(p.price)} · one-time purchase</p>
                            <button
                              className="account-secondary"
                              disabled={
                                !!busy || a.subscription_status !== "active"
                              }
                              onClick={() =>
                                action(p.id, () =>
                                  call("/api/billing/topup", {
                                    pack: p.id,
                                    requestId: crypto.randomUUID(),
                                  }),
                                )
                              }
                            >
                              Buy credits <ArrowUpRight size={16} />
                            </button>
                          </article>
                        ))}
                      </div>
                      <p className="account-muted">
                        Purchased credits never expire. Use them after your
                        monthly allowance, even if you later cancel your
                        subscription.
                      </p>
                      <section className="account-card">
                        <div className="card-heading">
                          <div>
                            <h2>Credits on autopilot.</h2>
                            <p className="account-muted">
                              You set the limits. We keep the ideas moving.
                            </p>
                          </div>
                          <span className="status-pill">
                            {a.auto_reload_enabled ? "Enabled" : "Off"}
                          </span>
                        </div>
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            action(
                              "reload",
                              () =>
                                reloadEnabled
                                  ? call("/api/billing/auto-reload", {
                                      enabled: true,
                                      pack,
                                      threshold,
                                      monthlyCap: cap,
                                      consent,
                                    })
                                  : call(
                                      "/api/account",
                                      { action: "disable-reload" },
                                      "PATCH",
                                    ),
                              "Auto-reload preferences saved.",
                            );
                          }}
                        >
                          <label className="toggle-row">
                            <span>
                              Enable auto-reload
                              <small>
                                Automatically charge your saved card when
                                credits run low.
                              </small>
                            </span>
                            <input
                              type="checkbox"
                              checked={reloadEnabled}
                              onChange={(e) => {
                                setReloadEnabled(e.target.checked);
                                setConsent(false);
                              }}
                            />
                          </label>
                          <div className="settings-grid">
                            <label>
                              When credits fall below
                              <input
                                type="number"
                                min={100}
                                max={5000}
                                value={threshold}
                                onChange={(e) => setThreshold(+e.target.value)}
                                disabled={!reloadEnabled}
                              />
                            </label>
                            <label>
                              Reload pack
                              <AppSelect
                                label="Reload pack"
                                value={pack}
                                onValueChange={setPack}
                                disabled={!reloadEnabled}
                                options={TOPUPS.map((p) => ({ value: p.id, label: `${p.credits.toLocaleString()} credits · ${money(p.price)}` }))}
                              />
                            </label>
                            <label>
                              Maximum monthly spend (USD)
                              <input
                                type="number"
                                min={10}
                                max={500}
                                step={1}
                                value={cap}
                                onChange={(e) => setCap(+e.target.value)}
                                disabled={!reloadEnabled}
                              />
                            </label>
                          </div>
                          {reloadEnabled && (
                            <label className="check-row reload-consent">
                              <input
                                type="checkbox"
                                checked={consent}
                                onChange={(e) => setConsent(e.target.checked)}
                                required
                              />
                              I authorize Reelform to charge{" "}
                              {money(TOPUPS.find((p) => p.id === pack)!.price)}{" "}
                              for each refill when my balance drops below{" "}
                              {threshold} credits, up to {money(cap)} per
                              calendar month (UTC). I can turn this off anytime.
                            </label>
                          )}
                          <button className="account-primary" disabled={!!busy}>
                            Save auto-reload settings <Check size={16} />
                          </button>
                        </form>
                      </section>
                      <section className="account-card">
                        <h2>Credit purchases</h2>
                        {data.orders.length ? (
                          <div className="account-table-wrap">
                            <table>
                              <thead>
                                <tr>
                                  <th>Date</th>
                                  <th>Credits</th>
                                  <th>Amount</th>
                                  <th>Status</th>
                                  <th>Receipt</th>
                                </tr>
                              </thead>
                              <tbody>
                                {data.orders.map((o) => (
                                  <tr key={o.id}>
                                    <td>{date(o.created_at)}</td>
                                    <td>{o.credits.toLocaleString()}</td>
                                    <td>{money(o.amount_cents / 100)}</td>
                                    <td>
                                      {o.status}
                                      {o.error && (
                                        <small className="row-error">
                                          {o.error}
                                        </small>
                                      )}
                                    </td>
                                    <td>
                                      {o.receipt_url && (
                                        <a
                                          href={o.receipt_url}
                                          target="_blank"
                                          rel="noreferrer"
                                        >
                                          <Download size={16} />
                                        </a>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="account-muted">
                            Your credit purchases and automatic refills will
                            appear here.
                          </p>
                        )}
                      </section>
                    </>
                  )}
                  {tab === "usage" && (
                    <section className="account-card">
                      <div className="card-heading">
                        <h2>Every credit, accounted for.</h2>
                        <span>Latest 100 entries</span>
                      </div>
                      {data.ledger.length ? (
                        <div className="account-table-wrap">
                          <table>
                            <thead>
                              <tr>
                                <th>Date</th>
                                <th>Activity</th>
                                <th>Type</th>
                                <th>Credits</th>
                              </tr>
                            </thead>
                            <tbody>
                              {data.ledger.map((l) => (
                                <tr key={l.id}>
                                  <td>{date(l.created_at)}</td>
                                  <td>{l.description}</td>
                                  <td>{l.kind.replaceAll("_", " ")}</td>
                                  <td
                                    className={
                                      l.amount > 0 ? "credit-positive" : ""
                                    }
                                  >
                                    {l.amount > 0 ? "+" : ""}
                                    {l.amount.toLocaleString()}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <Empty
                          icon={History}
                          title="A clean slate."
                          detail="Your generations, purchases, and credit returns appear here."
                        />
                      )}
                      <p className="account-muted">
                        Subscription entries show the allowance scheduled by a
                        paid invoice. Annual allowances unlock monthly; only
                        currently available credits are spendable.
                      </p>
                    </section>
                  )}
                  {tab === "creations" && (
                    <>
                      <p className="account-muted">
                        Your latest 50 generations. Download finished videos
                        promptly; provider download links may expire.
                      </p>
                      {data.jobs.length ? (
                        <div className="creation-grid">
                          {data.jobs.map((j) => (
                            <article className="creation-card" key={j.id}>
                              {j.result_url ? (
                                <video
                                  src={j.result_url}
                                  controls
                                  playsInline
                                  preload="metadata"
                                />
                              ) : (
                                <div className="creation-pending">
                                  <Film size={28} />
                                  <span>
                                    {j.status === "unknown"
                                      ? "Needs review"
                                      : j.status}
                                  </span>
                                </div>
                              )}
                              <div>
                                <span className="status-pill">{j.status}</span>
                                <p>{j.prompt}</p>
                                <small>
                                  {date(j.created_at)} · {j.resolution} ·{" "}
                                  {j.credits} credits
                                </small>
                                {j.error && (
                                  <p className="account-error">{j.error}</p>
                                )}
                                {j.result_url && (
                                  <a
                                    href={j.result_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="quiet-link"
                                  >
                                    Download video <Download size={15} />
                                  </a>
                                )}
                                <details>
                                  <summary>Generation ID</summary>
                                  <code>{j.id}</code>
                                </details>
                              </div>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <Empty
                          icon={Film}
                          title="Your story is still unwritten."
                          detail="Create your first video and find it here."
                        />
                      )}
                    </>
                  )}
                  {tab === "settings" && (
                    <>
                      <section className="account-card">
                        <h2>Profile</h2>
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            const f = new FormData(e.currentTarget);
                            action("profile", () =>
                              call(
                                "/api/account",
                                { action: "profile", name: f.get("name") },
                                "PATCH",
                              ),
                            );
                          }}
                        >
                          <label>
                            Your name
                            <input
                              name="name"
                              defaultValue={a.full_name}
                              required
                              maxLength={100}
                            />
                          </label>
                          <label>
                            Email address
                            <input value={a.email} disabled readOnly />
                          </label>
                          <button className="account-primary" disabled={!!busy}>
                            Save profile <Check size={16} />
                          </button>
                        </form>
                      </section>
                      <section className="account-card">
                        <h2>Email preferences</h2>
                        <label className="toggle-row">
                          <span>
                            Inspiration, tutorials & offers
                            <small>
                              Only when you opt in. Unsubscribe whenever you
                              like.
                            </small>
                          </span>
                          <input
                            type="checkbox"
                            checked={a.marketing_opt_in}
                            disabled={!!busy}
                            onChange={(e) =>
                              action(
                                "marketing",
                                () =>
                                  call(
                                    "/api/account",
                                    {
                                      action: "marketing",
                                      enabled: e.target.checked,
                                    },
                                    "PATCH",
                                  ),
                                "Email preferences saved.",
                              )
                            }
                          />
                        </label>
                        <p className="account-muted">
                          Essential security and billing messages still reach
                          you.
                        </p>
                      </section>
                      <section className="account-card">
                        <h2>Security</h2>
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            const f = new FormData(e.currentTarget);
                            action("password", () =>
                              call(
                                "/api/account",
                                {
                                  action: "password",
                                  currentPassword: f.get("currentPassword"),
                                  password: f.get("password"),
                                },
                                "PATCH",
                              ),
                            );
                          }}
                        >
                          <label>
                            Current password
                            <input
                              name="currentPassword"
                              type="password"
                              autoComplete="current-password"
                              required
                            />
                          </label>
                          <label>
                            New password
                            <input
                              name="password"
                              type="password"
                              autoComplete="new-password"
                              minLength={10}
                              maxLength={128}
                              required
                            />
                          </label>
                          <button
                            className="account-secondary"
                            disabled={!!busy}
                          >
                            Update password <ShieldCheck size={16} />
                          </button>
                        </form>
                        <button
                          className="quiet-link security-logout"
                          onClick={() =>
                            action("all-sessions", async () => {
                              await call("/api/auth/logout", {
                                everywhere: true,
                              });
                              location.assign("/login");
                            })
                          }
                        >
                          Sign out on all devices <LogOut size={16} />
                        </button>
                      </section>
                      <section className="account-card">
                        <h2>Change email address</h2>
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            const f = new FormData(e.currentTarget);
                            action("email", () =>
                              call(
                                "/api/account",
                                {
                                  action: "email",
                                  email: f.get("email"),
                                  currentPassword: f.get("currentPassword"),
                                },
                                "PATCH",
                              ),
                            );
                          }}
                        >
                          <label>
                            New email
                            <input name="email" type="email" required />
                          </label>
                          <label>
                            Current password
                            <input
                              name="currentPassword"
                              type="password"
                              autoComplete="current-password"
                              required
                            />
                          </label>
                          <button
                            className="account-secondary"
                            disabled={!!busy}
                          >
                            Send confirmation <Mail size={16} />
                          </button>
                        </form>
                      </section>
                      <section className="account-card danger-card">
                        <h2>Delete account</h2>
                        <p>
                          This permanently deletes your account, credit balance,
                          and Reelform generation history, and cancels your
                          subscription immediately. Download your videos first.
                          Payment records retained by Stripe are separate.
                        </p>
                        {!deleting ? (
                          <button
                            className="danger-button"
                            onClick={() => setDeleting(true)}
                          >
                            Delete my account
                          </button>
                        ) : (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              const f = new FormData(e.currentTarget);
                              action("delete", async () => {
                                await call(
                                  "/api/account",
                                  {
                                    confirmation: f.get("confirmation"),
                                    password: f.get("password"),
                                  },
                                  "DELETE",
                                );
                                location.assign("/");
                              });
                            }}
                          >
                            <label>
                              Type DELETE to confirm
                              <input
                                name="confirmation"
                                pattern="DELETE"
                                required
                              />
                            </label>
                            <label>
                              Your password
                              <input
                                name="password"
                                type="password"
                                required
                                autoComplete="current-password"
                              />
                            </label>
                            <button className="danger-button" disabled={!!busy}>
                              Permanently delete account
                            </button>
                            <button
                              type="button"
                              className="quiet-link"
                              onClick={() => setDeleting(false)}
                            >
                              Keep my account
                            </button>
                          </form>
                        )}
                      </section>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
function Empty({
  icon: Icon,
  title,
  detail,
}: {
  icon: React.ComponentType<{ size?: number }>;
  title: string;
  detail: string;
}) {
  return (
    <div className="account-empty">
      <Icon size={30} />
      <h3>{title}</h3>
      <p>{detail}</p>
      <a href="/studio" className="quiet-link">
        Open studio <ArrowRight size={16} />
      </a>
    </div>
  );
}
