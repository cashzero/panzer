import { useRef, useMemo, useCallback, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree, ThreeEvent } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { Terrain } from '../Terrain';
import { Buildings } from '../BuildingRenderer';
import { Trees } from '../TreeRenderer';
import { isPointNearAnyBuilding } from '../buildings';
import { GAME_CONFIG } from '../config';
import { useGameStore, MAP_SIZE_VALUES } from '../store';

/* ------------------------------------------------------------------ */
/*  Unit marker: the period armour symbol, with a tick for its facing  */
/* ------------------------------------------------------------------ */

const PENCIL_BLUE = '#40628e';
const PENCIL_RED = '#b0372d';
const BRASS = '#c9a760';

function outlineShape(width: number, height: number, thickness: number) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, -height / 2); shape.lineTo(width / 2, -height / 2);
  shape.lineTo(width / 2, height / 2); shape.lineTo(-width / 2, height / 2); shape.closePath();
  const hole = new THREE.Path();
  const w = width / 2 - thickness, h = height / 2 - thickness;
  hole.moveTo(-w, -h); hole.lineTo(-w, h); hole.lineTo(w, h); hole.lineTo(w, -h); hole.closePath();
  shape.holes.push(hole);
  return new THREE.ShapeGeometry(shape);
}

function ovalShape(width: number, height: number, thickness: number, filled: boolean) {
  const shape = new THREE.Shape();
  shape.absellipse(0, 0, width / 2, height / 2, 0, Math.PI * 2, false, 0);
  if (!filled) {
    const hole = new THREE.Path();
    hole.absellipse(0, 0, width / 2 - thickness, height / 2 - thickness, 0, Math.PI * 2, true, 0);
    shape.holes.push(hole);
  }
  return new THREE.ShapeGeometry(shape, 24);
}

const markerFrame = outlineShape(5.2, 3.4, 0.38);
const markerTrack = ovalShape(3.1, 1.5, 0.3, false);
const markerTrackFilled = ovalShape(3.1, 1.5, 0.3, true);
const markerHalo = outlineShape(6.6, 4.8, 0.3);
const facingTick = (() => {
  const shape = new THREE.Shape();
  shape.moveTo(-0.6, 0); shape.lineTo(0.6, 0); shape.lineTo(0, 1.4); shape.closePath();
  return new THREE.ShapeGeometry(shape);
})();

