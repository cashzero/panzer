import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useGameStore } from '../store';
import { getTerrainHeightTexture } from '../Terrain';
import { SUN_DIRECTION } from './BattlefieldLighting';
import { groundShaderInputs } from './GroundMaterial';
import { getMeadowNoiseUniform, meadowNoise } from './meadowNoise';
import { ROAD_DISTANCE_RANGE } from './terrainSplat';
import quickGrass from './vendor/quickGrass.glsl?raw';

/**
 * Procedural blade grass after Ghost of Tsushima (GDC 2021), following
 * SimonDev's Quick_Grass (MIT, see vendor/quick-grass.LICENSE): curved,
 * tapered blades with rounded normals, clumps that share a lean and height,
 * noise-driven wind, view-space thickening so edge-on blades do not vanish,
 * and back-lit scatter through the blades.
 *
 * Everything per blade happens on the GPU. The CPU lays a camera-snapped grid
 * of patches, culls them against the frustum and uploads their origins as
 * instances. Heights come from the rendered terrain mesh (exactly), and the
 * blade colour, height and density from the same splat, crop and woodland
 * masks the ground shader uses, so grass stands in turf of its own colour,
 * stops at roads, thins to weeds on ploughed land and turns to stubble or hay.
 */

interface GrassLayer {
  /** Patch edge in metres; blades per patch side; segments per blade. */
  patch: number;
  bladesPerSide: number;
  segments: number;
  width: number;
  /** Blades appear beyond fadeIn (randomised over the band) and leave by fadeOut. */
  fadeIn: [number, number];
  fadeOut: [number, number];
  /** Shrink blades into the ground over this band (the outer edge of all grass). */
  shrink: [number, number];
}

// About 30 blades/m² near the camera, 9/m² of wider low-detail blades beyond.
const NEAR: GrassLayer = { patch: 4, bladesPerSide: 22, segments: 4, width: 0.04, fadeIn: [0, 0], fadeOut: [15, 20], shrink: [1e4, 1e4 + 1] };
const FAR: GrassLayer = { patch: 8, bladesPerSide: 24, segments: 1, width: 0.09, fadeIn: [15, 20], fadeOut: [1e4, 1e4 + 1], shrink: [60, 95] };
/** Typical pasture height (m) before dryness, clump and crop adjustments. */
const GRASS_HEIGHT = 0.34;
const TRAMPLERS = 8;

function createPatchGeometry(layer: GrassLayer, maxPatches: number) {
  const positions: number[] = [];
  const sides: number[] = [];
  const indices: number[] = [];
  const spacing = layer.patch / layer.bladesPerSide;
  for (let bz = 0; bz < layer.bladesPerSide; bz++) {
    for (let bx = 0; bx < layer.bladesPerSide; bx++) {
      // The shader jitters roots per patch; the layout here is a plain grid.
      const x = (bx + 0.5) * spacing, z = (bz + 0.5) * spacing;
      const base = positions.length / 3;
      for (let level = 0; level <= layer.segments; level++) {
        for (let side = 0; side < 2; side++) {
          // y carries the height fraction along the blade.
          positions.push(x, level / layer.segments, z);
          sides.push(side);
        }
      }
      for (let level = 0; level < layer.segments; level++) {
        const v = base + level * 2;
        indices.push(v, v + 1, v + 2, v + 2, v + 1, v + 3);
      }
    }
  }
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aSide', new THREE.Float32BufferAttribute(sides, 1));
  // The shader computes normals, but Three.js forces flat shading (no vNormal)
  // on standard materials whose geometry has no normal attribute.
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(positions.length).fill(0), 3));
  geometry.setIndex(indices);
  const origins = new THREE.InstancedBufferAttribute(new Float32Array(maxPatches * 2), 2);
  origins.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('patchOrigin', origins);
  geometry.instanceCount = 0;
  return { geometry, origins, spacing };
}

const grassTime = { value: 0 };
const tramplers = { value: Array.from({ length: TRAMPLERS }, () => new THREE.Vector4(0, 0, 0, 0)) };
const sunDirection = { value: SUN_DIRECTION.clone().normalize() };

