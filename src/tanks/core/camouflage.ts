/**
 * Historical paint schemes. A tank lists the ids it may wear in
 * `tank.json` `appearance.camouflage`; the first entry is its default.
 * Colours are sRGB approximations of the RAL references, as they read weathered.
 */
export type CamouflagePattern = 'solid' | 'blotches' | 'bands' | 'ambush' | 'whitewash';

export interface CamouflageScheme {
  id: string;
  name: string;
  /** Compact label for dense lists such as the OOB roster. */
  shortName: string;
  period: string;
  /** Base coat; the pattern colours are sprayed or brushed over it. */
  base: string;
  pattern: CamouflagePattern;
  colors: string[];
}

const DUNKELGRAU = '#3b3e3f'; // RAL 7021
const DUNKELBRAUN = '#4a3a2c'; // RAL 7017
const DUNKELGELB = '#857853'; // RAL 7028
const OLIVGRUEN = '#4a5237'; // RAL 6003
const ROTBRAUN = '#5a3d2e'; // RAL 8017
const WHITEWASH = '#d4d2c7';

export const CAMOUFLAGE_SCHEMES: Record<string, CamouflageScheme> = {
  dunkelgrau: { id: 'dunkelgrau', name: 'Dunkelgrau', shortName: 'Grau', period: '1940-43', base: DUNKELGRAU, pattern: 'solid', colors: [] },
  'grau-braun': { id: 'grau-braun', name: 'Grau / Braun', shortName: 'Grau/Braun', period: '1937-40', base: DUNKELGRAU, pattern: 'blotches', colors: [DUNKELBRAUN] },
  wintertarnung: { id: 'wintertarnung', name: 'Winter whitewash', shortName: 'Winter', period: 'East, winter', base: DUNKELGRAU, pattern: 'whitewash', colors: [WHITEWASH] },
  dunkelgelb: { id: 'dunkelgelb', name: 'Dunkelgelb', shortName: 'Gelb', period: '1943-45', base: DUNKELGELB, pattern: 'solid', colors: [] },
  dreifarben: { id: 'dreifarben', name: 'Three-tone', shortName: 'Dreifarben', period: '1943-45', base: DUNKELGELB, pattern: 'bands', colors: [OLIVGRUEN, ROTBRAUN] },
  hinterhalt: { id: 'hinterhalt', name: 'Hinterhalt (ambush)', shortName: 'Hinterhalt', period: '1944-45', base: DUNKELGELB, pattern: 'ambush', colors: [OLIVGRUEN, ROTBRAUN] },
};

/** Schemes available to a tank; tanks without a list wear their base colour. */
export function resolveCamouflageSchemes(schemeIds: string[] | undefined, baseColor: string): CamouflageScheme[] {
  const schemes = (schemeIds ?? []).map((id) => CAMOUFLAGE_SCHEMES[id]).filter(Boolean);
  return schemes.length > 0
    ? schemes
    : [{ id: 'factory', name: 'Factory paint', shortName: 'Factory', period: '', base: baseColor, pattern: 'solid', colors: [] }];
}

export function getCamouflageScheme(schemes: CamouflageScheme[], id: string | undefined): CamouflageScheme {
  return schemes.find((scheme) => scheme.id === id) ?? schemes[0];
}

/** Stable per-vehicle pattern offset so two tanks of one type are not identical. */
export function camouflageSeed(vehicleId: string): number {
  let hash = 2166136261;
  for (let index = 0; index < vehicleId.length; index++) {
    hash ^= vehicleId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 10000) / 100;
}
