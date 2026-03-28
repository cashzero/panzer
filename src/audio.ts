export type AudioViewMode = 'third-person' | 'gunner' | 'map';
export type AudioSource = 'player' | 'ally' | 'enemy';
export type AudioTarget = AudioSource | 'terrain';
export type AudioProjectileType = 'AP' | 'APC' | 'HE';
export type AudioImpactMaterial = 'armor' | 'ground';
export type AudioImpactResult = 'ground' | 'ricochet' | 'non-penetration' | 'penetration' | 'blast';

export interface AudioVec3 {
  x: number;
  y: number;
  z: number;
}

export interface ListenerPose {
  position: AudioVec3;
  forward: AudioVec3;
  up: AudioVec3;
  viewMode: AudioViewMode;
}

export interface EngineTelemetry {
  position: AudioVec3;
  rpm: number;
  gear: number;
  speed: number;
  maxSpeed: number;
  leftTrackSpeed: number;
  rightTrackSpeed: number;
  destroyed: boolean;
  viewMode: AudioViewMode;
}

export interface ShotEvent {
  source: AudioSource;
  position: AudioVec3;
  caliber: number;
  burst: boolean;
}

export interface ImpactEvent {
  position: AudioVec3;
  normal: AudioVec3;
  source: AudioSource;
  target: AudioTarget;
  caliber: number;
  projectileType: AudioProjectileType;
  material: AudioImpactMaterial;
  result: AudioImpactResult;
}

export interface ExplosionEvent {
  position: AudioVec3;
  source: AudioSource;
  scale: number;
}

export interface AudioBackend {
  attachContext(context: AudioContext): void;
  detachContext(): void;
  setListenerPose(pose: ListenerPose): void;
  syncPlayerEngine(telemetry: EngineTelemetry): void;
  playShot(event: ShotEvent): void;
  playImpact(event: ImpactEvent): void;
  playExplosion(event: ExplosionEvent): void;
}

type AudioWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

type PartialSpec = readonly [cycles: number, amplitude: number];

interface LoopLayerNodes {
  source: AudioBufferSourceNode;
  filter: BiquadFilterNode;
  gain: GainNode;
}

interface EngineGraph {
  outputGain: GainNode;
  compressor: DynamicsCompressorNode;
  viewLowpass: BiquadFilterNode;
  viewHighpass: BiquadFilterNode;
  panner: PannerNode;
  engineBus: GainNode;
  idle: LoopLayerNodes;
  load: LoopLayerNodes;
  track: LoopLayerNodes;
  whine: LoopLayerNodes;
}

interface EngineSmoothingState {
  outputGain: number;
  viewLowpass: number;
  viewHighpass: number;
  idleGain: number;
  loadGain: number;
  trackGain: number;
  whineGain: number;
  idleRate: number;
  loadRate: number;
  trackRate: number;
  whineRate: number;
  idleFilter: number;
  loadFilter: number;
  trackFilter: number;
  whineFilter: number;
}

interface TransientBus {
  input: GainNode;
  output: GainNode;
  panner: PannerNode;
  highpass: BiquadFilterNode;
  lowpass: BiquadFilterNode;
}

const TAU = Math.PI * 2;
const EPSILON = 1e-4;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function smooth(current: number, target: number, amount: number): number {
  return current + (target - current) * amount;
}

function saturate(value: number): number {
  return Math.tanh(value * 1.35);
}

function distanceBetween(a: AudioVec3, b: AudioVec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function phaseFor(index: number): number {
  return ((index * 0.6180339887498948) % 1) * TAU;
}

function pulseEnvelope(cycle: number, attack: number, decay: number): number {
  if (cycle < attack) {
    return cycle / Math.max(attack, EPSILON);
  }
  return Math.exp(-(cycle - attack) * decay);
}

function loopNoise(time: number, duration: number, partials: readonly PartialSpec[], phaseOffset = 0): number {
  let sum = 0;
  let weight = 0;

  for (let i = 0; i < partials.length; i += 1) {
    const [cycles, amplitude] = partials[i];
    sum += amplitude * Math.sin(TAU * (cycles / duration) * time + phaseFor(phaseOffset + i));
    weight += Math.abs(amplitude);
  }

  return sum / Math.max(weight, EPSILON);
}

function createLoopBuffer(
  context: AudioContext,
  duration: number,
  sampleFn: (time: number, duration: number) => number,
): AudioBuffer {
  const length = Math.floor(context.sampleRate * duration);
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < length; i += 1) {
    const time = i / context.sampleRate;
    data[i] = sampleFn(time, duration);
  }

  return buffer;
}

function createIdleLoopBuffer(context: AudioContext): AudioBuffer {
  return createLoopBuffer(context, 2.0, (time, duration) => {
    const rumble =
      0.74 * Math.sin(TAU * (48 / duration) * time) +
      0.32 * Math.sin(TAU * (96 / duration) * time + phaseFor(2)) +
      0.16 * Math.sin(TAU * (144 / duration) * time + phaseFor(5));
    const combustion = pulseEnvelope((time * 12) % 1, 0.065, 11);
    const chuff = loopNoise(time, duration, [[23, 0.34], [31, 0.24], [47, 0.16], [61, 0.1]], 11) * combustion;
    const flutter = 0.95 + 0.05 * Math.sin(TAU * (2 / duration) * time + phaseFor(7));
    return saturate((rumble * 0.58 + chuff * 0.5) * flutter) * 0.86;
  });
}

function createLoadLoopBuffer(context: AudioContext): AudioBuffer {
  return createLoopBuffer(context, 2.0, (time, duration) => {
    const body =
      0.68 * Math.sin(TAU * (68 / duration) * time) +
      0.3 * Math.sin(TAU * (102 / duration) * time + phaseFor(13)) +
      0.18 * Math.sin(TAU * (136 / duration) * time + phaseFor(17));
    const ignition = pulseEnvelope((time * 18) % 1, 0.045, 16);
    const grind = loopNoise(time, duration, [[71, 0.36], [89, 0.28], [121, 0.18], [149, 0.12]], 19);
    return saturate(body * 0.72 + grind * ignition * 0.88) * 0.82;
  });
}

function createTrackLoopBuffer(context: AudioContext): AudioBuffer {
  return createLoopBuffer(context, 2.0, (time, duration) => {
    const hitA = pulseEnvelope((time * 9) % 1, 0.018, 24);
    const hitB = pulseEnvelope(((time + 0.032) * 9) % 1, 0.014, 22);
    const grit = loopNoise(time, duration, [[133, 0.54], [177, 0.32], [223, 0.18], [307, 0.1]], 23);
    const knock = loopNoise(time, duration, [[29, 0.26], [47, 0.19], [83, 0.1]], 31);
    return saturate(grit * (hitA * 1.1 + hitB * 0.85) + knock * 0.32) * 0.84;
  });
}

function createWhineLoopBuffer(context: AudioContext): AudioBuffer {
  return createLoopBuffer(context, 2.0, (time, duration) => {
    const carrier =
      0.74 * Math.sin(TAU * (360 / duration) * time) +
      0.22 * Math.sin(TAU * (720 / duration) * time + phaseFor(29)) +
      0.11 * Math.sin(TAU * (1080 / duration) * time + phaseFor(37));
    const shimmer = loopNoise(time, duration, [[181, 0.24], [233, 0.18], [277, 0.14], [329, 0.08]], 41);
    const wobble = 1 + 0.09 * Math.sin(TAU * (4 / duration) * time + phaseFor(43));
    return saturate((carrier * wobble + shimmer * 0.3) * 0.76) * 0.72;
  });
}

function createNoiseBuffer(context: AudioContext, duration: number): AudioBuffer {
  return createLoopBuffer(context, duration, () => (Math.random() * 2 - 1) * 0.9);
}

function setSpatialPosition(node: PannerNode, position: AudioVec3): void {
  if ('positionX' in node) {
    node.positionX.value = position.x;
    node.positionY.value = position.y;
    node.positionZ.value = position.z;
    return;
  }

  const compatNode = node as PannerNode & { setPosition?: (x: number, y: number, z: number) => void };
  compatNode.setPosition?.(position.x, position.y, position.z);
}

