import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useGameStore } from '../store';
import { getTerrainMeshHeight } from '../Terrain';

// Countryside beyond the playable map: the ground carries on into low hills
// and distant woods instead of ending at a hard edge against the fog.
// Visual only; nothing out here collides, blocks sight or casts shadows.

const OUTWARD = [0, 8, 20, 40, 70, 110, 160, 230, 320, 450, 650, 900, 1300, 1900, 2800, 4000, 6000];
const ALONG_STEP = 10;

function hash(x: number, z: number) {
  const v = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return v - Math.floor(v);
}

function valueNoise(x: number, z: number) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return (a + (b - a) * sx) * (1 - sz) + (c + (d - c) * sx) * sz;
}

const fbm = (x: number, z: number) => valueNoise(x, z) * 0.6 + valueNoise(x * 2.1 + 5.3, z * 2.1 - 1.7) * 0.3 + valueNoise(x * 4.3, z * 4.3) * 0.1;

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Skirt height: meets the terrain edge, then rises into rolling hills. */
function skirtHeight(x: number, z: number, half: number) {
  const outX = Math.max(0, Math.abs(x) - half), outZ = Math.max(0, Math.abs(z) - half);
  const distance = Math.hypot(outX, outZ);
  const edge = getTerrainMeshHeight(Math.max(-half, Math.min(half, x)), Math.max(-half, Math.min(half, z))) - 0.15;
  const hills = 6 + 60 * fbm(x * 0.0007, z * 0.0007);
  return edge + (hills - edge) * smoothstep(0, 1500, distance);
}

// Matched against the rendered pasture just inside the map edge.
const FIELD = new THREE.Color('#57561f');
const DRY = new THREE.Color('#6e6429');
const WOOD = new THREE.Color('#353c26');

/**
 * One side strip: along-edge coordinate u, outward distances OUTWARD. North and
 * south strips also cover the corners, sampled at the OUTWARD distances so
 * their seams share vertices with the east and west strips exactly.
 */
function buildStrip(half: number, side: 0 | 1 | 2 | 3) {
  const along: number[] = [];
  for (let u = -half; u <= half + 1e-6; u += ALONG_STEP) along.push(u);
  if (side === 0 || side === 2) {
    const beyond = OUTWARD.slice(1).map((d) => half + d);
    along.unshift(...beyond.map((u) => -u).reverse());
    along.push(...beyond);
  }
  const positions: number[] = [];
  const colors: number[] = [];
  const color = new THREE.Color();
  for (const d of OUTWARD) {
    for (const u of along) {
      const x = side === 0 ? u : side === 1 ? half + d : side === 2 ? -u : -(half + d);
      const z = side === 0 ? half + d : side === 1 ? -u : side === 2 ? -(half + d) : u;
      positions.push(x, skirtHeight(x, z, half), z);
      // Patchwork of fields and woods, fading to one tone in the haze.
      const patch = fbm(x * 0.004, z * 0.004);
      color.copy(FIELD).lerp(DRY, smoothstep(0.55, 0.7, patch)).lerp(WOOD, smoothstep(0.35, 0.22, patch));
      colors.push(color.r, color.g, color.b);
    }
  }
  const indices: number[] = [];
  const row = along.length;
  for (let j = 0; j < OUTWARD.length - 1; j++) {
    for (let i = 0; i < row - 1; i++) {
      const a = j * row + i, b = a + 1, c = a + row, e = c + 1;
      indices.push(a, c, b, b, c, e);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // Keep upward-facing winding whichever side the strip sits on.
  const normal = geometry.attributes.normal;
  if (normal.getY(0) < 0) {
    for (let k = 0; k < indices.length; k += 3) [indices[k + 1], indices[k + 2]] = [indices[k + 2], indices[k + 1]];
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
  }
  return geometry;
}

const groundMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
const treeMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 1, metalness: 0 });
const coniferGeometry = new THREE.ConeGeometry(2.3, 10, 6);
coniferGeometry.translate(0, 5.5, 0);
const broadleafGeometry = new THREE.IcosahedronGeometry(3.4, 0);
broadleafGeometry.scale(1, 0.85, 1);
broadleafGeometry.translate(0, 4.2, 0);

export function HorizonSkirt() {
  const roadNetwork = useGameStore((s) => s.roadNetwork);
  const buildings = useGameStore((s) => s.buildings);
  const half = roadNetwork.terrainSize / 2;

  // Edge heights come from the terrain, which roads and buildings reshape.
  const ground = useMemo(() => ([0, 1, 2, 3] as const).map((side) => buildStrip(half, side)),
    [half, roadNetwork, buildings]);

  const woods = useMemo(() => {
    const conifer = new THREE.InstancedMesh(coniferGeometry, treeMaterial, 2600);
    const broadleaf = new THREE.InstancedMesh(broadleafGeometry, treeMaterial, 2600);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const color = new THREE.Color();
    let seed = Math.floor(roadNetwork.seed) || 1;
    const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    let nc = 0, nb = 0;
    // Woods clustered where the patch noise is dark, from just past the edge
    // out to where the haze swallows them.
    for (let attempt = 0; attempt < 40000 && (nc < 2600 || nb < 2600); attempt++) {
      const side = Math.floor(random() * 4);
      const u = (random() * 2 - 1) * (half + 1200);
      const d = 12 + Math.pow(random(), 1.6) * 1300;
      const x = side === 0 ? u : side === 1 ? half + d : side === 2 ? -u : -(half + d);
      const z = side === 0 ? half + d : side === 1 ? -u : side === 2 ? -(half + d) : u;
      if (fbm(x * 0.004, z * 0.004) > 0.36) continue;
      const scale = 0.8 + random() * 0.6;
      matrix.compose(new THREE.Vector3(x, skirtHeight(x, z, half) - 0.4, z),
        quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), random() * Math.PI * 2),
        new THREE.Vector3(scale, scale * (0.85 + random() * 0.3), scale));
      color.setHSL(0.24 + random() * 0.08, 0.28, 0.16 + random() * 0.06, THREE.SRGBColorSpace);
      if (random() < 0.55 && nc < 2600) {
        conifer.setMatrixAt(nc, matrix); conifer.setColorAt(nc++, color);
      } else if (nb < 2600) {
        broadleaf.setMatrixAt(nb, matrix); broadleaf.setColorAt(nb++, color);
      }
    }
    conifer.count = nc;
    broadleaf.count = nb;
    conifer.computeBoundingSphere();
    broadleaf.computeBoundingSphere();
    return [conifer, broadleaf];
  }, [half, roadNetwork, buildings]);

  useEffect(() => () => ground.forEach((geometry) => geometry.dispose()), [ground]);
  useEffect(() => () => woods.forEach((mesh) => mesh.dispose()), [woods]);

  return (
    <group>
      {ground.map((geometry, index) => (
        <mesh key={index} geometry={geometry} material={groundMaterial} receiveShadow={false} />
      ))}
      {woods.map((mesh, index) => <primitive key={index} object={mesh} />)}
    </group>
  );
}