const vertexHead = /* glsl */ `
  attribute float aSide;
  attribute vec2 patchOrigin;
  uniform sampler2D grassHeight;
  uniform vec4 grassHeightInfo;
  uniform sampler2D groundSplat, cropSplat, woodSplat, grassAlbedo, soilAlbedo, macroAlbedo;
  uniform float groundSize;
  uniform float grassTime;
  uniform vec4 grassFade;     // fade in start/end, fade out start/end (m)
  uniform vec2 grassShrink;   // shrink into the ground start/end (m)
  uniform vec4 grassBlade;    // width, height, root spacing, high detail (1/0)
  uniform vec4 grassTramplers[${TRAMPLERS}];
  varying vec3 vGrassColour;
  varying vec4 vGrassParams;  // height fraction, side, low detail, 0
  varying vec3 vGrassNormal2;
  ${quickGrass}
  ${meadowNoise}

  // Rebuild getTerrainMeshHeight: vertex heights with PlaneGeometry's split.
  float grassTerrain(vec2 xz, out vec3 terrainNormal) {
    float spacing = grassHeightInfo.y;
    float segments = grassHeightInfo.z;
    vec2 g = clamp((xz + grassHeightInfo.x * 0.5) / spacing, vec2(0.0), vec2(segments - 0.001));
    ivec2 i = ivec2(floor(g));
    vec2 f = g - vec2(i);
    float h00 = texelFetch(grassHeight, i, 0).r;
    float h10 = texelFetch(grassHeight, i + ivec2(1, 0), 0).r;
    float h01 = texelFetch(grassHeight, i + ivec2(0, 1), 0).r;
    float h11 = texelFetch(grassHeight, i + ivec2(1, 1), 0).r;
    if (f.x + f.y <= 1.0) {
      terrainNormal = normalize(vec3(-(h10 - h00) / spacing, 1.0, -(h01 - h00) / spacing));
      return h00 + (h10 - h00) * f.x + (h01 - h00) * f.y;
    }
    terrainNormal = normalize(vec3(-(h11 - h01) / spacing, 1.0, -(h11 - h10) / spacing));
    return h11 + (h01 - h11) * (1.0 - f.x) + (h10 - h11) * (1.0 - f.y);
  }
`;

