import * as THREE from 'three';

/**
 * Cem Faces' faces: each of his four white masks wears its own expression, painted on a canvas
 * and laid over the mask (replacing the identical box eyes / mouth of the GLB).
 *   fight 1: fúria · gargalhada · choro · grito
 *   fight 2: the screens that survived go deranged (stitched grin, crying blood, X-eyes)
 */

export type FaceMood = 'rage' | 'laugh' | 'cry' | 'scream' | 'stitched' | 'bleeding' | 'dead' | 'error' | 'horror' | 'static';

const cache = new Map<FaceMood, THREE.CanvasTexture>();

function faceTexture(mood: FaceMood): THREE.CanvasTexture {
  const hit = cache.get(mood);
  if (hit) return hit;
  const W = 48;
  const H = 62;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d')!;
  x.imageSmoothingEnabled = false;
  const K = '#060608';
  const RED = '#e0102a';
  const px = (col: string, ax: number, ay: number, w = 1, h = 1) => {
    x.fillStyle = col;
    x.fillRect(ax, ay, w, h);
  };
  const line = (col: string, pts: [number, number][], t = 2) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (let k = 0; k <= n; k++) px(col, Math.round(x0 + ((x1 - x0) * k) / n), Math.round(y0 + ((y1 - y0) * k) / n), t, t);
    }
  };
  const eyes = (lx: number, rx: number, y: number, w: number, h: number, col = K) => {
    px(col, lx, y, w, h);
    px(col, rx, y, w, h);
  };
  switch (mood) {
    case 'rage':
      line(K, [[8, 16], [19, 22]], 3);
      line(K, [[40, 16], [29, 22]], 3);
      eyes(10, 29, 24, 9, 5);
      px(RED, 13, 25, 3, 3);
      px(RED, 32, 25, 3, 3);
      // Bared teeth, frowning
      line(K, [[10, 48], [16, 42], [32, 42], [38, 48]], 3);
      for (let t = 17; t < 32; t += 4) px('#ffffff', t, 44, 2, 3);
      break;
    case 'laugh':
      // Eyes squeezed shut ^ ^, huge open grin
      line(K, [[9, 26], [14, 21], [19, 26]], 3);
      line(K, [[29, 26], [34, 21], [39, 26]], 3);
      x.fillStyle = K;
      x.beginPath();
      x.moveTo(8, 36);
      x.lineTo(40, 36);
      x.lineTo(32, 52);
      x.lineTo(16, 52);
      x.closePath();
      x.fill();
      px(RED, 18, 46, 12, 5);
      for (let t = 10; t < 39; t += 4) px('#ffffff', t, 37, 3, 3);
      break;
    case 'cry':
      // Sloped sad brows, droopy eyes, tear streams, wobbly frown
      line(K, [[9, 18], [18, 14]], 2);
      line(K, [[39, 18], [30, 14]], 2);
      eyes(10, 29, 22, 9, 4);
      px('#ffffff', 15, 22, 2, 2);
      px('#ffffff', 34, 22, 2, 2);
      px('#46b8ff', 12, 27, 3, 18);
      px('#46b8ff', 33, 27, 3, 22);
      line(K, [[14, 50], [18, 45], [24, 47], [30, 45], [34, 50]], 2);
      break;
    case 'scream':
      // Wide round eyes, tiny pupils, huge O mouth
      eyes(9, 28, 18, 11, 11);
      px('#ffffff', 13, 22, 3, 3);
      px('#ffffff', 32, 22, 3, 3);
      x.fillStyle = K;
      x.beginPath();
      x.ellipse(24, 45, 8, 11, 0, 0, Math.PI * 2);
      x.fill();
      px(RED, 21, 50, 6, 4);
      break;
    case 'stitched':
      // Fight 2: a grin stitched far too wide, one eye a spiral
      line(K, [[10, 22], [18, 22]], 3);
      x.strokeStyle = K;
      x.lineWidth = 2;
      x.beginPath();
      for (let a = 0; a < 12; a += 0.4) x.lineTo(34 + Math.cos(a) * a * 0.55, 23 + Math.sin(a) * a * 0.55);
      x.stroke();
      line(K, [[4, 38], [12, 44], [24, 46], [36, 44], [44, 38]], 2);
      for (let t = 7; t < 43; t += 4) line(RED, [[t, 37], [t + 2, 47]], 1);
      break;
    case 'bleeding':
      // Fight 2: hollow sockets crying blood
      eyes(10, 29, 20, 9, 8);
      px(RED, 13, 28, 3, 26);
      px(RED, 32, 28, 3, 20);
      px(RED, 30, 48, 2, 8);
      line(K, [[16, 46], [32, 46]], 3);
      break;
    case 'dead':
      line(K, [[9, 17], [19, 27]], 3);
      line(K, [[19, 17], [9, 27]], 3);
      line(K, [[29, 17], [39, 27]], 3);
      line(K, [[39, 17], [29, 27]], 3);
      line(K, [[14, 45], [34, 45]], 2);
      px(RED, 28, 46, 4, 6);
      break;
    case 'horror': {
      // The locked face: hollow black eyes far too big with red pinpricks, the mouth torn open
      // ear to ear on jagged teeth, cracks running out of it
      px(K, 7, 15, 13, 13);
      px(K, 28, 15, 13, 13);
      px(K, 9, 13, 9, 2);
      px(K, 30, 13, 9, 2);
      px(RED, 12, 20, 3, 3);
      px(RED, 33, 20, 3, 3);
      px('#ff8a8a', 13, 20, 1, 1);
      px('#ff8a8a', 34, 20, 1, 1);
      px(K, 4, 37, 40, 15);
      px(K, 2, 34, 4, 5);
      px(K, 42, 34, 4, 5);
      for (let t = 6; t < 43; t += 4) {
        px('#f2eee6', t, 37, 2, 4);
        px('#f2eee6', t + 2, 48, 2, 4);
      }
      line('#3a3a3a', [[24, 0], [22, 9], [25, 14]], 1);
      line('#3a3a3a', [[46, 30], [40, 33]], 1);
      line(RED, [[14, 28], [13, 33]], 1);
      line(RED, [[34, 28], [35, 34]], 1);
      break;
    }
    case 'static':
      for (let yy = 0; yy < H; yy += 2)
        for (let xx = 0; xx < W; xx += 2) {
          const v = Math.floor(Math.random() * 200);
          px(`rgb(${v},${v},${v})`, xx, yy, 2, 2);
        }
      break;
    case 'error':
      x.fillStyle = K;
      x.font = 'bold 16px monospace';
      x.textAlign = 'center';
      x.fillText('ERR', 24, 30);
      x.font = 'bold 9px monospace';
      x.fillText('0xDEAD', 24, 44);
      break;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(mood, tex);
  return tex;
}

