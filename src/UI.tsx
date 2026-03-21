import { useGameStore } from './store';
import { useEffect, useState } from 'react';
import { GAME_CONFIG } from './config';

function ReloadIndicator() {
  const [progress, setProgress] = useState(100);
  
  useEffect(() => {
    let animationFrameId: number;
    
    const updateProgress = () => {
      const lastFireTime = useGameStore.getState().lastFireTime;
      const now = Date.now();
      const timeSinceFire = now - lastFireTime;
      const reloadTime = 2000;
      
      let p = (timeSinceFire / reloadTime) * 100;
      if (p > 100) p = 100;
      
      setProgress(p);
      animationFrameId = requestAnimationFrame(updateProgress);
    };
    
    updateProgress();
    
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  const isReady = progress === 100;

  return (
    <div className="mt-4">
      <div className="text-sm text-gray-300 mb-1 font-bold">
        {isReady ? 'READY TO FIRE' : 'RELOADING...'}
      </div>
      <div className="w-64 h-4 bg-gray-800 border border-gray-600 overflow-hidden">
        <div 
          className={`h-full transition-all duration-75 ${isReady ? 'bg-green-500' : 'bg-yellow-500'}`}
          style={{ width: `${progress}%` }}
        />
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
  const hp = Math.round(1500 * (physics.rpm / 2800)); // Max 1500 HP at 2800 RPM
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
  
  const velocity = GAME_CONFIG.weapons[ammoType].velocity;
  const gravity = GAME_CONFIG.physics.gravity;
  const fov = 20; // Camera FOV in degrees

  // Calculate vertical drop in viewport height (vh)
  const getDropVh = (d: number, v: number) => {
    if (d === 0) return 0;
    const tanFovHalf = Math.tan((fov / 2) * (Math.PI / 180));
    const drop = 0.5 * gravity * Math.pow(d / v, 2);
    const tanTheta = drop / d;
    return 50 * (tanTheta / tanFovHalf);
  };

  // Generate distance markings dynamically based on projectile speed
  const markings = [];
  for (let d = 0; d <= 5000; d += 200) {
    const vh = getDropVh(d, velocity);
    if (vh > 150) break; // Stop generating if it goes way off screen
    markings.push({ dist: d, vh });
  }

  // Calculate the drop offset for the reticle based on calibration distance
  // Negative offset moves the reticle UP, so the lower distance marks move to the center
  const dropOffsetVh = -getDropVh(calibrationDistance, velocity);

  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
      {/* Black vignette/mask */}
      <div className="absolute inset-0 bg-[radial-gradient(circle,transparent_40%,black_70%)]" />
      
      {/* Reticle container */}
      <div 
        className="relative w-full h-full flex items-center justify-center transition-transform duration-200"
        style={{ transform: `translateY(${dropOffsetVh}vh)` }}
      >
        {/* Main horizontal line */}
        <div className="absolute w-1/2 h-0.5 bg-red-500/80" />
        {/* Main vertical line */}
        <div className="absolute h-[200%] w-0.5 bg-red-500/80" />
        
        {/* Distance markings */}
        <div className="absolute top-1/2 left-1/2">
          {markings.map(({ dist, vh }) => (
            <div 
              key={dist} 
              className="absolute w-12 border-b border-red-500/80"
              style={{ top: `${vh}vh`, left: '-24px' }}
            >
              <span className="absolute left-14 text-sm font-bold text-red-500/80 -translate-y-1/2">{dist}</span>
            </div>
          ))}
        </div>

        {/* Center dot */}
        <div className="absolute w-1 h-1 bg-red-500 rounded-full" />
      </div>

      {/* Fixed Bore Axis Indicator (Center of Screen) */}
      <div className="absolute top-1/2 left-1/2 w-4 h-4 border-2 border-green-500/30 rounded-full -translate-x-1/2 -translate-y-1/2" />

      {/* Info panel */}
      <div className="absolute bottom-10 left-10 text-red-500 font-mono text-xl">
        <div>DIST: {calibrationDistance}m</div>
        <div>AMMO: {ammoType}</div>
        <div className="text-sm opacity-80">VEL: {velocity}m/s</div>
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
      
      {/* Top Left: Status */}
      <div>
        <h1 className="text-2xl font-bold text-green-400">PANZER FRONT WEBGL</h1>
        <div className="mt-4">
          <div className="text-lg">Hull HP: {Math.max(0, Math.round(health))} / {maxHealth}</div>
          <div className="w-64 h-4 bg-gray-800 border border-gray-600 mt-1">
            <div 
              className="h-full bg-green-500 transition-all duration-300" 
              style={{ width: `${Math.max(0, (health / maxHealth) * 100)}%` }}
            />
          </div>
        </div>
        <div className="mt-4 text-xl">
          Ammo: <span className={ammoType === 'AP' ? 'text-yellow-400' : 'text-red-400 font-bold'}>{ammoType}</span>
          <div className="text-sm text-gray-300 mt-1">Press R to switch</div>
        </div>
        <ReloadIndicator />
        {isMapMode && (
          <div className="mt-4 text-xl font-bold text-yellow-400 animate-pulse">
            MAP MODE ACTIVE
          </div>
        )}
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

      <PhysicsHUD />

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
        <div>PgUp/PgDn/Wheel - Calibrate Dist</div>
      </div>
      
      {destroyed && (
        <div className="absolute inset-0 bg-red-900/50 flex items-center justify-center backdrop-blur-sm">
          <h2 className="text-6xl font-bold text-red-500 drop-shadow-lg">TANK DESTROYED</h2>
        </div>
      )}
    </div>
  );
}
