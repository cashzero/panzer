import type { ModelNode } from '../tanks/core/types';
import type { FlattenedModelNode, JsonPath, ModelSlot } from './types';
import type { TankModelSpec } from '../tanks/core/types';

const SLOT_ORDER: ModelSlot[] = ['hull', 'tracksLeft', 'tracksRight', 'turret', 'gun'];

function cloneContainer<T>(value: T): T {
  if (Array.isArray(value)) return [...value] as T;
  return {...(value as Record<string, unknown>)} as T;
}

function updatePathValue<T>(current: T, path: JsonPath, updater: (value: unknown) => unknown): T {
  if (path.length === 0) return updater(current) as T;

  const [head, ...tail] = path;

  if (Array.isArray(current)) {
    const next = cloneContainer(current);
    next[head as number] = updatePathValue(next[head as number], tail, updater);
    return next;
  }

  const next = cloneContainer(current);
  next[head as keyof typeof next] = updatePathValue(next[head as keyof typeof next], tail, updater);
  return next;
}

export function pathToKey(path: JsonPath) {
  return path.join('.');
}

export function formatSlotLabel(slot: ModelSlot) {
  switch (slot) {
    case 'tracksLeft':
      return 'Tracks Left';
    case 'tracksRight':
      return 'Tracks Right';
    default:
      return slot.charAt(0).toUpperCase() + slot.slice(1);
  }
}

export function getSlotOrder() {
  return SLOT_ORDER;
}

export function getValueAtPath<T>(root: T, path: JsonPath) {
  let value: unknown = root;
  for (const segment of path) {
    if (value === null || value === undefined) return undefined;
    value = (value as Record<string, unknown>)[segment as keyof typeof value];
  }
  return value;
}

export function getNodeAtPath(model: TankModelSpec, path: JsonPath) {
  return getValueAtPath(model, path) as ModelNode | undefined;
}

export function updateNodeAtPath(model: TankModelSpec, path: JsonPath, updater: (node: ModelNode) => ModelNode) {
  return updatePathValue(model, path, (value) => updater(value as ModelNode));
}

export function randomNodeId(prefix: string) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function cloneNodeWithFreshIds(node: ModelNode): ModelNode {
  switch (node.type) {
    case 'group':
      return {
        ...structuredClone(node),
        id: randomNodeId('group'),
        children: node.children.map((child) => cloneNodeWithFreshIds(child)),
      };
    case 'repeat':
      return {
        ...structuredClone(node),
        id: randomNodeId('repeat'),
        child: cloneNodeWithFreshIds(node.child),
      };
    case 'mirror':
      return {
        ...structuredClone(node),
        id: randomNodeId('mirror'),
        child: cloneNodeWithFreshIds(node.child),
      };
    case 'helper':
      return {...structuredClone(node), id: randomNodeId('helper')};
    case 'extrude':
      return {...structuredClone(node), id: randomNodeId('extrude')};
    case 'cylinder':
      return {...structuredClone(node), id: randomNodeId('cylinder')};
    case 'sphere':
      return {...structuredClone(node), id: randomNodeId('sphere')};
    case 'polyhedron':
      return {...structuredClone(node), id: randomNodeId('polyhedron')};
    case 'box':
    default:
      return {...structuredClone(node), id: randomNodeId('box')};
  }
}

