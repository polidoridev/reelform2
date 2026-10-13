"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpRight, Check, Download, Film, Music2, Pause, Play, Plus, Sparkles, Trash2, Upload, X } from "lucide-react";
import Brand from "./brand";
import { AURA_STYLES, AURA_TRACKS, MAX_AURA_FILES, MAX_AURA_FILE_BYTES, MAX_AURA_TOTAL_BYTES, planAura, type AuraSettings } from "@/lib/aura-edit";
import type { AuraFile } from "@/lib/aura-render";
import { auraAiPlanSchema, compileAuraAiPlan, type AuraAiPlan } from "@/lib/aura-ai";
import "./aura-editor.css";

type Clip = AuraFile & { id: string; url: string };
const initialSettings: AuraSettings = { style: "velocity", bpm: 140, seconds: 12, shape: "9:16", fit: "cover", music: "night-drive", musicOffset: 0 };

export default function AuraEditor() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [settings, setSettings] = useState(initialSettings);
  const [music, setMusic] = useState<{ name: string; buffer: AudioBuffer } | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [result, setResult] = useState<{ file: File; url: string } | null>(null);
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [aiConfig, setAiConfig] = useState<{ enabled: boolean; authenticated: boolean } | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiPlan, setAiPlan] = useState<AuraAiPlan | null>(null);
  const [planning, setPlanning] = useState("");
  const [beatNotice, setBeatNotice] = useState("");
  const filesInput = useRef<HTMLInputElement>(null);
  const musicInput = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);
  const preview = useRef<AudioContext | null>(null);
  const urls = useRef(new Set<string>());
  const mounted = useRef(true);
  const lock = useRef(false);
  const busy = !hydrated || inspecting || progress !== null || !!planning;
  let plan: ReturnType<typeof planAura> = [];
  try { if (clips.length) plan = aiPlan ? compileAuraAiPlan(aiPlan, clips, settings) : planAura(clips, settings); } catch { /* Invalid fields are explained on export. */ }
  const previewClip = clips[plan[0]?.source ?? 0];
  const previewStyle = plan[0]?.style ?? settings.style;
  const musicTooShort = settings.music === "upload" && (!music || settings.musicOffset + settings.seconds > music.buffer.duration + 0.01);

  useEffect(() => {
    mounted.current = true;
    // Browser-only file controls must not accept an upload before handlers attach.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
    const configAbort = new AbortController();
    void fetch("/api/aura/plan", { signal: configAbort.signal, cache: "no-store" })
      .then(async response => {
        if (!response.ok) return;
        const data = await response.json() as { enabled?: boolean; authenticated?: boolean };
        if (mounted.current && !configAbort.signal.aborted) setAiConfig({ enabled: data.enabled === true, authenticated: data.authenticated === true });
      }).catch(() => {});
    const assets = urls.current;
    return () => {
      mounted.current = false;
      configAbort.abort();
      controller.current?.abort();
      void preview.current?.close().catch(() => {});
      assets.forEach(url => URL.revokeObjectURL(url));
      assets.clear();
    };
  }, []);

  function stopPreview() {
    void preview.current?.close().catch(() => {});
    preview.current = null;
    setListening(false);
  }
  function invalidate(keepAi = false) {
    if (result) { URL.revokeObjectURL(result.url); urls.current.delete(result.url); }
    setResult(null);
    setError("");
    if (!keepAi) setAiPlan(null);
    stopPreview();
  }
  function change(patch: Partial<AuraSettings>) {
    invalidate(Object.keys(patch).every(key => key === "shape" || key === "fit"));
    setSettings(current => ({ ...current, ...patch }));
  }
  async function addClips(files: FileList | File[]) {
    if (lock.current) return;
    const incoming = Array.from(files);
    if (!incoming.length) return;
    setError("");
    if (clips.length + incoming.length > MAX_AURA_FILES) { setError("Use up to 8 clips per edit."); return; }
    if (incoming.some(file => !file.size || file.size > MAX_AURA_FILE_BYTES || !/\.(mp4|mov|m4v|webm)$/i.test(file.name))) {
      setError("Choose MP4, MOV, M4V, or WebM clips up to 100 MB each."); return;
    }
    if ([...clips.map(clip => clip.file), ...incoming].reduce((sum, file) => sum + file.size, 0) > MAX_AURA_TOTAL_BYTES) {
      setError("Keep the total size of your clips under 400 MB."); return;
    }
    lock.current = true; setInspecting(true);
    const added: Clip[] = [];
    try {
      const { inspectAuraClip } = await import("@/lib/aura-render");
      for (const file of incoming) {
        const duration = await inspectAuraClip(file);
        if (!mounted.current) return;
        const url = URL.createObjectURL(file); urls.current.add(url);
        added.push({ id: crypto.randomUUID(), file, duration, start: 0, url });
      }
      invalidate();
      setClips(current => [...current, ...added]);
    } catch (e) {
      added.forEach(clip => { URL.revokeObjectURL(clip.url); urls.current.delete(clip.url); });
      if (mounted.current) setError(e instanceof Error ? e.message : "These clips could not be opened.");
    } finally { lock.current = false; if (mounted.current) setInspecting(false); }
  }
  async function addMusic(file?: File) {
    if (!file || lock.current) return;
    lock.current = true; setInspecting(true); setError(""); stopPreview();
    try {
      const { decodeAuraMusic } = await import("@/lib/aura-render");
      const buffer = await decodeAuraMusic(file);
      if (!mounted.current) return;
      invalidate(); setMusic({ name: file.name, buffer });
      setBeatNotice("");
      setSettings(current => ({ ...current, music: "upload", musicOffset: 0 }));
    } catch (e) {
      if (mounted.current) setError(e instanceof Error ? e.message : "This music could not be read. Try MP3 or WAV.");
    } finally { lock.current = false; if (mounted.current) setInspecting(false); }
  }
  function remove(id: string) {
    invalidate();
    const clip = clips.find(item => item.id === id)!;
    URL.revokeObjectURL(clip.url); urls.current.delete(clip.url);
    setClips(current => current.filter(item => item.id !== id));
  }
  function move(index: number, direction: number) {
    invalidate();
    setClips(current => {
      const next = [...current];
      [next[index], next[index + direction]] = [next[index + direction], next[index]];
      return next;
    });
  }
  async function listen() {
    if (preview.current) { stopPreview(); return; }
    const context = new AudioContext(); preview.current = context;
    setListening(true); setError("");
    try {
      await context.resume();
      const { auraSoundtrack } = await import("@/lib/aura-render");
      if (preview.current !== context || !mounted.current) return;
      const source = context.createBufferSource();
      source.buffer = auraSoundtrack(settings, music?.buffer, Math.min(8, settings.seconds));
      source.connect(context.destination);
      source.onended = () => { if (preview.current === context) stopPreview(); };
      source.start();
    } catch (e) {
      if (mounted.current && preview.current === context) { stopPreview(); setError(e instanceof Error ? e.message : "Music preview is unavailable."); }
    }
  }
  async function render() {
    if (lock.current) return;
    lock.current = true; invalidate(true); setProgress(0);
    const abort = new AbortController(); controller.current = abort;
    try {
      const { renderAura } = await import("@/lib/aura-render");
      const file = await renderAura(clips, settings, music?.buffer, value => { if (mounted.current) setProgress(value); }, abort.signal, aiPlan ?? undefined);
      if (!mounted.current || abort.signal.aborted) return;
      const url = URL.createObjectURL(file); urls.current.add(url);
      setResult({ file, url });
    } catch (e) {
      if (mounted.current) setError(abort.signal.aborted ? "Export canceled. Your clips and settings are still here." : e instanceof Error ? e.message : "This edit could not be exported.");
    } finally { lock.current = false; controller.current = null; if (mounted.current) setProgress(null); }
  }

  async function planWithAi() {
    if (lock.current || !aiConfig?.enabled || !aiConfig.authenticated) return;
    lock.current = true; stopPreview(); setError(""); setPlanning("Reading clip previews…");
    const abort = new AbortController(); controller.current = abort;
    const timeout = setTimeout(() => abort.abort(), 65000);
    try {
      const { sampleAuraClips } = await import("@/lib/aura-render");
      const sampled = await sampleAuraClips(clips, abort.signal);
      abort.signal.throwIfAborted();
      if (!mounted.current) return;
      setPlanning("Planning your edit…");
      const response = await fetch("/api/aura/plan", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: abort.signal,
        body: JSON.stringify({ prompt: aiPrompt, clips: sampled, settings: { seconds: settings.seconds, bpm: settings.bpm, style: settings.style }, ...(aiPlan ? { previousPlan: aiPlan } : {}) }),
      });
      const data = await response.json() as { plan?: unknown; error?: string };
      if (!response.ok) {
        if (response.status === 401) setAiConfig(current => current ? { ...current, authenticated: false } : current);
        throw new Error(data.error || "The AI could not plan this edit.");
      }
      const parsedPlan = auraAiPlanSchema.safeParse(data.plan);
      if (!parsedPlan.success) throw new Error("The AI returned an invalid edit plan. Your current edit is unchanged.");
      const validatedPlan = parsedPlan.data;
      compileAuraAiPlan(validatedPlan, clips, settings);
      if (!mounted.current || abort.signal.aborted) return;
      invalidate(true); setAiPlan(validatedPlan); setAiPrompt("");
    } catch (e) {
      if (mounted.current) setError(abort.signal.aborted ? "AI planning stopped. Your current edit is unchanged. Submitted requests may still count toward your daily limit." : e instanceof Error ? e.message : "The AI could not plan this edit.");
    } finally {
      clearTimeout(timeout); lock.current = false; controller.current = null;
      if (mounted.current) setPlanning("");
    }
  }

  async function findBeat() {
    if (!music || lock.current) return;
    lock.current = true; setInspecting(true); setBeatNotice("");
    try {
      const { estimateAuraBeat } = await import("@/lib/aura-beats");
      const estimate = estimateAuraBeat(music.buffer);
      if (!mounted.current) return;
      if (!estimate) { setBeatNotice("A steady beat couldn’t be found. Enter the tempo and start point manually."); return; }
      change({ bpm: estimate.bpm, musicOffset: estimate.offset });
      setBeatNotice(`Estimated ${estimate.bpm} BPM. Preview the timing and adjust if the track uses a different tempo or beat offset.`);
    } catch {
      if (mounted.current) setBeatNotice("Beat analysis is unavailable. You can still enter the tempo and start point manually.");
    } finally { lock.current = false; if (mounted.current) setInspecting(false); }
  }

  return (
    <div className="aura-page">
      <a className="skip-link" href="#aura-main">Skip to editor</a>
      <header className="aura-header">
        <Brand />
        <nav aria-label="Aura navigation"><Link href="/studio"><ArrowLeft size={15} /> Video studio</Link><span><Sparkles size={14} /> Aura edits</span></nav>
      </header>
      <main id="aura-main" className="aura-main">
        <div className="aura-intro"><div><span className="aura-eyebrow">YOUR CLIPS. YOUR MAIN CHARACTER MOMENT.</span><h1>Make an <em>aura edit.</em></h1><p>Drop your clips. Pick the energy. Let the beat do the cutting.</p></div><span className="aura-local"><Check size={14} /> Free export · On your device</span></div>
        <div className="aura-workspace">
          <div className="aura-controls">
            <fieldset disabled={busy} className="aura-section">
              <legend><span>01</span> Your footage</legend>
              <p>Up to 8 clips · 100 MB each · 2 minutes per clip</p>
              <input ref={filesInput} type="file" multiple accept="video/mp4,video/quicktime,video/webm,.mp4,.mov,.m4v,.webm" className="sr-only" aria-label="Upload aura clips" onChange={e => { if (e.target.files) void addClips(e.target.files); e.target.value = ""; }} />
              <button type="button" className={`aura-drop ${dragging ? "is-dragging" : ""}`} onClick={() => filesInput.current?.click()} onDragOver={e => { e.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={e => { e.preventDefault(); setDragging(false); if (!busy) void addClips(e.dataTransfer.files); }}>
                {inspecting ? <Film size={24} /> : <Upload size={24} />}<strong>{inspecting ? "Checking your files…" : clips.length ? "Add more clips" : "Drop your clips here"}</strong><span>or click to browse · MP4, MOV, WebM</span>
              </button>
              {clips.length > 0 && <ol className="aura-clips">{clips.map((clip, index) => <li key={clip.id}>
                <video src={`${clip.url}#t=${clip.start}`} muted playsInline preload="metadata" aria-label={`Clip ${index + 1} thumbnail`} />
                <div className="aura-clip-info"><strong>{clip.file.name}</strong><span>{clip.duration.toFixed(1)}s</span><label>Start at <input aria-label={`Clip ${index + 1} start time`} type="number" min={0} max={Math.max(0, clip.duration - 0.5)} step="0.1" value={clip.start} onChange={e => { invalidate(); const start = Math.max(0, Math.min(clip.duration - 0.5, Number(e.target.value))); setClips(current => current.map(item => item.id === clip.id ? { ...item, start } : item)); }} /> s</label></div>
                <div className="aura-clip-actions"><button type="button" aria-label={`Move clip ${index + 1} earlier`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={15} /></button><button type="button" aria-label={`Move clip ${index + 1} later`} disabled={index === clips.length - 1} onClick={() => move(index, 1)}><ArrowDown size={15} /></button><button type="button" aria-label={`Remove clip ${index + 1}`} onClick={() => remove(clip.id)}><Trash2 size={15} /></button></div>
              </li>)}</ol>}
              {clips.length > 0 && <p>Clips play in this order. Longer edits revisit different moments from your footage.</p>}
            </fieldset>
            <section className="aura-ai" aria-labelledby="aura-ai-heading">
              <div className="aura-ai-heading"><h2 id="aura-ai-heading"><Sparkles size={18} /> Direct your edit</h2><span>Optional · AI</span></div>
              <p>Describe the pacing and moments you want. AI suggests the cuts; you review and export.</p>
              <label className="sr-only" htmlFor="aura-ai-prompt">AI edit instructions</label>
              <textarea id="aura-ai-prompt" maxLength={1500} value={aiPrompt} disabled={busy} onChange={e => setAiPrompt(e.target.value)} placeholder={aiPlan ? "Make it faster, or use more of clip 2…" : "Start slow, then make an aggressive edit. Put the best reveal on a beat."} />
              <p className="aura-ai-disclosure">Planning sends your instructions and 3 small frames per clip to OpenAI. Full videos and music stay on your device. Daily planning limits apply.</p>
              {aiConfig?.enabled && aiConfig.authenticated ? <button type="button" className="aura-secondary" disabled={busy || !plan.length || musicTooShort || aiPrompt.trim().length < 5} onClick={() => void planWithAi()}><Sparkles size={15} />{planning || (aiPlan ? "Revise AI plan" : "Plan with AI")}</button> : aiConfig?.enabled ? <p><Link href="/login?next=%2Faura" target="_blank" rel="noreferrer">Sign in to use AI planning</Link>. Keep this tab open to preserve your clips, then <button type="button" className="aura-inline-action" onClick={() => { void fetch("/api/aura/plan", { cache: "no-store" }).then(r => r.json() as Promise<{ enabled?: boolean; authenticated?: boolean }>).then(data => setAiConfig({ enabled: data.enabled === true, authenticated: data.authenticated === true })).catch(() => setError("Could not check sign-in. Try again.")); }}>check sign-in</button>.</p> : <p className="aura-ai-unavailable">AI planning isn’t connected yet. All manual editing tools are available below.</p>}
              {planning && <p role="status">{planning} <button type="button" className="aura-inline-action" onClick={() => controller.current?.abort()}>Cancel planning</button></p>}
              {aiPlan && <div className="aura-ai-plan"><strong>AI plan ready · {plan.length} shots</strong><p>{aiPlan.summary}</p><details><summary>Review the cuts</summary><ol>{plan.map((shot, index) => <li key={index}><strong>Clip {shot.source + 1}</strong><span>{shot.sourceStart.toFixed(1)}–{(shot.sourceStart + shot.sourceSpan).toFixed(1)}s → {(shot.frames / 30).toFixed(1)}s</span><span>{AURA_STYLES.find(style => style.id === shot.style)?.name}</span></li>)}</ol></details><button type="button" className="aura-inline-action" disabled={busy} onClick={() => invalidate()}>Use manual cuts instead</button></div>}
            </section>
            <fieldset disabled={busy} className="aura-section"><legend><span>02</span> Choose the energy</legend>{aiPlan && <p>Choosing a style returns to manual cuts. Use the prompt above to revise the AI plan.</p>}<div className="aura-styles">{AURA_STYLES.map((style, index) => <button type="button" key={style.id} aria-pressed={!aiPlan && settings.style === style.id} className={`aura-style aura-style-${style.id}`} onClick={() => change({ style: style.id })}><span className="aura-style-mark" aria-hidden="true">{["↗", "◐", "∥"][index]}</span><strong>{style.name}</strong><span>{style.description}</span>{!aiPlan && settings.style === style.id && <Check className="aura-style-check" size={15} />}</button>)}</div></fieldset>
            <fieldset disabled={busy} className="aura-section"><legend><span>03</span> Set the soundtrack</legend><p>Included original beats, or music you have permission to use. The soundtrack replaces clip audio.</p>
              <div className="aura-tracks">{AURA_TRACKS.map(track => <button type="button" key={track.id} aria-pressed={settings.music === track.id} onClick={() => change({ music: track.id, bpm: track.bpm, musicOffset: 0 })}><Music2 size={18} /><span><strong>{track.name}</strong><small>{track.description}</small></span><b>{track.bpm} BPM</b>{settings.music === track.id && <Check size={15} />}</button>)}</div>
              <div className="aura-music-actions"><input ref={musicInput} type="file" accept="audio/*,.mp3,.wav,.m4a" className="sr-only" aria-label="Upload aura music" onChange={e => { void addMusic(e.target.files?.[0]); e.target.value = ""; }} /><button type="button" className="aura-secondary" onClick={() => musicInput.current?.click()}><Plus size={15} /> Upload music</button><button type="button" className="aura-secondary" onClick={() => void listen()} disabled={musicTooShort}>{listening ? <Pause size={15} /> : <Play size={15} />}{listening ? "Stop preview" : "Preview music"}</button></div>
              {music && <button type="button" className="aura-uploaded-music" aria-pressed={settings.music === "upload"} onClick={() => change({ music: "upload" })}><Music2 size={16} /><span>{music.name}</span><small>{music.buffer.duration.toFixed(1)}s</small>{settings.music === "upload" && <Check size={15} />}</button>}
              {settings.music === "upload" && <div className="aura-music-timing"><label>Track tempo (BPM)<input type="number" min={60} max={200} value={settings.bpm} onChange={e => change({ bpm: Number(e.target.value) })} /></label><label>First beat / start (seconds)<input type="number" min={0} max={music?.buffer.duration ?? 0} step="0.01" value={settings.musicOffset} onChange={e => change({ musicOffset: Number(e.target.value) })} /></label><p>Enter the track’s BPM and start on a beat, or <button type="button" className="aura-inline-action" onClick={() => void findBeat()}>Estimate beat timing</button>. Check the estimate before exporting.</p>{beatNotice && <p role="status">{beatNotice}</p>}</div>}
              {musicTooShort && <p className="aura-inline-error">Your music needs {settings.seconds} seconds after the selected start point.</p>}
            </fieldset>
          </div>
          <aside className="aura-output" aria-label="Edit preview and export">
            <div className="aura-preview" style={{ aspectRatio: settings.shape.replace(":", "/") }}>
              {result ? <video key={result.url} src={result.url} controls playsInline preload="metadata" aria-label="Finished aura edit" /> : previewClip ? <><video key={`${previewClip.id}-${plan[0]?.sourceStart ?? previewClip.start}`} src={`${previewClip.url}#t=${plan[0]?.sourceStart ?? previewClip.start}`} muted playsInline preload="metadata" style={{ objectFit: settings.fit, filter: AURA_STYLES.find(style => style.id === previewStyle)?.filter }} aria-label="Source clip with selected color treatment" /><span className="aura-preview-label">Style preview · Export to see the full edit</span></> : <div className="aura-empty-preview"><Film size={36} strokeWidth={1} /><strong>Your moment goes here.</strong><span>Add footage to get started.</span></div>}
              {progress !== null && <div className="aura-render-progress" role="status"><Sparkles size={24} /><strong>{progress >= 0.95 ? "Finishing your MP4…" : "Making your edit…"}</strong><progress value={progress} max={1} aria-label="Export progress" /><span>{Math.round(progress * 100)}% · Keep this tab open</span><button type="button" onClick={() => controller.current?.abort()}><X size={15} /> Cancel export</button></div>}
            </div>
            {plan.length > 0 && <div className="aura-timeline" aria-label={`${plan.length} shots timed to ${settings.bpm} beats per minute`}>{plan.map((shot, i) => <span key={i} style={{ flexGrow: shot.frames, opacity: 0.5 + (shot.source % 3) * 0.2 }} title={`Shot ${i + 1}: clip ${shot.source + 1}`} />)}</div>}
            <fieldset disabled={busy} className="aura-export-settings"><legend className="sr-only">Export settings</legend><label>Length<select aria-label="Length" value={settings.seconds} onChange={e => change({ seconds: Number(e.target.value) })}><option value={8}>8 seconds</option><option value={12}>12 seconds</option><option value={20}>20 seconds</option><option value={30}>30 seconds</option></select></label><label>Format<select aria-label="Format" value={settings.shape} onChange={e => change({ shape: e.target.value as AuraSettings["shape"] })}><option value="9:16">9:16 · Reels / TikTok</option><option value="16:9">16:9 · Landscape</option><option value="1:1">1:1 · Square</option></select></label><label>Framing<select aria-label="Framing" value={settings.fit} onChange={e => change({ fit: e.target.value as AuraSettings["fit"] })}><option value="cover">Fill frame · center crop</option><option value="contain">Fit · keep entire clip</option></select></label></fieldset>
            <div className="aura-export-summary"><span>{plan.length || "—"} shots · {settings.bpm} BPM</span><span>720p · 30 fps · MP4</span></div>
            {error && <p className="aura-error" role="alert">{error}</p>}
            {result ? <a className="aura-primary" href={result.url} download={result.file.name}><Download size={18} /> Download your edit <span>{(result.file.size / 1024 / 1024).toFixed(1)} MB</span></a> : <button type="button" className="aura-primary" disabled={busy || !plan.length || musicTooShort || !Number.isFinite(settings.musicOffset) || settings.musicOffset < 0} onClick={() => void render()}><Sparkles size={18} />{progress !== null ? "Exporting…" : "Create aura edit"}<ArrowUpRight size={18} /></button>}
            <p className="aura-footnote">Video and audio files stay on this device. AI planning sends only sampled frames and instructions. Download before leaving; edits aren’t saved to your account. Works best in the latest Chrome or Safari.</p>
          </aside>
        </div>
      </main>
    </div>
  );
}
