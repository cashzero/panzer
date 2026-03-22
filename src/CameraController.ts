import * as THREE from 'three';
import { GAME_CONFIG } from './config';
import { GUNNER_ZOOM_LEVELS } from './store';

export interface CameraParams {
  camera: THREE.Camera;
  viewMode: 'third-person' | 'gunner';
  playerPos: THREE.Vector3;
  lookDir: THREE.Vector3;
  aimGunPivotWorld: THREE.Vector3;
  aimDir: THREE.Vector3;
  shakeIntensity?: number;
  gunnerZoom?: number; // index into GUNNER_ZOOM_LEVELS
}

export function updateCamera(params: CameraParams): void {
  const { camera, viewMode, playerPos, lookDir, aimGunPivotWorld, aimDir, shakeIntensity = 0, gunnerZoom = 0 } = params;

  if (viewMode === 'third-person') {
    camera.up.set(0, 1, 0);
    const cameraDistance = GAME_CONFIG.camera.distance;
    const cameraHeightOffset = GAME_CONFIG.camera.heightOffset;
    const targetPos = playerPos.clone().add(new THREE.Vector3(0, cameraHeightOffset, 0));
    const camPos = targetPos.clone().sub(lookDir.clone().multiplyScalar(cameraDistance));

    camera.position.copy(camPos);
    camera.lookAt(targetPos.clone().add(lookDir.clone().multiplyScalar(100)));
    (camera as THREE.PerspectiveCamera).fov = 60;
  } else {
    // Gunner view — camera follows bore axis (gun barrel direction)
    camera.up.set(0, 1, 0);

    const camPos = aimGunPivotWorld.clone().add(aimDir.clone().multiplyScalar(4.5));
    camera.position.copy(camPos);
    camera.lookAt(camPos.clone().add(aimDir.clone().multiplyScalar(100)));
    (camera as THREE.PerspectiveCamera).fov = GUNNER_ZOOM_LEVELS[gunnerZoom] ?? 20;
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

  (camera as THREE.PerspectiveCamera).near = 0.5;
  (camera as THREE.PerspectiveCamera).far = 100000;
  (camera as THREE.PerspectiveCamera).updateProjectionMatrix();
}
