import { useGameStore, GUNNER_ZOOM_LEVELS, GUNNER_ZOOM_LABELS } from './store';
import { useEffect, useState } from 'react';
import { GAME_CONFIG } from './config';
import { getTankDef } from './tanks/registry';
import type { TankData } from './store';

function ReloadIndicator() {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [burstRemaining, setBurstRemaining] = useState(0);

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

      const remaining = Math.max(0, (def.reloadTime - timeSinceFire) / 1000);
      setSecondsLeft(remaining);
      animationFrameId = requestAnimationFrame(updateProgress);
    };

    updateProgress();

    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  const isBursting = burstRemaining > 0;
  const isReady = secondsLeft === 0 && !isBursting;

  return (
    <div className="mt-4">
      <div className="text-sm text-gray-300 mb-1 font-bold">
        {isBursting ? `FIRING (${burstRemaining})` : isReady ? 'READY' : `RELOAD ${secondsLeft.toFixed(1)}s`}
      </div>
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
    <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 flex gap-8 bg-black/60 p-4 rounded-lg border border-gray-700">
      <div className="flex flex-col items-center">
        <div className="text-xs text-gray-400">SPEED</div>
        <div className="text-2xl font-bold text-white">{speedKmh} <span className="text-sm">km/h</span></div>
      </div>
      <div className="flex flex-col items-center">
        <div className="text-xs text-gray-400">GEAR</div>
        <div className="text-2xl font-bold text-yellow-400">{gearStr}</div>
      </div>
      <div className="flex flex-col items-center">
        <div className="text-xs text-gray-400">ENGINE</div>
        <div className="text-2xl font-bold text-orange-400">{rpm} <span className="text-sm">RPM</span></div>
      </div>
      <div className="flex flex-col items-center">
        <div className="text-xs text-gray-400">POWER</div>
        <div className="text-2xl font-bold text-red-400">{hp} <span className="text-sm">HP</span></div>
      </div>
      <div className="flex gap-2 items-center ml-4 border-l border-gray-600 pl-4">
        <div className="flex flex-col items-center">
          <div className="text-xs text-gray-400">L TRACK</div>
          <div className="w-4 h-16 bg-gray-800 relative overflow-hidden">
            <div className={`absolute bottom-1/2 w-full ${physics.leftTrack > 0 ? 'bg-green-500' : 'bg-red-500'}`} 
                 style={{ height: `${Math.abs(physics.leftTrack / 12) * 50}%`, [physics.leftTrack > 0 ? 'bottom' : 'top']: '50%' }} />
          </div>
        </div>
        <div className="flex flex-col items-center">
          <div className="text-xs text-gray-400">R TRACK</div>
          <div className="w-4 h-16 bg-gray-800 relative overflow-hidden">
            <div className={`absolute bottom-1/2 w-full ${physics.rightTrack > 0 ? 'bg-green-500' : 'bg-red-500'}`} 
                 style={{ height: `${Math.abs(physics.rightTrack / 12) * 50}%`, [physics.rightTrack > 0 ? 'bottom' : 'top']: '50%' }} />
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
  const velocity = (playerDef.weapons[ammoType] ?? playerDef.weapons.AP).velocity;
  const gravity = GAME_CONFIG.physics.gravity;
  const fov = GUNNER_ZOOM_LEVELS[gunnerZoom] ?? 20;

  // Calculate elevation angle for a given distance using the same ballistic
  // formula as the actual gun aiming: θ = 0.5 * asin(d*g / v²)
  const getElevationAngle = (d: number, v: number) => {
    if (d === 0) return 0;
    const sin2Theta = (d * gravity) / (v * v);
    if (sin2Theta > 1) return null; // Beyond max range
    return 0.5 * Math.asin(sin2Theta);
  };

  // Convert elevation angle to viewport height offset (vh units)
  const angleToVh = (angle: number) => {
    const tanFovHalf = Math.tan((fov / 2) * (Math.PI / 180));
    return 50 * (Math.tan(angle) / tanFovHalf);
  };

  // Max range for this ammo type: v² / g
  const maxRange = (velocity * velocity) / gravity;

  // Generate distance markings dynamically based on projectile ballistics
  const markings = [];
  for (let d = 0; d <= 5000; d += 200) {
    if (d > maxRange) break; // Can't reach beyond max range
    const angle = getElevationAngle(d, velocity);
    if (angle === null) break;
    const vh = angleToVh(angle);
    if (vh > 150) break; // Stop generating if it goes way off screen
    markings.push({ dist: d, vh });
  }

  // The camera follows the bore axis (gun barrel direction).
  // The reticle center = screen center = bore axis.
  // Distance markings show shell drop below center — the user lines up
  // the calibrated distance mark with the target to aim correctly.

  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
      {/* Black vignette/mask */}
      <div className="absolute inset-0 bg-[radial-gradient(circle,transparent_40%,black_70%)]" />

      {/* Reticle container — no vertical shift, bore axis stays at center */}
      <div
        className="relative w-full h-full flex items-center justify-center"
      >
        {/* Main horizontal line */}
        <div className="absolute w-1/2 h-0.5 bg-red-500/80" />
        {/* Main vertical line */}
        <div className="absolute h-[200%] w-0.5 bg-red-500/80" />
        
        {/* Distance markings — calibrated distance mark is highlighted */}
        <div className="absolute top-1/2 left-1/2">
          {markings.map(({ dist, vh }) => {
            const isCalibrated = dist === calibrationDistance;
            return (
              <div
                key={dist}
                className={`absolute border-b ${isCalibrated ? 'w-16 border-yellow-400' : 'w-12 border-red-500/80'}`}
                style={{ top: `${vh}vh`, left: isCalibrated ? '-32px' : '-24px' }}
              >
                <span className={`absolute left-[68px] text-sm font-bold -translate-y-1/2 ${isCalibrated ? 'text-yellow-400' : 'text-red-500/80'}`}>{dist}</span>
              </div>
            );
          })}
        </div>

        {/* Center dot */}
        <div className="absolute w-1 h-1 bg-red-500 rounded-full" />
      </div>

      {/* Fixed Bore Axis Indicator (Center of Screen) */}
      <div className="absolute top-1/2 left-1/2 w-4 h-4 border-2 border-green-500/30 rounded-full -translate-x-1/2 -translate-y-1/2" />

      {/* Info panel */}
      <div className="absolute bottom-10 left-10 text-red-500 font-mono text-xl">
        <div>ZOOM: {GUNNER_ZOOM_LABELS[gunnerZoom]}</div>
        <div>DIST: {calibrationDistance}m</div>
        <div>AMMO: {ammoType}</div>
        <div className="text-sm opacity-80">VEL: {velocity}m/s</div>
      </div>
    </div>
  );
}

