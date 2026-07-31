import { Box } from '@react-three/drei';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { ExtrudeShapeDefinition, ModelHelperId, ModelNode, TankMaterialRole, Vec3 } from './types';

export interface ModelHelperRenderContext {
  slot: 'hull' | 'tracks' | 'turret' | 'gun';
  renderNode: (node: ModelNode, keyPrefix?: string) => React.ReactNode;
  resolveMaterial: (role?: TankMaterialRole) => React.ReactNode;
}

export interface ModelHelperDefinition {
  id: ModelHelperId;
  memoizesGeometry?: boolean;
  render: (params: Record<string, unknown>, context: ModelHelperRenderContext) => React.ReactNode;
}

const warnedHelpers = new Set<ModelHelperId>();

function warnUnimplemented(id: ModelHelperId) {
  if (warnedHelpers.has(id)) return;
  warnedHelpers.add(id);
  console.warn(`[tank-model] Helper '${id}' is not implemented yet.`);
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' ? value : fallback;
}

function asVec3(value: unknown, fallback: Vec3 = [1, 1, 1]): Vec3 {
  if (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((entry) => typeof entry === 'number')
  ) {
    return [value[0], value[1], value[2]];
  }

  return fallback;
}

function asShapeDefinition(value: unknown): ExtrudeShapeDefinition | null {
  if (!value || typeof value !== 'object') return null;

  const shape = value as { outline?: unknown; holes?: unknown };
  if (!Array.isArray(shape.outline)) return null;
  if (!shape.outline.every((point) => Array.isArray(point) && point.length === 2 && point.every((entry) => typeof entry === 'number'))) {
    return null;
  }

  const holes = Array.isArray(shape.holes) && shape.holes.every((hole) =>
    Array.isArray(hole) && hole.every((point) => Array.isArray(point) && point.length === 2 && point.every((entry) => typeof entry === 'number')),
  )
    ? shape.holes as ExtrudeShapeDefinition['holes']
    : undefined;

  return {
    outline: shape.outline as ExtrudeShapeDefinition['outline'],
    holes,
  };
}

function asPlanPoints(value: unknown): Array<[number, number]> | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  if (!value.every((point) => Array.isArray(point) && point.length === 2 && point.every((entry) => typeof entry === 'number'))) {
    return null;
  }
  return value as Array<[number, number]>;
}

function buildShape(definition: ExtrudeShapeDefinition): THREE.Shape {
  const shape = new THREE.Shape();
  const [firstPoint, ...rest] = definition.outline;
  shape.moveTo(firstPoint[0], firstPoint[1]);
  for (const point of rest) shape.lineTo(point[0], point[1]);
  shape.closePath();

  for (const holePoints of definition.holes ?? []) {
    const [holeStart, ...holeRest] = holePoints;
    const hole = new THREE.Path();
    hole.moveTo(holeStart[0], holeStart[1]);
    for (const point of holeRest) hole.lineTo(point[0], point[1]);
    hole.closePath();
    shape.holes.push(hole);
  }

  return shape;
}

function ShapeExtrudeHelper({
  definition,
  depth,
  bevelEnabled,
  material,
}: {
  definition: ExtrudeShapeDefinition;
  depth: number;
  bevelEnabled: boolean;
  material: React.ReactNode;
}) {
  const shape = useMemo(() => buildShape(definition), [definition]);
  const geometryArgs = useMemo(() => [shape, {depth, bevelEnabled}] as const, [shape, depth, bevelEnabled]);

  return (
    <mesh castShadow receiveShadow>
      <extrudeGeometry args={geometryArgs} />
      {material}
    </mesh>
  );
}

