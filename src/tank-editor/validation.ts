import type { ModelNode, TankModelSpec, TankSpec } from '../tanks/core/types';
import { flattenModelNodes } from './modelTree';
import type { JsonPath, ValidationIssue } from './types';

function pushIssue(issues: ValidationIssue[], severity: ValidationIssue['severity'], scope: ValidationIssue['scope'], message: string) {
  issues.push({severity, scope, message});
}

function hasNonPositive(values: number[]) {
  return values.some((value) => !Number.isFinite(value) || value <= 0);
}

function parentContainerKey(path: JsonPath) {
  return path.slice(0, -1).join('.');
}

function validateNode(node: ModelNode, path: JsonPath, issues: ValidationIssue[]) {
  const pathLabel = path.join('.');

  if (node.position && node.position.some((value) => !Number.isFinite(value))) {
    pushIssue(issues, 'error', 'model', `Node '${node.id}' at ${pathLabel} has an invalid position.`);
  }

  if (node.rotation && node.rotation.some((value) => !Number.isFinite(value))) {
    pushIssue(issues, 'error', 'model', `Node '${node.id}' at ${pathLabel} has an invalid rotation.`);
  }

  if (node.scale && hasNonPositive([...node.scale])) {
    pushIssue(issues, 'error', 'model', `Node '${node.id}' at ${pathLabel} has a non-positive scale.`);
  }

  switch (node.type) {
    case 'box':
      if (hasNonPositive([...node.size])) {
        pushIssue(issues, 'error', 'model', `Box node '${node.id}' must have positive size values.`);
      }
      return;
    case 'cylinder':
      if (!Number.isFinite(node.radiusTop) || node.radiusTop <= 0 || !Number.isFinite(node.radiusBottom) || node.radiusBottom <= 0 || !Number.isFinite(node.height) || node.height <= 0) {
        pushIssue(issues, 'error', 'model', `Cylinder node '${node.id}' must have positive radii and height.`);
      }
      return;
    case 'extrude':
      if (!Number.isFinite(node.depth) || node.depth <= 0) {
        pushIssue(issues, 'error', 'model', `Extrude node '${node.id}' must have positive depth.`);
      }
      if (node.shape.outline.length < 3) {
        pushIssue(issues, 'error', 'model', `Extrude node '${node.id}' needs at least three outline points.`);
      }
      return;
    case 'repeat':
      if (!Number.isFinite(node.count) || node.count < 1) {
        pushIssue(issues, 'error', 'model', `Repeat node '${node.id}' must have count >= 1.`);
      }
      if (node.step.some((value) => !Number.isFinite(value))) {
        pushIssue(issues, 'error', 'model', `Repeat node '${node.id}' has an invalid step vector.`);
      }
      validateNode(node.child, [...path, 'child'], issues);
      return;
    case 'mirror':
      validateNode(node.child, [...path, 'child'], issues);
      return;
    case 'group':
      node.children.forEach((child, index) => validateNode(child, [...path, 'children', index], issues));
      return;
    case 'helper':
      return;
    default:
      return;
  }
}