function TrackHPDisplay() {
  const trackHealth = useGameStore((state) => state.playerTank.trackHealth);
  const trackMaxHealth = useGameStore((state) => state.playerTank.trackMaxHealth);
  const trackDestroyed = useGameStore((state) => state.playerTank.trackDestroyed);

  const renderBar = (label: string, hp: number, maxHp: number, dead: boolean) => (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-400 w-16">{label}</span>
      <div className="w-32 h-3 bg-gray-800 border border-gray-600">
        <div
          className={`h-full transition-all duration-300 ${dead ? 'bg-red-700' : 'bg-amber-500'}`}
          style={{ width: `${Math.max(0, (hp / maxHp) * 100)}%` }}
        />
      </div>
      <span className={`text-xs ${dead ? 'text-red-500 font-bold' : 'text-gray-300'}`}>
        {dead ? 'DESTROYED' : `${Math.round(hp)}/${maxHp}`}
      </span>
    </div>
  );

  return (
    <div className="mt-2 flex flex-col gap-1">
      {renderBar('L TRACK', trackHealth.left, trackMaxHealth.left, trackDestroyed.left)}
      {renderBar('R TRACK', trackHealth.right, trackMaxHealth.right, trackDestroyed.right)}
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
  const [markers, setMarkers] = useState<DirectionMarker[]>([]);

  useEffect(() => {
    let raf: number;
    const update = () => {
      const { playerTank, enemies, allies, cameraYawAbs } = useGameStore.getState();
      const px = playerTank.position.x;
      const pz = playerTank.position.z;
      const playerYaw = cameraYawAbs; // camera viewpoint direction

      const toMarker = (t: TankData, color: string, label: string): DirectionMarker => {
        const dx = t.position.x - px;
        const dz = t.position.z - pz;
        const dist = Math.sqrt(dx * dx + dz * dz);
        // atan2 gives angle from +Z axis (forward). Subtract player yaw to get relative bearing.
        let bearing = -(Math.atan2(dx, dz) - playerYaw);
        // Normalize to -PI..PI
        bearing = ((bearing + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
        return { angle: bearing * (180 / Math.PI), distance: dist, label, color, destroyed: false };
      };

      const m: DirectionMarker[] = [];
      enemies.forEach((e, i) => { if (!e.destroyed) m.push(toMarker(e, '#ef4444', `E${i + 1}`)); });
      allies.forEach((a, i) => { if (!a.destroyed) m.push(toMarker(a, '#3b82f6', `A${i + 1}`)); });
      setMarkers(m);
      raf = requestAnimationFrame(update);
    };
    update();
    return () => cancelAnimationFrame(raf);
  }, []);

  if (markers.length === 0) return null;

  // FOV range shown on the bar: full 360 degrees
  // Map angle (-180..180) to percentage (0..100)
  const angleToPercent = (deg: number) => ((deg + 180) / 360) * 100;

  return (
    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[80%] pointer-events-none">
      {/* Bar background */}
      <div className="relative h-10 bg-black/50 border border-gray-700 rounded-b overflow-visible">
        {/* Center tick (forward direction) */}
        <div className="absolute left-1/2 top-0 h-full w-px bg-gray-500" />
        <div className="absolute left-1/2 -translate-x-1/2 top-0 text-[9px] text-gray-500 leading-none mt-px">FWD</div>
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
  const hasWaypoint = useGameStore((state) => selectedAllyId ? !!state.allyWaypoints[selectedAllyId] : false);

  return (
    <div className="mt-4 text-xl font-bold text-yellow-400 animate-pulse">
      MAP MODE ACTIVE
      <div className="text-sm text-gray-300 font-normal mt-1">
        WASD/Drag - Pan | Scroll - Zoom | M - Exit
      </div>
      <div className="text-sm font-normal mt-2">
        {selectedAlly ? (
          <>
            <div className="text-yellow-300">
              Selected: <span className="uppercase">{selectedAlly.tankType}</span>
            </div>
            <div className="text-gray-400 mt-1">
              {hasWaypoint ? 'Right-click to change waypoint' : 'Right-click to set waypoint'}
            </div>
          </>
        ) : (
          <div className="text-gray-400">Left-click an ally to select</div>
        )}
      </div>
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

  return (
    <div className="absolute inset-0 pointer-events-none p-4 flex flex-col justify-between font-mono text-white text-shadow">
      {viewMode === 'gunner' && !isMapMode && <GunnerSightOverlay />}

      {!isMapMode && <DirectionIndicator />}

      {/* Top Left: Status */}
      <div>
        <div className="mt-0">
          <div className="text-lg">Hull HP: {Math.max(0, Math.round(health))} / {maxHealth}</div>
          <div className="w-64 h-4 bg-gray-800 border border-gray-600 mt-1">
            <div 
              className="h-full bg-green-500 transition-all duration-300" 
              style={{ width: `${Math.max(0, (health / maxHealth) * 100)}%` }}
            />
          </div>
        </div>
        {/* <TrackHPDisplay /> */}
        <div className="mt-4 text-xl">
          Ammo: <span className={ammoType === 'AP' ? 'text-yellow-400' : ammoType === 'APC' ? 'text-orange-400' : 'text-red-400 font-bold'}>{ammoType}</span>
        </div>
        <ReloadIndicator />
        {isMapMode && <MapModeHUD />}
      </div>

      {/* Crosshair - only in third person */}
      {viewMode === 'third-person' && !isMapMode && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
          <div className="relative w-8 h-8">
            <div className="absolute top-1/2 left-0 w-full h-0.5 bg-green-500/50 -translate-y-1/2" />
            <div className="absolute top-0 left-1/2 w-0.5 h-full bg-green-500/50 -translate-x-1/2" />
            <div className="absolute top-1/2 left-1/2 w-1 h-1 bg-red-500 rounded-full -translate-x-1/2 -translate-y-1/2" />
          </div>
        </div>
      )}

      {/* Bottom Left: Messages */}
      <div className="flex flex-col gap-1">
        {messages.map((m) => (
          <div key={m.id} style={{ color: m.color }} className="text-lg font-bold drop-shadow-md">
            {m.text}
          </div>
        ))}
      </div>

      {!isMapMode && <PhysicsHUD />}

      {/* Controls Help */}
      <div className="absolute bottom-4 right-4 text-right text-sm text-gray-300 bg-black/50 p-2 rounded">
        <div>WASD - Move</div>
        <div>Mouse - Look Around</div>
        <div>Arrows - Aim Gunner Sight</div>
        <div>Hold Right Click - Align Sight to Camera</div>
        <div>Space - Fire</div>
        <div>R - Change Ammo</div>
        <div>V / Mid Click - Toggle View</div>
        <div>M - Toggle Map</div>
        <div>PgUp/PgDn - Calibrate Dist</div>
        <div>Scroll (Gunner) - Zoom</div>
      </div>
      
      {destroyed && (
        <div className="absolute inset-0 bg-red-900/50 flex items-center justify-center backdrop-blur-sm">
          <h2 className="text-6xl font-bold text-red-500 drop-shadow-lg">TANK DESTROYED</h2>
        </div>
      )}
    </div>
  );
}
