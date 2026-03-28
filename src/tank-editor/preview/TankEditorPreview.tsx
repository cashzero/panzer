import { OrbitControls, TransformControls } from '@react-three/drei';
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { ModelNode, TankArmorPlateSpec, TankModelSpec, TankSpec } from '../../tanks/core/types';
import { getNodeAtPath, pathToKey } from '../modelTree';
import type { EditorMode, EditorSelection, EditorTab, JsonPath } from '../types';
import { EditorTankScene } from './EditorTankScene';

interface PlateHoverInfo {
  id: string;
  name: string;
  zone: string;
  armorThickness: number;
  slopeAngleDeg: number;
  mouseX: number;
  mouseY: number;
}

interface BoundsSummary {
  center: THREE.Vector3;
  size: THREE.Vector3;
  radius: number;
  minY: number;
}

function normalizeVec3(vector: THREE.Vector3): [number, number, number] {
  return [vector.x, vector.y, vector.z];
}

function normalizeEuler(euler: THREE.Euler): [number, number, number] {
  return [euler.x, euler.y, euler.z];
}

function AutoRotateController({sceneRef, enabled}: {sceneRef: React.RefObject<THREE.Group | null>; enabled: boolean}) {
  useFrame((_, delta) => {
    if (enabled && sceneRef.current) {
      sceneRef.current.rotation.y += delta * 0.28;
    }
  });

  return null;
}

function FitCameraController({
  sceneRef,
  controlsRef,
  fitKey,
  onBoundsChange,
}: {
  sceneRef: React.RefObject<THREE.Group | null>;
  controlsRef: React.RefObject<any>;
  fitKey: string;
  onBoundsChange: (bounds: BoundsSummary | null) => void;
}) {
  const {camera, size} = useThree();

  useEffect(() => {
    const group = sceneRef.current;
    if (!group) {
      onBoundsChange(null);
      return;
    }

    group.updateWorldMatrix(true, true);

    const box = new THREE.Box3().setFromObject(group);
    if (box.isEmpty()) {
      onBoundsChange(null);
      return;
    }

    const center = new THREE.Vector3();
    const boxSize = new THREE.Vector3();
    const sphere = new THREE.Sphere();
    box.getCenter(center);
    box.getSize(boxSize);
    box.getBoundingSphere(sphere);

    const radius = Math.max(sphere.radius, 1.5);
    const verticalFov = THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * Math.max(size.width / Math.max(size.height, 1), 1));
    const fitHeightDistance = radius / Math.tan(verticalFov / 2);
    const fitWidthDistance = radius / Math.tan(horizontalFov / 2);
    const distance = Math.max(fitHeightDistance, fitWidthDistance) * 0.95;

    const target = center.clone();
    target.y -= boxSize.y * 0.04;

    const direction = new THREE.Vector3(1.24, 0.3, 1.16).normalize();
    const position = target.clone().add(direction.multiplyScalar(distance));

    camera.position.copy(position);
    camera.near = Math.max(0.1, radius / 40);
    camera.far = Math.max(100, distance * 8);
    camera.updateProjectionMatrix();
    camera.lookAt(target);

    if (controlsRef.current) {
      controlsRef.current.target.copy(target);
      controlsRef.current.update();
    }

    onBoundsChange({
      center,
      size: boxSize,
      radius,
      minY: box.min.y,
    });
  }, [camera, controlsRef, fitKey, onBoundsChange, sceneRef, size.height, size.width]);

  return null;
}

