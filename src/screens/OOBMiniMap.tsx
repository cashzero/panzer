import { useRef, useMemo, useCallback, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree, ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { Terrain } from '../Terrain';
import { useGameStore, MAP_SIZE_VALUES } from '../store';

/* ------------------------------------------------------------------ */
/*  OOB Map Marker — colored triangle for a unit on the planning map  */
/* ------------------------------------------------------------------ */

function OOBMarker({ position, rotation, color, isSelected, isPlayer }: {
  position: [number, number];
  rotation: number;
  color: string;
  isSelected: boolean;
  isPlayer?: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const triangleGeo = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 2);
    shape.lineTo(-1.2, -1.5);
    shape.lineTo(1.2, -1.5);
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }, []);

  useFrame(({ camera }) => {
    if (!groupRef.current) return;
    groupRef.current.position.set(position[0], 10, position[1]);
    groupRef.current.rotation.set(-Math.PI / 2, 0, Math.PI + rotation);
    const dist = camera.position.distanceTo(groupRef.current.position);
    const baseScale = dist / 150;
    groupRef.current.scale.setScalar(Math.max(0.3, baseScale));
  });

  return (
    <group ref={groupRef}>
      <mesh geometry={triangleGeo}>
        <meshBasicMaterial color={color} side={THREE.DoubleSide} depthTest={false} />
      </mesh>
      {isPlayer && (
        <mesh>
          <ringGeometry args={[2.5, 3, 32]} />
          <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} depthTest={false} />
        </mesh>
      )}
      {isSelected && (
        <mesh>
          <ringGeometry args={[3, 3.5, 32]} />
          <meshBasicMaterial color="#ffff00" side={THREE.DoubleSide} depthTest={false} />
        </mesh>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  Camera controller for the OOB mini map                            */
/* ------------------------------------------------------------------ */

function OOBMapCamera() {
  const { camera } = useThree();
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
    const h = halfSize * zoom.current;
    const cam = camera as THREE.OrthographicCamera;
    cam.left = -h;
    cam.right = h;
    cam.top = h;
    cam.bottom = -h;
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

  const handleClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    const point = e.point;
    const x = point.x;
    const z = point.z;
    const state = useGameStore.getState();

    if (state.oobPlacementMode) {
      // Place new unit
      const side = state.oobPlacementMode;
      const defaultType = side === 'enemy' ? 'tiger' : 'sherman';
      state.addOobUnit(side, defaultType, [x, z]);
      state.setOobPlacementMode(null);
      return;
    }

    if (state.oobSelectedUnitId) {
      // Check if it's the player being repositioned
      if (state.oobSelectedUnitId === 'player') {
        state.setOobPlayerPosition([x, z]);
        state.setOobSelectedUnit(null);
        return;
      }
      // Reposition selected unit
      state.updateOobUnit(state.oobSelectedUnitId, { position: [x, z] });
      state.setOobSelectedUnit(null);
      return;
    }

    // Check if clicking near player
    const pp = state.oobPlayerPosition;
    if (Math.hypot(x - pp[0], z - pp[1]) < 30) {
      state.setOobSelectedUnit('player');
      return;
    }

    // Check if clicking near an existing unit
    const allUnits = [...state.oobEnemies, ...state.oobAllies];
    let closestId: string | null = null;
    let closestDist = 30; // click tolerance
    for (const u of allUnits) {
      const d = Math.hypot(x - u.position[0], z - u.position[1]);
      if (d < closestDist) { closestDist = d; closestId = u.id; }
    }
    if (closestId) {
      state.setOobSelectedUnit(closestId);
    }
  }, []);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 5, 0]} onClick={handleClick}>
      <planeGeometry args={[half * 2, half * 2]} />
      <meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} />
    </mesh>
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

  const cursorStyle = placementMode ? 'crosshair' : selectedId ? 'pointer' : 'default';

  return (
    <div className="w-full h-full relative" style={{ cursor: cursorStyle }}>
      <Canvas orthographic camera={{ position: [0, 500, 0], zoom: 1 }} gl={{ antialias: true }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[100, 200, 50]} intensity={1.0} />
        <OOBMapCamera />
        <Terrain />
        <ClickPlane />

        {/* Player marker */}
        <OOBMarker
          position={playerPos}
          rotation={0}
          color="#00ff00"
          isSelected={selectedId === 'player'}
          isPlayer
        />

        {/* Ally markers */}
        {oobAllies.map((u) => (
          <OOBMarker
            key={u.id}
            position={u.position}
            rotation={u.rotation}
            color="#3399ff"
            isSelected={u.id === selectedId}
          />
        ))}

        {/* Enemy markers */}
        {oobEnemies.map((u) => (
          <OOBMarker
            key={u.id}
            position={u.position}
            rotation={u.rotation}
            color="#ff3333"
            isSelected={u.id === selectedId}
          />
        ))}
      </Canvas>

      {/* Map legend */}
      <div className="absolute bottom-2 left-2 flex gap-3 text-[10px] text-gray-500">
        <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: '#00ff00' }} />Player</span>
        <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: '#3399ff' }} />Allies</span>
        <span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ backgroundColor: '#ff3333' }} />Enemies</span>
      </div>

      {placementMode && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 text-xs text-yellow-400 bg-black/70 px-3 py-1 border border-yellow-600">
          Click to place {placementMode}
        </div>
      )}
      {selectedId && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 text-xs text-yellow-400 bg-black/70 px-3 py-1 border border-yellow-600">
          Click to reposition {selectedId === 'player' ? 'player' : 'unit'}
        </div>
      )}
    </div>
  );
}
