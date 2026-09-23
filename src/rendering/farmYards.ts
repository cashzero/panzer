import * as THREE from 'three';
import type { BuildingInstance } from '../buildings';
import { isPointInsideBuildingFootprint } from '../buildings';
import { yardEdges, type FarmYard } from '../landLayout';
import {
  UNIT_BOX, UNIT_CONE, UNIT_CYLINDER, UNIT_MOUND,
  type ArchitectureMaterial, type ArchitecturePart,
} from './ruralArchitecture';

/**
 * Dressing for farm courts and village gardens, in world space: walls that
 * stop at the buildings they join, a gateway on the road, and the working
 * clutter of a 1944 farm court. Visual only, like the hedges.
 */

const GATE_WIDTH = 3.6;
const COURT_WALL = 1.9;
const GARDEN_WALL = 1.15;

function hash(a: number, b: number, salt: number) {
  const v = Math.sin(a * 12.9898 + b * 78.233 + salt * 37.719) * 43758.5453;
  return v - Math.floor(v);
}

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export function buildYardParts(
  yard: FarmYard,
  buildings: BuildingInstance[],
  heightAt: (x: number, z: number) => number,
): ArchitecturePart[] {
  const parts: ArchitecturePart[] = [];
  const put = (material: ArchitectureMaterial, geometry: THREE.BufferGeometry,
    x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0, rx = 0, rz = 0) => {
    _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ'));
    parts.push({ material, geometry, matrix: new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)) });
  };
  // Yard frame: a along the width axis, b along the depth axis.
  const toWorld = (a: number, b: number): [number, number] =>
    [yard.x + yard.ux * a - yard.uz * b, yard.z + yard.uz * a + yard.ux * b];
  const frameYaw = Math.atan2(-yard.uz, yard.ux);
  const nearby = buildings.filter((building) =>
    Math.hypot(building.position[0] - yard.x, building.position[2] - yard.z) < Math.hypot(yard.halfWidth, yard.halfDepth) + 30);
  const covered = (x: number, z: number) => nearby.some((building) => isPointInsideBuildingFootprint(x, z, building, 0.35));

  const brick = yard.style.walls === 'brick';
  const fence = yard.kind === 'garden' && yard.style.walls === 'timber';
  const wallMaterial: ArchitectureMaterial = brick ? 'brick' : 'rubble';
  const wallHeight = yard.kind === 'court' ? COURT_WALL : GARDEN_WALL;

  /** A straight run of wall between two points, split so its base follows the ground. */
  const wallRun = (ax: number, az: number, bx: number, bz: number) => {
    const length = Math.hypot(bx - ax, bz - az);
    if (length < 0.4) return;
    const pieces = Math.max(1, Math.ceil(length / 3.5));
    const yaw = Math.atan2(-(bz - az), bx - ax);
    for (let i = 0; i < pieces; i++) {
      const t0 = i / pieces, t1 = (i + 1) / pieces;
      const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0;
      const x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
      const h0 = heightAt(x0, z0), h1 = heightAt(x1, z1);
      const low = Math.min(h0, h1) - 0.3, top = (h0 + h1) / 2 + wallHeight;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      const piece = length / pieces + 0.02;
      if (fence) {
        // Oak posts and two rails of a paling fence.
        put('oak', UNIT_BOX, x0, (h0 + h0 + 1.2) / 2, z0, 0.12, 1.2, 0.12, yaw);
        for (const y of [0.35, 0.9]) put('boards', UNIT_BOX, cx, (h0 + h1) / 2 + y, cz, piece, 0.08, 0.05, yaw);
        for (let k = 0; k < Math.floor(piece / 0.28); k++) {
          const t = (k + 0.5) / Math.floor(piece / 0.28);
          const px = x0 + (x1 - x0) * t, pz = z0 + (z1 - z0) * t;
          put('boards', UNIT_BOX, px, heightAt(px, pz) + 0.55, pz, 0.08, 1.05, 0.03, yaw);
        }
      } else {
        put(wallMaterial, UNIT_BOX, cx, (low + top) / 2, cz, piece, top - low, 0.45, yaw);
        // Coping, a little proud of both faces: dressed stone on brick, flat rubble on stone.
        put(brick ? 'dressing' : 'plinth', UNIT_BOX, cx, top + 0.07, cz, piece + 0.02, 0.14, 0.58, yaw);
      }
    }
  };

  const gateParts = (ax: number, az: number, bx: number, bz: number) => {
    const yaw = Math.atan2(-(bz - az), bx - ax);
    for (const [px, pz] of [[ax, az], [bx, bz]]) {
      const base = heightAt(px, pz);
      const pier: ArchitectureMaterial = brick ? 'brick' : 'limestone';
      put(pier, UNIT_BOX, px, base + 1.15, pz, 0.7, 2.6, 0.7, yaw);
      put('dressing', UNIT_BOX, px, base + 2.52, pz, 0.85, 0.16, 0.85, yaw);
      put('dressing', UNIT_CONE, px, base + 2.78, pz, 0.6, 0.36, 0.6, yaw);
    }
    // Two ledged gates: one shut, one swung open into the court.
    const dx = (bx - ax) / GATE_WIDTH, dz = (bz - az) / GATE_WIDTH;
    const leaf = GATE_WIDTH / 2 - 0.4;
    const hingeA: [number, number] = [ax + dx * 0.35, az + dz * 0.35];
    const shutX = hingeA[0] + dx * leaf / 2, shutZ = hingeA[1] + dz * leaf / 2;
    const base = heightAt(shutX, shutZ);
    put('boards', UNIT_BOX, shutX, base + 0.85, shutZ, leaf, 1.5, 0.07, yaw);
    put('oak', UNIT_BOX, shutX, base + 1.35, shutZ, leaf, 0.12, 0.1, yaw);
    put('oak', UNIT_BOX, shutX, base + 0.4, shutZ, leaf, 0.12, 0.1, yaw);
    // The open leaf turns about its hinge on the far pier, toward the yard centre.
    const hingeB: [number, number] = [bx - dx * 0.35, bz - dz * 0.35];
    const inward = Math.sign((yard.x - hingeB[0]) * -dz + (yard.z - hingeB[1]) * dx) || 1;
    const openYaw = yaw + inward * 1.25;
    const ox = hingeB[0] - Math.cos(openYaw) * leaf / 2, oz = hingeB[1] + Math.sin(openYaw) * leaf / 2;
    put('boards', UNIT_BOX, ox, heightAt(ox, oz) + 0.85, oz, leaf, 1.5, 0.07, openYaw);
  };

  yardEdges(yard).forEach(([[ax, az], [bx, bz]], edge) => {
    const length = Math.hypot(bx - ax, bz - az);
    const step = 0.5;
    const gateFrom = edge === yard.gate ? length / 2 - GATE_WIDTH / 2 : Infinity;
    const gateTo = edge === yard.gate ? length / 2 + GATE_WIDTH / 2 : -Infinity;
    let runStart: number | null = null;
    const flush = (end: number) => {
      if (runStart === null) return;
      const t0 = runStart / length, t1 = end / length;
      wallRun(ax + (bx - ax) * t0, az + (bz - az) * t0, ax + (bx - ax) * t1, az + (bz - az) * t1);
      runStart = null;
    };
    for (let s = 0; s <= length + 1e-6; s += step) {
      const x = ax + (bx - ax) * (s / length), z = az + (bz - az) * (s / length);
      const open = (s > gateFrom && s < gateTo) || covered(x, z);
      if (open) flush(s);
      else if (runStart === null) runStart = s;
    }
    flush(length);
    if (edge === yard.gate) {
      const t0 = gateFrom / length, t1 = gateTo / length;
      gateParts(ax + (bx - ax) * t0, az + (bz - az) * t0, ax + (bx - ax) * t1, az + (bz - az) * t1);
    }
  });

  const seed = yard.x * 0.37 + yard.z * 0.61;
  const at = (a: number, b: number) => {
    const [x, z] = toWorld(a * yard.halfWidth, b * yard.halfDepth);
    return { x, z, y: heightAt(x, z) };
  };
  const clear = (a: number, b: number, radius: number) => {
    const p = at(a, b);
    return !nearby.some((building) => isPointInsideBuildingFootprint(p.x, p.z, building, radius));
  };

  if (yard.kind === 'court') {
    // Stone well with a little pent roof and winding drum.
    const wellA = (hash(seed, 1, 1) - 0.5) * 0.9, wellB = -0.1 + hash(seed, 1, 2) * 0.3;
    if (clear(wellA, wellB, 1.5)) {
      const w = at(wellA, wellB);
      put('limestone', UNIT_CYLINDER, w.x, w.y + 0.45, w.z, 1.6, 0.9, 1.6);
      put('water', UNIT_CYLINDER, w.x, w.y + 0.88, w.z, 1.2, 0.04, 1.2);
      for (const side of [-1, 1]) {
        const [px, pz] = [w.x + Math.cos(frameYaw) * side * 0.75, w.z - Math.sin(frameYaw) * side * 0.75];
        put('oak', UNIT_BOX, px, w.y + 1.4, pz, 0.14, 1.9, 0.14, frameYaw);
      }
      put('oak', UNIT_CYLINDER, w.x, w.y + 1.75, w.z, 0.22, 1.5, 0.22, frameYaw, 0, Math.PI / 2);
      put('tile', UNIT_BOX, w.x, w.y + 2.45, w.z, 1.9, 0.08, 1.3, frameYaw, 0.35);
    }
    // Manure heap by a barn, and a haystack in the far corner.
    const heapA = (hash(seed, 2, 1) < 0.5 ? -1 : 1) * 0.55, heapB = 0.35;
    if (clear(heapA, heapB, 2)) {
      const h = at(heapA, heapB);
      put('manure', UNIT_MOUND, h.x, h.y + 0.2, h.z, 4.2, 1.3, 3.2, frameYaw + hash(seed, 2, 3));
    }
    const stackA = -heapA * 0.8, stackB = 0.55;
    if (clear(stackA, stackB, 2.8)) {
      const s = at(stackA, stackB);
      put('hay', UNIT_CYLINDER, s.x, s.y + 1.25, s.z, 4.2, 2.5, 4.2);
      put('thatch', UNIT_CONE, s.x, s.y + 3.2, s.z, 4.6, 1.8, 4.6);
    }
    // A farm cart, shafts resting on the ground.
    const cartA = (hash(seed, 3, 1) - 0.5) * 0.6, cartB = -0.55;
    if (clear(cartA, cartB, 1.8)) {
      const c = at(cartA, cartB);
      const yaw = frameYaw + (hash(seed, 3, 2) - 0.5) * 1.2;
      put('boards', UNIT_BOX, c.x, c.y + 1.0, c.z, 1.5, 0.12, 3.0, yaw);
      for (const side of [-1, 1]) {
        put('boards', UNIT_BOX, c.x + Math.cos(yaw) * side * 0.72, c.y + 1.3, c.z - Math.sin(yaw) * side * 0.72, 0.06, 0.5, 3.0, yaw);
        put('oak', UNIT_CYLINDER, c.x + Math.cos(yaw) * side * 0.85, c.y + 0.7, c.z - Math.sin(yaw) * side * 0.85, 1.4, 0.1, 1.4, yaw, 0, Math.PI / 2);
      }
      for (const side of [-1, 1]) {
        const sx = c.x + Math.cos(yaw) * side * 0.35 + Math.sin(yaw) * 2.4, sz = c.z - Math.sin(yaw) * side * 0.35 + Math.cos(yaw) * 2.4;
        put('oak', UNIT_BOX, sx, c.y + 0.5, sz, 0.09, 0.09, 2.2, yaw, 0.38);
      }
    }
    // Firewood stacked against a wall.
    const woodA = 0.9, woodB = (hash(seed, 4, 1) - 0.5) * 0.8;
    if (clear(woodA, woodB, 0.6)) {
      const f = at(woodA, woodB);
      for (let row = 0; row < 3; row++) put('log', UNIT_BOX, f.x, f.y + 0.2 + row * 0.35, f.z, 0.9, 0.34, 3.2, frameYaw + Math.PI / 2);
    }
  } else {
    // Kitchen garden: dug beds with rows of vegetables across the plot.
    const rows = Math.max(2, Math.floor(yard.halfDepth * 2 / 2.2));
    for (let r = 0; r < rows; r++) {
      const b = -0.8 + (1.6 * (r + 0.5)) / rows;
      if (!clear(0, b, 0.6)) continue;
      const bed = at(0, b);
      put('earth', UNIT_BOX, bed.x, bed.y + 0.05, bed.z, yard.halfWidth * 1.6, 0.12, 1.3, frameYaw);
      if (hash(seed, r, 5) < 0.8) put('veg', UNIT_BOX, bed.x, bed.y + 0.2, bed.z, yard.halfWidth * 1.5, 0.28, 0.5, frameYaw);
    }
    // A currant bush or two by the wall.
    for (const a of [-0.85, 0.85]) {
      if (hash(seed, a, 6) < 0.5 || !clear(a, 0.8, 0.8)) continue;
      const bush = at(a, 0.8);
      put('veg', UNIT_MOUND, bush.x, bush.y + 0.45, bush.z, 1.3, 1.0, 1.3);
    }
  }
  return parts;
}
