import * as THREE from 'three';
import type { TankData } from './store';

// --- Types ---

export interface ArmorPlate {
  name: string;
  zone: 'hull' | 'turret' | 'track' | 'gun';
  halfExtents: [number, number, number];
  position: [number, number, number];
  rotation: [number, number, number]; // Euler XYZ radians
  armorThickness: number; // mm
  isTrack?: 'left' | 'right';
  parent: 'hull' | 'turret' | 'gunGroup';
}

export interface ArmorProfile {
  plates: ArmorPlate[];
  broadPhaseRadius: number;
}

export interface ArmorPlateHitInfo {
  name: string;
  zone: 'hull' | 'turret' | 'track' | 'gun';
  armorThickness: number;
  isTrack?: 'left' | 'right';
}

export interface HitResult {
  distance: number;
  worldPoint: THREE.Vector3;
  normal: THREE.Vector3;
  plateInfo: ArmorPlateHitInfo;
}

// Plate definitions have moved to src/tanks/*.tsx (per-tank definitions).
// ArmorProfile is now constructed by callers from TankDefinition.

// --- Reusable THREE objects (avoid GC) ---

const _plateMatrix = new THREE.Matrix4();
const _inversePlateMatrix = new THREE.Matrix4();
const _localRay = new THREE.Ray();
const _localRayOrigin = new THREE.Vector3();
const _localRayDir = new THREE.Vector3();
const _intersection = new THREE.Vector3();
const _localNormal = new THREE.Vector3();
const _worldNormal = new THREE.Vector3();
const _worldHitPoint = new THREE.Vector3();
const _box = new THREE.Box3();
const _halfExt = new THREE.Vector3();
const _negHalfExt = new THREE.Vector3();
const _platePos = new THREE.Vector3();
const _plateEuler = new THREE.Euler();
const _plateQuat = new THREE.Quaternion();
const _oneVec = new THREE.Vector3(1, 1, 1);

const _hullMatrix = new THREE.Matrix4();
const _hullEuler = new THREE.Euler();
const _hullQuat = new THREE.Quaternion();

const _turretMatrix = new THREE.Matrix4();
const _turretLocalMatrix = new THREE.Matrix4();
const _turretEuler = new THREE.Euler();
const _turretQuat = new THREE.Quaternion();
const _turretOffset = new THREE.Vector3();

const _gunGroupMatrix = new THREE.Matrix4();
const _gunGroupLocalMatrix = new THREE.Matrix4();
const _gunGroupEuler = new THREE.Euler();
const _gunGroupQuat = new THREE.Quaternion();
const _gunGroupOffset = new THREE.Vector3();

function getThicknessAxis(halfExtents: THREE.Vector3): 'x' | 'y' | 'z' {
  if (halfExtents.x <= halfExtents.y && halfExtents.x <= halfExtents.z) return 'x';
  if (halfExtents.y <= halfExtents.x && halfExtents.y <= halfExtents.z) return 'y';
  return 'z';
}

function isThicknessFaceHit(normal: THREE.Vector3, halfExtents: THREE.Vector3): boolean {
  const thicknessAxis = getThicknessAxis(halfExtents);
  if (thicknessAxis === 'x') return Math.abs(normal.x) > 0.999;
  if (thicknessAxis === 'y') return Math.abs(normal.y) > 0.999;
  return Math.abs(normal.z) > 0.999;
}

function isExteriorFaceHit(rayDirection: THREE.Vector3, normal: THREE.Vector3): boolean {
  return rayDirection.dot(normal) < -0.001;
}

// --- Ray-OBB Intersection ---

function determineFaceNormal(point: THREE.Vector3, halfExtents: THREE.Vector3): THREE.Vector3 {
  const eps = 0.01;
  _localNormal.set(0, 0, 0);

  if (Math.abs(point.x - halfExtents.x) < eps) _localNormal.x = 1;
  else if (Math.abs(point.x + halfExtents.x) < eps) _localNormal.x = -1;
  else if (Math.abs(point.y - halfExtents.y) < eps) _localNormal.y = 1;
  else if (Math.abs(point.y + halfExtents.y) < eps) _localNormal.y = -1;
  else if (Math.abs(point.z - halfExtents.z) < eps) _localNormal.z = 1;
  else if (Math.abs(point.z + halfExtents.z) < eps) _localNormal.z = -1;
  else {
    // Fallback: pick the face we're closest to
    const dx = Math.min(Math.abs(point.x - halfExtents.x), Math.abs(point.x + halfExtents.x));
    const dy = Math.min(Math.abs(point.y - halfExtents.y), Math.abs(point.y + halfExtents.y));
    const dz = Math.min(Math.abs(point.z - halfExtents.z), Math.abs(point.z + halfExtents.z));
    if (dx <= dy && dx <= dz) _localNormal.x = point.x > 0 ? 1 : -1;
    else if (dy <= dx && dy <= dz) _localNormal.y = point.y > 0 ? 1 : -1;
    else _localNormal.z = point.z > 0 ? 1 : -1;
  }

  return _localNormal;
}

