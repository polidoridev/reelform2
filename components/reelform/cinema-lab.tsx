"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Camera, Clapperboard, Copy, Download, Film, Plus, Trash2 } from "lucide-react";
import { CAMERA_CONTROLS, LOOK_CONTROLS, CINEMA_CONTROLS, CINEMA_PRESETS, CINEMA_PROMPT_LIMIT, DEFAULT_DIRECTION, MAX_CINEMA_SHOTS, compileCinemaPrompt, createCinemaSequence, initialCinemaPlan, newCinemaShot, parseCinemaPlan, type CinemaControl, type CinemaPlan, type CinemaShot } from "@/lib/cinema-lab";
import "./cinema-lab.css";

const STORAGE_KEY = "reelform-cinemalab-plan-v1";
export const CINEMA_STEPS = ["Scene", "Camera", "Look", "Sequence", "Output", "Review"] as const;
export type CinemaStep = typeof CINEMA_STEPS[number];
const stepDescriptions: Record<CinemaStep, string> = {
  Scene: "Start with the subject, action, and setting for your shot.",
  Camera: "Choose how the camera sees and follows the scene.",
  Look: "Shape the lighting, color, and texture. These choices are optional.",
  Sequence: "Keep one shot, or plan a sequence with shared continuity notes.",
  Output: "Choose your model and video settings. Add references if you have them.",
  Review: "Review your prompt, confirm the credit cost, then generate this shot.",
};

