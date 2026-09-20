"use client";
import { useEffect, useState } from "react";

type Props = { started: number; status: string; paused: boolean };
export default function GenerationProgress({ started, status, paused }: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.floor((now - started) / 1000));
  const elapsed = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const rendering = status === "in_progress";
  const label = paused ? "Status check paused" : rendering ? "Generating your video" : "Waiting in queue";
  return (
    <div className="generation-progress">
      <div className="generation-progress-meta">
        <strong>{label}</strong>
        <span aria-live="off">{elapsed} elapsed</span>
      </div>
      <div className={`generation-stage-track ${paused ? "is-paused" : ""}`} role="progressbar" aria-label="Video generation" aria-valuetext={label}>
        <span className="is-done" />
        <span className={rendering ? "is-done" : "is-current"} />
        <span className={rendering ? "is-current" : ""} />
      </div>
      <div className="generation-stage-labels" aria-hidden="true"><span>Uploaded</span><span>Queued</span><span>Generating</span></div>
      <p>Time remaining isn’t available from Higgsfield. This bar shows live stages, not a completion percentage.</p>
      {seconds >= 600 && <p>Still working. Longer waits can happen during busy periods. You can check this generation in your account.</p>}
    </div>
  );
}
