import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useGameStore } from './store';
import { GAME_CONFIG } from './config';
import { getTerrainHeight } from './Terrain';

/**
 * A narrow field of view, raised so the visible area matches the old 60 degree
 * view at the same zoom: buildings and trees read nearly flat, like a map.
 */
const MAP_FOV = 22;
const MAP_HEIGHT_FACTOR = Math.tan(THREE.MathUtils.degToRad(30)) / Math.tan(THREE.MathUtils.degToRad(MAP_FOV / 2));

/** Read by the map HUD for its scale bar. Metres per screen pixel at ground level. */
export const mapView = { metresPerPixel: 1 };

/** Grid cells per side; must match the order-of-battle planning map. */
export const MAP_GRID_DIVISIONS = 8;

/** Grid reference ("C4") of a world point: columns A-H west to east, rows 1-8 north to south. */
export function gridReference(x: number, z: number, terrainSize: number) {
  const cell = terrainSize / MAP_GRID_DIVISIONS;
  const column = Math.min(MAP_GRID_DIVISIONS - 1, Math.max(0, Math.floor((x + terrainSize / 2) / cell)));
  const row = Math.min(MAP_GRID_DIVISIONS - 1, Math.max(0, Math.floor((z + terrainSize / 2) / cell)));
  return `${String.fromCharCode(65 + column)}${row + 1}`;
}

