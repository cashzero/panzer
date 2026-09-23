import * as THREE from 'three';
import type { BuildingInstance, BuildingStyle } from '../buildings';

/**
 * Rural buildings of Normandy and Picardy, 1944, built from boxes and prisms:
 *
 * - walls in half-timbering (close-studded oak on lime render), limestone
 *   with dressed quoins, or red brick with stone bands;
 * - steep roofs of clay tile, slate or thatch, with real thickness, eaves
 *   and verges, ridge capping and gable-end chimneys;
 * - long houses with dormers in the roof, two-storey houses with a first-floor
 *   row of windows, barns with cart doors, granges with buttresses.
 *
 * Parts are expressed in the building's local frame: x along the width
 * (gable ends at +-x), z along the depth (front at +z), y up from the pad.
 */

export type ArchitectureMaterial =
  | 'render' | 'daub' | 'oak' | 'limestone' | 'rubble' | 'brick' | 'dressing'
  | 'tile' | 'slate' | 'thatch' | 'ridge' | 'boards' | 'glass' | 'door'
  | 'shutterGreen' | 'shutterGrey' | 'shutterOxblood' | 'seam' | 'chimneyCap' | 'plinth' | 'gravel'
  | 'hay' | 'manure' | 'earth' | 'veg' | 'water' | 'log';

export interface ArchitecturePart {
  material: ArchitectureMaterial;
  geometry: THREE.BufferGeometry;
  matrix: THREE.Matrix4;
}

export const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
export const UNIT_CYLINDER = new THREE.CylinderGeometry(0.5, 0.5, 1, 14);
export const UNIT_CONE = new THREE.ConeGeometry(0.5, 1, 14);
export const UNIT_MOUND = new THREE.IcosahedronGeometry(0.5, 1);
/** Low-poly lump for the many small plants in a kitchen garden. */
export const UNIT_PLANT = new THREE.IcosahedronGeometry(0.5, 0);

/** Unit triangular prism: triangle (-0.5,0) (0.5,0) (0,1) in XY, extruded -0.5..0.5 along Z. */
export const UNIT_GABLE = (() => {
  const shape = new THREE.Shape([new THREE.Vector2(-0.5, 0), new THREE.Vector2(0.5, 0), new THREE.Vector2(0, 1)]);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
  geometry.translate(0, 0, -0.5);
  return geometry;
})();

const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

class PartList {
  parts: ArchitecturePart[] = [];
  box(material: ArchitectureMaterial, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0) {
    _q.setFromEuler(_e.set(rx, ry, rz));
    this.parts.push({ material, geometry: UNIT_BOX, matrix: new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz)) });
  }
  /** Gable prism: base width `span` along the prism's X, height `rise`, length along its Z. */
  prism(material: ArchitectureMaterial, x: number, y: number, z: number, span: number, rise: number, length: number, ry = 0) {
    _q.setFromEuler(_e.set(0, ry, 0));
    this.parts.push({ material, geometry: UNIT_GABLE, matrix: new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(span, rise, length)) });
  }
}

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function defaultStyle(building: BuildingInstance): BuildingStyle {
  const rng = mulberry32(hashString(building.id) ^ 0x5bd1e995);
  return {
    walls: rng() < 0.45 ? 'timber' : rng() < 0.5 ? 'stone' : 'brick',
    roof: rng() < 0.6 ? 'tile' : 'slate',
    shutters: rng() < 0.6 ? 'green' : 'grey',
  };
}

const SHUTTER: Record<BuildingStyle['shutters'], ArchitectureMaterial> = {
  green: 'shutterGreen', grey: 'shutterGrey', oxblood: 'shutterOxblood',
};

interface Face {
  /** Wall plane: +z front, -z back, +x / -x gable ends. */
  axis: 'x' | 'z';
  sign: 1 | -1;
  /** Half length of the face and its distance from the centre. */
  half: number;
  offset: number;
}

/** Place a flat panel on a face at along-coordinate u, height y, `proud` in front of the wall. */
function panel(list: PartList, face: Face, material: ArchitectureMaterial, u: number, y: number, width: number, height: number, proud: number, thickness = 0.1) {
  const d = face.offset + proud + thickness / 2;
  if (face.axis === 'z') list.box(material, u, y, face.sign * d, width, height, thickness);
  else list.box(material, face.sign * d, y, u, thickness, height, width);
}

