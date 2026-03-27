import { Box, Cylinder } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import { getTankModelHelper, type ModelHelperRenderContext } from './helpers';
import type {
  ExtrudeNode,
  ExtrudeShapeDefinition,
  ModelNode,
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

function SlotRenderer({slot, nodes, geoProps, trackProps, gunProps}: SlotRendererProps) {
  const destroyed = geoProps?.destroyed ?? trackProps?.destroyed ?? gunProps?.destroyed ?? false;
  const destroyedColor = geoProps?.destroyedColor ?? trackProps?.destroyedColor ?? gunProps?.destroyedColor ?? '#555';
  const baseColor = geoProps?.color ?? '#444444';

  const resolveMaterial = (requestedRole?: TankMaterialRole) => {
    const role = requestedRole ?? (slot === 'tracks' ? 'track' : slot === 'gun' ? 'barrel' : 'hullPrimary');

    switch (role) {
      case 'track':
        return trackProps
          ? <primitive object={trackProps.trackMat} attach="material" />
          : <meshStandardMaterial color={destroyed ? destroyedColor : '#aaaaaa'} roughness={0.9} />;
      case 'trackRubber':
        return <meshStandardMaterial color={destroyed ? destroyedColor : '#111'} roughness={0.9} />;
      case 'steel':
        return <meshStandardMaterial color={destroyed ? destroyedColor : '#555'} roughness={0.5} metalness={0.8} />;
      case 'darkMetal':
        return <meshStandardMaterial color={destroyed ? destroyedColor : '#222'} roughness={0.9} metalness={0.1} />;
      case 'grille':
        return <meshStandardMaterial color={destroyed ? destroyedColor : '#111'} roughness={0.9} />;
      case 'lamp':
        return (
          <meshStandardMaterial
            color={destroyed ? destroyedColor : '#ffffcc'}
            emissive={destroyed ? '#000000' : '#ffffaa'}
            emissiveIntensity={destroyed ? 0 : 0.5}
          />
        );
      case 'mantlet':
        return <meshStandardMaterial color={destroyed ? destroyedColor : '#3a3a3a'} roughness={0.9} />;
      case 'barrel':
        return <meshStandardMaterial color={destroyed ? destroyedColor : '#444444'} roughness={0.7} metalness={0.4} />;
      case 'wireframe':
        return <meshStandardMaterial color={destroyed ? destroyedColor : '#333'} wireframe={true} />;
      case 'accessory':
        return <meshStandardMaterial color={destroyed ? destroyedColor : '#333333'} roughness={0.8} />;
      case 'hullPrimary':
      default:
        return <meshStandardMaterial color={destroyed ? destroyedColor : baseColor} roughness={0.7} metalness={0.3} />;
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
          <Box args={node.size} castShadow receiveShadow>
            {resolveMaterial(node.materialRole)}
          </Box>,
        );
      case 'cylinder':
        return wrapNode(
          node,
          keyPrefix,
          <Cylinder args={[node.radiusTop, node.radiusBottom, node.height, node.radialSegments ?? 12]} castShadow receiveShadow>
            {resolveMaterial(node.materialRole)}
          </Cylinder>,
        );
      case 'extrude':
        return wrapNode(node, keyPrefix, <ExtrudedNodeMesh node={node} material={resolveMaterial(node.materialRole)} />);
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
          resolveMaterial,
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
  const HullComponent: TankRenderer['HullComponent'] = (props) => (
    <SlotRenderer slot="hull" nodes={model.slots.hull} geoProps={props} />
  );

  const TracksComponent: TankRenderer['TracksComponent'] = (props) => (
    <SlotRenderer slot="tracks" nodes={props.isLeft ? model.slots.tracksLeft : model.slots.tracksRight} trackProps={props} />
  );

  const TurretComponent: TankRenderer['TurretComponent'] = (props) => (
    <SlotRenderer slot="turret" nodes={model.slots.turret} geoProps={props} />
  );

  const GunComponent: TankRenderer['GunComponent'] = (props) => (
    <SlotRenderer slot="gun" nodes={model.slots.gun} gunProps={props} />
  );

  return {
    HullComponent,
    TracksComponent,
    TurretComponent,
    GunComponent,
  };
}
