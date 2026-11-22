import * as THREE from 'three';

/**
 * "Urubu de Sucata" — a flying scavenger drone for the pit and lava rooms. A rusted carapace
 * with a single red eye, two bat-like membrane wings on hinges (flapped by the engine through
 * `userData.wings`), dangling hook claws and an exhaust glow underneath.
 */
export function buildFlyerModel(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'flyer';
  const shell = new THREE.MeshStandardMaterial({ color: 0x4a3a34, emissive: 0x4a3a34, emissiveIntensity: 0.35, roughness: 0.7, metalness: 0.5, flatShading: true });
  const rust = new THREE.MeshStandardMaterial({ color: 0x8a3818, emissive: 0x8a3818, emissiveIntensity: 0.35, roughness: 0.9, flatShading: true });
  const bone = new THREE.MeshStandardMaterial({ color: 0xd8ccb0, emissive: 0xd8ccb0, emissiveIntensity: 0.3, roughness: 0.6, flatShading: true });
  const membrane = new THREE.MeshStandardMaterial({ color: 0x5a1a20, emissive: 0x5a1a20, emissiveIntensity: 0.4, roughness: 0.8, side: THREE.DoubleSide, flatShading: true });
  const eye = new THREE.MeshBasicMaterial({ color: 0xff2414, toneMapped: false });
  const glow = new THREE.MeshBasicMaterial({ color: 0xff8a2a, toneMapped: false, transparent: true, opacity: 0.85 });
  const add = (parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };

  const body = new THREE.Group();
  body.position.y = 1.0;
  g.add(body);
  // Carapace: a squashed, faceted egg with a rusted spine
  const shellMesh = add(body, new THREE.IcosahedronGeometry(0.5, 0), shell, 0, 0, 0);
  shellMesh.scale.set(1, 0.7, 1.4);
  for (let i = 0; i < 4; i++) add(body, new THREE.ConeGeometry(0.07, 0.25, 4), rust, 0, 0.32, -0.35 + i * 0.22, -0.3, 0, 0);
  // Head + single red eye + mandibles
  add(body, new THREE.BoxGeometry(0.42, 0.32, 0.36), shell, 0, 0.02, 0.68);
  add(body, new THREE.BoxGeometry(0.2, 0.14, 0.05), eye, 0, 0.06, 0.88);
  for (const sx of [-1, 1]) add(body, new THREE.ConeGeometry(0.05, 0.3, 3), bone, sx * 0.14, -0.14, 0.9, Math.PI / 2 + 0.3, 0, sx * 0.3);
  // Exhaust glow underneath (reads as "hovering")
  add(body, new THREE.CircleGeometry(0.22, 10).rotateX(Math.PI / 2), glow, 0, -0.34, -0.1);

  // Wings on hinges (pivot at the body)
  const wings: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.set(side * 0.38, 0.12, 0);
    body.add(hinge);
    // Bony finger struts + membrane panels
    const span = 1.3;
    for (let f = 0; f < 3; f++) {
      const z = 0.25 - f * 0.3;
      add(hinge, new THREE.BoxGeometry(span, 0.04, 0.05), bone, side * span / 2, 0, z, 0, side * (0.15 + f * 0.12), 0);
    }
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.3);
    shape.lineTo(span, 0.15);
    shape.lineTo(span * 0.9, -0.2);
    shape.lineTo(span * 0.55, -0.45);
    shape.lineTo(0, -0.35);
    shape.closePath();
    const memGeo = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
    if (side < 0) memGeo.scale(-1, 1, 1);
    add(hinge, memGeo, membrane, 0, -0.01, 0);
    wings.push(hinge);
  }

  // Hook claws dangling below
  for (const sx of [-0.18, 0.18]) {
    add(body, new THREE.BoxGeometry(0.04, 0.45, 0.04), rust, sx, -0.5, 0.1);
    add(body, new THREE.TorusGeometry(0.08, 0.025, 4, 8, Math.PI * 1.3), bone, sx, -0.75, 0.12, 0, Math.PI / 2, 0);
  }

  g.userData.wings = wings;
  g.userData.body = body;
  return g;
}

/** Flap + bob. `t` is time, `phase` de-syncs a flock. */
export function animateFlyer(model: THREE.Object3D, t: number, phase: number) {
  const wings = model.userData.wings as THREE.Group[] | undefined;
  const body = model.userData.body as THREE.Group | undefined;
  const flap = Math.sin(t * 16 + phase);
  if (wings) {
    wings[0].rotation.z = -flap * 0.7 - 0.1;
    wings[1].rotation.z = flap * 0.7 + 0.1;
  }
  if (body) {
    body.position.y = 1.0 + Math.sin(t * 16 + phase + 1.2) * 0.08;
    body.rotation.x = Math.sin(t * 2 + phase) * 0.08;
  }
}