function rayOBBIntersect(
  ray: THREE.Ray,
  rayLength: number,
  plateWorldMatrix: THREE.Matrix4,
  halfExtents: THREE.Vector3,
): { distance: number; worldPoint: THREE.Vector3; worldNormal: THREE.Vector3 } | null {
  // Transform ray into plate local space
  _inversePlateMatrix.copy(plateWorldMatrix).invert();

  _localRayOrigin.copy(ray.origin).applyMatrix4(_inversePlateMatrix);
  _localRayDir.copy(ray.direction).transformDirection(_inversePlateMatrix).normalize();
  _localRay.set(_localRayOrigin, _localRayDir);

  // Test against AABB centered at origin
  _negHalfExt.copy(halfExtents).negate();
  _box.set(_negHalfExt, halfExtents);

  if (!_localRay.intersectBox(_box, _intersection)) return null;

  const dist = _localRayOrigin.distanceTo(_intersection);
  if (dist > rayLength) return null;

  // Compute face normal in local space
  determineFaceNormal(_intersection, halfExtents);
  if (!isThicknessFaceHit(_localNormal, halfExtents)) return null;
  if (!isExteriorFaceHit(_localRayDir, _localNormal)) return null;

  // Transform back to world space
  _worldNormal.copy(_localNormal).transformDirection(plateWorldMatrix).normalize();
  _worldHitPoint.copy(_intersection).applyMatrix4(plateWorldMatrix);

  return {
    distance: dist,
    worldPoint: _worldHitPoint.clone(),
    worldNormal: _worldNormal.clone(),
  };
}

// --- Per-tank collision test ---

export function testProjectileAgainstTank(
  ray: THREE.Ray,
  rayLength: number,
  tank: TankData,
  profile: ArmorProfile,
  turretOffset: [number, number, number],
  gunPivotOffset: [number, number, number],
): HitResult | null {
  // Broad phase: distance check
  const dx = ray.origin.x - tank.position.x;
  const dy = ray.origin.y - tank.position.y;
  const dz = ray.origin.z - tank.position.z;
  const distSq = dx * dx + dy * dy + dz * dz;
  const maxDist = profile.broadPhaseRadius + rayLength;
  if (distSq > maxDist * maxDist) return null;

  // Build parent matrices
  _hullEuler.set(tank.pitch || 0, tank.rotation, tank.roll || 0, 'YXZ');
  _hullQuat.setFromEuler(_hullEuler);
  _hullMatrix.compose(tank.position, _hullQuat, _oneVec);

  _turretEuler.set(0, tank.turretRotation, 0, 'YXZ');
  _turretQuat.setFromEuler(_turretEuler);
  _turretOffset.set(turretOffset[0], turretOffset[1], turretOffset[2]);
  _turretLocalMatrix.compose(_turretOffset, _turretQuat, _oneVec);
  _turretMatrix.copy(_hullMatrix).multiply(_turretLocalMatrix);

  _gunGroupEuler.set(tank.gunElevation, 0, 0, 'YXZ');
  _gunGroupQuat.setFromEuler(_gunGroupEuler);
  _gunGroupOffset.set(gunPivotOffset[0], gunPivotOffset[1], gunPivotOffset[2]);
  _gunGroupLocalMatrix.compose(_gunGroupOffset, _gunGroupQuat, _oneVec);
  _gunGroupMatrix.copy(_turretMatrix).multiply(_gunGroupLocalMatrix);

  let closest: HitResult | null = null;

  for (const plate of profile.plates) {
    // Build plate world matrix
    let parentMatrix: THREE.Matrix4;
    if (plate.parent === 'hull') parentMatrix = _hullMatrix;
    else if (plate.parent === 'turret') parentMatrix = _turretMatrix;
    else parentMatrix = _gunGroupMatrix;

    _platePos.set(plate.position[0], plate.position[1], plate.position[2]);
    _plateEuler.set(plate.rotation[0], plate.rotation[1], plate.rotation[2]);
    _plateQuat.setFromEuler(_plateEuler);
    _plateMatrix.compose(_platePos, _plateQuat, _oneVec);
    _plateMatrix.premultiply(parentMatrix);

    _halfExt.set(plate.halfExtents[0], plate.halfExtents[1], plate.halfExtents[2]);

    const hit = rayOBBIntersect(ray, rayLength, _plateMatrix, _halfExt);
    if (hit && (!closest || hit.distance < closest.distance)) {
      closest = {
        distance: hit.distance,
        worldPoint: hit.worldPoint,
        normal: hit.worldNormal,
        plateInfo: {
          name: plate.name,
          zone: plate.zone,
          armorThickness: plate.armorThickness,
          isTrack: plate.isTrack,
        },
      };
    }
  }

  return closest;
}
