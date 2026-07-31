import { Cylinder, RoundedBox, Sphere } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';
import { getTankModelHelper, type ModelHelperRenderContext } from '../../tanks/core/helpers';
import type {
  ExtrudeNode,
  ExtrudeShapeDefinition,
  ModelNode,
  PolyhedronNode,
  TankArmorPlateSpec,
  TankMaterialRole,
  TankModelSpec,
  TankSpec,
  Vec3,
} from '../../tanks/core/types';
import { pathToKey } from '../modelTree';
import type { EditorSelection, JsonPath, ModelSlot } from '../types';

type SlotKind = 'hull' | 'tracks' | 'turret' | 'gun';

interface EditorTankSceneProps {
  spec: TankSpec;
  model: TankModelSpec;
  sceneRef: React.RefObject<THREE.Group | null>;
  activeTab: 'specs' | 'armor' | 'model';
  showArmor: boolean;
  selectedEntity: EditorSelection;
  onSelectEntity: (selection: EditorSelection) => void;
  onHoverPlate: (info: {
    id: string;
    name: string;
    zone: string;
    armorThickness: number;
    slopeAngleDeg: number;
    mouseX: number;
    mouseY: number;
  } | null, event?: any) => void;
  registerNodeObject: (pathKey: string, object: THREE.Object3D | null) => void;
  registerPlateObject: (plateId: string, object: THREE.Object3D | null) => void;
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

function plateSlopeAngle(plate: TankArmorPlateSpec) {
  const ax = Math.abs(plate.rotation[0]);
  const ay = Math.abs(plate.rotation[1]);
  const az = Math.abs(plate.rotation[2]);
  return Math.round(Math.max(ax, ay, az) * (180 / Math.PI));
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
    const positions = node.faces.flatMap((face) => face.flatMap((vertexIndex) => node.vertices[vertexIndex]));
    const bufferGeometry = new THREE.BufferGeometry();
    bufferGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    bufferGeometry.computeVertexNormals();
    bufferGeometry.computeBoundingSphere();
    return bufferGeometry;
  }, [node.faces, node.vertices]);

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      {material}
    </mesh>
  );
}

function getPlateEdgeRadius(size: Vec3) {
  return Math.min(0.025, Math.min(...size) * 0.18);
}

function ArmorPlateMesh({
  plate,
  selected,
  selectable,
  onSelectEntity,
  onHoverPlate,
  registerPlateObject,
}: {
  plate: TankArmorPlateSpec;
  selected: boolean;
  selectable: boolean;
  onSelectEntity: (selection: EditorSelection) => void;
  onHoverPlate: EditorTankSceneProps['onHoverPlate'];
  registerPlateObject: (plateId: string, object: THREE.Object3D | null) => void;
}) {
  const edgeColor = selected ? '#e7cb7b' : '#8fa76a';
  const fillOpacity = selected ? 0.22 : 0.08;

  return (
    <group
      ref={(object) => registerPlateObject(plate.id, object)}
      position={plate.position}
      rotation={plate.rotation}
      onClick={selectable ? (event) => {
        event.stopPropagation();
        onSelectEntity({kind: 'armorPlate', plateId: plate.id});
      } : undefined}
      onPointerEnter={selectable ? (event) => {
        event.stopPropagation();
        onHoverPlate({
          id: plate.id,
          name: plate.name,
          zone: plate.zone,
          armorThickness: plate.armorThickness,
          slopeAngleDeg: plateSlopeAngle(plate),
          mouseX: event.nativeEvent.clientX,
          mouseY: event.nativeEvent.clientY,
        }, event);
      } : undefined}
      onPointerMove={selectable ? (event) => {
        event.stopPropagation();
        onHoverPlate({
          id: plate.id,
          name: plate.name,
          zone: plate.zone,
          armorThickness: plate.armorThickness,
          slopeAngleDeg: plateSlopeAngle(plate),
          mouseX: event.nativeEvent.clientX,
          mouseY: event.nativeEvent.clientY,
        }, event);
      } : undefined}
      onPointerLeave={selectable ? (event) => {
        event.stopPropagation();
        onHoverPlate(null, event);
      } : undefined}
    >
      <mesh renderOrder={2}>
        <boxGeometry args={[plate.halfExtents[0] * 2, plate.halfExtents[1] * 2, plate.halfExtents[2] * 2]} />
        <meshBasicMaterial transparent depthWrite={false} opacity={fillOpacity} color={selected ? '#d7b56b' : '#7f9a5a'} />
      </mesh>
      <mesh renderOrder={3}>
        <boxGeometry args={[plate.halfExtents[0] * 2, plate.halfExtents[1] * 2, plate.halfExtents[2] * 2]} />
        <meshBasicMaterial wireframe={true} transparent depthWrite={false} opacity={0.9} color={edgeColor} />
      </mesh>
    </group>
  );
}