/** The battlefield's map grid, with each square's reference in its north-west corner. */
export function BattleMapGrid() {
  const size = useGameStore((state) => state.roadNetwork.terrainSize);
  const half = size / 2;
  const cell = size / MAP_GRID_DIVISIONS;
  const lines = useMemo(() => {
    const points: number[] = [];
    for (let i = 0; i <= MAP_GRID_DIVISIONS; i++) {
      const c = -half + i * cell;
      points.push(c, 40, -half, c, 40, half, -half, 40, c, half, 40, c);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    return geometry;
  }, [half, cell]);
  useEffect(() => () => lines.dispose(), [lines]);
  const labels = [];
  for (let column = 0; column < MAP_GRID_DIVISIONS; column++) {
    for (let row = 0; row < MAP_GRID_DIVISIONS; row++) {
      labels.push(
        <Html key={`${column}-${row}`} position={[-half + column * cell, 40, -half + row * cell]} className="battle-map-ref" zIndexRange={[5, 0]}>
          {String.fromCharCode(65 + column)}{row + 1}
        </Html>,
      );
    }
  }
  return (
    <>
      <lineSegments geometry={lines} renderOrder={8}>
        <lineBasicMaterial color="#1d2319" transparent opacity={0.6} depthTest={false} />
      </lineSegments>
      {labels}
    </>
  );
}

export function MapCameraController() {
  const { camera } = useThree();
  const keys = useRef<{ [key: string]: boolean }>({});
  const mapPanOffset = useRef(new THREE.Vector2(0, 0));
  const mapZoom = useRef(GAME_CONFIG.map.defaultZoom);
  const mapDragging = useRef(false);
  const lastMousePos = useRef<{ x: number; y: number } | null>(null);
  const mouseDownPos = useRef<{ x: number; y: number } | null>(null);
  const mouseDownTime = useRef(0);

  const raycaster = useRef(new THREE.Raycaster());
  const groundPlane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));

  const isHudEvent = (target: EventTarget | null) => {
    return target instanceof HTMLElement && !!target.closest('[data-map-hud="true"]');
  };

  /** Raycast mouse position to the ground plane, returns world XZ point */
  const getGroundPoint = (clientX: number, clientY: number): THREE.Vector3 | null => {
    const ndc = new THREE.Vector2(
      (clientX / window.innerWidth) * 2 - 1,
      -(clientY / window.innerHeight) * 2 + 1
    );
    raycaster.current.setFromCamera(ndc, camera);
    const hit = new THREE.Vector3();
    const result = raycaster.current.ray.intersectPlane(groundPlane.current, hit);
    return result ? hit : null;
  };

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
      // Proportional steps: each notch zooms by the same factor at any scale.
      const { zoomFactor, minZoom } = GAME_CONFIG.map;
      // Fully zoomed out, the whole battlefield fits in the view's height.
      const terrainSize = useGameStore.getState().roadNetwork.terrainSize;
      const maxZoom = (terrainSize * 1.1) / (2 * Math.tan(THREE.MathUtils.degToRad(30)));
      const factor = e.deltaY > 0 ? zoomFactor : 1 / zoomFactor;
      mapZoom.current = THREE.MathUtils.clamp(mapZoom.current * factor, minZoom, maxZoom);
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (isHudEvent(e.target)) return;

      if (e.button === 0) {
        mapDragging.current = true;
        lastMousePos.current = { x: e.clientX, y: e.clientY };
        mouseDownPos.current = { x: e.clientX, y: e.clientY };
        mouseDownTime.current = Date.now();
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (isHudEvent(e.target)) {
        mapDragging.current = false;
        lastMousePos.current = null;
        mouseDownPos.current = null;
        return;
      }

      if (e.button === 0) {
        mapDragging.current = false;

        // Distinguish click from drag
        if (mouseDownPos.current) {
          const dx = e.clientX - mouseDownPos.current.x;
          const dy = e.clientY - mouseDownPos.current.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const elapsed = Date.now() - mouseDownTime.current;

          if (dist < 5 && elapsed < 300) {
            // This is a click — select ally
            handleMapClick(e.clientX, e.clientY);
          }
        }

        lastMousePos.current = null;
        mouseDownPos.current = null;
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (isHudEvent(e.target)) return;

      if (mapDragging.current && lastMousePos.current) {
        const dx = e.clientX - lastMousePos.current.x;
        const dy = e.clientY - lastMousePos.current.y;
        const panScale = mapView.metresPerPixel;
        mapPanOffset.current.x -= dx * panScale;
        mapPanOffset.current.y -= dy * panScale;
        lastMousePos.current = { x: e.clientX, y: e.clientY };
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      if (isHudEvent(e.target)) return;

      e.preventDefault();
      handleRightClick(e.clientX, e.clientY);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('contextmenu', handleContextMenu);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, []);

  const handleMapClick = (clientX: number, clientY: number) => {
    const worldPoint = getGroundPoint(clientX, clientY);
    if (!worldPoint) return;

    const allies = useGameStore.getState().allies;
    const selectionRadius = mapZoom.current * 0.05;

    let closestId: string | null = null;
    let closestDist = Infinity;
    for (const ally of allies) {
      if (ally.destroyed) continue;
      const d = Math.sqrt(
        (ally.position.x - worldPoint.x) ** 2 +
        (ally.position.z - worldPoint.z) ** 2
      );
      if (d < selectionRadius && d < closestDist) {
        closestId = ally.id;
        closestDist = d;
      }
    }

    useGameStore.getState().selectAlly(closestId);
  };

  const handleRightClick = (clientX: number, clientY: number) => {
    const selectedId = useGameStore.getState().selectedAllyId;
    if (!selectedId) return;

    const worldPoint = getGroundPoint(clientX, clientY);
    if (!worldPoint) return;

    const y = getTerrainHeight(worldPoint.x, worldPoint.z);
    useGameStore.getState().issueAllyMoveOrder(selectedId, { x: worldPoint.x, y, z: worldPoint.z });
  };

  useFrame(({ size }, delta) => {
    const player = useGameStore.getState().playerTank;
    const mapHeight = mapZoom.current * MAP_HEIGHT_FACTOR;
    mapView.metresPerPixel = (2 * mapHeight * Math.tan(THREE.MathUtils.degToRad(MAP_FOV / 2))) / Math.max(1, size.height);
    const panSpeed = mapZoom.current * GAME_CONFIG.map.panSpeed;

    // WASD panning
    if (keys.current['KeyW']) mapPanOffset.current.y += panSpeed * delta;
    if (keys.current['KeyS']) mapPanOffset.current.y -= panSpeed * delta;
    if (keys.current['KeyA']) mapPanOffset.current.x -= panSpeed * delta;
    if (keys.current['KeyD']) mapPanOffset.current.x += panSpeed * delta;

    const lookTarget = player.position.clone().add(
      new THREE.Vector3(mapPanOffset.current.x, 0, mapPanOffset.current.y)
    );
    const camPos = lookTarget.clone().add(new THREE.Vector3(0, mapHeight, 0));

    // Depth precision at up to 2.4 km. The battlefield camera sets its own planes each frame.
    (camera as THREE.PerspectiveCamera).near = Math.max(0.5, mapHeight * 0.2);
    (camera as THREE.PerspectiveCamera).far = mapHeight * 3;
    camera.position.copy(camPos);
    camera.lookAt(lookTarget);
    camera.up.set(0, 0, -1);
    (camera as THREE.PerspectiveCamera).fov = MAP_FOV;
    camera.updateProjectionMatrix();
  });

  return null;
}
