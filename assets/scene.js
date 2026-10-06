// Pinned 3D scene for the scroll journey: a Ferrari 458 (three.js example model by vicent091036, credited in the footer; licence not verified)
// whose paint is driven by one shader patch: swirled clear coat -> corrected -> film edge -> ceramic beads.
import * as THREE from 'three';
import { GLTFLoader } from './vendor/loaders/GLTFLoader.js';
import { DRACOLoader } from './vendor/loaders/DRACOLoader.js';

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ramp = (p, a, b) => clamp((p - a) / (b - a));
const ease = t => t * t * (3 - 2 * t);

export const COLORS = {
  rosso: 0xa1070b, nardo: 0x8a8d92, obsidian: 0x0b0c0f, midnight: 0x10224d, champagne: 0xb89a62
};

// camera path: one key per beat, sampled with a Catmull-Rom curve so the move never cuts
const CAM = [
  [-3.3, 1.0, -5.0], [8.2, 1.15, -.5], [3.0, .75, -4.0], [-2.6, 2.1, -3.4],
  [-3.4, .7, 2.6], [4.8, .6, -2.9], [-5.2, 1.5, -5.0], [-1.6, 2.3, -10.2]
];
const TGT = [
  [0, .5, 0], [0, .6, 0], [0, .55, -.5], [0, .5, -1.1],
  [0, .55, .4], [.2, .42, -1.1], [0, .55, 0], [0, .6, 0]
];

const PATCH_UNIFORMS = () => ({
  uScreen: { value: -1 }, uRes: { value: new THREE.Vector2(1, 1) }, uEdge: { value: 1 }, uWipe: { value: -9 }, uFilm: { value: -9 }, uCoat: { value: -9 }, uBead: { value: .7 },
  uCarInv: { value: new THREE.Matrix4() }, uCarW: { value: new THREE.Matrix3() }, uTime: { value: 0 }
});

