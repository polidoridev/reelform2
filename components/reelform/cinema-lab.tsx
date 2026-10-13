"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, Camera, Check, Clapperboard, Copy, Download, Film, Plus, Trash2 } from "lucide-react";
import { CAMERA_CONTROLS, LOOK_CONTROLS, CINEMA_CONTROLS, CINEMA_PRESETS, CINEMA_PROMPT_LIMIT, DEFAULT_DIRECTION, MAX_CINEMA_SHOTS, compileCinemaPrompt, createCinemaSequence, initialCinemaPlan, newCinemaShot, parseCinemaPlan, type CinemaControl, type CinemaPlan, type CinemaShot } from "@/lib/cinema-lab";
import "./cinema-lab.css";

const STORAGE_KEY = "reelform-cinemalab-plan-v1";
const tabs = ["Scene", "Camera", "Look", "Sequence"] as const;
type Tab = typeof tabs[number];

export default function CinemaLab({ disabled, prompt, onApply }: { disabled: boolean; prompt: string; onApply: (prompt: string) => void }) {
  const [plan, setPlan] = useState<CinemaPlan>(initialCinemaPlan);
  const [tab, setTab] = useState<Tab>("Scene");
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
  const applied = !!compiled && prompt === compiled;
  const locked = disabled || !loaded;

  function updateShot(patch: Partial<CinemaShot>) {
    setPlan(previous => ({ ...previous, shots: previous.shots.map(item => item.id === shot.id ? { ...item, ...patch } : item) }));
    setNotice("");
  }
  function addShot(duplicate = false) {
    if (plan.shots.length >= MAX_CINEMA_SHOTS) return;
    const added = duplicate ? { ...shot, id: crypto.randomUUID(), title: `${shot.title.slice(0, 70)} · Take 2` } : newCinemaShot(crypto.randomUUID(), `Shot ${plan.shots.length + 1}`);
    setPlan(previous => ({ ...previous, selected: added.id, shots: [...previous.shots, added] }));
    setTab("Scene");
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
      <div><span className="cinemalab-eyebrow"><Clapperboard size={15} /> REELFORM CINEMALAB</span><h2>Every frame starts with a decision.</h2><p>Find your angle. Shape the light. Build the scene.</p></div>
      <span className="cinemalab-draft">{storageError ? "Draft in this tab" : "Draft saved on this device"}</span>
    </div>
    <fieldset disabled={locked} className="cinemalab-workspace">
      <legend className="sr-only">Plan your cinematic shots</legend>
      <aside className="cinemalab-shotlist" aria-label="Planned shots">
        <div className="cinemalab-list-heading"><span>SHOT LIST</span><span>{plan.shots.length} / {MAX_CINEMA_SHOTS}</span></div>
        <ol>{plan.shots.map((item, i) => <li key={item.id}><button type="button" aria-pressed={item.id === shot.id} onClick={() => { setPlan(previous => ({ ...previous, selected: item.id })); setNotice(""); }}>
          <span className="cinemalab-shot-number">{String(i + 1).padStart(2, "0")}</span><span><strong>{item.title || "Untitled shot"}</strong><small>{item.direction.framing === "Director's choice" ? "Choose your frame" : item.direction.framing}</small></span>
        </button></li>)}</ol>
        <button className="cinemalab-add" type="button" disabled={plan.shots.length >= MAX_CINEMA_SHOTS} onClick={() => addShot()}><Plus size={14} /> Add shot</button>
        <p>A shot plan, ready to make. Generate each shot separately below.</p>
      </aside>
      <div className="cinemalab-detail">
        <div className="cinemalab-tabs" role="tablist" aria-label="Shot controls">{tabs.map((item, i) => <button key={item} type="button" id={`cinemalab-tab-${item}`} role="tab" aria-selected={tab === item} aria-controls={`cinemalab-panel-${item}`} tabIndex={tab === item ? 0 : -1} onClick={() => setTab(item)} onKeyDown={event => {
          const next = event.key === "ArrowRight" ? (i + 1) % tabs.length : event.key === "ArrowLeft" ? (i + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
          if (next !== null) { event.preventDefault(); setTab(tabs[next]); document.getElementById(`cinemalab-tab-${tabs[next]}`)?.focus(); }
        }}>{item}</button>)}</div>
        <div className="cinemalab-panel" role="tabpanel" id={`cinemalab-panel-${tab}`} aria-labelledby={`cinemalab-tab-${tab}`} tabIndex={0}>
          {tab === "Scene" && <>
            <div className="cinemalab-scene-heading"><Camera size={17} /><span>SHOT {String(index + 1).padStart(2, "0")}</span></div>
            <label>Shot name<input value={shot.title} maxLength={80} onChange={event => updateShot({ title: event.target.value })} /></label>
            <label>What happens in this shot?<textarea rows={4} maxLength={1000} value={shot.scene} onChange={event => updateShot({ scene: event.target.value })} placeholder="A woman in a red coat steps out of a midnight diner. Rain catches the neon light as she turns toward the camera…" /></label>
            <p className="cinemalab-help">Describe the subject, action, and setting. Add reference photos below and use @image1 to refer to the first photo.</p>
            <div className="cinemalab-preset-heading">START WITH A LOOK</div>
            <div className="cinemalab-presets">{CINEMA_PRESETS.map(preset => <button type="button" key={preset.name} onClick={() => { updateShot({ direction: { ...DEFAULT_DIRECTION, ...preset.direction } }); setTab("Look"); }}>{preset.name}<ArrowRight size={13} /></button>)}</div>
          </>}
          {tab === "Camera" && <><h3>Direct the camera.</h3><p className="cinemalab-help">Lens, focus, and movement describe the look you want. The model interprets this direction; exact optics and motion may vary.</p>{controls(CAMERA_CONTROLS)}</>}
          {tab === "Look" && <><h3>Set the mood.</h3><p className="cinemalab-help">Shape the lighting, color, and texture of this shot.</p>{controls(LOOK_CONTROLS)}<button className="cinemalab-text-button" type="button" onClick={() => updateShot({ direction: { ...DEFAULT_DIRECTION } })}>Reset camera and look</button></>}
          {tab === "Sequence" && <>
            <h3>Think beyond one shot.</h3><p className="cinemalab-help">Expand this scene into an establishing shot, an action shot, and a detail. This is an editable structure; it does not generate or charge for videos.</p>
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
        <div className="cinemalab-apply">
          <div><strong>{applied ? "Shot applied to prompt" : "Ready for the generation prompt"}</strong><span>{compiled.length > CINEMA_PROMPT_LIMIT ? `Shorten this shot by ${compiled.length - CINEMA_PROMPT_LIMIT} characters.` : "Review the prompt and credit cost before generating."}</span></div>
          <button type="button" className="cinemalab-primary" disabled={!valid || applied} onClick={() => { onApply(compiled); setNotice("Shot applied. Your generation prompt is ready to review below."); }}>{applied ? <Check size={15} /> : <ArrowDown size={15} />}{applied ? "Applied" : "Use this shot"}</button>
        </div>
      </div>
    </fieldset>
    <div className="cinemalab-status" role="status">{notice || (storageError ? "Browser storage is unavailable. Download your shot plan to keep a copy." : "Planning is free. Each generation uses the credit cost shown below.")}</div>
  </section>;
}
