import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { applyHeroSkin, cloneModelWithUniqueMaterials } from '../game/assets';
import { SKIN_MAP } from '../game/config';
import { applyHeroOutfit, outfitAura } from '../game/heroOutfits';
import type { SkinId } from '../game/types';

/**
 * A small turntable of the hero wearing a skin: its own little WebGL view, rendered at low
 * resolution and scaled up with crisp pixels so it matches the game's look. Shows the skin's
 * ambient particles too (acid drips, phantom smoke, gold glints, hologram sparks).
 */

interface SkinPreviewProps {
  template: THREE.Group | null;
  skinId: SkinId;
  locked: boolean;
  className?: string;
}

const W = 150;
const H = 190;

export function SkinPreview({ template, skinId, locked, className = '' }: SkinPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !template) return;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
    renderer.setPixelRatio(1);
    renderer.setSize(W, H, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, W / H, 0.1, 50);
    camera.position.set(0, 1.45, 5.4);
    camera.lookAt(0, 1.0, 0);
    scene.add(new THREE.HemisphereLight(0xfff1e0, 0x2a1a1a, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(2, 4, 3);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xff5a3a, 1.6);
    rim.position.set(-3, 2, -3);
    scene.add(rim);

    const floor = new THREE.Mesh(new THREE.CircleGeometry(0.9, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.45 }));
    scene.add(floor);

    const hero = cloneModelWithUniqueMaterials(template);
    applyHeroSkin(hero, SKIN_MAP[skinId]);
    applyHeroOutfit(hero, skinId);
    scene.add(hero);

    // Ambient particles for the skin
    const aura = outfitAura(skinId);
    const COUNT = aura ? 26 : 0;
    const parts: { mesh: THREE.Mesh; life: number; vy: number }[] = [];
    if (aura) {
      const color = aura === 'acid' ? 0x7dff2a : aura === 'smoke' ? 0x2a2230 : aura === 'gold' ? 0xffe066 : 0x46d8ff;
      const geo = aura === 'smoke' ? new THREE.SphereGeometry(0.09, 6, 4) : new THREE.BoxGeometry(0.04, 0.04, 0.04);
      for (let i = 0; i < COUNT; i++) {
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false }));
        scene.add(m);
        parts.push({ mesh: m, life: Math.random(), vy: 0.3 + Math.random() * 0.5 });
      }
    }

    let raf = 0;
    const start = performance.now();
    let last = start;
    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const t = (now - start) / 1000;
      hero.rotation.y = t * 0.9;
      for (const p of parts) {
        p.life -= dt * 0.6;
        if (p.life <= 0) {
          p.life = 1;
          const a = Math.random() * Math.PI * 2;
          const r = 0.25 + Math.random() * 0.35;
          p.mesh.position.set(Math.cos(a) * r, 0.2 + Math.random() * 1.4, Math.sin(a) * r);
        }
        p.mesh.position.y += p.vy * dt;
        const m = p.mesh.material as THREE.MeshBasicMaterial;
        m.opacity = Math.sin(p.life * Math.PI) * (aura === 'smoke' ? 0.7 : 1);
        if (aura === 'smoke') p.mesh.scale.setScalar(1 + (1 - p.life) * 1.5);
      }
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose());
        }
      });
      renderer.dispose();
    };
  }, [template, skinId, locked]);

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className={className}
        style={{ imageRendering: 'pixelated', width: '100%', height: 'auto', aspectRatio: `${W} / ${H}` }}
        aria-hidden="true"
      />
      {locked && (
        <span className="absolute left-1/2 bottom-2 -translate-x-1/2 px-2 py-1 text-[11px] tracking-[0.12em] bg-black/80 text-[var(--px-muted)]">
          🔒 BLOQUEADA
        </span>
      )}
    </div>
  );
}
