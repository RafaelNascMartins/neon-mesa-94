import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { cloneModelWithUniqueMaterials } from '../game/assets';

/**
 * A small turntable of any model, rendered at low resolution and scaled up with crisp pixels.
 * Fits the model to the frame. `silhouette` paints it pure black (creatures not met yet).
 */

interface ModelPreviewProps {
  template: THREE.Object3D | null;
  silhouette?: boolean;
  width?: number;
  height?: number;
  /** Turntable speed (rad/s). */
  spin?: number;
  className?: string;
}

export function ModelPreview({ template, silhouette = false, width = 160, height = 160, spin = 0.8, className = '' }: ModelPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !template) return;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
    renderer.setPixelRatio(1);
    renderer.setSize(width, height, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 100);
    scene.add(new THREE.HemisphereLight(0xfff1e0, 0x2a1a1a, 1.7));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(2, 4, 3);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xff5a3a, 1.4);
    rim.position.set(-3, 2, -3);
    scene.add(rim);

    const model = cloneModelWithUniqueMaterials(template as THREE.Group);
    model.position.set(0, 0, 0);
    model.rotation.set(0, 0, 0);
    model.scale.setScalar(1);
    if (silhouette) {
      const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
      model.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.material = black;
      });
    }
    // Fit: centre on X/Z, feet on the floor, whole thing in frame
    const pivot = new THREE.Group();
    pivot.add(model);
    scene.add(pivot);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    model.position.set(-centre.x, -box.min.y, -centre.z);
    const h = Math.max(size.y, Math.max(size.x, size.z) * 0.8, 0.5);
    const dist = (h / 2 / Math.tan((camera.fov * Math.PI) / 360)) * 1.35;
    camera.position.set(0, h * 0.62, dist);
    camera.lookAt(0, h * 0.45, 0);

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(Math.max(size.x, size.z) * 0.55, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4 })
    );
    shadow.position.y = 0.01;
    scene.add(shadow);

    let raf = 0;
    const start = performance.now();
    const tick = () => {
      pivot.rotation.y = ((performance.now() - start) / 1000) * spin + 0.5;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => x.dispose());
      });
      renderer.dispose();
    };
  }, [template, silhouette, width, height, spin]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className={className}
      style={{ imageRendering: 'pixelated', width: '100%', height: 'auto', aspectRatio: `${width} / ${height}` }}
      aria-hidden="true"
    />
  );
}
