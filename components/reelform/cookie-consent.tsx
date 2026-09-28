"use client";

import { useEffect, useState } from "react";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./cookie-consent.css";

type Choice = "granted" | "denied";
const COOKIE = "rf_consent";
const OPEN_EVENT = "reelform:cookie-settings";

function readChoice(): Choice | null {
  const match = document.cookie.match(/(?:^|; )rf_consent=(granted|denied)/);
  return match ? (match[1] as Choice) : null;
}
function saveChoice(choice: Choice) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE}=${choice}; Max-Age=${180 * 86400}; Path=/; SameSite=Lax${secure}`;
}
export function openCookieSettings() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}
export function CookieSettingsButton({ className }: { className?: string }) {
  return (
    <button type="button" className={className} onClick={openCookieSettings}>
      Cookie settings
    </button>
  );
}

// Essential sign-in cookies need no consent. Analytics and speed measurement load
// only after a visitor allows them; Global Privacy Control counts as a refusal.
export default function CookieConsent() {
  const [choice, setChoice] = useState<Choice | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const saved = readChoice();
    const gpc = (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
    // Consent lives in a cookie, so it can only be read after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChoice(saved ?? (gpc ? "denied" : null));
    setOpen(!saved && !gpc);
    const reopen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, reopen);
    return () => window.removeEventListener(OPEN_EVENT, reopen);
  }, []);
  function decide(next: Choice) {
    saveChoice(next);
    // Turning analytics off after it loaded needs a fresh page to unload the scripts.
    if (choice === "granted" && next === "denied") location.reload();
    setChoice(next);
    setOpen(false);
  }
  return (
    <>
      {choice === "granted" && (
        <>
          <Analytics />
          <SpeedInsights />
        </>
      )}
      {open && (
        <section className="cookie-consent" role="region" aria-label="Cookie preferences">
          <p>
            <strong>Cookies on Reelform</strong>
            We use essential cookies to keep you signed in. With your OK, we also measure visits and page
            speed with Vercel Analytics, which doesn’t use cookies or track you across sites.{" "}
            <a href="/privacy#cookies">Details</a>
          </p>
          <div>
            <button type="button" onClick={() => decide("denied")}>
              Essential only
            </button>
            <button type="button" className="is-primary" onClick={() => decide("granted")}>
              Allow analytics
            </button>
          </div>
        </section>
      )}
    </>
  );
}