function setListenerTransform(listener: AudioListener, pose: ListenerPose): void {
  const compatListener = listener as AudioListener & {
    setPosition?: (x: number, y: number, z: number) => void;
    setOrientation?: (
      fx: number,
      fy: number,
      fz: number,
      ux: number,
      uy: number,
      uz: number,
    ) => void;
  };

  if ('positionX' in listener) {
    listener.positionX.value = pose.position.x;
    listener.positionY.value = pose.position.y;
    listener.positionZ.value = pose.position.z;
  } else {
    compatListener.setPosition?.(pose.position.x, pose.position.y, pose.position.z);
  }

  if ('forwardX' in listener) {
    listener.forwardX.value = pose.forward.x;
    listener.forwardY.value = pose.forward.y;
    listener.forwardZ.value = pose.forward.z;
    listener.upX.value = pose.up.x;
    listener.upY.value = pose.up.y;
    listener.upZ.value = pose.up.z;
  } else {
    compatListener.setOrientation?.(
      pose.forward.x,
      pose.forward.y,
      pose.forward.z,
      pose.up.x,
      pose.up.y,
      pose.up.z,
    );
  }
}

class SilentAudioBackend implements AudioBackend {
  attachContext(_context: AudioContext): void {}
  detachContext(): void {}
  setListenerPose(_pose: ListenerPose): void {}
  syncPlayerEngine(_telemetry: EngineTelemetry): void {}
  playShot(_event: ShotEvent): void {}
  playImpact(_event: ImpactEvent): void {}
  playExplosion(_event: ExplosionEvent): void {}
}

class LayeredTankAudioBackend implements AudioBackend {
  private context: AudioContext | null = null;
  private graph: EngineGraph | null = null;
  private transientNoiseBuffer: AudioBuffer | null = null;
  private lastListenerPose: ListenerPose | null = null;
  private lastEngineTelemetry: EngineTelemetry | null = null;
  private state: EngineSmoothingState = {
    outputGain: 0,
    viewLowpass: 1400,
    viewHighpass: 30,
    idleGain: 0,
    loadGain: 0,
    trackGain: 0,
    whineGain: 0,
    idleRate: 0.9,
    loadRate: 0.9,
    trackRate: 0.95,
    whineRate: 0.9,
    idleFilter: 180,
    loadFilter: 360,
    trackFilter: 1100,
    whineFilter: 720,
  };

  attachContext(context: AudioContext): void {
    if (this.context === context && this.graph) return;

    this.detachContext();
    this.context = context;
    this.transientNoiseBuffer = createNoiseBuffer(context, 2.0);
    this.graph = this.createGraph(context);

    if (this.lastListenerPose) {
      this.setListenerPose(this.lastListenerPose);
    }
    if (this.lastEngineTelemetry) {
      this.syncPlayerEngine(this.lastEngineTelemetry);
    }
  }

  detachContext(): void {
    if (!this.graph) {
      this.context = null;
      return;
    }

    for (const layer of [this.graph.idle, this.graph.load, this.graph.track, this.graph.whine]) {
      try {
        layer.source.stop();
      } catch {}
      layer.source.disconnect();
      layer.filter.disconnect();
      layer.gain.disconnect();
    }

    this.graph.engineBus.disconnect();
    this.graph.panner.disconnect();
    this.graph.viewLowpass.disconnect();
    this.graph.viewHighpass.disconnect();
    this.graph.compressor.disconnect();
    this.graph.outputGain.disconnect();

    this.graph = null;
    this.context = null;
    this.transientNoiseBuffer = null;
  }

  setListenerPose(pose: ListenerPose): void {
    this.lastListenerPose = pose;
    if (!this.context) return;

    setListenerTransform(this.context.listener, pose);
  }

  syncPlayerEngine(telemetry: EngineTelemetry): void {
    this.lastEngineTelemetry = telemetry;
    if (!this.graph) return;

    setSpatialPosition(this.graph.panner, telemetry.position);

    const maxSpeed = Math.max(telemetry.maxSpeed, 1);
    const rpmRatio = clamp((telemetry.rpm - 800) / 2000, 0, 1);
    const speedRatio = clamp(Math.abs(telemetry.speed) / maxSpeed, 0, 1);
    const trackRatio = clamp((Math.abs(telemetry.leftTrackSpeed) + Math.abs(telemetry.rightTrackSpeed)) * 0.5 / maxSpeed, 0, 1);
    const turnRatio = clamp(Math.abs(telemetry.leftTrackSpeed - telemetry.rightTrackSpeed) / Math.max(maxSpeed * 1.2, 0.1), 0, 1);
    const loadRatio = clamp(rpmRatio * 0.68 + trackRatio * 0.34 + turnRatio * 0.24, 0, 1);

    const targetOutputGain = telemetry.destroyed
      ? 0
      : telemetry.viewMode === 'map'
        ? 0.05
        : telemetry.viewMode === 'gunner'
          ? 0.34
          : 0.72;
    const targetViewLowpass = telemetry.viewMode === 'map'
      ? 420
      : telemetry.viewMode === 'gunner'
        ? 720
        : lerp(1500, 2600, rpmRatio);
    const targetViewHighpass = telemetry.viewMode === 'map' ? 55 : 28;
    const targetIdleGain = telemetry.destroyed ? 0 : lerp(0.3, 0.16, rpmRatio);
    const targetLoadGain = telemetry.destroyed ? 0 : lerp(0.03, 0.26, loadRatio);
    const targetTrackGain = telemetry.destroyed ? 0 : (trackRatio * 0.18 + turnRatio * 0.11) * (telemetry.viewMode === 'gunner' ? 0.7 : 1);
    const targetWhineGain = telemetry.destroyed ? 0 : clamp((rpmRatio - 0.14) / 0.86, 0, 1) * (0.04 + speedRatio * 0.12);
    const targetIdleRate = lerp(0.88, 1.04, rpmRatio);
    const targetLoadRate = lerp(0.78, 1.3, rpmRatio);
    const targetTrackRate = lerp(0.82, 1.45, clamp(trackRatio + turnRatio * 0.18, 0, 1));
    const targetWhineRate = lerp(0.84, 1.62, clamp(rpmRatio * 0.82 + Math.max(telemetry.gear, 0) * 0.05, 0, 1));
    const targetIdleFilter = lerp(160, 260, rpmRatio);
    const targetLoadFilter = lerp(340, 780, loadRatio);
    const targetTrackFilter = lerp(900, 1800, clamp(trackRatio + turnRatio * 0.3, 0, 1));
    const targetWhineFilter = lerp(680, 1800, clamp(rpmRatio * 0.85 + speedRatio * 0.15, 0, 1));

    this.state.outputGain = smooth(this.state.outputGain, targetOutputGain, telemetry.destroyed ? 0.22 : 0.08);
    this.state.viewLowpass = smooth(this.state.viewLowpass, targetViewLowpass, 0.12);
    this.state.viewHighpass = smooth(this.state.viewHighpass, targetViewHighpass, 0.18);
    this.state.idleGain = smooth(this.state.idleGain, targetIdleGain, 0.12);
    this.state.loadGain = smooth(this.state.loadGain, targetLoadGain, 0.12);
    this.state.trackGain = smooth(this.state.trackGain, targetTrackGain, 0.14);
    this.state.whineGain = smooth(this.state.whineGain, targetWhineGain, 0.14);
    this.state.idleRate = smooth(this.state.idleRate, targetIdleRate, 0.1);
    this.state.loadRate = smooth(this.state.loadRate, targetLoadRate, 0.1);
    this.state.trackRate = smooth(this.state.trackRate, targetTrackRate, 0.16);
    this.state.whineRate = smooth(this.state.whineRate, targetWhineRate, 0.12);
    this.state.idleFilter = smooth(this.state.idleFilter, targetIdleFilter, 0.12);
    this.state.loadFilter = smooth(this.state.loadFilter, targetLoadFilter, 0.14);
    this.state.trackFilter = smooth(this.state.trackFilter, targetTrackFilter, 0.18);
    this.state.whineFilter = smooth(this.state.whineFilter, targetWhineFilter, 0.15);

    this.applyState(this.graph, this.state);
  }

