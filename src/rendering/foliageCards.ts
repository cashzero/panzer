import * as THREE from 'three';

/**
 * Foliage built from many small camera-facing leaf cards with crown normals.
 *
 * A few large crossed planes read as flat cards with a seam down the middle,
 * and fixed cards seen edge-on break the silhouette into shards. Here every
 * card turns to face the viewer around its own centre (spherical for
 * broadleaf crowns and scrub, upright for spruce), while its normal comes from
 * one enclosing crown shape. The mass lights like one body of leaves: a sunlit
 * side, a shaded side and a darker interior.
 *
 * Each vertex stores its card centre as `position` and its corner offset in
 * metres as `cardOffset`. Materials need `patchFoliageMaterial` (colour
 * material) and a matching depth material for shadows, `foliageDepthMaterial`.
 * Geometry carries crown occlusion as vertex colour (`vertexColors: true`).
 */

export interface CrownLobe {
  center: [number, number, number];
  radii: [number, number, number];
  cards: number;
  /** Card edge length range in metres. */
  size: [number, number];
}

function seeded(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

interface Builder {
  positions: number[];
  offsets: number[];
  normals: number[];
  colors: number[];
  uvs: number[];
  indices: number[];
  maxHalfSize: number;
}

function newBuilder(): Builder {
  return { positions: [], offsets: [], normals: [], colors: [], uvs: [], indices: [], maxHalfSize: 0 };
}

type Shade = (point: THREE.Vector3) => { normal: THREE.Vector3; occlusion: number };

/**
 * One card. `tangent`/`bitangent` only spread the shading sample points across
 * the crown, so neighbouring corners pick up slightly different light.
 */
function pushCard(
  builder: Builder, center: THREE.Vector3, width: number, height: number, roll: number,
  tangent: THREE.Vector3, bitangent: THREE.Vector3, shade: Shade,
) {
  const base = builder.positions.length / 3;
  const sample = new THREE.Vector3();
  const cos = Math.cos(roll), sin = Math.sin(roll);
  for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const ox = (u - 0.5) * width, oy = (v - 0.5) * height;
    sample.copy(center).addScaledVector(tangent, ox).addScaledVector(bitangent, oy);
    const { normal, occlusion } = shade(sample);
    builder.positions.push(center.x, center.y, center.z);
    builder.offsets.push(ox * cos - oy * sin, ox * sin + oy * cos);
    builder.normals.push(normal.x, normal.y, normal.z);
    builder.colors.push(occlusion, occlusion, occlusion);
    builder.uvs.push(u, v);
  }
  builder.maxHalfSize = Math.max(builder.maxHalfSize, Math.hypot(width, height) / 2);
  builder.indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
}

function finish(builder: Builder) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(builder.positions, 3));
  geometry.setAttribute('cardOffset', new THREE.Float32BufferAttribute(builder.offsets, 2));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(builder.normals, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(builder.colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(builder.uvs, 2));
  geometry.setIndex(builder.indices);
  // Positions are card centres; the cards themselves reach further out.
  geometry.computeBoundingSphere();
  geometry.boundingSphere!.radius += builder.maxHalfSize;
  geometry.computeBoundingBox();
  geometry.boundingBox!.expandByScalar(builder.maxHalfSize);
  return geometry;
}

/**
 * Broadleaf crown: cards spread over the lobes, shaded as one ellipsoid.
 * `shape` is the enclosing ellipsoid used for normals and occlusion.
 */
