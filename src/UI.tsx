import { useGameStore, GUNNER_ZOOM_LABELS } from './store';
import { useEffect, useState } from 'react';
import { GAME_CONFIG } from './config';
import { getAmmoPenetrationAtDistance } from './penetrationModel';
import { getTankDef } from './tanks/registry';
import type { AllyBaseMoveOrder, AllyEngagementPosture, AllyFireOrder, TankData } from './store';
import { gridReference, mapView } from './MapMode';
import { ArmourSymbol } from './screens/menuParts';



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
    ? `Firing, ${burstRemaining} left`
    : isReloadingMagazine
      ? `Reloading ${secondsLeft.toFixed(1)} s`
      : isAutomatic
        ? `Ready, ${magazineRounds} of ${magazineSize}`
        : isReady
          ? 'Ready to fire'
          : `Reloading ${secondsLeft.toFixed(1)} s`;

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
    <div className="driver-cluster hud-plate">
      <div className="driver-readout">
        <span>Speed</span>
        <strong>{speedKmh}</strong>
        <small>km/h</small>
      </div>
      <div className="driver-readout driver-readout--gear">
        <span>Gear</span>
        <strong>{gearStr}</strong>
      </div>
      <div className="driver-readout">
        <span>Engine</span>
        <strong>{rpm}</strong>
        <small>rpm, {hp} hp</small>
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
      {/* Bottom right, clear of the battle messages on the left. */}
      <div className="absolute bottom-10 right-10 text-right text-red-500 font-mono text-xl">
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
    statuses.push(trackRepairActive.left ? 'Left track broken, crew repairing' : trackRepairProgress.left > 0 ? 'Left track broken, repair paused' : 'Left track broken');
  }

  if (trackDestroyed.right) {
    statuses.push(trackRepairActive.right ? 'Right track broken, crew repairing' : trackRepairProgress.right > 0 ? 'Right track broken, repair paused' : 'Right track broken');
  }

  if (statuses.length === 0) return null;

  return (
    <>
      {statuses.map((status) => <p key={status} className="track-damage">{status}</p>)}
    </>
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
      markers.push(toMarker(e, '#e0766a', `E${i + 1}`));
    }
  });
  allies.forEach((a, i) => {
    if (!a.destroyed) {
      markers.push(toMarker(a, '#8fb0dc', `A${i + 1}`));
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
        <div className="bearing-forward">Ahead</div>
        {/* 90° ticks */}
        <div className="bearing-quarter" style={{ left: '25%' }} />
        <div className="bearing-quarter" style={{ left: '75%' }} />

        {/* Markers */}
        {markers.map((m, i) => {
          const pct = angleToPercent(m.angle);
          const distHm = Math.round(m.distance / 100); // in 100m units
          return (
            <div key={i} className="bearing-marker" style={{ left: `${pct}%`, color: m.color }}>
              {/* Triangle marker */}
              <div style={{
                width: 0, height: 0,
                borderLeft: '5px solid transparent',
                borderRight: '5px solid transparent',
                borderTop: `8px solid ${m.color}`,
              }} />
              <span>{distHm}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const MOVE_LABEL: Record<AllyBaseMoveOrder, string> = { follow: 'Follow me', hold: 'Hold here' };
const FIRE_LABEL: Record<AllyFireOrder, string> = { 'hold-fire': 'Hold fire', 'return-fire': 'Return fire', 'fire-at-will': 'Fire at will' };
const POSTURE_LABEL: Record<AllyEngagementPosture, string> = { 'fire-from-position': 'Fire from position', 'advance-and-fire': 'Advance and fire' };

/** Scale bar sized to a round distance, redrawn as the map zooms. */
function MapScaleBar() {
  const [bar, setBar] = useState({ metres: 100, pixels: 100 });
  useEffect(() => {
    const timer = window.setInterval(() => {
      // The longest round distance that still fits the panel beside its label.
      const steps = [5, 10, 25, 50, 100, 200, 250, 500, 1000, 2000];
      const metres = steps.filter((step) => step / mapView.metresPerPixel <= 170).pop() ?? steps[0];
      setBar((current) => {
        const pixels = Math.round(metres / mapView.metresPerPixel);
        return current.metres === metres && current.pixels === pixels ? current : { metres, pixels };
      });
    }, 120);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="map-orders__scale" aria-label={`Scale: ${bar.metres} metres`}>
      <i style={{ width: bar.pixels }} />
      <span>{bar.metres >= 1000 ? `${bar.metres / 1000} km` : `${bar.metres} m`}</span>
    </div>
  );
}

function MapModeHUD() {
  const allies = useGameStore((state) => state.allies);
  const selectedAllyId = useGameStore((state) => state.selectedAllyId);
  const selectAlly = useGameStore((state) => state.selectAlly);
  const moveOrders = useGameStore((state) => state.allyBaseMoveOrders);
  const fireOrders = useGameStore((state) => state.allyFireOrders);
  const postures = useGameStore((state) => state.allyEngagementPostures);
  const waypoints = useGameStore((state) => state.allyWaypoints);
  const terrainSize = useGameStore((state) => state.roadNetwork.terrainSize);
  const setAllyBaseMoveOrder = useGameStore((state) => state.setAllyBaseMoveOrder);
  const setAllyFireOrder = useGameStore((state) => state.setAllyFireOrder);
  const setAllyEngagementPosture = useGameStore((state) => state.setAllyEngagementPosture);
  const clearAllyWaypoint = useGameStore((state) => state.clearAllyWaypoint);

  const selected = allies.find((ally) => ally.id === selectedAllyId && !ally.destroyed) ?? null;
  const name = (ally: TankData, index: number) => `${getTankDef(ally.tankType).displayName} ${index + 1}`;
  const task = (ally: TankData) => {
    if (ally.destroyed) return 'Knocked out';
    const waypoint = waypoints[ally.id];
    if (waypoint) return `Moving to ${gridReference(waypoint.x, waypoint.z, terrainSize)}`;
    return (moveOrders[ally.id] ?? 'follow') === 'hold' ? 'Holding' : 'Following you';
  };

  return (
    <aside data-map-hud="true" className="map-orders">
      <h2>Tactical map</h2>
      <p className="map-orders__hint">Drag or use W A S D to pan, scroll to zoom. Press M to return.</p>
      <MapScaleBar />

      {allies.length > 0 ? (
        <>
          <h3>Your tanks</h3>
          <ul className="map-orders__allies">
            {allies.map((ally, index) => (
              <li key={ally.id}>
                <button type="button" aria-pressed={ally.id === selected?.id} disabled={ally.destroyed}
                  onClick={() => selectAlly(ally.id === selected?.id ? null : ally.id)}>
                  <ArmourSymbol side={ally.destroyed ? 'destroyed' : 'friendly'} size={24} />
                  <span>{name(ally, index)}</span>
                  <small>{task(ally)}</small>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="map-orders__hint">You have no allied tanks to command.</p>
      )}

      {selected && (() => {
        const waypoint = waypoints[selected.id];
        const move = (moveOrders[selected.id] ?? 'follow') as AllyBaseMoveOrder;
        const fire = (fireOrders[selected.id] ?? 'fire-at-will') as AllyFireOrder;
        const posture = (postures[selected.id] ?? 'fire-from-position') as AllyEngagementPosture;
        return (
          <div className="map-orders__orders">
            <p className="map-orders__hint">Right-click the map to send {name(selected, allies.indexOf(selected))} there.</p>
            <fieldset>
              <legend>Movement</legend>
              {(Object.keys(MOVE_LABEL) as AllyBaseMoveOrder[]).map((order) => (
                <button key={order} type="button" aria-pressed={!waypoint && move === order}
                  onClick={() => setAllyBaseMoveOrder(selected.id, order)}>{MOVE_LABEL[order]}</button>
              ))}
              {waypoint && (
                <button type="button" aria-pressed onClick={() => clearAllyWaypoint(selected.id)}>
                  Cancel move to {gridReference(waypoint.x, waypoint.z, terrainSize)}
                </button>
              )}
            </fieldset>
            <fieldset>
              <legend>Fire</legend>
              {(Object.keys(FIRE_LABEL) as AllyFireOrder[]).map((order) => (
                <button key={order} type="button" aria-pressed={fire === order}
                  onClick={() => setAllyFireOrder(selected.id, order)}>{FIRE_LABEL[order]}</button>
              ))}
            </fieldset>
            <fieldset>
              <legend>When engaging</legend>
              {(Object.keys(POSTURE_LABEL) as AllyEngagementPosture[]).map((order) => (
                <button key={order} type="button" aria-pressed={posture === order}
                  onClick={() => setAllyEngagementPosture(selected.id, order)}>{POSTURE_LABEL[order]}</button>
              ))}
            </fieldset>
          </div>
        );
      })()}
      {!selected && allies.some((ally) => !ally.destroyed) && (
        <p className="map-orders__hint">Pick a tank here or click it on the map to give it orders.</p>
      )}
    </aside>
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
      <section className="vehicle-status hud-plate" aria-label="Your tank">
        <h2>{playerName}</h2>
        <div>
          <div className="hud-row">
            <span>Hull</span><strong>{Math.max(0, Math.round(health))} / {maxHealth}</strong>
          </div>
          <div className="hull-integrity-track">
            <div
              className={`hull-integrity-fill${health / maxHealth < 0.35 ? ' is-critical' : ''}`}
              style={{ width: `${Math.max(0, (health / maxHealth) * 100)}%` }}
            />
          </div>
        </div>
        {viewMode !== 'gunner' && <TrackDamageStatus />}
        <div className="hud-row">
          <span>Loaded</span>
          <strong className={`ammo-round ${ammoType === 'AP' ? 'is-ap' : ammoType === 'APC' ? 'is-apc' : 'is-he'}`}>{ammoType}</strong>
        </div>
        <ReloadIndicator />
      </section>
      {isMapMode && <MapModeHUD />}

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