  playShot(event: ShotEvent): void {
    if (!this.context) return;

    const context = this.context;
    const now = context.currentTime;
    const shotScale = clamp(event.caliber / 75, 0.4, 1.95);
    const cannonScale = clamp((event.caliber - 37) / 51, 0, 1);
    const burstFactor = event.burst ? 0.68 : 1;
    const transient = this.createTransientBus(context, event.position, {
      highpass: event.burst ? 42 : 28,
      lowpass: event.burst ? 2100 : 1350,
      refDistance: event.source === 'player' ? 12 : 20,
      maxDistance: 360,
      rolloffFactor: event.source === 'player' ? 0.9 : 1.08,
    });

    transient.output.gain.setValueAtTime(0.0001, now);
    transient.output.gain.exponentialRampToValueAtTime((0.72 + cannonScale * 0.36) * shotScale * burstFactor, now + 0.01);
    transient.output.gain.exponentialRampToValueAtTime((event.burst ? 0.18 : 0.34) * shotScale * burstFactor, now + (event.burst ? 0.16 : 0.4));
    transient.output.gain.exponentialRampToValueAtTime(0.0001, now + (event.burst ? 0.4 : 1.7));

    const blast = this.createNoiseSource(context, 0.28, lerp(1.08, 0.66, cannonScale));
    const blastFilter = context.createBiquadFilter();
    blastFilter.type = 'bandpass';
    blastFilter.frequency.setValueAtTime(lerp(440, 180, cannonScale), now);
    blastFilter.Q.value = lerp(1, 0.62, cannonScale);
    blast.connect(blastFilter);
    blastFilter.connect(transient.input);
    blast.start(now);
    blast.stop(now + (event.burst ? 0.12 : 0.24));

    const boom = this.createNoiseSource(context, 2.1, lerp(0.4, 0.17, cannonScale));
    const boomFilter = context.createBiquadFilter();
    boomFilter.type = 'lowpass';
    boomFilter.frequency.setValueAtTime(lerp(220, 110, cannonScale), now);
    boomFilter.frequency.exponentialRampToValueAtTime(lerp(110, 46, cannonScale), now + (event.burst ? 0.28 : 1.35));
    boomFilter.Q.value = 0.55;
    const boomGain = context.createGain();
    boomGain.gain.setValueAtTime(0.0001, now);
    boomGain.gain.exponentialRampToValueAtTime((0.24 + cannonScale * 0.42) * shotScale * burstFactor, now + 0.028);
    boomGain.gain.exponentialRampToValueAtTime(0.0001, now + (event.burst ? 0.42 : 1.5));
    boom.connect(boomFilter);
    boomFilter.connect(boomGain);
    boomGain.connect(transient.input);
    boom.start(now);
    boom.stop(now + (event.burst ? 0.46 : 1.6));

    const tail = this.createNoiseSource(context, event.burst ? 0.45 : 1.45, 0.36 + cannonScale * 0.04);
    const tailFilter = context.createBiquadFilter();
    tailFilter.type = 'bandpass';
    tailFilter.frequency.setValueAtTime(lerp(520, 300, cannonScale), now + 0.04);
    tailFilter.Q.value = 0.48;
    const tailGain = context.createGain();
    tailGain.gain.setValueAtTime(0.0001, now + 0.02);
    tailGain.gain.exponentialRampToValueAtTime(event.burst ? 0.05 : 0.16 + cannonScale * 0.14, now + 0.16);
    tailGain.gain.exponentialRampToValueAtTime(0.0001, now + (event.burst ? 0.42 : 1.55));
    tail.connect(tailFilter);
    tailFilter.connect(tailGain);
    tailGain.connect(transient.input);
    tail.start(now + 0.02);
    tail.stop(now + (event.burst ? 0.46 : 1.65));

    const subBoom = context.createOscillator();
    subBoom.type = 'sine';
    subBoom.frequency.setValueAtTime(lerp(72, 38, cannonScale), now);
    subBoom.frequency.exponentialRampToValueAtTime(lerp(32, 16, cannonScale), now + (event.burst ? 0.24 : 0.8));
    const subBoomGain = context.createGain();
    subBoomGain.gain.setValueAtTime(0.0001, now);
    subBoomGain.gain.exponentialRampToValueAtTime((0.07 + cannonScale * 0.18) * shotScale * burstFactor, now + 0.025);
    subBoomGain.gain.exponentialRampToValueAtTime(0.0001, now + (event.burst ? 0.34 : 0.95));
    subBoom.connect(subBoomGain);
    subBoomGain.connect(transient.input);
    subBoom.start(now);
    subBoom.stop(now + (event.burst ? 0.38 : 1));

    const echoTail = this.createNoiseSource(context, event.burst ? 0.55 : 1.8, 0.28 + cannonScale * 0.03);
    const echoFilter = context.createBiquadFilter();
    echoFilter.type = 'bandpass';
    echoFilter.frequency.setValueAtTime(lerp(360, 220, cannonScale), now + 0.12);
    echoFilter.Q.value = 0.35;
    const echoGain = context.createGain();
    echoGain.gain.setValueAtTime(0.0001, now + 0.1);
    echoGain.gain.exponentialRampToValueAtTime(event.burst ? 0.035 : 0.095 + cannonScale * 0.08, now + 0.3);
    echoGain.gain.exponentialRampToValueAtTime(0.0001, now + (event.burst ? 0.52 : 1.95));
    echoTail.connect(echoFilter);
    echoFilter.connect(echoGain);
    echoGain.connect(transient.input);
    echoTail.start(now + 0.08);
    echoTail.stop(now + (event.burst ? 0.58 : 2.05));

    const crack = context.createOscillator();
    crack.type = event.burst ? 'triangle' : 'sawtooth';
    crack.frequency.setValueAtTime(lerp(360, 150, cannonScale), now);
    crack.frequency.exponentialRampToValueAtTime(lerp(150, 58, cannonScale), now + (event.burst ? 0.04 : 0.08));
    const crackGain = context.createGain();
    crackGain.gain.setValueAtTime(0.0001, now);
    crackGain.gain.exponentialRampToValueAtTime((event.burst ? 0.035 : 0.055) * (1 - cannonScale * 0.45), now + 0.003);
    crackGain.gain.exponentialRampToValueAtTime(0.0001, now + (event.burst ? 0.035 : 0.07));
    crack.connect(crackGain);
    crackGain.connect(transient.input);
    crack.start(now);
    crack.stop(now + (event.burst ? 0.04 : 0.07));

    const pressure = context.createOscillator();
    pressure.type = 'triangle';
    pressure.frequency.setValueAtTime(lerp(82, 40, cannonScale), now);
    pressure.frequency.exponentialRampToValueAtTime(lerp(34, 19, cannonScale), now + (event.burst ? 0.16 : 0.42));
    const pressureGain = context.createGain();
    pressureGain.gain.setValueAtTime(0.0001, now);
    pressureGain.gain.exponentialRampToValueAtTime((0.08 + cannonScale * 0.16) * burstFactor, now + 0.016);
    pressureGain.gain.exponentialRampToValueAtTime(0.0001, now + (event.burst ? 0.22 : 0.46));
    pressure.connect(pressureGain);
    pressureGain.connect(transient.input);
    pressure.start(now);
    pressure.stop(now + (event.burst ? 0.18 : 0.34));

    echoTail.onended = () => {
      blast.disconnect();
      blastFilter.disconnect();
      boom.disconnect();
      boomFilter.disconnect();
      boomGain.disconnect();
      tail.disconnect();
      tailFilter.disconnect();
      tailGain.disconnect();
      subBoom.disconnect();
      subBoomGain.disconnect();
      echoTail.disconnect();
      echoFilter.disconnect();
      echoGain.disconnect();
      crack.disconnect();
      crackGain.disconnect();
      pressure.disconnect();
      pressureGain.disconnect();
      this.disposeTransientBus(transient);
    };
  }

