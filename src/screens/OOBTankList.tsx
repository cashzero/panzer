import { getAllTankDefs, getTankDef } from '../tanks/registry';
import { useGameStore, isAxisNationality, type OOBUnit } from '../store';

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
    <div className="flex flex-col h-full p-3 gap-2">
      <div className="text-xs uppercase tracking-widest text-center mb-1" style={{ color: sideColor }}>
        {label}
      </div>

      <button
        onClick={handleAdd}
        className={`w-full px-3 py-1.5 border text-xs uppercase tracking-wider transition-all cursor-pointer ${
          isPlacing
            ? 'border-yellow-600 text-yellow-400 bg-yellow-900/20'
            : 'border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300'
        }`}
      >
        {isPlacing ? 'Click Map...' : `+ Add ${side === 'enemy' ? 'Enemy' : 'Ally'}`}
      </button>

      <div className="flex-1 overflow-y-auto flex flex-col gap-1">
        {/* Player row (ally side only, always first) */}
        {side === 'ally' && (
          <div
            className={`flex items-center gap-2 px-2 py-1.5 border cursor-pointer transition-all ${
              isPlayerSelected
                ? 'border-yellow-600 bg-yellow-900/20'
                : 'border-gray-800 hover:border-gray-600'
            }`}
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
              className={`flex items-center gap-2 px-2 py-1.5 border cursor-pointer transition-all ${
                isSelected
                  ? 'border-yellow-600 bg-yellow-900/20'
                  : 'border-gray-800 hover:border-gray-600'
              }`}
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
                className="text-gray-600 hover:text-red-400 text-xs px-1 transition-colors cursor-pointer"
                onClick={(e) => { e.stopPropagation(); removeOobUnit(unit.id); }}
                title="Remove"
              >
                X
              </button>
            </div>
          );
        })}
      </div>

      <div className="text-[10px] text-gray-600 text-center">
        {totalCount} unit{totalCount !== 1 ? 's' : ''}
      </div>
    </div>
  );
}
