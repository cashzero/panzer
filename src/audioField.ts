import type { AudioVec3 } from './audio';

/**
 * The battlefield as a sound field: how sound travels to the listener, the
 * other tanks' engines, shells passing close, the crew's own machinery, and
 * the countryside and distant front behind it all. Everything is generated;
 * the backend in audio.ts owns the AudioContext and routes these into its
 * master bus.
 */

const TAU = Math.PI * 2;

/** m/s at about 20 °C. */
export const SPEED_OF_SOUND = 343;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function distance(a: AudioVec3, b: AudioVec3) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Seconds a sound takes to reach the listener: a gun 700 m off is heard two seconds after its flash. */
export function propagationDelay(metres: number) {
  return metres / SPEED_OF_SOUND;
}

/**
 * Low-pass cutoff standing in for air absorption and ground effect: highs
 * die first with distance, so a gun at 50 m cracks and one at 700 m thuds.
 * About 10 kHz at 50 m, 4.7 kHz at 200 m, 1.6 kHz at 700 m.
 */
export function airAbsorptionCutoff(metres: number) {
  return clamp(18000 / (1 + metres / 70), 350, 18000);
}

export function createSpatialPanner(context: BaseAudioContext, refDistance: number, rolloffFactor: number): PannerNode {
  const panner = context.createPanner();
  panner.panningModel = 'HRTF';
  panner.distanceModel = 'inverse';
  panner.refDistance = refDistance;
  panner.maxDistance = 4000;
  panner.rolloffFactor = rolloffFactor;
  return panner;
}

export function placePanner(panner: PannerNode, position: AudioVec3) {
  if ('positionX' in panner) {
    panner.positionX.value = position.x;
    panner.positionY.value = position.y;
    panner.positionZ.value = position.z;
  } else {
    (panner as PannerNode & { setPosition?: (x: number, y: number, z: number) => void }).setPosition?.(position.x, position.y, position.z);
  }
}

function loopBuffer(context: BaseAudioContext, duration: number, sample: (time: number) => number): AudioBuffer {
  const length = Math.floor(context.sampleRate * duration);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = sample(i / context.sampleRate);
  return buffer;
}

/** Seamless 2 s loop; every partial is a whole number of cycles. */
const hz = (frequency: number) => Math.round(frequency * 2) / 2;

/** An electric or hydraulic traverse motor: hum, its harmonics and the gear train's whine. */
export function createTraverseMotorBuffer(context: BaseAudioContext) {
  return loopBuffer(context, 2, (t) => {
    const hum = 0.55 * Math.sin(TAU * hz(100) * t) + 0.25 * Math.sin(TAU * hz(200) * t + 1.3) + 0.12 * Math.sin(TAU * hz(300) * t + 0.4);
    const gears = 0.22 * Math.sin(TAU * hz(880) * t + 0.7) * (0.8 + 0.2 * Math.sin(TAU * hz(7) * t));
    return Math.tanh((hum + gears) * 1.2) * 0.7;
  });
}

/** A hand traverse: the gunner's crank and the ratchet of the ring gear, a click every few degrees. */
export function createTraverseRatchetBuffer(context: BaseAudioContext) {
  let seed = 7;
  const noise = () => { seed = (seed * 16807) % 2147483647; return seed / 1073741823.5 - 1; };
  return loopBuffer(context, 2, (t) => {
    const phase = (t * 6) % 1; // six clicks a second at playback rate 1
    const click = phase < 0.004 ? 1 : Math.exp(-(phase - 0.004) * 90);
    const ring = Math.sin(TAU * hz(2300) * t) * 0.4 + Math.sin(TAU * hz(3700) * t) * 0.25;
    return (noise() * 0.6 + ring) * click * 0.8;
  });
}

export function createNoiseLoop(context: BaseAudioContext, seconds = 2) {
  return loopBuffer(context, seconds, () => Math.random() * 2 - 1);
}

// ---------------------------------------------------------------------------
// Other tanks' engines

export interface VehicleTelemetry {
  id: string;
  position: AudioVec3;
  /** m/s, signed. */
  speed: number;
  maxSpeed: number;
  /** rad/s of hull yaw. */
  turnRate: number;
  /** Tonnes; heavier tanks run lower. */
  weight: number;
  destroyed: boolean;
}

export interface EngineBuffers {
  idle: AudioBuffer;
  load: AudioBuffer;
  track: AudioBuffer;
}

interface Layer {
  source: AudioBufferSourceNode;
  filter: BiquadFilterNode;
  gain: GainNode;
}