function windowOn(list: PartList, face: Face, style: BuildingStyle, u: number, y: number, scale: number, shutters: boolean) {
  const surround: ArchitectureMaterial = style.walls === 'timber' ? 'oak' : 'dressing';
  panel(list, face, surround, u, y, 1.2 * scale, 1.45 * scale, 0.0);
  panel(list, face, 'glass', u, y, 0.95 * scale, 1.2 * scale, 0.05);
  // Glazing bars: a French casement pair with two transoms.
  panel(list, face, 'dressing', u, y, 0.06 * scale, 1.2 * scale, 0.1, 0.03);
  for (const t of [-0.2, 0.2]) panel(list, face, 'dressing', u, y + t * scale, 0.95 * scale, 0.05 * scale, 0.1, 0.03);
  panel(list, face, 'dressing', u, y - 0.8 * scale, 1.35 * scale, 0.1 * scale, 0.02, 0.14);
  if (shutters) {
    const leaf = SHUTTER[style.shutters];
    for (const side of [-1, 1]) {
      panel(list, face, leaf, u + side * 0.95 * scale, y, 0.62 * scale, 1.3 * scale, 0.02, 0.06);
      // Ledges across each leaf.
      for (const t of [-0.4, 0.4]) panel(list, face, 'seam', u + side * 0.95 * scale, y + t * scale, 0.6 * scale, 0.07 * scale, 0.08, 0.02);
    }
  }
}

function doorOn(list: PartList, face: Face, style: BuildingStyle, u: number, width: number, height: number) {
  const surround: ArchitectureMaterial = style.walls === 'timber' ? 'oak' : 'dressing';
  panel(list, face, surround, u, height / 2 + 0.3, width + 0.34, height + 0.2, 0);
  panel(list, face, 'door', u, height / 2 + 0.3, width, height, 0.04);
  for (let p = -width / 2 + 0.2; p < width / 2 - 0.1; p += 0.2) panel(list, face, 'seam', u + p, height / 2 + 0.3, 0.03, height, 0.1, 0.02);
  // Stone step.
  panel(list, face, 'plinth', u, 0.12, width + 0.6, 0.24, 0, 0.5);
}

/** Half-timbering on a rectangular wall face: sill, plates, close studs and corner braces. */
function timberFace(list: PartList, face: Face, bottom: number, top: number, studSpacing: number, openings: Array<[number, number, number, number]>) {
  const span = face.half * 2;
  // Sole plate, mid rail and wall plate.
  for (const y of [bottom + 0.1, (bottom + top) / 2, top - 0.1]) panel(list, face, 'oak', 0, y, span, 0.18, 0.01, 0.07);
  // Corner posts.
  for (const u of [-face.half + 0.1, face.half - 0.1]) panel(list, face, 'oak', u, (bottom + top) / 2, 0.22, top - bottom, 0.01, 0.07);
  const inOpening = (u: number, y0: number, y1: number) =>
    openings.some(([ou, oy, ow, oh]) => Math.abs(u - ou) < ow / 2 + 0.08 && y1 > oy - oh / 2 - 0.1 && y0 < oy + oh / 2 + 0.1);
  const mid = (bottom + top) / 2;
  for (const [y0, y1] of [[bottom + 0.19, mid - 0.09], [mid + 0.09, top - 0.19]]) {
    for (let u = -face.half + studSpacing; u < face.half - studSpacing * 0.5; u += studSpacing) {
      if (inOpening(u, y0, y1)) continue;
      panel(list, face, 'oak', u, (y0 + y1) / 2, 0.14, y1 - y0, 0.01, 0.06);
    }
  }
  // Long braces from the corner posts toward the middle of each storey.
  const braceRun = Math.min(1.8, face.half * 0.4);
  for (const side of [-1, 1]) {
    const u0 = side * (face.half - 0.25);
    for (const [y0, y1] of [[bottom + 0.19, mid - 0.09], [mid + 0.09, top - 0.19]]) {
      const h = y1 - y0;
      const u1 = u0 - side * braceRun;
      if (inOpening((u0 + u1) / 2, y0, y1)) continue;
      const length = Math.hypot(braceRun, h);
      const angle = Math.atan2(braceRun, h) * side;
      const d = face.offset + 0.01 + 0.035;
      if (face.axis === 'z') list.box('oak', (u0 + u1) / 2, (y0 + y1) / 2, face.sign * d, 0.14, length, 0.06, 0, 0, angle * face.sign);
      else list.box('oak', face.sign * d, (y0 + y1) / 2, (u0 + u1) / 2, 0.06, length, 0.14, -angle * face.sign, 0, 0);
    }
  }
}