function resolveMaterial(
  slot: SlotKind,
  baseColor: string,
  trackMat: THREE.Material,
  requestedRole?: TankMaterialRole,
) {
  const role = requestedRole ?? (slot === 'tracks' ? 'track' : slot === 'gun' ? 'barrel' : 'hullPrimary');

  switch (role) {
    case 'track':
      return <primitive object={trackMat} attach="material" />;
    case 'trackRubber':
      return <meshStandardMaterial color="#161612" roughness={0.96} metalness={0.02} />;
    case 'steel':
      return <meshStandardMaterial color="#4d4e48" roughness={0.76} metalness={0.58} />;
    case 'darkMetal':
      return <meshStandardMaterial color="#242621" roughness={0.83} metalness={0.28} />;
    case 'grille':
      return <meshStandardMaterial color="#131611" roughness={0.97} metalness={0.12} />;
    case 'lamp':
      return <meshStandardMaterial color="#c9ba83" emissive="#574719" emissiveIntensity={0.12} roughness={0.36} metalness={0.04} />;
    case 'mantlet':
      return <meshStandardMaterial color={baseColor} roughness={0.84} metalness={0.1} envMapIntensity={0.65} />;
    case 'barrel':
      return <meshStandardMaterial color={baseColor} roughness={0.78} metalness={0.12} envMapIntensity={0.65} />;
    case 'wireframe':
      return <meshStandardMaterial color="#30322d" roughness={0.82} metalness={0.28} wireframe={true} />;
    case 'accessory':
      return <meshStandardMaterial color="#363831" roughness={0.86} metalness={0.24} />;
    case 'hullPrimary':
    default:
      return <meshStandardMaterial color={baseColor} roughness={0.82} metalness={0.08} envMapIntensity={0.65} />;
  }
}

function slotKindFromSlot(slot: ModelSlot): SlotKind {
  if (slot === 'tracksLeft' || slot === 'tracksRight') return 'tracks';
  return slot === 'gun' ? 'gun' : slot;
}