interface Voice {
  id: string | null;
  bus: GainNode;
  air: BiquadFilterNode;
  panner: PannerNode;
  idle: Layer;
  load: Layer;
  track: Layer;
}

/** Engines are heard this far; beyond it the gunfire carries the battle. */
const VOICE_RANGE = 550;
const VOICE_COUNT = 4;

/**
 * Engine and track noise for the AI tanks nearest the listener: a small
 * pool of voices built from the player engine's loop buffers, handed from
 * tank to tank as they come and go, each placed in 3D and dulled with
 * distance.
 */
export class VehicleVoices {
  private voices: Voice[] = [];

  constructor(private context: BaseAudioContext, buffers: EngineBuffers, destination: AudioNode) {
    for (let i = 0; i < VOICE_COUNT; i++) {
      const bus = context.createGain();
      bus.gain.value = 0;
      const air = context.createBiquadFilter();
      air.type = 'lowpass';
      air.Q.value = 0.3;
      const panner = createSpatialPanner(context, 12, 1);
      bus.connect(air);
      air.connect(panner);
      panner.connect(destination);
      const layer = (buffer: AudioBuffer, type: BiquadFilterType, frequency: number, offset: number): Layer => {
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.loop = true;
        const filter = context.createBiquadFilter();
        filter.type = type;
        filter.frequency.value = frequency;
        filter.Q.value = 0.6;
        const gain = context.createGain();
        gain.gain.value = 0;
        source.connect(filter);
        filter.connect(gain);
        gain.connect(bus);
        // Offset each voice in its loop so two tanks never drone in phase.
        source.start(0, (offset * 0.37 + i * 0.53) % buffer.duration);
        return { source, filter, gain };
      };
      this.voices.push({
        id: null, bus, air, panner,
        idle: layer(buffers.idle, 'lowpass', 220, 0),
        load: layer(buffers.load, 'lowpass', 520, 1),
        track: layer(buffers.track, 'bandpass', 1300, 2),
      });
    }
  }

  update(vehicles: VehicleTelemetry[], listener: AudioVec3 | null, active: boolean) {
    const now = this.context.currentTime;
    const nearest = !active || !listener ? [] : vehicles
      .filter((v) => !v.destroyed)
      .map((v) => ({ v, d: distance(v.position, listener) }))
      .filter(({ d }) => d < VOICE_RANGE)
      .sort((a, b) => a.d - b.d)
      .slice(0, VOICE_COUNT);
    const wanted = new Map(nearest.map((entry) => [entry.v.id, entry]));

    // Keep voices on tanks still wanted; free the rest.
    for (const voice of this.voices) {
      if (voice.id && !wanted.has(voice.id)) voice.id = null;
    }
    for (const [id] of wanted) {
      if (this.voices.some((voice) => voice.id === id)) continue;
      const free = this.voices.find((voice) => voice.id === null);
      if (!free) break;
      free.id = id;
      free.bus.gain.cancelScheduledValues(now);
      free.bus.gain.setValueAtTime(0, now);
    }

    for (const voice of this.voices) {
      const entry = voice.id ? wanted.get(voice.id) : undefined;
      if (!entry) {
        voice.bus.gain.setTargetAtTime(0, now, 0.25);
        continue;
      }
      const { v, d } = entry;
      placePanner(voice.panner, v.position);
      voice.air.frequency.setTargetAtTime(airAbsorptionCutoff(d), now, 0.1);
      const speed = clamp(Math.abs(v.speed) / Math.max(1, v.maxSpeed), 0, 1);
      const turn = clamp(Math.abs(v.turnRate) / 0.5, 0, 1);
      const work = clamp(speed * 0.8 + turn * 0.4, 0, 1);
      // Heavier engines turn slower and sit lower.
      const heft = lerp(1.12, 0.8, clamp((v.weight - 10) / 50, 0, 1));
      voice.bus.gain.setTargetAtTime(1, now, 0.3);
      voice.idle.gain.gain.setTargetAtTime(lerp(0.34, 0.2, work), now, 0.2);
      voice.load.gain.gain.setTargetAtTime(lerp(0.04, 0.34, work), now, 0.2);
      voice.track.gain.gain.setTargetAtTime(speed * 0.3 + turn * 0.12, now, 0.15);
      voice.idle.source.playbackRate.setTargetAtTime(heft * lerp(0.9, 1.05, work), now, 0.3);
      voice.load.source.playbackRate.setTargetAtTime(heft * lerp(0.8, 1.25, work), now, 0.3);
      voice.track.source.playbackRate.setTargetAtTime(lerp(0.8, 1.4, speed + turn * 0.2), now, 0.2);
    }
  }