function patchPaint(mat, U) {
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCP;\nuniform mat4 uCarInv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCP = (uCarInv * modelMatrix * vec4(transformed, 1.)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vCP;
uniform float uScreen, uEdge, uWipe, uFilm, uCoat, uBead, uTime;
uniform vec2 uRes;
uniform mat3 uCarW;
vec3 h33(vec3 p){ p = fract(p*vec3(.1031,.1030,.0973)); p += dot(p, p.yxz + 33.33); return fract((p.xxy + p.yxx)*p.zyx); }
float swirlAt(vec3 q, float sc, float ph){
  vec3 S = q*sc + ph, id = floor(S), h = h33(id);
  vec3 c = id + .3 + h*.4;
  float r = length(S - c);
  float ring = abs(fract(r*22. + h.z*7.) - .5);
  float aaF = 1. - smoothstep(.25, .7, length(fwidth(q*sc))*22.);
  return smoothstep(.07, .0, ring)*smoothstep(.62, .25, r)*step(.3, h.y)*aaF;
}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  float beadMask = 0.; vec3 beadView = vec3(0.);
  float coatZone = 1. - smoothstep(uCoat - .1, uCoat + .1, vCP.z);
  if (uBead > .001 && coatZone > .01) {
    vec3 wN = transpose(uCarW) * inverseTransformDirection(nonPerturbedNormal, viewMatrix);
    float bestD = 1.; vec3 bestN = wN;
    for (int k = 0; k < 2; k++) {
      float cs = k == 0 ? .085 : .14;
      vec3 P = vCP/cs + float(k)*3.7, ip = floor(P), hh = h33(ip + float(k)*11.);
      if (hh.x > uBead) continue;
      vec3 c = ip + .3 + h33(ip + 5.3)*.4;
      float rad = (.14 + .11*hh.y);
      vec3 rel = P - c;
      float d3 = length(rel)/rad;
      if (d3 < bestD) {
        vec3 l = rel - wN*dot(rel, wN);
        float dd = min(length(l)/rad, .999);
        bestD = d3;
        bestN = normalize(wN*sqrt(1. - dd*dd) + (l/rad)*1.15);
        beadMask = 1.;
      }
    }
    beadMask *= coatZone * (uScreen >= 0. ? smoothstep(uScreen - .002, uScreen + .002, gl_FragCoord.x/uRes.x) : 1.);
    beadView = normalize(mat3(viewMatrix) * (uCarW * bestN));
    normal = normalize(mix(normal, beadView, beadMask));
  }`)
      .replace('#include <clearcoat_normal_fragment_maps>', `#include <clearcoat_normal_fragment_maps>
  clearcoatNormal = normalize(mix(clearcoatNormal, normal, beadMask));`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  float cleanK = uScreen >= 0. ? smoothstep(uScreen - .002, uScreen + .002, gl_FragCoord.x/uRes.x) : 1. - smoothstep(uWipe - .12, uWipe + .12, vCP.z);
  float live = step(-2.7, uWipe)*step(uWipe, 2.7);
  float eW = exp(-pow((vCP.z - uWipe)/.03, 2.))*live;
  float eF = exp(-pow((vCP.z - uFilm)/.03, 2.))*step(-2.7, uFilm)*step(uFilm, 0.)*uEdge;
  totalEmissiveRadiance += vec3(.9, .92, .96)*.02*(1. - cleanK);
  totalEmissiveRadiance += vec3(1., .95, .85)*eW*2.2 + vec3(1., .42, .1)*eF*2.6;`)
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
  {
    float dirt = 1. - cleanK;
    float sw = max(swirlAt(vCP, 7., 0.), swirlAt(vCP, 7., .5));
    sw = max(sw, swirlAt(vCP, 13., 1.7)*.8);
    material.clearcoatRoughness = clamp(mix(material.clearcoatRoughness, .09 + sw*.32, dirt), .02, 1.);
    material.roughness = clamp(material.roughness + dirt*.14, .04, 1.);
    material.diffuseColor = mix(material.diffuseColor, vec3(dot(material.diffuseColor, vec3(.33)))*.85 + .02, dirt*.35);
    float film = 1. - smoothstep(uFilm - .1, uFilm + .1, vCP.z);
    material.clearcoatRoughness = mix(material.clearcoatRoughness, .015, film*cleanK);
    material.clearcoat = mix(material.clearcoat, 1., film);
    material.roughness = mix(material.roughness, .24, film*cleanK);
    material.clearcoatRoughness = mix(material.clearcoatRoughness, .0, beadMask);
  }`);
  };
  mat.customProgramCacheKey = () => 'lq-paint';
}

function studioEnv(renderer) {
  const s = new THREE.Scene();
  s.add(new THREE.Mesh(new THREE.BoxGeometry(40, 18, 40), new THREE.MeshBasicMaterial({ color: 0x050607, side: THREE.BackSide })));
  const box = (w, h, x, y, z, k, rx = 0, ry = 0) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, .97, .92).multiplyScalar(k*.7), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.rotation.set(rx, ry, 0); s.add(m);
  };
  // honeycomb-ish strips overhead, big softboxes at the sides, a rim light behind
  for (let i = -2; i <= 2; i++) box(.7, 24, i*3.2, 8.5, 0, 9, Math.PI/2);
  box(14, 5, -14, 4, -2, 6, 0, Math.PI/2);
  box(14, 5, 14, 4, 2, 6, 0, -Math.PI/2);
  box(18, 1.2, 0, 1.2, 15, 7, 0, Math.PI);
  box(12, 3, 0, 5, -15, 4, 0, 0);
  const pm = new THREE.PMREMGenerator(renderer);
  const t = pm.fromScene(s, .02).texture;
  pm.dispose();
  return t;
}

export async function initScene(canvas, { coarse = false, mode = 'main', onProgress = () => {} } = {}) {
  const BA = mode === 'ba';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !coarse, powerPreference: 'high-performance' });
  let dpr = Math.min(window.devicePixelRatio || 1, coarse ? 1.25 : 1.75);
  renderer.setPixelRatio(dpr);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = BA ? 1 : .2;
  renderer.setClearColor(0x08090b, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x08090b, .042);
  scene.environment = studioEnv(renderer);
  scene.environmentIntensity = 1;

  const camera = new THREE.PerspectiveCamera(30, 1, .1, 60);
  const key = new THREE.SpotLight(0xfff1de, 36, 22, .5, .8, 1.6);
  key.position.set(3, 7, -2); key.target.position.set(0, 0, 0);
  scene.add(key, key.target);

  // floor + soft contact shadow
  const floor = new THREE.Mesh(new THREE.CircleGeometry(18, 64), new THREE.MeshStandardMaterial({ color: 0x0b0c0f, metalness: .7, roughness: .5, envMapIntensity: .22 }));
  floor.rotation.x = -Math.PI/2; scene.add(floor);
  const sc = document.createElement('canvas'); sc.width = sc.height = 128;
  const g = sc.getContext('2d'), gr = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  gr.addColorStop(0, 'rgba(0,0,0,.95)'); gr.addColorStop(.6, 'rgba(0,0,0,.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.9, 5.6), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false, opacity: .9 }));
  shadow.rotation.x = -Math.PI/2; shadow.position.y = .004; shadow.position.z = .12; scene.add(shadow);

  const U = PATCH_UNIFORMS();
  U.uBead.value = coarse ? .5 : .72;
  if (BA) { U.uScreen.value = .5; U.uEdge.value = 0; }
  const bodyMat = new THREE.MeshPhysicalMaterial({ color: COLORS.rosso, metalness: 1, roughness: .5, clearcoat: 1, clearcoatRoughness: .03 });
  patchPaint(bodyMat, U);
  const detailMat = new THREE.MeshStandardMaterial({ color: 0x555a61, metalness: 1, roughness: .32 });
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x0a0d12, metalness: .9, roughness: .04, transparent: true, opacity: .62 });

  const draco = new DRACOLoader().setDecoderPath('assets/vendor/libs/draco/gltf/');
  const loader = new GLTFLoader().setDRACOLoader(draco);
  const gltf = await new Promise((res, rej) => loader.load('assets/models/ferrari.glb', res,
    e => e.total && onProgress(e.loaded/e.total), rej));
  const car = gltf.scene;
  const get = n => car.getObjectByName(n);
  get('body').material = bodyMat;
  for (const n of ['rim_fl', 'rim_fr', 'rim_rl', 'rim_rr', 'trim']) get(n).material = detailMat;
  get('glass').material = glassMat;
  const wheels = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'].map(n => { const w = get(n); return { w, x: w.position.x }; });
  const root = new THREE.Group(); root.add(car); scene.add(root);
  root.updateMatrixWorld(true);
  const bodyMesh = get('body');

  // anchors for the paint-depth callouts: ray down / sideways onto the body
  const ray = new THREE.Raycaster();
  const hit = (o, d) => { ray.set(o, d); const h = ray.intersectObject(bodyMesh, true)[0]; return h ? root.worldToLocal(h.point.clone()) : null; };
  const anchors = [
    hit(new THREE.Vector3(0, 3, -1.45), new THREE.Vector3(0, -1, 0)),
    hit(new THREE.Vector3(0, 3, .35), new THREE.Vector3(0, -1, 0)),
    hit(new THREE.Vector3(3, .62, -.15), new THREE.Vector3(-1, 0, 0))
  ];

  const camCurve = new THREE.CatmullRomCurve3(CAM.map(a => new THREE.Vector3(...a)), false, 'centripetal');
  const tgtCurve = new THREE.CatmullRomCurve3(TGT.map(a => new THREE.Vector3(...a)), false, 'centripetal');
  const tmpP = new THREE.Vector3(), tmpT = new THREE.Vector3(), tmpV = new THREE.Vector3();

  const colorTarget = new THREE.Color(COLORS.rosso);
  let p = 0, last = 0, wide = true, dirty = true, drift = 0, beadOn = 0;
  const baPos = new THREE.Vector3(), baTgt = new THREE.Vector3();

  function resize() {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(2, r.width), h = Math.max(2, r.height);
    renderer.setSize(w, h, false);
    camera.aspect = w/h;
    camera.fov = BA ? (w/h < 1.2 ? 42 : 30) : w/h < .8 ? 44 : 30;
    renderer.getDrawingBufferSize(U.uRes.value);
    if (BA) {
      const sq = w/h < 1.2;
      baPos.set(sq ? -2.7 : -2.5, sq ? 1.1 : 1.05, sq ? -3.7 : -3.5); baTgt.set(.1, .62, -1.2);
      camera.position.copy(baPos); camera.lookAt(baTgt); camera.clearViewOffset(); camera.updateProjectionMatrix(); dirty = true; return;
    }
    // shift the car right on wide screens so the copy owns the left
    wide = w/h > 1.1;
    if (wide) camera.setViewOffset(w, h, -w*.17, 0, w, h); else camera.setViewOffset(w, h, 0, h*.14, w, h);
    camera.updateProjectionMatrix();
    dirty = true;
  }

  function apply(pp) {
    p = pp;
    camCurve.getPoint(p, tmpP); tgtCurve.getPoint(p, tmpT);
    if (!wide) { tmpP.sub(tmpT).multiplyScalar(1.6).add(tmpT); tmpP.y += .5; }
    camera.position.copy(tmpP);
    camera.lookAt(tmpT);
    renderer.toneMappingExposure = lerp(.6, 1.0, ease(ramp(p, 0, .05)));
    U.uWipe.value = p < .2 ? -9 : lerp(-2.9, 2.9, ease(ramp(p, .24, .39)));
    if (p > .39) U.uWipe.value = 9;
    U.uFilm.value = p < .43 ? -9 : lerp(-2.9, -.25, ease(ramp(p, .45, .54)));
    U.uEdge.value = 1. - ease(ramp(p, .55, .6));
    U.uCoat.value = p < .55 ? -9 : lerp(-2.9, 2.9, ease(ramp(p, .57, .68)));
    const ex = ease(ramp(p, .7, .76))*(1 - ease(ramp(p, .8, .86)));
    wheels.forEach(({ w, x }) => { w.position.x = x + Math.sign(x)*ex*1.0; });
    root.rotation.y = Math.PI*2*ease(ramp(p, .84, .985));
    key.position.set(3 + Math.sin(p*6.28)*2, 7, -2 + Math.cos(p*6.28)*2);
    dirty = true;
  }

  function render(now) {
    const t = now/1000;
    U.uTime.value = t;
    root.updateMatrixWorld(true);
    U.uCarInv.value.copy(root.matrixWorld).invert();
    U.uCarW.value.setFromMatrix4(root.matrixWorld);
    bodyMat.color.lerp(colorTarget, .08);
    if (BA) {
      camera.position.set(baPos.x + Math.sin(t*.35)*.18, baPos.y + Math.sin(t*.27)*.04, baPos.z + Math.cos(t*.3)*.1);
      camera.lookAt(baTgt);
      key.position.set(3 + Math.sin(t*.2)*1.5, 7, -2);
    }
    renderer.render(scene, camera);
    // callouts follow the car
    return anchors.map(a => {
      if (!a) return null;
      tmpV.copy(a); root.localToWorld(tmpV); tmpV.project(camera);
      const r = canvas.getBoundingClientRect();
      const x = (tmpV.x*.5 + .5)*r.width, y = (-tmpV.y*.5 + .5)*r.height;
      return { x, y, behind: tmpV.z > 1 || x > r.width - 150 || x < 40 || y < 90 || y > r.height - 60 };
    });
  }

  resize();
  if (!BA) apply(0);
  return {
    resize, apply, render,
    get dirty() { return dirty; }, set dirty(v) { dirty = v; },
    setColor: (name, instant) => { colorTarget.set(COLORS[name]); if (instant) bodyMat.color.copy(colorTarget); dirty = true; },
    setSplit: x => { U.uScreen.value = x; dirty = true; },
    setBeads: v => { U.uCoat.value = v > .01 ? 9 : -9; U.uBead.value = (coarse ? .5 : .72) * v; dirty = true; },
    lowerQuality: () => { dpr *= .7; renderer.setPixelRatio(dpr); resize(); }
  };
}
