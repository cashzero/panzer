import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { useGameStore } from '../store';
import { planFieldBoundaries } from '../fieldBoundaries';
import { isOnRoadForNetwork } from '../roads';
import { isPointNearAnyBuilding } from '../buildings';
import { getTerrainMeshHeight } from '../Terrain';
import { foliageWeathering } from './surfaceWeathering';
import { foliageDepthMaterial, patchFoliageMaterial } from './foliageCards';
import { TREE_SEED_OFFSET } from '../trees';

// Visual-only dressing. Hedges and poles neither collide nor block sight:
// hedges stay below a tank commander's eye line, so combat reads the same.

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PROFILE = 7; // vertices around the hedge cross-section
// Station spacing along a hedge (m). Hundreds of field hedges now line the
// parcels, so the loft is kept coarse; the leaf mottling carries the detail.
const HEDGE_STEP = 1.6;

/** Camera-facing leaf cards over a hedge, laid out like foliageCards (centre + corner offset). */
interface CardArrays {
  positions: number[];
  offsets: number[];
  normals: number[];
  colors: number[];
  uvs: number[];
  indices: number[];
}

/** Leaf card edge length range (m). */
const CARD_SIZE: [number, number] = [1.15, 1.7];

/**
 * How a hedge has been kept. Field hedges are not one clipped tube: some are
 * laid or flailed low and square, most have grown out a season or two, and
 * a few have run up into a rough wall of thorn and hazel.
 */
interface HedgeCharacter {
  height: number; // m
  width: number; // m
  /** Scale of the lumps and dips along the top. */
  ragged: number;
  /** Profile exponent: lower is squarer across the top. */
  crown: number;
  /** Leaf card size relative to CARD_SIZE; clipped hedges read finer. */
  leaf: number;
  /** Leaf cards per station: enough to close over the core at this size. */
  cards: number;
  hue: number;
  lightness: number;
}

function hedgeCharacter(roll: number, tone: number): HedgeCharacter {
  const hue = 0.215 + tone * 0.055;
  const lightness = 0.5 + (1 - tone) * 0.08;
  if (roll < 0.38) return { height: 1.35, width: 1.3, ragged: 0.35, crown: 0.42, leaf: 0.85, cards: 4, hue, lightness: lightness + 0.02 };
  if (roll < 0.85) return { height: 1.85, width: 1.6, ragged: 1, crown: 0.7, leaf: 1.1, cards: 5, hue, lightness };
  return { height: 2.6, width: 2.05, ragged: 1.7, crown: 0.8, leaf: 1.3, cards: 7, hue, lightness: lightness - 0.03 };
}