  playImpact(event: ImpactEvent): void {
    if (!this.context) return;

    const context = this.context;
    const now = context.currentTime;
    const impactScale = clamp(event.caliber / 75, 0.4, 1.6);
    const isArmor = event.material === 'armor';
    const isPlayerHit = event.target === 'player';
    const isRicochet = event.result === 'ricochet';
    const isGround = event.result === 'ground';
    const isNonPen = event.result === 'non-penetration';
    const isPenetration = event.result === 'penetration';
    const isBlast = event.result === 'blast';
    const transient = this.createTransientBus(context, event.position, {
      highpass: isArmor ? 180 : 90,
      lowpass: isArmor ? 3600 : 1800,
      refDistance: 9,
      maxDistance: 260,
      rolloffFactor: 1.2,
    });

    const baseGain =
      event.result === 'ricochet' ? 0.3 :
      event.result === 'penetration' ? 0.42 :
      event.result === 'blast' ? 0.48 :
      event.result === 'ground' ? 0.26 :
      0.34;
    const impactTail = isBlast ? 0.95 : isRicochet ? 0.62 : isPenetration ? 0.68 : isGround ? 0.5 : 0.42;
    const sustainGain = isBlast ? 0.18 : isPenetration ? 0.12 : isGround ? 0.08 : isRicochet ? 0.07 : 0.09;
    transient.output.gain.setValueAtTime(0.0001, now);
    transient.output.gain.exponentialRampToValueAtTime(baseGain * impactScale, now + 0.006);
    transient.output.gain.exponentialRampToValueAtTime(sustainGain * impactScale, now + (isBlast ? 0.16 : isRicochet ? 0.2 : 0.12));
    transient.output.gain.exponentialRampToValueAtTime(0.0001, now + impactTail);

    let interiorBus: GainNode | null = null;
    let interiorLowpass: BiquadFilterNode | null = null;
    let interiorHighpass: BiquadFilterNode | null = null;
    let interiorHitGain: GainNode | null = null;
    if (isPlayerHit) {
      interiorBus = context.createGain();
      interiorBus.gain.value = 0;

      interiorHighpass = context.createBiquadFilter();
      interiorHighpass.type = 'highpass';
      interiorHighpass.frequency.value = 38;
      interiorHighpass.Q.value = 0.25;

      interiorLowpass = context.createBiquadFilter();
      interiorLowpass.type = 'lowpass';
      interiorLowpass.frequency.value = isArmor ? 520 : 780;
      interiorLowpass.Q.value = 0.4;

      interiorHighpass.connect(interiorLowpass);
      interiorLowpass.connect(interiorBus);
      interiorBus.connect(context.destination);

      interiorBus.gain.setValueAtTime(0.0001, now);
      interiorBus.gain.exponentialRampToValueAtTime((isBlast ? 0.28 : isPenetration ? 0.22 : isArmor ? 0.24 : 0.16) * impactScale, now + 0.01);
      interiorBus.gain.exponentialRampToValueAtTime(0.0001, now + (isBlast ? 0.62 : isPenetration ? 0.42 : isRicochet ? 0.34 : 0.28));
    }

    const hit = this.createNoiseSource(
      context,
      isBlast ? 0.35 : isRicochet ? 0.28 : isPenetration ? 0.26 : isGround ? 0.24 : 0.2,
      isGround ? 0.88 : isRicochet ? 1.45 : isPenetration ? 1.08 : isBlast ? 0.92 : 1.15,
    );
    const hitFilter = context.createBiquadFilter();
    hitFilter.type = isGround || isPenetration || isBlast ? 'bandpass' : 'highpass';
    hitFilter.frequency.setValueAtTime(isRicochet ? 2600 : isPenetration ? 1320 : isBlast ? 640 : isGround ? 260 : 920, now);
    hitFilter.Q.value = isRicochet ? 1.2 : isGround ? 0.72 : isBlast ? 0.62 : 0.88;
    hit.connect(hitFilter);
    hitFilter.connect(transient.input);
    if (interiorHighpass) {
      interiorHitGain = context.createGain();
      interiorHitGain.gain.setValueAtTime(0.0001, now);
      interiorHitGain.gain.exponentialRampToValueAtTime(isBlast ? 0.18 : isPenetration ? 0.15 : isRicochet ? 0.12 : isArmor ? 0.16 : 0.08, now + 0.008);
      interiorHitGain.gain.exponentialRampToValueAtTime(0.0001, now + (isBlast ? 0.38 : isPenetration ? 0.28 : isRicochet ? 0.22 : 0.16));
      hitFilter.connect(interiorHitGain);
      interiorHitGain.connect(interiorHighpass);
    }
    hit.start(now);
    hit.stop(now + (isBlast ? 0.35 : isRicochet ? 0.28 : isPenetration ? 0.26 : isGround ? 0.24 : 0.2));

    let ring: OscillatorNode | null = null;
    let ringGain: GainNode | null = null;
    let interiorRingGain: GainNode | null = null;
    if (isArmor) {
      ring = context.createOscillator();
      ring.type = isRicochet ? 'sine' : isNonPen ? 'triangle' : 'sine';
      ring.frequency.setValueAtTime(isRicochet ? 620 : isNonPen ? 380 : isPenetration ? 280 : isBlast ? 240 : 420, now);
      ring.frequency.exponentialRampToValueAtTime(isRicochet ? 240 : isNonPen ? 160 : isPenetration ? 120 : isBlast ? 110 : 180, now + (isRicochet ? 0.28 : isNonPen ? 0.26 : isPenetration ? 0.22 : isBlast ? 0.18 : 0.12));
      ringGain = context.createGain();
      ringGain.gain.setValueAtTime(0.0001, now);
      ringGain.gain.exponentialRampToValueAtTime(isRicochet ? 0.14 * impactScale : isNonPen ? 0.1 * impactScale : isPenetration ? 0.07 * impactScale : isBlast ? 0.05 * impactScale : 0.07, now + 0.005);
      ringGain.gain.exponentialRampToValueAtTime(0.0001, now + (isRicochet ? 0.34 : isNonPen ? 0.32 : isPenetration ? 0.26 : isBlast ? 0.22 : 0.14));
      ring.connect(ringGain);
      ringGain.connect(transient.input);
      if (interiorHighpass) {
        interiorRingGain = context.createGain();
        interiorRingGain.gain.setValueAtTime(0.0001, now);
        interiorRingGain.gain.exponentialRampToValueAtTime(isRicochet ? 0.07 : isPenetration ? 0.09 : 0.08, now + 0.005);
        interiorRingGain.gain.exponentialRampToValueAtTime(0.0001, now + (isRicochet ? 0.28 : isPenetration ? 0.3 : 0.18));
        ringGain.connect(interiorRingGain);
        interiorRingGain.connect(interiorHighpass);
      }
      ring.start(now);
      ring.stop(now + (isRicochet ? 0.36 : isNonPen ? 0.34 : isPenetration ? 0.28 : isBlast ? 0.24 : 0.15));
    }

    let ricochetScrape: AudioBufferSourceNode | null = null;
    let ricochetScrapeFilter: BiquadFilterNode | null = null;
    let ricochetScrapeGain: GainNode | null = null;
    let ricochetZing: OscillatorNode | null = null;
    let ricochetZingGain: GainNode | null = null;
    let ricochetArmorRing: OscillatorNode | null = null;
    let ricochetArmorRingGain: GainNode | null = null;
    let interiorRicochetGain: GainNode | null = null;
    if (isRicochet) {
      ricochetScrape = this.createNoiseSource(context, 0.55, 0.9);
      ricochetScrapeFilter = context.createBiquadFilter();
      ricochetScrapeFilter.type = 'bandpass';
      ricochetScrapeFilter.frequency.setValueAtTime(2200, now + 0.01);
      ricochetScrapeFilter.frequency.exponentialRampToValueAtTime(780, now + 0.42);
      ricochetScrapeFilter.Q.value = 0.85;
      ricochetScrapeGain = context.createGain();
      ricochetScrapeGain.gain.setValueAtTime(0.0001, now + 0.005);
      ricochetScrapeGain.gain.exponentialRampToValueAtTime(0.2 * impactScale, now + 0.035);
      ricochetScrapeGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.48);
      ricochetScrape.connect(ricochetScrapeFilter);
      ricochetScrapeFilter.connect(ricochetScrapeGain);
      ricochetScrapeGain.connect(transient.input);
      ricochetScrape.start(now + 0.004);
      ricochetScrape.stop(now + 0.5);

      ricochetZing = context.createOscillator();
      ricochetZing.type = 'sawtooth';
      ricochetZing.frequency.setValueAtTime(1350, now);
      ricochetZing.frequency.exponentialRampToValueAtTime(420, now + 0.22);
      ricochetZingGain = context.createGain();
      ricochetZingGain.gain.setValueAtTime(0.0001, now);
      ricochetZingGain.gain.exponentialRampToValueAtTime(0.045 * impactScale, now + 0.006);
      ricochetZingGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
      ricochetZing.connect(ricochetZingGain);
      ricochetZingGain.connect(transient.input);
      ricochetZing.start(now);
      ricochetZing.stop(now + 0.26);

      ricochetArmorRing = context.createOscillator();
      ricochetArmorRing.type = 'triangle';
      ricochetArmorRing.frequency.setValueAtTime(360, now + 0.02);
      ricochetArmorRing.frequency.exponentialRampToValueAtTime(190, now + 0.5);
      ricochetArmorRingGain = context.createGain();
      ricochetArmorRingGain.gain.setValueAtTime(0.0001, now + 0.02);
      ricochetArmorRingGain.gain.exponentialRampToValueAtTime(0.11 * impactScale, now + 0.05);
      ricochetArmorRingGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.52);
      ricochetArmorRing.connect(ricochetArmorRingGain);
      ricochetArmorRingGain.connect(transient.input);
      ricochetArmorRing.start(now + 0.02);
      ricochetArmorRing.stop(now + 0.56);

