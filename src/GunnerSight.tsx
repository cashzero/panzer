import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useGameStore, GUNNER_ZOOM_LABELS } from './store';
import { getAmmoPenetrationAtDistance } from './penetrationModel';
import { getTankDef } from './tanks/registry';

/**
 * The gunner's sight picture, drawn after the telescope each nation fitted:
 * German Turmzielfernrohr triangles under a range ring turned to the set
 * range, the American M70 cross with its deflection scale, and the Soviet
 * chevrons beside a sliding range scale. Whatever the pattern, the aim point
 * at the centre is the calibrated point of impact at the selected zero.
 *
 * The reticle keeps its size in the eyepiece at every magnification, as in a
 * fixed-reticle telescope; it marks the aim point and lead, it is not a
 * rangefinder.
 */

type SightPattern = 'tzf' | 'm70' | 'tsh';

function sightPattern(nationality: string): SightPattern {
  if (nationality === 'Germany') return 'tzf';
  if (nationality === 'Soviet Union') return 'tsh';
  return 'm70';
}

const MAX_RANGE = 2000; // m, the furthest the gun can be zeroed

function useViewport() {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

/** An engraved line: a pale halo under black ink, so it reads on dark ground and bright sky alike. */
function Etch({ d, width = 1.6, fill = false }: { d: string; width?: number; fill?: boolean }) {
  return (
    <>
      <path d={d} className="reticle-halo" strokeWidth={width + 2.4} fill={fill ? undefined : 'none'} />
      <path d={d} className={fill ? 'reticle-ink reticle-ink--solid' : 'reticle-ink'} strokeWidth={width} />
    </>
  );
}

/** Triangle with its apex at (x, y), pointing up. */
const triangle = (x: number, y: number, height: number) =>
  `M${x} ${y} L${x + height * 0.55} ${y + height} L${x - height * 0.55} ${y + height} Z`;

/**
 * Turmzielfernrohr (TZF 5 / TZF 9): seven triangles on one line, the large
 * centre one the aim point; the range ring at the top turns until the set
 * range stands under the fixed pointer.
 */
function TzfReticle({ cx, cy, r, range, ammoLabel }: { cx: number; cy: number; r: number; range: number; ammoLabel: string }) {
  const spacing = r * 0.13;
  const big = r * 0.085;
  const marks: ReactNode[] = [];
  for (let k = 1; k <= 3; k++) {
    marks.push(<Etch key={`l${k}`} d={triangle(cx - k * spacing, cy, big * 0.5)} fill width={1} />);
    marks.push(<Etch key={`r${k}`} d={triangle(cx + k * spacing, cy, big * 0.5)} fill width={1} />);
  }
  // Ring in hectometres, 5 degrees apart; only the arc either side of the pointer shows.
  const step = 5;
  const ringRadius = r * 0.8;
  const ring: ReactNode[] = [];
  for (let hm = 0; hm <= MAX_RANGE / 100; hm++) {
    const tick = hm % 2 === 0 ? r * 0.045 : r * 0.025;
    ring.push(
      <g key={hm} transform={`rotate(${hm * step} ${cx} ${cy})`}>
        <Etch d={`M${cx} ${cy - ringRadius - r * 0.045} L${cx} ${cy - ringRadius - r * 0.045 + tick}`} width={1.2} />
        {hm % 2 === 0 && <text x={cx} y={cy - ringRadius + r * 0.055} className="reticle-text">{hm}</text>}
      </g>,
    );
  }
  const wedge = (angle: number) => {
    const a = (angle * Math.PI) / 180;
    return `${cx + Math.sin(a) * r * 1.2} ${cy - Math.cos(a) * r * 1.2}`;
  };
  return (
    <>
      <defs>
        <mask id="tzf-ring-window" maskUnits="userSpaceOnUse">
          <path d={`M${cx} ${cy} L${wedge(-42)} L${wedge(0)} L${wedge(42)} Z`} fill="white" />
        </mask>
      </defs>
      <g mask="url(#tzf-ring-window)">
        <g className="reticle-ring" style={{ transform: `rotate(${-(range / 100) * step}deg)`, transformOrigin: `${cx}px ${cy}px` }}>
          {ring}
        </g>
      </g>
      {/* Fixed pointer over the ring. */}
      <Etch d={triangle(cx, cy - ringRadius - r * 0.05, -r * 0.05)} fill width={1} />
      <text x={cx} y={cy - ringRadius + r * 0.14} className="reticle-text reticle-text--small">{ammoLabel}</text>
      <Etch d={triangle(cx, cy, big)} fill width={1.2} />
      {marks}
    </>
  );
}

/** M70: a deflection scale across the field and a vertical below the aim point. */
function M70Reticle({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const gap = r * 0.035;
  const width = r * 0.62;
  const mil = width / 30; // the scale reads 30-0-30
  const parts: ReactNode[] = [
    <Etch key="h" d={`M${cx - width} ${cy} L${cx - gap} ${cy} M${cx + gap} ${cy} L${cx + width} ${cy}`} />,
    <Etch key="v" d={`M${cx} ${cy + gap} L${cx} ${cy + r * 0.62}`} />,
    <Etch key="c" d={`M${cx - r * 0.012} ${cy} L${cx + r * 0.012} ${cy} M${cx} ${cy - r * 0.012} L${cx} ${cy + r * 0.012}`} width={1.4} />,
  ];
  for (let m = 5; m <= 30; m += 5) {
    const tall = m % 10 === 0;
    for (const side of [-1, 1]) {
      const x = cx + side * m * mil;
      parts.push(<Etch key={`t${side}${m}`} d={`M${x} ${cy} L${x} ${cy - (tall ? r * 0.05 : r * 0.028)}`} width={1.2} />);
      if (tall) parts.push(<text key={`n${side}${m}`} x={x} y={cy - r * 0.075} className="reticle-text reticle-text--small">{m}</text>);
    }
  }
  for (let i = 1; i <= 7; i++) {
    const y = cy + i * r * 0.075;
    const half = i % 2 === 0 ? r * 0.05 : r * 0.028;
    parts.push(<Etch key={`r${i}`} d={`M${cx - half} ${y} L${cx + half} ${y}`} width={1.2} />);
  }
  return <>{parts}</>;
}

/**
 * Soviet TSh / TMFD: an inverted-V aim mark with lead chevrons either side,
 * and a vertical range scale at the left whose pointer slides to the set range.
 */
function TshReticle({ cx, cy, r, range, ammoLabel }: { cx: number; cy: number; r: number; range: number; ammoLabel: string }) {
  const chevron = (x: number, size: number) => `M${x - size} ${cy + size * 0.9} L${x} ${cy} L${x + size} ${cy + size * 0.9}`;
  const parts: ReactNode[] = [<Etch key="c" d={chevron(cx, r * 0.07)} width={2.6} />];
  for (const k of [1, 2]) {
    for (const side of [-1, 1]) parts.push(<Etch key={`${side}${k}`} d={chevron(cx + side * k * r * 0.14, r * 0.035)} width={1.8} />);
  }
  const x = cx - r * 0.62;
  const top = cy - r * 0.5;
  const span = r;
  const hundreds = MAX_RANGE / 100;
  const scale: ReactNode[] = [<Etch key="s" d={`M${x} ${top} L${x} ${top + span}`} width={1.2} />];
  for (let h = 0; h <= hundreds; h++) {
    const y = top + (h / hundreds) * span;
    const long = h % 4 === 0;
    scale.push(<Etch key={`k${h}`} d={`M${x - (long ? r * 0.04 : r * 0.022)} ${y} L${x} ${y}`} width={1.1} />);
    if (long) scale.push(<text key={`t${h}`} x={x - r * 0.1} y={y + r * 0.016} className="reticle-text reticle-text--small">{h}</text>);
  }
  const pointerY = top + (range / MAX_RANGE) * span;
  return (
    <>
      {parts}
      {scale}
      <text x={x - r * 0.05} y={top - r * 0.05} className="reticle-text reticle-text--small">{ammoLabel}</text>
      <g className="reticle-slider" style={{ transform: `translateY(${pointerY - top}px)` } as CSSProperties}>
        <Etch d={`M${x} ${top} L${x + r * 0.09} ${top}`} width={1.8} />
      </g>
    </>
  );
}

export function GunnerSight() {
  const calibrationDistance = useGameStore((state) => state.calibrationDistance);
  const ammoType = useGameStore((state) => state.ammoType);
  const gunnerZoom = useGameStore((state) => state.gunnerZoom);
  const playerTankType = useGameStore((state) => state.playerTank.tankType);
  const { width, height } = useViewport();

  const def = getTankDef(playerTankType);
  const ammo = def.weapons[ammoType] ?? def.weapons.AP;
  const penetration = Math.round(getAmmoPenetrationAtDistance(ammo, ammoType, def.caliber, calibrationDistance));
  const pattern = sightPattern(def.nationality);
  const cx = width / 2;
  const cy = height / 2;
  const r = Math.min(width, height) * 0.46;
  const isHe = ammoType === 'HE';
  // Range scales are cut per round: Panzergranate or Sprenggranate, bronebojnyj or oskolochno-fugasnyj.
  const ammoLabel = pattern === 'tzf' ? (isHe ? 'Sprgr.' : 'Pzgr.') : pattern === 'tsh' ? (isHe ? 'ОФ' : 'БР') : ammoType;

  return (
    <div className="gunner-sight" aria-hidden="true">
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <mask id="eyepiece" maskUnits="userSpaceOnUse">
            <rect width={width} height={height} fill="white" />
            <circle cx={cx} cy={cy} r={r} fill="black" />
          </mask>
          <radialGradient id="eyepiece-shade" cx={cx} cy={cy} r={r} gradientUnits="userSpaceOnUse">
            <stop offset="0.78" stopColor="#000" stopOpacity="0" />
            <stop offset="0.95" stopColor="#000" stopOpacity="0.45" />
            <stop offset="1" stopColor="#000" stopOpacity="0.85" />
          </radialGradient>
        </defs>
        <circle cx={cx} cy={cy} r={r} fill="url(#eyepiece-shade)" />
        {pattern === 'tzf' && <TzfReticle cx={cx} cy={cy} r={r} range={calibrationDistance} ammoLabel={ammoLabel} />}
        {pattern === 'm70' && <M70Reticle cx={cx} cy={cy} r={r} />}
        {pattern === 'tsh' && <TshReticle cx={cx} cy={cy} r={r} range={calibrationDistance} ammoLabel={ammoLabel} />}
        <rect width={width} height={height} className="eyepiece-body" mask="url(#eyepiece)" />
        <circle cx={cx} cy={cy} r={r} className="eyepiece-rim" />
      </svg>

      <section className="sight-data hud-plate" aria-label="Sight">
        <div className="hud-row"><span>Magnification</span><strong>{GUNNER_ZOOM_LABELS[gunnerZoom].replace('x', '×')}</strong></div>
        <div className="hud-row"><span>Range set</span><strong>{calibrationDistance} m</strong></div>
        <div className="hud-row"><span>Round</span><strong>{ammoType}, {ammo.velocity} m/s</strong></div>
        <div className="hud-row"><span>Penetration</span><strong>{penetration} mm</strong></div>
      </section>
    </div>
  );
}
