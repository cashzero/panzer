import { Cylinder, RoundedBox, Sphere } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import { armorWeathering } from '../../rendering/surfaceWeathering';
import { getTankModelHelper, type ModelHelperRenderContext } from './helpers';
import { MergedSlot } from './MergedSlot';
import type {
  ExtrudeNode,
  ExtrudeShapeDefinition,
  ModelNode,
  PolyhedronNode,
  TankGeometryProps,
  TankGunProps,
  TankMaterialRole,
  TankModelSpec,
  TankRenderer,
  TankTrackProps,
  Vec3,
} from './types';

type SlotKind = 'hull' | 'tracks' | 'turret' | 'gun';

interface SlotRendererProps {
  slot: SlotKind;
  nodes: ModelNode[];
  geoProps?: TankGeometryProps;
  trackProps?: TankTrackProps;
  gunProps?: TankGunProps;
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

function ExtrudedNodeMesh({node, material}: {node: ExtrudeNode; material: React.ReactNode}) {
  const shape = useMemo(() => buildShape(node.shape), [node.shape]);
  const geometryArgs = useMemo(
    () => [shape, {depth: node.depth, bevelEnabled: node.bevelEnabled ?? false}] as const,
    [node.bevelEnabled, node.depth, shape],
  );

  return (
    <mesh castShadow receiveShadow>
      <extrudeGeometry args={geometryArgs} />
      {material}
    </mesh>
  );
}

function PolyhedronNodeMesh({node, material}: {node: PolyhedronNode; material: React.ReactNode}) {
  const geometry = useMemo(() => {
    const positions = node.smoothShading
      ? node.vertices.flat()
      : node.faces.flatMap((face) => face.flatMap((vertexIndex) => node.vertices[vertexIndex]));
    const bufferGeometry = new THREE.BufferGeometry();
    bufferGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (node.smoothShading) bufferGeometry.setIndex(node.faces.flat());
    bufferGeometry.computeVertexNormals();
    bufferGeometry.computeBoundingSphere();
    return bufferGeometry;
  }, [node.faces, node.vertices, node.smoothShading]);

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      {material}
    </mesh>
  );
}

function getPlateEdgeRadius(size: Vec3) {
  return Math.min(0.025, Math.min(...size) * 0.18);
}

/**
 * A slight plate-to-plate difference in the paint, keyed to the part id.
 * Relative, and within about 4% either way: a fixed lightness step of 0.0275
 * moved dark paints like Olive Drab (lightness 0.25) by a fifth, so two tanks
 * in the same paint came out visibly different just because their big hull
 * parts had different names.
 */
