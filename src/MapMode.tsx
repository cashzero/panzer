import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from './store';
import { GAME_CONFIG } from './config';

export function MapCameraController() {
  const { camera } = useThree();
  const keys = useRef<{ [key: string]: boolean }>({});
  const mapPanOffset = useRef(new THREE.Vector2(0, 0));
  const mapZoom = useRef(GAME_CONFIG.map.defaultZoom);
  const mapDragging = useRef(false);
  const lastMousePos = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    // Exit pointer lock when map mode activates
    if (document.pointerLockElement) {
      document.exitPointerLock();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      keys.current[e.code] = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keys.current[e.code] = false;
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { zoomStep, minZoom, maxZoom } = GAME_CONFIG.map;
      const delta = e.deltaY > 0 ? zoomStep : -zoomStep;
      mapZoom.current = THREE.MathUtils.clamp(mapZoom.current + delta, minZoom, maxZoom);
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        mapDragging.current = true;
        lastMousePos.current = { x: e.clientX, y: e.clientY };
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        mapDragging.current = false;
        lastMousePos.current = null;
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (mapDragging.current && lastMousePos.current) {
        const dx = e.clientX - lastMousePos.current.x;
        const dy = e.clientY - lastMousePos.current.y;
        const panScale = mapZoom.current / 500;
        mapPanOffset.current.x -= dx * panScale;
        mapPanOffset.current.y -= dy * panScale;
        lastMousePos.current = { x: e.clientX, y: e.clientY };
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  useFrame((_state, delta) => {
    const player = useGameStore.getState().playerTank;
    const mapHeight = mapZoom.current;
    const panSpeed = mapHeight * GAME_CONFIG.map.panSpeed;

    // WASD panning
    if (keys.current['KeyW']) mapPanOffset.current.y += panSpeed * delta;
    if (keys.current['KeyS']) mapPanOffset.current.y -= panSpeed * delta;
    if (keys.current['KeyA']) mapPanOffset.current.x -= panSpeed * delta;
    if (keys.current['KeyD']) mapPanOffset.current.x += panSpeed * delta;

    const lookTarget = player.position.clone().add(
      new THREE.Vector3(mapPanOffset.current.x, 0, mapPanOffset.current.y)
    );
    const camPos = lookTarget.clone().add(new THREE.Vector3(0, mapHeight, 0));

    camera.position.copy(camPos);
    camera.lookAt(lookTarget);
    camera.up.set(0, 0, -1);
    (camera as THREE.PerspectiveCamera).fov = 60;
    camera.updateProjectionMatrix();
  });

  return null;
}
