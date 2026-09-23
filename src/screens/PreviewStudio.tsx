import { useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/**
 * Neutral photographic stage for vehicle previews: a soft room environment
 * for reflections, a warm key, cool fill and a rim light, a concrete floor
 * that fades into the backdrop, and a contact shadow under the tracks.
 * Paint reads as it will on the battlefield instead of through a brown cast.
 */

const BACKDROP = '#2c302c';

function createFloorTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  // Worn concrete in the middle, fading to the backdrop at the edge.
  const gradient = ctx.createRadialGradient(size / 2, size / 2, size * 0.05, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, '#66665f');
  gradient.addColorStop(0.45, '#54554f');
  gradient.addColorStop(1, BACKDROP);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  // Faint slab joints and staining.
  let seed = 7;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  ctx.globalAlpha = 0.06;
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = random() < 0.5 ? '#3a3a35' : '#8a8a80';
    ctx.beginPath();
    ctx.arc(random() * size, random() * size, 4 + random() * 26, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = '#34342f';
  ctx.lineWidth = 1.5;
  for (let p = size / 8; p < size; p += size / 8) {
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, size); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(size, p); ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Alpha falls off from the middle: black at the centre, clear at the rim. */
function createPadTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,0.8)');
  gradient.addColorStop(0.55, 'rgba(255,255,255,0.35)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

export function PreviewStudio({ shadows = true }: { shadows?: boolean }) {
  const { gl, scene } = useThree();
  const floor = useMemo(createFloorTexture, []);
  const pad = useMemo(createPadTexture, []);

  useEffect(() => {
    const generator = new THREE.PMREMGenerator(gl);
    const environment = generator.fromScene(new RoomEnvironment(), 0.04).texture;
    const previous = scene.environment;
    const previousIntensity = scene.environmentIntensity;
    scene.environment = environment;
    scene.environmentIntensity = 0.35;
    generator.dispose();
    return () => {
      scene.environment = previous;
      scene.environmentIntensity = previousIntensity;
      environment.dispose();
    };
  }, [gl, scene]);
  useEffect(() => () => { floor.dispose(); pad.dispose(); }, [floor, pad]);

  return (
    <>
      <color attach="background" args={[BACKDROP]} />
      <fog attach="fog" args={[BACKDROP, 16, 34]} />
      <hemisphereLight args={['#dfe2dc', '#3a3a33', 0.55]} />
      {/* Key: high and to the front-right, slightly warm. */}
      <directionalLight castShadow={shadows} position={[8, 12, 7]} color="#fff1dc" intensity={2.6}
        shadow-mapSize-width={2048} shadow-mapSize-height={2048} shadow-bias={-0.0004}
        shadow-camera-left={-7} shadow-camera-right={7} shadow-camera-top={7} shadow-camera-bottom={-7} />
      {/* Fill: low from the left, cool. */}
      <directionalLight position={[-8, 3.5, 4]} color="#c9d4de" intensity={0.8} />
      {/* Rim: from behind, to separate the silhouette from the backdrop. */}
      <directionalLight position={[-3, 6, -10]} color="#e8ecef" intensity={1.3} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <circleGeometry args={[16, 64]} />
        {/* No environment reflection: at grazing angles it lit the far floor brighter than the near. */}
        <meshStandardMaterial map={floor} roughness={1} metalness={0} envMapIntensity={0} />
      </mesh>
      {/* Soft occlusion pad under the hull. drei's ContactShadows darkened the
          whole floor around the tank, so this is a plain blurred decal. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} scale={[4.2, 6.2, 1]} renderOrder={1}>
        <circleGeometry args={[1, 48]} />
        <meshBasicMaterial map={pad} transparent depthWrite={false} opacity={0.75} color="#000000" />
      </mesh>
    </>
  );
}