export default function CinemaLab({ disabled, prompt, onApply, step, onStepChange, children }: {
  disabled: boolean;
  prompt: string;
  onApply: (prompt: string) => void;
  step: CinemaStep;
  onStepChange: (step: CinemaStep) => void;
  children: ReactNode;
}) {
  const [plan, setPlan] = useState<CinemaPlan>(initialCinemaPlan);
  const lastApplied = useRef("");
  const startsInReview = useRef(step === "Review");
  const heading = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(step);
  useEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [step]);
  const [loaded, setLoaded] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const restored = saved ? parseCinemaPlan(JSON.parse(saved)) : null;
      // Restore browser-only drafts after hydration without overwriting storage first.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (restored) setPlan(restored);
      // A saved generation already has its own prompt. Keep it when revisiting Output.
      if (startsInReview.current) {
        const baseline = restored ?? initialCinemaPlan();
        const selected = baseline.shots.find(item => item.id === baseline.selected) ?? baseline.shots[0];
        lastApplied.current = `${selected.id}:${compileCinemaPrompt(selected, baseline.continuity)}`;
      }
    } catch { setStorageError(true); }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(plan)); }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    catch { setStorageError(true); }
  }, [plan, loaded]);

  const shot = plan.shots.find(item => item.id === plan.selected) ?? plan.shots[0];
  const index = plan.shots.indexOf(shot);
  const compiled = compileCinemaPrompt(shot, plan.continuity);
  const valid = shot.scene.trim().length >= 10 && compiled.length <= CINEMA_PROMPT_LIMIT;
  const stepIndex = CINEMA_STEPS.indexOf(step);
  const planning = stepIndex < 4;
  const locked = disabled || !loaded;

  function navigate(next: CinemaStep) {
    if (locked) return;
    if (next === "Review") {
      const revision = `${shot.id}:${compiled}`;
      const needsApply = lastApplied.current !== revision || !prompt.trim();
      if (needsApply && !valid) {
        setNotice(shot.scene.trim().length < 10 ? "Describe your shot in at least 10 characters before reviewing." : `Shorten your scene or continuity notes by ${compiled.length - CINEMA_PROMPT_LIMIT} characters before reviewing.`);
        onStepChange("Scene");
        requestAnimationFrame(() => heading.current?.focus());
        return;
      }
      // Returning to Review preserves manual prompt edits unless the shot direction changed.
      if (needsApply) onApply(compiled);
      lastApplied.current = revision;
    }
    setNotice("");
    onStepChange(next);
  }

  function updateShot(patch: Partial<CinemaShot>) {
    setPlan(previous => ({ ...previous, shots: previous.shots.map(item => item.id === shot.id ? { ...item, ...patch } : item) }));
    setNotice("");
  }
  function addShot(duplicate = false) {
    if (plan.shots.length >= MAX_CINEMA_SHOTS) return;
    const added = duplicate ? { ...shot, id: crypto.randomUUID(), title: `${shot.title.slice(0, 70)} · Take 2` } : newCinemaShot(crypto.randomUUID(), `Shot ${plan.shots.length + 1}`);
    setPlan(previous => ({ ...previous, selected: added.id, shots: [...previous.shots, added] }));
    onStepChange("Scene");
    setNotice(duplicate ? "Shot duplicated. Change the camera or look to plan another take." : "New shot added.");
  }
  function moveShot(offset: number) {
    const next = index + offset;
    if (next < 0 || next >= plan.shots.length) return;
    const shots = [...plan.shots];
    [shots[index], shots[next]] = [shots[next], shots[index]];
    setPlan(previous => ({ ...previous, shots }));
  }
  function removeShot() {
    if (plan.shots.length === 1) return;
    const shots = plan.shots.filter(item => item.id !== shot.id);
    setPlan(previous => ({ ...previous, shots, selected: shots[Math.min(index, shots.length - 1)].id }));
    setNotice("Shot removed from your plan.");
  }
  function buildSequence() {
    const shots = createCinemaSequence(shot.scene, shot.direction, () => crypto.randomUUID());
    const next = [...plan.shots.slice(0, index), ...shots, ...plan.shots.slice(index + 1)];
    if (next.length > MAX_CINEMA_SHOTS) return;
    setPlan(previous => ({ ...previous, shots: next, selected: shots[0].id }));
    setNotice("Expanded this scene into three editable shots. Review each one before generating.");
  }
  function downloadPlan() {
    const text = ["# Reelform CinemaLab — Shot plan", "", ...plan.shots.flatMap((item, i) => [`## ${i + 1}. ${item.title}`, "", compileCinemaPrompt(item, plan.continuity), ""])].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "reelform-cinemalab-shot-plan.md";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function controls(keys: CinemaControl[]) {
    return <div className="cinemalab-controls">{keys.map(key => <label key={key}>
      {CINEMA_CONTROLS[key].label}
      <select aria-label={CINEMA_CONTROLS[key].label} value={shot.direction[key]} onChange={event => updateShot({ direction: { ...shot.direction, [key]: event.target.value } })}>
        {CINEMA_CONTROLS[key].options.map(value => <option key={value}>{value}</option>)}
      </select>
    </label>)}</div>;
  }

  return <section className="cinemalab" aria-label="CinemaLab shot planner">
    <div className="cinemalab-heading">
      <div><span className="cinemalab-eyebrow"><Clapperboard size={15} /> REELFORM CINEMALAB</span><h1>Build your shot, one step at a time.</h1></div>
      <span className="cinemalab-draft">{storageError ? "Draft in this tab" : "Draft saved on this device"}</span>
    </div>
    <nav className="cinemalab-steps" aria-label="CinemaLab steps">
      <ol>{CINEMA_STEPS.map((item, i) => <li key={item}><button type="button" disabled={locked} aria-label={`${i + 1}. ${item}`} aria-current={step === item ? "step" : undefined} onClick={() => navigate(item)}><span>{i + 1}</span>{item}</button></li>)}</ol>
    </nav>
    <div className="cinemalab-workspace">
      <div className="cinemalab-step-heading">
        <span>STEP {stepIndex + 1} OF {CINEMA_STEPS.length}</span>
        <h2 ref={heading} tabIndex={-1}>{step === "Review" ? "Review & generate" : step}</h2>
        <p>{stepDescriptions[step]}</p>
      </div>
      {planning && <fieldset disabled={locked} className="cinemalab-planning">
        <legend className="sr-only">{step} settings</legend>
        <div className="cinemalab-panel">
          {step === "Scene" && <>
            <div className="cinemalab-scene-heading"><Camera size={17} /><span>SHOT {String(index + 1).padStart(2, "0")}</span></div>
            <label>Shot name<input value={shot.title} maxLength={80} onChange={event => updateShot({ title: event.target.value })} /></label>
            <label>What happens in this shot?<textarea rows={4} maxLength={1000} value={shot.scene} onChange={event => updateShot({ scene: event.target.value })} placeholder="A woman in a red coat steps out of a midnight diner. Rain catches the neon light as she turns toward the camera…" /></label>
            <p className="cinemalab-help">Describe the subject, action, and setting. Add reference photos in the Output step and use @image1 to refer to the first photo.</p>
            <div className="cinemalab-preset-heading">START WITH A LOOK</div>
            <div className="cinemalab-presets">{CINEMA_PRESETS.map(preset => <button type="button" key={preset.name} onClick={() => { updateShot({ direction: { ...DEFAULT_DIRECTION, ...preset.direction } }); setNotice(`${preset.name} applied. You can adjust it in the Camera and Look steps.`); }}>{preset.name}<ArrowRight size={13} /></button>)}</div>
          </>}
          {step === "Camera" && <><p className="cinemalab-help">Lens, focus, and movement describe the look you want. The model interprets this direction; exact optics and motion may vary.</p>{controls(CAMERA_CONTROLS)}</>}
          {step === "Look" && <><p className="cinemalab-help">Shape the lighting, color, and texture of this shot.</p>{controls(LOOK_CONTROLS)}<button className="cinemalab-text-button" type="button" onClick={() => updateShot({ direction: { ...DEFAULT_DIRECTION } })}>Reset camera and look</button></>}
          {step === "Sequence" && <>
            <aside className="cinemalab-shotlist" aria-label="Planned shots">
              <div className="cinemalab-list-heading"><span>SHOT LIST</span><span>{plan.shots.length} / {MAX_CINEMA_SHOTS}</span></div>
              <ol>{plan.shots.map((item, i) => <li key={item.id}><button type="button" aria-pressed={item.id === shot.id} onClick={() => { setPlan(previous => ({ ...previous, selected: item.id })); setNotice("Selected shot. Use the Scene, Camera, and Look steps to edit it."); }}>
                <span className="cinemalab-shot-number">{String(i + 1).padStart(2, "0")}</span><span><strong>{item.title || "Untitled shot"}</strong><small>{item.direction.framing === "Director's choice" ? "Choose your frame" : item.direction.framing}</small></span>
              </button></li>)}</ol>
              <button className="cinemalab-add" type="button" disabled={plan.shots.length >= MAX_CINEMA_SHOTS} onClick={() => addShot()}><Plus size={14} /> Add shot</button>
              <p>Each shot is generated separately. Your current shot is {index + 1}: {shot.title || "Untitled shot"}.</p>
            </aside>
            <p className="cinemalab-help">Expand this scene into an establishing shot, an action shot, and a detail. This is an editable structure; it does not generate or charge for videos.</p>
            <button className="cinemalab-secondary" type="button" disabled={shot.scene.trim().length < 10 || plan.shots.length + 2 > MAX_CINEMA_SHOTS} onClick={buildSequence}><Film size={15} /> Expand into 3 shots</button>
            <label>Continuity notes for every shot<textarea rows={3} maxLength={400} value={plan.continuity} onChange={event => setPlan(previous => ({ ...previous, continuity: event.target.value }))} placeholder="Same red coat, silver watch, wet pavement, midnight. Keep the subject and location consistent." /></label>
            <p className="cinemalab-help">Reuse the same photos across generations to guide continuity. Appearance may still vary between shots.</p>
            <div className="cinemalab-shot-actions">
              <button type="button" onClick={() => addShot(true)} disabled={plan.shots.length >= MAX_CINEMA_SHOTS}><Copy size={14} /> Duplicate shot</button>
              <button type="button" aria-label="Move shot earlier" disabled={index === 0} onClick={() => moveShot(-1)}><ArrowUp size={14} /></button>
              <button type="button" aria-label="Move shot later" disabled={index === plan.shots.length - 1} onClick={() => moveShot(1)}><ArrowDown size={14} /></button>
              <button type="button" aria-label="Remove selected shot" disabled={plan.shots.length === 1} onClick={removeShot}><Trash2 size={14} /></button>
            </div>
            <button className="cinemalab-text-button" type="button" onClick={downloadPlan}><Download size={14} /> Download shot plan</button>
          </>}
        </div>
      </fieldset>}
      <div className="cinemalab-generation" hidden={planning}>{children}</div>
      <div className="cinemalab-navigation">
        <button type="button" className="cinemalab-secondary" disabled={locked || stepIndex === 0} onClick={() => navigate(CINEMA_STEPS[stepIndex - 1])}><ArrowLeft size={15} /> Back</button>
        <span>{step === "Sequence" ? "A single shot is fine. Continue when you’re ready." : step === "Review" ? "Generation only starts when you press Generate shot." : "Your choices stay with you as you move between steps."}</span>
        {stepIndex < CINEMA_STEPS.length - 1 && <button type="button" className="cinemalab-primary" disabled={locked} onClick={() => navigate(CINEMA_STEPS[stepIndex + 1])}>{step === "Output" ? "Review shot" : "Continue"}<ArrowRight size={15} /></button>}
      </div>
    </div>
    <div className="cinemalab-status" role="status">{notice || (storageError ? "Browser storage is unavailable. Download your shot plan to keep a copy." : "Planning is free. Credits are only used when you generate a shot.")}</div>
  </section>;
}
