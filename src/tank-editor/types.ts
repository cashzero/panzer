import type { ModelNode, TankModelSpec, TankSpec } from '../tanks/core/types';

export type EditorTab = 'specs' | 'armor' | 'model';
export type EditorMode = 'select' | 'move' | 'rotate' | 'scale' | 'resize';
export type ModelSlot = 'hull' | 'tracksLeft' | 'tracksRight' | 'turret' | 'gun';
export type JsonPath = Array<string | number>;

export type EditorSelection =
  | {kind: 'none'}
  | {kind: 'armorPlate'; plateId: string}
  | {kind: 'modelNode'; slot: ModelSlot; path: JsonPath};

export interface TankEditorEntry {
  id: string;
  folderName: string;
  displayName: string;
  sortOrder: number;
  spec: TankSpec;
  model: TankModelSpec;
  directoryHandle: FileSystemDirectoryHandle;
  tankFileHandle: FileSystemFileHandle;
  modelFileHandle: FileSystemFileHandle;
}

export interface FlattenedModelNode {
  slot: ModelSlot;
  path: JsonPath;
  depth: number;
  node: ModelNode;
  parentType: 'root' | 'group' | 'repeat' | 'mirror';
}

export interface ValidationIssue {
  severity: 'error' | 'warning';
  scope: 'spec' | 'armor' | 'model';
  message: string;
}
