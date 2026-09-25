import { getAllTankDefs, getTankDef } from '../tanks/registry';
import { useGameStore, isAxisNationality, type OOBUnit } from '../store';
import { X } from 'lucide-react';
import { ArmourSymbol } from './menuParts';
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
      className="force-row__paint"
      value={getCamouflageScheme(schemes, value).id}
      onChange={(e) => { e.stopPropagation(); onChange(e.target.value); }}
      onClick={(e) => e.stopPropagation()}
      title="Paint scheme"
    >
      {schemes.map((scheme) => (
        <option key={scheme.id} value={scheme.id}>{scheme.name}</option>
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
  const isPlacing = placementMode === side;
  const isPlayerSelected = side === 'ally' && selectedId === 'player';
  const symbolSide = side === 'enemy' ? 'enemy' : 'friendly';

  return (
    <div className="force">
      <h2 className="force__title">{side === 'enemy' ? 'Enemy' : 'Your force'}<span>{units.length + (side === 'ally' ? 1 : 0)} tanks</span></h2>

      <ul className="force__list">
        {side === 'ally' && (
          <li
            className="force-row"
            aria-selected={isPlayerSelected}
            onClick={() => setOobSelectedUnit(isPlayerSelected ? null : 'player')}
            onMouseEnter={() => onHoverTank({ tankType: oobPlayerTankType, camouflage: oobPlayerCamouflage ?? undefined })}
            onMouseLeave={() => onHoverTank(null)}
          >
            <ArmourSymbol side="player" title="Your tank" />
            <div className="force-row__body">
              <select
                className="force-row__type"
                value={oobPlayerTankType}
                onChange={(e) => { e.stopPropagation(); setOobPlayerTankType(e.target.value); }}
                onClick={(e) => e.stopPropagation()}
                aria-label="Your tank"
              >
                {allTanks.map((t) => <option key={t.id} value={t.id}>{t.displayName}</option>)}
              </select>
              <SchemeSelect tankType={oobPlayerTankType} value={oobPlayerCamouflage ?? undefined} onChange={setOobPlayerCamouflage} />
            </div>
            <span className="force-row__tag">You</span>
          </li>
        )}

        {units.map((unit, index) => {
          const isSelected = unit.id === selectedId;
          const wingman = unit.wingman !== false;
          return (
            <li
              key={unit.id}
              className="force-row"
              aria-selected={isSelected}
              onClick={() => setOobSelectedUnit(isSelected ? null : unit.id)}
              onMouseEnter={() => onHoverTank({ tankType: unit.tankType, camouflage: unit.camouflage })}
              onMouseLeave={() => onHoverTank(null)}
            >
              <ArmourSymbol side={symbolSide} />
              <div className="force-row__body">
                <select
                  className="force-row__type"
                  value={unit.tankType}
                  onChange={(e) => {
                    e.stopPropagation();
                    // A new tank type starts from its own default scheme.
                    updateOobUnit(unit.id, { tankType: e.target.value, camouflage: undefined });
                  }}
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`${side === 'enemy' ? 'Enemy' : 'Allied'} tank ${index + 1}`}
                >
                  {tankOptions.map((t) => <option key={t.id} value={t.id}>{t.displayName}</option>)}
                </select>
                <div className="force-row__meta">
                  <SchemeSelect tankType={unit.tankType} value={unit.camouflage}
                    onChange={(id) => updateOobUnit(unit.id, { camouflage: id })} />
                  {side === 'ally' && (
                    // A wingman takes your orders; a friendly tank fights on its own.
                    <button
                      type="button"
                      className="force-row__command"
                      aria-pressed={wingman}
                      title={wingman
                        ? 'Wingman: takes your orders on the tactical map. Click to make it a friendly tank that fights on its own.'
                        : 'Friendly tank: advances and fights on its own. Click to make it your wingman.'}
                      onClick={(e) => { e.stopPropagation(); updateOobUnit(unit.id, { wingman: !wingman }); }}
                    >
                      {wingman ? 'Wingman' : 'Friendly'}
                    </button>
                  )}
                </div>
              </div>
              <button
                type="button"
                className="force-row__remove"
                onClick={(e) => { e.stopPropagation(); removeOobUnit(unit.id); }}
                aria-label="Remove this tank"
              >
                <X size={14} aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>

      <button type="button" className="force__add" aria-pressed={isPlacing} onClick={() => setOobPlacementMode(isPlacing ? null : side)}>
        {isPlacing ? 'Click the map to place it' : side === 'enemy' ? 'Add an enemy tank' : 'Add an allied tank'}
      </button>
    </div>
  );
}
