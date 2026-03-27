const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

// Master compressor for all gunfire — prevents clipping and adds perceived loudness
const gunCompressor = audioCtx.createDynamicsCompressor();
gunCompressor.threshold.value = -12;
gunCompressor.knee.value = 6;
gunCompressor.ratio.value = 8;
gunCompressor.attack.value = 0.002;
gunCompressor.release.value = 0.15;
gunCompressor.connect(audioCtx.destination);

let engineOsc1: OscillatorNode | null = null;
let engineOsc2: OscillatorNode | null = null;
let engineGain: GainNode | null = null;
let isEngineRunning = false;

export function initEngineSound() {
  if (isEngineRunning) return;
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  engineOsc1 = audioCtx.createOscillator();
  engineOsc2 = audioCtx.createOscillator();
  engineGain = audioCtx.createGain();

  // Sawtooth and square waves for a grumbly engine sound
  engineOsc1.type = 'sawtooth';
  engineOsc2.type = 'square';

  // Low pass filter to muffle it slightly
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 400;

  engineOsc1.connect(filter);
  engineOsc2.connect(filter);
  filter.connect(engineGain);
  engineGain.connect(audioCtx.destination);

  engineGain.gain.value = 0; // Start muted

  engineOsc1.start();
  engineOsc2.start();
  isEngineRunning = true;
}

export function updateEngineSound(rpm: number) {
  if (!isEngineRunning || !engineOsc1 || !engineOsc2 || !engineGain) return;

  // Map RPM (800 - 2800) to frequency (e.g., 40Hz - 120Hz)
  const normalizedRpm = Math.max(0, Math.min(1, (rpm - 800) / 2000));
  const baseFreq = 40 + normalizedRpm * 80;

  // Smoothly update frequencies
  const t = audioCtx.currentTime;
  engineOsc1.frequency.setTargetAtTime(baseFreq, t, 0.1);
  engineOsc2.frequency.setTargetAtTime(baseFreq * 1.5, t, 0.1); // Harmonic

  // Volume increases slightly with RPM
  const targetVolume = 0.1 + normalizedRpm * 0.15;
  engineGain.gain.setTargetAtTime(targetVolume, t, 0.1);
}

/** Random variation factor: value * (1 ± spread) */
function vary(value: number, spread: number = 0.12): number {
  return value * (1 + (Math.random() * 2 - 1) * spread);
}

/** Compute distance-based gain and high-freq cutoff multipliers */
function distanceFactors(distance: number): { gainMul: number; hfCutoffMul: number } {
  if (distance <= 0) return { gainMul: 1, hfCutoffMul: 1 };
  // Inverse-distance falloff (not inverse-square — too aggressive for gameplay)
  // Clamp minimum so distant shots are still audible
  const gainMul = Math.max(0.08, 1 / (1 + distance / 80));
  // High frequencies attenuate faster over distance (air absorption)
  const hfCutoffMul = Math.max(0.2, 1 / (1 + distance / 120));
  return { gainMul, hfCutoffMul };
}

/**
 * Play cannon fire sound (50-88mm+).
 * @param caliber - Gun caliber in mm (default 75). Scales pitch and duration.
 * @param distance - Distance from listener in game units (0 = player firing).
 */
