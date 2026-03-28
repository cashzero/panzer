import type { TankArmorPlateSpec } from '../../tanks/core/types';
import { FieldGrid, NumberField, PanelSection, SelectField, TextField, Vec3Field } from '../controls';

const ZONE_OPTIONS = [
  {value: 'hull', label: 'Hull'},
  {value: 'turret', label: 'Turret'},
  {value: 'track', label: 'Track'},
  {value: 'gun', label: 'Gun'},
] as const;

const PARENT_OPTIONS = [
  {value: 'hull', label: 'Hull'},
  {value: 'turret', label: 'Turret'},
  {value: 'gunGroup', label: 'Gun Group'},
] as const;

const TRACK_OPTIONS = [
  {value: 'left', label: 'Left'},
  {value: 'right', label: 'Right'},
] as const;

function randomPlateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `plate-${crypto.randomUUID().slice(0, 8)}`;
  }
  return `plate-${Math.random().toString(36).slice(2, 10)}`;
}

function createDefaultPlate(): TankArmorPlateSpec {
  return {
    id: randomPlateId(),
    name: 'New Plate',
    zone: 'hull',
    halfExtents: [0.5, 0.25, 0.1],
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    armorThickness: 50,
    parent: 'hull',
  };
}

export function ArmorPanel({
  plates,
  selectedPlateId,
  onSelectPlate,
  onChange,
}: {
  plates: TankArmorPlateSpec[];
  selectedPlateId: string | null;
  onSelectPlate: (plateId: string | null) => void;
  onChange: (next: TankArmorPlateSpec[]) => void;
}) {
  const selectedPlate = plates.find((plate) => plate.id === selectedPlateId) ?? plates[0] ?? null;

  const updateSelectedPlate = (mutate: (plate: TankArmorPlateSpec) => void) => {
    if (!selectedPlate) return;
    onChange(plates.map((plate) => {
      if (plate.id !== selectedPlate.id) return plate;
      const nextPlate = structuredClone(plate);
      mutate(nextPlate);
      return nextPlate;
    }));
  };

  return (
    <div className="grid xl:grid-cols-[18rem_minmax(0,1fr)] gap-4">
      <PanelSection title="Plate List" subtitle="Select a plate to inspect it in the form and in the 3D overlay.">
        <div className="flex gap-2">
          <button
            className="editor-button editor-button--primary flex-1"
            type="button"
            onClick={() => {
              const nextPlate = createDefaultPlate();
              onChange([...plates, nextPlate]);
              onSelectPlate(nextPlate.id);
            }}
          >
            Add Plate
          </button>
          <button
            className="editor-button editor-button--danger"
            type="button"
            disabled={!selectedPlate}
            onClick={() => {
              if (!selectedPlate) return;
              const next = plates.filter((plate) => plate.id !== selectedPlate.id);
              onChange(next);
              onSelectPlate(next[0]?.id ?? null);
            }}
          >
            Delete
          </button>
        </div>

        <div className="flex flex-col gap-2 max-h-[38rem] overflow-auto editor-scrollbar pr-1">
          {plates.map((plate) => {
            const isActive = plate.id === selectedPlate?.id;
            return (
              <button
                key={plate.id}
                className={`text-left editor-panel-inset px-3 py-3 transition-colors ${isActive ? 'border-[var(--editor-border-strong)] bg-[rgba(86,95,63,0.24)]' : ''}`}
                type="button"
                onClick={() => onSelectPlate(plate.id)}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs uppercase tracking-[0.16em] text-[var(--editor-brass)]">{plate.zone}</span>
                  <span className="text-[11px] text-[var(--editor-muted)]">{plate.armorThickness} mm</span>
                </div>
                <div className="text-sm text-[var(--editor-text)] mt-2 break-all">{plate.id}</div>
                <div className="text-[11px] text-[var(--editor-muted)] mt-1">{plate.name}</div>
              </button>
            );
          })}
        </div>
      </PanelSection>

      <PanelSection title="Plate Inspector" subtitle="Armor hitboxes drive the selection-screen overlay, ricochets, and the combat model.">
        {selectedPlate ? (
          <div className="flex flex-col gap-4">
            <FieldGrid>
              <TextField label="Plate ID" value={selectedPlate.id} onChange={(value) => updateSelectedPlate((plate) => { plate.id = value; })} />
              <TextField label="Display Name" value={selectedPlate.name} onChange={(value) => updateSelectedPlate((plate) => { plate.name = value; })} />
              <SelectField
                label="Zone"
                value={selectedPlate.zone}
                options={[...ZONE_OPTIONS]}
                onChange={(value) => updateSelectedPlate((plate) => {
                  plate.zone = value;
                  if (value !== 'track') delete plate.isTrack;
                })}
              />
              <SelectField
                label="Parent"
                value={selectedPlate.parent}
                options={[...PARENT_OPTIONS]}
                onChange={(value) => updateSelectedPlate((plate) => { plate.parent = value; })}
              />
              <NumberField label="Armor Thickness" value={selectedPlate.armorThickness} onChange={(value) => updateSelectedPlate((plate) => { plate.armorThickness = value; })} />
              {selectedPlate.zone === 'track' ? (
                <SelectField
                  label="Track Side"
                  value={selectedPlate.isTrack ?? 'left'}
                  options={[...TRACK_OPTIONS]}
                  onChange={(value) => updateSelectedPlate((plate) => { plate.isTrack = value; })}
                />
              ) : null}
            </FieldGrid>

            <FieldGrid>
              <Vec3Field label="Half Extents" value={selectedPlate.halfExtents} onChange={(value) => updateSelectedPlate((plate) => { plate.halfExtents = value; })} />
              <Vec3Field label="Position" value={selectedPlate.position} onChange={(value) => updateSelectedPlate((plate) => { plate.position = value; })} />
            </FieldGrid>

            <Vec3Field label="Rotation" value={selectedPlate.rotation} onChange={(value) => updateSelectedPlate((plate) => { plate.rotation = value; })} />
          </div>
        ) : (
          <div className="editor-panel-inset px-4 py-6 text-sm text-[var(--editor-muted)]">Select or create a plate to begin editing.</div>
        )}
      </PanelSection>
    </div>
  );
}
