import { useEffect, useRef, useState } from 'react';
import { useGameStore, isCommandable, type TankData } from './store';
import { getTankDef } from './tanks/registry';
import { getRecord, type BattleStats } from './battleStats';
import { ArmourSymbol } from './screens/menuParts';

/** How long the end of a battle plays out before the report comes up. */
const DEBRIEF_DELAY_MS = 3500;

function formatDuration(ms: number) {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function tankName(tank: TankData) {
  const name = getTankDef(tank.tankType).displayName;
  return tank.isPlayer ? `${name} (you)` : name;
}

function UnitRow({ tank, side, stats, names }: {
  tank: TankData;
  side: 'friendly' | 'enemy';
  stats: BattleStats;
  names: Map<string, string>;
}) {
  const kill = stats.kills.find((entry) => entry.victimId === tank.id);
  const kills = getRecord(stats, tank.id).kills;
  const symbol = tank.destroyed ? 'destroyed' : tank.isPlayer ? 'player' : side;
  return (
    <li className={`debrief-unit${tank.destroyed ? ' is-lost' : ''}`}>
      <ArmourSymbol side={symbol} size={26} />
      <span className="debrief-unit__name">
        {tankName(tank)}
        {side === 'friendly' && !tank.isPlayer && <small>{isCommandable(tank) ? 'Wingman' : 'Friendly'}</small>}
      </span>
      <span className="debrief-unit__state">
        {tank.destroyed ? `Knocked out${kill ? ` by ${names.get(kill.killerId) ?? 'unknown'}` : ''}` : 'Fit for action'}
      </span>
      <span className="debrief-unit__kills">{kills > 0 ? `${kills} kill${kills > 1 ? 's' : ''}` : ''}</span>
    </li>
  );
}

/**
 * The after-action report: how the battle ended, the player's gunnery, and
 * what became of every tank on both sides, with the way to fight the same
 * battle again or go back to the order of battle.
 */
export function BattleDebrief() {
  const stats = useGameStore((state) => state.battleStats);
  const player = useGameStore((state) => state.playerTank);
  const allies = useGameStore((state) => state.allies);
  const enemies = useGameStore((state) => state.enemies);
  const requestDeploy = useGameStore((state) => state.requestDeploy);
  const leaveBattle = useGameStore((state) => state.leaveBattle);
  const [open, setOpen] = useState(false);
  const primary = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!stats.outcome) return;
    const timer = window.setTimeout(() => setOpen(true), Math.max(0, stats.endedAt + DEBRIEF_DELAY_MS - Date.now()));
    return () => window.clearTimeout(timer);
  }, [stats.outcome, stats.endedAt]);

  useEffect(() => {
    if (!open) return;
    // Give the pointer back for the buttons.
    if (document.pointerLockElement) document.exitPointerLock();
    primary.current?.focus();
  }, [open]);

  if (!stats.outcome) return null;

  const victory = stats.outcome === 'victory';
  if (!open) {
    // The moment it ends: a line across the screen while the battle plays out.
    return victory ? (
      <div className="battle-result-banner is-victory" role="status">
        <div><span>Signal to all units</span><h2>Enemy force destroyed</h2></div>
      </div>
    ) : null;
  }

  const friendlies = [player, ...allies];
  const names = new Map([...friendlies, ...enemies].map((tank) => [tank.id, tankName(tank)]));
  const own = getRecord(stats, player.id);
  const accuracy = own.shotsFired > 0 ? Math.round((own.hits / own.shotsFired) * 100) : 0;
  const lost = (tanks: TankData[]) => tanks.filter((tank) => tank.destroyed).length;
  // Accuracy is main-gun gunnery; automatic fire is tallied on its own line.
  const gunnery: Array<[string, string]> = [
    ['Main-gun rounds', String(own.shotsFired)],
    ['Hits', `${own.hits}${own.shotsFired > 0 ? `  (${accuracy}%)` : ''}`],
    ...(own.automaticRounds > 0 ? [['Automatic fire', `${own.automaticRounds} rds, ${own.automaticHits} hits`] as [string, string]] : []),
    ['Penetrations', String(own.penetrations)],
    ['Tanks destroyed', String(own.kills)],
    ['Damage dealt', String(Math.round(own.damageDealt))],
    ['Hits taken', String(own.hitsTaken)],
    ['Damage taken', String(Math.round(own.damageTaken))],
  ];

  return (
    <div className={`debrief ${victory ? 'is-victory' : 'is-defeat'}`} role="dialog" aria-modal="true" aria-labelledby="debrief-title">
      <article className="debrief__sheet">
        <header className="debrief__head">
          <span>After-action report</span>
          <h2 id="debrief-title">{victory ? 'Victory' : 'Defeat'}</h2>
          <p>
            {victory ? 'Every enemy tank in the sector has been knocked out.' : 'Your tank was knocked out.'}
            {' '}Engagement lasted {formatDuration(stats.endedAt - stats.startedAt)}.
          </p>
        </header>

        <section className="debrief__gunnery" aria-label="Your gunnery">
          <h3>Your gunnery</h3>
          <dl>
            {gunnery.map(([label, value]) => (
              <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
            ))}
          </dl>
        </section>

        <section className="debrief__forces" aria-label="Forces">
          <div>
            <h3>Own force <small>{lost(friendlies)} of {friendlies.length} lost</small></h3>
            <ul>{friendlies.map((tank) => <UnitRow key={tank.id} tank={tank} side="friendly" stats={stats} names={names} />)}</ul>
          </div>
          <div>
            <h3>Enemy force <small>{lost(enemies)} of {enemies.length} destroyed</small></h3>
            <ul>{enemies.map((tank) => <UnitRow key={tank.id} tank={tank} side="enemy" stats={stats} names={names} />)}</ul>
          </div>
        </section>

        <footer className="debrief__actions">
          <button ref={primary} type="button" className="debrief__button is-primary" onClick={requestDeploy}>Fight again</button>
          <button type="button" className="debrief__button" onClick={leaveBattle}>Order of battle</button>
        </footer>
      </article>
    </div>
  );
}
