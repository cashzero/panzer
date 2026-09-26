import type { ReactNode } from 'react';
import { useGameStore } from '../store';
import {
  MAX_ALLIED_TANKS, OOB_YEARS,
  type OobEnemyMix, type OobOdds, type OobRange, type OobSeason,
} from '../oobGenerator';

const ODDS_OPTIONS: [OobOdds, string][] = [
  ['random', 'Random'],
  ['favourable', 'In your favour'],
  ['even', 'Even'],
  ['hard', 'Enemy stronger'],
  ['desperate', 'Desperate'],
];

const MIX_OPTIONS: [OobEnemyMix, string][] = [
  ['historical', 'As issued'],
  ['light', 'Mostly light'],
  ['heavy', 'Mostly heavy'],
];

const SEASON_OPTIONS: [OobSeason, string][] = [
  ['random', 'Random'],
  ['summer', 'Summer'],
  ['winter', 'Winter'],
];

const RANGE_OPTIONS: [OobRange, string][] = [
  ['random', 'Random'],
  ['close', 'Close, 0.5-0.75 km'],
  ['medium', 'Medium, 0.8-1.15 km'],
  ['long', 'Long, 1.2-1.6 km'],
];

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="random-orders__field">
      <span>{label}</span>
      {children}
    </label>
  );
}

const counts = (max: number) => Array.from({ length: max + 1 }, (_, i) => i);

/** Settings for a random order of battle, and the button that draws one up. */
export function OOBRandomPanel() {
  const settings = useGameStore((s) => s.oobRandomSettings);
  const setSettings = useGameStore((s) => s.setOobRandomSettings);
  const randomizeOob = useGameStore((s) => s.randomizeOob);
  const briefing = useGameStore((s) => s.oobBriefing);

  return (
    <section className="random-orders" aria-label="Random order of battle">
      <div className="random-orders__fields">
        <Field label="Your platoon">
          <select
            value={settings.alliedTanks ?? 'auto'}
            onChange={(e) => setSettings({ alliedTanks: e.target.value === 'auto' ? null : Number(e.target.value) })}
          >
            <option value="auto">Suits the map</option>
            {counts(MAX_ALLIED_TANKS).map((n) => (
              <option key={n} value={n}>{n === 0 ? 'You alone' : `You + ${n}`}</option>
            ))}
          </select>
        </Field>
        <Field label="Wingmen">
          <select value={settings.wingmen} onChange={(e) => setSettings({ wingmen: Number(e.target.value) })}
            title="Allied tanks that take your orders; the rest fight on their own">
            {counts(MAX_ALLIED_TANKS).map((n) => <option key={n} value={n}>{n === MAX_ALLIED_TANKS ? 'All' : `Up to ${n}`}</option>)}
          </select>
        </Field>
        <Field label="Odds">
          <select value={settings.odds} onChange={(e) => setSettings({ odds: e.target.value as OobOdds })}>
            {ODDS_OPTIONS.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
          </select>
        </Field>
        <Field label="Enemy tanks">
          <select value={settings.enemyMix} onChange={(e) => setSettings({ enemyMix: e.target.value as OobEnemyMix })}>
            {MIX_OPTIONS.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
          </select>
        </Field>
        <Field label="Year">
          <select
            value={settings.year ?? 'auto'}
            onChange={(e) => setSettings({ year: e.target.value === 'auto' ? null : Number(e.target.value) })}
          >
            <option value="auto">Your tank's service</option>
            {OOB_YEARS.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </Field>
        <Field label="Season">
          <select value={settings.season} onChange={(e) => setSettings({ season: e.target.value as OobSeason })}>
            {SEASON_OPTIONS.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
          </select>
        </Field>
        <Field label="Starting range">
          <select value={settings.range} onChange={(e) => setSettings({ range: e.target.value as OobRange })}>
            {RANGE_OPTIONS.map(([value, name]) => <option key={value} value={value}>{name}</option>)}
          </select>
        </Field>
      </div>
      <div className="random-orders__draw">
        <button type="button" className="plain-button" onClick={randomizeOob}
          title="Draw up both forces for your tank and deploy them facing each other on this map">
          Draw up forces
        </button>
        {briefing && <span className="random-orders__briefing">{briefing}</span>}
      </div>
    </section>
  );
}