function varyPaintColor(color: string, surfaceKey: string) {
  let hash = 2166136261;
  for (let index = 0; index < surfaceKey.length; index += 1) {
    hash ^= surfaceKey.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  const variation = ((hash >>> 0) / 0xffffffff - 0.5) * 0.08;
  return `#${new THREE.Color(color).multiplyScalar(1 + variation).getHexString()}`;
}

function SlotRenderer({slot, nodes, geoProps, trackProps, gunProps}: SlotRendererProps) {
  const destroyed = geoProps?.destroyed ?? trackProps?.destroyed ?? gunProps?.destroyed ?? false;
  const destroyedColor = geoProps?.destroyedColor ?? trackProps?.destroyedColor ?? gunProps?.destroyedColor ?? '#555';
  const baseColor = geoProps?.color ?? gunProps?.color ?? '#444444';

  const resolveMaterial = (requestedRole?: TankMaterialRole, surfaceKey = requestedRole ?? slot) => {
    const role = requestedRole ?? (slot === 'tracks' ? 'track' : slot === 'gun' ? 'barrel' : 'hullPrimary');
    const paintColor = destroyed ? destroyedColor : varyPaintColor(baseColor, surfaceKey);

    switch (role) {
      case 'track':
        return trackProps
          ? <primitive object={trackProps.trackMat} attach="material" />
          : <meshStandardMaterial color={destroyed ? destroyedColor : '#555850'} roughness={0.84} metalness={0.45} />;
      case 'trackRubber':
        return <meshStandardMaterial color={destroyed ? destroyedColor : '#161612'} roughness={0.96} metalness={0.02} />;
      case 'steel':
        return <meshStandardMaterial color={destroyed ? destroyedColor : '#4d4e48'} roughness={0.76} metalness={0.58} />;
      case 'darkMetal':
        return <meshStandardMaterial color={destroyed ? destroyedColor : '#242621'} roughness={0.83} metalness={0.28} />;
      case 'grille':
        return <meshStandardMaterial color={destroyed ? destroyedColor : '#131611'} roughness={0.97} metalness={0.12} />;
      case 'lamp':
        return (
          <meshStandardMaterial
            color={destroyed ? destroyedColor : '#c9ba83'}
            emissive={destroyed ? '#000000' : '#574719'}
            emissiveIntensity={destroyed ? 0 : 0.12}
            roughness={0.36}
            metalness={0.04}
          />
        );
      case 'mantlet':
        return <meshStandardMaterial onBeforeCompile={armorWeathering} customProgramCacheKey={() => 'armor-weathering-v3'} color={paintColor} roughness={0.88} metalness={0.1} envMapIntensity={0.65} />;
      case 'barrel':
        return <meshStandardMaterial onBeforeCompile={armorWeathering} customProgramCacheKey={() => 'armor-weathering-v3'} color={paintColor} roughness={0.82} metalness={0.12} envMapIntensity={0.65} />;
      case 'wireframe':
        return <meshStandardMaterial color={destroyed ? destroyedColor : '#30322d'} roughness={0.82} metalness={0.28} wireframe={true} />;
      case 'accessory':
        return <meshStandardMaterial color={destroyed ? destroyedColor : '#363831'} roughness={0.86} metalness={0.24} />;
      case 'hullPrimary':
      default:
        return <meshStandardMaterial onBeforeCompile={armorWeathering} customProgramCacheKey={() => 'armor-weathering-v3'} color={paintColor} roughness={0.86} metalness={0.08} envMapIntensity={0.65} />;
    }
  };

  const wrapNode = (node: ModelNode, key: string, child: React.ReactNode) => (
    <group
      key={key}
      position={node.position}
      rotation={node.rotation}
      scale={node.scale}
      visible={node.visible !== false}
      name={node.name}
      userData={{ partId: node.id }}
    >
      {child}
    </group>
  );

  const renderNode = (node: ModelNode, keyPrefix = node.id): React.ReactNode => {
    switch (node.type) {
      case 'group':
        return wrapNode(node, keyPrefix, node.children.map((child) => renderNode(child, `${keyPrefix}:${child.id}`)));
      case 'box':
        return wrapNode(
          node,
          keyPrefix,
          <RoundedBox
            args={node.size}
            radius={getPlateEdgeRadius(node.size)}
            smoothness={1}
            bevelSegments={1}
            creaseAngle={0.35}
            castShadow
            receiveShadow
          >
            {resolveMaterial(node.materialRole, node.id)}
          </RoundedBox>,
        );
      case 'cylinder':
        return wrapNode(
          node,
          keyPrefix,
          <Cylinder args={[node.radiusTop, node.radiusBottom, node.height, Math.max(16, node.radialSegments ?? 20)]} castShadow receiveShadow>
            {resolveMaterial(node.materialRole, node.id)}
          </Cylinder>,
        );
      case 'sphere':
        return wrapNode(
          node,
          keyPrefix,
          <Sphere args={[node.radius, node.widthSegments ?? 32, node.heightSegments ?? 16]} castShadow receiveShadow>
            {resolveMaterial(node.materialRole, node.id)}
          </Sphere>,
        );
      case 'polyhedron':
        return wrapNode(
          node,
          keyPrefix,
          <PolyhedronNodeMesh node={node} material={resolveMaterial(node.materialRole, node.id)} />,
        );
      case 'extrude':
        return wrapNode(node, keyPrefix, <ExtrudedNodeMesh node={node} material={resolveMaterial(node.materialRole, node.id)} />);
      case 'repeat': {
        const repeated = Array.from({length: node.count}, (_value, index) => {
          const position: Vec3 = [node.step[0] * index, node.step[1] * index, node.step[2] * index];
          return (
            <group key={`${keyPrefix}:repeat:${index}`} position={position}>
              {renderNode(node.child, `${keyPrefix}:child:${index}`)}
            </group>
          );
        });
        return wrapNode(node, keyPrefix, repeated);
      }
      case 'mirror': {
        const mirroredScale: Vec3 =
          node.axis === 'x' ? [-1, 1, 1] : node.axis === 'y' ? [1, -1, 1] : [1, 1, -1];

        return wrapNode(
          node,
          keyPrefix,
          <>
            {node.includeSource !== false && renderNode(node.child, `${keyPrefix}:source`)}
            <group scale={mirroredScale}>{renderNode(node.child, `${keyPrefix}:mirror`)}</group>
          </>,
        );
      }
      case 'helper': {
        const helper = getTankModelHelper(node.helper);
        const context: ModelHelperRenderContext = {
          slot,
          renderNode,
          resolveMaterial: (role) => resolveMaterial(role, node.id),
        };
        return wrapNode(node, keyPrefix, helper.render(node.params, context));
      }
      default:
        return null;
    }
  };

  return <group>{nodes.map((node) => renderNode(node, `${slot}:${node.id}`))}</group>;
}

export function createParametricRenderer(model: TankModelSpec): TankRenderer {
  const HullComponent: TankRenderer['HullComponent'] = (props) => {
    const slot = <SlotRenderer slot="hull" nodes={model.slots.hull} geoProps={props} />;
    return props.merged
      ? <MergedSlot rebuildKey={[props.color, props.destroyedColor, props.destroyed]} camouflage={props.camouflage} paintSeed={props.paintSeed}>{slot}</MergedSlot>
      : slot;
  };

  const TracksComponent: TankRenderer['TracksComponent'] = (props) => {
    const slot = <SlotRenderer slot="tracks" nodes={props.isLeft ? model.slots.tracksLeft : model.slots.tracksRight} trackProps={props} />;
    return props.merged
      ? <MergedSlot rebuildKey={[props.isLeft, props.trackMat, props.destroyedColor, props.destroyed]}>{slot}</MergedSlot>
      : slot;
  };

  const TurretComponent: TankRenderer['TurretComponent'] = (props) => {
    const slot = <SlotRenderer slot="turret" nodes={model.slots.turret} geoProps={props} />;
    return props.merged
      ? <MergedSlot rebuildKey={[props.color, props.destroyedColor, props.destroyed]} camouflage={props.camouflage} paintSeed={props.paintSeed}>{slot}</MergedSlot>
      : slot;
  };

  const GunComponent: TankRenderer['GunComponent'] = (props) => {
    const slot = <SlotRenderer slot="gun" nodes={model.slots.gun} gunProps={props} />;
    return props.merged
      ? <MergedSlot rebuildKey={[props.color, props.destroyedColor, props.destroyed]} camouflage={props.camouflage} paintSeed={props.paintSeed} bare>{slot}</MergedSlot>
      : slot;
  };

  return {
    HullComponent,
    TracksComponent,
    TurretComponent,
    GunComponent,
  };
}