export function buildCrown(lobes: CrownLobe[], shape: { center: [number, number, number]; radii: [number, number, number] }, seed: number) {
  const random = seeded(seed);
  const builder = newBuilder();
  const shapeCenter = new THREE.Vector3(...shape.center);
  const shapeRadii = new THREE.Vector3(...shape.radii);
  const local = new THREE.Vector3();
  const shade: Shade = (point) => {
    local.subVectors(point, shapeCenter).divide(shapeRadii);
    const depth = Math.min(1, local.length());
    const normal = new THREE.Vector3(local.x / shapeRadii.x, local.y / shapeRadii.y, local.z / shapeRadii.z).normalize();
    // Interior and underside leaves sit in the crown's own shade.
    const height = THREE.MathUtils.clamp(local.y * 0.5 + 0.5, 0, 1);
    return { normal, occlusion: THREE.MathUtils.lerp(0.5, 1, depth * 0.55 + height * 0.45) };
  };
  const up = new THREE.Vector3(0, 1, 0);
  const direction = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const bitangent = new THREE.Vector3();
  const center = new THREE.Vector3();
  for (const lobe of lobes) {
    for (let i = 0; i < lobe.cards; i++) {
      // Fibonacci sphere with jitter: even coverage without visible rows.
      const t = (i + 0.5) / lobe.cards;
      const polar = Math.acos(1 - 2 * t);
      const azimuth = i * 2.39996 + random() * 0.6;
      direction.set(Math.sin(polar) * Math.cos(azimuth), Math.cos(polar), Math.sin(polar) * Math.sin(azimuth));
      const reach = 0.45 + random() * 0.4;
      center.set(
        lobe.center[0] + direction.x * lobe.radii[0] * reach,
        lobe.center[1] + direction.y * lobe.radii[1] * reach,
        lobe.center[2] + direction.z * lobe.radii[2] * reach,
      );
      tangent.crossVectors(Math.abs(direction.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : up, direction).normalize();
      bitangent.crossVectors(direction, tangent).normalize();
      const size = lobe.size[0] + random() * (lobe.size[1] - lobe.size[0]);
      pushCard(builder, center, size, size, random() * Math.PI * 2, tangent, bitangent, shade);
    }
  }
  return finish(builder);
}

export interface ConiferTier {
  y: number;
  width: number;
  height: number;
  offsetX: number;
  offsetZ: number;
  phase: number;
}

/**
 * Spruce crown: each whorl is a ring of upright cards around the trunk,
 * shaded as a cone so the tree darkens toward its base and core.
 */
export function buildConiferCrown(tiers: ConiferTier[]) {
  const builder = newBuilder();
  const top = tiers[tiers.length - 1].y + tiers[tiers.length - 1].height / 2;
  const bottom = tiers[0].y - tiers[0].height / 2;
  const maxWidth = Math.max(...tiers.map((tier) => tier.width));
  const shade: Shade = (point) => {
    const radial = Math.hypot(point.x, point.z);
    const outward = radial > 1e-3 ? new THREE.Vector3(point.x / radial, 0, point.z / radial) : new THREE.Vector3();
    const normal = outward.multiplyScalar(0.85).add(new THREE.Vector3(0, 0.55, 0)).normalize();
    const height = THREE.MathUtils.clamp((point.y - bottom) / (top - bottom), 0, 1);
    const reach = THREE.MathUtils.clamp(radial / (maxWidth * 0.5), 0, 1);
    return { normal, occlusion: THREE.MathUtils.lerp(0.5, 1, height * 0.55 + reach * 0.45) };
  };
  const up = new THREE.Vector3(0, 1, 0);
  tiers.forEach((tier) => {
    // A central card carries the whorl's silhouette; side cards give it depth.
    const axis = new THREE.Vector3(tier.offsetX, tier.y, tier.offsetZ);
    pushCard(builder, axis, tier.width, tier.height, 0, new THREE.Vector3(1, 0, 0), up, shade);
    for (let k = 0; k < 4; k++) {
      const angle = tier.phase + k * (Math.PI / 2);
      const outward = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
      const center = axis.clone().addScaledVector(outward, tier.width * 0.2).add(new THREE.Vector3(0, -tier.height * 0.08, 0));
      pushCard(builder, center, tier.width * 0.62, tier.height * 0.8, (k % 2 === 0 ? 1 : -1) * 0.06,
        new THREE.Vector3(-outward.z, 0, outward.x), up, shade);
    }
  });
  return finish(builder);
}

const billboardVertex = /* glsl */ `
  vec4 cardCenter = vec4(transformed, 1.0);
  float cardScale = 1.0;
  #ifdef USE_INSTANCING
    cardCenter = instanceMatrix * cardCenter;
    cardScale = 0.5 * (length(instanceMatrix[0].xyz) + length(instanceMatrix[1].xyz));
  #endif
  vec4 worldCenter = modelMatrix * cardCenter;
  #ifdef FOLIAGE_UPRIGHT
    // Turn about the vertical only, so spruce whorls stay upright.
    vec3 toCamera = cameraPosition - worldCenter.xyz;
    vec3 cardRight = normalize(vec3(toCamera.z, 0.0, -toCamera.x) + vec3(1e-4, 0.0, 0.0));
    vec4 mvPosition = viewMatrix * vec4(worldCenter.xyz + (cardRight * cardOffset.x + vec3(0.0, cardOffset.y, 0.0)) * cardScale, 1.0);
  #else
    vec4 mvPosition = viewMatrix * worldCenter;
    mvPosition.xy += cardOffset * cardScale;
  #endif
  gl_Position = projectionMatrix * mvPosition;
`;

function injectBillboard(shader: THREE.WebGLProgramParametersWithUniforms) {
  shader.vertexShader = 'attribute vec2 cardOffset;\n' + shader.vertexShader
    .replace('#include <project_vertex>', billboardVertex);
}

/**
 * Colour pass: billboard the cards and keep the crown normal on both faces;
 * Three.js would flip it on back faces and turn half the cards black.
 */
export function patchFoliageMaterial(material: THREE.MeshStandardMaterial, upright: boolean) {
  if (upright) material.defines = { ...material.defines, FOLIAGE_UPRIGHT: '' };
  material.onBeforeCompile = (shader) => {
    injectBillboard(shader);
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', `
      #include <normal_fragment_begin>
      normal = normalize(vNormal);
      nonPerturbedNormal = normal;
    `);
  };
  material.customProgramCacheKey = () => `foliage-cards-v1-${upright ? 'upright' : 'sphere'}`;
}

/** Shadow pass for billboarded cards; the shadow map copies map and alphaTest in. */
export function foliageDepthMaterial(upright: boolean) {
  const material = new THREE.MeshDepthMaterial();
  if (upright) material.defines = { FOLIAGE_UPRIGHT: '' };
  material.onBeforeCompile = injectBillboard;
  material.customProgramCacheKey = () => `foliage-cards-depth-v1-${upright ? 'upright' : 'sphere'}`;
  return material;
}
