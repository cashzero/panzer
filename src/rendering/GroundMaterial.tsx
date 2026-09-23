import { useEffect, useMemo } from 'react';
import { useTexture } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store';
import { createTerrainSplatData, ROAD_DISTANCE_RANGE } from './terrainSplat';
import hexTiling from './vendor/hexTiling.glsl?raw';
import { getMeadowNoiseUniform, meadowNoise } from './meadowNoise';
import { getWoodlandMask } from './woodland';
import { treeLayoutSignature } from '../treeIndex';

/**
 * Ground inputs other shaders read (the grass field). They are uniform
 * objects, so every material holding them sees a regenerated world at once;
 * values stay null until the ground has built them.
 */
export const groundShaderInputs = {
  groundSplat: { value: null as THREE.Texture | null },
  cropSplat: { value: null as THREE.Texture | null },
  woodSplat: { value: null as THREE.Texture | null },
  grassAlbedo: { value: null as THREE.Texture | null },
  soilAlbedo: { value: null as THREE.Texture | null },
  macroAlbedo: { value: null as THREE.Texture | null },
  groundSize: { value: 1 },
};

const paths = ['grass004', 'brown_mud_dry', 'gravel_road'].flatMap(
  (name) => ['Diffuse', 'nor_gl'].map((map) => `/assets/terrain/${name}/${map}.jpg`),
).concat('/assets/terrain/aerial_grass_rock/Diffuse.jpg');