const vertexBlade = /* glsl */ `
  // --- Placement ---
  vec2 grassRoot = patchOrigin + position.xz;
  vec4 bladeHash = hash42(grassRoot);
  // Jitter the patch grid per patch, so the layout never visibly repeats.
  grassRoot += (hash22(grassRoot + 17.31) - 0.5) * grassBlade.z * 1.6;
  vec3 terrainNormal;
  float groundY = grassTerrain(grassRoot, terrainNormal);
  float heightPercent = position.y;
  float xSide = aSide;
  float lowDetail = 1.0 - grassBlade.w;

  // Clumps (Voronoi cells about 0.9 m across) share a lean, a height and a tint.
  const float CLUMP = 0.9;
  vec2 clumpCell = floor(grassRoot / CLUMP);
  float clumpDistance = 1e9;
  vec2 clumpCentre = grassRoot, clumpId = clumpCell;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 cell = clumpCell + vec2(i, j);
      vec2 centre = (cell + hash22(cell)) * CLUMP;
      float d = distance(centre, grassRoot);
      if (d < clumpDistance) { clumpDistance = d; clumpCentre = centre; clumpId = cell; }
    }
  }
  vec4 clumpHash = hash42(clumpId + 91.7);

  // --- Where grass grows: the ground shader's masks ---
  vec2 splatUv = grassRoot / groundSize + 0.5;
  vec2 field = textureLod(groundSplat, splatUv, 0.0).rg;
  float roadDistance = (field.r - 0.5) * ${(ROAD_DISTANCE_RANGE * 2).toFixed(1)};
  float edgeNoise = textureLod(soilAlbedo, grassRoot * 0.7, 0.0).r - 0.15;
  vec3 crop = smoothstep(0.3, 0.7, textureLod(cropSplat, splatUv, 0.0).rgb + edgeNoise * 0.35);
  float wood = smoothstep(0.1, 0.6, textureLod(woodSplat, splatUv, 0.0).r + edgeNoise * 0.25);
  float yard = clamp(field.g - max(crop.r, max(crop.g, crop.b)), 0.0, 1.0);
  float bare = smoothstep(0.8, 0.94, meadowValue(grassRoot / 11.0 + 31.0) + edgeNoise * 0.45);
  float verge = smoothstep(0.3, 1.2, roadDistance) * (1.0 - smoothstep(2.2, 3.8, roadDistance + edgeNoise * 1.5));
  vec2 onMap = step(abs(grassRoot), vec2(groundSize * 0.5));
  float density = smoothstep(0.2, 1.4, roadDistance + edgeNoise * 1.8) * onMap.x * onMap.y;
  // Farm courts, gardens and building pads are beaten earth, dug beds and paths.
  density *= (1.0 - crop.r * 0.94) * (1.0 - wood * 0.8) * (1.0 - smoothstep(0.35, 0.6, yard)) * (1.0 - bare * 0.7);

  // Level of detail: near blades leave and far blades arrive over a random band.
  float cameraDistance = distance(cameraPosition.xz, grassRoot);
  float inRange = step(mix(grassFade.x, grassFade.y, bladeHash.w), cameraDistance)
    * step(cameraDistance, mix(grassFade.z, grassFade.w, bladeHash.w));
  float keep = step(bladeHash.z, density) * inRange;

  // --- Size ---
  float dryness = meadowDryness(grassRoot);
  float bladeHeight = grassBlade.y * mix(0.7, 1.25, bladeHash.x) * mix(0.65, 1.35, clumpHash.x);
  bladeHeight *= mix(1.1, 0.72, dryness) * (1.0 + verge * 0.5);
  bladeHeight = mix(bladeHeight, 0.1 + 0.06 * bladeHash.x, crop.g);      // stubble
  bladeHeight = mix(bladeHeight, 0.55 + 0.3 * bladeHash.x, crop.b);      // standing hay
  bladeHeight *= (1.0 - wood * 0.5) * (1.0 - yard * 0.5);
  bladeHeight *= keep * (1.0 - smoothstep(grassShrink.x, grassShrink.y, cameraDistance));
  float bladeWidth = grassBlade.x * mix(0.75, 1.25, bladeHash.y) * mix(1.0, 0.6, crop.g) * keep;

  // --- Colour: the ground's pasture grading, dark at the root, light at the tip ---
  vec3 scan = textureLod(grassAlbedo, grassRoot * 1.64, 5.0).rgb;
  vec3 macroColor = textureLod(macroAlbedo, grassRoot * 0.008, 0.0).rgb;
  float macroNoise = clamp(dot(macroColor, vec3(0.333)) * 4.0, 0.0, 1.0);
  scan = mix(scan, scan * (0.55 + macroColor * 2.5), 0.65);
  float scanLuma = dot(scan, vec3(0.2126, 0.7152, 0.0722));
  vec3 bladeColour = mix(pastureTone(scan, dryness), pastureTone(scan, 0.0) * 0.82, verge * 0.7);
  bladeColour = mix(bladeColour, vec3(scanLuma) * vec3(1.72, 1.42, 0.74), crop.g);
  bladeColour = mix(bladeColour, mix(vec3(scanLuma), scan, 0.8) * vec3(1.19, 1.08, 0.69), crop.b);
  bladeColour *= mix(0.78, 1.02, macroNoise) * mix(0.86, 1.1, clumpHash.y) * mix(0.9, 1.08, bladeHash.y);
  // A few dead blades in every patch of pasture.
  bladeColour = mix(bladeColour, vec3(scanLuma) * vec3(1.45, 1.22, 0.74), step(0.94, bladeHash.x) * 0.6);
  // Averaged over a blade this comes out a little brighter than the bare ground
  // colour, as a sward catches more light than the soil between its blades.
  // Blades carry a little more chroma than the averaged scan, which reads grey
  // once it is spread over thin blades; tips catch the light yellow-green.
  bladeColour = max(mix(vec3(dot(bladeColour, vec3(0.2126, 0.7152, 0.0722))), bladeColour, 1.25), 0.0);
  vec3 rootColour = bladeColour * 0.62;
  vec3 tipColour = bladeColour * vec3(1.34, 1.42, 0.98);
  vGrassColour = mix(rootColour, tipColour, mix(easeIn(heightPercent, 1.6), heightPercent, lowDetail));
  vGrassParams = vec4(heightPercent, xSide, lowDetail, 0.0);

  // --- Shape (after Quick_Grass) ---
  vec2 fromClump = grassRoot - clumpCentre;
  float randomAngle = atan(fromClump.y, fromClump.x + 1e-4) + (bladeHash.y - 0.5) * 2.2;
  float randomLean = mix(0.1, 0.45, bladeHash.w) + clumpHash.z * 0.2
    + noise12(vec2(grassTime * 0.35) + grassRoot * 137.423) * 0.1;
  randomLean = mix(randomLean, 0.05, crop.g);                        // stubble stands stiff

  // Gusts sweep across the field; the prevailing wind matches the smoke drift.
  float windAngle = 0.37 + noise12(grassRoot * 0.05 + 0.05 * grassTime) * 0.6;
  float windLean = easeIn(remap(noise12(grassRoot * 0.25 + grassTime * 1.0), -1.0, 1.0, 0.25, 1.0), 2.0)
    * mix(0.55, 0.85, crop.b) * mix(1.0, 0.2, crop.g) * heightPercent;
  vec3 windAxis = vec3(cos(windAngle), 0.0, sin(windAngle));

  // Tanks flatten the grass under and around their hulls.
  float trampleLean = 0.0;
  vec3 trampleAxis = vec3(1.0, 0.0, 0.0);
  for (int t = 0; t < ${TRAMPLERS}; t++) {
    vec4 tank = grassTramplers[t];
    if (tank.z <= 0.0) continue;
    vec2 away = grassRoot - tank.xy;
    float falloff = smoothstep(tank.z, tank.z * 0.55, length(away));
    if (falloff * 1.35 > trampleLean) {
      trampleLean = falloff * 1.35;
      vec2 dir = normalize(away + 1e-4);
      trampleAxis = vec3(dir.y, 0.0, -dir.x);
    }
  }
  trampleLean *= heightPercent * 1.4;

  float easedHeight = mix(easeIn(heightPercent, 2.0), 1.0, lowDetail);
  float curveAmount = -randomLean * easedHeight;
  vec3 n1 = rotateX(-randomLean * easedHeight) * vec3(0.0, heightPercent + 0.01, 0.0);
  vec3 n2 = rotateX(-randomLean * easedHeight * 0.9) * vec3(0.0, (heightPercent + 0.01) * 0.9, 0.0);
  vec3 ncurve = normalize(n1 - n2);
  mat3 grassMat = rotateAxis(trampleAxis, -trampleLean) * rotateAxis(windAxis, windLean) * rotateY(randomAngle);

  float widthProfile = mix(easeOut(1.0 - heightPercent, 2.0), 1.0 - heightPercent, lowDetail);
  vec3 bladePoint = vec3((xSide - 0.5) * bladeWidth * widthProfile, heightPercent * bladeHeight, 0.0);
  bladePoint = grassMat * (rotateX(curveAmount) * bladePoint);
  vec3 grassPosition = vec3(grassRoot.x, groundY, grassRoot.y) + bladePoint;

  // Rounded blade normals, mostly the terrain's: grass shades like its ground.
  vec3 bladeNormal = vec3(0.0, -ncurve.z, ncurve.y);
  vec3 bladeNormal1 = grassMat * (rotateY(PI * 0.3) * bladeNormal);
  vec3 bladeNormal2 = grassMat * (rotateY(-PI * 0.3) * bladeNormal);
  float bladeShare = 0.25 * (1.0 - lowDetail);
  vec3 objectNormal = normalize(mix(terrainNormal, bladeNormal1, bladeShare));
  vGrassNormal2 = normalize(normalMatrix * normalize(mix(terrainNormal, bladeNormal2, bladeShare)));

  // View-space thickening: widen blades seen nearly edge-on.
  vec3 faceNormal = grassMat * vec3(0.0, 0.0, 1.0);
  vec3 toCamera = cameraPosition - vec3(grassRoot.x, groundY, grassRoot.y);
  vec3 toCameraXZ = normalize(vec3(toCamera.x, 0.0, toCamera.z) + 1e-4);
  float facing = dot(faceNormal, toCameraXZ);
  float viewDotNormal = clamp(abs(facing), 0.0, 1.0);
  float thicken = easeOut(1.0 - viewDotNormal, 4.0) * smoothstep(0.0, 0.2, viewDotNormal);
  float grassThicken = thicken * (xSide - 0.5) * bladeWidth * widthProfile * 0.5 * sign(facing);
`;