function StadiumTrackBeltHelper({
  centerY,
  radius,
  halfLength,
  band,
  depth,
  arcSegments,
  createMaterial,
}: {
  centerY: number;
  radius: number;
  halfLength: number;
  band: number;
  depth: number;
  arcSegments: number;
  createMaterial: () => React.ReactNode;
}) {
  const geometry = useMemo(() => {
    function stadiumPoints(trackRadius: number): THREE.Vector2[] {
      const points: THREE.Vector2[] = [];
      points.push(new THREE.Vector2(-halfLength, centerY + trackRadius));
      points.push(new THREE.Vector2(halfLength, centerY + trackRadius));

      for (let index = 1; index < arcSegments; index += 1) {
        const angle = Math.PI / 2 - (Math.PI * index) / arcSegments;
        points.push(new THREE.Vector2(
          halfLength + trackRadius * Math.cos(angle),
          centerY + trackRadius * Math.sin(angle),
        ));
      }

      points.push(new THREE.Vector2(halfLength, centerY - trackRadius));
      points.push(new THREE.Vector2(-halfLength, centerY - trackRadius));

      for (let index = 1; index < arcSegments; index += 1) {
        const angle = -Math.PI / 2 - (Math.PI * index) / arcSegments;
        points.push(new THREE.Vector2(
          -halfLength + trackRadius * Math.cos(angle),
          centerY + trackRadius * Math.sin(angle),
        ));
      }

      return points;
    }

    const outer = stadiumPoints(radius);
    const inner = stadiumPoints(Math.max(radius - band, 0.001));
    const shape = new THREE.Shape();
    shape.moveTo(outer[0].x, outer[0].y);
    for (let index = 1; index < outer.length; index += 1) shape.lineTo(outer[index].x, outer[index].y);
    shape.closePath();

    const hole = new THREE.Path();
    hole.moveTo(inner[0].x, inner[0].y);
    for (let index = 1; index < inner.length; index += 1) hole.lineTo(inner[index].x, inner[index].y);
    hole.closePath();
    shape.holes.push(hole);

    return new THREE.ExtrudeGeometry(shape, {depth, bevelEnabled: false});
  }, [arcSegments, band, centerY, depth, halfLength, radius]);

  return (
    <group>
      <mesh geometry={geometry} castShadow receiveShadow>
        {createMaterial()}
      </mesh>
      <StadiumTrackShoes
        centerY={centerY}
        radius={radius}
        halfLength={halfLength}
        band={band}
        depth={depth}
        material={createMaterial()}
      />
    </group>
  );
}

function StadiumTrackShoes({
  centerY,
  radius,
  halfLength,
  band,
  depth,
  material,
}: {
  centerY: number;
  radius: number;
  halfLength: number;
  band: number;
  depth: number;
  material: React.ReactNode;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const shoePitch = Math.max(0.13, Math.min(0.2, radius * 0.58));
  const shoeHeight = Math.max(0.028, band * 0.72);
  const transforms = useMemo(() => {
    const matrices: THREE.Matrix4[] = [];
    const dummy = new THREE.Object3D();
    const addShoe = (x: number, y: number, rotationZ: number) => {
      dummy.position.set(x, y, depth / 2);
      dummy.rotation.set(0, 0, rotationZ);
      dummy.updateMatrix();
      matrices.push(dummy.matrix.clone());
    };

    const straightCount = Math.max(2, Math.round((halfLength * 2) / shoePitch));
    for (let index = 0; index < straightCount; index += 1) {
      const x = -halfLength + ((index + 0.5) / straightCount) * halfLength * 2;
      addShoe(x, centerY + radius, 0);
      addShoe(-x, centerY - radius, 0);
    }

    const arcCount = Math.max(6, Math.round((Math.PI * radius) / shoePitch));
    for (let index = 0; index < arcCount; index += 1) {
      const theta = -Math.PI / 2 + ((index + 0.5) / arcCount) * Math.PI;
      addShoe(
        halfLength + Math.cos(theta) * radius,
        centerY + Math.sin(theta) * radius,
        theta + Math.PI / 2,
      );
      addShoe(
        -halfLength - Math.cos(theta) * radius,
        centerY + Math.sin(theta) * radius,
        -theta - Math.PI / 2,
      );
    }

    return matrices;
  }, [centerY, depth, halfLength, radius, shoePitch]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    transforms.forEach((matrix, index) => mesh.setMatrixAt(index, matrix));
    mesh.instanceMatrix.needsUpdate = true;
  }, [transforms]);

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, transforms.length]} castShadow receiveShadow>
      <boxGeometry args={[shoePitch * 0.82, shoeHeight, depth + 0.04]} />
      {material}
    </instancedMesh>
  );
}