export function GroundMaterial() {
  const loaded = useTexture(paths);
  const { gl } = useThree();
  const roadNetwork = useGameStore((s) => s.roadNetwork);
  const farmlands = useGameStore((s) => s.farmlands);
  const buildings = useGameStore((s) => s.buildings);
  const yards = useGameStore((s) => s.yards);
  // Knockdowns replace the tree array but not the layout the floor follows.
  const treeLayout = treeLayoutSignature(useGameStore((s) => s.trees));
  const woodland = useMemo(() => {
    const mask = getWoodlandMask(useGameStore.getState().trees, roadNetwork.terrainSize);
    const texture = new THREE.DataTexture(mask.data, mask.resolution, mask.resolution, THREE.RedFormat);
    texture.minFilter = texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  }, [treeLayout, roadNetwork.terrainSize]);
  const textures = useMemo(() => loaded.map((source, index) => {
    const texture = source.clone();
    texture.colorSpace = index % 2 === 0 ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    texture.needsUpdate = true;
    return texture;
  }), [loaded, gl]);
  const splat = useMemo(() => {
    const { data, resolution, crops, cropResolution } = createTerrainSplatData(roadNetwork, farmlands, buildings, 2048, yards);
    const toTexture = (source: Uint8Array, size: number, format: THREE.PixelFormat) => {
      const texture = new THREE.DataTexture(source, size, size, format);
      texture.minFilter = texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = false;
      texture.needsUpdate = true;
      return texture;
    };
    return { ground: toTexture(data, resolution, THREE.RGFormat), crops: toTexture(crops, cropResolution, THREE.RGBAFormat) };
  }, [roadNetwork, farmlands, buildings, yards]);

  const material = useMemo(() => {
    const ground = new THREE.MeshPhysicalMaterial({
      map: textures[0], normalMap: textures[1], normalScale: new THREE.Vector2(0.55, 0.55),
      roughness: 1, metalness: 0, specularIntensity: 0, dithering: true,
    });
    ground.customProgramCacheKey = () => 'ground-splat-hex-v5';
    ground.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, {
        macroAlbedo: { value: textures[6] },
        grassAlbedo: { value: textures[0] }, grassNormal: { value: textures[1] },
        soilAlbedo: { value: textures[2] }, soilNormal: { value: textures[3] },
        roadAlbedo: { value: textures[4] }, roadNormal: { value: textures[5] },
        groundSplat: { value: splat.ground }, cropSplat: { value: splat.crops }, woodSplat: { value: woodland }, groundSize: { value: roadNetwork.terrainSize },
        meadowNoiseMap: getMeadowNoiseUniform(),
        hexTilingUseContrastCorrectedBlending: { value: false },
        hexTilingPatchScale: { value: 2 }, hexTilingLookupSkipThreshold: { value: 0.01 },
        hexTilingTextureSampleCoefficientExponent: { value: 8 },
      });
      shader.vertexShader = 'varying vec3 vGroundPosition;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\nvGroundPosition = (modelMatrix * vec4(position, 1.0)).xyz;');
      shader.fragmentShader = `
        varying vec3 vGroundPosition;
        uniform sampler2D macroAlbedo, grassAlbedo, grassNormal, soilAlbedo, soilNormal, roadAlbedo, roadNormal, groundSplat, cropSplat, woodSplat;
        uniform float groundSize;
        ${hexTiling}
        ${meadowNoise}
        // Fade a periodic pattern out before its period drops below a few pixels.
        float patternFade(float coordinate, float period) {
          float footprint = length(vec2(dFdx(coordinate), dFdy(coordinate)));
          return 1.0 - smoothstep(0.2, 0.55, footprint / period);
        }
      ` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
        vec2 groundUv = vGroundPosition.xz;
        vec2 splatUv = groundUv / groundSize + 0.5;
        vec2 field = texture2D(groundSplat, splatUv).rg;
        vec4 crop = texture2D(cropSplat, splatUv);
        float roadDistance = (field.r - 0.5) * ${ROAD_DISTANCE_RANGE * 2}.0;
        // World-scale breakup; full-color scans carry the fine detail.
        vec3 macroColor = texture2D(macroAlbedo, groundUv * 0.008).rgb;
        float macroNoise = clamp(dot(macroColor, vec3(0.333)) * 4.0, 0.0, 1.0);
        float edgeNoise = texture2D(soilAlbedo, groundUv * 0.7).r - 0.15;
        float roadWeight = 1.0 - smoothstep(-1.0, 2.0, roadDistance + edgeNoise * 1.8);
        // Worn bare patches in the pasture: gateways, scrapes, thin soil over chalk.
        float bare = smoothstep(0.8, 0.94, meadowValue(groundUv / 11.0 + 31.0) + edgeNoise * 0.45) * 0.45;
        float soilWeight = clamp(field.g + smoothstep(0.57, 0.84, macroNoise) * 0.12 + bare * (1.0 - field.g), 0.0, 1.0);
        vec2 grassUv = groundUv * 1.64;
        vec2 soilUv = groundUv * 1.35;
        vec2 roadUv = groundUv * 0.95;
        vec2 groundDx = dFdx(groundUv), groundDy = dFdy(groundUv);
        vec3 groundColor;
        if (roadWeight > 0.995) {
          groundColor = textureNoTileNeyret(roadAlbedo, roadUv, groundDx * 0.95, groundDy * 0.95).rgb;
        } else {
          groundColor = textureNoTileNeyret(grassAlbedo, grassUv, groundDx * 1.64, groundDy * 1.64).rgb;
          if (soilWeight > 0.01) groundColor = mix(groundColor, textureNoTileNeyret(soilAlbedo, soilUv, groundDx * 1.35, groundDy * 1.35).rgb, soilWeight);
          if (roadWeight > 0.005) groundColor = mix(groundColor, textureNoTileNeyret(roadAlbedo, roadUv, groundDx * 0.95, groundDy * 0.95).rgb, roadWeight);
        }
        float grassWeight = (1.0 - roadWeight) * (1.0 - soilWeight);
        groundColor = mix(groundColor, groundColor * (0.55 + macroColor * 2.5), grassWeight * 0.65);
        // Late-summer pasture: pull the lush scan toward straw and olive; take
        // the brick red out of the gravel so roads read as packed dirt.
        float groundLuma = dot(groundColor, vec3(0.2126, 0.7152, 0.0722));
        vec3 dryGrass = mix(vec3(groundLuma), groundColor, 0.8) * vec3(1.04, 0.98, 0.82);
        vec3 dirtRoad = mix(vec3(groundLuma), groundColor, 0.4) * vec3(1.02, 0.98, 0.9);
        // Pasture changes over tens of metres, from lush green to sun-dried straw.
        float dryness = meadowDryness(groundUv);
        vec3 lushGrass = mix(vec3(groundLuma), groundColor, 0.85) * vec3(0.9, 0.96, 0.68);
        vec3 pasture = pastureTone(groundColor, dryness);
        // Verges and ditches beside the lanes stay damp and green.
        float verge = smoothstep(0.3, 1.2, roadDistance) * (1.0 - smoothstep(2.2, 3.8, roadDistance + edgeNoise * 1.5));
        pasture = mix(pasture, lushGrass * 0.82, verge * 0.7);
        // Faint animal tracks wander across some fields.
        float trackNoise = meadowValueB(groundUv / 48.0 + 7.0);
        float track = (1.0 - smoothstep(0.004, 0.018, abs(trackNoise - 0.5)))
          * smoothstep(0.55, 0.68, meadowValue(groundUv / 150.0 - 3.0)) * patternFade(trackNoise, 0.05);
        pasture = mix(pasture, dirtRoad * 0.95, track * 0.55);
        groundColor = mix(groundColor, pasture, grassWeight);
        groundColor = mix(groundColor, dirtRoad, roadWeight);

        // Farmland. Rows run along each plot's long side.
        float rowAngle = crop.a * 3.14159265;
        vec2 acrossRows = vec2(cos(rowAngle), sin(rowAngle));
        float rowCoord = dot(groundUv, acrossRows);
        float cropWeight = (1.0 - roadWeight);
        // Ragged headlands rather than a soft blur at each plot edge.
        vec3 cropEdge = smoothstep(0.3, 0.7, crop.rgb + edgeNoise * 0.35);
        float ploughed = cropEdge.r * cropWeight;
        float stubble = cropEdge.g * cropWeight;
        float hay = cropEdge.b * cropWeight;
        float furrowFade = patternFade(rowCoord, 0.85);
        // Hand-guided ploughing wanders a little from row to row.
        float furrowPhase = rowCoord * 7.392 + meadowValue(groundUv / 6.0) * 1.6;
        float furrow = sin(furrowPhase) * furrowFade;
        if (ploughed > 0.005) {
          // Turned earth: darker and wetter than the dry scan, ridged in rows.
          vec3 turned = mix(vec3(groundLuma), groundColor, 0.5) * vec3(0.8, 0.7, 0.6) * (0.94 + 0.1 * furrow);
          groundColor = mix(groundColor, turned, ploughed);
        }
        if (stubble > 0.005) {
          // Harvested corn: pale straw in reaper-width swaths over fine rows.
          float swath = sin(rowCoord * 1.366 + meadowValue(groundUv / 40.0) * 2.0);
          float rows = sin(rowCoord * 34.9) * patternFade(rowCoord, 0.18);
          vec3 straw = vec3(groundLuma) * vec3(1.72, 1.42, 0.74) * (0.93 + 0.09 * swath + 0.08 * rows);
          groundColor = mix(groundColor, straw, stubble * 0.9);
        }
        if (hay > 0.005) {
          // Uncut hay: taller, paler grass combed into broad sheens by the wind.
          float sheen = meadowValue(vec2(rowCoord / 14.0, dot(groundUv, vec2(-acrossRows.y, acrossRows.x)) / 40.0));
          vec3 hayColor = dryGrass * vec3(1.14, 1.1, 0.84) * (0.92 + 0.16 * sheen);
          groundColor = mix(groundColor, hayColor, hay);
        }
        // Leaf litter and moss under the woods and rows, in the canopy's shade.
        float woodFloor = smoothstep(0.1, 0.6, texture2D(woodSplat, splatUv).r + edgeNoise * 0.25) * (1.0 - roadWeight);
        if (woodFloor > 0.005) {
          float litterNoise = meadowValue(groundUv / 3.5 + 41.0);
          vec3 litter = vec3(groundLuma) * vec3(0.92, 0.74, 0.5) * (0.72 + 0.35 * litterNoise);
          vec3 moss = lushGrass * 0.62;
          vec3 floorColor = mix(litter, moss, 0.25 + smoothstep(0.4, 0.8, meadowValueB(groundUv / 9.0 - 13.0)) * 0.5) * 0.86;
          groundColor = mix(groundColor, floorColor, woodFloor);
        }
        // Soil seen between the grass blades near the camera lies in their shade.
        float swardShade = (1.0 - roadWeight) * (1.0 - soilWeight) * (1.0 - woodFloor);
        groundColor *= mix(1.0, mix(0.7, 1.0, smoothstep(12.0, 90.0, length(vViewPosition))), swardShade);
        // Past the range where the scans still read, field-sized blotches keep
        // the middle distance from settling into one flat tone.
        float farBlend = smoothstep(60.0, 320.0, length(vViewPosition));
        float farPatch = meadowValueB(groundUv / 55.0 + 11.0) * 0.7 + meadowValue(groundUv / 19.0 - 23.0) * 0.3;
        groundColor *= mix(1.0, 0.84 + 0.32 * farPatch, farBlend * (1.0 - roadWeight));
        diffuseColor.rgb *= groundColor * mix(0.78, 1.02, macroNoise);
      `);
      shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
        vec3 groundNormal;
        if (roadWeight > 0.995) {
          groundNormal = textureNoTileNeyret(roadNormal, roadUv, groundDx * 0.95, groundDy * 0.95).xyz;
        } else {
          groundNormal = textureNoTileNeyret(grassNormal, grassUv, groundDx * 1.64, groundDy * 1.64).xyz;
          if (soilWeight > 0.01) groundNormal = mix(groundNormal, textureNoTileNeyret(soilNormal, soilUv, groundDx * 1.35, groundDy * 1.35).xyz, soilWeight);
          if (roadWeight > 0.005) groundNormal = mix(groundNormal, textureNoTileNeyret(roadNormal, roadUv, groundDx * 0.95, groundDy * 0.95).xyz, roadWeight);
        }
        groundNormal = groundNormal * 2.0 - 1.0;
        // Sub-pixel relief fades before it can shimmer along the horizon.
        float normalFade = 1.0 - smoothstep(45.0, 180.0, length(vViewPosition));
        groundNormal.xy *= normalScale * normalFade;
        normal = normalize(getTangentFrame(-vViewPosition, normal, groundUv) * normalize(groundNormal));
        if (ploughed > 0.005) {
          // Furrow ridges tilt the surface across the rows.
          vec3 ridgeTilt = vec3(acrossRows.x, 0.0, acrossRows.y) * cos(furrowPhase) * 0.22 * ploughed * furrowFade;
          normal = normalize(normal + (viewMatrix * vec4(ridgeTilt, 0.0)).xyz);
        }
      `);
    };
    return ground;
  }, [textures, splat, woodland, roadNetwork.terrainSize]);
  useEffect(() => {
    groundShaderInputs.groundSplat.value = splat.ground;
    groundShaderInputs.cropSplat.value = splat.crops;
    groundShaderInputs.woodSplat.value = woodland;
    groundShaderInputs.grassAlbedo.value = textures[0];
    groundShaderInputs.soilAlbedo.value = textures[2];
    groundShaderInputs.macroAlbedo.value = textures[6];
    groundShaderInputs.groundSize.value = roadNetwork.terrainSize;
  }, [splat, woodland, textures, roadNetwork.terrainSize]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => { splat.ground.dispose(); splat.crops.dispose(); }, [splat]);
  useEffect(() => () => woodland.dispose(), [woodland]);
  useEffect(() => () => textures.forEach((texture) => texture.dispose()), [textures]);
  return <primitive object={material} attach="material" />;
}