  dispose() {
    for (const voice of this.voices) {
      for (const layer of [voice.idle, voice.load, voice.track]) {
        try { layer.source.stop(); } catch { /* already stopped */ }
        layer.source.disconnect();
        layer.filter.disconnect();
        layer.gain.disconnect();
      }
      voice.bus.disconnect();
      voice.air.disconnect();
      voice.panner.disconnect();
    }
    this.voices = [];
  }
}

// ---------------------------------------------------------------------------
// Ambience

/**
 * The countryside and the front behind it: wind moving over open fields,
 * leaves in gusts, and now and then artillery working somewhere beyond the
 * map, a dull thump or a short salvo from a random bearing. Heard only while
 * a battle is on.
 */
export class Ambience {
  private bus: GainNode;
  private nodes: AudioNode[] = [];
  private sources: AudioScheduledSourceNode[] = [];
  private nextFire = 0;

  constructor(private context: BaseAudioContext, private noise: AudioBuffer, destination: AudioNode) {
    this.bus = context.createGain();
    this.bus.gain.value = 0;
    this.bus.connect(destination);

    const wind = this.loop(0.55, 'bandpass', 320, 0.5, 0.05);
    this.lfo(wind, 0.07, 0.022);
    this.lfo(wind, 0.19, 0.01);
    const leaves = this.loop(1, 'highpass', 2600, 0.4, 0.007);
    this.lfo(leaves, 0.11, 0.006);
    const low = this.loop(0.3, 'lowpass', 120, 0.3, 0.035);
    this.lfo(low, 0.05, 0.015);
    this.nextFire = context.currentTime + 4 + Math.random() * 6;
  }

  private loop(rate: number, type: BiquadFilterType, frequency: number, q: number, level: number) {
    const source = this.context.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    source.playbackRate.value = rate;
    const filter = this.context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = this.context.createGain();
    gain.gain.value = level;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.bus);
    source.start(0, Math.random() * this.noise.duration);
    this.sources.push(source);
    this.nodes.push(filter, gain);
    return gain;
  }

  /** Slow swell on a layer's level: gusts. */
  private lfo(target: GainNode, frequency: number, depth: number) {
    const oscillator = this.context.createOscillator();
    oscillator.frequency.value = frequency;
    const amount = this.context.createGain();
    amount.gain.value = depth;
    oscillator.connect(amount);
    amount.connect(target.gain);
    oscillator.start(this.context.currentTime + Math.random() * 3);
    this.sources.push(oscillator);
    this.nodes.push(amount);
  }

  update(active: boolean, mapMode: boolean) {
    const now = this.context.currentTime;
    this.bus.gain.setTargetAtTime(active ? (mapMode ? 0.45 : 1) : 0, now, 0.6);
    if (!active || now < this.nextFire) return;
    // A salvo of one to three rounds from one bearing.
    const rounds = 1 + Math.floor(Math.random() * 3);
    const pan = Math.random() * 1.6 - 0.8;
    const level = 0.05 + Math.random() * 0.09;
    for (let i = 0; i < rounds; i++) this.distantGun(now + i * (0.35 + Math.random() * 0.9), pan, level * (0.75 + Math.random() * 0.5));
    this.nextFire = now + 7 + Math.random() * 16;
  }

  private distantGun(at: number, pan: number, level: number) {
    const context = this.context;
    const panner = context.createStereoPanner();
    panner.pan.value = pan;
    panner.connect(this.bus);

    const body = context.createBufferSource();
    body.buffer = this.noise;
    body.playbackRate.value = 0.25;
    const bodyFilter = context.createBiquadFilter();
    bodyFilter.type = 'lowpass';
    bodyFilter.frequency.value = 150;
    bodyFilter.Q.value = 0.5;
    const bodyGain = context.createGain();
    bodyGain.gain.setValueAtTime(0.0001, at);
    bodyGain.gain.exponentialRampToValueAtTime(level, at + 0.06);
    bodyGain.gain.exponentialRampToValueAtTime(level * 0.35, at + 0.5);
    bodyGain.gain.exponentialRampToValueAtTime(0.0001, at + 2.8);
    body.connect(bodyFilter);
    bodyFilter.connect(bodyGain);
    bodyGain.connect(panner);

    const sub = context.createOscillator();
    sub.frequency.setValueAtTime(42, at);
    sub.frequency.exponentialRampToValueAtTime(24, at + 1.2);
    const subGain = context.createGain();
    subGain.gain.setValueAtTime(0.0001, at);
    subGain.gain.exponentialRampToValueAtTime(level * 0.9, at + 0.05);
    subGain.gain.exponentialRampToValueAtTime(0.0001, at + 1.4);
    sub.connect(subGain);
    subGain.connect(panner);

    body.start(at, Math.random() * this.noise.duration);
    body.stop(at + 2.9);
    sub.start(at);
    sub.stop(at + 1.5);
    body.onended = () => {
      for (const node of [body, bodyFilter, bodyGain, sub, subGain, panner]) node.disconnect();
    };
  }

  dispose() {
    for (const source of this.sources) {
      try { source.stop(); } catch { /* already stopped */ }
      source.disconnect();
    }
    for (const node of this.nodes) node.disconnect();
    this.bus.disconnect();
    this.sources = [];
    this.nodes = [];
  }
}

