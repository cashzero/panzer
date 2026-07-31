import { getAllTankDefs, getTankDef } from '../tanks/registry';
import { useGameStore, isAxisNationality, type OOBUnit } from '../store';
import { Plus, X } from 'lucide-react';

const allTanks = getAllTankDefs();
const axisTanks = allTanks.filter((t) => isAxisNationality(t.nationality));
const alliedTanks = allTanks.filter((t) => !isAxisNationality(t.nationality));

interface OOBTankListProps {
  side: 'enemy' | 'ally';
  onHoverTank: (tankType: string | null) => void;
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
  const setOobPlayerTankType = useGameStore((s) => s.setOobPlayerTankType);

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
            onMouseEnter={() => onHoverTank(oobPlayerTankType)}
            onMouseLeave={() => onHoverTank(null)}
          >
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: '#00ff00' }} />
            <select
              className="flex-1 bg-transparent text-xs text-gray-300 border-none outline-none cursor-pointer"
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
              onMouseEnter={() => onHoverTank(unit.tankType)}
              onMouseLeave={() => onHoverTank(null)}
            >
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: sideColor }} />
              <select
                className="flex-1 bg-transparent text-xs text-gray-300 border-none outline-none cursor-pointer"
                value={unit.tankType}
                onChange={(e) => {
                  e.stopPropagation();
                  updateOobUnit(unit.id, { tankType: e.target.value });
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {tankOptions.map((t) => (
                  <option key={t.id} value={t.id} className="bg-gray-900">{t.displayName}</option>
                ))}
              </select>
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
