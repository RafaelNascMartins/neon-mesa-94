import * as THREE from 'three';

/**
 * Retro 90s Bayer 4x4 Ordered Dithering + Color Quantization + Subtle Scanline Pass.
 * Renders the 3D scene to a low-res NearestFilter WebGLRenderTarget (~320-480px wide)
 * and composites onto the screen via a single full-screen quad.
 */
/** Default film grain + scanline strength (1 = the original, heavier look). */
export const DEFAULT_GRAIN = 0.55;

export interface DitherPostProcessor {
  renderTarget: THREE.WebGLRenderTarget;
  quadScene: THREE.Scene;
  quadCamera: THREE.OrthographicCamera;
  material: THREE.ShaderMaterial;
  resize: (width: number, height: number, pixelScale?: number) => void;
  setClean: (v: number) => void;
  /** Film grain + scanline strength (1 = normal). */
  setGrain: (v: number) => void;
  /** The aero world's corruption (0..1): tears, dead pixels, black blocks, colour draining. */
  setCorrupt: (v: number) => void;
  render: (
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    time: number,
    damageFlash: number,
    rimColorHex?: number
  ) => void;
  dispose: () => void;
}

const DITHER_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const DITHER_FRAGMENT = `
uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform float uColorSteps;
uniform float uDitherStrength;
uniform float uTime;
uniform float uDamageFlash;
uniform vec3 uRimColor;
uniform float uClean; // 0 = grimy industrial grade, 1 = clean glossy Frutiger Aero look
uniform float uGrain; // film grain + scanlines amount (1 = normal)
uniform float uCorrupt; // aero world corruption, 0..1
varying vec2 vUv;

float bayer4x4(vec2 pos) {
  int x = int(mod(pos.x, 4.0));
  int y = int(mod(pos.y, 4.0));
  int idx = x + y * 4;
  float val = 0.0;
  if (idx == 0) val = 0.0;
  else if (idx == 1) val = 8.0;
  else if (idx == 2) val = 2.0;
  else if (idx == 3) val = 10.0;
  else if (idx == 4) val = 12.0;
  else if (idx == 5) val = 4.0;
  else if (idx == 6) val = 14.0;
  else if (idx == 7) val = 6.0;
  else if (idx == 8) val = 3.0;
  else if (idx == 9) val = 11.0;
  else if (idx == 10) val = 1.0;
  else if (idx == 11) val = 9.0;
  else if (idx == 12) val = 15.0;
  else if (idx == 13) val = 7.0;
  else if (idx == 14) val = 13.0;
  else val = 5.0;
  return (val / 16.0) - 0.5;
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  // Snap UV to low-res pixel grid for chunky pixelation
  vec2 pixelCoord = floor(vUv * uResolution);
  vec2 snappedUv = (pixelCoord + 0.5) / uResolution;
  vec2 centered = vUv - 0.5;
  float edgeDist = length(centered * vec2(1.42, 1.28));

  // Screen-space horizontal glitch on damage
  if (uDamageFlash > 0.01) {
    float glitch = sin(pixelCoord.y * 0.9 + uTime * 75.0) * 0.008 * uDamageFlash;
    snappedUv.x = clamp(snappedUv.x + glitch, 0.0, 1.0);
  }

  // Corruption: bands of the picture tear sideways for a moment
  if (uCorrupt > 0.001) {
    float band = floor(pixelCoord.y / 5.0);
    float tick = floor(uTime * 7.0);
    if (hash12(vec2(band, tick)) > 1.0 - uCorrupt * 0.16) {
      snappedUv.x = fract(snappedUv.x + (hash12(vec2(band + 7.0, tick)) - 0.5) * 0.14 * uCorrupt);
    }
  }

  // Constant lens-like chromatic aberration toward the edges (+ a big kick on damage)
  vec2 caDir = centered * (0.0035 + edgeDist * 0.004 + uDamageFlash * 0.022 + uCorrupt * 0.01);
  vec3 col;
  col.r = texture2D(tDiffuse, clamp(snappedUv + caDir, 0.0, 1.0)).r;
  col.g = texture2D(tDiffuse, snappedUv).g;
  col.b = texture2D(tDiffuse, clamp(snappedUv - caDir, 0.0, 1.0)).b;

  // Grimy grade: the world goes grey and dirty, but reds and bright lights keep their colour
  // (dark scene + saturated neon = rave)
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  float maxc = max(col.r, max(col.g, col.b));
  float redness = clamp((col.r - max(col.g, col.b)) * 2.6, 0.0, 1.0);
  float brightness = smoothstep(0.45, 0.9, maxc);
  float keepSat = max(redness, brightness);
  vec3 grime = vec3(luma) * vec3(1.02, 0.98, 0.93); // faint sepia in the greys
  vec3 raw = col;
  col = mix(grime, col, 0.32 + 0.78 * keepSat);

  // Crush the blacks for hard light / deep shadow contrast
  col = pow(max(col, 0.0), vec3(1.18));
  // Aero: saturated, airy, slightly lifted
  vec3 airy = mix(vec3(dot(raw, vec3(0.299, 0.587, 0.114))), raw, 1.18) * 1.04 + 0.02;
  col = mix(col, airy, uClean);

  // Subtle atmospheric rim haze
  float rimGlow = smoothstep(0.42, 1.05, edgeDist) * 0.08;
  col = mix(col, uRimColor, rimGlow * (1.0 - uClean * 0.5));

  // Heavy vignette
  col *= mix(1.0, mix(0.32, 0.82, uClean), smoothstep(0.32, 1.08, edgeDist));

  // Corruption: colour drains to a dead grey; dead pixels (stuck black) spread; black blocks
  // flicker; now and then the whole frame inverts for an instant
  if (uCorrupt > 0.001) {
    float l2 = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(col, vec3(l2) * vec3(0.95, 0.94, 1.0), uCorrupt * 0.62);
    col *= 1.0 - uCorrupt * 0.3;
    vec2 cell = floor(pixelCoord / 2.0);
    if (hash12(cell * 1.37 + 4.1) < uCorrupt * uCorrupt * 0.03) col = vec3(0.0);
    if (hash12(cell + floor(uTime * 3.0) * vec2(11.0, 7.0)) < uCorrupt * 0.008) col = vec3(0.0);
    vec2 block = floor(pixelCoord / 14.0);
    if (hash12(block + floor(uTime * 1.7) * 13.0) < uCorrupt * uCorrupt * 0.012) col = vec3(0.0);
    if (hash12(vec2(floor(uTime * 12.0), 5.0)) < uCorrupt * 0.012) col = vec3(1.0) - col;
  }

  // Damage flash (peaks at edges, keeps center readable)
  float vignetteMask = smoothstep(0.25, 0.88, edgeDist);
  col = mix(col, vec3(1.0, 0.08, 0.24), clamp(uDamageFlash * (0.18 + vignetteMask * 0.85), 0.0, 0.92));

  // Animated film grain (re-rolled ~24 times a second)
  float grain = hash12(pixelCoord + floor(uTime * 24.0) * vec2(17.0, 31.0)) - 0.5;
  col += grain * 0.085 * (1.0 - uClean * 0.75) * uGrain;

  // Ordered Bayer 4x4 dithering before color quantization
  float threshold = bayer4x4(pixelCoord);
  vec3 dithered = col + threshold * uDitherStrength;
  vec3 quantized = floor(clamp(dithered, 0.0, 1.0) * uColorSteps + 0.5) / uColorSteps;

  // Dirty CRT: scanlines + a faint RGB aperture mask
  float scanline = 1.0 - 0.14 * (1.0 - uClean * 0.7) * uGrain * step(0.5, fract(pixelCoord.y * 0.5));
  float column = mod(pixelCoord.x, 3.0);
  vec3 mask = vec3(column < 1.0 ? 1.06 : 0.96, column >= 1.0 && column < 2.0 ? 1.06 : 0.96, column >= 2.0 ? 1.06 : 0.96);
  quantized *= scanline * mask;

  gl_FragColor = vec4(quantized, 1.0);
}
`;

