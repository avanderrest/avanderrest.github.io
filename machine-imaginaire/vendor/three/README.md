# three.js, vendored

three.js **r186** (npm `three@0.186.1`), MIT — see `LICENSE`. Copied in so the site keeps
no build step and no runtime dependency: the page loads these files as they are.

- `three.module.min.js` — `build/three.module.js` and the `three.core.js` it imports,
  bundled into one ES module and minified. r186 no longer ships a minified build.
- `addons/` — unmodified copies from `examples/jsm/`: `OrbitControls`, `STLExporter`,
  `OBJExporter`, `MarchingCubes` (gyroids and other implicit surfaces) and
  `ParametricGeometry`. They `import ... from 'three'`, which the import map in
  `../../index.html` points at `three.module.min.js`.

Nothing here is loaded until a 3D style asks for it, with `import('three')`.

To update, outside the repo (npm is only a way to fetch the files, never a dependency
of the site):

```sh
npm install three esbuild
npx esbuild node_modules/three/build/three.module.js --bundle --minify --format=esm \
  --legal-comments=inline --outfile=three.module.min.js
cp node_modules/three/examples/jsm/{controls/OrbitControls,exporters/STLExporter,exporters/OBJExporter,objects/MarchingCubes,geometries/ParametricGeometry}.js addons/
```