/** Studs in the gable triangle at a +-x end, clipped to the roof line. */
function timberGable(list: PartList, sign: 1 | -1, halfWidth: number, halfDepth: number, eaves: number, rise: number, spacing: number) {
  const d = halfWidth + 0.01 + 0.03;
  list.box('oak', sign * d, eaves + 0.1, 0, 0.06, 0.18, halfDepth * 2);
  for (let u = -halfDepth + spacing; u < halfDepth - spacing * 0.5; u += spacing) {
    const h = rise * (1 - Math.abs(u) / halfDepth) - 0.25;
    if (h < 0.3) continue;
    list.box('oak', sign * d, eaves + 0.19 + h / 2, u, 0.06, h, 0.14);
  }
}

interface RoofSpec {
  material: ArchitectureMaterial;
  thickness: number;
  eave: number;
  verge: number;
}

const ROOFS: Record<BuildingStyle['roof'], RoofSpec> = {
  tile: { material: 'tile', thickness: 0.14, eave: 0.45, verge: 0.3 },
  slate: { material: 'slate', thickness: 0.1, eave: 0.4, verge: 0.25 },
  thatch: { material: 'thatch', thickness: 0.5, eave: 0.7, verge: 0.45 },
};

/** Two roof slabs with real thickness, ridge capping, attic gables in wall material. */
function roof(list: PartList, width: number, depth: number, eaves: number, rise: number, spec: RoofSpec, gableMaterial: ArchitectureMaterial) {
  const halfDepth = depth / 2;
  list.prism(gableMaterial, 0, eaves, 0, depth, rise, width, Math.PI / 2);
  const slope = Math.hypot(halfDepth, rise);
  const angle = Math.atan2(rise, halfDepth);
  const length = slope + spec.eave;
  for (const side of [1, -1]) {
    // Slab midline runs from the ridge down past the eaves; lift by half its thickness.
    const along = (slope + spec.eave) / 2 - 0.02;
    const cz = side * Math.cos(angle) * along;
    const cy = eaves + rise - Math.sin(angle) * along;
    const nz = side * Math.sin(angle) * spec.thickness / 2, ny = Math.cos(angle) * spec.thickness / 2;
    list.box(spec.material, 0, cy + ny, cz + nz, width + spec.verge * 2, spec.thickness, length, side * angle, 0, 0);
  }
  if (spec.material === 'thatch') {
    // Thick rolled ridge of sedge and clay.
    list.box('ridge', 0, eaves + rise + spec.thickness * 0.55, 0, width + spec.verge * 2 + 0.1, 0.42, 0.9);
  } else {
    list.box('ridge', 0, eaves + rise + spec.thickness * 0.7, 0, width + spec.verge * 2, 0.16, 0.34, Math.PI / 4, 0, 0);
  }
}

function chimney(list: PartList, x: number, z: number, top: number, bottom: number, material: ArchitectureMaterial) {
  list.box(material, x, (top + bottom) / 2, z, 0.85, top - bottom, 0.75);
  list.box('chimneyCap', x, top + 0.08, z, 1.0, 0.16, 0.9);
  list.box('chimneyCap', x, top + 0.25, z, 0.3, 0.3, 0.3);
}

function dormer(list: PartList, style: BuildingStyle, x: number, halfDepth: number, eaves: number, spec: RoofSpec) {
  const width = 1.7, height = 1.6;
  const front = halfDepth - 0.1;
  const back = front - 2.2;
  const body: ArchitectureMaterial = style.walls === 'timber' ? 'render' : style.walls === 'brick' ? 'brick' : 'limestone';
  list.box(body, x, eaves + height / 2, (front + back) / 2, width, height, front - back);
  // Its own small gable roof, ridge running into the main roof.
  list.prism(body, x, eaves + height, (front + back) / 2, width, 0.8, front - back);
  for (const side of [1, -1]) {
    const angle = Math.atan2(0.8, width / 2);
    list.box(spec.material, x + side * width / 4, eaves + height + 0.44, (front + back) / 2 + 0.15, Math.hypot(width / 2, 0.8) + 0.3, spec.thickness * 0.8, front - back + 0.35, 0, 0, -side * angle);
  }
  const face: Face = { axis: 'z', sign: 1, half: width / 2, offset: front };
  windowOn(list, face, style, x, eaves + height * 0.5, 0.7, false);
}