const FIGHT1: FaceMood[] = ['rage', 'laugh', 'cry', 'scream'];

/** Paints one expression per mask (done once on the loaded template; clones inherit it). */
export function applyFaceExpressions(boss: THREE.Object3D, moods: FaceMood[] = FIGHT1) {
  for (let f = 0; f < 4; f++) {
    const face = boss.getObjectByName(`white_face_${f}`);
    if (!face) continue;
    face.traverse((o) => {
      if (/^face_(eye_l|eye_r|seam|mouth)_/.test(o.name)) o.visible = false;
    });
    let plane = face.getObjectByName(`face_expr_${f}`) as THREE.Mesh | undefined;
    if (!plane) {
      plane = new THREE.Mesh(
        new THREE.PlaneGeometry(0.5, 0.64),
        new THREE.MeshStandardMaterial({ transparent: true, alphaTest: 0.1, roughness: 0.6, emissive: 0xffffff, emissiveIntensity: 0.25 })
      );
      plane.name = `face_expr_${f}`;
      plane.position.set(0, -0.02, 0.625);
      face.add(plane);
    }
    const m = plane.material as THREE.MeshStandardMaterial;
    m.map = faceTexture(moods[f]);
    m.emissiveMap = m.map;
    m.needsUpdate = true;
  }
}

/** Fight 2: the faces have lost it. */
export function applyBrokenExpressions(boss: THREE.Object3D) {
  applyFaceExpressions(boss, ['dead', 'stitched', 'error', 'bleeding']);
}