      if (interiorHighpass && ricochetArmorRingGain) {
        interiorRicochetGain = context.createGain();
        interiorRicochetGain.gain.setValueAtTime(0.0001, now + 0.02);
        interiorRicochetGain.gain.exponentialRampToValueAtTime(0.06 * impactScale, now + 0.05);
        interiorRicochetGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
        ricochetArmorRingGain.connect(interiorRicochetGain);
        interiorRicochetGain.connect(interiorHighpass);
      }
    }

    let groundBody: AudioBufferSourceNode | null = null;
    let groundBodyFilter: BiquadFilterNode | null = null;
    let groundBodyGain: GainNode | null = null;
    let groundSpray: AudioBufferSourceNode | null = null;
    let groundSprayFilter: BiquadFilterNode | null = null;
    let groundSprayGain: GainNode | null = null;
    if (isGround) {
      groundBody = this.createNoiseSource(context, 0.62, 0.48);
      groundBodyFilter = context.createBiquadFilter();
      groundBodyFilter.type = 'lowpass';
      groundBodyFilter.frequency.setValueAtTime(240, now);
      groundBodyFilter.frequency.exponentialRampToValueAtTime(110, now + 0.48);
      groundBodyFilter.Q.value = 0.45;
      groundBodyGain = context.createGain();
      groundBodyGain.gain.setValueAtTime(0.0001, now);
      groundBodyGain.gain.exponentialRampToValueAtTime(0.24 * impactScale, now + 0.03);
      groundBodyGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.46);
      groundBody.connect(groundBodyFilter);
      groundBodyFilter.connect(groundBodyGain);
      groundBodyGain.connect(transient.input);
      groundBody.start(now);
      groundBody.stop(now + 0.5);

      groundSpray = this.createNoiseSource(context, 0.34, 1.05);
      groundSprayFilter = context.createBiquadFilter();
      groundSprayFilter.type = 'bandpass';
      groundSprayFilter.frequency.setValueAtTime(820, now + 0.01);
      groundSprayFilter.frequency.exponentialRampToValueAtTime(320, now + 0.24);
      groundSprayFilter.Q.value = 0.7;
      groundSprayGain = context.createGain();
      groundSprayGain.gain.setValueAtTime(0.0001, now + 0.01);
      groundSprayGain.gain.exponentialRampToValueAtTime(0.08 * impactScale, now + 0.03);
      groundSprayGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
      groundSpray.connect(groundSprayFilter);
      groundSprayFilter.connect(groundSprayGain);
      groundSprayGain.connect(transient.input);
      groundSpray.start(now + 0.01);
      groundSpray.stop(now + 0.26);
    }

    let armorThunk: OscillatorNode | null = null;
    let armorThunkGain: GainNode | null = null;
    let armorShudder: AudioBufferSourceNode | null = null;
    let armorShudderFilter: BiquadFilterNode | null = null;
    let armorShudderGain: GainNode | null = null;
    if (isNonPen) {
      armorThunk = context.createOscillator();
      armorThunk.type = 'triangle';
      armorThunk.frequency.setValueAtTime(220, now);
      armorThunk.frequency.exponentialRampToValueAtTime(92, now + 0.22);
      armorThunkGain = context.createGain();
      armorThunkGain.gain.setValueAtTime(0.0001, now);
      armorThunkGain.gain.exponentialRampToValueAtTime(0.11 * impactScale, now + 0.01);
      armorThunkGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
      armorThunk.connect(armorThunkGain);
      armorThunkGain.connect(transient.input);
      armorThunk.start(now);
      armorThunk.stop(now + 0.26);

      armorShudder = this.createNoiseSource(context, 0.34, 0.96);
      armorShudderFilter = context.createBiquadFilter();
      armorShudderFilter.type = 'bandpass';
      armorShudderFilter.frequency.setValueAtTime(1180, now + 0.01);
      armorShudderFilter.frequency.exponentialRampToValueAtTime(420, now + 0.26);
      armorShudderFilter.Q.value = 0.88;
      armorShudderGain = context.createGain();
      armorShudderGain.gain.setValueAtTime(0.0001, now + 0.01);
      armorShudderGain.gain.exponentialRampToValueAtTime(0.16 * impactScale, now + 0.03);
      armorShudderGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
      armorShudder.connect(armorShudderFilter);
      armorShudderFilter.connect(armorShudderGain);
      armorShudderGain.connect(transient.input);
      armorShudder.start(now + 0.01);
      armorShudder.stop(now + 0.3);
    }

    let penetrationTear: AudioBufferSourceNode | null = null;
    let penetrationTearFilter: BiquadFilterNode | null = null;
    let penetrationTearGain: GainNode | null = null;
    let penetrationThump: OscillatorNode | null = null;
    let penetrationThumpGain: GainNode | null = null;
    let interiorPenGain: GainNode | null = null;
    if (isPenetration) {
      penetrationTear = this.createNoiseSource(context, 0.58, 0.84);
      penetrationTearFilter = context.createBiquadFilter();
      penetrationTearFilter.type = 'bandpass';
      penetrationTearFilter.frequency.setValueAtTime(1400, now + 0.01);
      penetrationTearFilter.frequency.exponentialRampToValueAtTime(320, now + 0.46);
      penetrationTearFilter.Q.value = 0.72;
      penetrationTearGain = context.createGain();
      penetrationTearGain.gain.setValueAtTime(0.0001, now + 0.01);
      penetrationTearGain.gain.exponentialRampToValueAtTime(0.18 * impactScale, now + 0.04);
      penetrationTearGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
      penetrationTear.connect(penetrationTearFilter);
      penetrationTearFilter.connect(penetrationTearGain);
      penetrationTearGain.connect(transient.input);
      penetrationTear.start(now + 0.01);
      penetrationTear.stop(now + 0.52);

      penetrationThump = context.createOscillator();
      penetrationThump.type = 'triangle';
      penetrationThump.frequency.setValueAtTime(118, now + 0.02);
      penetrationThump.frequency.exponentialRampToValueAtTime(46, now + 0.34);
      penetrationThumpGain = context.createGain();
      penetrationThumpGain.gain.setValueAtTime(0.0001, now + 0.02);
      penetrationThumpGain.gain.exponentialRampToValueAtTime(0.09 * impactScale, now + 0.04);
      penetrationThumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.36);
      penetrationThump.connect(penetrationThumpGain);
      penetrationThumpGain.connect(transient.input);
      penetrationThump.start(now + 0.02);
      penetrationThump.stop(now + 0.4);

      if (interiorHighpass && penetrationTearGain) {
        interiorPenGain = context.createGain();
        interiorPenGain.gain.setValueAtTime(0.0001, now + 0.02);
        interiorPenGain.gain.exponentialRampToValueAtTime(0.1 * impactScale, now + 0.05);
        interiorPenGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.44);
        penetrationTearGain.connect(interiorPenGain);
        interiorPenGain.connect(interiorHighpass);
      }
    }

    let blastBoom: AudioBufferSourceNode | null = null;
    let blastBoomFilter: BiquadFilterNode | null = null;
    let blastBoomGain: GainNode | null = null;
    let blastFire: AudioBufferSourceNode | null = null;
    let blastFireFilter: BiquadFilterNode | null = null;
    let blastFireGain: GainNode | null = null;
    let blastDebris: AudioBufferSourceNode | null = null;
    let blastDebrisFilter: BiquadFilterNode | null = null;
    let blastDebrisGain: GainNode | null = null;
    if (isBlast) {
      blastBoom = this.createNoiseSource(context, 0.95, 0.42);
      blastBoomFilter = context.createBiquadFilter();
      blastBoomFilter.type = 'lowpass';
      blastBoomFilter.frequency.setValueAtTime(300, now);
      blastBoomFilter.frequency.exponentialRampToValueAtTime(110, now + 0.72);
      blastBoomFilter.Q.value = 0.5;
      blastBoomGain = context.createGain();
      blastBoomGain.gain.setValueAtTime(0.0001, now);
      blastBoomGain.gain.exponentialRampToValueAtTime(0.26 * impactScale, now + 0.04);
      blastBoomGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.76);
      blastBoom.connect(blastBoomFilter);
      blastBoomFilter.connect(blastBoomGain);
      blastBoomGain.connect(transient.input);
      blastBoom.start(now);
      blastBoom.stop(now + 0.8);

      blastFire = this.createNoiseSource(context, 0.74, 0.72);
      blastFireFilter = context.createBiquadFilter();
      blastFireFilter.type = 'bandpass';
      blastFireFilter.frequency.setValueAtTime(560, now + 0.03);
      blastFireFilter.frequency.exponentialRampToValueAtTime(220, now + 0.62);
      blastFireFilter.Q.value = 0.52;
      blastFireGain = context.createGain();
      blastFireGain.gain.setValueAtTime(0.0001, now + 0.02);
      blastFireGain.gain.exponentialRampToValueAtTime(0.15 * impactScale, now + 0.1);
      blastFireGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.66);
      blastFire.connect(blastFireFilter);
      blastFireFilter.connect(blastFireGain);
      blastFireGain.connect(transient.input);
      blastFire.start(now + 0.02);
      blastFire.stop(now + 0.7);

      blastDebris = this.createNoiseSource(context, 0.48, 1.28);
      blastDebrisFilter = context.createBiquadFilter();
      blastDebrisFilter.type = 'highpass';
      blastDebrisFilter.frequency.setValueAtTime(1400, now + 0.01);
      blastDebrisFilter.frequency.exponentialRampToValueAtTime(620, now + 0.32);
      blastDebrisFilter.Q.value = 0.8;
      blastDebrisGain = context.createGain();
      blastDebrisGain.gain.setValueAtTime(0.0001, now + 0.01);
      blastDebrisGain.gain.exponentialRampToValueAtTime(0.08 * impactScale, now + 0.04);
      blastDebrisGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
      blastDebris.connect(blastDebrisFilter);
      blastDebrisFilter.connect(blastDebrisGain);
      blastDebrisGain.connect(transient.input);
      blastDebris.start(now + 0.01);
      blastDebris.stop(now + 0.36);
    }

    let hullThump: OscillatorNode | null = null;
    let hullThumpGain: GainNode | null = null;
    if (interiorHighpass) {
      hullThump = context.createOscillator();
      hullThump.type = 'triangle';
      hullThump.frequency.setValueAtTime(event.result === 'blast' ? 82 : 62, now);
      hullThump.frequency.exponentialRampToValueAtTime(event.result === 'blast' ? 34 : 28, now + 0.2);
      hullThumpGain = context.createGain();
      hullThumpGain.gain.setValueAtTime(0.0001, now);
      hullThumpGain.gain.exponentialRampToValueAtTime((event.result === 'blast' ? 0.16 : 0.12) * impactScale, now + 0.01);
      hullThumpGain.gain.exponentialRampToValueAtTime(0.0001, now + (event.result === 'blast' ? 0.3 : 0.22));
      hullThump.connect(hullThumpGain);
      hullThumpGain.connect(interiorHighpass);
      hullThump.start(now);
      hullThump.stop(now + (event.result === 'blast' ? 0.32 : 0.24));
    }

    globalThis.setTimeout(() => {
      hit.disconnect();
      hitFilter.disconnect();
      ring?.disconnect();
      ringGain?.disconnect();
      ricochetScrape?.disconnect();
      ricochetScrapeFilter?.disconnect();
      ricochetScrapeGain?.disconnect();
      ricochetZing?.disconnect();
      ricochetZingGain?.disconnect();
      ricochetArmorRing?.disconnect();
      ricochetArmorRingGain?.disconnect();
      interiorRicochetGain?.disconnect();
      groundBody?.disconnect();
      groundBodyFilter?.disconnect();
      groundBodyGain?.disconnect();
      groundSpray?.disconnect();
      groundSprayFilter?.disconnect();
      groundSprayGain?.disconnect();
      armorThunk?.disconnect();
      armorThunkGain?.disconnect();
      armorShudder?.disconnect();
      armorShudderFilter?.disconnect();
      armorShudderGain?.disconnect();
      penetrationTear?.disconnect();
      penetrationTearFilter?.disconnect();
      penetrationTearGain?.disconnect();
      penetrationThump?.disconnect();
      penetrationThumpGain?.disconnect();
      interiorPenGain?.disconnect();
      blastBoom?.disconnect();
      blastBoomFilter?.disconnect();
      blastBoomGain?.disconnect();
      blastFire?.disconnect();
      blastFireFilter?.disconnect();
      blastFireGain?.disconnect();
      blastDebris?.disconnect();
      blastDebrisFilter?.disconnect();
      blastDebrisGain?.disconnect();
      interiorHitGain?.disconnect();
      interiorRingGain?.disconnect();
      hullThump?.disconnect();
      hullThumpGain?.disconnect();
      interiorHighpass?.disconnect();
      interiorLowpass?.disconnect();
      interiorBus?.disconnect();
      this.disposeTransientBus(transient);
    }, Math.ceil((impactTail + 0.18) * 1000));
  }

  playExplosion(event: ExplosionEvent): void {
    if (!this.context) return;

    const context = this.context;
    const now = context.currentTime;
    const scale = clamp(event.scale, 0.5, 2.2);
    const isPlayerExplosion = event.source === 'player';
    const listenerDistance = this.lastListenerPose ? distanceBetween(this.lastListenerPose.position, event.position) : 999;
    const proximity = this.lastListenerPose ? clamp(1 - (listenerDistance - 18) / 52, 0, 1) : 0;
    const closeBlast = proximity * proximity;
    const transient = this.createTransientBus(context, event.position, {
      highpass: 24,
      lowpass: 980,
      refDistance: isPlayerExplosion ? 18 : lerp(16, 24, closeBlast),
      maxDistance: 480,
      rolloffFactor: lerp(0.82, 0.68, closeBlast),
    });

    transient.output.gain.setValueAtTime(0.0001, now);
    transient.output.gain.exponentialRampToValueAtTime((0.88 + closeBlast * 0.82) * scale, now + 0.02);
    transient.output.gain.exponentialRampToValueAtTime((0.16 + closeBlast * 0.14) * scale, now + 0.62);
    transient.output.gain.exponentialRampToValueAtTime(0.0001, now + 2.8);

    const boom = this.createNoiseSource(context, 2.4, 0.22);
    const boomFilter = context.createBiquadFilter();
    boomFilter.type = 'lowpass';
    boomFilter.frequency.setValueAtTime(340, now);
    boomFilter.frequency.exponentialRampToValueAtTime(110, now + 1.1);
    boomFilter.Q.value = 0.45;
    const boomGain = context.createGain();
    boomGain.gain.setValueAtTime(0.0001, now);
    boomGain.gain.exponentialRampToValueAtTime((0.66 + closeBlast * 0.72) * scale, now + 0.03);
    boomGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.1);
    boom.connect(boomFilter);
    boomFilter.connect(boomGain);
    boomGain.connect(transient.input);
    boom.start(now);
    boom.stop(now + 2.2);

    const fireball = this.createNoiseSource(context, 1.4, 0.64);
    const fireballFilter = context.createBiquadFilter();
    fireballFilter.type = 'bandpass';
    fireballFilter.frequency.setValueAtTime(420, now + 0.03);
    fireballFilter.frequency.exponentialRampToValueAtTime(180, now + 1.4);
    fireballFilter.Q.value = 0.55;
    const fireballGain = context.createGain();
    fireballGain.gain.setValueAtTime(0.0001, now + 0.02);
    fireballGain.gain.exponentialRampToValueAtTime((0.24 + closeBlast * 0.1) * scale, now + 0.12);
    fireballGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.65);
    fireball.connect(fireballFilter);
    fireballFilter.connect(fireballGain);
    fireballGain.connect(transient.input);
    fireball.start(now + 0.02);
    fireball.stop(now + 1.7);

    const debris = this.createNoiseSource(context, 1.8, 1.25);
    const debrisFilter = context.createBiquadFilter();
    debrisFilter.type = 'highpass';
    debrisFilter.frequency.setValueAtTime(780, now + 0.01);
    debrisFilter.frequency.exponentialRampToValueAtTime(260, now + 0.9);
    debrisFilter.Q.value = 0.9;
    const debrisGain = context.createGain();
    debrisGain.gain.setValueAtTime(0.0001, now + 0.01);
    debrisGain.gain.exponentialRampToValueAtTime((0.1 + closeBlast * 0.09) * scale, now + 0.05);
    debrisGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
    debris.connect(debrisFilter);
    debrisFilter.connect(debrisGain);
    debrisGain.connect(transient.input);
    debris.start(now + 0.01);
    debris.stop(now + 1.25);

    const thump = context.createOscillator();
    thump.type = 'triangle';
    thump.frequency.setValueAtTime(62, now);
    thump.frequency.exponentialRampToValueAtTime(23, now + 0.75);
    const thumpGain = context.createGain();
    thumpGain.gain.setValueAtTime(0.0001, now);
    thumpGain.gain.exponentialRampToValueAtTime((0.32 + closeBlast * 0.34) * scale, now + 0.012);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
    thump.connect(thumpGain);
    thumpGain.connect(transient.input);
    thump.start(now);
    thump.stop(now + 0.95);

    const shockwave = context.createOscillator();
    shockwave.type = 'sine';
    shockwave.frequency.setValueAtTime(38, now + 0.02);
    shockwave.frequency.exponentialRampToValueAtTime(16, now + 1.2);
    const shockwaveGain = context.createGain();
    shockwaveGain.gain.setValueAtTime(0.0001, now + 0.02);
    shockwaveGain.gain.exponentialRampToValueAtTime((0.16 + closeBlast * 0.26) * scale, now + 0.06);
    shockwaveGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.35);
    shockwave.connect(shockwaveGain);
    shockwaveGain.connect(transient.input);
    shockwave.start(now + 0.02);
    shockwave.stop(now + 1.4);

    const echo = this.createNoiseSource(context, 2.6, 0.18);
    const echoFilter = context.createBiquadFilter();
    echoFilter.type = 'bandpass';
    echoFilter.frequency.setValueAtTime(240, now + 0.2);
    echoFilter.Q.value = 0.32;
    const echoGain = context.createGain();
    echoGain.gain.setValueAtTime(0.0001, now + 0.18);
    echoGain.gain.exponentialRampToValueAtTime((0.12 + closeBlast * 0.05) * scale, now + 0.46);
    echoGain.gain.exponentialRampToValueAtTime(0.0001, now + 2.7);
    echo.connect(echoFilter);
    echoFilter.connect(echoGain);
    echoGain.connect(transient.input);
    echo.start(now + 0.16);
    echo.stop(now + 2.75);

    let interiorBus: GainNode | null = null;
    let interiorHighpass: BiquadFilterNode | null = null;
    let interiorLowpass: BiquadFilterNode | null = null;
    let interiorRumbleGain: GainNode | null = null;
    let interiorMetalGain: GainNode | null = null;
    let proximityBus: GainNode | null = null;
    let proximityHighpass: BiquadFilterNode | null = null;
    let proximityLowpass: BiquadFilterNode | null = null;
    let proximityRumbleGain: GainNode | null = null;
    let proximityShockGain: GainNode | null = null;
    let hullHit: OscillatorNode | null = null;
    let hullHitGain: GainNode | null = null;
    let pressureNoise: AudioBufferSourceNode | null = null;
    let pressureNoiseFilter: BiquadFilterNode | null = null;
    let pressureNoiseGain: GainNode | null = null;
    if (isPlayerExplosion || closeBlast > 0.02) {
      interiorBus = context.createGain();
      interiorBus.gain.value = 0;

      interiorHighpass = context.createBiquadFilter();
      interiorHighpass.type = 'highpass';
      interiorHighpass.frequency.value = 26;
      interiorHighpass.Q.value = 0.2;

      interiorLowpass = context.createBiquadFilter();
      interiorLowpass.type = 'lowpass';
      interiorLowpass.frequency.value = 420;
      interiorLowpass.Q.value = 0.35;

      interiorHighpass.connect(interiorLowpass);
      interiorLowpass.connect(interiorBus);
      interiorBus.connect(context.destination);

      interiorBus.gain.setValueAtTime(0.0001, now);
      interiorBus.gain.exponentialRampToValueAtTime((0.38 + closeBlast * 0.36) * scale, now + 0.025);
      interiorBus.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);

      interiorRumbleGain = context.createGain();
      interiorRumbleGain.gain.setValueAtTime(0.0001, now);
      interiorRumbleGain.gain.exponentialRampToValueAtTime((0.22 + closeBlast * 0.24) * scale, now + 0.035);
      interiorRumbleGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
      thumpGain.connect(interiorRumbleGain);
      interiorRumbleGain.connect(interiorHighpass);

      interiorMetalGain = context.createGain();
      interiorMetalGain.gain.setValueAtTime(0.0001, now + 0.02);
      interiorMetalGain.gain.exponentialRampToValueAtTime(0.1 * scale, now + 0.09);
      interiorMetalGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);
      debrisGain.connect(interiorMetalGain);
      interiorMetalGain.connect(interiorHighpass);

      if (!isPlayerExplosion) {
        proximityBus = context.createGain();
        proximityBus.gain.value = 0;

        proximityHighpass = context.createBiquadFilter();
        proximityHighpass.type = 'highpass';
        proximityHighpass.frequency.value = 18;
        proximityHighpass.Q.value = 0.18;

        proximityLowpass = context.createBiquadFilter();
        proximityLowpass.type = 'lowpass';
        proximityLowpass.frequency.value = 360;
        proximityLowpass.Q.value = 0.42;

        proximityHighpass.connect(proximityLowpass);
        proximityLowpass.connect(proximityBus);
        proximityBus.connect(context.destination);

        proximityBus.gain.setValueAtTime(0.0001, now);
        proximityBus.gain.exponentialRampToValueAtTime((0.26 + closeBlast * 0.92) * scale, now + 0.024);
        proximityBus.gain.exponentialRampToValueAtTime(0.0001, now + 1.7);

        proximityRumbleGain = context.createGain();
        proximityRumbleGain.gain.setValueAtTime(0.0001, now);
        proximityRumbleGain.gain.exponentialRampToValueAtTime((0.18 + closeBlast * 0.52) * scale, now + 0.028);
        proximityRumbleGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.05);
        thumpGain.connect(proximityRumbleGain);
        proximityRumbleGain.connect(proximityHighpass);

        proximityShockGain = context.createGain();
        proximityShockGain.gain.setValueAtTime(0.0001, now + 0.015);
        proximityShockGain.gain.exponentialRampToValueAtTime((0.16 + closeBlast * 0.46) * scale, now + 0.055);
        proximityShockGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);
        shockwaveGain.connect(proximityShockGain);
        proximityShockGain.connect(proximityHighpass);

        hullHit = context.createOscillator();
        hullHit.type = 'triangle';
        hullHit.frequency.setValueAtTime(96, now);
        hullHit.frequency.exponentialRampToValueAtTime(34, now + 0.42);
        hullHitGain = context.createGain();
        hullHitGain.gain.setValueAtTime(0.0001, now);
        hullHitGain.gain.exponentialRampToValueAtTime((0.12 + closeBlast * 0.32) * scale, now + 0.014);
        hullHitGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
        hullHit.connect(hullHitGain);
        hullHitGain.connect(proximityHighpass);
        hullHit.start(now);
        hullHit.stop(now + 0.55);

        pressureNoise = this.createNoiseSource(context, 0.9, 0.14);
        pressureNoiseFilter = context.createBiquadFilter();
        pressureNoiseFilter.type = 'bandpass';
        pressureNoiseFilter.frequency.setValueAtTime(120, now + 0.01);
        pressureNoiseFilter.frequency.exponentialRampToValueAtTime(58, now + 0.7);
        pressureNoiseFilter.Q.value = 0.3;
        pressureNoiseGain = context.createGain();
        pressureNoiseGain.gain.setValueAtTime(0.0001, now + 0.01);
        pressureNoiseGain.gain.exponentialRampToValueAtTime((0.12 + closeBlast * 0.28) * scale, now + 0.08);
        pressureNoiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.85);
        pressureNoise.connect(pressureNoiseFilter);
        pressureNoiseFilter.connect(pressureNoiseGain);
        pressureNoiseGain.connect(proximityHighpass);
        pressureNoise.start(now + 0.01);
        pressureNoise.stop(now + 0.9);
      }
    }

    echo.onended = () => {
      boom.disconnect();
      boomFilter.disconnect();
      boomGain.disconnect();
      fireball.disconnect();
      fireballFilter.disconnect();
      fireballGain.disconnect();
      debris.disconnect();
      debrisFilter.disconnect();
      debrisGain.disconnect();
      thump.disconnect();
      thumpGain.disconnect();
      shockwave.disconnect();
      shockwaveGain.disconnect();
      echo.disconnect();
      echoFilter.disconnect();
      echoGain.disconnect();
      hullHit?.disconnect();
      hullHitGain?.disconnect();
      pressureNoise?.disconnect();
      pressureNoiseFilter?.disconnect();
      pressureNoiseGain?.disconnect();
      interiorRumbleGain?.disconnect();
      interiorMetalGain?.disconnect();
      interiorHighpass?.disconnect();
      interiorLowpass?.disconnect();
      interiorBus?.disconnect();
      proximityRumbleGain?.disconnect();
      proximityShockGain?.disconnect();
      proximityHighpass?.disconnect();
      proximityLowpass?.disconnect();
      proximityBus?.disconnect();
      this.disposeTransientBus(transient);
    };
  }

  private createGraph(context: AudioContext): EngineGraph {
    const outputGain = context.createGain();
    outputGain.gain.value = 0;

    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 14;
    compressor.ratio.value = 2.5;
    compressor.attack.value = 0.015;
    compressor.release.value = 0.18;

    const viewLowpass = context.createBiquadFilter();
    viewLowpass.type = 'lowpass';
    viewLowpass.frequency.value = this.state.viewLowpass;
    viewLowpass.Q.value = 0.2;

    const viewHighpass = context.createBiquadFilter();
    viewHighpass.type = 'highpass';
    viewHighpass.frequency.value = this.state.viewHighpass;
    viewHighpass.Q.value = 0.3;

    const panner = context.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 6;
    panner.maxDistance = 220;
    panner.rolloffFactor = 1.15;
    panner.coneInnerAngle = 360;
    panner.coneOuterAngle = 0;
    panner.coneOuterGain = 1;

    const engineBus = context.createGain();
    engineBus.gain.value = 1;

    engineBus.connect(panner);
    panner.connect(viewLowpass);
    viewLowpass.connect(viewHighpass);
    viewHighpass.connect(compressor);
    compressor.connect(outputGain);
    outputGain.connect(context.destination);

    const idle = this.createLoopLayer(context, createIdleLoopBuffer(context), 'lowpass', 0.4, engineBus);
    const load = this.createLoopLayer(context, createLoadLoopBuffer(context), 'lowpass', 0.55, engineBus);
    const track = this.createLoopLayer(context, createTrackLoopBuffer(context), 'bandpass', 0.8, engineBus);
    const whine = this.createLoopLayer(context, createWhineLoopBuffer(context), 'bandpass', 1.2, engineBus);

    const graph: EngineGraph = {
      outputGain,
      compressor,
      viewLowpass,
      viewHighpass,
      panner,
      engineBus,
      idle,
      load,
      track,
      whine,
    };

    this.applyState(graph, this.state);
    return graph;
  }

  private createLoopLayer(
    context: AudioContext,
    buffer: AudioBuffer,
    filterType: BiquadFilterType,
    q: number,
    destination: AudioNode,
  ): LoopLayerNodes {
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = context.createBiquadFilter();
    filter.type = filterType;
    filter.Q.value = q;

    const gain = context.createGain();
    gain.gain.value = 0;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(destination);
    source.start();

    return { source, filter, gain };
  }

  private applyState(graph: EngineGraph, state: EngineSmoothingState): void {
    graph.outputGain.gain.value = state.outputGain;
    graph.viewLowpass.frequency.value = state.viewLowpass;
    graph.viewHighpass.frequency.value = state.viewHighpass;

    graph.idle.gain.gain.value = state.idleGain;
    graph.load.gain.gain.value = state.loadGain;
    graph.track.gain.gain.value = state.trackGain;
    graph.whine.gain.gain.value = state.whineGain;

    graph.idle.source.playbackRate.value = state.idleRate;
    graph.load.source.playbackRate.value = state.loadRate;
    graph.track.source.playbackRate.value = state.trackRate;
    graph.whine.source.playbackRate.value = state.whineRate;

    graph.idle.filter.frequency.value = state.idleFilter;
    graph.load.filter.frequency.value = state.loadFilter;
    graph.track.filter.frequency.value = state.trackFilter;
    graph.whine.filter.frequency.value = state.whineFilter;
  }

  private createNoiseSource(context: AudioContext, duration: number, playbackRate: number): AudioBufferSourceNode {
    const source = context.createBufferSource();
    source.buffer = this.transientNoiseBuffer ?? createNoiseBuffer(context, Math.max(duration, 1));
    source.loop = true;
    source.playbackRate.value = playbackRate;
    return source;
  }

  private createTransientBus(
    context: AudioContext,
    position: AudioVec3,
    config: {
      highpass: number;
      lowpass: number;
      refDistance: number;
      maxDistance: number;
      rolloffFactor: number;
    },
  ): TransientBus {
    const input = context.createGain();
    input.gain.value = 1;

    const output = context.createGain();
    output.gain.value = 0;

    const panner = context.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = config.refDistance;
    panner.maxDistance = config.maxDistance;
    panner.rolloffFactor = config.rolloffFactor;
    panner.coneInnerAngle = 360;
    panner.coneOuterAngle = 0;
    panner.coneOuterGain = 1;
    setSpatialPosition(panner, position);

    const highpass = context.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = config.highpass;
    highpass.Q.value = 0.25;

    const lowpass = context.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = config.lowpass;
    lowpass.Q.value = 0.25;

    input.connect(panner);
    panner.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(output);
    output.connect(context.destination);

    return { input, output, panner, highpass, lowpass };
  }

  private disposeTransientBus(bus: TransientBus): void {
    bus.input.disconnect();
    bus.panner.disconnect();
    bus.highpass.disconnect();
    bus.lowpass.disconnect();
    bus.output.disconnect();
  }
}

