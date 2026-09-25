import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/**
 * Blast waves seen as refraction. A gun firing, a shell bursting or a tank
 * brewing up throws out a shell of compressed air; against the landscape
 * it shows as a ring that bends the view behind it as it races outward,
 * which a sprite ring cannot give. Effects queue waves in world space; each
 * frame the pass projects them to the screen and displaces the image along
 * a thin lens profile at the ring's current radius.
 *
 * Sizes are in metres and converted per frame from the real projection, so
 * a wave keeps its size relative to the scene at any zoom or resolution,
 * and the displacement is capped by the ring's thickness on screen, so a
 * distant blast shimmers faintly instead of tearing the picture.
 */

const MAX_WAVES = 8;

export interface ShockwaveRequest {
  position: THREE.Vector3;
  /** Radius the front reaches, m. */
  radius: number;
  /** Time for the front to reach it, ms. */
  duration: number;
  /** Peak image displacement in pixels, for a front seen up close. */
  strength: number;
}

interface ActiveWave extends ShockwaveRequest {
  startedAt: number;
}

const waves: ActiveWave[] = [];

export function queueShockwave(request: ShockwaveRequest) {
  if (waves.length >= MAX_WAVES) waves.shift();
  waves.push({ ...request, position: request.position.clone(), startedAt: performance.now() });
}

const shockwaveShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    /** Per wave: centre in pixels, radius in pixels, ring half-width in pixels. */
    uWaves: { value: Array.from({ length: MAX_WAVES }, () => new THREE.Vector4()) },
    /** Per wave: displacement in pixels (0 = inactive). */
    uAmplitude: { value: new Array<number>(MAX_WAVES).fill(0) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    #define MAX_WAVES ${MAX_WAVES}
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform vec4 uWaves[MAX_WAVES];
    uniform float uAmplitude[MAX_WAVES];
    varying vec2 vUv;
    void main() {
      vec2 pixel = vUv * uResolution;
      vec2 offset = vec2(0.0);
      float compression = 0.0;
      for (int i = 0; i < MAX_WAVES; i++) {
        if (uAmplitude[i] <= 0.0) continue;
        vec2 fromCentre = pixel - uWaves[i].xy;
        float d = length(fromCentre);
        float x = (d - uWaves[i].z) / uWaves[i].w;
        if (abs(x) > 3.0) continue;
        // A lens across the front: the image bows outward just ahead of the
        // compressed shell and back in behind it (peak normalised to 1).
        float lens = x * exp(-x * x) * 2.33;
        offset += (fromCentre / max(d, 1.0)) * lens * uAmplitude[i];
        compression += exp(-x * x * 2.0) * uAmplitude[i];
      }
      vec4 colour = texture2D(tDiffuse, (pixel - offset) / uResolution);
      // The compressed shell catches a little more light than the air around it.
      colour.rgb *= 1.0 + min(compression, 30.0) * 0.007;
      gl_FragColor = colour;
    }
  `,
};

export function createShockwavePass() {
  const pass = new ShaderPass(shockwaveShader);
  pass.enabled = false;
  return pass;
}

const view = new THREE.Vector3();
const clip = new THREE.Vector3();
const compiled = new WeakSet<ShaderPass>();

/**
 * Advances the waves and loads them into the pass; the pass stays off while none are live.
 * The first frame draws it once with no waves, so its shader compiles while the battle
 * loads instead of stalling the first gun that fires.
 */
export function updateShockwavePass(pass: ShaderPass, camera: THREE.Camera, width: number, height: number) {
  const now = performance.now();
  for (let i = waves.length - 1; i >= 0; i--) {
    if (now - waves[i].startedAt > waves[i].duration) waves.splice(i, 1);
  }
  const uniforms = pass.uniforms as typeof shockwaveShader.uniforms;
  uniforms.uResolution.value.set(width, height);
  const projection = (camera as THREE.PerspectiveCamera).projectionMatrix;
  const pixelsPerMetreAtUnitDepth = projection.elements[5] * 0.5 * height;
  let live = 0;
  for (let i = 0; i < MAX_WAVES; i++) {
    const wave = waves[i];
    uniforms.uAmplitude.value[i] = 0;
    if (!wave) continue;
    view.copy(wave.position).applyMatrix4(camera.matrixWorldInverse);
    const depth = -view.z;
    if (depth < 0.5) continue;
    clip.copy(wave.position).project(camera);
    const t = (now - wave.startedAt) / wave.duration;
    // The front decelerates as it spreads, and weakens as it goes.
    const radius = wave.radius * (1 - (1 - t) * (1 - t));
    const halfWidth = 0.35 + 0.1 * radius;
    const scale = pixelsPerMetreAtUnitDepth / depth;
    const ringPixels = halfWidth * scale;
    const amplitude = Math.min(wave.strength, ringPixels * 0.9) * Math.pow(1 - t, 1.2);
    if (amplitude < 0.15 || ringPixels < 0.5) continue;
    uniforms.uWaves.value[i].set((clip.x * 0.5 + 0.5) * width, (clip.y * 0.5 + 0.5) * height, radius * scale, Math.max(1.5, ringPixels));
    uniforms.uAmplitude.value[i] = amplitude;
    live++;
  }
  pass.enabled = live > 0 || !compiled.has(pass);
  compiled.add(pass);
}
