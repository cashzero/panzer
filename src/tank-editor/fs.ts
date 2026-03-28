import type { TankModelSpec, TankSpec } from '../tanks/core/types';
import type { TankEditorEntry } from './types';

const JSON_SPACING = 2;

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: (options?: {mode?: 'read' | 'readwrite'}) => Promise<FileSystemDirectoryHandle>;
}

interface DirectoryHandleWithEntries extends FileSystemDirectoryHandle {
  entries(): AsyncIterable<[string, FileSystemHandle]>;
}

export function formatJson(value: unknown): string {
  return `${JSON.stringify(value, null, JSON_SPACING)}\n`;
}

async function readTextFile(fileHandle: FileSystemFileHandle): Promise<string> {
  const file = await fileHandle.getFile();
  return file.text();
}

async function readJsonFile<T>(fileHandle: FileSystemFileHandle): Promise<T> {
  return JSON.parse(await readTextFile(fileHandle)) as T;
}

async function hasDirectoryHandle(directoryHandle: FileSystemDirectoryHandle, name: string) {
  try {
    await directoryHandle.getDirectoryHandle(name);
    return true;
  } catch {
    return false;
  }
}

async function hasFileHandle(directoryHandle: FileSystemDirectoryHandle, name: string) {
  try {
    await directoryHandle.getFileHandle(name);
    return true;
  } catch {
    return false;
  }
}

export async function pickTankWorkspaceDirectory() {
  const pickerWindow = window as DirectoryPickerWindow;
  if (!pickerWindow.showDirectoryPicker) {
    throw new Error('This browser does not support the File System Access API. Use a Chromium-based browser such as Chrome or Edge.');
  }

  return pickerWindow.showDirectoryPicker({mode: 'readwrite'});
}

export async function resolveTankDirectory(rootHandle: FileSystemDirectoryHandle) {
  if (await hasDirectoryHandle(rootHandle, 'src')) {
    const srcHandle = await rootHandle.getDirectoryHandle('src');
    if (await hasDirectoryHandle(srcHandle, 'tanks')) {
      return srcHandle.getDirectoryHandle('tanks');
    }
  }

  if (await hasDirectoryHandle(rootHandle, 'tanks')) {
    return rootHandle.getDirectoryHandle('tanks');
  }

  return rootHandle;
}

function sortTankEntries(entries: TankEditorEntry[]) {
  return [...entries].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
    return left.displayName.localeCompare(right.displayName);
  });
}

export async function loadTankEntriesFromDirectory(rootHandle: FileSystemDirectoryHandle) {
  const tanksDirectory = await resolveTankDirectory(rootHandle);
  const entries: TankEditorEntry[] = [];

  for await (const [, entryHandle] of (tanksDirectory as DirectoryHandleWithEntries).entries()) {
    if (entryHandle.kind !== 'directory') continue;
    const tankDirectoryHandle = entryHandle as FileSystemDirectoryHandle;

    if (!(await hasFileHandle(tankDirectoryHandle, 'tank.json')) || !(await hasFileHandle(tankDirectoryHandle, 'model.json'))) {
      continue;
    }

    const tankFileHandle = await tankDirectoryHandle.getFileHandle('tank.json');
    const modelFileHandle = await tankDirectoryHandle.getFileHandle('model.json');

    let spec: TankSpec;
    let model: TankModelSpec;

    try {
      spec = await readJsonFile<TankSpec>(tankFileHandle);
      model = await readJsonFile<TankModelSpec>(modelFileHandle);
    } catch (error) {
      throw new Error(`Failed to parse '${tankDirectoryHandle.name}': ${(error as Error).message}`);
    }

    entries.push({
      id: spec.id,
      folderName: tankDirectoryHandle.name,
      displayName: spec.meta.displayName,
      sortOrder: spec.catalog?.sortOrder ?? Number.MAX_SAFE_INTEGER,
      spec,
      model,
      directoryHandle: tankDirectoryHandle,
      tankFileHandle,
      modelFileHandle,
    });
  }

  if (entries.length === 0) {
    throw new Error(`No editable tank folders found in '${tanksDirectory.name}'. Pick the repository root or the 'src/tanks' folder.`);
  }

  return {
    tanksDirectory,
    entries: sortTankEntries(entries),
  };
}

export async function reloadTankEntry(entry: TankEditorEntry) {
  const spec = await readJsonFile<TankSpec>(entry.tankFileHandle);
  const model = await readJsonFile<TankModelSpec>(entry.modelFileHandle);

  return {
    ...entry,
    id: spec.id,
    displayName: spec.meta.displayName,
    sortOrder: spec.catalog?.sortOrder ?? Number.MAX_SAFE_INTEGER,
    spec,
    model,
  };
}

export async function saveTankEntry(entry: TankEditorEntry, spec: TankSpec, model: TankModelSpec) {
  const tankJson = formatJson(spec);
  const modelJson = formatJson(model);

  const tankWritable = await entry.tankFileHandle.createWritable();
  await tankWritable.write(tankJson);
  await tankWritable.close();

  const modelWritable = await entry.modelFileHandle.createWritable();
  await modelWritable.write(modelJson);
  await modelWritable.close();

  return {
    tankJson,
    modelJson,
  };
}