function wallMaterial(style: BuildingStyle, kind: BuildingInstance['kind']): ArchitectureMaterial {
  if (style.walls === 'timber') return kind === 'farmhouse' ? 'render' : 'daub';
  if (style.walls === 'brick') return 'brick';
  return kind === 'farmhouse' ? 'limestone' : 'rubble';
}

function quoins(list: PartList, face: Face, top: number) {
  for (let y = 0.6, course = 0; y < top - 0.15; y += 0.4, course++) {
    const long = course % 2 === 0;
    for (const side of [-1, 1]) panel(list, face, 'dressing', side * (face.half - (long ? 0.32 : 0.2)), y, long ? 0.66 : 0.42, 0.32, 0, 0.06);
  }
}

function farmhouse(list: PartList, b: BuildingInstance, style: BuildingStyle, rng: () => number) {
  const hw = b.width / 2, hd = b.depth / 2;
  const spec = ROOFS[style.roof];
  const wall = wallMaterial(style, 'farmhouse');
  const front: Face = { axis: 'z', sign: 1, half: hw, offset: hd };
  const back: Face = { axis: 'z', sign: -1, half: hw, offset: hd };
  const twoStorey = b.height > 4.6;
  const groundY = 1.55;
  const upperY = b.height - 1.05;
  const bays = Math.max(2, Math.round((b.width - 2) / 3.1));
  const doorBay = Math.floor(bays / 2);
  const bayU = (i: number) => -hw + (b.width / bays) * (i + 0.5);
  const openings: Array<[number, number, number, number]> = [];
  for (let i = 0; i < bays; i++) {
    if (i === doorBay) {
      doorOn(list, front, style, bayU(i), 1.05, 2.15);
      openings.push([bayU(i), 1.3, 1.4, 2.4]);
    } else {
      windowOn(list, front, style, bayU(i), groundY, 1, true);
      openings.push([bayU(i), groundY, 1.3, 1.5]);
    }
    if (twoStorey) {
      windowOn(list, front, style, bayU(i), upperY, 0.85, true);
      openings.push([bayU(i), upperY, 1.1, 1.3]);
    }
  }
  const backOpenings: Array<[number, number, number, number]> = [];
  for (const u of [-hw * 0.45, hw * 0.45]) {
    windowOn(list, back, style, u, groundY, 0.8, true);
    backOpenings.push([u, groundY, 1.1, 1.3]);
  }
  if (style.walls === 'timber') {
    timberFace(list, front, 0.45, b.height, 0.62, openings);
    timberFace(list, back, 0.45, b.height, 0.62, backOpenings);
    for (const sign of [1, -1] as const) {
      timberFace(list, { axis: 'x', sign, half: hd, offset: hw }, 0.45, b.height, 0.62, []);
      timberGable(list, sign, hw, hd, b.height, b.roofHeight, 0.62);
    }
  } else {
    quoins(list, front, b.height);
    quoins(list, back, b.height);
    if (style.walls === 'brick') {
      // Stone string course at the first floor and a band under the eaves.
      for (const y of twoStorey ? [b.height * 0.52, b.height - 0.2] : [b.height - 0.2]) {
        for (const face of [front, back]) panel(list, face, 'dressing', 0, y, b.width + 0.04, 0.2, 0, 0.05);
      }
    }
  }
  roof(list, b.width, b.depth, b.height, b.roofHeight, spec, wall === 'render' ? 'render' : wall);
  if (!twoStorey) {
    const dormers = b.width > 13.5 ? 2 : 1;
    for (let i = 0; i < dormers; i++) dormer(list, style, dormers === 1 ? bayU(doorBay === 0 ? 1 : 0) : (i === 0 ? -hw * 0.45 : hw * 0.45), hd, b.height, spec);
  }
  // Gable-end chimneys on the ridge.
  const ridge = b.height + b.roofHeight;
  const stack: ArchitectureMaterial = style.walls === 'brick' ? 'brick' : 'limestone';
  chimney(list, -hw + 0.7, 0, ridge + 0.9, ridge - 1.2, stack);
  if (rng() < 0.6) chimney(list, hw - 0.7, 0, ridge + 0.9, ridge - 1.2, stack);
}