export function createDefaultModelNode(type: ModelNode['type'] = 'box'): ModelNode {
  switch (type) {
    case 'group':
      return {id: randomNodeId('group'), type: 'group', children: []};
    case 'cylinder':
      return {
        id: randomNodeId('cylinder'),
        type: 'cylinder',
        radiusTop: 0.2,
        radiusBottom: 0.2,
        height: 1,
        radialSegments: 12,
        materialRole: 'hullPrimary',
      };
    case 'sphere':
      return {
        id: randomNodeId('sphere'),
        type: 'sphere',
        radius: 0.5,
        widthSegments: 32,
        heightSegments: 16,
        materialRole: 'hullPrimary',
      };
    case 'polyhedron':
      return {
        id: randomNodeId('polyhedron'),
        type: 'polyhedron',
        vertices: [
          [-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5],
          [-0.4, 0.8, -0.4], [0.4, 0.8, -0.4], [0.4, 0.8, 0.4], [-0.4, 0.8, 0.4],
        ],
        faces: [
          [0, 1, 2], [0, 2, 3], [4, 6, 5], [4, 7, 6],
          [0, 5, 1], [0, 4, 5], [1, 6, 2], [1, 5, 6],
          [2, 7, 3], [2, 6, 7], [3, 4, 0], [3, 7, 4],
        ],
        materialRole: 'hullPrimary',
      };
    case 'extrude':
      return {
        id: randomNodeId('extrude'),
        type: 'extrude',
        shape: {
          outline: [
            [-0.5, -0.5],
            [0.5, -0.5],
            [0.5, 0.5],
            [-0.5, 0.5],
          ],
        },
        depth: 0.15,
        bevelEnabled: false,
        materialRole: 'hullPrimary',
      };
    case 'repeat':
      return {
        id: randomNodeId('repeat'),
        type: 'repeat',
        count: 3,
        step: [0, 0, 1],
        child: createDefaultModelNode('box'),
      };
    case 'mirror':
      return {
        id: randomNodeId('mirror'),
        type: 'mirror',
        axis: 'x',
        includeSource: true,
        child: createDefaultModelNode('box'),
      };
    case 'helper':
      return {
        id: randomNodeId('helper'),
        type: 'helper',
        helper: 'tracks.stadium_belt',
        params: {
          centerY: 0.35,
          radius: 0.3,
          halfLength: 3,
          band: 0.04,
          depth: 0.7,
          arcSegments: 16,
          materialRole: 'track',
        },
      };
    case 'box':
    default:
      return {
        id: randomNodeId('box'),
        type: 'box',
        size: [1, 1, 1],
        materialRole: 'hullPrimary',
      };
  }
}

export function addTopLevelNode(model: TankModelSpec, slot: ModelSlot, type: ModelNode['type']) {
  return updatePathValue(model, ['slots', slot], (value) => [
    ...((value as ModelNode[]) ?? []),
    createDefaultModelNode(type),
  ]);
}

export function addChildNode(model: TankModelSpec, path: JsonPath, type: ModelNode['type']) {
  const node = getNodeAtPath(model, path);
  if (!node || node.type !== 'group') return model;

  return updatePathValue(model, [...path, 'children'], (value) => [
    ...((value as ModelNode[]) ?? []),
    createDefaultModelNode(type),
  ]);
}

export function canDeleteNode(path: JsonPath) {
  return typeof path[path.length - 1] === 'number';
}

export function deleteNode(model: TankModelSpec, path: JsonPath) {
  const target = path[path.length - 1];
  if (typeof target !== 'number') return model;

  const containerPath = path.slice(0, -1);
  return updatePathValue(model, containerPath, (value) => {
    const next = [...(value as ModelNode[])];
    next.splice(target, 1);
    return next;
  });
}

export function duplicateNode(model: TankModelSpec, path: JsonPath) {
  const target = path[path.length - 1];
  if (typeof target !== 'number') return model;

  const containerPath = path.slice(0, -1);
  const node = getNodeAtPath(model, path);
  if (!node) return model;

  const clonedNode = cloneNodeWithFreshIds(node);
  return updatePathValue(model, containerPath, (value) => {
    const next = [...(value as ModelNode[])];
    next.splice(target + 1, 0, clonedNode);
    return next;
  });
}

export function flattenModelNodes(model: TankModelSpec) {
  const nodes: FlattenedModelNode[] = [];

  const visitNode = (
    slot: ModelSlot,
    node: ModelNode,
    path: JsonPath,
    depth: number,
    parentType: FlattenedModelNode['parentType'],
  ) => {
    nodes.push({slot, node, path, depth, parentType});

    if (node.type === 'group') {
      node.children.forEach((child, index) => {
        visitNode(slot, child, [...path, 'children', index], depth + 1, 'group');
      });
    }

    if (node.type === 'repeat' || node.type === 'mirror') {
      visitNode(slot, node.child, [...path, 'child'], depth + 1, node.type);
    }
  };

  SLOT_ORDER.forEach((slot) => {
    model.slots[slot].forEach((node, index) => {
      visitNode(slot, node, ['slots', slot, index], 0, 'root');
    });
  });

  return nodes;
}

export function getFirstNodePathForSlot(model: TankModelSpec, slot: ModelSlot) {
  const flattened = flattenModelNodes(model).find((entry) => entry.slot === slot);
  return flattened?.path ?? null;
}