function OOBMarker({ position, rotation, color, isSelected, isPlayer }: {
  position: [number, number];
  rotation: number;
  color: string;
  isSelected: boolean;
  isPlayer?: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const tickRef = useRef<THREE.Group>(null);

  useFrame(({ camera, size }) => {
    if (!groupRef.current) return;
    groupRef.current.position.set(position[0], 10, position[1]);
    // Symbols stay upright on the map sheet; only the tick turns with the tank.
    groupRef.current.rotation.set(-Math.PI / 2, 0, 0);
    if (tickRef.current) tickRef.current.rotation.set(0, 0, Math.PI + rotation);
    const cam = camera as THREE.OrthographicCamera;
    const worldPerPixel = (cam.top - cam.bottom) / Math.max(1, size.height);
    groupRef.current.scale.setScalar(Math.max(0.6, worldPerPixel * 7));
  });

  const material = <meshBasicMaterial color={color} side={THREE.DoubleSide} depthTest={false} />;
  return (
    <group ref={groupRef} renderOrder={10}>
      <mesh geometry={markerFrame} renderOrder={10}>{material}</mesh>
      <mesh geometry={isPlayer ? markerTrackFilled : markerTrack} renderOrder={10}>{material}</mesh>
      <group ref={tickRef}>
        <mesh geometry={facingTick} position={[0, 2.0, 0]} renderOrder={10}>{material}</mesh>
      </group>
      {isSelected && (
        <mesh geometry={markerHalo} renderOrder={10}>
          <meshBasicMaterial color={BRASS} side={THREE.DoubleSide} depthTest={false} />
        </mesh>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Map grid: lettered columns and numbered rows, eight to a side      */
/* ------------------------------------------------------------------ */

const GRID_DIVISIONS = 8;

function MapGrid({ size }: { size: number }) {
  const half = size / 2;
  const cell = size / GRID_DIVISIONS;
  const lines = useMemo(() => {
    const points: number[] = [];
    for (let i = 0; i <= GRID_DIVISIONS; i++) {
      const c = -half + i * cell;
      points.push(c, 6, -half, c, 6, half, -half, 6, c, half, 6, c);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
    return geometry;
  }, [half, cell]);
  useEffect(() => () => lines.dispose(), [lines]);
  return (
    <>
      <lineSegments geometry={lines}>
        <lineBasicMaterial color="#1d2319" transparent opacity={0.55} depthTest={false} />
      </lineSegments>
      {Array.from({ length: GRID_DIVISIONS }, (_, i) => (
        <group key={i}>
          {/* Letters along the north edge, numbers down the west edge, inside the sheet. */}
          <Html position={[-half + (i + 0.5) * cell, 6, -half + cell * 0.1]} center className="map-grid-label">
            {String.fromCharCode(65 + i)}
          </Html>
          <Html position={[-half + cell * 0.08, 6, -half + (i + 0.5) * cell]} center className="map-grid-label">
            {i + 1}
          </Html>
        </group>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Camera controller for the OOB mini map                            */
/* ------------------------------------------------------------------ */

function OOBMapCamera() {
  const { camera, size } = useThree();
  const panOffset = useRef(new THREE.Vector2(0, 0));
  const zoom = useRef(1);
  const dragging = useRef(false);
  const lastMouse = useRef<{ x: number; y: number } | null>(null);
  const mapSize = useGameStore((s) => s.mapSize);
  const halfSize = MAP_SIZE_VALUES[mapSize] / 2;

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 1.1 : 0.9;
      zoom.current = THREE.MathUtils.clamp(zoom.current * delta, 0.2, 3);
    };
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 2) { dragging.current = true; lastMouse.current = { x: e.clientX, y: e.clientY }; }
    };
    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 2) { dragging.current = false; lastMouse.current = null; }
    };
    const handleMouseMove = (e: MouseEvent) => {
      if (dragging.current && lastMouse.current) {
        const scale = zoom.current * halfSize / 250;
        panOffset.current.x -= (e.clientX - lastMouse.current.x) * scale;
        panOffset.current.y -= (e.clientY - lastMouse.current.y) * scale;
        lastMouse.current = { x: e.clientX, y: e.clientY };
      }
    };
    const handleContextMenu = (e: MouseEvent) => e.preventDefault();

    const canvas = (camera as any).parent?.parentElement ?? window;
    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('contextmenu', handleContextMenu);
    return () => {
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [halfSize]);

  useFrame(() => {
    // Fit the whole map in the shorter side and keep squares square.
    const h = halfSize * zoom.current;
    const aspect = size.width / Math.max(1, size.height);
    const cam = camera as THREE.OrthographicCamera;
    cam.left = -h * Math.max(1, aspect);
    cam.right = h * Math.max(1, aspect);
    cam.top = h / Math.min(1, aspect);
    cam.bottom = -h / Math.min(1, aspect);
    cam.near = 0.1;
    cam.far = 2000;
    cam.position.set(panOffset.current.x, 500, panOffset.current.y);
    cam.lookAt(panOffset.current.x, 0, panOffset.current.y);
    cam.up.set(0, 0, -1);
    cam.updateProjectionMatrix();
  });

  return null;
}

/* ------------------------------------------------------------------ */
/*  Click plane for placing/selecting units                           */
/* ------------------------------------------------------------------ */

function ClickPlane() {
  const mapSize = useGameStore((s) => s.mapSize);
  const half = MAP_SIZE_VALUES[mapSize];
  const buildings = useGameStore((s) => s.buildings);
  const [notice, setNotice] = useState<string | null>(null);
  const mapScale = MAP_SIZE_VALUES[mapSize] / 1000;

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    const point = e.point;
    const x = point.x;
    const z = point.z;
    const state = useGameStore.getState();
    const oobX = x / mapScale;
    const oobZ = z / mapScale;

    if (isPointNearAnyBuilding(x, z, buildings, GAME_CONFIG.tank.collisionRadius + 2)) {
      setNotice('A building stands there. Pick open ground.');
      return;
    }

    if (state.oobPlacementMode) {
      const side = state.oobPlacementMode;
      const defaultType = side === 'enemy' ? 'tiger' : 'sherman';
      state.addOobUnit(side, defaultType, [oobX, oobZ]);
      state.setOobPlacementMode(null);
      return;
    }

    if (state.oobSelectedUnitId) {
      if (state.oobSelectedUnitId === 'player') {
        state.setOobPlayerPosition([oobX, oobZ]);
        state.setOobSelectedUnit(null);
        return;
      }
      state.updateOobUnit(state.oobSelectedUnitId, { position: [oobX, oobZ] });
      state.setOobSelectedUnit(null);
      return;
    }

    const pp = state.oobPlayerPosition;
    if (Math.hypot(x - pp[0] * mapScale, z - pp[1] * mapScale) < 30) {
      state.setOobSelectedUnit('player');
      return;
    }

    const allUnits = [...state.oobEnemies, ...state.oobAllies];
    let closestId: string | null = null;
    let closestDist = 30;
    for (const u of allUnits) {
      const d = Math.hypot(x - u.position[0] * mapScale, z - u.position[1] * mapScale);
      if (d < closestDist) { closestDist = d; closestId = u.id; }
    }
    if (closestId) {
      state.setOobSelectedUnit(closestId);
    }
  }, [buildings, mapScale]);

  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 5, 0]} onClick={handleClick}>
        <planeGeometry args={[half * 2, half * 2]} />
        <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>
      {notice && (
        <group position={[0, 18, 0]}>
          <Html center>
            <div className="map-notice map-notice--warning">{notice}</div>
          </Html>
        </group>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Main mini map component                                           */
/* ------------------------------------------------------------------ */

export function OOBMiniMap() {
  const oobEnemies = useGameStore((s) => s.oobEnemies);
  const oobAllies = useGameStore((s) => s.oobAllies);
  const playerPos = useGameStore((s) => s.oobPlayerPosition);
  const selectedId = useGameStore((s) => s.oobSelectedUnitId);
  const placementMode = useGameStore((s) => s.oobPlacementMode);
  const mapSize = useGameStore((s) => s.mapSize);
  const mapScale = MAP_SIZE_VALUES[mapSize] / 1000;

  const cursorStyle = placementMode ? 'crosshair' : selectedId ? 'pointer' : 'default';

  return (
    <div className="planning-map" style={{ cursor: cursorStyle }}>
      <Canvas orthographic camera={{ position: [0, 500, 0], zoom: 1 }} gl={{ antialias: true }}>
        {/* Flat, even light: a map should read, not model the ground. */}
        <hemisphereLight args={['#fbf6e6', '#8a8a70', 1.6]} />
        <directionalLight position={[100, 300, 50]} intensity={0.9} />
        <OOBMapCamera />
        <Terrain showGroundCover={false} />
        <Trees />
        <Buildings clickThrough />
        <MapGrid size={MAP_SIZE_VALUES[mapSize]} />
        <ClickPlane />

        <OOBMarker
          position={[playerPos[0] * mapScale, playerPos[1] * mapScale]}
          rotation={0}
          color={PENCIL_BLUE}
          isSelected={selectedId === 'player'}
          isPlayer
        />
        {oobAllies.map((u) => (
          <OOBMarker
            key={u.id}
            position={[u.position[0] * mapScale, u.position[1] * mapScale]}
            rotation={u.rotation}
            color={PENCIL_BLUE}
            isSelected={u.id === selectedId}
          />
        ))}
        {oobEnemies.map((u) => (
          <OOBMarker
            key={u.id}
            position={[u.position[0] * mapScale, u.position[1] * mapScale]}
            rotation={u.rotation}
            color={PENCIL_RED}
            isSelected={u.id === selectedId}
          />
        ))}
      </Canvas>

      <p className="planning-map__scale">{MAP_SIZE_VALUES[mapSize] / GRID_DIVISIONS} m squares. Scroll to zoom, right-drag to pan.</p>

      {placementMode && (
        <p className="map-notice">Click the map to place the {placementMode === 'enemy' ? 'enemy' : 'allied'} tank.</p>
      )}
      {!placementMode && selectedId && (
        <p className="map-notice">Click the map to move {selectedId === 'player' ? 'your tank' : 'this tank'}.</p>
      )}
    </div>
  );
}