function hedgeHash(a: number, b: number) {
  const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * One continuous hedge along a run of stations: a dark lofted core, an arch
 * whose height and width wander on a long and a short wave, dressed with leaf
 * cards down to the ground so the outline breaks up into foliage and the core
 * only shows as the shade between leaves.
 */
function appendHedgeRun(
  stations: Array<{ x: number; z: number; y: number }>,
  dirX: number, dirZ: number, phase: number, character: HedgeCharacter,
  positions: number[], colors: number[], indices: number[],
  cards: CardArrays,
) {
  const nx = -dirZ, nz = dirX;
  const base = positions.length / 3;
  const color = new THREE.Color();
  stations.forEach((station, i) => {
    const s = i * HEDGE_STEP + phase;
    // Lumps along the top, and a long swell where the hedge has been cut back or left.
    const bumps = (Math.sin(s * 0.9) * 0.1 + Math.sin(s * 1.7 + 1.7) * 0.07) * character.ragged;
    const swell = Math.sin(s * 0.13 + phase) * 0.14 * character.ragged + Math.sin(s * 0.047 + 2 * phase) * 0.1;
    const endTaper = Math.min(1, i / 2, (stations.length - 1 - i) / 2);
    const height = character.height * (1 + bumps + swell) * (0.35 + 0.65 * endTaper);
    const width = character.width * (1 + Math.sin(s * 0.7 + 2.9) * 0.12 + Math.sin(s * 1.3) * 0.05 + swell * 0.5) * (0.5 + 0.5 * endTaper);
    // The core sits inside the leaf shell and reads as the shade between leaves.
    color.setHSL(character.hue + Math.sin(s * 0.31 + phase) * 0.02, 0.28, 0.13 + Math.sin(s * 0.53 + 2 * phase) * 0.015, THREE.SRGBColorSpace);
    for (let k = 0; k < PROFILE; k++) {
      const theta = (k / (PROFILE - 1)) * Math.PI;
      const lateral = Math.cos(theta) * width * 0.38 * (1 + 0.06 * Math.sin(s * 4.7 + k));
      const up = Math.pow(Math.sin(theta), character.crown) * height * 0.8;
      positions.push(station.x + nx * lateral, station.y - 0.25 + up, station.z + nz * lateral);
      colors.push(color.r, color.g, color.b);
    }
    // Leaf cards over the arch, right down to the ground on both faces; each
    // card gets the arch's outward normal, its own shade of green (thorn,
    // hazel and field maple mixed), and darkens toward the base, where the
    // hedge shades itself.
    const tint = new THREE.Color();
    for (let c = 0; c < character.cards; c++) {
      const h1 = hedgeHash(station.x + c * 3.1, station.z - c * 1.7);
      const h2 = hedgeHash(station.z + c * 2.3, station.x + c * 5.9);
      const h3 = hedgeHash(station.x - c * 7.7, station.z + c * 4.1);
      // Alternate faces so both sides are covered evenly, from the foot to the
      // crown, leaning slightly toward the steep flanks.
      const fromFoot = Math.pow(h1, 1.2) * 0.47 * Math.PI;
      const theta = c % 2 === 0 ? 0.03 * Math.PI + fromFoot : 0.97 * Math.PI - fromFoot;
      const shell = 0.9 + h2 * 0.18;
      const lateral = Math.cos(theta) * width * 0.5 * shell;
      const up = Math.pow(Math.sin(theta), character.crown) * height * shell;
      tint.setHSL(character.hue + Math.sin(s * 0.23 + phase) * 0.02 + (h3 - 0.5) * 0.03, 0.3 + (h2 - 0.5) * 0.08,
        character.lightness + (h1 - 0.5) * 0.06, THREE.SRGBColorSpace);
      const along = (h3 - 0.5) * HEDGE_STEP;
      const cx = station.x + nx * lateral + dirX * along, cz = station.z + nz * lateral + dirZ * along;
      const cy = station.y - 0.25 + up;
      const normal = new THREE.Vector3(nx * Math.cos(theta), Math.sin(theta) * 0.9 + 0.2, nz * Math.cos(theta)).normalize();
      const occlusion = 0.6 + 0.4 * Math.min(1, up / Math.max(0.1, height));
      const size = (CARD_SIZE[0] + h2 * (CARD_SIZE[1] - CARD_SIZE[0])) * character.leaf;
      const roll = h1 * Math.PI * 2;
      const base = cards.positions.length / 3;
      for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const ox = (u - 0.5) * size, oy = (v - 0.5) * size;
        cards.positions.push(cx, cy, cz);
        cards.offsets.push(ox * Math.cos(roll) - oy * Math.sin(roll), ox * Math.sin(roll) + oy * Math.cos(roll));
        cards.normals.push(normal.x, normal.y, normal.z);
        cards.colors.push(tint.r * occlusion, tint.g * occlusion, tint.b * occlusion);
        cards.uvs.push(u, v);
      }
      cards.indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  });
  for (let i = 0; i < stations.length - 1; i++) {
    for (let k = 0; k < PROFILE - 1; k++) {
      const a = base + i * PROFILE + k, b = a + 1, c = a + PROFILE, d = c + 1;
      // Counter-clockwise seen from outside: normals point up and outward.
      indices.push(a, c, b, b, c, d);
    }
  }
}

/** Telegraph pole with two crossarms, base at y = 0. */
function createPoleGeometry() {
  const pole = new THREE.CylinderGeometry(0.1, 0.14, 8, 6);
  pole.translate(0, 4, 0);
  const upper = new THREE.BoxGeometry(1.7, 0.12, 0.12);
  upper.translate(0, 7.55, 0);
  const lower = new THREE.BoxGeometry(1.2, 0.1, 0.1);
  lower.translate(0, 7.0, 0);
  const merged = mergeGeometries([pole.toNonIndexed(), upper.toNonIndexed(), lower.toNonIndexed()]);
  [pole, upper, lower].forEach((g) => g.dispose());
  return merged!;
}

const poleGeometry = createPoleGeometry();
// The core is the deep shade inside the hedge: kept well below the leaf
// cards so, where it shows between them, it reads as depth, not a surface.
const hedgeMaterial = new THREE.MeshStandardMaterial({ color: '#8a8a8a', vertexColors: true, roughness: 1, metalness: 0 });
hedgeMaterial.onBeforeCompile = foliageWeathering;
hedgeMaterial.customProgramCacheKey = () => 'hedge-foliage-v2';

const hedgeLeafTexture = new THREE.TextureLoader().load('/assets/trees/deciduous-foliage.png');
hedgeLeafTexture.colorSpace = THREE.SRGBColorSpace;
hedgeLeafTexture.anisotropy = 4;
// Hawthorn, hazel and blackthorn: the tree leaf cards, tinted per card.
const hedgeLeafMaterial = new THREE.MeshStandardMaterial({
  color: '#ffffff', vertexColors: true, map: hedgeLeafTexture,
  roughness: 1, metalness: 0, alphaTest: 0.4, side: THREE.DoubleSide,
});
patchFoliageMaterial(hedgeLeafMaterial, false);
const hedgeLeafDepthMaterial = foliageDepthMaterial(false);
const poleMaterial = new THREE.MeshStandardMaterial({ color: '#4a3f33', roughness: 0.95 });
/**
 * Telegraph wire. GL lines are always one pixel wide, so at range a 4 mm wire
 * drew as a hard dark stroke across the horizon of nearly every view. Each
 * vertex works out how many pixels a (slightly exaggerated) wire would really
 * cover at its depth and uses that as coverage: crisp alongside the road,
 * fading to nothing a couple of hundred metres out.
 */
const WIRE_WIDTH = 0.018; // m
const wireViewport = { value: 900 };
const wireMaterial = new THREE.LineBasicMaterial({ color: '#2a2825', transparent: true, depthWrite: false });
wireMaterial.onBeforeCompile = (shader) => {
  shader.uniforms.wireViewport = wireViewport;
  shader.vertexShader = shader.vertexShader
    .replace('void main() {', 'uniform float wireViewport;\nvarying float vWireCoverage;\nvoid main() {')
    .replace('#include <project_vertex>', `#include <project_vertex>
      float wirePixels = ${WIRE_WIDTH} * projectionMatrix[1][1] * 0.5 * wireViewport / max(-mvPosition.z, 0.1);
      vWireCoverage = clamp(wirePixels, 0.0, 1.0);`);
  shader.fragmentShader = shader.fragmentShader
    .replace('void main() {', 'varying float vWireCoverage;\nvoid main() {')
    .replace('#include <opaque_fragment>', '#include <opaque_fragment>\ngl_FragColor.a *= vWireCoverage * 0.9;');
};

const WIRE_ARMS = [-0.75, 0.75, 0.45];
const WIRE_HEIGHTS = [7.6, 7.6, 7.05];

export function WorldDressing() {
  const roadNetwork = useGameStore((s) => s.roadNetwork);
  const buildings = useGameStore((s) => s.buildings);
  const farmlands = useGameStore((s) => s.farmlands);
  const worldSeed = useGameStore((s) => s.worldSeed);

  const dressing = useMemo(() => {
    const rng = mulberry32(worldSeed ^ 0x2545f491);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);

    // Hedges: continuous runs along the planned boundaries, broken wherever a
    // road or farmyard crosses.
    const hedgePositions: number[] = [];
    const hedgeColors: number[] = [];
    const hedgeIndices: number[] = [];
    const cards: CardArrays = { positions: [], offsets: [], normals: [], colors: [], uvs: [], indices: [] };
    for (const boundary of planFieldBoundaries(farmlands, worldSeed + TREE_SEED_OFFSET)) {
      if (boundary.kind !== 'hedge') continue;
      const [ax, az] = boundary.from;
      const [bx, bz] = boundary.to;
      const length = Math.hypot(bx - ax, bz - az);
      if (length < 4) continue;
      const dirX = (bx - ax) / length, dirZ = (bz - az) / length;
      const phase = rng() * 100;
      const character = hedgeCharacter(rng(), rng());
      let run: Array<{ x: number; z: number; y: number }> = [];
      const flush = () => {
        if (run.length >= 3) appendHedgeRun(run, dirX, dirZ, phase + hedgePositions.length * 0.001, character, hedgePositions, hedgeColors, hedgeIndices, cards);
        run = [];
      };
      for (let d = 0; d <= length; d += HEDGE_STEP) {
        const x = ax + dirX * d, z = az + dirZ * d;
        if (isOnRoadForNetwork(x, z, roadNetwork, 3) || isPointNearAnyBuilding(x, z, buildings, 4)) { flush(); continue; }
        run.push({ x, z, y: getTerrainMeshHeight(x, z) });
      }
      flush();
    }
    const hedgeGeometry = new THREE.BufferGeometry();
    hedgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(hedgePositions, 3));
    hedgeGeometry.setAttribute('color', new THREE.Float32BufferAttribute(hedgeColors, 3));
    hedgeGeometry.setIndex(hedgeIndices);
    hedgeGeometry.computeVertexNormals();
    hedgeGeometry.computeBoundingSphere();
    const leafGeometry = new THREE.BufferGeometry();
    leafGeometry.setAttribute('position', new THREE.Float32BufferAttribute(cards.positions, 3));
    leafGeometry.setAttribute('cardOffset', new THREE.Float32BufferAttribute(cards.offsets, 2));
    leafGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(cards.normals, 3));
    leafGeometry.setAttribute('color', new THREE.Float32BufferAttribute(cards.colors, 3));
    leafGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(cards.uvs, 2));
    leafGeometry.setIndex(cards.indices);
    leafGeometry.computeBoundingSphere();
    if (leafGeometry.boundingSphere) leafGeometry.boundingSphere.radius += CARD_SIZE[1];

    // Telegraph line along the longest roads, one side, with sagging wires.
    const poleMatrices: THREE.Matrix4[] = [];
    const wirePoints: number[] = [];
    const roads = [...roadNetwork.segments].sort((a, b) => b.points.length - a.points.length).slice(0, 2);
    for (const road of roads) {
      const side = rng() < 0.5 ? 1 : -1;
      const tops: Array<{ x: number; y: number; z: number; ax: number; az: number }> = [];
      let carry = 0;
      for (let i = 1; i < road.points.length; i++) {
        const [ax, az] = road.points[i - 1];
        const [bx, bz] = road.points[i];
        const length = Math.hypot(bx - ax, bz - az);
        if (length < 1) continue;
        const dirX = (bx - ax) / length, dirZ = (bz - az) / length;
        const nx = -dirZ * side, nz = dirX * side;
        const offset = road.halfWidth + 3;
        for (let d = carry; d < length; d += 45) {
          const x = ax + dirX * d + nx * offset, z = az + dirZ * d + nz * offset;
          carry = d + 45 - length;
          if (isPointNearAnyBuilding(x, z, buildings, 3) || Math.abs(x) > roadNetwork.terrainSize / 2 - 5 || Math.abs(z) > roadNetwork.terrainSize / 2 - 5) continue;
          const y = getTerrainMeshHeight(x, z);
          // Crossarms run across the road; the wires run along it.
          quaternion.setFromAxisAngle(up, Math.atan2(-dirZ, dirX) + Math.PI / 2);
          matrix.compose(new THREE.Vector3(x, y - 0.3, z), quaternion, new THREE.Vector3(1, 0.95 + rng() * 0.1, 1));
          poleMatrices.push(matrix.clone());
          tops.push({ x, y: y - 0.3, z, ax: dirX, az: dirZ });
        }
      }
      for (let i = 1; i < tops.length; i++) {
        const a = tops[i - 1], b = tops[i];
        if (Math.hypot(b.x - a.x, b.z - a.z) > 70) continue;
        for (let w = 0; w < WIRE_ARMS.length; w++) {
          const arm = WIRE_ARMS[w];
          const start = [a.x - a.az * arm * -1, a.y + WIRE_HEIGHTS[w], a.z + a.ax * arm * -1];
          const end = [b.x - b.az * arm * -1, b.y + WIRE_HEIGHTS[w], b.z + b.ax * arm * -1];
          const steps = 8;
          for (let k = 0; k < steps; k++) {
            for (const u of [k / steps, (k + 1) / steps]) {
              const sag = Math.sin(u * Math.PI) * 0.7;
              wirePoints.push(start[0] + (end[0] - start[0]) * u, start[1] + (end[1] - start[1]) * u - sag, start[2] + (end[2] - start[2]) * u);
            }
          }
        }
      }
    }
    const wires = new THREE.BufferGeometry();
    wires.setAttribute('position', new THREE.Float32BufferAttribute(wirePoints, 3));
    return { hedgeGeometry, leafGeometry, poleMatrices, wires };
  }, [roadNetwork, buildings, farmlands, worldSeed]);

  const poles = useMemo(() => {
    const mesh = new THREE.InstancedMesh(poleGeometry, poleMaterial, Math.max(1, dressing.poleMatrices.length));
    mesh.count = dressing.poleMatrices.length;
    dressing.poleMatrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    return mesh;
  }, [dressing]);

  useEffect(() => () => { poles.dispose(); }, [poles]);
  useFrame(({ gl, size }) => { wireViewport.value = size.height * gl.getPixelRatio(); });
  useEffect(() => () => {
    dressing.wires.dispose();
    dressing.hedgeGeometry.dispose();
    dressing.leafGeometry.dispose();
  }, [dressing]);

  return (
    <group>
      <mesh geometry={dressing.hedgeGeometry} material={hedgeMaterial} castShadow receiveShadow />
      <mesh geometry={dressing.leafGeometry} material={hedgeLeafMaterial} customDepthMaterial={hedgeLeafDepthMaterial} castShadow receiveShadow />
      <primitive object={poles} />
      <lineSegments geometry={dressing.wires} material={wireMaterial} />
    </group>
  );
}