export function validateTankDraft(spec: TankSpec | null, model: TankModelSpec | null, folderName?: string | null) {
  const issues: ValidationIssue[] = [];
  if (!spec || !model) return issues;

  if (spec.renderMode && spec.renderMode !== 'parametric') {
    pushIssue(issues, 'warning', 'spec', `Tank '${spec.id}' is using renderMode='${spec.renderMode}'. The editor expects parametric tanks.`);
  }

  if (folderName && folderName !== spec.id) {
    pushIssue(issues, 'warning', 'spec', `Folder '${folderName}' does not match tank id '${spec.id}'.`);
  }

  if (!spec.weapons.ammo.AP) {
    pushIssue(issues, 'error', 'spec', `Tank '${spec.id}' is missing the required AP ammo definition.`);
  }

  (Object.entries(spec.weapons.ammo) as Array<[string, NonNullable<TankSpec['weapons']['ammo'][keyof TankSpec['weapons']['ammo']]>]>).forEach(([ammoKey, ammo]) => {
    if (!ammo) return;
    const historical = ammo.historicalPenetration;
    if (!historical) return;

    if (historical.points.length === 0) {
      pushIssue(issues, 'warning', 'spec', `${ammoKey} historical penetration curve is empty and will fall back to generated values.`);
      return;
    }

    let previousDistance = -1;
    historical.points.forEach((point, index) => {
      if (!Number.isFinite(point.distance) || point.distance < 0) {
        pushIssue(issues, 'error', 'spec', `${ammoKey} historical point #${index + 1} has an invalid distance.`);
      }
      if (!Number.isFinite(point.penetration) || point.penetration <= 0) {
        pushIssue(issues, 'error', 'spec', `${ammoKey} historical point #${index + 1} has an invalid penetration value.`);
      }
      if (point.distance <= previousDistance) {
        pushIssue(issues, 'warning', 'spec', `${ammoKey} historical penetration points should be ordered by increasing distance.`);
      }
      previousDistance = point.distance;
    });
  });

  const plateIdCounts = new Map<string, number>();
  spec.armorModel.plates.forEach((plate) => {
    plateIdCounts.set(plate.id, (plateIdCounts.get(plate.id) ?? 0) + 1);

    if (hasNonPositive([...plate.halfExtents])) {
      pushIssue(issues, 'error', 'armor', `Plate '${plate.id}' must have positive halfExtents.`);
    }

    if (!Number.isFinite(plate.armorThickness) || plate.armorThickness <= 0) {
      pushIssue(issues, 'error', 'armor', `Plate '${plate.id}' must have positive armor thickness.`);
    }

    if (plate.zone === 'track' && !plate.isTrack) {
      pushIssue(issues, 'error', 'armor', `Track plate '${plate.id}' must declare left/right track side.`);
    }

    if (plate.zone !== 'track' && plate.isTrack) {
      pushIssue(issues, 'warning', 'armor', `Non-track plate '${plate.id}' should not set isTrack.`);
    }

    if (plate.zone === 'track' && plate.parent !== 'hull') {
      pushIssue(issues, 'warning', 'armor', `Track plate '${plate.id}' usually belongs to the hull parent.`);
    }

    if (plate.zone === 'gun' && plate.parent !== 'gunGroup') {
      pushIssue(issues, 'warning', 'armor', `Gun plate '${plate.id}' should usually use parent='gunGroup'.`);
    }
  });

  for (const [plateId, count] of plateIdCounts.entries()) {
    if (count > 1) {
      pushIssue(issues, 'error', 'armor', `Plate id '${plateId}' is duplicated ${count} times.`);
    }
  }

  const flattenedNodes = flattenModelNodes(model);
  const nodeIdsBySlot = new Map<string, Array<string>>();
  const nodeIdsByContainer = new Map<string, Array<string>>();
  const containerToSlotKey = new Map<string, string>();

  flattenedNodes.forEach((entry) => {
    const slotKey = `${entry.slot}:${entry.node.id}`;
    const containerKey = `${parentContainerKey(entry.path)}:${entry.node.id}`;

    nodeIdsBySlot.set(slotKey, [...(nodeIdsBySlot.get(slotKey) ?? []), entry.path.join('.')]);
    nodeIdsByContainer.set(containerKey, [...(nodeIdsByContainer.get(containerKey) ?? []), entry.path.join('.')]);
    containerToSlotKey.set(containerKey, slotKey);
  });

  (Object.entries(model.slots) as Array<[keyof TankModelSpec['slots'], TankModelSpec['slots'][keyof TankModelSpec['slots']]]>).forEach(([slot, nodes]) => {
    nodes.forEach((node, index) => validateNode(node, ['slots', slot, index], issues));
  });

  const slotKeysWithSubtreeConflicts = new Set<string>();

  for (const [containerKey, paths] of nodeIdsByContainer.entries()) {
    if (paths.length > 1) {
      const nodeId = containerKey.slice(containerKey.lastIndexOf(':') + 1);
      const slotKey = containerToSlotKey.get(containerKey);
      if (slotKey) slotKeysWithSubtreeConflicts.add(slotKey);
      const containerPath = containerKey.slice(0, containerKey.lastIndexOf(':'));
      pushIssue(issues, 'warning', 'model', `Node id '${nodeId}' is duplicated ${paths.length} times inside subtree '${containerPath || 'root'}'.`);
    }
  }

  for (const [slotKey, paths] of nodeIdsBySlot.entries()) {
    if (paths.length > 1) {
      const [slot, nodeId] = slotKey.split(':');
      if (!slotKeysWithSubtreeConflicts.has(slotKey)) {
        pushIssue(issues, 'warning', 'model', `Node id '${nodeId}' is duplicated ${paths.length} times inside slot '${slot}'.`);
      }
    }
  }

  return issues;
}
