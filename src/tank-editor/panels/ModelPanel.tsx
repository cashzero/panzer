import { useMemo, useState } from 'react';
import { getTankModelHelperIds } from '../../tanks/core/helpers';
import type { ModelNode, TankModelSpec } from '../../tanks/core/types';
import { CheckboxField, FieldGrid, JsonField, NumberField, PanelSection, SelectField, TextField, Vec3Field } from '../controls';
import { addChildNode, addTopLevelNode, canDeleteNode, createDefaultModelNode, deleteNode, flattenModelNodes, formatSlotLabel, getNodeAtPath, getSlotOrder, pathToKey, updateNodeAtPath } from '../modelTree';
import type { JsonPath, ModelSlot } from '../types';

const NODE_TYPE_OPTIONS = [
  {value: 'group', label: 'Group'},
  {value: 'box', label: 'Box'},
  {value: 'cylinder', label: 'Cylinder'},
  {value: 'extrude', label: 'Extrude'},
  {value: 'repeat', label: 'Repeat'},
  {value: 'mirror', label: 'Mirror'},
  {value: 'helper', label: 'Helper'},
] as const;

function replaceNodeType(node: ModelNode, type: ModelNode['type']): ModelNode {
  const replacement = createDefaultModelNode(type);
  return {
    ...replacement,
    id: node.id,
    name: node.name,
    position: node.position,
    rotation: node.rotation,
    scale: node.scale,
    visible: node.visible,
    materialRole: node.materialRole,
  };
}