function SelectionBoundsOverlay({object, color}: {object: THREE.Object3D | null; color: string}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const box = useMemo(() => new THREE.Box3(), []);
  const center = useMemo(() => new THREE.Vector3(), []);
  const size = useMemo(() => new THREE.Vector3(), []);

  useFrame(() => {
    const mesh = meshRef.current;
    if (!mesh || !object) {
      if (mesh) mesh.visible = false;
      return;
    }

    box.setFromObject(object);
    if (box.isEmpty()) {
      mesh.visible = false;
      return;
    }

    box.getCenter(center);
    box.getSize(size);
    mesh.visible = true;
    mesh.position.copy(center);
    mesh.scale.set(Math.max(size.x, 0.001), Math.max(size.y, 0.001), Math.max(size.z, 0.001));
  });

  return (
    <mesh ref={meshRef} visible={false} renderOrder={4}>
      <boxGeometry args={[1, 1, 1]} />
      <meshBasicMaterial wireframe={true} transparent opacity={0.95} depthWrite={false} color={color} />
    </mesh>
  );
}

function selectedSummary(selection: EditorSelection, spec: TankSpec, model: TankModelSpec) {
  if (selection.kind === 'armorPlate') {
    const plate = spec.armorModel.plates.find((entry) => entry.id === selection.plateId);
    return plate ? `${plate.id} (${plate.zone})` : selection.plateId;
  }

  if (selection.kind === 'modelNode') {
    const node = getNodeAtPath(model, selection.path);
    return node ? `${node.id} [${selection.slot}]` : pathToKey(selection.path);
  }

  return 'None';
}

