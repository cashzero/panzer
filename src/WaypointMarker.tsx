import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from './store';

export function WaypointMarkers() {
  return <WaypointMarkersInner />;
}

function WaypointMarkersInner() {
  const allyIds = useGameStore(state => state.allies.map(a => a.id));
  return (
    <>
      {allyIds.map(id => (
        <WaypointMarker key={`wp-${id}`} allyId={id} />
      ))}
    </>
  );
}

function WaypointMarker({ allyId }: { allyId: string }) {
  const groupRef = useRef<THREE.Group>(null);

  const lineObj = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3));
    const mat = new THREE.LineBasicMaterial({ color: '#3399ff', depthTest: false, transparent: true, opacity: 0.4 });
    return new THREE.Line(geo, mat);
  }, []);

  useFrame(({ camera }) => {
    const wp = useGameStore.getState().allyWaypoints[allyId];
    const ally = useGameStore.getState().allies.find(a => a.id === allyId);
    const isSelected = useGameStore.getState().selectedAllyId === allyId;

    if (!wp || !ally || !groupRef.current) {
      if (groupRef.current) groupRef.current.visible = false;
      return;
    }

    groupRef.current.visible = true;
    groupRef.current.position.set(wp.x, wp.y + 2, wp.z);

    // Scale with camera distance
    const dist = camera.position.distanceTo(groupRef.current.position);
    const s = Math.max(0.3, dist / 150);
    groupRef.current.scale.setScalar(s);

    // Update line color based on selection
    const color = isSelected ? '#ffcc00' : '#3399ff';
    (lineObj.material as THREE.LineBasicMaterial).color.set(color);

    // Update line endpoints (local space of group)
    const posAttr = lineObj.geometry.getAttribute('position') as THREE.BufferAttribute;
    const invScale = 1 / s;
    posAttr.setXYZ(0,
      (ally.position.x - wp.x) * invScale,
      (ally.position.y - wp.y) * invScale,
      (ally.position.z - wp.z) * invScale
    );
    posAttr.setXYZ(1, 0, 0, 0);
    posAttr.needsUpdate = true;
  });

  const selectedAllyId = useGameStore(state => state.selectedAllyId);
  const isSelected = selectedAllyId === allyId;
  const markerColor = isSelected ? '#ffcc00' : '#3399ff';

  return (
    <group ref={groupRef}>
      {/* Diamond marker */}
      <mesh rotation={[-Math.PI / 2, 0, Math.PI / 4]}>
        <planeGeometry args={[2, 2]} />
        <meshBasicMaterial color={markerColor} side={THREE.DoubleSide} depthTest={false} transparent opacity={0.7} />
      </mesh>
      {/* Ring around diamond */}
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[2, 2.4, 6]} />
        <meshBasicMaterial color={markerColor} side={THREE.DoubleSide} depthTest={false} transparent opacity={0.5} />
      </mesh>
      {/* Line from ally to waypoint */}
      <primitive object={lineObj} />
    </group>
  );
}
