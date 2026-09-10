import type { MeshStandardMaterial } from 'three';

const noise = `
  varying vec3 vSurfacePosition;
  float surfaceHash(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }
  float surfaceNoise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(surfaceHash(i), surfaceHash(i + vec3(1,0,0)), f.x),
      mix(surfaceHash(i + vec3(0,1,0)), surfaceHash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(surfaceHash(i + vec3(0,0,1)), surfaceHash(i + vec3(1,0,1)), f.x),
      mix(surfaceHash(i + vec3(0,1,1)), surfaceHash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
`;

/** Object-space detail also works on armor polyhedra and roofs without UVs. */
export const armorWeathering: MeshStandardMaterial['onBeforeCompile'] = (shader) => {
  shader.vertexShader = 'varying vec3 vSurfacePosition;\n' + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
    '#include <begin_vertex>\nvSurfacePosition = position;');
  shader.fragmentShader = noise + shader.fragmentShader;
  shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
    #include <color_fragment>
    float mottling = surfaceNoise(vSurfacePosition * 7.0);
    float grit = surfaceNoise(vSurfacePosition * 155.0);
    float wear = smoothstep(0.69, 0.88, surfaceNoise(vSurfacePosition * 42.0));
    diffuseColor.rgb *= 0.82 + mottling * 0.32;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.105, 0.084, 0.055), wear * 0.5);
    diffuseColor.rgb += (grit - 0.5) * 0.018;
  `);
  shader.fragmentShader = shader.fragmentShader.replace('#include <roughnessmap_fragment>', `
    #include <roughnessmap_fragment>
    roughnessFactor = clamp(roughnessFactor + (mottling - 0.5) * 0.18 - wear * 0.18, 0.4, 1.0);
  `);
  shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_maps>', `
    #include <normal_fragment_maps>
    // Fine cast-steel relief in view space, with derivative filtering at distance.
    vec3 surfDx = dFdx(vViewPosition), surfDy = dFdy(vViewPosition);
    vec3 tangentX = cross(surfDy, normal), tangentY = cross(normal, surfDx);
    float determinant = dot(surfDx, tangentX);
    vec3 gradient = sign(determinant) * (dFdx(grit) * tangentX + dFdy(grit) * tangentY);
    normal = normalize(abs(determinant) * normal - 0.0009 * gradient);
  `);
};

export const masonryWeathering: MeshStandardMaterial['onBeforeCompile'] = (shader) => {
  shader.vertexShader = 'varying vec3 vSurfacePosition;\n' + shader.vertexShader;
  shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
    '#include <begin_vertex>\nvSurfacePosition = (modelMatrix * vec4(position, 1.0)).xyz;');
  shader.fragmentShader = noise + shader.fragmentShader;
  shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
    #include <color_fragment>
    float weather = surfaceNoise(vSurfacePosition * vec3(1.8, 0.35, 1.8));
    float aggregate = surfaceNoise(vSurfacePosition * 35.0);
    diffuseColor.rgb *= 0.72 + weather * 0.36 + aggregate * 0.15;
  `);
};
