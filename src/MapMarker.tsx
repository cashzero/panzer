import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from './store';
import { MAP_COLOURS, MAP_SYMBOL, symbolScale } from './rendering/mapSymbols';

interface MapMarkerProps {
  id: string;
  isPlayer?: boolean;
  isAlly?: boolean;
}

/**
 * A tank on the tactical map, drawn with the period armour symbol: blue for
 * our own force (the player's with a filled track), red for spotted enemies,
 * grey and crossed out once destroyed. A tick shows the hull's facing.
 */
export function MapMarker({ id, isPlayer, isAlly }: MapMarkerProps) {
  const groupRef = useRef<THREE.Group>(null);
  const tickRef = useRef<THREE.Group>(null);

  const destroyed = useGameStore(state =>
    isPlayer ? state.playerTank.destroyed
    : isAlly ? state.allies.find(a => a.id === id)?.destroyed
    : state.enemies.find(e => e.id === id)?.destroyed
  ) || false;
  const isSelected = useGameStore(state => !!isAlly && state.selectedAllyId === id);
  const colour = destroyed ? MAP_COLOURS.destroyed : isPlayer || isAlly ? MAP_COLOURS.friendly : MAP_COLOURS.enemy;

  useFrame(({ camera, size }) => {
    const state = useGameStore.getState();
    const data = isPlayer ? state.playerTank : isAlly ? state.allies.find(a => a.id === id) : state.enemies.find(e => e.id === id);
    if (!data || !groupRef.current) return;
    groupRef.current.position.set(data.position.x, data.position.y + 3, data.position.z);
    // The symbol stays upright on the sheet; only the tick turns with the hull.
    groupRef.current.rotation.set(-Math.PI / 2, 0, 0);
    if (tickRef.current) tickRef.current.rotation.set(0, 0, Math.PI + data.rotation);
    groupRef.current.scale.setScalar(symbolScale(camera, groupRef.current.position, size.height, isPlayer ? 20 : 17));
  });

  const material = <meshBasicMaterial color={colour} side={THREE.DoubleSide} depthTest={false} />;
  return (
    <group ref={groupRef} renderOrder={10}>
      <mesh geometry={MAP_SYMBOL.frame} renderOrder={10}>{material}</mesh>
      <mesh geometry={isPlayer ? MAP_SYMBOL.trackFilled : MAP_SYMBOL.track} renderOrder={10}>{material}</mesh>
      {!destroyed && (
        <group ref={tickRef}>
          <mesh geometry={MAP_SYMBOL.tick} renderOrder={10}>{material}</mesh>
        </group>
      )}
      {destroyed && MAP_SYMBOL.cross.map((geometry, index) => (
        <mesh key={index} geometry={geometry} renderOrder={11}>
          <meshBasicMaterial color={MAP_COLOURS.enemy} side={THREE.DoubleSide} depthTest={false} />
        </mesh>
      ))}
      {isSelected && !destroyed && (
        <mesh geometry={MAP_SYMBOL.halo} renderOrder={10}>
          <meshBasicMaterial color={MAP_COLOURS.selected} side={THREE.DoubleSide} depthTest={false} />
        </mesh>
      )}
    </group>
  );
}
