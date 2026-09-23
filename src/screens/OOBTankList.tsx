import { getAllTankDefs, getTankDef } from '../tanks/registry';
import { useGameStore, isAxisNationality, type OOBUnit } from '../store';
import { Plus, X } from 'lucide-react';
import { getCamouflageScheme } from '../tanks/core/camouflage';

const allTanks = getAllTankDefs();
const axisTanks = allTanks.filter((t) => isAxisNationality(t.nationality));
const alliedTanks = allTanks.filter((t) => !isAxisNationality(t.nationality));

interface OOBTankListProps {
  side: 'enemy' | 'ally';
  onHoverTank: (tank: { tankType: string; camouflage?: string } | null) => void;
}

/** Paint scheme picker; only shown for tanks with more than one scheme. */
function SchemeSelect({ tankType, value, onChange }: { tankType: string; value: string | undefined; onChange: (id: string) => void }) {
  const schemes = getTankDef(tankType).camouflage;
  if (schemes.length < 2) return null;
  return (
    <select
      className="w-full bg-transparent text-[10px] text-gray-500 border-none outline-none cursor-pointer"
      value={getCamouflageScheme(schemes, value).id}
      onChange={(e) => { e.stopPropagation(); onChange(e.target.value); }}
      onClick={(e) => e.stopPropagation()}
      title="Paint scheme"
    >
      {schemes.map((scheme) => (
        <option key={scheme.id} value={scheme.id} className="bg-gray-900">Paint: {scheme.shortName}</option>
      ))}
    </select>
  );
}

export function OOBTankList({ side, onHoverTank }: OOBTankListProps) {
  const units = useGameStore((s) => side === 'enemy' ? s.oobEnemies : s.oobAllies);
  const selectedId = useGameStore((s) => s.oobSelectedUnitId);
  const removeOobUnit = useGameStore((s) => s.removeOobUnit);
  const updateOobUnit = useGameStore((s) => s.updateOobUnit);
  const setOobSelectedUnit = useGameStore((s) => s.setOobSelectedUnit);
  const setOobPlacementMode = useGameStore((s) => s.setOobPlacementMode);
  const placementMode = useGameStore((s) => s.oobPlacementMode);

  // Player tank (only for ally side)
  const oobPlayerTankType = useGameStore((s) => s.oobPlayerTankType);
  const oobPlayerCamouflage = useGameStore((s) => s.oobPlayerCamouflage);
  const setOobPlayerTankType = useGameStore((s) => s.setOobPlayerTankType);
  const setOobPlayerCamouflage = useGameStore((s) => s.setOobPlayerCamouflage);

  const tankOptions = side === 'enemy' ? axisTanks : alliedTanks;
  const sideColor = side === 'enemy' ? '#ff3333' : '#3399ff';
  const label = side === 'enemy' ? 'ENEMIES' : 'ALLIES';
  const isPlacing = placementMode === side;
  const isPlayerSelected = side === 'ally' && selectedId === 'player';

  const handleAdd = () => {
    setOobPlacementMode(isPlacing ? null : side);
  };

  const totalCount = units.length + (side === 'ally' ? 1 : 0);

  return (
    <div className="oob-roster-content">
      <div className="oob-roster-heading" style={{ color: sideColor }}>
        <span>{label}</span><span>{totalCount.toString().padStart(2, '0')}</span>
      </div>

      <button
        onClick={handleAdd}
        className={`oob-add-unit ${isPlacing ? 'is-active' : ''}`}
      >
        <Plus size={14} aria-hidden="true" />
        {isPlacing ? 'Place on map' : `Add ${side === 'enemy' ? 'enemy' : 'ally'}`}
      </button>

      <div className="oob-unit-list">
        {/* Player row (ally side only, always first) */}
        {side === 'ally' && (
          <div
            className={`oob-unit-row ${isPlayerSelected ? 'is-selected' : ''}`}
            onClick={() => setOobSelectedUnit(isPlayerSelected ? null : 'player')}
            onMouseEnter={() => onHoverTank({ tankType: oobPlayerTankType, camouflage: oobPlayerCamouflage ?? undefined })}
            onMouseLeave={() => onHoverTank(null)}
          >
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#00ff00' }} />
            <div className="flex-1 min-w-0 flex flex-col">
            <select
              className="w-full bg-transparent text-xs text-gray-300 border-none outline-none cursor-pointer"
              value={oobPlayerTankType}
              onChange={(e) => {
                e.stopPropagation();
                setOobPlayerTankType(e.target.value);
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {allTanks.map((t) => (
                <option key={t.id} value={t.id} className="bg-gray-900">{t.displayName}</option>
              ))}
            </select>
            <SchemeSelect tankType={oobPlayerTankType} value={oobPlayerCamouflage ?? undefined} onChange={setOobPlayerCamouflage} />
            </div>
            <span className="text-[9px] text-green-500 font-bold px-1">YOU</span>
          </div>
        )}

        {units.map((unit) => {
          const isSelected = unit.id === selectedId;
          return (
            <div
              key={unit.id}
              className={`oob-unit-row ${isSelected ? 'is-selected' : ''}`}
              onClick={() => setOobSelectedUnit(isSelected ? null : unit.id)}
              onMouseEnter={() => onHoverTank({ tankType: unit.tankType, camouflage: unit.camouflage })}
              onMouseLeave={() => onHoverTank(null)}
            >
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: sideColor }} />
              <div className="flex-1 min-w-0 flex flex-col">
              <select
                className="w-full bg-transparent text-xs text-gray-300 border-none outline-none cursor-pointer"
                value={unit.tankType}
                onChange={(e) => {
                  e.stopPropagation();
                  // A new tank type starts from its own default scheme.
                  updateOobUnit(unit.id, { tankType: e.target.value, camouflage: undefined });
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {tankOptions.map((t) => (
                  <option key={t.id} value={t.id} className="bg-gray-900">{t.displayName}</option>
                ))}
              </select>
              <SchemeSelect tankType={unit.tankType} value={unit.camouflage}
                onChange={(id) => updateOobUnit(unit.id, { camouflage: id })} />
              </div>
              <button
                className="oob-remove-unit"
                onClick={(e) => { e.stopPropagation(); removeOobUnit(unit.id); }}
                title="Remove"
              >
                <X size={13} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>

      <div className="oob-roster-footer">
        {side === 'enemy' ? 'OPFOR' : 'FRIENDLY'} / {totalCount} UNIT{totalCount !== 1 ? 'S' : ''}
      </div>
    </div>
  );
}
