import type { CSSProperties, ReactNode } from 'react';
import type { CamouflageScheme } from '../tanks/core/camouflage';

/**
 * Shared pieces of the pre-battle screens: the period armour symbol used on
 * command-post maps, the vehicle data plate, and paint chips.
 */

export type ForceSide = 'friendly' | 'enemy' | 'player' | 'destroyed';

/**
 * Armour unit symbol as drawn on 1940s situation maps: a rectangle with an
 * oval for the track. Blue grease pencil for our own forces, red for the enemy.
 * The player's own tank carries a filled oval.
 */
export function ArmourSymbol({ side, size = 22, title }: { side: ForceSide; size?: number; title?: string }) {
  const stroke = side === 'enemy' ? 'var(--pencil-red)' : side === 'destroyed' ? 'var(--chalk-dim)' : 'var(--pencil-blue)';
  return (
    <svg className="armour-symbol" width={size} height={size * 0.64} viewBox="0 0 34 22" role={title ? 'img' : undefined}
      aria-label={title} aria-hidden={title ? undefined : true}>
      <rect x="1.5" y="1.5" width="31" height="19" fill="none" stroke={stroke} strokeWidth="2.4" />
      <rect x="7" y="6" width="20" height="10" rx="5" fill={side === 'player' ? stroke : 'none'} stroke={stroke} strokeWidth="2" />
    </svg>
  );
}

export interface PlateRow {
  label: string;
  value: number;
  unit?: string;
  /** Position on the engraved scale, 0..1 against the best vehicle in the catalogue. */
  fraction: number;
}

/** Stamped brass data plate with the vehicle's figures. */
export function DataPlate({ title, subtitle, rows, footer, compact = false }: {
  title: string;
  subtitle: string;
  rows: PlateRow[];
  footer?: ReactNode;
  compact?: boolean;
}) {
  return (
    <section className={`data-plate${compact ? ' data-plate--compact' : ''}`} aria-label={`${title} data`}>
      <i className="data-plate__rivet data-plate__rivet--tl" />
      <i className="data-plate__rivet data-plate__rivet--tr" />
      <i className="data-plate__rivet data-plate__rivet--bl" />
      <i className="data-plate__rivet data-plate__rivet--br" />
      <header className="data-plate__head">
        <strong>{title}</strong>
        <span>{subtitle}</span>
      </header>
      <dl className="data-plate__rows">
        {rows.map((row) => (
          <div key={row.label} className="data-plate__row">
            <dt>{row.label}</dt>
            <dd>
              <span className="data-plate__value">{row.value}<small>{row.unit}</small></span>
              <span className="data-plate__scale" style={{ '--fraction': Math.max(0, Math.min(1, row.fraction)) } as CSSProperties} />
            </dd>
          </div>
        ))}
      </dl>
      {footer && <footer className="data-plate__foot">{footer}</footer>}
    </section>
  );
}

/** A painted chip of each colour in the scheme, as on a paint card. */
export function PaintChip({ scheme }: { scheme: CamouflageScheme }) {
  const colours = [scheme.base, ...scheme.colors];
  return (
    <span className="paint-chip" aria-hidden="true">
      {colours.map((colour) => <span key={colour} style={{ backgroundColor: colour }} />)}
    </span>
  );
}