function grassMaterial(layer: GrassLayer, spacing: number, heightInfo: { texture: THREE.Texture; info: THREE.Vector4 }) {
  const material = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  const highDetail = layer.segments > 1 ? 1 : 0;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      grassHeight: { value: heightInfo.texture },
      grassHeightInfo: { value: heightInfo.info },
      groundSplat: groundShaderInputs.groundSplat,
      cropSplat: groundShaderInputs.cropSplat,
      woodSplat: groundShaderInputs.woodSplat,
      grassAlbedo: groundShaderInputs.grassAlbedo,
      soilAlbedo: groundShaderInputs.soilAlbedo,
      macroAlbedo: groundShaderInputs.macroAlbedo,
      groundSize: groundShaderInputs.groundSize,
      meadowNoiseMap: getMeadowNoiseUniform(),
      grassTime,
      grassTramplers: tramplers,
      grassSunDirection: sunDirection,
      grassFade: { value: new THREE.Vector4(layer.fadeIn[0], layer.fadeIn[1], layer.fadeOut[0], layer.fadeOut[1]) },
      grassShrink: { value: new THREE.Vector2(layer.shrink[0], layer.shrink[1]) },
      grassBlade: { value: new THREE.Vector4(layer.width, GRASS_HEIGHT, spacing, highDetail) },
    });
    shader.vertexShader = vertexHead + shader.vertexShader
      .replace('#include <beginnormal_vertex>', vertexBlade)
      .replace('#include <begin_vertex>', 'vec3 transformed = grassPosition;')
      .replace('#include <project_vertex>', `
        vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
        mvPosition.x += grassThicken;
        gl_Position = projectionMatrix * mvPosition;
      `);
    shader.fragmentShader = `
      uniform vec3 grassSunDirection;
      varying vec3 vGrassColour;
      varying vec4 vGrassParams;
      varying vec3 vGrassNormal2;
    ` + shader.fragmentShader
      .replace('#include <color_fragment>', `
        diffuseColor.rgb *= vGrassColour;
        // A faint midrib down the centre of each near blade.
        diffuseColor.rgb *= mix(mix(0.85, 1.0, smoothstep(0.0, 0.1, abs(vGrassParams.y - 0.5))), 1.0, vGrassParams.z);
      `)
      .replace('#include <normal_fragment_begin>', `
        #include <normal_fragment_begin>
        // Blend the two rounded normals across the blade; never flip on back faces.
        normal = normalize(mix(normalize(vNormal), normalize(vGrassNormal2), vGrassParams.y));
        nonPerturbedNormal = normal;
      `)
      .replace('#include <lights_fragment_end>', `
        #include <lights_fragment_end>
        // Sunlight scattering through blades seen against the sun (Quick_Grass).
        vec3 sunView = normalize((viewMatrix * vec4(grassSunDirection, 0.0)).xyz);
        float backLight = clamp((dot(geometryViewDir, -sunView) + 0.5) / 1.5, 0.0, 1.0);
        // Restrained, so a field seen against the sun glows at its tips instead of turning white.
        reflectedLight.indirectDiffuse += vec3(1.0, 0.9, 0.75) * backLight * backLight * backLight * 0.4
          * BRDF_Lambert(diffuseColor.rgb) * vGrassParams.x * (1.0 - vGrassParams.z);
      `);
  };
  material.customProgramCacheKey = () => `grass-blades-v1-${layer.segments}`;
  return material;
}

