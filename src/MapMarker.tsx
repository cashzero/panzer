import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from './store';

interface MapMarkerProps {
  id: string;
  isPlayer?: boolean;
}

export function MapMarker({ id, isPlayer }: MapMarkerProps) {
  const groupRef = useRef<THREE.Group>(null);

  const triangleGeo = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(0, 2);
    shape.lineTo(-1.2, -1.5);
    shape.lineTo(1.2, -1.5);
    shape.closePath();
    return new THREE.ShapeGeometry(shape);
  }, []);

  const destroyed = useGameStore(state =>
    isPlayer ? state.playerTank.destroyed : state.enemies.find(e => e.id === id)?.destroyed
  ) || false;

  const color = destroyed ? '#555555' : isPlayer ? '#00ff00' : '#ff3333';

  useFrame(() => {
    const data = isPlayer
      ? useGameStore.getState().playerTank
      : useGameStore.getState().enemies.find(e => e.id === id);
    if (!data || !groupRef.current) return;

    groupRef.current.position.set(data.position.x, data.position.y + 2, data.position.z);
    groupRef.current.rotation.set(-Math.PI / 2, 0, Math.PI + data.rotation);
  });

  return (
    <group ref={groupRef}>
      <mesh geometry={triangleGeo}>
        <meshBasicMaterial color={color} side={THREE.DoubleSide} depthTest={false} />
      </mesh>
      {isPlayer && !destroyed && (
        <mesh>
          <ringGeometry args={[2.5, 3, 32]} />
          <meshBasicMaterial color="#ffffff" side={THREE.DoubleSide} depthTest={false} />
        </mesh>
      )}
      {destroyed && (
        <>
          <mesh rotation={[0, 0, Math.PI / 4]}>
            <planeGeometry args={[0.5, 4]} />
            <meshBasicMaterial color="#ff0000" side={THREE.DoubleSide} depthTest={false} />
          </mesh>
          <mesh rotation={[0, 0, -Math.PI / 4]}>
            <planeGeometry args={[0.5, 4]} />
            <meshBasicMaterial color="#ff0000" side={THREE.DoubleSide} depthTest={false} />
          </mesh>
        </>
      )}
    </group>
  );
}
