import { useGameStore, GUNNER_ZOOM_LABELS } from './store';
import { useEffect, useState } from 'react';
import { GAME_CONFIG } from './config';
import { getAmmoPenetrationAtDistance } from './penetrationModel';
import { getTankDef } from './tanks/registry';
import type { AllyBaseMoveOrder, AllyEffectiveMoveOrder, AllyEngagementPosture, AllyFireOrder, TankData } from './store';

const MAP_BUTTON_CLASS = 'pointer-events-auto rounded border px-2 py-1 text-xs font-bold tracking-wide transition-colors';

function OrderButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${MAP_BUTTON_CLASS} ${active ? 'border-yellow-300 bg-yellow-700/70 text-yellow-100' : 'border-gray-600 bg-black/50 text-gray-300 hover:border-yellow-500 hover:text-yellow-200'}`}
    >
      {children}
    </button>
  );
}

function ReloadIndicator() {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [burstRemaining, setBurstRemaining] = useState(0);
  const [magazineRounds, setMagazineRounds] = useState(0);
  const [magazineSize, setMagazineSize] = useState(0);

  useEffect(() => {
    let animationFrameId: number;

    const updateProgress = () => {
      const store = useGameStore.getState();
      const lastFireTime = store.lastFireTime;
      const now = Date.now();
      const timeSinceFire = now - lastFireTime;
      const playerTankType = store.playerTank.tankType;
      const def = getTankDef(playerTankType);

      setBurstRemaining(store.playerBurstRemaining);
      setMagazineRounds(store.playerMagazineRounds);
      setMagazineSize(def.automaticMagazineSize ?? 0);

      const remaining = Math.max(0, (def.reloadTime - timeSinceFire) / 1000);
      setSecondsLeft(remaining);
      animationFrameId = requestAnimationFrame(updateProgress);
    };

    updateProgress();

    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  const isBursting = burstRemaining > 0;
  const isAutomatic = magazineSize > 0;
  const isReloadingMagazine = isAutomatic && magazineRounds === 0 && secondsLeft > 0;
  const isReady = secondsLeft === 0 && !isBursting && !isReloadingMagazine;
  const label = isBursting
    ? `FIRING (${burstRemaining})`
    : isReloadingMagazine
      ? `RELOAD ${secondsLeft.toFixed(1)}s`
      : isAutomatic
        ? `READY ${magazineRounds}/${magazineSize}`
        : isReady
          ? 'READY'
          : `RELOAD ${secondsLeft.toFixed(1)}s`;

  return (
    <div className={`reload-status ${isReady ? 'is-ready' : 'is-cycling'}`}>
      <i aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

function PhysicsHUD() {
  const [physics, setPhysics] = useState({ speed: 0, rpm: 800, gear: 0, leftTrack: 0, rightTrack: 0 });

  useEffect(() => {
    let animationFrameId: number;
    const updatePhysics = () => {
      const tank = useGameStore.getState().playerTank;
      setPhysics({
        speed: tank.speed || 0,
        rpm: tank.engineRPM || 800,
        gear: tank.gear || 0,
        leftTrack: tank.leftTrackSpeed || 0,
        rightTrack: tank.rightTrackSpeed || 0
      });
      animationFrameId = requestAnimationFrame(updatePhysics);
    };
    updatePhysics();
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  const speedKmh = Math.abs(physics.speed * 3.6).toFixed(1);
  const rpm = Math.round(physics.rpm);
  const playerTankType = useGameStore.getState().playerTank.tankType;
  const tankDef = getTankDef(playerTankType);
  const hp = Math.round(tankDef.horsepower * (physics.rpm / GAME_CONFIG.tank.maxRPM));
  const gearStr = physics.gear === 0 ? 'N' : physics.gear < 0 ? 'R' : `D${physics.gear}`;

  return (
    <div className="driver-cluster">
      <div className="driver-readout driver-readout--speed">
        <span>ROAD SPEED</span>
        <strong>{speedKmh}</strong>
        <small>KM/H</small>
      </div>
      <div className="driver-readout driver-readout--gear">
        <span>GEAR</span>
        <strong>{gearStr}</strong>
      </div>
      <div className="driver-readout driver-readout--rpm">
        <span>ENGINE</span>
        <strong>{rpm}</strong>
        <small>RPM / {hp} HP</small>
      </div>
      <div className="track-readouts" aria-label="Track drive output">
        <div className="track-readout">
          <span>L</span>
          <div className="track-scale">
            <div className={physics.leftTrack >= 0 ? 'is-forward' : 'is-reverse'}
              style={{ height: `${Math.min(50, Math.abs(physics.leftTrack / 12) * 50)}%`, [physics.leftTrack >= 0 ? 'bottom' : 'top']: '50%' }} />
          </div>
        </div>
        <div className="track-readout">
          <span>R</span>
          <div className="track-scale">
            <div className={physics.rightTrack >= 0 ? 'is-forward' : 'is-reverse'}
              style={{ height: `${Math.min(50, Math.abs(physics.rightTrack / 12) * 50)}%`, [physics.rightTrack >= 0 ? 'bottom' : 'top']: '50%' }} />
          </div>
        </div>
      </div>
    </div>
  );
}

function GunnerSightOverlay() {
  const calibrationDistance = useGameStore((state) => state.calibrationDistance);
  const ammoType = useGameStore((state) => state.ammoType);
  const gunnerZoom = useGameStore((state) => state.gunnerZoom);
  const playerTankType = useGameStore((state) => state.playerTank.tankType);
  const playerDef = getTankDef(playerTankType);
  const ammo = playerDef.weapons[ammoType] ?? playerDef.weapons.AP;
  const velocity = ammo.velocity;
  const penetrationAtSightDistance = Math.round(
    getAmmoPenetrationAtDistance(ammo, ammoType, playerDef.caliber, calibrationDistance),
  );

  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
      {/* Black vignette/mask */}
      <div className="absolute inset-0 bg-[radial-gradient(circle,transparent_40%,black_70%)]" />

      {/* The center dot is the active zero for the selected calibration distance. */}
      <div className="relative w-full h-full flex items-center justify-center">
        {/* Main horizontal line */}
        <div className="absolute w-1/2 h-0.5 bg-red-500/80" />
        {/* Main vertical line */}
        <div className="absolute h-[200%] w-0.5 bg-red-500/80" />

        {/* Center dot */}
        <div className="absolute w-1 h-1 bg-red-500 rounded-full" />
        <div className="absolute top-1/2 left-1/2 ml-3 mt-3 text-xs font-bold tracking-widest text-yellow-400/90">
          ZERO {calibrationDistance}m
        </div>
      </div>

      {/* Info panel */}
      <div className="absolute bottom-10 left-10 text-red-500 font-mono text-xl">
        <div>ZOOM: {GUNNER_ZOOM_LABELS[gunnerZoom]}</div>
        <div>DIST: {calibrationDistance}m</div>
        <div>AMMO: {ammoType}</div>
        <div className="text-sm opacity-80">VEL: {velocity}m/s</div>
        <div className="text-sm opacity-80">PEN: {penetrationAtSightDistance}mm</div>
      </div>
    </div>
  );
}

function TrackDamageStatus() {
  const trackDestroyed = useGameStore((state) => state.playerTank.trackDestroyed);
  const trackRepairActive = useGameStore((state) => state.playerTank.trackRepairActive);
  const trackRepairProgress = useGameStore((state) => state.playerTank.trackRepairProgress);

  const statuses: string[] = [];

  if (trackDestroyed.left) {
    statuses.push(trackRepairActive.left ? 'Left track damaged - repairing' : trackRepairProgress.left > 0 ? 'Left track damaged - repair paused' : 'Left track damaged');
  }

  if (trackDestroyed.right) {
    statuses.push(trackRepairActive.right ? 'Right track damaged - repairing' : trackRepairProgress.right > 0 ? 'Right track damaged - repair paused' : 'Right track damaged');
  }

  if (statuses.length === 0) return null;

  return (
    <div className="mt-2 flex flex-col gap-1">
      {statuses.map((status) => (
        <div key={status} className="text-sm font-bold text-red-400">
          {status}
        </div>
      ))}
    </div>
  );
}

interface DirectionMarker {
  angle: number; // relative bearing in degrees (-180 to 180)
  distance: number; // in meters
  label: string;
  color: string;
  destroyed: boolean;
}

function DirectionIndicator() {
  const playerTank = useGameStore((state) => state.playerTank);
  const enemies = useGameStore((state) => state.enemies);
  const allies = useGameStore((state) => state.allies);
  const cameraYawAbs = useGameStore((state) => state.cameraYawAbs);
  const playerSideSpotting = useGameStore((state) => state.playerSideSpotting);

  const px = playerTank.position.x;
  const pz = playerTank.position.z;
  const playerYaw = cameraYawAbs;

  const toMarker = (t: TankData, color: string, label: string): DirectionMarker => {
    const dx = t.position.x - px;
    const dz = t.position.z - pz;
    const dist = Math.sqrt(dx * dx + dz * dz);
    // atan2 gives angle from +Z axis (forward). Invert the relative angle so
    // the HUD bar matches the screen-space left/right camera motion.
    let bearing = -(Math.atan2(dx, dz) - playerYaw);
    // Normalize to -PI..PI
    bearing = ((bearing + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
    return { angle: bearing * (180 / Math.PI), distance: dist, label, color, destroyed: false };
  };

  const markers: DirectionMarker[] = [];
  enemies.forEach((e, i) => {
    if (!e.destroyed && playerSideSpotting[e.id]?.spotted) {
      markers.push(toMarker(e, '#ef4444', `E${i + 1}`));
    }
  });
  allies.forEach((a, i) => {
    if (!a.destroyed) {
      markers.push(toMarker(a, '#3b82f6', `A${i + 1}`));
    }
  });

  if (markers.length === 0) return null;

  // FOV range shown on the bar: full 360 degrees
  // Map angle (-180..180) to percentage (0..100)
  const angleToPercent = (deg: number) => ((deg + 180) / 360) * 100;

  return (
    <div className="bearing-strip">
      {/* Bar background */}
      <div className="bearing-track">
        {/* Center tick (forward direction) */}
        <div className="bearing-center-line" />
        <div className="bearing-forward">FWD</div>
        {/* 90° ticks */}
        <div className="absolute top-0 h-full w-px bg-gray-700" style={{ left: '25%' }} />
        <div className="absolute top-0 h-full w-px bg-gray-700" style={{ left: '75%' }} />

        {/* Markers */}
        {markers.map((m, i) => {
          const pct = angleToPercent(m.angle);
          const distHm = Math.round(m.distance / 100); // in 100m units
          return (
            <div
              key={i}
              className="absolute top-1 flex flex-col items-center -translate-x-1/2"
              style={{ left: `${pct}%` }}
            >
              {/* Triangle marker */}
              <div style={{
                width: 0, height: 0,
                borderLeft: '5px solid transparent',
                borderRight: '5px solid transparent',
                borderTop: `8px solid ${m.color}`,
              }} />
              <div className="text-[10px] font-bold leading-tight whitespace-nowrap" style={{ color: m.color }}>
                {distHm}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MapModeHUD() {
  const selectedAllyId = useGameStore((state) => state.selectedAllyId);
  const allies = useGameStore((state) => state.allies);
  const selectedAlly = selectedAllyId ? allies.find(a => a.id === selectedAllyId) : null;
  const baseMoveOrder = useGameStore((state) => selectedAllyId ? state.allyBaseMoveOrders[selectedAllyId] : undefined) ?? 'follow';
  const fireOrder = useGameStore((state) => selectedAllyId ? state.allyFireOrders[selectedAllyId] : undefined) ?? 'fire-at-will';
  const engagementPosture = useGameStore((state) => selectedAllyId ? state.allyEngagementPostures[selectedAllyId] : undefined) ?? 'fire-from-position';
  const waypoint = useGameStore((state) => selectedAllyId ? state.allyWaypoints[selectedAllyId] : undefined);
  const effectiveMoveOrder: AllyEffectiveMoveOrder = waypoint ? 'move' : (baseMoveOrder as AllyBaseMoveOrder);
  const setAllyBaseMoveOrder = useGameStore((state) => state.setAllyBaseMoveOrder);
  const setAllyFireOrder = useGameStore((state) => state.setAllyFireOrder);
  const setAllyEngagementPosture = useGameStore((state) => state.setAllyEngagementPosture);
  const clearAllyWaypoint = useGameStore((state) => state.clearAllyWaypoint);

  return (
    <div data-map-hud="true" className="pointer-events-auto mt-4 max-w-md bg-black/55 p-3 text-sm font-bold text-yellow-400 border border-yellow-900/70 rounded">
      <div className="text-xl animate-pulse">MAP MODE ACTIVE</div>
      <div className="mt-1 text-sm text-gray-300 font-normal">
        WASD/Drag - Pan | Scroll - Zoom | M - Exit
      </div>
      <div className="mt-3 text-sm font-normal">
        {selectedAlly ? (
          <div className="space-y-3">
            <div>
              <div className="text-yellow-300">
                Selected: <span className="uppercase">{selectedAlly.tankType}</span>
              </div>
              <div className="mt-1 text-gray-400">
                Task: <span className="text-white uppercase">{effectiveMoveOrder}</span> | Fire: <span className="text-white uppercase">{fireOrder}</span>
              </div>
              <div className="mt-1 text-gray-400">
                Posture: <span className="text-white uppercase">{engagementPosture}</span>
              </div>
              <div className="mt-1 text-gray-400">
                {waypoint ? 'Right-click to update waypoint' : 'Right-click to assign waypoint'}
              </div>
            </div>

            <div>
              <div className="mb-1 text-xs uppercase tracking-[0.2em] text-gray-500">Movement</div>
              <div className="flex flex-wrap gap-2">
                <OrderButton active={baseMoveOrder === 'follow' && !waypoint} onClick={() => selectedAllyId && setAllyBaseMoveOrder(selectedAllyId, 'follow')}>
                  Follow
                </OrderButton>
                <OrderButton active={baseMoveOrder === 'hold' && !waypoint} onClick={() => selectedAllyId && setAllyBaseMoveOrder(selectedAllyId, 'hold')}>
                  Hold
                </OrderButton>
                {waypoint && selectedAllyId && (
                  <OrderButton active={true} onClick={() => clearAllyWaypoint(selectedAllyId)}>
                    Clear Waypoint
                  </OrderButton>
                )}
              </div>
            </div>

            <div>
              <div className="mb-1 text-xs uppercase tracking-[0.2em] text-gray-500">Fire Control</div>
              <div className="flex flex-wrap gap-2">
                <OrderButton active={fireOrder === 'hold-fire'} onClick={() => selectedAllyId && setAllyFireOrder(selectedAllyId, 'hold-fire')}>
                  Hold Fire
                </OrderButton>
                <OrderButton active={fireOrder === 'return-fire'} onClick={() => selectedAllyId && setAllyFireOrder(selectedAllyId, 'return-fire')}>
                  Return Fire
                </OrderButton>
                <OrderButton active={fireOrder === 'fire-at-will'} onClick={() => selectedAllyId && setAllyFireOrder(selectedAllyId, 'fire-at-will')}>
                  Fire At Will
                </OrderButton>
              </div>
            </div>

            <div>
              <div className="mb-1 text-xs uppercase tracking-[0.2em] text-gray-500">Engagement</div>
              <div className="flex flex-wrap gap-2">
                <OrderButton active={engagementPosture === 'fire-from-position'} onClick={() => selectedAllyId && setAllyEngagementPosture(selectedAllyId, 'fire-from-position')}>
                  Fire In Place
                </OrderButton>
                <OrderButton active={engagementPosture === 'advance-and-fire'} onClick={() => selectedAllyId && setAllyEngagementPosture(selectedAllyId, 'advance-and-fire')}>
                  Advance And Fire
                </OrderButton>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-gray-400">Left-click an ally to select, then right-click to issue a waypoint</div>
        )}
      </div>
    </div>
  );
}

function GunnerFireOverlay() {
  const [effect, setEffect] = useState({ flash: 0, smoke: 0 });

  useEffect(() => {
    let raf = 0;

    const update = () => {
      const { lastFireTime } = useGameStore.getState();
      const elapsed = Date.now() - lastFireTime;

      if (elapsed >= 0 && elapsed < 420) {
        const flashProgress = Math.min(elapsed / 120, 1);
        const smokeProgress = Math.min(elapsed / 420, 1);
        setEffect({
          flash: 1 - Math.pow(flashProgress, 0.7),
          smoke: 1 - Math.pow(smokeProgress, 1.6),
        });
      } else {
        setEffect((prev) => (prev.flash !== 0 || prev.smoke !== 0 ? { flash: 0, smoke: 0 } : prev));
      }

      raf = requestAnimationFrame(update);
    };

    update();
    return () => cancelAnimationFrame(raf);
  }, []);

  if (effect.flash <= 0 && effect.smoke <= 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          opacity: effect.flash * 0.45,
          background: 'radial-gradient(circle at center, rgba(255,250,235,0.95) 0%, rgba(255,214,140,0.45) 22%, rgba(255,180,80,0.12) 44%, rgba(255,255,255,0) 68%)',
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          opacity: effect.smoke * 0.75,
          background: 'radial-gradient(ellipse 72% 58% at 50% 54%, rgba(250,248,242,0.7) 0%, rgba(222,216,206,0.45) 22%, rgba(156,152,146,0.22) 42%, rgba(255,255,255,0) 72%)',
          transform: `scale(${1 + (1 - effect.smoke) * 0.12})`,
          filter: 'blur(12px)',
        }}
      />
      <div
        className="absolute inset-x-[18%] top-[28%] bottom-[18%]"
        style={{
          opacity: effect.smoke * 0.42,
          background: 'linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(245,243,236,0.26) 30%, rgba(205,201,194,0.22) 62%, rgba(255,255,255,0) 100%)',
          filter: 'blur(18px)',
        }}
      />
    </div>
  );
}

export function UI() {
  const health = useGameStore((state) => state.playerTank.health);
  const maxHealth = useGameStore((state) => state.playerTank.maxHealth);
  const destroyed = useGameStore((state) => state.playerTank.destroyed);
  const ammoType = useGameStore((state) => state.ammoType);
  const messages = useGameStore((state) => state.messages);

  const viewMode = useGameStore((state) => state.viewMode);
  const isMapMode = useGameStore((state) => state.isMapMode);
  const playerTankType = useGameStore((state) => state.playerTank.tankType);
  const playerName = getTankDef(playerTankType).displayName;

  return (
    <div className="battle-hud">
      {viewMode === 'gunner' && !isMapMode && <GunnerSightOverlay />}
      {viewMode === 'gunner' && !isMapMode && <GunnerFireOverlay />}

      {!isMapMode && <DirectionIndicator />}

      {/* Top Left: Status */}
      <div className="vehicle-status">
        <div className="vehicle-status-heading">
          <span>PLAYER VEHICLE</span>
          <strong>{playerName}</strong>
        </div>
        <div className="hull-integrity">
          <div className="hull-integrity-label">
            <span>HULL INTEGRITY</span><strong>{Math.max(0, Math.round(health))} / {maxHealth}</strong>
          </div>
          <div className="hull-integrity-track">
            <div 
              className="hull-integrity-fill"
              style={{ width: `${Math.max(0, (health / maxHealth) * 100)}%` }}
            />
          </div>
        </div>
        {viewMode !== 'gunner' && <TrackDamageStatus />}
        <div className="ammo-status">
          <span>LOADED ROUND</span>
          <strong className={ammoType === 'AP' ? 'is-ap' : ammoType === 'APC' ? 'is-apc' : 'is-he'}>{ammoType}</strong>
        </div>
        <ReloadIndicator />
        {isMapMode && <MapModeHUD />}
      </div>

      {/* Crosshair - only in third person */}
      {viewMode === 'third-person' && !isMapMode && (
        <div className="commander-reticle" aria-hidden="true">
          <i /><i /><i />
        </div>
      )}

      {/* Bottom Left: Messages */}
      <div className="battle-messages">
        {messages.map((m) => (
          <div key={m.id} style={{ color: m.color }} className="text-lg font-bold drop-shadow-md">
            {m.text}
          </div>
        ))}
      </div>

      {!isMapMode && <PhysicsHUD />}

      {destroyed && (
        <div className="destroyed-overlay">
          <div><span>CREW REPORT</span><h2>VEHICLE LOST</h2></div>
        </div>
      )}
    </div>
  );
}
