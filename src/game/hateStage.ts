import * as THREE from 'three';

/**
 * The set for the Ódio ending: deep inside the Tree, a dead circular shaft. Floors of dark
 * balconies ring up toward one opening of cold light far above; dust falls through the beam.
 * The floor is a graveyard: rubble, fallen beams and the machines the cowboy already killed.
 *
 * Everything is procedural (canvas textures + primitives) and lives under one group, built far
 * from the arena so nothing of the level shows in the shots. Local space: the cowboy starts near
 * the middle and walks toward -Z, where the boss is cornered against the wall.
 */

export const STAGE_RADIUS = 13;
const SHAFT_HEIGHT = 72;

export interface HateStage {
  group: THREE.Group;
  /** Falling dust + flickering broken machines. */
  update(dt: number, t: number): void;
  dispose(): void;
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const tex = new THREE.CanvasTexture(c);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Shaft wall: floors of balconies, mullions, a few windows still lit (map + emissive). */
function facadeTextures() {
  const W = 512;
  const H = 256;
  const FLOOR = 32;
  const rnd = seeded(41);
  const lit: [number, number, string][] = [];
  const map = canvasTex(W, H, (g) => {
    g.fillStyle = '#0d1116';
    g.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += FLOOR) {
      // balcony slab catching the light from above, its shadow underneath
      g.fillStyle = '#2a323c';
      g.fillRect(0, y, W, 4);
      g.fillStyle = '#05070a';
      g.fillRect(0, y + 4, W, 5);
      for (let x = 0; x < W; x += 16) {
        g.fillStyle = '#080b0e';
        g.fillRect(x, y + 9, 3, FLOOR - 9);
        // windows: mostly dead glass, a few still burning
        const r = rnd();
        g.fillStyle = r < 0.05 ? '#ffcf7a' : r < 0.09 ? '#7fa3c4' : r < 0.5 ? '#141b22' : '#0a0e13';
        g.fillRect(x + 5, y + 13, 8, 12);
        if (r < 0.09) lit.push([x + 5, y + 13, r < 0.05 ? '#ffcf7a' : '#5a7a98']);
      }
    }
    // grime streaks running down
    for (let i = 0; i < 160; i++) {
      g.fillStyle = `rgba(0,0,0,${0.15 + rnd() * 0.3})`;
      g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 10 + rnd() * 40);
    }
  });
  const emissive = canvasTex(W, H, (g) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    for (const [x, y, c] of lit) {
      g.fillStyle = c;
      g.fillRect(x, y, 8, 12);
    }
  });
  return { map, emissive };
}

/** Cracked dark floor. */
function floorTexture() {
  const rnd = seeded(7);
  return canvasTex(256, 256, (g) => {
    g.fillStyle = '#121316';
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i++) {
      const v = 10 + Math.floor(rnd() * 22);
      g.fillStyle = `rgb(${v},${v},${v + 2})`;
      g.fillRect(rnd() * 256, rnd() * 256, 2 + rnd() * 6, 2 + rnd() * 6);
    }
    g.strokeStyle = 'rgba(0,0,0,0.85)';
    for (let i = 0; i < 26; i++) {
      g.lineWidth = 0.6 + rnd() * 1.4;
      g.beginPath();
      let x = rnd() * 256;
      let y = rnd() * 256;
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += (rnd() - 0.5) * 50;
        y += (rnd() - 0.5) * 50;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  });
}

