const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

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

export function playFireSound() {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  const t = audioCtx.currentTime;

  // 1. The initial sharp crack (high frequency noise)
  const crackDuration = 0.1;
  const crackBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * crackDuration, audioCtx.sampleRate);
  const crackData = crackBuffer.getChannelData(0);
  for (let i = 0; i < crackBuffer.length; i++) {
    crackData[i] = Math.random() * 2 - 1;
  }
  const crackSource = audioCtx.createBufferSource();
  crackSource.buffer = crackBuffer;
  
  const crackFilter = audioCtx.createBiquadFilter();
  crackFilter.type = 'highpass';
  crackFilter.frequency.value = 1000;

  const crackGain = audioCtx.createGain();
  crackGain.gain.setValueAtTime(1, t);
  crackGain.gain.exponentialRampToValueAtTime(0.01, t + crackDuration);

  crackSource.connect(crackFilter);
  crackFilter.connect(crackGain);
  crackGain.connect(audioCtx.destination);
  crackSource.start(t);

  // 2. The deep boom (low frequency noise + oscillator)
  const boomDuration = 1.5;
  const boomBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * boomDuration, audioCtx.sampleRate);
  const boomData = boomBuffer.getChannelData(0);
  for (let i = 0; i < boomBuffer.length; i++) {
    // Pink noise approximation for more natural explosion
    let white = Math.random() * 2 - 1;
    boomData[i] = (white + (boomData[i - 1] || 0) * 0.9) / 1.9;
  }
  const boomSource = audioCtx.createBufferSource();
  boomSource.buffer = boomBuffer;

  const boomFilter = audioCtx.createBiquadFilter();
  boomFilter.type = 'lowpass';
  boomFilter.frequency.setValueAtTime(800, t);
  boomFilter.frequency.exponentialRampToValueAtTime(50, t + boomDuration);

  const boomGain = audioCtx.createGain();
  boomGain.gain.setValueAtTime(1.5, t);
  boomGain.gain.exponentialRampToValueAtTime(0.01, t + boomDuration);

  boomSource.connect(boomFilter);
  boomFilter.connect(boomGain);
  boomGain.connect(audioCtx.destination);
  boomSource.start(t);

  // 3. The low frequency punch (sine sweep)
  const punchDuration = 0.4;
  const osc = audioCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(200, t);
  osc.frequency.exponentialRampToValueAtTime(30, t + punchDuration);

  const oscGain = audioCtx.createGain();
  oscGain.gain.setValueAtTime(2, t);
  oscGain.gain.exponentialRampToValueAtTime(0.01, t + punchDuration);

  osc.connect(oscGain);
  oscGain.connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + punchDuration);
}

export function playAutocannonSound() {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  const t = audioCtx.currentTime;

  // 1. Sharp high-frequency crack (shorter and higher than cannon)
  const crackDuration = 0.05;
  const crackBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * crackDuration, audioCtx.sampleRate);
  const crackData = crackBuffer.getChannelData(0);
  for (let i = 0; i < crackBuffer.length; i++) {
    crackData[i] = Math.random() * 2 - 1;
  }
  const crackSource = audioCtx.createBufferSource();
  crackSource.buffer = crackBuffer;

  const crackFilter = audioCtx.createBiquadFilter();
  crackFilter.type = 'highpass';
  crackFilter.frequency.value = 2000;

  const crackGain = audioCtx.createGain();
  crackGain.gain.setValueAtTime(0.6, t);
  crackGain.gain.exponentialRampToValueAtTime(0.01, t + crackDuration);

  crackSource.connect(crackFilter);
  crackFilter.connect(crackGain);
  crackGain.connect(audioCtx.destination);
  crackSource.start(t);

  // 2. Brief mid-frequency pop (no deep boom for 20mm)
  const popDuration = 0.3;
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
  popFilter.frequency.setValueAtTime(400, t);
  popFilter.Q.value = 1.0;

  const popGain = audioCtx.createGain();
  popGain.gain.setValueAtTime(0.5, t);
  popGain.gain.exponentialRampToValueAtTime(0.01, t + popDuration);

  popSource.connect(popFilter);
  popFilter.connect(popGain);
  popGain.connect(audioCtx.destination);
  popSource.start(t);

  // 3. Minimal low punch (small caliber)
  const punchDuration = 0.15;
  const osc = audioCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(50, t + punchDuration);

  const oscGain = audioCtx.createGain();
  oscGain.gain.setValueAtTime(0.4, t);
  oscGain.gain.exponentialRampToValueAtTime(0.01, t + punchDuration);

  osc.connect(oscGain);
  oscGain.connect(audioCtx.destination);
  osc.start(t);
  osc.stop(t + punchDuration);
}