class AudioManager {
  private backend: AudioBackend;
  private context: AudioContext | null = null;
  private mountCount = 0;
  private unlockListenersAttached = false;
  private lastListenerPose: ListenerPose | null = null;
  private lastPlayerEngine: EngineTelemetry | null = null;

  constructor(backend: AudioBackend = new SilentAudioBackend()) {
    this.backend = backend;
  }

  private readonly unlockAudio = () => {
    void this.ensureContext();
  };

  mount(): void {
    this.mountCount += 1;
    if (this.mountCount > 1 || typeof window === 'undefined' || this.unlockListenersAttached) {
      return;
    }

    window.addEventListener('pointerdown', this.unlockAudio, true);
    window.addEventListener('keydown', this.unlockAudio, true);
    window.addEventListener('touchstart', this.unlockAudio, true);
    this.unlockListenersAttached = true;
  }

  dispose(): void {
    if (this.mountCount === 0) return;

    this.mountCount -= 1;
    if (this.mountCount > 0) return;

    this.detachUnlockListeners();
    this.backend.detachContext();

    if (this.context && this.context.state !== 'closed') {
      void this.context.close();
    }

    this.context = null;
  }

  replaceBackend(backend: AudioBackend): void {
    this.backend.detachContext();
    this.backend = backend;

    if (this.context && this.context.state !== 'closed') {
      this.backend.attachContext(this.context);
    }
    if (this.lastListenerPose) {
      this.backend.setListenerPose(this.lastListenerPose);
    }
    if (this.lastPlayerEngine) {
      this.backend.syncPlayerEngine(this.lastPlayerEngine);
    }
  }

