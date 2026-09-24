import * as THREE from 'three';
import { GAME_CONFIG } from './config';
import { GUNNER_ZOOM_LEVELS } from './store';

export interface CameraParams {
  camera: THREE.Camera;
  viewMode: 'third-person' | 'gunner';
  thirdPersonPosition: THREE.Vector3; // orbit position, already smoothed and kept clear of the ground
  lookDir: THREE.Vector3;
  aimGunPivotWorld: THREE.Vector3;
  aimDir: THREE.Vector3;
  designatedAimTarget?: THREE.Vector3;
  gunnerAimTarget?: THREE.Vector3;
  shakeIntensity?: number;
  gunnerZoom?: number; // index into GUNNER_ZOOM_LEVELS
  smoothZoom?: boolean; // ease between gunner zoom steps instead of snapping
  delta?: number;
}

export function updateCamera(params: CameraParams): void {
  const { camera, viewMode, thirdPersonPosition, lookDir, aimGunPivotWorld, aimDir, designatedAimTarget, gunnerAimTarget, shakeIntensity = 0, gunnerZoom = 0, smoothZoom = false, delta = 0 } = params;
  const perspective = camera as THREE.PerspectiveCamera;

  if (viewMode === 'third-person') {
    camera.up.set(0, 1, 0);
    camera.position.copy(thirdPersonPosition);
    camera.lookAt(designatedAimTarget ?? thirdPersonPosition.clone().add(lookDir.clone().multiplyScalar(100)));
    perspective.fov = 60;
  } else {
    // Gunner view stays centered on the calibrated sight line.
    camera.up.set(0, 1, 0);

    const camPos = aimGunPivotWorld.clone().add(aimDir.clone().multiplyScalar(4.5));
    camera.position.copy(camPos);
    camera.lookAt(gunnerAimTarget ?? camPos.clone().add(aimDir.clone().multiplyScalar(100)));
    const targetFov = GUNNER_ZOOM_LEVELS[gunnerZoom] ?? 20;
    perspective.fov = smoothZoom
      ? perspective.fov + (targetFov - perspective.fov) * (1 - Math.exp(-delta / GAME_CONFIG.camera.zoomSmoothing))
      : targetFov;
  }

  // Apply screen shake
  if (shakeIntensity > 0) {
    const maxOffset = shakeIntensity * 1.2;
    const shakeX = (Math.random() * 2 - 1) * maxOffset;
    const shakeY = (Math.random() * 2 - 1) * maxOffset;
    const shakeZ = (Math.random() * 2 - 1) * maxOffset * 0.5;
    camera.position.x += shakeX;
    camera.position.y += shakeY;
    camera.position.z += shakeZ;
  }

  perspective.near = 0.5;
  perspective.far = 100000;
  perspective.updateProjectionMatrix();
}
