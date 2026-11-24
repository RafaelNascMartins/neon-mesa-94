import * as THREE from 'three';

/**
 * What's under the cowboy's mask (Ódio ending): a human face that has no business being alive.
 * Skinless, burnt and rotting — sunken cheeks, bare cheekbones, a hole where the nose was, two
 * black holes for eyes, a lipless grin of yellowed teeth. No monster parts: just a person who
 * should have died a long time ago.
 *
 * Built from a sphere sculpted by displacement, split so the lower jaw can drop open; strips of
 * cheek stay stretched between skull and jaw, and a neck of the same meat ties the head to the
 * body (it stretches when the head lunges). Sized to replace the cowboy's head box.
 */

export interface DeadFace {
  /** The head (centre at its origin). Parent it where the head box was. */
  group: THREE.Group;
  /** Rotate .x positive to drop the jaw open (call update() after). */
  jaw: THREE.Group;
  /** The neck: lives beside the head (same parent), stretched by update(). */
  neck: THREE.Mesh;
  /** Re-stretches the cheeks to the jaw and the neck from `shoulder` (parent space) to the head. */
  update(shoulder: THREE.Vector3): void;
  dispose(): void;
}

const SCALE = new THREE.Vector3(0.165, 0.205, 0.175);
/** Where the skull stops and the jaw begins (polar angle from the top). */
const CUT = Math.PI * 0.6;
const HINGE = new THREE.Vector3(0, -0.035, -0.06);

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const gauss = (dx: number, dy: number, sx: number, sy: number) => Math.exp(-((dx * dx) / (2 * sx * sx) + (dy * dy) / (2 * sy * sy)));

/** Radial offset of the unit-sphere point (x,y,z), z = forward. Negative = dent. */
function sculpt(x: number, y: number, z: number) {
  const front = THREE.MathUtils.smoothstep(z, 0.15, 0.8);
  let d = 0;
  for (const sx of [-1, 1]) {
    d -= 0.24 * gauss(x - sx * 0.35, y - 0.12, 0.13, 0.12) * front; // eye sockets
    d -= 0.1 * gauss(x - sx * 0.55, y + 0.3, 0.13, 0.13) * front; // cheeks fallen in
    d += 0.065 * gauss(x - sx * 0.55, y + 0.02, 0.1, 0.07) * front; // cheekbones showing
    d -= 0.06 * gauss(x - sx * 0.86, y - 0.16, 0.12, 0.14); // temples
  }
  d -= 0.22 * gauss(x, y + 0.1, 0.075, 0.1) * front; // the nose is gone: a hole
  d += 0.05 * gauss(0, y - 0.3, 1, 0.06) * front * (1 - Math.min(1, Math.abs(x) / 0.7)); // brow ridge
  // rot: lumpy, uneven
  d += 0.025 * Math.sin(x * 23 + y * 7) * Math.sin(y * 19 - z * 5) + 0.015 * Math.sin(x * 41 + z * 37);
  return d;
}

/** The sculpted surface point at polar angle `theta`, azimuth `phi` (three.js sphere convention). */
function surface(theta: number, phi: number, inset = 1) {
  const n = new THREE.Vector3(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta));
  return n.clone().multiplyScalar((1 + sculpt(n.x, n.y, n.z)) * inset).multiply(SCALE);
}

