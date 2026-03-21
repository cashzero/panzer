import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from './store';
import { GAME_CONFIG } from './config';
import { type SwayState } from './tankPhysics';

export interface InputRefs {
  keys: React.MutableRefObject<{ [key: string]: boolean }>;
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
      keys.current[e.code] = true;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
      if (e.code === 'Space') {
        e.preventDefault();
        onFire();
      }
      if (e.code === 'KeyV') toggleViewMode();
      if (e.code === 'KeyM') {
        const wasMapMode = useGameStore.getState().isMapMode;
        toggleMapMode();
        if (!wasMapMode) {
          document.exitPointerLock();
        } else {
          document.body.requestPointerLock().catch(() => {});
        }
      }
      if (e.code === 'PageUp') {
        const currentDist = useGameStore.getState().calibrationDistance;
        setCalibrationDistance(Math.min(currentDist + 100, 2000));
      }
      if (e.code === 'PageDown') {
        const currentDist = useGameStore.getState().calibrationDistance;
        setCalibrationDistance(Math.max(currentDist - 100, 0));
      }
      if (e.code === 'KeyR') toggleAmmo();
    };
    const handleKeyUp = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    const handleMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement === document.body) {
        const viewMode = useGameStore.getState().viewMode;
        const sensitivity = viewMode === 'gunner' ? 0.001 : 0.003;
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
      if (e.button === 1) {
        e.preventDefault();
        toggleViewMode();
      } else if (e.button === 2) {
        isAiming.current = true;
      }
    };
    const handleMouseUp = (e: MouseEvent) => {
      if (useGameStore.getState().isMapMode) return;
      if (e.button === 2) {
        isAiming.current = false;
      }
    };
    const handleWheel = (e: WheelEvent) => {
      if (useGameStore.getState().isMapMode) return;
      if (useGameStore.getState().viewMode === 'gunner') {
        e.preventDefault();
        const currentDist = useGameStore.getState().calibrationDistance;
        const delta = e.deltaY > 0 ? -100 : 100;
        const setCalibDist = useGameStore.getState().setCalibrationDistance;
        setCalibDist(Math.max(Math.min(currentDist + delta, 2000), 0));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('contextmenu', e => e.preventDefault());

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('contextmenu', e => e.preventDefault());
    };
  }, [ammoType, toggleAmmo]);

  return { keys, cameraYaw, cameraPitch, isAiming, swayPrev, swayState };
}
