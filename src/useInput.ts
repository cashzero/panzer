import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore, GUNNER_ZOOM_LEVELS } from './store';
import { GAME_CONFIG } from './config';
import { type SwayState } from './tankPhysics';

export interface InputRefs {
  keys: React.MutableRefObject<{ [key: string]: boolean }>;
  primaryFireHeld: React.MutableRefObject<boolean>;
  arrowKeyPressStartedAt: React.MutableRefObject<{ left: number; right: number; up: number; down: number }>;
  cameraYaw: React.MutableRefObject<number>;
  cameraPitch: React.MutableRefObject<number>;
  isAiming: React.MutableRefObject<boolean>;
  swayPrev: React.MutableRefObject<{ pitch: number; roll: number; forwardSpeed: number; rotationSpeed: number }>;
  swayState: React.MutableRefObject<SwayState>;
}

export function useInput(onFire: () => void): InputRefs {
  const ammoType = useGameStore((state) => state.ammoType);
  const toggleAmmo = useGameStore((state) => state.toggleAmmo);
  const toggleViewMode = useGameStore((state) => state.toggleViewMode);
  const toggleMapMode = useGameStore((state) => state.toggleMapMode);
  const setCalibrationDistance = useGameStore((state) => state.setCalibrationDistance);

  const keys = useRef<{ [key: string]: boolean }>({});
  const primaryFireHeld = useRef(false);
  const arrowKeyPressStartedAt = useRef({ left: 0, right: 0, up: 0, down: 0 });
  const cameraYaw = useRef(0);
  const cameraPitch = useRef(0);
  const isAiming = useRef(false);
  const swayPrev = useRef({ pitch: 0, roll: 0, forwardSpeed: 0, rotationSpeed: 0 });
  const swayState = useRef<SwayState>({
    turretCurrent: 0, turretVelocity: 0,
    gunCurrent: 0, gunVelocity: 0,
  });

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const wasPressed = !!keys.current[e.code];
      keys.current[e.code] = true;
      const store = useGameStore.getState();
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
        if (!wasPressed) {
          const now = performance.now();
          if (e.code === 'ArrowLeft') arrowKeyPressStartedAt.current.left = now;
          if (e.code === 'ArrowRight') arrowKeyPressStartedAt.current.right = now;
          if (e.code === 'ArrowUp') arrowKeyPressStartedAt.current.up = now;
          if (e.code === 'ArrowDown') arrowKeyPressStartedAt.current.down = now;
        }
      }
      if (e.code === 'Space') {
        e.preventDefault();
        onFire();
      }
      if (e.code === 'KeyV') toggleViewMode();
      if (e.code === 'KeyM') {
        const wasMapMode = store.isMapMode;
        toggleMapMode();
        if (!wasMapMode) {
          document.exitPointerLock();
        } else {
          document.body.requestPointerLock().catch(() => {});
        }
      }
      if (e.code === 'PageUp') {
        const currentDist = store.calibrationDistance;
        setCalibrationDistance(Math.min(currentDist + 100, 2000));
      }
      if (e.code === 'PageDown') {
        const currentDist = store.calibrationDistance;
        setCalibrationDistance(Math.max(currentDist - 100, 0));
      }
      if (store.viewMode === 'gunner') {
        if (e.code === 'Equal' || e.code === 'NumpadAdd') {
          e.preventDefault();
          store.zoomGunnerIn();
        }
        if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
          e.preventDefault();
          store.zoomGunnerOut();
        }
      }
      if (e.code === 'KeyR') toggleAmmo();
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keys.current[e.code] = false;
      if (e.code === 'ArrowLeft') arrowKeyPressStartedAt.current.left = 0;
      if (e.code === 'ArrowRight') arrowKeyPressStartedAt.current.right = 0;
      if (e.code === 'ArrowUp') arrowKeyPressStartedAt.current.up = 0;
      if (e.code === 'ArrowDown') arrowKeyPressStartedAt.current.down = 0;
    };
    const handleBlur = () => {
      keys.current = {};
      primaryFireHeld.current = false;
      arrowKeyPressStartedAt.current = { left: 0, right: 0, up: 0, down: 0 };
      isAiming.current = false;
    };
    const handleMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement === document.body) {
        const viewMode = useGameStore.getState().viewMode;
        const gunnerZoom = useGameStore.getState().gunnerZoom;
        const zoomFov = GUNNER_ZOOM_LEVELS[gunnerZoom] ?? 20;
        // Scale sensitivity with FOV so higher zoom = slower camera
        const sensitivity = viewMode === 'gunner' ? 0.001 * (zoomFov / 20) : 0.003;
        cameraYaw.current -= e.movementX * sensitivity;
        cameraPitch.current -= e.movementY * sensitivity;
        cameraPitch.current = THREE.MathUtils.clamp(cameraPitch.current, -Math.PI / 4, Math.PI / 4);
      }
    };
    const handleMouseDown = (e: MouseEvent) => {
      if (useGameStore.getState().isMapMode) return;
      if (document.pointerLockElement !== document.body) {
        document.body.requestPointerLock().catch(() => {});
      }
      if (e.button === 0) {
        primaryFireHeld.current = true;
        onFire();
      } else if (e.button === 1) {
        e.preventDefault();
        toggleViewMode();
      } else if (e.button === 2) {
        isAiming.current = true;
      }
    };
    const handleMouseUp = (e: MouseEvent) => {
      if (useGameStore.getState().isMapMode) return;
      if (e.button === 0) {
        primaryFireHeld.current = false;
      }
      if (e.button === 2) {
        isAiming.current = false;
      }
    };
    const handleWheel = (e: WheelEvent) => {
      if (useGameStore.getState().isMapMode) return;
      if (useGameStore.getState().viewMode === 'gunner') {
        e.preventDefault();
        // Scroll = zoom, PageUp/PageDown = calibration distance
        if (e.deltaY > 0) {
          useGameStore.getState().zoomGunnerOut();
        } else {
          useGameStore.getState().zoomGunnerIn();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('blur', handleBlur);
    window.addEventListener('contextmenu', e => e.preventDefault());

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('contextmenu', e => e.preventDefault());
    };
  }, [ammoType, toggleAmmo]);

  return { keys, primaryFireHeld, arrowKeyPressStartedAt, cameraYaw, cameraPitch, isAiming, swayPrev, swayState };
}
