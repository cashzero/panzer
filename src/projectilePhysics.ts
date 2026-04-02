import * as THREE from 'three';
import { getTerrainHeight } from './Terrain';
import type { TreeInstance } from './trees';
import type { BuildingInstance } from './buildings';
import { intersectBuildingRay } from './buildings';

// --- Projectile Motion ---

export interface ProjectileStep {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
}

export function stepProjectile(
  position: THREE.Vector3,
  velocity: THREE.Vector3,
  dt: number,
  gravity: number,
): ProjectileStep {
  const newPos = position.clone().add(velocity.clone().multiplyScalar(dt));
  const newVel = velocity.clone();
  newVel.y -= gravity * dt;
  return { position: newPos, velocity: newVel };
}

// --- Terrain Collision ---

export interface TerrainHitResult {
  hit: boolean;
}

export function checkTerrainCollision(nextPos: THREE.Vector3): TerrainHitResult {
  const terrainHeight = getTerrainHeight(nextPos.x, nextPos.z);
  return { hit: nextPos.y <= terrainHeight };
}

// --- Tree Collision ---

export interface TreeHitResult {
  hit: boolean;
  treeIndex: number;
  normal: THREE.Vector3;
  newHealth: number;
  shouldFall: boolean;
  fallDirection: number;
}

export function checkTreeCollision(
  nextPos: THREE.Vector3,
  trees: TreeInstance[],
  treeRadius: number,
): TreeHitResult | null {
  for (let ti = 0; ti < trees.length; ti++) {
    const tree = trees[ti];
    if (tree.fallen) continue;
    const tx = tree.position[0];
    const tz = tree.position[2];
    const ty = tree.position[1];
    const dx = nextPos.x - tx;
    const dz = nextPos.z - tz;
    const distXZ = Math.sqrt(dx * dx + dz * dz);
    const treeHeight = 8 * tree.scale;
    if (distXZ < treeRadius + 0.2 && nextPos.y >= ty && nextPos.y <= ty + treeHeight) {
      const newHealth = tree.health - 50;
      return {
        hit: true,
        treeIndex: ti,
        normal: new THREE.Vector3(dx / distXZ, 0, dz / distXZ),
        newHealth,
        shouldFall: newHealth <= 0,
        fallDirection: Math.atan2(dx, dz),
      };
    }
  }
  return null;
}

export interface BuildingHitResult {
  hit: boolean;
  buildingId: string;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  distance: number;
}

export interface TreeRayHitResult {
  hit: boolean;
  treeIndex: number;
  point: THREE.Vector3;
  normal: THREE.Vector3;
  distance: number;
}

function considerTreeRayHit(
  currentBest: TreeRayHitResult | null,
  ray: THREE.Ray,
  maxDistance: number,
  treeIndex: number,
  t: number,
  point: THREE.Vector3,
  normal: THREE.Vector3,
): TreeRayHitResult | null {
  if (t < 0 || t > maxDistance) return currentBest;
  if (currentBest && t >= currentBest.distance) return currentBest;
  return {
    hit: true,
    treeIndex,
    point: point.clone(),
    normal: normal.clone(),
    distance: t,
  };
}

export function checkTreeRayCollision(
  ray: THREE.Ray,
  maxDistance: number,
  trees: TreeInstance[],
  treeRadius: number,
): TreeRayHitResult | null {
  let closest: TreeRayHitResult | null = null;

  for (let ti = 0; ti < trees.length; ti++) {
    const tree = trees[ti];
    if (tree.fallen) continue;

    const tx = tree.position[0];
    const ty = tree.position[1];
    const tz = tree.position[2];
    const treeHeight = 8 * tree.scale;

    const ox = ray.origin.x - tx;
    const oz = ray.origin.z - tz;
    const dx = ray.direction.x;
    const dz = ray.direction.z;
    const radiusSq = treeRadius * treeRadius;
    const a = dx * dx + dz * dz;
    const b = 2 * (ox * dx + oz * dz);
    const c = ox * ox + oz * oz - radiusSq;

    if (a > 1e-6) {
      const discriminant = b * b - 4 * a * c;
      if (discriminant >= 0) {
        const sqrtDisc = Math.sqrt(discriminant);
        const roots = [(-b - sqrtDisc) / (2 * a), (-b + sqrtDisc) / (2 * a)];
        for (const t of roots) {
          if (t < 0 || t > maxDistance) continue;
          const y = ray.origin.y + ray.direction.y * t;
          if (y < ty || y > ty + treeHeight) continue;
          const point = ray.at(t, new THREE.Vector3());
          const normal = new THREE.Vector3(point.x - tx, 0, point.z - tz).normalize();
          closest = considerTreeRayHit(closest, ray, maxDistance, ti, t, point, normal);
        }
      }
    }

    if (Math.abs(ray.direction.y) > 1e-6) {
      const capYs = [ty, ty + treeHeight];
      for (let capIndex = 0; capIndex < capYs.length; capIndex++) {
        const capY = capYs[capIndex];
        const t = (capY - ray.origin.y) / ray.direction.y;
        if (t < 0 || t > maxDistance) continue;
        const point = ray.at(t, new THREE.Vector3());
        const distSq = (point.x - tx) * (point.x - tx) + (point.z - tz) * (point.z - tz);
        if (distSq > radiusSq) continue;
        const normal = capIndex === 0
          ? new THREE.Vector3(0, -1, 0)
          : new THREE.Vector3(0, 1, 0);
        closest = considerTreeRayHit(closest, ray, maxDistance, ti, t, point, normal);
      }
    }
  }

  return closest;
}

export function checkBuildingCollision(
  ray: THREE.Ray,
  rayLength: number,
  buildings: BuildingInstance[],
): BuildingHitResult | null {
  let closest: BuildingHitResult | null = null;

  for (const building of buildings) {
    const hit = intersectBuildingRay(ray, rayLength, building);
    if (!hit) continue;
    if (!closest || hit.distance < closest.distance) {
      closest = {
        hit: true,
        buildingId: building.id,
        point: hit.point,
        normal: hit.normal,
        distance: hit.distance,
      };
    }
  }

  return closest;
}
