import { useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { useGameStore } from '../store';
import { planFieldBoundaries } from '../fieldBoundaries';
import { isOnRoadForNetwork } from '../roads';
import { isPointNearAnyBuilding } from '../buildings';
import { getTerrainMeshHeight } from '../Terrain';
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

// Station spacing along a hedge (m). Hundreds of field hedges now line the
// parcels; the leaf cards carry the detail.
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
  /** Outer leaf cards per station: enough to close the outline at this size. */
  cards: number;
  hue: number;
  lightness: number;
}

function hedgeCharacter(roll: number, tone: number): HedgeCharacter {
  const hue = 0.215 + tone * 0.055;
  const lightness = 0.5 + (1 - tone) * 0.08;
  if (roll < 0.38) return { height: 1.35, width: 1.3, ragged: 0.35, crown: 0.42, leaf: 0.5, cards: 11, hue, lightness: lightness + 0.02 };
  if (roll < 0.85) return { height: 1.85, width: 1.6, ragged: 1, crown: 0.7, leaf: 0.6, cards: 14, hue, lightness };
  return { height: 2.6, width: 2.05, ragged: 1.7, crown: 0.8, leaf: 0.72, cards: 18, hue, lightness: lightness - 0.03 };
}

// Inner cards per outer card. They fill the body so a gap between outer
// leaves shows shaded foliage further in, never a surface.
const INNER_CARD_RATIO = 0.4;

function hedgeHash(a: number, b: number) {
  const v = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

/**
 * One continuous hedge along a run of stations, built only from leaf cards:
 * an arch whose height and width wander on a long and a short wave, with an
 * outer layer of cards from the ground on one face over the crown to the
 * ground on the other, and a body of darker cards inside it. A solid core
 * used to fill the inside; wherever the outer leaves parted it showed as a
 * dark rubbery tube. Now a gap shows more leaves, deeper in the shade.
 */
function appendHedgeRun(
  stations: Array<{ x: number; z: number; y: number }>,
  dirX: number, dirZ: number, phase: number, character: HedgeCharacter,
  cards: CardArrays,
) {
  const nx = -dirZ, nz = dirX;
  const tint = new THREE.Color();
  const normal = new THREE.Vector3();
  const inner = Math.round(character.cards * INNER_CARD_RATIO);
  stations.forEach((station, i) => {
    const s = i * HEDGE_STEP + phase;
    // Lumps along the top, and a long swell where the hedge has been cut back or left.
    const bumps = (Math.sin(s * 0.9) * 0.1 + Math.sin(s * 1.7 + 1.7) * 0.07) * character.ragged;
    const swell = Math.sin(s * 0.13 + phase) * 0.14 * character.ragged + Math.sin(s * 0.047 + 2 * phase) * 0.1;
    const endTaper = Math.min(1, i / 2, (stations.length - 1 - i) / 2);
    const height = character.height * (1 + bumps + swell) * (0.35 + 0.65 * endTaper);
    const width = character.width * (1 + Math.sin(s * 0.7 + 2.9) * 0.12 + Math.sin(s * 1.3) * 0.05 + swell * 0.5) * (0.5 + 0.5 * endTaper);
    for (let c = 0; c < character.cards + inner; c++) {
      const h1 = hedgeHash(station.x + c * 3.1, station.z - c * 1.7);
      const h2 = hedgeHash(station.z + c * 2.3, station.x + c * 5.9);
      const h3 = hedgeHash(station.x - c * 7.7, station.z + c * 4.1);
      const outer = c < character.cards;
      // Stratified from the foot on one face over the crown to the foot on
      // the other, one slot per card with a little jitter, and odd stations
      // shifted half a slot so the rows interleave. Hashed angles bunched
      // cards into round clumps with daylight between them.
      const count = outer ? character.cards : inner;
      const slot = (outer ? c : c - character.cards) + 0.5 + (i % 2) * 0.5 + (h1 - 0.5) * 0.7;
      const theta = (0.03 + 0.94 * ((slot / count) % 1)) * Math.PI;
      // Outer cards sit on the arch; inner ones fill the body behind them.
      const shell = outer ? 0.9 + h2 * 0.18 : 0.3 + h2 * 0.45;
      const lateral = Math.cos(theta) * width * 0.5 * shell;
      const up = Math.pow(Math.sin(theta), character.crown) * height * shell;
      // Thorn, hazel and field maple mixed, but only a slight shift card to
      // card: stronger contrast outlined every card as its own round clump.
      tint.setHSL(character.hue + Math.sin(s * 0.23 + phase) * 0.02 + (h3 - 0.5) * 0.012, 0.3 + (h2 - 0.5) * 0.04,
        character.lightness + (h1 - 0.5) * 0.025, THREE.SRGBColorSpace);
      const along = (h3 - 0.5) * HEDGE_STEP;
      const cx = station.x + nx * lateral + dirX * along, cz = station.z + nz * lateral + dirZ * along;
      const cy = station.y - 0.25 + up;
      // Every card takes the arch's outward normal at its angle, so the hedge
      // lights as one body with a sunlit and a shaded face. Tipped toward the
      // sky: leaves on the shaded face still see most of it.
      normal.set(nx * Math.cos(theta), Math.sin(theta) * 0.9 + 0.45, nz * Math.cos(theta)).normalize();
      // Darker toward the base, where the hedge shades itself, and inside it.
      const occlusion = (0.6 + 0.4 * Math.min(1, up / Math.max(0.1, height))) * (outer ? 1 : 0.82);
      const size = (CARD_SIZE[0] + h2 * (CARD_SIZE[1] - CARD_SIZE[0])) * character.leaf;
      const roll = h1 * Math.PI * 2;
      const base = cards.positions.length / 3;
      for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const ox = (u - 0.5) * size, oy = (v - 0.5) * size;
        cards.positions.push(cx, cy, cz);
        cards.offsets.push(ox * Math.cos(roll) - oy * Math.sin(roll), ox * Math.sin(roll) + oy * Math.cos(roll));
        cards.normals.push(normal.x, normal.y, normal.z);
        cards.colors.push(tint.r * occlusion, tint.g * occlusion, tint.b * occlusion);
        // The dense middle of the leaf texture: its sparse rim drew a round
        // outline around every card.
        cards.uvs.push(0.1 + 0.8 * u, 0.1 + 0.8 * v);
      }
      cards.indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  });
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
        if (run.length >= 3) appendHedgeRun(run, dirX, dirZ, phase + cards.positions.length * 0.001, character, cards);
        run = [];
      };
      for (let d = 0; d <= length; d += HEDGE_STEP) {
        const x = ax + dirX * d, z = az + dirZ * d;
        if (isOnRoadForNetwork(x, z, roadNetwork, 3) || isPointNearAnyBuilding(x, z, buildings, 4)) { flush(); continue; }
        run.push({ x, z, y: getTerrainMeshHeight(x, z) });
      }
      flush();
    }
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
    return { leafGeometry, poleMatrices, wires };
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
    dressing.leafGeometry.dispose();
  }, [dressing]);

  return (
    <group>
      <mesh geometry={dressing.leafGeometry} material={hedgeLeafMaterial} customDepthMaterial={hedgeLeafDepthMaterial} castShadow receiveShadow />
      <primitive object={poles} />
      <lineSegments geometry={dressing.wires} material={wireMaterial} />
    </group>
  );
}
