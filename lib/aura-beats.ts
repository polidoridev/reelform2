// Local onset autocorrelation. This estimates a steady tempo, not musical sections
// or a "drop"; users can adjust ambiguous half/double-time results before export.
export function estimateAuraBeat(buffer: Pick<AudioBuffer, "sampleRate" | "length" | "getChannelData">) {
  const data = buffer.getChannelData(0);
  const hop = Math.round(buffer.sampleRate / 100);
  const windows = Math.min(Math.floor(buffer.length / hop), 6000);
  if (windows < 400) return null;
  const onset = new Float32Array(windows);
  let previous = 0, energy = 0;
  for (let frame = 0; frame < windows; frame++) {
    let sum = 0;
    for (let i = frame * hop; i < (frame + 1) * hop; i++) sum += data[i] ** 2;
    const value = Math.sqrt(sum / hop);
    onset[frame] = Math.max(0, value - previous);
    energy += onset[frame] ** 2;
    previous = value;
  }
  if (energy < 0.00001) return null;
  const scores = new Map<number, number>();
  let bestLag = 0, bestScore = 0;
  for (let lag = 30; lag <= 100; lag++) {
    let correlation = 0;
    for (let i = lag; i < windows; i++) correlation += onset[i] * onset[i - lag];
    const score = correlation / energy;
    scores.set(lag, score);
    // Resolve near-ties toward a conventional edit tempo, without hiding uncertainty.
    const preference = 1 - Math.abs(6000 / lag - 130) / 1000;
    if (score * preference > bestScore) { bestScore = score * preference; bestLag = lag; }
  }
  if (bestScore < 0.12 || !bestLag) return null;
  const left = scores.get(bestLag - 1) ?? 0, center = scores.get(bestLag) ?? 0, right = scores.get(bestLag + 1) ?? 0;
  const denominator = left - 2 * center + right;
  const shift = denominator ? Math.max(-0.5, Math.min(0.5, 0.5 * (left - right) / denominator)) : 0;
  const bpm = Math.max(60, Math.min(200, Math.round(6000 / (bestLag + shift))));
  const period = 6000 / bpm;
  let bestOffset = 0, bestPhaseScore = -1;
  for (let offset = 0; offset < Math.ceil(period); offset++) {
    let score = 0;
    for (let i = offset; i < windows; i += period) score += onset[Math.round(i)] ?? 0;
    if (score > bestPhaseScore) { bestOffset = offset; bestPhaseScore = score; }
  }
  return { bpm, offset: Math.round(bestOffset) / 100 };
}