export function ModelPanel({
  model,
  selectedSlot,
  onSelectSlot,
  selectedNodePath,
  onSelectNodePath,
  onChange,
}: {
  model: TankModelSpec;
  selectedSlot: ModelSlot;
  onSelectSlot: (slot: ModelSlot) => void;
  selectedNodePath: JsonPath | null;
  onSelectNodePath: (path: JsonPath | null) => void;
  onChange: (next: TankModelSpec) => void;
}) {
  const [newNodeType, setNewNodeType] = useState<ModelNode['type']>('box');
  const [childNodeType, setChildNodeType] = useState<ModelNode['type']>('box');
  const helperIds = useMemo(() => getTankModelHelperIds().map((helper) => ({value: helper, label: helper})), []);
  const flattenedNodes = useMemo(
    () => flattenModelNodes(model).filter((entry) => entry.slot === selectedSlot),
    [model, selectedSlot],
  );
  const selectedNode = selectedNodePath ? getNodeAtPath(model, selectedNodePath) : undefined;

  const updateSelectedNode = (mutate: (node: ModelNode) => ModelNode) => {
    if (!selectedNodePath) return;
    onChange(updateNodeAtPath(model, selectedNodePath, mutate));
  };

  return (
    <div className="grid xl:grid-cols-[20rem_minmax(0,1fr)] gap-4">
      <PanelSection title="Node Tree" subtitle="Slots stay separate so hull, tracks, turret, and gun can be previewed with the same runtime renderer.">
        <div className="flex flex-wrap gap-2">
          {getSlotOrder().map((slot) => (
            <button
              key={slot}
              type="button"
              className={`editor-button ${slot === selectedSlot ? 'editor-button--primary' : ''}`}
              onClick={() => onSelectSlot(slot)}
            >
              {formatSlotLabel(slot)}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-40 flex-1">
            <SelectField label="Top-Level Node" value={newNodeType} options={[...NODE_TYPE_OPTIONS]} onChange={(value) => setNewNodeType(value)} />
          </div>
          <button
            className="editor-button editor-button--primary"
            type="button"
            onClick={() => onChange(addTopLevelNode(model, selectedSlot, newNodeType))}
          >
            Add To Slot
          </button>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-40 flex-1">
            <SelectField label="Child Node" value={childNodeType} options={[...NODE_TYPE_OPTIONS]} onChange={(value) => setChildNodeType(value)} />
          </div>
          <button
            className="editor-button"
            type="button"
            disabled={!selectedNode || selectedNode.type !== 'group'}
            onClick={() => {
              if (!selectedNodePath) return;
              onChange(addChildNode(model, selectedNodePath, childNodeType));
            }}
          >
            Add Child
          </button>
          <button
            className="editor-button editor-button--danger"
            type="button"
            disabled={!selectedNodePath || !canDeleteNode(selectedNodePath)}
            onClick={() => {
              if (!selectedNodePath) return;
              onChange(deleteNode(model, selectedNodePath));
              onSelectNodePath(null);
            }}
          >
            Delete
          </button>
        </div>

        <div className="flex flex-col gap-2 max-h-[38rem] overflow-auto editor-scrollbar pr-1">
          {flattenedNodes.map((entry) => {
            const isActive = selectedNodePath ? pathToKey(selectedNodePath) === pathToKey(entry.path) : false;
            return (
              <button
                key={pathToKey(entry.path)}
                type="button"
                className={`text-left editor-panel-inset px-3 py-2 ${isActive ? 'border-[var(--editor-border-strong)] bg-[rgba(86,95,63,0.24)]' : ''}`}
                style={{paddingLeft: `${0.75 + entry.depth * 1.1}rem`}}
                onClick={() => onSelectNodePath(entry.path)}
              >
                <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--editor-muted)]">{entry.parentType}</div>
                <div className="text-sm text-[var(--editor-text)] mt-1 break-all">{entry.node.id}</div>
                <div className="text-[11px] text-[var(--editor-brass)] mt-1">{entry.node.type}</div>
              </button>
            );
          })}
        </div>
      </PanelSection>

      <PanelSection title="Node Inspector" subtitle="Transforms stay in local coordinates. Nested repeat and mirror children are edited from the same tree.">
        {selectedNode ? (
          <div className="flex flex-col gap-4">
            <FieldGrid>
              <TextField label="Node ID" value={selectedNode.id} onChange={(value) => updateSelectedNode((node) => ({...node, id: value}))} />
              <TextField label="Name" value={selectedNode.name ?? ''} onChange={(value) => updateSelectedNode((node) => ({...node, name: value || undefined}))} />
              <SelectField
                label="Type"
                value={selectedNode.type}
                options={[...NODE_TYPE_OPTIONS]}
                onChange={(value) => updateSelectedNode((node) => replaceNodeType(node, value))}
              />
              <TextField label="Material Role" value={selectedNode.materialRole ?? ''} onChange={(value) => updateSelectedNode((node) => ({...node, materialRole: value || undefined}))} />
            </FieldGrid>

            <CheckboxField
              label="Visible"
              checked={selectedNode.visible !== false}
              onChange={(value) => updateSelectedNode((node) => ({...node, visible: value ? undefined : false}))}
              hint="Unchecked stores visible=false; checked removes the override and uses the default visible state."
            />

            <FieldGrid>
              <Vec3Field label="Position" value={selectedNode.position ?? [0, 0, 0]} onChange={(value) => updateSelectedNode((node) => ({...node, position: value}))} />
              <Vec3Field label="Rotation" value={selectedNode.rotation ?? [0, 0, 0]} onChange={(value) => updateSelectedNode((node) => ({...node, rotation: value}))} />
            </FieldGrid>
            <Vec3Field label="Scale" value={selectedNode.scale ?? [1, 1, 1]} onChange={(value) => updateSelectedNode((node) => ({...node, scale: value}))} />

            {selectedNode.type === 'box' ? (
              <Vec3Field label="Size" value={selectedNode.size} onChange={(value) => updateSelectedNode((node) => ({...(node as Extract<ModelNode, {type: 'box'}>), size: value}))} />
            ) : null}

            {selectedNode.type === 'cylinder' ? (
              <FieldGrid columns={3}>
                <NumberField label="Radius Top" step={0.01} value={selectedNode.radiusTop} onChange={(value) => updateSelectedNode((node) => ({...(node as Extract<ModelNode, {type: 'cylinder'}>), radiusTop: value}))} />
                <NumberField label="Radius Bottom" step={0.01} value={selectedNode.radiusBottom} onChange={(value) => updateSelectedNode((node) => ({...(node as Extract<ModelNode, {type: 'cylinder'}>), radiusBottom: value}))} />
                <NumberField label="Height" step={0.01} value={selectedNode.height} onChange={(value) => updateSelectedNode((node) => ({...(node as Extract<ModelNode, {type: 'cylinder'}>), height: value}))} />
                <NumberField label="Radial Segments" value={selectedNode.radialSegments ?? 12} onChange={(value) => updateSelectedNode((node) => ({...(node as Extract<ModelNode, {type: 'cylinder'}>), radialSegments: value}))} />
              </FieldGrid>
            ) : null}

            {selectedNode.type === 'extrude' ? (
              <>
                <FieldGrid>
                  <NumberField label="Depth" step={0.01} value={selectedNode.depth} onChange={(value) => updateSelectedNode((node) => ({...(node as Extract<ModelNode, {type: 'extrude'}>), depth: value}))} />
                  <CheckboxField label="Bevel Enabled" checked={Boolean(selectedNode.bevelEnabled)} onChange={(value) => updateSelectedNode((node) => ({...(node as Extract<ModelNode, {type: 'extrude'}>), bevelEnabled: value}))} />
                </FieldGrid>
                <JsonField label="Shape" value={selectedNode.shape} onCommit={(value) => updateSelectedNode((node) => ({...(node as Extract<ModelNode, {type: 'extrude'}>), shape: value as Extract<ModelNode, {type: 'extrude'}>['shape']}))} rows={10} />
              </>
            ) : null}

            {selectedNode.type === 'repeat' ? (
              <FieldGrid>
                <NumberField label="Count" min={1} value={selectedNode.count} onChange={(value) => updateSelectedNode((node) => ({...(node as Extract<ModelNode, {type: 'repeat'}>), count: Math.max(1, Math.round(value))}))} />
                <Vec3Field label="Step" value={selectedNode.step} onChange={(value) => updateSelectedNode((node) => ({...(node as Extract<ModelNode, {type: 'repeat'}>), step: value}))} />
              </FieldGrid>
            ) : null}

            {selectedNode.type === 'mirror' ? (
              <FieldGrid>
                <SelectField
                  label="Axis"
                  value={selectedNode.axis}
                  options={[
                    {value: 'x', label: 'X'},
                    {value: 'y', label: 'Y'},
                    {value: 'z', label: 'Z'},
                  ]}
                  onChange={(value) => updateSelectedNode((node) => ({...(node as Extract<ModelNode, {type: 'mirror'}>), axis: value}))}
                />
                <CheckboxField label="Include Source" checked={selectedNode.includeSource !== false} onChange={(value) => updateSelectedNode((node) => ({...(node as Extract<ModelNode, {type: 'mirror'}>), includeSource: value}))} />
              </FieldGrid>
            ) : null}

            {selectedNode.type === 'helper' ? (
              <>
                <SelectField label="Helper" value={selectedNode.helper} options={helperIds} onChange={(value) => updateSelectedNode((node) => ({...(node as Extract<ModelNode, {type: 'helper'}>), helper: value}))} />
                <JsonField label="Helper Params" value={selectedNode.params} onCommit={(value) => updateSelectedNode((node) => ({...(node as Extract<ModelNode, {type: 'helper'}>), params: value as Record<string, unknown>}))} rows={12} />
              </>
            ) : null}
          </div>
        ) : (
          <div className="editor-panel-inset px-4 py-6 text-sm text-[var(--editor-muted)]">Select a node from the active slot to inspect or edit it.</div>
        )}
      </PanelSection>
    </div>
  );
}
