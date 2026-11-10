import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Vector2, Vector3 } from 'three';

/**
 * Display-referred finish, the last pass before the HUD: muted saturation,
 * gentle contrast, olive-tinted shadows and warm highlights for a wartime
 * colour-film look, then the lens and the film stock. It runs after
 * anti-aliasing, so sharpening restores the fine detail SMAA and the
 * half-resolution passes soften without sharpening stair-steps, and the
 * grain is not smoothed away. The grain is faint: enough to break up banding
 * in the sky and to keep flat paint and haze from looking airbrushed.
 */
export const BATTLEFIELD_GRADE = {
  saturation: 0.74,
  contrast: 1.07,
  lift: new Vector3(0.024, 0.022, 0.012),
  gain: new Vector3(1.02, 0.995, 0.955),
  vignette: 0.26,
  /** Unsharp strength; 0 turns the four extra taps into a no-op. */
  sharpen: 0.42,
  /** Peak grain as a share of full white, in the mid-tones. */
  grain: 0.022,
};

const ColorGradeShader = {
  name: 'ColorGradeShader',
  uniforms: {
    tDiffuse: { value: null },
    saturation: { value: BATTLEFIELD_GRADE.saturation },
    contrast: { value: BATTLEFIELD_GRADE.contrast },
    lift: { value: BATTLEFIELD_GRADE.lift },
    gain: { value: BATTLEFIELD_GRADE.gain },
    vignette: { value: BATTLEFIELD_GRADE.vignette },
    sharpen: { value: BATTLEFIELD_GRADE.sharpen },
    grain: { value: BATTLEFIELD_GRADE.grain },
    texel: { value: new Vector2(1 / 1600, 1 / 900) },
    grainSeed: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float saturation, contrast, vignette, sharpen, grain, grainSeed;
    uniform vec2 texel;
    uniform vec3 lift, gain;
    varying vec2 vUv;
    float grainHash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }
    void main() {
      vec4 source = texture2D(tDiffuse, vUv);
      vec3 color = source.rgb;
      // Contrast-adaptive sharpening: push each pixel away from the mean of
      // its neighbours, less where the neighbourhood already spans a strong
      // edge, and never past the neighbourhood's own range (no halos).
      vec3 north = texture2D(tDiffuse, vUv + vec2(0.0, texel.y)).rgb;
      vec3 south = texture2D(tDiffuse, vUv - vec2(0.0, texel.y)).rgb;
      vec3 east = texture2D(tDiffuse, vUv + vec2(texel.x, 0.0)).rgb;
      vec3 west = texture2D(tDiffuse, vUv - vec2(texel.x, 0.0)).rgb;
      vec3 low = min(color, min(min(north, south), min(east, west)));
      vec3 high = max(color, max(max(north, south), max(east, west)));
      float span = max(high.r - low.r, max(high.g - low.g, high.b - low.b));
      vec3 detail = color - (north + south + east + west) * 0.25;
      color = clamp(color + detail * sharpen * (1.0 - smoothstep(0.12, 0.45, span)) * 2.0, low, high);

      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(luma), color, saturation);
      color = (color - 0.5) * contrast + 0.5;
      // Lift raises the shadows toward the tint; gain scales the highlights.
      color = color * gain + lift * (1.0 - color);
      float edge = smoothstep(0.38, 0.9, distance(vUv, vec2(0.5)));
      color *= 1.0 - vignette * edge;
      // Film grain: strongest in the mid-tones, gone in black and in white.
      float speck = grainHash(gl_FragCoord.xy + grainSeed) + grainHash(gl_FragCoord.yx * 1.37 + grainSeed + 19.7) - 1.0;
      float tone = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color += speck * grain * (0.35 + 2.6 * tone * (1.0 - tone));
      gl_FragColor = vec4(clamp(color, 0.0, 1.0), source.a);
    }
  `,
};

export function createColorGradePass() {
  return new ShaderPass(ColorGradeShader);
}
