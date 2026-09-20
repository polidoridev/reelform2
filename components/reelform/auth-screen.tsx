"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, ArrowLeft, Check, Mail, LoaderCircle } from "lucide-react";
import type { ApiResult } from "@/lib/commerce/types";
import { useReducedMotion } from "motion/react";
import Brand from "./brand";
import "./accounts.css";
export default function AuthScreen({
  initialMode = "login",
  tokenHash = "",
  tokenType = "email",
}: {
  initialMode?: string;
  tokenHash?: string;
  tokenType?: string;
}) {
  const reduceMotion = useReducedMotion();
  const [mode, setMode] = useState(initialMode),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const titles: Record<string, string> = {
    login: "Welcome back.",
    signup: "Your next reality starts here.",
    forgot: "Let’s get you back in.",
    reset: "A fresh start.",
    verify: "One last step.",
  };
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const f = new FormData(e.currentTarget);
    try {
      const r = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: f.get("email"),
          password: f.get("password"),
          name: f.get("name"),
          marketing: f.get("marketing") === "on",
          tokenHash,
          type: tokenType,
        }),
      });
      const data = (await r.json()) as ApiResult;
      if (!r.ok) throw new Error(data.error);
      if (data.message) setMessage(data.message);
      else window.location.assign(data.redirect || "/account");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  function switchMode(next: string) {
    setMode(next);
    setMessage("");
    setError("");
  }
  return (
    <div className="auth-page">
      <header className="account-header">
        <Brand />
        <Link prefetch={false} href="/" className="quiet-link">
          <ArrowLeft size={16} /> Back to Reelform
        </Link>
      </header>
      <main className="auth-layout">
        <div className="auth-art">
          <video
            src="/media/yacht.mp4"
            poster="/media/yacht.jpg"
            muted
            loop
            playsInline
            autoPlay={reduceMotion === false}
          />
          <div>
            <span>REAL YOU. REIMAGINED.</span>
            <h2>
              A little more
              <br />
              main character.
            </h2>
            <p>Your ideas, your videos, your next chapter.</p>
          </div>
        </div>
        <section className="auth-panel">
          <span className="account-eyebrow">YOUR REELFORM ACCOUNT</span>
          <h1>{titles[mode]}</h1>
          <p>
            {mode === "verify"
              ? "Confirm your email link to continue securely."
              : mode === "forgot"
                ? "We’ll email you a link to reset your password."
                : mode === "reset"
                  ? "Choose a new password with at least 10 characters."
                  : "One place for your creations, credits, and subscription."}
          </p>
          {message ? (
            <div className="account-notice">
              <Check size={18} />
              {message}
            </div>
          ) : (
            <form onSubmit={submit}>
              {mode === "signup" && (
                <label>
                  Your name
                  <input
                    name="name"
                    autoComplete="name"
                    maxLength={100}
                    required
                  />
                </label>
              )}
              {["login", "signup", "forgot"].includes(mode) && (
                <label>
                  Email address
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                  />
                </label>
              )}
              {["login", "signup", "reset"].includes(mode) && (
                <label>
                  Password
                  <input
                    name="password"
                    type="password"
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    minLength={mode === "login" ? 1 : 10}
                    maxLength={128}
                    required
                  />
                </label>
              )}
              {mode === "signup" && (
                <label className="check-row">
                  <input type="checkbox" name="marketing" />
                  Email me Reelform inspiration, tutorials, and offers. I can
                  unsubscribe anytime.
                </label>
              )}
              {error && (
                <p className="account-error" role="alert">
                  {error}
                </p>
              )}
              <button className="account-primary" disabled={busy}>
                {busy ? (
                  <LoaderCircle className="spin" size={17} />
                ) : mode === "forgot" ? (
                  <Mail size={17} />
                ) : (
                  <ArrowRight size={17} />
                )}{" "}
                {mode === "login"
                  ? "Sign in"
                  : mode === "signup"
                    ? "Create account"
                    : mode === "forgot"
                      ? "Send reset link"
                      : mode === "reset"
                        ? "Save new password"
                        : "Confirm and continue"}
              </button>
              {mode === "signup" && (
                <p className="form-fine">
                  By creating an account, you accept our{" "}
                  <Link prefetch={false} href="/terms">Terms</Link> and{" "}
                  <Link prefetch={false} href="/privacy">Privacy Policy</Link>.
                </p>
              )}
            </form>
          )}
          <div className="auth-switch">
            {mode === "login" ? (
              <>
                <button onClick={() => switchMode("forgot")}>
                  Forgot password?
                </button>
                <p>
                  New here?{" "}
                  <button onClick={() => switchMode("signup")}>
                    Create an account
                  </button>
                </p>
              </>
            ) : (
              <button onClick={() => switchMode("login")}>
                Back to sign in
              </button>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