export function playFireSound(caliber: number = 75, distance: number = 0) {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  const t = audioCtx.currentTime;
  const { gainMul, hfCutoffMul } = distanceFactors(distance);

  // Caliber scaling: 75mm = 1.0 baseline
  const calScale = caliber / 75;
  // Larger caliber → lower frequencies, longer sustain, more energy
  const freqScale = 1 / Math.sqrt(calScale);   // 88mm → 0.92, 50mm → 1.22
  const durScale = Math.pow(calScale, 0.3);      // 88mm → 1.05, 50mm → 0.88
  const volScale = Math.pow(calScale, 0.4);      // 88mm → 1.06, 50mm → 0.88

  // === Layer 1: Initial sharp crack (supersonic shockwave) ===
  const crackDuration = vary(0.08) * durScale;
  const crackBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * crackDuration, audioCtx.sampleRate);
  const crackData = crackBuffer.getChannelData(0);
  for (let i = 0; i < crackBuffer.length; i++) {
    crackData[i] = Math.random() * 2 - 1;
  }
  const crackSource = audioCtx.createBufferSource();
  crackSource.buffer = crackBuffer;

  const crackFilter = audioCtx.createBiquadFilter();
  crackFilter.type = 'highpass';
  crackFilter.frequency.value = vary(1000) * freqScale * hfCutoffMul;

  const crackGain = audioCtx.createGain();
  crackGain.gain.setValueAtTime(vary(1.2) * volScale * gainMul, t);
  crackGain.gain.exponentialRampToValueAtTime(0.001, t + crackDuration);

  crackSource.connect(crackFilter);
  crackFilter.connect(crackGain);
  crackGain.connect(gunCompressor);
  crackSource.start(t);

  // === Layer 2: Metallic barrel clang (bandpass noise burst) ===
  const clangDuration = vary(0.06) * durScale;
  const clangBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * clangDuration, audioCtx.sampleRate);
  const clangData = clangBuffer.getChannelData(0);
  for (let i = 0; i < clangBuffer.length; i++) {
    clangData[i] = Math.random() * 2 - 1;
  }
  const clangSource = audioCtx.createBufferSource();
  clangSource.buffer = clangBuffer;

  const clangFilter = audioCtx.createBiquadFilter();
  clangFilter.type = 'bandpass';
  clangFilter.frequency.value = vary(2200) * freqScale * hfCutoffMul;
  clangFilter.Q.value = 1.5;

  const clangGain = audioCtx.createGain();
  clangGain.gain.setValueAtTime(vary(0.7) * volScale * gainMul, t);
  clangGain.gain.exponentialRampToValueAtTime(0.001, t + clangDuration);

  clangSource.connect(clangFilter);
  clangFilter.connect(clangGain);
  clangGain.connect(gunCompressor);
  clangSource.start(t);

  // === Layer 3: Deep concussion boom (pink noise, sweeping lowpass) ===
  const boomDuration = vary(2.0) * durScale;
  const boomBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * boomDuration, audioCtx.sampleRate);
  const boomData = boomBuffer.getChannelData(0);
  for (let i = 0; i < boomBuffer.length; i++) {
    const white = Math.random() * 2 - 1;
    boomData[i] = (white + (boomData[i - 1] || 0) * 0.92) / 1.92;
  }
  const boomSource = audioCtx.createBufferSource();
  boomSource.buffer = boomBuffer;

  const boomFilter = audioCtx.createBiquadFilter();
  boomFilter.type = 'lowpass';
  boomFilter.frequency.setValueAtTime(vary(900) * freqScale, t);
  boomFilter.frequency.exponentialRampToValueAtTime(40 * freqScale, t + boomDuration);

  const boomGain = audioCtx.createGain();
  boomGain.gain.setValueAtTime(vary(1.8) * volScale * gainMul, t);
  boomGain.gain.exponentialRampToValueAtTime(0.001, t + boomDuration);

  boomSource.connect(boomFilter);
  boomFilter.connect(boomGain);
  boomGain.connect(gunCompressor);
  boomSource.start(t);

  // === Layer 4: Low-frequency punch (sine sweep) ===
  const punchDuration = vary(0.5) * durScale;
  const osc = audioCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(vary(220) * freqScale, t);
  osc.frequency.exponentialRampToValueAtTime(25 * freqScale, t + punchDuration);

  const oscGain = audioCtx.createGain();
  oscGain.gain.setValueAtTime(vary(2.5) * volScale * gainMul, t);
  oscGain.gain.exponentialRampToValueAtTime(0.001, t + punchDuration);

  osc.connect(oscGain);
  oscGain.connect(gunCompressor);
  osc.start(t);
  osc.stop(t + punchDuration);

  // === Layer 5: Delayed echo / environmental reflection ===
  const echoDelay = vary(0.18) + distance * 0.002; // farther = more echo delay
  const echoDuration = vary(1.2) * durScale;
  const echoBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * echoDuration, audioCtx.sampleRate);
  const echoData = echoBuffer.getChannelData(0);
  for (let i = 0; i < echoBuffer.length; i++) {
    const white = Math.random() * 2 - 1;
    echoData[i] = (white + (echoData[i - 1] || 0) * 0.93) / 1.93;
  }
  const echoSource = audioCtx.createBufferSource();
  echoSource.buffer = echoBuffer;

  const echoFilter = audioCtx.createBiquadFilter();
  echoFilter.type = 'lowpass';
  echoFilter.frequency.setValueAtTime(vary(500) * freqScale, t + echoDelay);
  echoFilter.frequency.exponentialRampToValueAtTime(30, t + echoDelay + echoDuration);

  const echoGain = audioCtx.createGain();
  echoGain.gain.setValueAtTime(0, t);
  echoGain.gain.setValueAtTime(vary(0.6) * volScale * gainMul, t + echoDelay);
  echoGain.gain.exponentialRampToValueAtTime(0.001, t + echoDelay + echoDuration);

  echoSource.connect(echoFilter);
  echoFilter.connect(echoGain);
  echoGain.connect(gunCompressor);
  echoSource.start(t);
}