function sculptedPart(phiStart: number, phiLength: number, thetaStart: number, thetaLength: number, wSeg: number, hSeg: number) {
  const geo = new THREE.SphereGeometry(1, wSeg, hSeg, phiStart, phiLength, thetaStart, thetaLength);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = v.clone().normalize();
    v.multiplyScalar(1 + sculpt(n.x, n.y, n.z));
    v.multiply(SCALE);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Burnt, rotting skin: dark red meat, scorched orange, char, a sick blue-green bloom. */
function rotTextures() {
  const S = 512;
  const draw = (g: CanvasRenderingContext2D, grey: boolean) => {
    const rnd = seeded(13);
    const col = (r: number, gg: number, b: number, a = 1) => {
      if (!grey) return `rgba(${r},${gg},${b},${a})`;
      const l = (r + gg + b) / 3;
      return `rgba(${l},${l},${l},${a})`;
    };
    g.fillStyle = col(70, 22, 16);
    g.fillRect(0, 0, S, S);
    const blot = (r: number, gg: number, b: number, a: number, size: number, n: number) => {
      for (let i = 0; i < n; i++) {
        const x = rnd() * S;
        const y = rnd() * S;
        const rad = size * (0.4 + rnd());
        const grd = g.createRadialGradient(x, y, 0, x, y, rad);
        grd.addColorStop(0, col(r, gg, b, a));
        grd.addColorStop(1, col(r, gg, b, 0));
        g.fillStyle = grd;
        g.beginPath();
        g.arc(x, y, rad, 0, Math.PI * 2);
        g.fill();
      }
    };
    blot(120, 40, 24, 0.7, 70, 30); // raw meat
    blot(200, 92, 30, 0.55, 40, 40); // scorched orange
    blot(230, 170, 70, 0.4, 14, 50); // blistered yellow
    blot(12, 6, 4, 0.75, 45, 28); // char
    blot(70, 96, 110, 0.25, 60, 14); // cold blue-grey bloom
    blot(70, 90, 50, 0.22, 50, 12); // green rot
    // cracks through the char
    g.strokeStyle = col(8, 3, 2, 0.8);
    for (let i = 0; i < 120; i++) {
      g.lineWidth = 0.6 + rnd() * 1.6;
      g.beginPath();
      let x = rnd() * S;
      let y = rnd() * S;
      g.moveTo(x, y);
      for (let k = 0; k < 5; k++) {
        x += (rnd() - 0.5) * 30;
        y += (rnd() - 0.5) * 30;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    // wet specks
    for (let i = 0; i < 500; i++) {
      g.fillStyle = col(240, 200, 150, 0.35 + rnd() * 0.4);
      g.fillRect(rnd() * S, rnd() * S, 1, 1);
    }
  };
  const mk = (grey: boolean) => {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    draw(c.getContext('2d')!, grey);
    const t = new THREE.CanvasTexture(c);
    if (!grey) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  return { map: mk(false), bump: mk(true) };
}

/** A soft black blot (alpha falls off from the centre). */
function blurTexture(core: number) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(0,0,0,1)');
  grd.addColorStop(core, 'rgba(0,0,0,0.85)');
  grd.addColorStop(0.75, 'rgba(0,0,0,0.25)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

export function buildDeadFace(): DeadFace {
  const group = new THREE.Group();
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => {
    disposables.push(x);
    return x;
  };
  const rnd = seeded(77);
  const tex = rotTextures();
  keep(tex.map);
  keep(tex.bump);
  const skinParams: THREE.MeshStandardMaterialParameters = {
    map: tex.map,
    bumpMap: tex.bump,
    bumpScale: 2.5,
    roughness: 0.38, // wet
    metalness: 0.05,
    emissive: 0x2a0800,
    emissiveIntensity: 0.35,
  };
  const skin = keep(new THREE.MeshStandardMaterial(skinParams));
  const skinTwoSided = keep(new THREE.MeshStandardMaterial({ ...skinParams, side: THREE.DoubleSide }));
  const shade = (m: THREE.Mesh) => {
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };

  // Skull down to just under the cheekbones, the back of the head below that, and the jaw
  group.add(shade(new THREE.Mesh(keep(sculptedPart(0, Math.PI * 2, 0, CUT, 56, 40)), skin)));
  group.add(shade(new THREE.Mesh(keep(sculptedPart(Math.PI, Math.PI, CUT, Math.PI - CUT, 28, 14)), skin)));
  const jaw = new THREE.Group();
  jaw.position.copy(HINGE);
  const jawGeo = keep(sculptedPart(0, Math.PI, CUT, Math.PI * 0.34, 32, 14));
  jawGeo.translate(-HINGE.x, -HINGE.y, -HINGE.z);
  jaw.add(shade(new THREE.Mesh(jawGeo, skin)));
  group.add(jaw);
  // Inside: dark, wet, nothing
  const hollow = new THREE.Mesh(keep(new THREE.SphereGeometry(0.85, 20, 14)), keep(new THREE.MeshBasicMaterial({ color: 0x0d0203 })));
  hollow.scale.copy(SCALE);
  group.add(hollow);

  // ── Teeth: a lipless grin, yellowed and uneven, a few missing
  const toothMats = [0xd9c9a0, 0xc4ad78, 0xa88d5a, 0x6e5a3e].map((c) => keep(new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.02 })));
  const toothGeo = keep(new THREE.BoxGeometry(1, 1, 1));
  const TEETH = 12;
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < TEETH; i++) {
      if (rnd() < 0.12) continue; // gone
      const phi = Math.PI * (0.32 + (i / (TEETH - 1)) * 0.36);
      const p = surface(CUT + (row ? 0.03 : -0.01), phi, 0.965);
      const front = Math.sin(phi); // narrower toward the corners
      const t = new THREE.Mesh(toothGeo, toothMats[Math.floor(rnd() * (rnd() < 0.2 ? 4 : 3))]);
      t.scale.set(0.015 + front * 0.007, 0.018 + rnd() * 0.01, 0.012);
      t.rotation.set((rnd() - 0.5) * 0.25, Math.PI / 2 - phi, (rnd() - 0.5) * 0.3);
      shade(t);
      if (row === 0) {
        t.position.copy(p).add(new THREE.Vector3(0, -0.008, 0));
        group.add(t);
      } else {
        t.position.copy(p).add(new THREE.Vector3(0, 0.008, 0)).sub(HINGE);
        jaw.add(t);
      }
    }
  }

  // ── Cheeks: strips of meat stretched between the skull's edge and the jaw's, both sides
  const COLS = 6;
  const cheekSides = [
    { from: 0.04, to: 0.3 },
    { from: 0.7, to: 0.96 },
  ].map(({ from, to }) => {
    const top: THREE.Vector3[] = [];
    const rest: THREE.Vector3[] = [];
    for (let i = 0; i <= COLS; i++) {
      const phi = Math.PI * (from + ((to - from) * i) / COLS);
      const p = surface(CUT, phi, 0.99);
      top.push(p);
      rest.push(p.clone().sub(HINGE)); // in jaw space
    }
    const geo = keep(new THREE.BufferGeometry());
    const pos = new Float32Array((COLS + 1) * 2 * 3);
    const uv = new Float32Array((COLS + 1) * 2 * 2);
    const idx: number[] = [];
    for (let i = 0; i <= COLS; i++) {
      uv.set([i / COLS, 1, i / COLS, 0], i * 4);
      if (i < COLS) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const mesh = shade(new THREE.Mesh(geo, skinTwoSided));
    group.add(mesh);
    return { geo, pos, top, rest };
  });

  // ── Neck: a column of the same meat from the shoulders up into the head
  const neckGeo = keep(new THREE.CylinderGeometry(1, 1.15, 1, 12, 4, true));
  const neck = shade(new THREE.Mesh(neckGeo, skinTwoSided));
  neck.visible = false;

  // ── Eyes: two black holes, deeply blurred at the edges
  const blurNear = keep(new THREE.SpriteMaterial({ map: keep(blurTexture(0.3)), color: 0x000000, transparent: true, depthWrite: false }));
  const blurFar = keep(new THREE.SpriteMaterial({ map: keep(blurTexture(0.1)), color: 0x000000, transparent: true, depthWrite: false, opacity: 0.7 }));
  const holeMat = keep(new THREE.MeshBasicMaterial({ color: 0x000000 }));
  const holeGeo = keep(new THREE.CircleGeometry(0.026, 18));
  for (const sx of [-1, 1]) {
    const n = new THREE.Vector3(sx * 0.35, 0.12, 0).setZ(Math.sqrt(1 - 0.35 * 0.35 - 0.12 * 0.12));
    const p = n.clone().multiplyScalar(1 + sculpt(n.x, n.y, n.z)).multiply(SCALE);
    const hole = new THREE.Mesh(holeGeo, holeMat);
    hole.position.copy(p).add(new THREE.Vector3(0, 0, 0.004));
    hole.lookAt(p.clone().add(new THREE.Vector3(sx * 0.2, 0, 1)));
    group.add(hole);
    const near = new THREE.Sprite(blurNear);
    near.position.copy(p).add(new THREE.Vector3(0, 0, 0.012));
    near.scale.setScalar(0.15);
    group.add(near);
    const far = new THREE.Sprite(blurFar);
    far.position.copy(p).add(new THREE.Vector3(0, 0, 0.016));
    far.scale.setScalar(0.24);
    group.add(far);
  }

  const tmp = new THREE.Vector3();
  const headBase = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  return {
    group,
    jaw,
    neck,
    update(shoulder) {
      // cheeks follow the jaw
      jaw.updateMatrix();
      for (const side of cheekSides) {
        for (let i = 0; i < side.top.length; i++) {
          side.pos.set([side.top[i].x, side.top[i].y, side.top[i].z], i * 6);
          tmp.copy(side.rest[i]).applyMatrix4(jaw.matrix);
          side.pos.set([tmp.x, tmp.y, tmp.z], i * 6 + 3);
        }
        side.geo.attributes.position.needsUpdate = true;
        side.geo.computeVertexNormals();
        side.geo.computeBoundingSphere();
      }
      // neck: from the shoulders to the underside of the head, however far it has gone
      group.updateMatrix();
      headBase.set(0, -0.15, -0.03).applyMatrix4(group.matrix);
      const len = headBase.distanceTo(shoulder);
      neck.position.copy(shoulder).add(headBase).multiplyScalar(0.5);
      neck.quaternion.setFromUnitVectors(up, tmp.copy(headBase).sub(shoulder).normalize());
      const thin = Math.max(0.6, Math.min(1, 0.25 / Math.max(0.01, len))); // it thins as it stretches
      neck.scale.set(0.072 * thin, len + 0.04, 0.072 * thin);
      neck.visible = group.visible;
    },
    dispose() {
      group.parent?.remove(group);
      neck.parent?.remove(neck);
      for (const d of disposables) d.dispose();
    },
  };
}
