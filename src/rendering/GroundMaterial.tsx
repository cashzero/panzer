import { useEffect, useMemo } from 'react';
import { useTexture } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store';
import { createTerrainSplatData, ROAD_DISTANCE_RANGE } from './terrainSplat';
import hexTiling from './vendor/hexTiling.glsl?raw';

const paths = ['grass004', 'brown_mud_dry', 'gravel_road'].flatMap(
  (name) => ['Diffuse', 'nor_gl'].map((map) => `/assets/terrain/${name}/${map}.jpg`),
).concat('/assets/terrain/aerial_grass_rock/Diffuse.jpg');

export function GroundMaterial() {
  const loaded = useTexture(paths);
  const { gl } = useThree();
  const roadNetwork = useGameStore((s) => s.roadNetwork);
  const farmlands = useGameStore((s) => s.farmlands);
  const buildings = useGameStore((s) => s.buildings);
  const textures = useMemo(() => loaded.map((source, index) => {
    const texture = source.clone();
    texture.colorSpace = index % 2 === 0 ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.anisotropy = Math.min(8, gl.capabilities.getMaxAnisotropy());
    texture.needsUpdate = true;
    return texture;
  }), [loaded, gl]);
  const splat = useMemo(() => {
    const { data, resolution } = createTerrainSplatData(roadNetwork, farmlands, buildings);
    const texture = new THREE.DataTexture(data, resolution, resolution, THREE.RGFormat);
    texture.minFilter = texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    texture.needsUpdate = true;
    return texture;
  }, [roadNetwork, farmlands, buildings]);

  const material = useMemo(() => {
    const ground = new THREE.MeshPhysicalMaterial({
      map: textures[0], normalMap: textures[1], normalScale: new THREE.Vector2(0.55, 0.55),
      roughness: 1, metalness: 0, specularIntensity: 0, dithering: true,
    });
    ground.customProgramCacheKey = () => 'ground-splat-hex-v4';
    ground.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, {
        macroAlbedo: { value: textures[6] },
        grassAlbedo: { value: textures[0] }, grassNormal: { value: textures[1] },
        soilAlbedo: { value: textures[2] }, soilNormal: { value: textures[3] },
        roadAlbedo: { value: textures[4] }, roadNormal: { value: textures[5] },
        groundSplat: { value: splat }, groundSize: { value: roadNetwork.terrainSize },
        hexTilingUseContrastCorrectedBlending: { value: false },
        hexTilingPatchScale: { value: 2 }, hexTilingLookupSkipThreshold: { value: 0.01 },
        hexTilingTextureSampleCoefficientExponent: { value: 8 },
      });
      shader.vertexShader = 'varying vec3 vGroundPosition;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\nvGroundPosition = (modelMatrix * vec4(position, 1.0)).xyz;');
      shader.fragmentShader = `
        varying vec3 vGroundPosition;
        uniform sampler2D macroAlbedo, grassAlbedo, grassNormal, soilAlbedo, soilNormal, roadAlbedo, roadNormal, groundSplat;
        uniform float groundSize;
        ${hexTiling}
      ` + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
        vec2 groundUv = vGroundPosition.xz;
        vec2 field = texture2D(groundSplat, groundUv / groundSize + 0.5).rg;
        float roadDistance = (field.r - 0.5) * ${ROAD_DISTANCE_RANGE * 2}.0;
        // World-scale breakup; full-color scans carry the fine detail.
        vec3 macroColor = texture2D(macroAlbedo, groundUv * 0.008).rgb;
        float macroNoise = clamp(dot(macroColor, vec3(0.333)) * 4.0, 0.0, 1.0);
        float edgeNoise = texture2D(soilAlbedo, groundUv * 0.7).r - 0.15;
        float roadWeight = 1.0 - smoothstep(-1.0, 2.0, roadDistance + edgeNoise * 1.8);
        float soilWeight = clamp(field.g + smoothstep(0.57, 0.84, macroNoise) * 0.12, 0.0, 1.0);
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
        groundColor = mix(groundColor, dryGrass, grassWeight);
        groundColor = mix(groundColor, dirtRoad, roadWeight);
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
      `);
    };
    return ground;
  }, [textures, splat, roadNetwork.terrainSize]);
  useEffect(() => () => material.dispose(), [material]);
  useEffect(() => () => splat.dispose(), [splat]);
  useEffect(() => () => textures.forEach((texture) => texture.dispose()), [textures]);
  return <primitive object={material} attach="material" />;
}