/**
 * Play autocannon sound (20mm).
 * @param caliber - Gun caliber in mm (default 20).
 * @param distance - Distance from listener in game units (0 = player firing).
 */
export function playAutocannonSound(caliber: number = 20, distance: number = 0) {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  const t = audioCtx.currentTime;
  const { gainMul, hfCutoffMul } = distanceFactors(distance);

  // === Layer 1: Sharp high-frequency crack ===
  const crackDuration = vary(0.04);
  const crackBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * crackDuration, audioCtx.sampleRate);
  const crackData = crackBuffer.getChannelData(0);
  for (let i = 0; i < crackBuffer.length; i++) {
    crackData[i] = Math.random() * 2 - 1;
  }
  const crackSource = audioCtx.createBufferSource();
  crackSource.buffer = crackBuffer;

  const crackFilter = audioCtx.createBiquadFilter();
  crackFilter.type = 'highpass';
  crackFilter.frequency.value = vary(2200) * hfCutoffMul;

  const crackGain = audioCtx.createGain();
  crackGain.gain.setValueAtTime(vary(0.8) * gainMul, t);
  crackGain.gain.exponentialRampToValueAtTime(0.001, t + crackDuration);

  crackSource.connect(crackFilter);
  crackFilter.connect(crackGain);
  crackGain.connect(gunCompressor);
  crackSource.start(t);

  // === Layer 2: Metallic bark (bandpass noise, high Q for ringing) ===
  const barkDuration = vary(0.07);
  const barkBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * barkDuration, audioCtx.sampleRate);
  const barkData = barkBuffer.getChannelData(0);
  for (let i = 0; i < barkBuffer.length; i++) {
    barkData[i] = Math.random() * 2 - 1;
  }
  const barkSource = audioCtx.createBufferSource();
  barkSource.buffer = barkBuffer;

  const barkFilter = audioCtx.createBiquadFilter();
  barkFilter.type = 'bandpass';
  barkFilter.frequency.value = vary(3800) * hfCutoffMul;
  barkFilter.Q.value = 2.0;

  const barkGain = audioCtx.createGain();
  barkGain.gain.setValueAtTime(vary(0.5) * gainMul, t);
  barkGain.gain.exponentialRampToValueAtTime(0.001, t + barkDuration);

  barkSource.connect(barkFilter);
  barkFilter.connect(barkGain);
  barkGain.connect(gunCompressor);
  barkSource.start(t);

  // === Layer 3: Brief mid-frequency pop ===
  const popDuration = vary(0.25);
  const popBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * popDuration, audioCtx.sampleRate);
  const popData = popBuffer.getChannelData(0);
  for (let i = 0; i < popBuffer.length; i++) {
    const white = Math.random() * 2 - 1;
    popData[i] = (white + (popData[i - 1] || 0) * 0.85) / 1.85;
  }
  const popSource = audioCtx.createBufferSource();
  popSource.buffer = popBuffer;

  const popFilter = audioCtx.createBiquadFilter();
  popFilter.type = 'bandpass';
  popFilter.frequency.setValueAtTime(vary(450), t);
  popFilter.Q.value = 1.0;

  const popGain = audioCtx.createGain();
  popGain.gain.setValueAtTime(vary(0.55) * gainMul, t);
  popGain.gain.exponentialRampToValueAtTime(0.001, t + popDuration);

  popSource.connect(popFilter);
  popFilter.connect(popGain);
  popGain.connect(gunCompressor);
  popSource.start(t);

  // === Layer 4: Minimal low punch ===
  const punchDuration = vary(0.12);
  const osc = audioCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(vary(160), t);
  osc.frequency.exponentialRampToValueAtTime(50, t + punchDuration);

  const oscGain = audioCtx.createGain();
  oscGain.gain.setValueAtTime(vary(0.45) * gainMul, t);
  oscGain.gain.exponentialRampToValueAtTime(0.001, t + punchDuration);

  osc.connect(oscGain);
  oscGain.connect(gunCompressor);
  osc.start(t);
  osc.stop(t + punchDuration);
}