function barn(list: PartList, b: BuildingInstance, style: BuildingStyle, grange: boolean) {
  const hw = b.width / 2, hd = b.depth / 2;
  const spec = ROOFS[style.roof];
  const wall = wallMaterial(style, b.kind);
  const front: Face = { axis: 'z', sign: 1, half: hw, offset: hd };
  const back: Face = { axis: 'z', sign: -1, half: hw, offset: hd };
  const doorWidth = Math.min(4.2, b.width * 0.24);
  const doorHeight = Math.min(4.1, b.height - 0.5);
  const doors = grange ? [-hw * 0.45, hw * 0.45] : [0];
  const openings: Array<[number, number, number, number]> = [];
  for (const u of doors) {
    // Cart door: heavy oak lintel, two ledged and braced leaves of boards.
    panel(list, front, 'oak', u, doorHeight + 0.2, doorWidth + 0.8, 0.35, 0.02, 0.14);
    for (const side of [-1, 1]) {
      const leafU = u + side * doorWidth / 4;
      panel(list, front, 'boards', leafU, doorHeight / 2 + 0.05, doorWidth / 2 - 0.04, doorHeight, 0.03, 0.08);
      for (let p = -doorWidth / 4 + 0.22; p < doorWidth / 4; p += 0.22) panel(list, front, 'seam', leafU + p, doorHeight / 2 + 0.05, 0.03, doorHeight, 0.11, 0.02);
      for (const y of [0.5, doorHeight - 0.4]) panel(list, front, 'oak', leafU, y, doorWidth / 2 - 0.1, 0.16, 0.11, 0.04);
      // Diagonal brace across the leaf.
      const length = Math.hypot(doorWidth / 2 - 0.2, doorHeight - 0.9);
      list.box('oak', leafU, doorHeight / 2 + 0.05, hd + 0.13, 0.14, length, 0.04, 0, 0, side * Math.atan2(doorWidth / 2 - 0.2, doorHeight - 0.9));
    }
    openings.push([u, doorHeight / 2, doorWidth + 0.8, doorHeight + 0.6]);
  }
  // Pitching hole above the door and ventilation slits along the wall.
  panel(list, front, 'boards', doors[0], Math.min(b.height - 0.6, doorHeight + 1.0), 1.1, 0.9, 0.03);
  for (let u = -hw + 1.6; u < hw - 1.2; u += 2.4) {
    if (openings.some(([ou, , ow]) => Math.abs(u - ou) < ow / 2 + 0.4)) continue;
    panel(list, front, 'seam', u, b.height * 0.55, 0.12, 0.9, 0.0);
    panel(list, back, 'seam', u, b.height * 0.55, 0.12, 0.9, 0.0);
  }
  if (style.walls === 'timber') {
    timberFace(list, front, 0.45, b.height, 1.25, openings);
    timberFace(list, back, 0.45, b.height, 1.25, []);
    for (const sign of [1, -1] as const) {
      timberFace(list, { axis: 'x', sign, half: hd, offset: hw }, 0.45, b.height, 1.25, []);
      timberGable(list, sign, hw, hd, b.height, b.roofHeight, 1.25);
    }
  } else {
    quoins(list, front, b.height);
    quoins(list, back, b.height);
    if (grange || style.walls === 'stone') {
      // Stepped buttresses between the bays of a stone barn.
      for (let u = -hw + b.width / 4; u < hw - 0.5; u += b.width / 4) {
        if (openings.some(([ou, , ow]) => Math.abs(u - ou) < ow / 2 + 0.5)) continue;
        for (const face of [front, back]) {
          panel(list, face, wall, u, b.height * 0.35, 0.7, b.height * 0.7, 0, 0.55);
          panel(list, face, wall, u, b.height * 0.8, 0.7, b.height * 0.3, 0, 0.3);
        }
      }
    }
  }
  roof(list, b.width, b.depth, b.height, b.roofHeight, spec, wall);
}

/** Parts for one building in its local frame, including the wall body and plinth. */
export function buildBuildingParts(building: BuildingInstance): ArchitecturePart[] {
  const list = new PartList();
  const style = building.style ?? defaultStyle(building);
  const rng = mulberry32(hashString(building.id));
  const wall = wallMaterial(style, building.kind);
  // Levelled pad and a stone plinth under the walls.
  list.box('gravel', 0, 0.035, 0, building.width + 3, 0.07, building.depth + 3);
  list.box('plinth', 0, 0.23, 0, building.width + 0.3, 0.46, building.depth + 0.3);
  list.box(wall, 0, building.height / 2, 0, building.width, building.height, building.depth);
  if (building.kind === 'farmhouse') farmhouse(list, building, style, rng);
  else barn(list, building, style, building.kind === 'warehouse');
  return list.parts;
}

export { PartList };
