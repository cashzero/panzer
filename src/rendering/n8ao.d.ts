declare module 'n8ao' {
  import { Camera, Scene } from 'three';
  import { Pass } from 'three/addons/postprocessing/Pass.js';
  export class N8AOPass extends Pass {
    constructor(scene: Scene, camera: Camera, width: number, height: number);
    configuration: {
      gammaCorrection: boolean;
      aoRadius: number;
      distanceFalloff: number;
      intensity: number;
      halfRes: boolean;
    };
    setQualityMode(mode: 'Performance' | 'Low' | 'Medium' | 'High' | 'Ultra'): void;
  }
}
