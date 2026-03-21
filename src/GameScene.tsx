import { useEffect, useRef, useState, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Sky, Environment, OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';
import { Tank } from './Tank';
import { Terrain } from './Terrain';
import { ProjectileManager } from './ProjectileManager';
import { Particles } from './Particles';
import { EnemyAI } from './EnemyAI';
import { useGameStore, AmmoType } from './store';
import { useShallow } from 'zustand/react/shallow';
import { playFireSound, initEngineSound, updateEngineSound } from './audio';
import { GAME_CONFIG } from './config';
import { getTerrainHeight } from './Terrain';

function EnemyTank({ id }: { id: string }) {
  return <Tank id={id} />;
}

function PlayerTank() {
  return <Tank id="player" isPlayer />;
}

function GunAimPoint() {
  const groupRef = useRef<THREE.Group>(null);
  
  useFrame(() => {
    const player = useGameStore.getState().playerTank;
    if (player.destroyed || !groupRef.current) return;

    const tankEuler = new THREE.Euler(player.pitch || 0, player.rotation, player.roll || 0, 'YXZ');
    const tankQuat = new THREE.Quaternion().setFromEuler(tankEuler);
    
    const turretEuler = new THREE.Euler(0, player.turretRotation + (player.turretSwayOffset || 0), 0, 'YXZ');
    const turretQuat = new THREE.Quaternion().setFromEuler(turretEuler);
    const worldTurretQuat = tankQuat.clone().multiply(turretQuat);
    
    const turretPosWorld = player.position.clone().add(new THREE.Vector3(0, 1.2, 0.2).applyQuaternion(tankQuat));
    const gunPivotWorld = turretPosWorld.clone().add(new THREE.Vector3(0, 0.4, 1.5).applyQuaternion(worldTurretQuat));
    
    const gunEuler = new THREE.Euler(player.gunElevation + (player.gunSwayOffset || 0), 0, 0, 'YXZ');
    const gunQuat = new THREE.Quaternion().setFromEuler(gunEuler);
    const worldGunQuat = worldTurretQuat.clone().multiply(gunQuat);
    
    const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(worldGunQuat);
    
    // Project point far away
    const targetPoint = gunPivotWorld.clone().add(dir.multiplyScalar(500));
    groupRef.current.position.copy(targetPoint);
  });

  return (
    <group ref={groupRef}>
      <Html center zIndexRange={[100, 0]}>
        <div className="w-8 h-8 border-2 border-yellow-400 rounded-full flex items-center justify-center opacity-70 pointer-events-none">
          <div className="w-1 h-1 bg-yellow-400 rounded-full" />
        </div>
      </Html>
    </group>
  );
}

function PlayerController() {
  const { camera } = useThree();
  const updatePlayer = useGameStore((state) => state.updatePlayer);
  const fireProjectile = useGameStore((state) => state.fireProjectile);
  const ammoType = useGameStore((state) => state.ammoType);
  const toggleAmmo = useGameStore((state) => state.toggleAmmo);
  const toggleViewMode = useGameStore((state) => state.toggleViewMode);
  const toggleMapMode = useGameStore((state) => state.toggleMapMode);
  const setCalibrationDistance = useGameStore((state) => state.setCalibrationDistance);
  const setLastFireTime = useGameStore((state) => state.setLastFireTime);
  
  const keys = useRef<{ [key: string]: boolean }>({});
  const cameraYaw = useRef(0);
  const cameraPitch = useRef(0);
  const isAiming = useRef(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { 
      keys.current[e.code] = true; 
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
      if (e.code === 'Space') {
        e.preventDefault();
        fire();
      }
      if (e.code === 'KeyV') toggleViewMode();
      if (e.code === 'KeyM') toggleMapMode();
      if (e.code === 'PageUp') {
        const currentDist = useGameStore.getState().calibrationDistance;
        setCalibrationDistance(Math.min(currentDist + 100, 2000));
      }
      if (e.code === 'PageDown') {
        const currentDist = useGameStore.getState().calibrationDistance;
        setCalibrationDistance(Math.max(currentDist - 100, 0));
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => { keys.current[e.code] = false; };
    const handleMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement === document.body) {
        const viewMode = useGameStore.getState().viewMode;
        const sensitivity = viewMode === 'gunner' ? 0.001 : 0.003;
        cameraYaw.current -= e.movementX * sensitivity;
        cameraPitch.current -= e.movementY * sensitivity;
        cameraPitch.current = THREE.MathUtils.clamp(cameraPitch.current, -Math.PI / 4, Math.PI / 4);
      }
    };
    const handleMouseDown = (e: MouseEvent) => {
      if (document.pointerLockElement !== document.body) {
        document.body.requestPointerLock().catch(() => {});
      }
      if (e.button === 1) {
        e.preventDefault();
        toggleViewMode();
      } else if (e.button === 2) {
        isAiming.current = true;
      }
    };
    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 2) {
        isAiming.current = false;
      }
    };
    const handleWheel = (e: WheelEvent) => {
      if (useGameStore.getState().viewMode === 'gunner') {
        e.preventDefault();
        const currentDist = useGameStore.getState().calibrationDistance;
        const delta = e.deltaY > 0 ? -100 : 100;
        const setCalibrationDistance = useGameStore.getState().setCalibrationDistance;
        setCalibrationDistance(Math.max(Math.min(currentDist + delta, 2000), 0));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('contextmenu', e => e.preventDefault());

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('contextmenu', e => e.preventDefault());
    };
  }, [ammoType, toggleAmmo]);

  const fire = () => {
    const now = Date.now();
    const lastFireTime = useGameStore.getState().lastFireTime;
    if (now - lastFireTime < GAME_CONFIG.weapons.reloadTime) return;
    setLastFireTime(now);

    const state = useGameStore.getState().playerTank;
    if (state.destroyed) return;
    
    updatePlayer({ lastFireTime: now });

    // Calculate gun tip position and direction with pitch and roll
    const tankEuler = new THREE.Euler(state.pitch || 0, state.rotation, state.roll || 0, 'YXZ');
    const tankQuat = new THREE.Quaternion().setFromEuler(tankEuler);
    
    const turretEuler = new THREE.Euler(0, state.turretRotation + (state.turretSwayOffset || 0), 0, 'YXZ');
    const turretQuat = new THREE.Quaternion().setFromEuler(turretEuler);
    
    const gunEuler = new THREE.Euler(state.gunElevation + (state.gunSwayOffset || 0), 0, 0, 'YXZ');
    const gunQuat = new THREE.Quaternion().setFromEuler(gunEuler);
    
    const worldTurretQuat = tankQuat.clone().multiply(turretQuat);
    const worldGunQuat = worldTurretQuat.clone().multiply(gunQuat);
    
    // Match the visual model: turret is at [0, 1.2, 0.2] relative to tank, gun is at [0, 0.4, 1.5] relative to turret
    const turretPosWorld = state.position.clone().add(new THREE.Vector3(0, 1.2, 0.2).applyQuaternion(tankQuat));
    const gunPivotWorld = turretPosWorld.clone().add(new THREE.Vector3(0, 0.4, 1.5).applyQuaternion(worldTurretQuat));
    
    const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(worldGunQuat);
    const pos = gunPivotWorld.clone().add(dir.clone().multiplyScalar(4));

    const ammoStats = GAME_CONFIG.weapons[ammoType];
    const velocity = dir.clone().multiplyScalar(ammoStats.velocity);

    fireProjectile(pos, velocity, ammoType, ammoStats.penetration, ammoStats.damage, 'player');
    playFireSound();
  };

  useFrame((state, delta) => {
    const player = useGameStore.getState().playerTank;
    if (player.destroyed) return;

    const maxSpeed = GAME_CONFIG.tank.maxSpeed;
    const maxReverseSpeed = GAME_CONFIG.tank.maxReverseSpeed;
    const acceleration = GAME_CONFIG.tank.acceleration;
    const deceleration = GAME_CONFIG.tank.deceleration;
    const trackWidth = GAME_CONFIG.tank.trackWidth;

    let throttle = (keys.current['KeyW'] ? 1 : 0) - (keys.current['KeyS'] ? 1 : 0);
    let steering = (keys.current['KeyA'] ? 1 : 0) - (keys.current['KeyD'] ? 1 : 0);

    let targetLeftSpeed = 0;
    let targetRightSpeed = 0;

    if (throttle !== 0) {
      // Moving forward or backward
      const baseSpeed = throttle > 0 ? maxSpeed : -maxReverseSpeed;
      targetLeftSpeed = baseSpeed;
      targetRightSpeed = baseSpeed;
      
      // Apply steering while moving
      if (steering > 0) { // Turn left
        targetLeftSpeed *= 0.6; // Slow down left track (was 0.2)
      } else if (steering < 0) { // Turn right
        targetRightSpeed *= 0.6; // Slow down right track (was 0.2)
      }
    } else if (steering !== 0) {
      // Neutral steering
      const pivotSpeed = maxSpeed * 0.15; // Reduce pivot speed (was 0.4)
      targetLeftSpeed = -steering * pivotSpeed;
      targetRightSpeed = steering * pivotSpeed;
    }

    // Accelerate tracks towards target speed
    const accelLeft = (targetLeftSpeed === 0) ? deceleration : acceleration;
    const accelRight = (targetRightSpeed === 0) ? deceleration : acceleration;
    
    let leftSpeed = player.leftTrackSpeed || 0;
    let rightSpeed = player.rightTrackSpeed || 0;

    if (leftSpeed < targetLeftSpeed) leftSpeed = Math.min(leftSpeed + accelLeft * delta, targetLeftSpeed);
    else if (leftSpeed > targetLeftSpeed) leftSpeed = Math.max(leftSpeed - accelLeft * delta, targetLeftSpeed);

    if (rightSpeed < targetRightSpeed) rightSpeed = Math.min(rightSpeed + accelRight * delta, targetRightSpeed);
    else if (rightSpeed > targetRightSpeed) rightSpeed = Math.max(rightSpeed - accelRight * delta, targetRightSpeed);

    // Calculate tank movement from track speeds
    const forwardSpeed = (leftSpeed + rightSpeed) / 2;
    // Fix rotation direction: right track moving faster turns tank left (positive rotation)
    const rotationSpeed = (rightSpeed - leftSpeed) / trackWidth;

    let newRot = player.rotation + rotationSpeed * delta;
    let newPos = player.position.clone();
    
    const moveDir = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), newRot);
    newPos.add(moveDir.clone().multiplyScalar(forwardSpeed * delta));

    // Snap to terrain
    const currentHeight = getTerrainHeight(newPos.x, newPos.z);
    newPos.y = currentHeight;

    // Calculate pitch and roll based on terrain using tank dimensions
    const forward = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(0, newRot, 0));
    const right = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, newRot, 0));
    
    // Tank is roughly 5 units long and 3.2 units wide
    const frontPos = newPos.clone().add(forward.clone().multiplyScalar(2.5));
    const backPos = newPos.clone().sub(forward.clone().multiplyScalar(2.5));
    const rightPos = newPos.clone().add(right.clone().multiplyScalar(1.6));
    const leftPos = newPos.clone().sub(right.clone().multiplyScalar(1.6));
    
    const frontHeight = getTerrainHeight(frontPos.x, frontPos.z);
    const backHeight = getTerrainHeight(backPos.x, backPos.z);
    const rightHeight = getTerrainHeight(rightPos.x, rightPos.z);
    const leftHeight = getTerrainHeight(leftPos.x, leftPos.z);
    
    const slope = (frontHeight - backHeight) / 5;
    const rollSlope = (rightHeight - leftHeight) / 3.2;
    
    const pitch = -Math.atan(slope);
    const roll = Math.atan(rollSlope);

    // Adjust center height to prevent clipping on hills/valleys
    const avgHeight = (frontHeight + backHeight + rightHeight + leftHeight) / 4;
    newPos.y = Math.max(currentHeight, avgHeight);

    // Engine Simulation
    const idleRPM = GAME_CONFIG.tank.idleRPM;
    const maxRPM = GAME_CONFIG.tank.maxRPM;
    const absSpeed = Math.abs(forwardSpeed);
    const speedRatio = absSpeed / maxSpeed;
    
    let targetRPM = idleRPM;
    if (throttle !== 0 || steering !== 0) {
      targetRPM = idleRPM + (maxRPM - idleRPM) * Math.max(0.3, speedRatio);
      // Spike RPM when starting to move
      if (absSpeed < 2) targetRPM += 800; 
    }
    targetRPM = Math.min(maxRPM, targetRPM);
    
    let currentRPM = player.engineRPM || idleRPM;
    currentRPM += (targetRPM - currentRPM) * 5 * delta; // Smooth RPM changes

    // Initialize and update engine sound
    initEngineSound();
    updateEngineSound(currentRPM);

    let gear = 0;
    if (forwardSpeed > 0.5) gear = Math.max(1, Math.ceil((forwardSpeed / maxSpeed) * 5)); // 1-5 forward gears
    else if (forwardSpeed < -0.5) gear = -1; // 1 reverse gear

    // Camera direction
    const camYawAbs = newRot + cameraYaw.current;
    const camPitch = cameraPitch.current;
    
    const lookDir = new THREE.Vector3(
      Math.sin(camYawAbs) * Math.cos(camPitch),
      Math.sin(camPitch),
      Math.cos(camYawAbs) * Math.cos(camPitch)
    ).normalize();

    // Turret aiming logic
    let newTurretRot = player.turretRotation;
    let newGunElev = player.gunElevation;

    // Realistic slow turret rotation
    const turretSpeed = GAME_CONFIG.tank.turretSpeed * delta;
    const gunSpeed = GAME_CONFIG.tank.gunSpeed * delta;

    const dist = useGameStore.getState().calibrationDistance;
    const ammoStats = GAME_CONFIG.weapons[useGameStore.getState().ammoType];
    const v = ammoStats.velocity;
    const g = GAME_CONFIG.physics.gravity;
    
    let angleOffset = 0;
    if (dist > 0) {
      const sin2Theta = (dist * g) / (v * v);
      if (sin2Theta <= 1) {
        angleOffset = 0.5 * Math.asin(sin2Theta);
      } else {
        angleOffset = Math.PI / 4; // Max range
      }
    }

    // Current sight pitch is derived from actual gun elevation
    let currentSightPitch = -player.gunElevation - angleOffset;

    if (isAiming.current) {
      // Align sight (and thus turret) to viewpoint (camera)
      let yawDiff = cameraYaw.current - player.turretRotation;
      yawDiff = Math.atan2(Math.sin(yawDiff), Math.cos(yawDiff));
      
      if (Math.abs(yawDiff) > 0.01) {
        newTurretRot += Math.sign(yawDiff) * Math.min(Math.abs(yawDiff), turretSpeed);
      }

      let pitchDiff = cameraPitch.current - currentSightPitch;
      if (Math.abs(pitchDiff) > 0.01) {
        currentSightPitch += Math.sign(pitchDiff) * Math.min(Math.abs(pitchDiff), gunSpeed);
      }
    } else {
      // Arrow keys directly move the sight (and thus the turret)
      const arrowLeft = keys.current['ArrowLeft'];
      const arrowRight = keys.current['ArrowRight'];
      const arrowUp = keys.current['ArrowUp'];
      const arrowDown = keys.current['ArrowDown'];

      if (arrowLeft) newTurretRot += turretSpeed;
      if (arrowRight) newTurretRot -= turretSpeed;
      if (arrowUp) currentSightPitch += gunSpeed;
      if (arrowDown) currentSightPitch -= gunSpeed;
    }

    currentSightPitch = THREE.MathUtils.clamp(currentSightPitch, -Math.PI / 4, Math.PI / 4);

    // Calculate final gun elevation from the sight pitch
    newGunElev = -currentSightPitch - angleOffset;
    newGunElev = THREE.MathUtils.clamp(newGunElev, -Math.PI / 6, Math.PI / 12);

    // Calculate gun sway based on movement
    let targetTurretSway = 0;
    let targetGunSway = 0;
    const swayAmount = GAME_CONFIG.tank.gunSway.movingAmount;
    const swayFreq = GAME_CONFIG.tank.gunSway.frequency;
    
    if (Math.abs(forwardSpeed) > 0.1 || Math.abs(rotationSpeed) > 0.1) {
      const time = state.clock.getElapsedTime();
      // Use noise or sine waves for sway
      targetTurretSway = Math.sin(time * swayFreq) * swayAmount * (Math.abs(forwardSpeed) / maxSpeed + Math.abs(rotationSpeed));
      targetGunSway = Math.cos(time * swayFreq * 1.3) * swayAmount * (Math.abs(forwardSpeed) / maxSpeed + Math.abs(rotationSpeed));
    }

    const turretSwayOffset = THREE.MathUtils.lerp(player.turretSwayOffset || 0, targetTurretSway, delta * 5);
    const gunSwayOffset = THREE.MathUtils.lerp(player.gunSwayOffset || 0, targetGunSway, delta * 5);

    // Camera placement
    const viewMode = useGameStore.getState().viewMode;
    const isMapMode = useGameStore.getState().isMapMode;
    
    if (isMapMode) {
      // Map view: high above the player looking down
      const mapHeight = 150;
      const camPos = newPos.clone().add(new THREE.Vector3(0, mapHeight, 0));
      camera.position.copy(camPos);
      // Look straight down
      camera.lookAt(newPos);
      // Ensure up vector is aligned with Z so north is up (or whatever orientation makes sense)
      camera.up.set(0, 0, -1);
      (camera as THREE.PerspectiveCamera).fov = 60;
    } else if (viewMode === 'third-person') {
      // Reset up vector just in case it was changed by map mode
      camera.up.set(0, 1, 0);
      const cameraDistance = GAME_CONFIG.camera.distance;
      const cameraHeightOffset = GAME_CONFIG.camera.heightOffset;
      const targetPos = newPos.clone().add(new THREE.Vector3(0, cameraHeightOffset, 0));
      const camPos = targetPos.clone().sub(lookDir.clone().multiplyScalar(cameraDistance));
      
      camera.position.copy(camPos);
      camera.lookAt(targetPos.clone().add(lookDir.clone().multiplyScalar(100)));
      (camera as THREE.PerspectiveCamera).fov = 60;
    } else {
      // Gunner view
      // Reset up vector just in case it was changed by map mode
      camera.up.set(0, 1, 0);
      
      const tankEuler = new THREE.Euler(pitch, newRot, roll, 'YXZ');
      const tankQuat = new THREE.Quaternion().setFromEuler(tankEuler);
      
      const turretEuler = new THREE.Euler(0, newTurretRot + turretSwayOffset, 0, 'YXZ');
      const turretQuat = new THREE.Quaternion().setFromEuler(turretEuler);
      const worldTurretQuat = tankQuat.clone().multiply(turretQuat);
      
      // The sight is locked to the turret, with its pitch being currentSightPitch
      const sightEuler = new THREE.Euler(-currentSightPitch + gunSwayOffset, 0, 0, 'YXZ');
      const sightQuat = new THREE.Quaternion().setFromEuler(sightEuler);
      const worldSightQuat = worldTurretQuat.clone().multiply(sightQuat);
      
      // Match the visual model: turret is at [0, 1.2, 0.2] relative to tank, gun is at [0, 0.4, 1.5] relative to turret
      const turretPosWorld = newPos.clone().add(new THREE.Vector3(0, 1.2, 0.2).applyQuaternion(tankQuat));
      const gunPivotWorld = turretPosWorld.clone().add(new THREE.Vector3(0, 0.4, 1.5).applyQuaternion(worldTurretQuat));
      
      const dir = new THREE.Vector3(0, 0, 1).applyQuaternion(worldSightQuat);
      
      const camPos = gunPivotWorld.clone().add(dir.clone().multiplyScalar(4.5)); // Placed at the tip of the barrel
      camera.position.copy(camPos);
      camera.lookAt(camPos.clone().add(dir.clone().multiplyScalar(100)));
      (camera as THREE.PerspectiveCamera).fov = 20; // Zoomed in
    }
    camera.updateProjectionMatrix();

    updatePlayer({
      position: newPos,
      rotation: newRot,
      pitch: pitch,
      roll: roll,
      turretRotation: newTurretRot,
      gunElevation: newGunElev,
      turretSwayOffset,
      gunSwayOffset,
      speed: forwardSpeed,
      leftTrackSpeed: leftSpeed,
      rightTrackSpeed: rightSpeed,
      engineRPM: currentRPM,
      gear: gear,
    });
  });

  return null;
}

