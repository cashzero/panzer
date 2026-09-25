import { memo, useRef, useState, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { Tank } from './Tank';
import { BattlefieldLighting } from './rendering/BattlefieldLighting';
import { BattlefieldPostProcessing } from './rendering/BattlefieldPostProcessing';
import { Terrain } from './Terrain';
import { ProjectileManager } from './ProjectileManager';
import { Particles } from './Particles';
import { FlashLights } from './rendering/FlashLights';
import { ImpactDecals } from './rendering/ImpactDecals';
import { TrackMarks } from './rendering/TrackMarks';
import { EnemyAI, IndependentAllyAI } from './EnemyAI';
import { AllyAI } from './AllyAI';
import { useGameStore, AmmoType } from './store';
import { useShallow } from 'zustand/react/shallow';
import { GAME_CONFIG } from './config';
import { getTerrainHeight } from './Terrain';
import { resolveTankCollision, resolveTreeCollision, resolveBuildingCollision, resolveForestCollision } from './collision';
import { BattleMapGrid, MapCameraController } from './MapMode';
import { MapMarker } from './MapMarker';
import { getTankDef } from './tanks/registry';
import { computeTerrainOrientation, computeTrackMovement, updateGunSway, computeEngineState, computeBodyRock, computeTrackTargets, accelerateTrackSpeeds, computeDriveTrackSpeeds, limitTrackYawRate } from './tankPhysics';
import { useInput } from './useInput';
import { fireTank, updatePlayerBurst } from './firing';
import { computeTurretAiming } from './turretAiming';
import { computeAimGunPivotWorld, computeAimPoint } from './aimPoint';
import { updateCamera } from './CameraController';
import { Trees, Understory } from './TreeRenderer';
import { ForestScreen } from './rendering/ForestScreen';
import { WorldDressing } from './rendering/WorldDressing';
import { HorizonSkirt } from './rendering/HorizonSkirt';
import { Buildings } from './BuildingRenderer';
import { BurningWrecks } from './BurningWrecks';
import { WaypointMarkers } from './WaypointMarker';
import { audioManager, toAudioVec3 } from './audio';
import { resolveDesignatedAimTarget } from './designatedAimTarget';
import { collectVisibleTargetIds } from './spotting';

const EnemyTank = memo(function EnemyTank({ id }: { id: string }) {
  const tankType = useGameStore(state => state.enemies.find(e => e.id === id)?.tankType ?? 'tiger');
  return <Tank id={id} tankType={tankType} />;
});

const AllyTank = memo(function AllyTank({ id }: { id: string }) {
  const tankType = useGameStore(state => state.allies.find(a => a.id === id)?.tankType ?? 'sherman');
  return <Tank id={id} tankType={tankType} />;
});

const PlayerTank = memo(function PlayerTank({ visible }: { visible: boolean }) {
  const tankType = useGameStore(state => state.playerTank.tankType);
  return <Tank id="player" tankType={tankType} visible={visible} />;
});

function GunAimPoint() {
  const groupRef = useRef<THREE.Group>(null);

  useFrame(() => {
    const player = useGameStore.getState().playerTank;
    if (player.destroyed || !groupRef.current) return;
    groupRef.current.position.copy(player.gunSightAimPoint);
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

function AudioSync() {
  const { camera } = useThree();
  const forwardRef = useRef(new THREE.Vector3());
  const upRef = useRef(new THREE.Vector3());

  useFrame(() => {
    const state = useGameStore.getState();
    const viewMode = state.isMapMode ? 'map' : state.viewMode;
    const playerDef = getTankDef(state.playerTank.tankType);

    camera.getWorldDirection(forwardRef.current);
    upRef.current.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();

    audioManager.setListenerPose({
      position: toAudioVec3(camera.position),
      forward: toAudioVec3(forwardRef.current),
      up: toAudioVec3(upRef.current),
      viewMode,
    });

    audioManager.syncPlayerEngine({
      position: toAudioVec3(state.playerTank.position),
      rpm: state.playerTank.destroyed ? 0 : state.playerTank.engineRPM,
      gear: state.playerTank.destroyed ? 0 : state.playerTank.gear,
      speed: state.playerTank.destroyed ? 0 : state.playerTank.speed,
      maxSpeed: playerDef.maxSpeed,
      leftTrackSpeed: state.playerTank.destroyed ? 0 : state.playerTank.leftTrackSpeed,
      rightTrackSpeed: state.playerTank.destroyed ? 0 : state.playerTank.rightTrackSpeed,
      destroyed: state.playerTank.destroyed,
      viewMode,
    });
  });

  return null;
}

function SpottingSystem() {
  const elapsedMs = useRef(Infinity);

  useFrame((_, delta) => {
    elapsedMs.current += delta * 1000;
    if (elapsedMs.current < GAME_CONFIG.ai.spottingIntervalMs) return;
    elapsedMs.current = 0;
    const state = useGameStore.getState();
    const now = Date.now();
    const playerSideVisible = collectVisibleTargetIds(
      [state.playerTank, ...state.allies],
      state.enemies,
      state.trees,
      state.buildings,
    );
    const enemySideVisible = collectVisibleTargetIds(
      state.enemies,
      [state.playerTank, ...state.allies],
      state.trees,
      state.buildings,
    );

    state.refreshSpotting('player', playerSideVisible, now);
    state.refreshSpotting('enemy', enemySideVisible, now);
  });

  return null;
}

function TrackRepairManager() {
  const updateTrackRepairs = useGameStore((state) => state.updateTrackRepairs);

  useFrame((_, delta) => {
    updateTrackRepairs(delta);
  });

  return null;
}

function PlayerController() {
  const { camera } = useThree();
  const updatePlayer = useGameStore((state) => state.updatePlayer);
  const input = useInput(fireTank);
  const previousViewMode = useRef<'third-person' | 'gunner'>(useGameStore.getState().viewMode);
  // Hull yaw rate actually applied last frame, so turn-rate limit and inertia act on real motion.
  const hullYawRate = useRef(0);
  // Smoothed height of the third-person orbit centre.
  const cameraAnchorY = useRef<number | null>(null);

  useFrame((state, frameDelta) => {
    // A long frame (tab switch, hitch) is simulated as a short one instead of teleporting the tank.
    const delta = Math.min(frameDelta, GAME_CONFIG.physics.maxFrameDelta);
    const player = useGameStore.getState().playerTank;
    if (player.destroyed) return;

    // Skip all tank physics in map mode — MapCameraController handles camera
    if (useGameStore.getState().isMapMode) return;

    const playerDef = getTankDef(player.tankType);

    const throttle = (input.keys.current['KeyW'] ? 1 : 0) - (input.keys.current['KeyS'] ? 1 : 0);
    const steering = (input.keys.current['KeyA'] ? 1 : 0) - (input.keys.current['KeyD'] ? 1 : 0);

    const trackDestroyed = player.trackDestroyed ?? { left: false, right: false };
    let trackSpeeds;
    if (trackDestroyed.left || trackDestroyed.right) {
      // A thrown track leaves only the other one driving: the hull pivots about the dead side.
      const trackTargets = computeTrackTargets({
        throttle, steering,
        maxSpeed: playerDef.maxSpeed,
        maxReverseSpeed: playerDef.maxReverseSpeed,
        currentLeftTrackSpeed: player.leftTrackSpeed || 0,
        currentRightTrackSpeed: player.rightTrackSpeed || 0,
        trackDestroyed,
      });
      trackSpeeds = limitTrackYawRate(accelerateTrackSpeeds({
        currentLeft: player.leftTrackSpeed || 0,
        currentRight: player.rightTrackSpeed || 0,
        targetLeft: trackTargets.left,
        targetRight: trackTargets.right,
        acceleration: playerDef.acceleration,
        deceleration: playerDef.deceleration,
        delta,
      }), playerDef.trackWidth, playerDef.turnRateLimit);
    } else {
      trackSpeeds = computeDriveTrackSpeeds({
        throttle, steering,
        maxSpeed: playerDef.maxSpeed,
        maxReverseSpeed: playerDef.maxReverseSpeed,
        acceleration: playerDef.acceleration,
        deceleration: playerDef.deceleration,
        trackWidth: playerDef.trackWidth,
        turnRateLimit: playerDef.turnRateLimit,
        rotationalInertia: playerDef.rotationalInertia,
        currentLeft: player.leftTrackSpeed || 0,
        currentRight: player.rightTrackSpeed || 0,
        delta,
      });
    }

    const leftSpeed = trackSpeeds.left;
    const rightSpeed = trackSpeeds.right;

    // Calculate tank movement from track speeds
    const movement = computeTrackMovement(leftSpeed, rightSpeed, player.position, player.rotation, delta, playerDef.trackWidth, playerDef.turnRateLimit, hullYawRate.current, playerDef.rotationalInertia);
    const { forwardSpeed, rotationSpeed } = movement;
    hullYawRate.current = rotationSpeed;
    let newRot = movement.rotation;
    let newPos = movement.position;

    // Compensate camera yaw so hull rotation doesn't drag the viewpoint
    const rotDelta = newRot - player.rotation;
    input.cameraYaw.current -= rotDelta;

    // Snap to terrain
    newPos.y = getTerrainHeight(newPos.x, newPos.z);

    // Tank-tank collision
    const allTanks = [player, ...useGameStore.getState().enemies, ...useGameStore.getState().allies];
    resolveTankCollision('player', newPos, allTanks);
    resolveBuildingCollision(newPos, useGameStore.getState().buildings);
    resolveForestCollision(newPos);

    // Tree collision
    const treeResult = resolveTreeCollision(newPos, forwardSpeed, useGameStore.getState().trees);
    if (treeResult.knockedTreeIndex !== null) {
      const idx = treeResult.knockedTreeIndex;
      const tree = useGameStore.getState().trees[idx];
      const fallDir = Math.atan2(newPos.x - tree.position[0], newPos.z - tree.position[2]);
      useGameStore.getState().updateTree(idx, { fallen: true, fallDirection: fallDir, fallProgress: 0.01 });
      useGameStore.getState().spawnParticle('tree_hit', new THREE.Vector3(tree.position[0], tree.position[1] + 2, tree.position[2]), new THREE.Vector3(0, 1, 0));
    }

    newPos.y = getTerrainHeight(newPos.x, newPos.z);

    // Calculate pitch and roll based on terrain
    const orientation = computeTerrainOrientation(newPos, newRot, playerDef.trackWidth);
    const bodyRock = computeBodyRock(forwardSpeed, playerDef.maxSpeed, rotationSpeed, state.clock.elapsedTime);
    const pitch = orientation.pitch + bodyRock.pitchOffset;
    const roll = orientation.roll + bodyRock.rollOffset;
    newPos.y = orientation.adjustedY + bodyRock.yOffset;

    // Engine Simulation
    const engine = computeEngineState(
      forwardSpeed, playerDef.maxSpeed,
      player.engineRPM || GAME_CONFIG.tank.idleRPM,
      throttle !== 0 || steering !== 0, delta
    );
    // Camera direction
    const camYawAbs = newRot + input.cameraYaw.current;
    const camPitch = input.cameraPitch.current;

    const lookDir = new THREE.Vector3(
      Math.sin(camYawAbs) * Math.cos(camPitch),
      Math.sin(camPitch),
      Math.cos(camYawAbs) * Math.cos(camPitch)
    ).normalize();

    const viewMode = useGameStore.getState().viewMode;
    const aimingFromThirdPerson = viewMode === 'third-person' && input.isAiming.current;
    const preservedTransitionTarget = viewMode === 'gunner' && previousViewMode.current === 'third-person'
      ? player.designatedAimTarget.clone()
      : null;
    // Follow the hull rigidly in plan but ease the height, so suspension bounce and
    // terrain snapping do not shake the whole view; never let the orbit dip into the ground.
    const anchorTargetY = newPos.y + GAME_CONFIG.camera.heightOffset;
    if (cameraAnchorY.current === null || Math.abs(anchorTargetY - cameraAnchorY.current) > 8) {
      cameraAnchorY.current = anchorTargetY;
    } else {
      cameraAnchorY.current += (anchorTargetY - cameraAnchorY.current) * (1 - Math.exp(-delta / GAME_CONFIG.camera.heightSmoothing));
    }
    const cameraTargetPos = new THREE.Vector3(newPos.x, cameraAnchorY.current, newPos.z);
    const cameraPos = cameraTargetPos.clone().sub(lookDir.clone().multiplyScalar(GAME_CONFIG.camera.distance));
    cameraPos.y = Math.max(cameraPos.y, getTerrainHeight(cameraPos.x, cameraPos.z) + GAME_CONFIG.camera.groundClearance);
    const thirdPersonDesignatedTarget = viewMode === 'third-person'
      ? resolveDesignatedAimTarget(cameraPos, lookDir, 2000, 'player')
      : null;
    const designatedTargetForAiming = aimingFromThirdPerson
      ? thirdPersonDesignatedTarget?.point ?? null
      : preservedTransitionTarget;
    const currentAimOriginWorld = computeAimGunPivotWorld({
      position: newPos,
      rotation: newRot,
      pitch,
      roll,
      turretRotation: player.turretRotation,
      turretSwayOffset: 0,
      tankType: player.tankType,
    });

    // Turret aiming
    const ammoStats = playerDef.weapons[useGameStore.getState().ammoType]!;
    const now = performance.now();
    const aiming = computeTurretAiming({
      currentTurretRot: player.turretRotation,
      currentSightPitch: player.sightPitch,
      currentGunElev: player.gunElevation,
      cameraYaw: input.cameraYaw.current,
      cameraPitch: input.cameraPitch.current,
      hullRotation: newRot,
      hullPitch: pitch,
      hullRoll: roll,
      isAiming: input.isAiming.current,
      arrowKeys: {
        left: input.keys.current['ArrowLeft'] ? (now - input.arrowKeyPressStartedAt.current.left) / 1000 : 0,
        right: input.keys.current['ArrowRight'] ? (now - input.arrowKeyPressStartedAt.current.right) / 1000 : 0,
        up: input.keys.current['ArrowUp'] ? (now - input.arrowKeyPressStartedAt.current.up) / 1000 : 0,
        down: input.keys.current['ArrowDown'] ? (now - input.arrowKeyPressStartedAt.current.down) / 1000 : 0,
      },
      calibrationDistance: useGameStore.getState().calibrationDistance,
      ammoVelocity: ammoStats.velocity,
      turretSpeed: playerDef.turretSpeed,
      gunSpeed: playerDef.gunSpeed,
      minGunElevation: playerDef.minGunElevation,
      maxGunElevation: playerDef.maxGunElevation,
      designatedTarget: designatedTargetForAiming,
      aimOriginWorld: designatedTargetForAiming ? currentAimOriginWorld : undefined,
      delta,
    });

    // Gun sway
    const { turretSwayOffset, gunSwayOffset } = updateGunSway(input.swayState.current, {
      forwardSpeed, rotationSpeed, maxSpeed: playerDef.maxSpeed,
      pitch, roll,
      prevPitch: input.swayPrev.current.pitch,
      prevRoll: input.swayPrev.current.roll,
      prevForwardSpeed: input.swayPrev.current.forwardSpeed,
      prevRotationSpeed: input.swayPrev.current.rotationSpeed,
      time: state.clock.getElapsedTime(), delta,
    });
    input.swayPrev.current = { pitch, roll, forwardSpeed, rotationSpeed };

    // Compute gun sight aim point
    const aimResult = computeAimPoint({
      position: newPos,
      rotation: newRot,
      pitch, roll,
      turretRotation: aiming.turretRotation,
      sightPitch: aiming.sightPitch,
      turretSwayOffset,
      gunSwayOffset,
      tankType: useGameStore.getState().playerTank.tankType,
    });

    // Without right-click the gunner's mouse look is not driving anything, so keep the
    // free-look direction on the sight line. Otherwise it drifts unseen, and the next
    // right-click or return to third-person swings to wherever it ended up.
    if (viewMode === 'gunner' && !input.isAiming.current) {
      const sightDir = computeAimPoint({
        position: newPos,
        rotation: newRot,
        pitch, roll,
        turretRotation: aiming.turretRotation,
        sightPitch: aiming.sightPitch,
        turretSwayOffset: 0,
        gunSwayOffset: 0,
        tankType: player.tankType,
      }).aimDir;
      input.cameraYaw.current = Math.atan2(sightDir.x, sightDir.z) - newRot;
      input.cameraPitch.current = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp(sightDir.y, -1, 1)), -Math.PI / 4, Math.PI / 4);
    }

    // Camera shake decay
    useGameStore.getState().decayCameraShake(delta);

    const actualGunAimTarget = resolveDesignatedAimTarget(
      aimResult.aimGunPivotWorld,
      aimResult.aimDir,
      2000,
      'player',
    ).point;

    const hasManualGunnerAim = input.keys.current['ArrowLeft']
      || input.keys.current['ArrowRight']
      || input.keys.current['ArrowUp']
      || input.keys.current['ArrowDown'];

    let designatedAimTarget = thirdPersonDesignatedTarget?.point ?? player.designatedAimTarget;
    if (viewMode === 'gunner') {
      designatedAimTarget = hasManualGunnerAim
        ? actualGunAimTarget
        : (preservedTransitionTarget ?? player.designatedAimTarget);
    }

    // Camera placement
    const shakeIntensity = useGameStore.getState().cameraShake;
    updateCamera({
      camera, viewMode,
      thirdPersonPosition: cameraPos,
      lookDir,
      aimGunPivotWorld: aimResult.aimGunPivotWorld,
      aimDir: aimResult.aimDir,
      designatedAimTarget,
      gunnerAimTarget: actualGunAimTarget,
      shakeIntensity,
      gunnerZoom: useGameStore.getState().gunnerZoom,
      smoothZoom: previousViewMode.current === 'gunner',
      delta,
    });

    // Update direction indicator with actual camera yaw
    const actualCamYaw = viewMode === 'gunner'
      ? Math.atan2(aimResult.aimDir.x, aimResult.aimDir.z)
      : camYawAbs;
    useGameStore.getState().setCameraYawAbs(actualCamYaw);

    // Update burst fire (autocannon)
    updatePlayerBurst();

    if (input.keys.current['Space'] || input.primaryFireHeld.current) {
      fireTank();
    }

    updatePlayer({
      position: newPos,
      rotation: newRot,
      pitch,
      roll,
      turretRotation: aiming.turretRotation,
      sightPitch: aiming.sightPitch,
      gunElevation: aiming.gunElevation,
      turretSwayOffset,
      gunSwayOffset,
      gunSightAimPoint: actualGunAimTarget,
      aimDir: aimResult.aimDir,
      aimGunPivotWorld: aimResult.aimGunPivotWorld,
      designatedAimTarget,
      speed: forwardSpeed,
      leftTrackSpeed: leftSpeed,
      rightTrackSpeed: rightSpeed,
      engineRPM: engine.rpm,
      gear: engine.gear,
    });

    previousViewMode.current = viewMode;
  });

  return null;
}

/**
 * The tanks, kept mounted for the whole battle. Map mode hides them with one
 * group instead of unmounting them, which rebuilt every tank's merged meshes
 * each time the map closed. The tank components are memoised so the toggle
 * does not re-render their hundreds of parts either.
 */
function BattleTanks() {
  const enemyIds = useGameStore(useShallow((state) => state.enemies.map(e => e.id)));
  const allyIds = useGameStore(useShallow((state) => state.allies.map(a => a.id)));
  const isMapMode = useGameStore((state) => state.isMapMode);
  // The aim marker floats above the whole HUD; the after-action report must not sit under it.
  const battleOver = useGameStore((state) => state.battleStats.outcome !== null);
  const viewMode = useGameStore((state) => state.viewMode);
  return (
    <>
      <group visible={!isMapMode}>
        <PlayerTank visible={viewMode !== 'gunner'} />
        {enemyIds.map((id) => (
          <EnemyTank key={id} id={id} />
        ))}
        {allyIds.map((id) => (
          <AllyTank key={id} id={id} />
        ))}
      </group>
      {!isMapMode && !battleOver && <GunAimPoint />}
    </>
  );
}

/** Symbols, orders and grid of the tactical map (M). */
function TacticalMapLayer() {
  const spottedEnemyIds = useGameStore(useShallow((state) => state.enemies
    .filter((enemy) => state.playerSideSpotting[enemy.id]?.spotted)
    .map((enemy) => enemy.id)));
  const allyIds = useGameStore(useShallow((state) => state.allies.map(a => a.id)));
  const isMapMode = useGameStore((state) => state.isMapMode);
  return (
    <>
      <BattleMapGrid active={isMapMode} />
      {isMapMode && (
        <>
          <MapMarker id="player" isPlayer />
          {spottedEnemyIds.map((id) => (
            <MapMarker key={id} id={id} />
          ))}
          {allyIds.map((id) => (
            <MapMarker key={id} id={id} isAlly />
          ))}
          <WaypointMarkers />
          <MapCameraController />
        </>
      )}
    </>
  );
}

// Each reads map mode itself, so toggling the map re-renders only these,
// not the whole scene.
function SceneLighting() {
  return <BattlefieldLighting mapMode={useGameStore((state) => state.isMapMode)} />;
}

function SceneTerrain() {
  return <Terrain showGroundCover={!useGameStore((state) => state.isMapMode)} />;
}

function ScenePostProcessing() {
  return <BattlefieldPostProcessing mapMode={useGameStore((state) => state.isMapMode)} />;
}

export function GameScene() {
  return (
    <div className="battlefield-canvas">
      <Canvas
        shadows="percentage"
        dpr={[1, 1.5]}
        camera={{ position: [0, 5, -10], fov: 60, near: 0.08, far: 3600 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => {
          gl.outputColorSpace = THREE.SRGBColorSpace;
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.toneMappingExposure = 1.15;
          gl.shadowMap.type = THREE.PCFShadowMap;
        }}
      >
        <Suspense fallback={null}>
          <SceneLighting />

          <SceneTerrain />
          <Buildings />
          <Trees />
          <Understory />
          <ForestScreen />
          <WorldDressing />
          <HorizonSkirt />
          <TrackRepairManager />
          <PlayerController />
          <SpottingSystem />
          <AudioSync />

          <BattleTanks />
          <TacticalMapLayer />

          <ProjectileManager />
          <TrackMarks />
          <ImpactDecals />
          <Particles />
          <FlashLights />
          <BurningWrecks />
          <EnemyAI />
          <AllyAI />
          <IndependentAllyAI />
          <ScenePostProcessing />
        </Suspense>
      </Canvas>
    </div>
  );
}