/** Builds the shaft. `corpses` are enemy templates to scatter around as dead machines. */
export function buildHateStage(corpses: THREE.Object3D[]): HateStage {
  const group = new THREE.Group();
  const rnd = seeded(94);
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(x: T) => {
    disposables.push(x);
    return x;
  };

  // ── Shaft walls
  const facade = facadeTextures();
  facade.map.repeat.set(7, 9);
  facade.emissive.repeat.set(7, 9);
  keep(facade.map);
  keep(facade.emissive);
  const wall = new THREE.Mesh(
    keep(new THREE.CylinderGeometry(STAGE_RADIUS, STAGE_RADIUS, SHAFT_HEIGHT, 56, 1, true)),
    keep(
      new THREE.MeshStandardMaterial({
        map: facade.map,
        emissiveMap: facade.emissive,
        emissive: 0xffffff,
        emissiveIntensity: 0.9,
        roughness: 0.92,
        metalness: 0.1,
        side: THREE.BackSide,
      })
    )
  );
  wall.position.y = SHAFT_HEIGHT / 2;
  group.add(wall);

  // ── The opening of light above
  const sky = new THREE.Mesh(
    keep(new THREE.CircleGeometry(STAGE_RADIUS * 0.98, 48)),
    keep(new THREE.MeshBasicMaterial({ color: 0xe8f0f6, toneMapped: false }))
  );
  sky.rotation.x = Math.PI / 2;
  sky.position.y = SHAFT_HEIGHT;
  group.add(sky);
  // Soft beam falling through the dust
  const beam = new THREE.Mesh(
    keep(new THREE.CylinderGeometry(7.5, 4.2, SHAFT_HEIGHT, 32, 1, true)),
    keep(
      new THREE.MeshBasicMaterial({
        color: 0xbfd4e6,
        transparent: true,
        opacity: 0.045,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      })
    )
  );
  beam.position.set(0.5, SHAFT_HEIGHT / 2, -2.5);
  group.add(beam);
  const sun = new THREE.SpotLight(0xd8e6f2, 9, 0, 0.36, 0.75, 0);
  sun.position.set(0.5, SHAFT_HEIGHT - 2, -2.5);
  sun.target.position.set(0, 0, -4.5);
  group.add(sun, sun.target);
  // Faint cold fill so the walls read as walls
  const fill = new THREE.HemisphereLight(0x3a4a5c, 0x070606, 0.35);
  group.add(fill);

  // ── Floor
  const floorTex = keep(floorTexture());
  floorTex.repeat.set(5, 5);
  const floor = new THREE.Mesh(
    keep(new THREE.CircleGeometry(STAGE_RADIUS, 48)),
    keep(new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.95, metalness: 0.05 }))
  );
  floor.rotation.x = -Math.PI / 2;
  group.add(floor);

  // ── Debris: keep the walk lane (x ≈ 0, z from 1 to -10) clear
  const inLane = (x: number, z: number) => Math.abs(x) < 1.8 && z < 2.5 && z > -11.5;
  const concrete = keep(new THREE.MeshStandardMaterial({ color: 0x2a2b2e, roughness: 0.95 }));
  const rust = keep(new THREE.MeshStandardMaterial({ color: 0x3a2018, roughness: 0.8, metalness: 0.5 }));
  const steel = keep(new THREE.MeshStandardMaterial({ color: 0x22262b, roughness: 0.6, metalness: 0.7 }));
  const rock = keep(new THREE.DodecahedronGeometry(1, 0));
  const box = keep(new THREE.BoxGeometry(1, 1, 1));
  const tube = keep(new THREE.CylinderGeometry(1, 1, 1, 8));
  const place = (mesh: THREE.Object3D, rMin: number, rMax: number) => {
    for (let tries = 0; tries < 12; tries++) {
      const a = rnd() * Math.PI * 2;
      const r = rMin + rnd() * (rMax - rMin);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (inLane(x, z)) continue;
      mesh.position.x = x;
      mesh.position.z = z;
      group.add(mesh);
      return;
    }
  };
  for (let i = 0; i < 70; i++) {
    const m = new THREE.Mesh(rock, concrete);
    const s = 0.12 + rnd() * rnd() * 0.9;
    m.scale.set(s, s * (0.5 + rnd() * 0.6), s);
    m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    m.position.y = s * 0.35;
    place(m, 1.5, STAGE_RADIUS - 0.4);
  }
  // Fallen slabs and beams, some leaning on the wall
  for (let i = 0; i < 16; i++) {
    const slab = i % 3 === 0;
    const m = new THREE.Mesh(box, slab ? concrete : rust);
    const len = slab ? 1.5 + rnd() * 2 : 3 + rnd() * 5;
    m.scale.set(slab ? 1.2 + rnd() : 0.3, slab ? 0.25 : 0.3, len);
    m.rotation.set((rnd() - 0.5) * 0.9, rnd() * Math.PI, (rnd() - 0.5) * 0.6);
    m.position.y = 0.3 + rnd() * 0.7;
    place(m, 3, STAGE_RADIUS - 1);
  }
  // Snapped pipes
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(tube, steel);
    const r = 0.08 + rnd() * 0.12;
    m.scale.set(r, 1.5 + rnd() * 3, r);
    m.rotation.set(Math.PI / 2 + (rnd() - 0.5) * 0.5, rnd() * Math.PI, 0);
    m.position.y = r;
    place(m, 2.5, STAGE_RADIUS - 1);
  }
  // A heap behind the boss: he has nowhere left to back into
  for (let i = 0; i < 18; i++) {
    const m = new THREE.Mesh(i % 2 ? rock : box, i % 3 ? concrete : rust);
    const s = 0.4 + rnd() * 0.9;
    m.scale.set(s, s * 0.7, s);
    m.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    m.position.set((rnd() - 0.5) * 5, s * 0.3, -11.6 - rnd() * 1.1);
    group.add(m);
  }

  // ── Dead machines: what's left of the ones who tried to stop him
  const flickers: THREE.PointLight[] = [];
  corpses.forEach((tpl, i) => {
    const c = tpl.clone(true);
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mats = (Array.isArray(m.material) ? m.material : [m.material]).map((mm) => {
        const cl = (mm as THREE.MeshStandardMaterial).clone();
        if (cl.color) cl.color.multiplyScalar(0.3);
        if (cl.emissive) cl.emissiveIntensity = 0;
        keep(cl);
        return cl;
      });
      m.material = Array.isArray(m.material) ? mats : mats[0];
    });
    c.rotation.set(0, rnd() * Math.PI * 2, (rnd() < 0.5 ? 1 : -1) * (Math.PI / 2 - 0.15));
    c.position.y = 0.35;
    const holder = new THREE.Group();
    holder.add(c);
    place(holder, 3, STAGE_RADIUS - 1.5);
    // a couple still spark
    if (i % 3 === 0) {
      const l = new THREE.PointLight(0xff3a1a, 0, 3.5, 2);
      l.position.set(holder.position.x, 0.6, holder.position.z);
      group.add(l);
      flickers.push(l);
    }
  });

  // ── Dust falling through the light
  const N = 1400;
  const pos = new Float32Array(N * 3);
  const vel = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * (STAGE_RADIUS - 0.5);
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = rnd() * 40;
    pos[i * 3 + 2] = Math.sin(a) * r;
    vel[i] = 0.5 + rnd() * 1.3;
  }
  const dustGeo = keep(new THREE.BufferGeometry());
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(
    dustGeo,
    keep(
      new THREE.PointsMaterial({
        color: 0xcfd8e2,
        size: 0.06,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    )
  );
  dust.frustumCulled = false;
  group.add(dust);

  return {
    group,
    update(dt, t) {
      const p = dustGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < N; i++) {
        let y = pos[i * 3 + 1] - vel[i] * dt;
        if (y < 0) y += 40;
        pos[i * 3 + 1] = y;
        pos[i * 3] += Math.sin(t * 0.7 + i) * dt * 0.05;
      }
      p.needsUpdate = true;
      flickers.forEach((l, i) => {
        const s = Math.sin(t * 37 + i * 11) * Math.sin(t * 13.7 + i);
        l.intensity = s > 0.6 ? 3 : s > 0.3 ? 0.6 : 0;
      });
    },
    dispose() {
      group.parent?.remove(group);
      for (const d of disposables) d.dispose();
    },
  };
}