export function GameScene() {
  const enemyIds = useGameStore(useShallow((state) => state.enemies.map(e => e.id)));
  const spawnEnemy = useGameStore((state) => state.spawnEnemy);

  useEffect(() => {
    // Spawn some enemies only if none exist (prevents double spawn in Strict Mode)
    if (useGameStore.getState().enemies.length === 0) {
      spawnEnemy(new THREE.Vector3(40, getTerrainHeight(40, 150), 150));
      spawnEnemy(new THREE.Vector3(-60, getTerrainHeight(-60, 200), 200));
      spawnEnemy(new THREE.Vector3(0, getTerrainHeight(0, 250), 250));
    }
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <Canvas shadows camera={{ position: [0, 5, -10], fov: 60 }}>
        <Suspense fallback={null}>
          <Sky sunPosition={[100, 20, 100]} />
          <ambientLight intensity={0.3} />
          <directionalLight
            castShadow
            position={[100, 100, 50]}
            intensity={1.5}
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
            shadow-camera-far={500}
            shadow-camera-left={-100}
            shadow-camera-right={100}
            shadow-camera-top={100}
            shadow-camera-bottom={-100}
          />
          
          <Terrain />
          <PlayerTank />
          {enemyIds.map((id) => (
            <EnemyTank key={id} id={id} />
          ))}
          <ProjectileManager />
          <Particles />
          <PlayerController />
          <GunAimPoint />
          <EnemyAI />
        </Suspense>
      </Canvas>
    </div>
  );
}