const defaultHelper: ModelHelperDefinition = {
  id: 'hull.panel_stack',
  render: (_params, _context) => null,
};

const implementedHelpers = new Map<ModelHelperId, ModelHelperDefinition>([
  [
    'turret.faceted_bustle',
    {
      id: 'turret.faceted_bustle',
      render: (params, context) => {
        const rawPlan = asPlanPoints(params.plan);
        if (!rawPlan) return null;
        const signedArea = rawPlan.reduce((area, point, index) => {
          const next = rawPlan[(index + 1) % rawPlan.length];
          return area + point[0] * next[1] - next[0] * point[1];
        }, 0);
        const plan = signedArea > 0 ? [...rawPlan].reverse() : rawPlan;
        const bottomY = asNumber(params.bottomY, 0);
        const topY = asNumber(params.topY, 0.8);
        const topScale = asNumber(params.topScale, 0.92);
        const vertices: Vec3[] = [
          ...plan.map(([x, z]) => [x, bottomY, z] as Vec3),
          ...plan.map(([x, z]) => [x * topScale, topY, z * topScale] as Vec3),
        ];
        const count = plan.length;
        const faces: Array<[number, number, number]> = [];
        for (let index = 1; index < count - 1; index += 1) {
          faces.push([0, index + 1, index]);
          faces.push([count, count + index, count + index + 1]);
        }
        for (let index = 0; index < count; index += 1) {
          const next = (index + 1) % count;
          faces.push([index, next, count + next], [index, count + next, count + index]);
        }

        return context.renderNode({
          id: 'faceted-turret-shell',
          type: 'polyhedron',
          vertices,
          faces,
          materialRole: (params.materialRole as TankMaterialRole | undefined) ?? 'hullPrimary',
        });
      },
    },
  ],
  [
    'hull.side_profile_extrude',
    {
      id: 'hull.side_profile_extrude',
      memoizesGeometry: true,
      render: (params, context) => {
        const definition = asShapeDefinition(params.shape);
        if (!definition) return null;
        return (
          <ShapeExtrudeHelper
            definition={definition}
            depth={asNumber(params.depth, 0.15)}
            bevelEnabled={Boolean(params.bevelEnabled)}
            material={context.resolveMaterial((params.materialRole as TankMaterialRole | undefined) ?? 'hullPrimary')}
          />
        );
      },
    },
  ],
  [
    'tracks.stadium_belt',
    {
      id: 'tracks.stadium_belt',
      memoizesGeometry: true,
      render: (params, context) => (
        <StadiumTrackBeltHelper
          centerY={asNumber(params.centerY, 0.35)}
          radius={asNumber(params.radius, 0.3)}
          halfLength={asNumber(params.halfLength, 3)}
          band={asNumber(params.band, 0.04)}
          depth={asNumber(params.depth, 0.72)}
          arcSegments={Math.max(6, Math.round(asNumber(params.arcSegments, 16)))}
          createMaterial={() => context.resolveMaterial((params.materialRole as TankMaterialRole | undefined) ?? 'track')}
        />
      ),
    },
  ],
  [
    'detail.wire_rack_box',
    {
      id: 'detail.wire_rack_box',
      render: (params, context) => (
        <Box args={asVec3(params.size, [1, 1, 1])} castShadow receiveShadow>
          {context.resolveMaterial((params.materialRole as TankMaterialRole | undefined) ?? 'wireframe')}
        </Box>
      ),
    },
  ],
]);

export function getTankModelHelper(id: ModelHelperId): ModelHelperDefinition {
  const helper = implementedHelpers.get(id);
  if (helper) return helper;

  return {
    ...defaultHelper,
    id,
    render: (params, context) => {
      warnUnimplemented(id);
      return defaultHelper.render(params, context);
    },
  };
}

export function getTankModelHelperIds(): ModelHelperId[] {
  return [
    'hull.panel_stack',
    'hull.side_profile_extrude',
    'tracks.segmented_run',
    'tracks.stadium_belt',
    'turret.faceted_bustle',
    'gun.linear_assembly',
    'detail.mirrored_accessories',
    'detail.crew_fittings',
    'detail.overlay_panels',
    'detail.wire_rack_box',
  ];
}