// ---------------------------------------------------------------------------
// One-shots

export interface FlybyEvent {
  /** Where the shell passed closest to the listener. */
  position: AudioVec3;
  caliber: number;
  /** Closest approach to the listener, metres. */
  missDistance: number;
}

/**
 * A shell passing close. It outruns its own report, so what arrives first
 * is the snap of its shock wave, a sharp crack, then the tearing rush of
 * air as it goes by.
 */
export function playFlyby(context: BaseAudioContext, destination: AudioNode, noise: AudioBuffer, event: FlybyEvent) {
  const now = context.currentTime;
  const size = clamp(event.caliber / 75, 0.35, 1.4);
  const level = clamp(1.3 / (1 + event.missDistance / 5), 0.04, 0.95) * size;
  const panner = createSpatialPanner(context, 5, 1);
  placePanner(panner, event.position);
  panner.connect(destination);

  const shot = (rate: number, type: BiquadFilterType, from: number, to: number, q: number, attack: number, peak: number, decay: number) => {
    const source = context.createBufferSource();
    source.buffer = noise;
    source.playbackRate.value = rate;
    const filter = context.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(from, now);
    filter.frequency.exponentialRampToValueAtTime(to, now + decay);
    filter.Q.value = q;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(panner);
    source.start(now, Math.random() * noise.duration);
    source.stop(now + decay + 0.05);
    return [source, filter, gain] as const;
  };
  const crack = shot(1.6, 'highpass', 1800, 1400, 0.7, 0.001, level, 0.03);
  const tear = shot(1, 'bandpass', 2400, 520, 1.1, 0.012, level * 0.55, 0.45);
  const rush = shot(0.6, 'lowpass', 650, 200, 0.4, 0.03, level * 0.4 * size, 0.6);
  rush[0].onended = () => {
    for (const node of [...crack, ...tear, ...rush, panner]) node.disconnect();
  };
}

export interface ReloadEvent {
  position: AudioVec3;
  caliber: number;
}

/**
 * The loader ramming a round and the breech block closing: a heavy metallic
 * clank with a short ring of steel, then the click of the breech lever.
 * Heard loud from the gunner's seat, faint from outside.
 */
export function playReload(context: BaseAudioContext, destination: AudioNode, noise: AudioBuffer, event: ReloadEvent) {
  const now = context.currentTime;
  const size = clamp(event.caliber / 75, 0.5, 1.3);
  const pitch = 1 / Math.sqrt(size);
  const panner = createSpatialPanner(context, 3, 1.2);
  placePanner(panner, event.position);
  panner.connect(destination);
  const nodes: AudioNode[] = [panner];

  const clank = (at: number, level: number, centre: number) => {
    const source = context.createBufferSource();
    source.buffer = noise;
    const filter = context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = centre * pitch;
    filter.Q.value = 2.5;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(level, at + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.09);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(panner);
    source.start(at, Math.random() * noise.duration);
    source.stop(at + 0.12);
    nodes.push(source, filter, gain);
  };
  const ring = (at: number, frequency: number, level: number, decay: number) => {
    const oscillator = context.createOscillator();
    oscillator.frequency.value = frequency * pitch;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(level, at + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + decay);
    oscillator.connect(gain);
    gain.connect(panner);
    oscillator.start(at);
    oscillator.stop(at + decay + 0.02);
    nodes.push(oscillator, gain);
    return oscillator;
  };

  // Round rammed home, then the block rises and locks.
  clank(now, 0.35 * size, 900);
  ring(now, 140, 0.25 * size, 0.12);
  clank(now + 0.16, 0.5 * size, 2400);
  ring(now + 0.16, 640, 0.07, 0.35);
  ring(now + 0.16, 1720, 0.035, 0.25);
  const last = ring(now + 0.42, 3100, 0.02, 0.06);
  clank(now + 0.42, 0.18, 4200);
  last.onended = () => { for (const node of nodes) node.disconnect(); };
}