export function TankEditorPreview({
  spec,
  model,
  activeTab,
  onChangeActiveTab,
  selectedEntity,
  onSelectEntity,
  editorMode,
  onChangeEditorMode,
  showArmor,
  onToggleArmor,
  showNodeBounds,
  onToggleShowNodeBounds,
  autoRotate,
  onToggleAutoRotate,
  onUpdateArmorPlate,
  onUpdateModelNode,
  onDeleteSelection,
  onDuplicateSelection,
}: {
  spec: TankSpec | null;
  model: TankModelSpec | null;
  activeTab: EditorTab;
  onChangeActiveTab: (tab: EditorTab) => void;
  selectedEntity: EditorSelection;
  onSelectEntity: (selection: EditorSelection) => void;
  editorMode: EditorMode;
  onChangeEditorMode: (mode: EditorMode) => void;
  showArmor: boolean;
  onToggleArmor: (value: boolean) => void;
  showNodeBounds: boolean;
  onToggleShowNodeBounds: (value: boolean) => void;
  autoRotate: boolean;
  onToggleAutoRotate: (value: boolean) => void;
  onUpdateArmorPlate: (plateId: string, mutate: (plate: TankArmorPlateSpec) => void) => void;
  onUpdateModelNode: (path: JsonPath, updater: (node: ModelNode) => ModelNode) => void;
  onDeleteSelection: () => void;
  onDuplicateSelection: () => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Group>(null);
  const controlsRef = useRef<any>(null);
  const nodeObjectsRef = useRef(new Map<string, THREE.Object3D>());
  const plateObjectsRef = useRef(new Map<string, THREE.Object3D>());
  const resizeSessionRef = useRef<{plateId: string; baseHalfExtents: [number, number, number]} | null>(null);
  const [hoveredPlate, setHoveredPlate] = useState<PlateHoverInfo | null>(null);
  const [bounds, setBounds] = useState<BoundsSummary | null>(null);
  const [selectedObject, setSelectedObject] = useState<THREE.Object3D | null>(null);
  const [resetCount, setResetCount] = useState(0);

  const registerNodeObject = useCallback((pathKey: string, object: THREE.Object3D | null) => {
    if (object) nodeObjectsRef.current.set(pathKey, object);
    else nodeObjectsRef.current.delete(pathKey);
  }, []);

  const registerPlateObject = useCallback((plateId: string, object: THREE.Object3D | null) => {
    if (object) plateObjectsRef.current.set(plateId, object);
    else plateObjectsRef.current.delete(plateId);
  }, []);

  const handleHover = useCallback((info: PlateHoverInfo | null, event?: ThreeEvent<PointerEvent>) => {
    if (!info) {
      setHoveredPlate(null);
      return;
    }

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || !event) return;

    setHoveredPlate({
      ...info,
      mouseX: event.nativeEvent.clientX - rect.left,
      mouseY: event.nativeEvent.clientY - rect.top,
    });
  }, []);

  useEffect(() => {
    if (!spec || !model) {
      setSelectedObject(null);
      return;
    }

    if (selectedEntity.kind === 'modelNode') {
      setSelectedObject(nodeObjectsRef.current.get(pathToKey(selectedEntity.path)) ?? null);
      return;
    }

    if (selectedEntity.kind === 'armorPlate') {
      setSelectedObject(plateObjectsRef.current.get(selectedEntity.plateId) ?? null);
      return;
    }

    setSelectedObject(null);
  }, [model, selectedEntity, spec]);

  const modeButtons = useMemo(() => {
    if (activeTab === 'armor') {
      return [
        {value: 'select' as const, label: 'Select'},
        {value: 'move' as const, label: 'Move'},
        {value: 'rotate' as const, label: 'Rotate'},
        {value: 'resize' as const, label: 'Size'},
      ];
    }

    if (activeTab === 'model') {
        return [
          {value: 'select' as const, label: 'Select'},
          {value: 'move' as const, label: 'Move'},
          {value: 'rotate' as const, label: 'Rotate'},
          {value: 'scale' as const, label: 'Size'},
        ];
      }

    return [{value: 'select' as const, label: 'Select'}];
  }, [activeTab]);

  const tabButtons = useMemo(
    () => [
      {value: 'specs' as const, label: 'Specs'},
      {value: 'armor' as const, label: 'Armor'},
      {value: 'model' as const, label: 'Model'},
    ],
    [],
  );

  const transformEnabled = useMemo(() => {
    if (activeTab === 'armor' && selectedEntity.kind === 'armorPlate') {
      return editorMode === 'move' || editorMode === 'rotate' || editorMode === 'resize';
    }

    if (activeTab === 'model' && selectedEntity.kind === 'modelNode') {
      return editorMode === 'move' || editorMode === 'rotate' || editorMode === 'scale';
    }

    return false;
  }, [activeTab, editorMode, selectedEntity]);

  const transformMode = editorMode === 'rotate' ? 'rotate' : editorMode === 'move' ? 'translate' : 'scale';
  const hasSelection = selectedEntity.kind !== 'none';

  const handleTransformObjectChange = useCallback(() => {
    if (!selectedObject) return;

    if (selectedEntity.kind === 'modelNode') {
      if (editorMode === 'move') {
        onUpdateModelNode(selectedEntity.path, (node) => ({...node, position: normalizeVec3(selectedObject.position)}));
      } else if (editorMode === 'rotate') {
        onUpdateModelNode(selectedEntity.path, (node) => ({...node, rotation: normalizeEuler(selectedObject.rotation)}));
      } else if (editorMode === 'scale') {
        onUpdateModelNode(selectedEntity.path, (node) => ({...node, scale: normalizeVec3(selectedObject.scale)}));
      }
      return;
    }

    if (selectedEntity.kind === 'armorPlate' && editorMode !== 'resize') {
      onUpdateArmorPlate(selectedEntity.plateId, (plate) => {
        if (editorMode === 'move') plate.position = normalizeVec3(selectedObject.position);
        if (editorMode === 'rotate') plate.rotation = normalizeEuler(selectedObject.rotation);
      });
    }
  }, [editorMode, onUpdateArmorPlate, onUpdateModelNode, selectedEntity, selectedObject]);

  const handleTransformMouseDown = useCallback(() => {
    if (controlsRef.current) controlsRef.current.enabled = false;

    if (!spec || selectedEntity.kind !== 'armorPlate' || editorMode !== 'resize') return;
    const plate = spec.armorModel.plates.find((entry) => entry.id === selectedEntity.plateId);
    if (!plate) return;

    resizeSessionRef.current = {
      plateId: plate.id,
      baseHalfExtents: [...plate.halfExtents] as [number, number, number],
    };
  }, [editorMode, selectedEntity, spec]);

  const handleTransformMouseUp = useCallback(() => {
    if (controlsRef.current) controlsRef.current.enabled = true;

    if (!selectedObject || !resizeSessionRef.current || editorMode !== 'resize') return;

    const session = resizeSessionRef.current;
    resizeSessionRef.current = null;

    const nextHalfExtents: [number, number, number] = [
      Math.max(0.02, session.baseHalfExtents[0] * Math.abs(selectedObject.scale.x)),
      Math.max(0.02, session.baseHalfExtents[1] * Math.abs(selectedObject.scale.y)),
      Math.max(0.02, session.baseHalfExtents[2] * Math.abs(selectedObject.scale.z)),
    ];

    selectedObject.scale.set(1, 1, 1);

    onUpdateArmorPlate(session.plateId, (plate) => {
      plate.halfExtents = nextHalfExtents;
    });
  }, [editorMode, onUpdateArmorPlate, selectedObject]);

  return (
    <section className="editor-panel p-4 md:p-5 flex flex-col gap-4" ref={containerRef}>
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-3">
        <div>
          <h2 className="text-sm uppercase tracking-[0.24em] text-[var(--editor-brass)]">Live Preview</h2>
          <p className="text-xs text-[var(--editor-muted)] mt-1">Switch tabs here so the scene mode and the inspector stay in sync.</p>
        </div>

        <div className="flex flex-col items-stretch gap-3 xl:items-end">
          <div className="flex flex-wrap items-center gap-2">
            {tabButtons.map((button) => (
              <button
                key={button.value}
                type="button"
                className={`editor-button px-3 py-2 ${activeTab === button.value ? 'editor-button--primary' : ''}`}
                onClick={() => onChangeActiveTab(button.value)}
              >
                {button.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 text-[11px] uppercase tracking-[0.16em] text-[var(--editor-muted)]">
          {modeButtons.map((button) => (
            <button
              key={button.value}
              className={`editor-button px-3 py-2 ${editorMode === button.value ? 'editor-button--primary' : ''}`}
              type="button"
              onClick={() => onChangeEditorMode(button.value)}
            >
              {button.label}
            </button>
          ))}
          <button className="editor-button px-3 py-2" type="button" onClick={onDuplicateSelection} disabled={!hasSelection}>
            Duplicate
          </button>
          <button className="editor-button editor-button--danger px-3 py-2" type="button" onClick={onDeleteSelection} disabled={!hasSelection}>
            Delete
          </button>
          <button className="editor-button px-3 py-2" type="button" onClick={() => setResetCount((value) => value + 1)}>
            Reset View
          </button>
          <label className="flex items-center gap-2 px-1">
            <input type="checkbox" checked={showArmor} onChange={(event) => onToggleArmor(event.currentTarget.checked)} />
            Armor
          </label>
          <label className="flex items-center gap-2 px-1">
            <input type="checkbox" checked={showNodeBounds} onChange={(event) => onToggleShowNodeBounds(event.currentTarget.checked)} />
            Nodes
          </label>
          <label className="flex items-center gap-2 px-1">
            <input type="checkbox" checked={autoRotate} onChange={(event) => onToggleAutoRotate(event.currentTarget.checked)} />
            Rotate
          </label>
          </div>
        </div>
      </div>

      <div className="tank-editor-preview-viewport relative h-[34rem] md:h-[42rem] editor-panel-inset overflow-hidden">
        {spec && model ? (
          <Canvas
            className="tank-editor-preview-canvas"
            camera={{position: [8, 5, 8], fov: 38}}
            gl={{antialias: true}}
            style={{width: '100%', height: '100%', display: 'block'}}
            onPointerMissed={() => onSelectEntity({kind: 'none'})}
          >
            <ambientLight intensity={0.55} />
            <directionalLight position={[10, 12, 6]} intensity={1.15} />
            <directionalLight position={[-8, 4, -6]} intensity={0.35} />
            <fog attach="fog" args={['#0e110e', 14, 34]} />

            <FitCameraController
              sceneRef={sceneRef}
              controlsRef={controlsRef}
              fitKey={`${spec.id}:${resetCount}:${spec.armorModel.plates.length}:${activeTab}:${showArmor ? 'armor' : 'plain'}`}
              onBoundsChange={setBounds}
            />

            <AutoRotateController sceneRef={sceneRef} enabled={autoRotate} />

            <EditorTankScene
              spec={spec}
              model={model}
              sceneRef={sceneRef}
              activeTab={activeTab}
              showArmor={showArmor}
              selectedEntity={selectedEntity}
              onSelectEntity={onSelectEntity}
              onHoverPlate={handleHover}
              registerNodeObject={registerNodeObject}
              registerPlateObject={registerPlateObject}
            />

            {showNodeBounds && selectedEntity.kind === 'modelNode' ? (
              <SelectionBoundsOverlay object={selectedObject} color="#d7b56b" />
            ) : null}

            {transformEnabled && selectedObject ? (
              <TransformControls
                object={selectedObject}
                mode={transformMode}
                onObjectChange={handleTransformObjectChange}
                onMouseDown={handleTransformMouseDown}
                onMouseUp={handleTransformMouseUp}
              />
            ) : null}

            <OrbitControls
              ref={controlsRef}
              enablePan={false}
              enableZoom={true}
              maxDistance={bounds ? bounds.radius * 6 : 14}
              minDistance={bounds ? Math.max(2, bounds.radius * 1.2) : 5}
            />

            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[
                bounds?.center.x ?? 0,
                bounds ? bounds.minY - 0.12 : -0.12,
                bounds?.center.z ?? 0,
              ]}
              receiveShadow
            >
              <planeGeometry args={[
                bounds ? Math.max(12, bounds.radius * 5) : 36,
                bounds ? Math.max(12, bounds.radius * 5) : 36,
              ]} />
              <meshStandardMaterial color="#272b24" roughness={1} />
            </mesh>
          </Canvas>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-8 text-center text-sm text-[var(--editor-muted)]">
            Pick a tank folder to start previewing.
          </div>
        )}

        {hoveredPlate ? (
          <div
            className="absolute pointer-events-none z-10"
            style={{left: hoveredPlate.mouseX, top: hoveredPlate.mouseY, transform: 'translate(12px, -50%)'}}
          >
            <div className="editor-panel-inset px-3 py-2 min-w-44">
              <div className="text-[10px] uppercase tracking-[0.2em] text-[var(--editor-olive)]">{hoveredPlate.zone}</div>
              <div className="text-sm font-bold text-[var(--editor-brass)] mt-1">{hoveredPlate.name}</div>
              <div className="text-xs text-[var(--editor-text)] mt-2">{hoveredPlate.armorThickness} mm</div>
              {hoveredPlate.slopeAngleDeg > 0 ? (
                <div className="text-[11px] text-[var(--editor-muted)] mt-1">Slope {hoveredPlate.slopeAngleDeg} deg</div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid md:grid-cols-3 gap-3 text-[11px] uppercase tracking-[0.16em] text-[var(--editor-muted)]">
        <div className="editor-panel-inset px-3 py-2">Plates: {spec?.armorModel.plates.length ?? 0}</div>
        <div className="editor-panel-inset px-3 py-2">Nodes: {model ? Object.keys(model.slots).reduce((count, slotName) => count + model.slots[slotName as keyof TankModelSpec['slots']].length, 0) : 0}</div>
        <div className="editor-panel-inset px-3 py-2 break-all">Selected: {spec && model ? selectedSummary(selectedEntity, spec, model) : 'None'}</div>
      </div>
    </section>
  );
}
