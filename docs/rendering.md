# Battlefield rendering

The battlefield retains the existing WebGL / React Three Fiber renderer and game
geometry. This is a lighting and material upgrade, not a claim of AAA asset quality.

## Pipeline

- `src/rendering/BattlefieldLighting.tsx`: one sun direction for sky, direct light
  and a PMREM environment baked once per mount. The 200m-wide, 4096px shadow region
  follows the camera, snapped in light space. Outside this region, direct shadows
  are unavailable; atmospheric fog supplies distant depth cues.
- `BattlefieldPostProcessing.tsx`: N8AO Medium at half resolution, high-threshold
  bloom, OutputPass (ACES and sRGB exactly once), the colour grade, then SMAA. The
  HTML HUD stays sharp.
- `colorGrade.ts`: display-referred grade after OutputPass: saturation 0.74, mild
  contrast, olive-tinted lift, warm gain and a light vignette. Values live in
  `BATTLEFIELD_GRADE`. Map mode bypasses it with the rest of the pipeline.
- Look: sun about 35 degrees up, hazy Preetham sky (turbidity 10, Rayleigh 2.2), a
  weak neutral hemisphere fill so grey armour does not turn blue, warm haze fog from
  120 to 1400 m and exposure 1.15. The ground shader desaturates grass toward straw
  and olive and takes the red out of gravel roads. `cloudCoverage` above about 0.55
  turns the whole sky into one flat cloud deck.
  Map mode uses direct rendering and releases the post-processing resources.
- `GroundMaterial.tsx`: separate grass, dry soil and gravel albedo/normal layers,
  world-space stochastic hex tiling and aerial vegetation macro modulation.
  `terrainSplat.ts` rasterizes signed road-edge distance into a 2048 RG texture;
  bilinear distance filtering avoids diagonal boundaries tied to the 5m terrain mesh.
  Soil coverage follows rotated farmland and building yards. Ground and grass use
  roughness 1 and zero specular intensity. Normal detail fades from 45 to 180m.
  Explicit texture gradients are calculated before divergent material branches.
  A half-resolution RGBA crop map carries ploughed, stubble and hay weights and the
  row angle / pi; the angle reaches past each plot's weight falloff, so filtering
  never blends a direction into visible rows. Periodic patterns (furrows, stubble
  rows, animal tracks) fade out through `patternFade` before they alias.
- `meadowNoise.ts`: pasture noise baked into a 256 px half-float RG texture (two
  smooth value-noise channels, 32 features across) shared by the ground and grass
  shaders. Hashing the same noise per pixel cost 6-12 FPS while driving on a
  GTX 1050 Ti; the texture version benchmarks the same as the shader before it.
- `surfaceWeathering.ts`: UV-independent color, roughness and fine cast-metal
  relief on armor; vertically stretched weathering on building surfaces.
- Ground cover: 12321 instanced nine-blade tufts in a camera-centred grid; tapered
  geometry, per-instance variation, road/building exclusion, 32-43m distance fade.
  The material is double-sided, so the grass shader restores the unflipped upward
  normal on back faces; the default flip had rendered half the blades black.
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
performance guarantee is made. Production builds retain a large-chunk warning.
The remaining asset-quality work is authored high-detail vehicles/buildings,
denser world dressing and distant shadows.

## Draw-call budget

- `src/tanks/core/MergedSlot.tsx`: in the battlefield (`merged` prop from
  `Tank.tsx`), each tank slot renders its authored part tree into a detached
  group, then draws one mesh per material class. Paint variation moves into
  vertex colours; classes share one material across all tanks. Textured track
  materials stay per tank so their scroll animation keeps working. Rebuilds
  happen only when colour, destroyed or track-damage state changes.
- Far LOD: parts with a bounding radius under 0.12 m are dropped beyond 160 m
  (140 m to return), measured after normalising by the camera FOV so a zoomed
  gunner sight keeps full detail. The far LOD casts no shadow.
- Camouflage: paint roles (the materials using `armorWeathering`) on a tank with a
  patterned scheme get a material class per scheme built by
  `createCamouflageWeathering`. The pattern (blotches, bands, ambush dots or worn
  whitewash) is value-noise fbm in slot space, applied before weathering so wear
  sits on the paint. A `camoSeed` vertex attribute offsets it per vehicle without
  splitting materials. Only merged rendering draws camouflage; the select screen and
  order-of-battle previews use the merged path for that reason.
- World dressing: hedges are lofted arches along planned field edges, built as one
  vertex-coloured mesh with world-space leaf mottling (`foliageWeathering`); poles
  are instanced and all wires are one `LineSegments`. The horizon skirt is four
  strips whose inner row samples `getTerrainMeshHeight` at the map edge, so it
  meets the rendered terrain without a seam; north and south strips cover the
  corners and share seam vertices with the east and west strips. `Color.setHSL`
  works in the linear working space by default: pass `SRGBColorSpace` when the
  values are meant as sRGB albedo, or dark greens come out pale.
- Foliage (`foliageCards.ts`): every leaf card stores its centre as `position` and
  its corner as `cardOffset`; the vertex shader expands it facing the camera
  (spherical for broadleaf and scrub, about the vertical for spruce). Normals and
  vertex-colour occlusion come from the enclosing crown shape, and the fragment
  shader keeps them unflipped on back faces. The default shadow depth material
  would see degenerate quads, so every foliage mesh sets a `customDepthMaterial`
  with the same billboard; the shadow pass still copies `map` and `alphaTest` in.
  Bounding spheres are padded by the largest card, because positions are centres.
- `woodland.ts` rasterises a 1024 px woodland-floor mask from tree habitats, then
  box-blurs it twice so wood edges curve instead of scalloping; the ground shader
  and the grass grid both read it, keyed on the tree layout so knockdowns do not
  rebuild it.
- `TreeRenderer` uploads instance matrices only when the store's tree array
  changes (a knockdown), then refreshes the instance bounding spheres used for
  frustum culling.
- Effects (`Particles.tsx`): smoke, dirt and wreck plumes share one alpha-blended
  pool sorted back to front each frame; the fire pool draws after it
  (`renderOrder` 6) so flames stay visible inside their own smoke. Sprites read the
  sun direction and scene fog through shared uniforms. `BurningWrecks.tsx` emits
  `burning_smoke` (plume density) and `wreck_fire` (flames) on the schedule in
  `GAME_CONFIG.particles.burning_smoke`. Sprites do not sample scene depth, so
  large puffs still clip hard where they cross the ground.
- Object-space armour weathering now samples slot space, so the mottling
  pattern differs from the unmerged editor preview while keeping the same scale.
- `BuildingRenderer.tsx` bakes every building part into world space, one batch
  per material. `src/rendering/staticMerge.ts` holds the shared merge helper,
  including winding correction for mirrored parts.
- Line of sight and ground cover read `getTerrainMeshHeight`: the cached vertex
  grid of the rendered terrain interpolated with PlaneGeometry's triangle split.
  Physics, projectiles and aiming keep the exact procedural height.

Measure with `docs/perf/bench.mjs` (see `docs/perf/README.md`). On a GTX 1050 Ti
at 1600x900 the battlefield went from about 3,200 to about 250 draw calls per
frame and from 14-31 to 60 FPS (vsync). At 1920x1080 the remaining cost is GPU
post-processing: 51-59 FPS with occasional 33 ms frames.
## 模型比例校正

戰車三視圖下載、正交疊圖、逐輪修模與碰撞面驗證，見 [戰車三視圖比例校正流程](tank-proportion-calibration.md)。