  setListenerPose(pose: ListenerPose): void {
    this.lastListenerPose = pose;
    this.backend.setListenerPose(pose);
  }

  syncPlayerEngine(telemetry: EngineTelemetry): void {
    this.lastPlayerEngine = telemetry;
    this.backend.syncPlayerEngine(telemetry);
  }

  playShot(event: ShotEvent): void {
    void this.runWithContext(() => {
      this.backend.playShot(event);
    });
  }

  playImpact(event: ImpactEvent): void {
    void this.runWithContext(() => {
      this.backend.playImpact(event);
    });
  }

  playExplosion(event: ExplosionEvent): void {
    void this.runWithContext(() => {
      this.backend.playExplosion(event);
    });
  }

  private detachUnlockListeners(): void {
    if (typeof window === 'undefined' || !this.unlockListenersAttached) return;

    window.removeEventListener('pointerdown', this.unlockAudio, true);
    window.removeEventListener('keydown', this.unlockAudio, true);
    window.removeEventListener('touchstart', this.unlockAudio, true);
    this.unlockListenersAttached = false;
  }

  private async runWithContext(callback: () => void): Promise<void> {
    await this.ensureContext();
    callback();
  }

  private async ensureContext(): Promise<AudioContext | null> {
    const context = this.getOrCreateContext();
    if (!context) return null;

    if (context.state === 'suspended') {
      await context.resume();
    }

    return context;
  }

  private getOrCreateContext(): AudioContext | null {
    if (this.context && this.context.state !== 'closed') {
      return this.context;
    }
    if (typeof window === 'undefined') {
      return null;
    }

    const audioWindow = window as AudioWindow;
    const AudioContextCtor = globalThis.AudioContext ?? audioWindow.webkitAudioContext;
    if (!AudioContextCtor) {
      return null;
    }

    this.context = new AudioContextCtor();
    this.backend.attachContext(this.context);
    return this.context;
  }
}

export const audioManager = new AudioManager(new LayeredTankAudioBackend());

export function toAudioVec3(vec: AudioVec3): AudioVec3 {
  return { x: vec.x, y: vec.y, z: vec.z };
}
