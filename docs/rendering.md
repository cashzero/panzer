# Battlefield rendering

The battlefield retains the existing WebGL / React Three Fiber renderer and game
geometry. This is a lighting and material upgrade, not a claim of AAA asset quality.

## Pipeline

- `src/rendering/BattlefieldLighting.tsx`: one sun direction for sky, direct light
  and a PMREM environment baked once per mount. The 200m-wide, 4096px shadow region
  follows the camera, snapped in light space. Outside this region, direct shadows
  are unavailable; atmospheric fog supplies distant depth cues.
- `BattlefieldPostProcessing.tsx`: N8AO Medium at half resolution, high-threshold
  bloom, OutputPass (ACES and sRGB exactly once), then SMAA. The HTML HUD stays sharp.
  Map mode uses direct rendering and releases the post-processing resources.
- `GroundMaterial.tsx`: separate grass, dry soil and gravel albedo/normal layers,
  world-space stochastic hex tiling and aerial vegetation macro modulation.
  `terrainSplat.ts` rasterizes signed road-edge distance into a 2048 RG texture;
  bilinear distance filtering avoids diagonal boundaries tied to the 5m terrain mesh.
  Soil coverage follows rotated farmland and building yards. Ground and grass use
  roughness 1 and zero specular intensity. Normal detail fades from 45 to 180m.
  Explicit texture gradients are calculated before divergent material branches.
- `surfaceWeathering.ts`: UV-independent color, roughness and fine cast-metal
  relief on armor; vertically stretched weathering on building surfaces.
- Ground cover: 12321 instanced nine-blade tufts in a camera-centred grid; tapered
  geometry, per-instance variation, road/building exclusion, 32-43m distance fade.
  Animation reads reduced-motion preference; it does not affect collision.

N8AO 2.0.1 inherits a no-op disposal method. The integration explicitly frees its
owned targets, textures and materials on unmount. Its version is pinned because
this cleanup depends on the installed implementation. Three.js is deduplicated by
Vite so the renderer and its addons share the same runtime.

## Sources and licenses

- N8AO 2.0.1, ISC: https://github.com/N8python/n8ao
- postprocessing 6.39.4, Zlib (N8AO peer): https://github.com/pmndrs/postprocessing
- Three.js addons, MIT: https://github.com/mrdoob/three.js
- three-hex-tiling 0.1.5, MIT: https://github.com/Ameobea/three-hex-tiling
  Shader vendored locally to avoid globally patching Three material prototypes.
  Adaptations: hardware sRGB decoding and explicit derivatives for Three r183.
- ambientCG Grass004 and Poly Haven dry mud, gravel and aerial grass, CC0.
  Asset sources, authors and redistribution notice: `public/assets/terrain/README.md`.
  Seven maps are served locally; no remote service is needed during gameplay.

## Validation and limits

Run `node --import tsx --test src/rendering/terrainSplat.test.ts`, `npm run lint` and `npm run build` (game and tank editor). In a browser, deploy
seed 19440606, inspect third-person and gunner views, switch map mode repeatedly,
resize the viewport, and check the console for shader and resource errors.

In development only, the battlefield canvas exposes `data-render-fps` and
`data-render-textures` every two seconds for local diagnostics. FPS is a short
sample from this browser and scene, not a GPU benchmark or a guaranteed frame rate.

The pipeline is capped at the existing 1.5 device pixel ratio. No cross-device
performance guarantee is made. Dense battles still have the existing per-part
vehicle draw calls and AI costs. Production builds retain a large-chunk warning.
The remaining asset-quality work is authored high-detail vehicles/buildings,
denser world dressing, mesh LOD and distant shadows.
## 模型比例校正

戰車三視圖下載、正交疊圖、逐輪修模與碰撞面驗證，見 [戰車三視圖比例校正流程](tank-proportion-calibration.md)。