export function EditorTankScene({
  spec,
  model,
  sceneRef,
  activeTab,
  showArmor,
  selectedEntity,
  onSelectEntity,
  onHoverPlate,
  registerNodeObject,
  registerPlateObject,
}: EditorTankSceneProps) {
  const trackMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({color: '#4b4d46', roughness: 0.84, metalness: 0.42}),
    [],
  );

  const renderSlotNodes = (slot: ModelSlot, nodes: ModelNode[]) => {
    const slotKind = slotKindFromSlot(slot);

    const renderNode = (node: ModelNode, path: JsonPath, generated: boolean): React.ReactNode => {
      const pathKey = pathToKey(path);

      const wrapNode = (child: React.ReactNode) => (
        <group
          key={pathKey}
          ref={generated ? undefined : (object) => registerNodeObject(pathKey, object)}
          position={node.position}
          rotation={node.rotation}
          scale={node.scale}
          visible={node.visible !== false}
          name={node.name ?? node.id}
          onClick={!generated && activeTab === 'model' ? (event) => {
            event.stopPropagation();
            onSelectEntity({kind: 'modelNode', slot, path: [...path]});
          } : undefined}
        >
          {child}
        </group>
      );

      switch (node.type) {
        case 'group':
          return wrapNode(node.children.map((childNode, index) => renderNode(childNode, [...path, 'children', index], generated)));
        case 'box':
          return wrapNode(
            <RoundedBox
              args={node.size}
              radius={getPlateEdgeRadius(node.size)}
              smoothness={1}
              bevelSegments={1}
              creaseAngle={0.35}
              castShadow
              receiveShadow
            >
              {resolveMaterial(slotKind, spec.appearance.baseColor, trackMaterial, node.materialRole)}
            </RoundedBox>,
          );
        case 'cylinder':
          return wrapNode(
            <Cylinder args={[node.radiusTop, node.radiusBottom, node.height, Math.max(16, node.radialSegments ?? 20)]} castShadow receiveShadow>
              {resolveMaterial(slotKind, spec.appearance.baseColor, trackMaterial, node.materialRole)}
            </Cylinder>,
          );
        case 'sphere':
          return wrapNode(
            <Sphere args={[node.radius, node.widthSegments ?? 32, node.heightSegments ?? 16]} castShadow receiveShadow>
              {resolveMaterial(slotKind, spec.appearance.baseColor, trackMaterial, node.materialRole)}
            </Sphere>,
          );
        case 'polyhedron':
          return wrapNode(
            <PolyhedronNodeMesh
              node={node}
              material={resolveMaterial(slotKind, spec.appearance.baseColor, trackMaterial, node.materialRole)}
            />,
          );
        case 'extrude':
          return wrapNode(
            <ExtrudedNodeMesh node={node} material={resolveMaterial(slotKind, spec.appearance.baseColor, trackMaterial, node.materialRole)} />,
          );
        case 'repeat':
          return wrapNode(
            Array.from({length: node.count}, (_value, index) => {
              const position: Vec3 = [node.step[0] * index, node.step[1] * index, node.step[2] * index];
              return (
                <group key={`${pathKey}:repeat:${index}`} position={position}>
                  {renderNode(node.child, [...path, 'child'], true)}
                </group>
              );
            }),
          );
        case 'mirror': {
          const mirroredScale: Vec3 = node.axis === 'x' ? [-1, 1, 1] : node.axis === 'y' ? [1, -1, 1] : [1, 1, -1];
          return wrapNode(
            <>
              {node.includeSource !== false ? renderNode(node.child, [...path, 'child'], true) : null}
              <group scale={mirroredScale}>{renderNode(node.child, [...path, 'child'], true)}</group>
            </>,
          );
        }
        case 'helper': {
          const context: ModelHelperRenderContext = {
            slot: slotKind,
            renderNode: (childNode, keyPrefix) => renderNode(childNode, [...path, keyPrefix ?? childNode.id], true),
            resolveMaterial: (role) => resolveMaterial(slotKind, spec.appearance.baseColor, trackMaterial, role),
          };

          return wrapNode(getTankModelHelper(node.helper).render(node.params, context));
        }
        default:
          return null;
      }
    };

    return nodes.map((node, index) => renderNode(node, ['slots', slot, index], false));
  };

  const hullPlates = spec.armorModel.plates.filter((plate) => plate.parent === 'hull');
  const turretPlates = spec.armorModel.plates.filter((plate) => plate.parent === 'turret');
  const gunPlates = spec.armorModel.plates.filter((plate) => plate.parent === 'gunGroup');
  const armorSelectable = activeTab === 'armor';

  return (
    <group ref={sceneRef}>
      <group>{renderSlotNodes('hull', model.slots.hull)}</group>
      <group>{renderSlotNodes('tracksLeft', model.slots.tracksLeft)}</group>
      <group>{renderSlotNodes('tracksRight', model.slots.tracksRight)}</group>

      {showArmor ? hullPlates.map((plate) => (
        <ArmorPlateMesh
          key={plate.id}
          plate={plate}
          selected={selectedEntity.kind === 'armorPlate' && selectedEntity.plateId === plate.id}
          selectable={armorSelectable}
          onSelectEntity={onSelectEntity}
          onHoverPlate={onHoverPlate}
          registerPlateObject={registerPlateObject}
        />
      )) : null}

      <group position={spec.mounts.turretOffset}>
        {renderSlotNodes('turret', model.slots.turret)}
        {showArmor ? turretPlates.map((plate) => (
          <ArmorPlateMesh
            key={plate.id}
            plate={plate}
            selected={selectedEntity.kind === 'armorPlate' && selectedEntity.plateId === plate.id}
            selectable={armorSelectable}
            onSelectEntity={onSelectEntity}
            onHoverPlate={onHoverPlate}
            registerPlateObject={registerPlateObject}
          />
        )) : null}

        <group position={spec.mounts.gunPivotOffset}>
          {renderSlotNodes('gun', model.slots.gun)}
          {showArmor ? gunPlates.map((plate) => (
            <ArmorPlateMesh
              key={plate.id}
              plate={plate}
              selected={selectedEntity.kind === 'armorPlate' && selectedEntity.plateId === plate.id}
              selectable={armorSelectable}
              onSelectEntity={onSelectEntity}
              onHoverPlate={onHoverPlate}
              registerPlateObject={registerPlateObject}
            />
          )) : null}
        </group>
      </group>
    </group>
  );
}