const _frustum = new THREE.Frustum();
const _matrix = new THREE.Matrix4();
const _box = new THREE.Box3();

export function GrassField({ visible = true }: { visible?: boolean }) {
  const { camera } = useThree();
  const roadNetwork = useGameStore((s) => s.roadNetwork);
  const buildings = useGameStore((s) => s.buildings);
  const reducedMotion = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)'), []);

  const layers = useMemo(() => {
    const heightInfo = getTerrainHeightTexture();
    return [NEAR, FAR].map((layer) => {
      const reach = Math.max(layer.fadeOut[1] < 1e4 ? layer.fadeOut[1] : layer.shrink[1], 1);
      const perSide = 2 * Math.ceil(reach / layer.patch) + 2;
      const { geometry, origins, spacing } = createPatchGeometry(layer, perSide * perSide);
      const mesh = new THREE.Mesh(geometry, grassMaterial(layer, spacing, heightInfo));
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      return { layer, mesh, origins, reach, perSide, heightInfo };
    });
  }, [roadNetwork, buildings]);

  useEffect(() => () => layers.forEach(({ mesh }) => {
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  }), [layers]);

  useFrame(({ clock }) => {
    grassTime.value = reducedMotion.matches ? 0 : clock.elapsedTime;
    const ready = groundShaderInputs.groundSplat.value !== null;

    // Tanks near the camera flatten the grass around them.
    const state = useGameStore.getState();
    const tanks = [state.playerTank, ...state.allies, ...state.enemies]
      .map((tank) => ({ x: tank.position.x, z: tank.position.z, d: Math.hypot(tank.position.x - camera.position.x, tank.position.z - camera.position.z) }))
      .filter((tank) => tank.d < 90)
      .sort((a, b) => a.d - b.d);
    tramplers.value.forEach((slot, i) => {
      const tank = tanks[i];
      if (tank) slot.set(tank.x, tank.z, 3.2, 0); else slot.set(0, 0, 0, 0);
    });

    if (!visible) {
      for (const { mesh } of layers) mesh.visible = false;
      return;
    }
    _frustum.setFromProjectionMatrix(_matrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    for (const { layer, mesh, origins, reach, perSide, heightInfo } of layers) {
      mesh.visible = ready;
      if (!ready) continue;
      const originX = Math.floor(camera.position.x / layer.patch) * layer.patch;
      const originZ = Math.floor(camera.position.z / layer.patch) * layer.patch;
      const half = perSide / 2;
      let count = 0;
      for (let j = -half; j < half; j++) {
        for (let i = -half; i < half; i++) {
          const x = originX + i * layer.patch, z = originZ + j * layer.patch;
          // Nearest point of the patch to the camera, in plan.
          const nx = Math.max(x, Math.min(camera.position.x, x + layer.patch)) - camera.position.x;
          const nz = Math.max(z, Math.min(camera.position.z, z + layer.patch)) - camera.position.z;
          if (Math.hypot(nx, nz) > reach) continue;
          // Far patches whose farthest corner is inside the near layer hold no blades.
          const fx = Math.max(Math.abs(x - camera.position.x), Math.abs(x + layer.patch - camera.position.x));
          const fz = Math.max(Math.abs(z - camera.position.z), Math.abs(z + layer.patch - camera.position.z));
          if (Math.hypot(fx, fz) < layer.fadeIn[0]) continue;
          _box.min.set(x - 1, heightInfo.minHeight - 1, z - 1);
          _box.max.set(x + layer.patch + 1, heightInfo.maxHeight + 1.5, z + layer.patch + 1);
          if (!_frustum.intersectsBox(_box)) continue;
          origins.setXY(count++, x, z);
        }
      }
      (mesh.geometry as THREE.InstancedBufferGeometry).instanceCount = count;
      origins.needsUpdate = true;
    }
  });

  return <>{layers.map(({ mesh }) => <primitive key={mesh.uuid} object={mesh} />)}</>;
}
