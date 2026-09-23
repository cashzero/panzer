import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Vector3 } from 'three';

/**
 * Display-referred grade after OutputPass: muted saturation, gentle contrast,
 * olive-tinted shadows and warm highlights for a wartime colour-film look.
 */
export const BATTLEFIELD_GRADE = {
  saturation: 0.74,
  contrast: 1.07,
  lift: new Vector3(0.024, 0.022, 0.012),
  gain: new Vector3(1.02, 0.995, 0.955),
  vignette: 0.26,
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
    uniform float saturation, contrast, vignette;
    uniform vec3 lift, gain;
    varying vec2 vUv;
    void main() {
      vec4 source = texture2D(tDiffuse, vUv);
      vec3 color = source.rgb;
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      color = mix(vec3(luma), color, saturation);
      color = (color - 0.5) * contrast + 0.5;
      // Lift raises the shadows toward the tint; gain scales the highlights.
      color = color * gain + lift * (1.0 - color);
      float edge = smoothstep(0.38, 0.9, distance(vUv, vec2(0.5)));
      color *= 1.0 - vignette * edge;
      gl_FragColor = vec4(clamp(color, 0.0, 1.0), source.a);
    }
  `,
};

export function createColorGradePass() {
  return new ShaderPass(ColorGradeShader);
}