export function createDitherPostProcessor(
  width: number,
  height: number,
  pixelScale = 3
): DitherPostProcessor {
  const lowW = Math.max(240, Math.floor(width / pixelScale));
  const lowH = Math.max(150, Math.floor(height / pixelScale));

  const renderTarget = new THREE.WebGLRenderTarget(lowW, lowH, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: true,
  });

  const material = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: renderTarget.texture },
      uResolution: { value: new THREE.Vector2(lowW, lowH) },
      uColorSteps: { value: 14.0 },
      uDitherStrength: { value: 0.075 },
      uTime: { value: 0 },
      uDamageFlash: { value: 0 },
      uRimColor: { value: new THREE.Color(0xff5a22) },
      uClean: { value: 0 },
      uGrain: { value: DEFAULT_GRAIN },
      uCorrupt: { value: 0 },
    },
    vertexShader: DITHER_VERTEX,
    fragmentShader: DITHER_FRAGMENT,
    depthTest: false,
    depthWrite: false,
  });

  const quadGeo = new THREE.PlaneGeometry(2, 2);
  const quadMesh = new THREE.Mesh(quadGeo, material);
  const quadScene = new THREE.Scene();
  quadScene.add(quadMesh);
  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  return {
    renderTarget,
    quadScene,
    quadCamera,
    material,
    resize(nextW: number, nextH: number, nextScale = pixelScale) {
      const rw = Math.max(240, Math.floor(nextW / nextScale));
      const rh = Math.max(150, Math.floor(nextH / nextScale));
      renderTarget.setSize(rw, rh);
      material.uniforms.uResolution.value.set(rw, rh);
    },
    render(renderer, scene, camera, time, damageFlash, rimColorHex) {
      material.uniforms.uTime.value = time;
      material.uniforms.uDamageFlash.value = damageFlash;
      if (rimColorHex !== undefined) {
        (material.uniforms.uRimColor.value as THREE.Color).setHex(rimColorHex);
      }

      renderer.setRenderTarget(renderTarget);
      renderer.clear();
      renderer.render(scene, camera);

      renderer.setRenderTarget(null);
      renderer.render(quadScene, quadCamera);
    },
    setClean(v: number) {
      material.uniforms.uClean.value = v;
    },
    setGrain(v: number) {
      material.uniforms.uGrain.value = v;
    },
    setCorrupt(v: number) {
      material.uniforms.uCorrupt.value = v;
    },
    dispose() {
      renderTarget.dispose();
      quadGeo.dispose();
      material.dispose();
    },
  };
}
