import { useCallback, useEffect, useMemo, useState } from 'react';
import { TankEditorPreview } from './preview/TankEditorPreview';
import { ArmorPanel } from './panels/ArmorPanel';
import { ModelPanel } from './panels/ModelPanel';
import { SpecPanel } from './panels/SpecPanel';
import { formatJson, loadTankEntriesFromDirectory, pickTankWorkspaceDirectory, reloadTankEntry, saveTankEntry } from './fs';
import { duplicateNode, getFirstNodePathForSlot, getNodeAtPath, randomNodeId, updateNodeAtPath, deleteNode } from './modelTree';
import type { EditorMode, EditorSelection, EditorTab, JsonPath, ModelSlot, TankEditorEntry } from './types';
import { validateTankDraft } from './validation';

function applyEntryDraft(entry: TankEditorEntry) {
  return {
    draftSpec: structuredClone(entry.spec),
    draftModel: structuredClone(entry.model),
    baselineTankJson: formatJson(entry.spec),
    baselineModelJson: formatJson(entry.model),
  };
}

export function TankEditorApp() {
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [entries, setEntries] = useState<TankEditorEntry[]>([]);
  const [selectedTankId, setSelectedTankId] = useState<string | null>(null);
  const [draftSpec, setDraftSpec] = useState<TankEditorEntry['spec'] | null>(null);
  const [draftModel, setDraftModel] = useState<TankEditorEntry['model'] | null>(null);
  const [baselineTankJson, setBaselineTankJson] = useState('');
  const [baselineModelJson, setBaselineModelJson] = useState('');
  const [selectedTab, setSelectedTab] = useState<EditorTab>('specs');
  const [selectedEntity, setSelectedEntity] = useState<EditorSelection>({kind: 'none'});
  const [activeModelSlot, setActiveModelSlot] = useState<ModelSlot>('hull');
  const [editorMode, setEditorMode] = useState<EditorMode>('select');
  const [showArmor, setShowArmor] = useState(true);
  const [showNodeBounds, setShowNodeBounds] = useState(true);
  const [autoRotate, setAutoRotate] = useState(true);
  const [status, setStatus] = useState<string>('Pick the repository root or the `src/tanks` folder to begin.');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedEntry = useMemo(
    () => entries.find((entry) => entry.id === selectedTankId) ?? null,
    [entries, selectedTankId],
  );

  const currentTankJson = draftSpec ? formatJson(draftSpec) : '';
  const currentModelJson = draftModel ? formatJson(draftModel) : '';
  const dirty = Boolean(draftSpec && draftModel && (currentTankJson !== baselineTankJson || currentModelJson !== baselineModelJson));
  const validationIssues = useMemo(
    () => validateTankDraft(draftSpec, draftModel, selectedEntry?.folderName ?? null),
    [draftModel, draftSpec, selectedEntry],
  );
  const blockingIssues = validationIssues.filter((issue) => issue.severity === 'error');
  const selectedPlateId = selectedEntity.kind === 'armorPlate' ? selectedEntity.plateId : null;
  const selectedNodePath = selectedEntity.kind === 'modelNode' ? selectedEntity.path : null;

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (!draftSpec) return;
    if (selectedEntity.kind !== 'armorPlate') return;

    const stillExists = draftSpec.armorModel.plates.some((plate) => plate.id === selectedEntity.plateId);
    if (!stillExists) {
      const firstPlate = draftSpec.armorModel.plates[0];
      setSelectedEntity(firstPlate ? {kind: 'armorPlate', plateId: firstPlate.id} : {kind: 'none'});
    }
  }, [draftSpec, selectedEntity]);

  useEffect(() => {
    if (!draftModel) return;
    if (selectedEntity.kind !== 'modelNode') return;
    if (getNodeAtPath(draftModel, selectedEntity.path)) return;

    const fallbackPath = getFirstNodePathForSlot(draftModel, activeModelSlot);
    setSelectedEntity(fallbackPath ? {kind: 'modelNode', slot: activeModelSlot, path: fallbackPath} : {kind: 'none'});
  }, [activeModelSlot, draftModel, selectedEntity]);

  useEffect(() => {
    if (!draftSpec || !draftModel) return;

    if (selectedTab === 'armor' && selectedEntity.kind !== 'armorPlate') {
      const firstPlate = draftSpec.armorModel.plates[0];
      setSelectedEntity(firstPlate ? {kind: 'armorPlate', plateId: firstPlate.id} : {kind: 'none'});
      return;
    }

    if (selectedTab === 'model' && selectedEntity.kind !== 'modelNode') {
      const firstPath = getFirstNodePathForSlot(draftModel, activeModelSlot);
      setSelectedEntity(firstPath ? {kind: 'modelNode', slot: activeModelSlot, path: firstPath} : {kind: 'none'});
      return;
    }

    if (selectedTab === 'specs') {
      setEditorMode('select');
    }
  }, [activeModelSlot, draftModel, draftSpec, selectedEntity.kind, selectedTab]);

  useEffect(() => {
    if (selectedEntity.kind === 'armorPlate' && editorMode === 'scale') {
      setEditorMode('resize');
    }

    if (selectedEntity.kind === 'modelNode') {
      setActiveModelSlot(selectedEntity.slot);
      if (editorMode === 'resize') setEditorMode('scale');
    }
  }, [editorMode, selectedEntity]);

  useEffect(() => {
    if (editorMode !== 'select' && autoRotate) {
      setAutoRotate(false);
    }
  }, [autoRotate, editorMode]);

  const hydrateFromEntry = (entry: TankEditorEntry) => {
    const nextDraft = applyEntryDraft(entry);
    setSelectedTankId(entry.id);
    setDraftSpec(nextDraft.draftSpec);
    setDraftModel(nextDraft.draftModel);
    setBaselineTankJson(nextDraft.baselineTankJson);
    setBaselineModelJson(nextDraft.baselineModelJson);
    setActiveModelSlot('hull');
    setEditorMode('select');

    const firstPlateId = entry.spec.armorModel.plates[0]?.id ?? null;
    const firstNodePath = getFirstNodePathForSlot(entry.model, 'hull');

    if (selectedTab === 'model' && firstNodePath) {
      setSelectedEntity({kind: 'modelNode', slot: 'hull', path: firstNodePath});
    } else if (firstPlateId) {
      setSelectedEntity({kind: 'armorPlate', plateId: firstPlateId});
    } else {
      setSelectedEntity({kind: 'none'});
    }
  };

  const updateArmorPlate = (plateId: string, mutate: (plate: TankEditorEntry['spec']['armorModel']['plates'][number]) => void) => {
    setDraftSpec((current) => {
      if (!current) return current;

      return {
        ...current,
        armorModel: {
          ...current.armorModel,
          plates: current.armorModel.plates.map((plate) => {
            if (plate.id !== plateId) return plate;
            const nextPlate = structuredClone(plate);
            mutate(nextPlate);
            return nextPlate;
          }),
        },
      };
    });
  };

  const updateModelNode = (path: JsonPath, updater: (node: TankEditorEntry['model']['slots'][ModelSlot][number]) => TankEditorEntry['model']['slots'][ModelSlot][number]) => {
    setDraftModel((current) => (current ? updateNodeAtPath(current, path, updater) : current));
  };

  const deleteSelectedEntity = useCallback(() => {
    if (selectedEntity.kind === 'armorPlate') {
      setDraftSpec((current) => {
        if (!current) return current;
        const nextPlates = current.armorModel.plates.filter((plate) => plate.id !== selectedEntity.plateId);
        return {
          ...current,
          armorModel: {...current.armorModel, plates: nextPlates},
        };
      });
      setSelectedEntity({kind: 'none'});
      return;
    }

    if (selectedEntity.kind === 'modelNode') {
      setDraftModel((current) => (current ? deleteNode(current, selectedEntity.path) : current));
      setSelectedEntity({kind: 'none'});
    }
  }, [selectedEntity]);

  const duplicateSelectedEntity = useCallback(() => {
    if (selectedEntity.kind === 'armorPlate') {
      const nextSelectionId = `${selectedEntity.plateId}-copy-${randomNodeId('plate').slice(-4)}`;
      setDraftSpec((current) => {
        if (!current) return current;
        const source = current.armorModel.plates.find((plate) => plate.id === selectedEntity.plateId);
        if (!source) return current;
        const copy = structuredClone(source);
        copy.id = nextSelectionId;
        copy.name = `${source.name} Copy`;
        copy.position = [source.position[0] + 0.15, source.position[1], source.position[2] + 0.15];
        return {
          ...current,
          armorModel: {...current.armorModel, plates: [...current.armorModel.plates, copy]},
        };
      });
      setSelectedEntity({kind: 'armorPlate', plateId: nextSelectionId});
      return;
    }

    if (selectedEntity.kind === 'modelNode') {
      setDraftModel((current) => (current ? duplicateNode(current, selectedEntity.path) : current));
      const duplicatePath = [...selectedEntity.path];
      duplicatePath[duplicatePath.length - 1] = (duplicatePath[duplicatePath.length - 1] as number) + 1;
      setSelectedEntity({kind: 'modelNode', slot: selectedEntity.slot, path: duplicatePath});
    }
  }, [selectedEntity]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTypingTarget = target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      );
      if (isTypingTarget) return;

      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedEntity.kind !== 'none') {
          event.preventDefault();
          deleteSelectedEntity();
        }
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
        if (selectedEntity.kind !== 'none') {
          event.preventDefault();
          duplicateSelectedEntity();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deleteSelectedEntity, duplicateSelectedEntity, selectedEntity]);

  const ensureNavigation = () => {
    if (!dirty) return true;
    return window.confirm('Discard unsaved tank editor changes?');
  };

  const loadWorkspace = async () => {
    try {
      setBusy(true);
      setError(null);
      const pickedDirectory = await pickTankWorkspaceDirectory();
      const {tanksDirectory, entries: nextEntries} = await loadTankEntriesFromDirectory(pickedDirectory);
      setWorkspaceName(tanksDirectory.name);
      setEntries(nextEntries);
      hydrateFromEntry(nextEntries[0]);
      setStatus(`Loaded ${nextEntries.length} tank folders from ${tanksDirectory.name}.`);
    } catch (nextError) {
      setError((nextError as Error).message);
      setStatus('Could not load tank folders.');
    } finally {
      setBusy(false);
    }
  };

  const selectTank = (entry: TankEditorEntry) => {
    if (!ensureNavigation()) return;
    hydrateFromEntry(entry);
    setStatus(`Editing ${entry.displayName}.`);
    setError(null);
  };

  const saveCurrent = async () => {
    if (!selectedEntry || !draftSpec || !draftModel) return;

    try {
      setBusy(true);
      setError(null);
      const {tankJson, modelJson} = await saveTankEntry(selectedEntry, draftSpec, draftModel);
      const updatedEntry: TankEditorEntry = {
        ...selectedEntry,
        id: draftSpec.id,
        displayName: draftSpec.meta.displayName,
        sortOrder: draftSpec.catalog?.sortOrder ?? Number.MAX_SAFE_INTEGER,
        spec: structuredClone(draftSpec),
        model: structuredClone(draftModel),
      };

      setEntries((current) => [...current.map((entry) => (entry.id === selectedEntry.id ? updatedEntry : entry))].sort((left, right) => {
        if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
        return left.displayName.localeCompare(right.displayName);
      }));
      setBaselineTankJson(tankJson);
      setBaselineModelJson(modelJson);
      setStatus(`Saved ${updatedEntry.displayName}.`);
    } catch (nextError) {
      setError((nextError as Error).message);
      setStatus('Save failed.');
    } finally {
      setBusy(false);
    }
  };

  const reloadCurrent = async () => {
    if (!selectedEntry) return;
    if (dirty && !window.confirm('Reload from disk and discard unsaved changes?')) return;

    try {
      setBusy(true);
      setError(null);
      const refreshedEntry = await reloadTankEntry(selectedEntry);
      setEntries((current) => current.map((entry) => (entry.id === selectedEntry.id ? refreshedEntry : entry)));
      hydrateFromEntry(refreshedEntry);
      setStatus(`Reloaded ${refreshedEntry.displayName} from disk.`);
    } catch (nextError) {
      setError((nextError as Error).message);
      setStatus('Reload failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tank-editor-shell text-[var(--editor-text)]">
      <div className="max-w-[1800px] mx-auto p-4 md:p-6 flex flex-col gap-4">
        <header className="editor-panel p-5 flex flex-col gap-4">
          <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
            <div className="flex flex-col gap-2">
              <div className="text-[11px] uppercase tracking-[0.32em] text-[var(--editor-olive)]">Panzer Front Workshop</div>
              <div>
                <h1 className="text-2xl md:text-3xl tracking-[0.18em] uppercase text-[var(--editor-brass)]">Tank Editor</h1>
                <p className="text-sm text-[var(--editor-muted)] mt-2 max-w-3xl">
                  Standalone parametric tank editor for `tank.json` and `model.json`. Pick the repo root or `src/tanks`, edit the draft, then write changes straight back to disk.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button className="editor-button editor-button--primary" type="button" onClick={loadWorkspace} disabled={busy}>
                {busy ? 'Working...' : 'Open Tank Folder'}
              </button>
              <button className="editor-button" type="button" onClick={reloadCurrent} disabled={!selectedEntry || busy}>
                Reload Current
              </button>
              <button className="editor-button editor-button--primary" type="button" onClick={saveCurrent} disabled={!selectedEntry || !dirty || busy || blockingIssues.length > 0}>
                Save Draft
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-[auto_auto_1fr_auto] gap-3 items-center text-[11px] uppercase tracking-[0.16em] text-[var(--editor-muted)]">
            <div className="editor-panel-inset px-3 py-2 flex items-center gap-2">
              <span className={`editor-status-dot ${dirty ? 'bg-[var(--editor-brass)]' : 'bg-[var(--editor-green)]'}`} />
              {dirty ? 'Unsaved Draft' : 'Saved State'}
            </div>
            <div className="editor-panel-inset px-3 py-2">Workspace: {workspaceName ?? 'Not loaded'}</div>
            <div className="editor-panel-inset px-3 py-2 break-all">{status}</div>
            {error ? <div className="editor-panel-inset px-3 py-2 text-[var(--editor-red)]">{error}</div> : null}
          </div>
        </header>

        <div className="flex flex-col gap-4">
          <section className="editor-panel p-4 flex flex-col gap-4">
            <div>
              <h2 className="text-sm uppercase tracking-[0.24em] text-[var(--editor-brass)]">Tank Folders</h2>
              <p className="text-xs text-[var(--editor-muted)] mt-2">Only parametric folder tanks are shown here. Legacy TSX tanks remain outside the editor path.</p>
            </div>

            <div className="flex gap-3 overflow-x-auto editor-scrollbar pb-1">
              {entries.length === 0 ? (
                <div className="editor-panel-inset px-4 py-6 text-sm text-[var(--editor-muted)] min-w-64">No folder loaded yet.</div>
              ) : entries.map((entry) => {
                const isActive = entry.id === selectedTankId;
                return (
                  <button
                    key={entry.folderName}
                    type="button"
                    className={`text-left editor-panel-inset px-3 py-3 min-w-64 max-w-72 shrink-0 ${isActive ? 'border-[var(--editor-border-strong)] bg-[rgba(86,95,63,0.24)]' : ''}`}
                    onClick={() => selectTank(entry)}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[10px] uppercase tracking-[0.2em] text-[var(--editor-muted)]">{entry.folderName}</span>
                      <span className="editor-chip">#{entry.sortOrder === Number.MAX_SAFE_INTEGER ? 'na' : entry.sortOrder}</span>
                    </div>
                    <div className="text-sm text-[var(--editor-brass)] mt-2">{entry.displayName}</div>
                    <div className="text-[11px] text-[var(--editor-muted)] mt-1 break-all">{entry.id}</div>
                  </button>
                );
              })}
            </div>
          </section>

          <TankEditorPreview
            spec={draftSpec}
            model={draftModel}
            activeTab={selectedTab}
            onChangeActiveTab={setSelectedTab}
            selectedEntity={selectedEntity}
            onSelectEntity={setSelectedEntity}
            editorMode={editorMode}
            onChangeEditorMode={setEditorMode}
            showArmor={showArmor}
            onToggleArmor={setShowArmor}
            showNodeBounds={showNodeBounds}
            onToggleShowNodeBounds={setShowNodeBounds}
            autoRotate={autoRotate}
            onToggleAutoRotate={setAutoRotate}
            onUpdateArmorPlate={updateArmorPlate}
            onUpdateModelNode={updateModelNode}
            onDeleteSelection={deleteSelectedEntity}
            onDuplicateSelection={duplicateSelectedEntity}
          />

          <main className="editor-panel p-4 md:p-5 flex flex-col gap-4 min-w-0">
            <div>
              <h2 className="text-sm uppercase tracking-[0.24em] text-[var(--editor-brass)]">Editor Inspector</h2>
              <p className="text-xs text-[var(--editor-muted)] mt-1">The active viewport tab drives both scene interaction and the inspector shown here.</p>
            </div>

            <div className="editor-panel-inset p-4 flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs uppercase tracking-[0.2em] text-[var(--editor-brass)]">Validation</h3>
                  <p className="text-xs text-[var(--editor-muted)] mt-1">
                    {blockingIssues.length > 0
                      ? `${blockingIssues.length} blocking issue${blockingIssues.length === 1 ? '' : 's'} need fixing before save.`
                      : validationIssues.length > 0
                        ? `${validationIssues.length} non-blocking warning${validationIssues.length === 1 ? '' : 's'} detected.`
                        : 'No validation issues in the current draft.'}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.16em] text-[var(--editor-muted)]">
                  <span className="editor-chip">Errors {blockingIssues.length}</span>
                  <span className="editor-chip">Warnings {validationIssues.filter((issue) => issue.severity === 'warning').length}</span>
                </div>
              </div>

              {validationIssues.length > 0 ? (
                <div className="grid gap-2 md:grid-cols-2">
                  {validationIssues.slice(0, 8).map((issue, index) => (
                    <div key={`${issue.scope}:${issue.message}:${index}`} className={`editor-panel-inset px-3 py-3 text-xs ${issue.severity === 'error' ? 'text-[var(--editor-red)]' : 'text-[var(--editor-muted)]'}`}>
                      <div className="uppercase tracking-[0.16em] mb-1">{issue.scope} {issue.severity}</div>
                      <div className="normal-case tracking-normal leading-relaxed">{issue.message}</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {!draftSpec || !draftModel || !selectedEntry ? (
              <div className="editor-panel-inset px-6 py-10 text-center text-sm text-[var(--editor-muted)]">
                Load a tank workspace to start editing.
              </div>
            ) : null}

            {draftSpec && draftModel && selectedEntry ? (
              <div className="flex flex-col gap-4 min-w-0">
                {selectedTab === 'specs' ? (
                  <SpecPanel spec={draftSpec} folderName={selectedEntry.folderName} onChange={setDraftSpec} />
                ) : null}

                {selectedTab === 'armor' ? (
                  <ArmorPanel
                    plates={draftSpec.armorModel.plates}
                    selectedPlateId={selectedPlateId}
                    onSelectPlate={(plateId) => setSelectedEntity(plateId ? {kind: 'armorPlate', plateId} : {kind: 'none'})}
                    onChange={(nextPlates) => setDraftSpec((current) => current ? {...current, armorModel: {...current.armorModel, plates: nextPlates}} : current)}
                  />
                ) : null}

                {selectedTab === 'model' ? (
                  <ModelPanel
                    model={draftModel}
                    selectedSlot={activeModelSlot}
                    onSelectSlot={(slot) => {
                      setActiveModelSlot(slot);
                      const nextPath = getFirstNodePathForSlot(draftModel, slot);
                      setSelectedEntity(nextPath ? {kind: 'modelNode', slot, path: nextPath} : {kind: 'none'});
                    }}
                    selectedNodePath={selectedNodePath}
                    onSelectNodePath={(path) => setSelectedEntity(path ? {kind: 'modelNode', slot: activeModelSlot, path} : {kind: 'none'})}
                    onChange={setDraftModel}
                  />
                ) : null}
              </div>
            ) : null}
          </main>
        </div>
      </div>
    </div>
  );
}
