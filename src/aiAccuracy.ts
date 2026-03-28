import { GAME_CONFIG } from './config';
import { randGauss } from './firing';

export interface AiAccuracyState {
  targetId: string;
  shotsOnTarget: number;
}

export interface AiAimOffset {
  targetId: string;
  azimuth: number;
  elevation: number;
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

export function getAiAccuracyProgress(shotsOnTarget: number): number {
  return Math.min(shotsOnTarget / GAME_CONFIG.ai.shotsToMaxAccuracy, 1);
}

export function getAiAimDispersion(shotsOnTarget: number): number {
  return lerp(
    GAME_CONFIG.ai.initialAimDispersion,
    GAME_CONFIG.ai.minAimDispersion,
    getAiAccuracyProgress(shotsOnTarget)
  );
}

export function getAiFireDispersion(shotsOnTarget: number): number {
  return lerp(
    GAME_CONFIG.ai.initialFireDispersion,
    GAME_CONFIG.ai.minFireDispersion,
    getAiAccuracyProgress(shotsOnTarget)
  );
}

function createAimOffset(targetId: string, dispersion: number): AiAimOffset {
  return {
    targetId,
    azimuth: randGauss() * dispersion,
    elevation: randGauss() * dispersion,
  };
}

export function ensureAiAccuracyState(
  accuracyByActor: Record<string, AiAccuracyState>,
  aimOffsetsByActor: Record<string, AiAimOffset>,
  actorId: string,
  targetId: string,
): AiAccuracyState {
  let state = accuracyByActor[actorId];
  if (!state || state.targetId !== targetId) {
    state = { targetId, shotsOnTarget: 0 };
    accuracyByActor[actorId] = state;
    aimOffsetsByActor[actorId] = createAimOffset(targetId, getAiAimDispersion(0));
    return state;
  }

  const aimOffset = aimOffsetsByActor[actorId];
  if (!aimOffset || aimOffset.targetId !== targetId) {
    aimOffsetsByActor[actorId] = createAimOffset(targetId, getAiAimDispersion(state.shotsOnTarget));
  }

  return state;
}

export function registerAiShot(
  accuracyByActor: Record<string, AiAccuracyState>,
  aimOffsetsByActor: Record<string, AiAimOffset>,
  actorId: string,
  targetId: string,
): AiAccuracyState {
  const state = ensureAiAccuracyState(accuracyByActor, aimOffsetsByActor, actorId, targetId);
  const nextShotsOnTarget = Math.min(state.shotsOnTarget + 1, GAME_CONFIG.ai.shotsToMaxAccuracy);
  const nextState = { targetId, shotsOnTarget: nextShotsOnTarget };

  accuracyByActor[actorId] = nextState;
  aimOffsetsByActor[actorId] = createAimOffset(targetId, getAiAimDispersion(nextShotsOnTarget));

  return nextState;
}
