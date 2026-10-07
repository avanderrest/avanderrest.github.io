/* The vendored three.js loads through the page's import map, its addons resolve
   `three` through it too, WebGL renders, and a mesh exports to STL — everything the
   3D styles will lean on, checked before any of them exists. */
return (async () => {
  const problems = [];
  // a script run over the debugger has no module base, so name the files in full; the
  // addons' own `from 'three'` still has to go through the page's import map
  const at = (f) => new URL('vendor/three/' + f, location.href).href;
  let THREE, STLExporter, MarchingCubes;
  try {
    THREE = await import(at('three.module.min.js'));
    ({ STLExporter } = await import(at('addons/STLExporter.js')));
    ({ MarchingCubes } = await import(at('addons/MarchingCubes.js')));
  } catch (e) { return JSON.stringify({ pass: false, detail: 'import failed: ' + e.message }); }
  const mesh = new THREE.Mesh(new THREE.TorusKnotGeometry(1, 0.3, 64, 12), new THREE.MeshStandardMaterial());
  const stl = new STLExporter().parse(mesh);
  const facets = (stl.match(/facet normal/g) || []).length;
  if (facets !== 64 * 12 * 2) problems.push('STL has ' + facets + ' facets');
  const mc = new MarchingCubes(24, new THREE.MeshNormalMaterial());
  if (!mc.isMesh) problems.push('MarchingCubes is not a mesh');

  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  let px = null;
  try {
    const r = new THREE.WebGLRenderer({ canvas: c, preserveDrawingBuffer: true });
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#ff0000');
    r.render(scene, new THREE.PerspectiveCamera());
    const g = r.getContext(), out = new Uint8Array(4);
    g.readPixels(32, 32, 1, 1, g.RGBA, g.UNSIGNED_BYTE, out);
    px = Array.from(out);
    r.dispose();
  } catch (e) { problems.push('WebGL: ' + e.message); }
  if (px && !(px[0] > 200 && px[1] < 40)) problems.push('rendered ' + px);
  return JSON.stringify({ pass: !problems.length, detail: (problems.join('; ') || 'ok') + ' — three r' + THREE.REVISION + ', ' + facets + ' STL facets, WebGL pixel ' + px });
})();
