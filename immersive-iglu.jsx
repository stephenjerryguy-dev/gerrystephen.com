import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

const clamp01 = (value) => Math.min(1, Math.max(0, value));

function ease(value, start, end) {
  const normalized = clamp01((value - start) / Math.max(0.001, end - start));
  return normalized * normalized * (3 - 2 * normalized);
}

function angleDistance(a, b) {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

export function ImmersiveIglu({ progress = 0, mouse = { x: 0.5, y: 0.5 }, lite = false }) {
  const canvasRef = useRef(null);
  const stageRef = useRef(null);
  const motionRef = useRef({ progress, x: mouse.x, y: mouse.y, lite });

  useEffect(() => {
    motionRef.current = { progress, x: mouse.x, y: mouse.y, lite };
  }, [progress, mouse.x, mouse.y, lite]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!canvas || !stage) return undefined;

    const compact = window.matchMedia('(max-width: 700px), (pointer: coarse)').matches;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let renderer;

    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: !compact,
        powerPreference: 'high-performance',
      });
    } catch (_) {
      stage.dataset.webgl = 'failed';
      return undefined;
    }

    stage.dataset.webgl = 'ready';
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, compact ? 1.25 : 1.7));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.22;
    renderer.shadowMap.enabled = !compact;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(compact ? 44 : 38, 1, 0.1, 80);
    camera.position.set(0, 1.1, compact ? 13.8 : 14.8);

    scene.add(new THREE.HemisphereLight(0xf7fdff, 0x0f6970, 3.8));
    const key = new THREE.DirectionalLight(0xfff4d6, 6.2);
    key.position.set(-5, 9, 8);
    key.castShadow = !compact;
    key.shadow.mapSize.set(compact ? 512 : 1024, compact ? 512 : 1024);
    scene.add(key);
    const aqua = new THREE.PointLight(0x58eadb, 24, 20, 1.8);
    aqua.position.set(5, 1, 5);
    scene.add(aqua);
    const coral = new THREE.PointLight(0xff8b68, 18, 18, 1.8);
    coral.position.set(-5, -1, 3);
    scene.add(coral);

    const colors = [0xf8fdff, 0xdff8fa, 0xc5eef1, 0xaee5e4, 0xffd8af, 0xffa27e];
    const materials = colors.map((color, index) => new THREE.MeshPhysicalMaterial({
      color,
      roughness: index > 3 ? 0.48 : 0.32,
      metalness: 0.02,
      clearcoat: index > 3 ? 0.35 : 0.72,
      clearcoatRoughness: 0.24,
    }));
    const geometry = new RoundedBoxGeometry(1.06, 0.62, 0.72, compact ? 2 : 4, 0.14);
    const blocks = [];
    const rings = compact
      ? [
        { y: -1.65, r: 3.3, count: 14 },
        { y: -0.92, r: 3.05, count: 13 },
        { y: -0.18, r: 2.65, count: 11 },
        { y: 0.55, r: 2.15, count: 9 },
        { y: 1.24, r: 1.55, count: 7 },
        { y: 1.82, r: 0.86, count: 5 },
      ]
      : [
        { y: -1.65, r: 3.45, count: 17 },
        { y: -0.91, r: 3.2, count: 16 },
        { y: -0.16, r: 2.78, count: 14 },
        { y: 0.57, r: 2.3, count: 12 },
        { y: 1.27, r: 1.72, count: 9 },
        { y: 1.88, r: 1.02, count: 6 },
      ];

    const addBlock = (home, index, rotationY = 0) => {
      const material = materials[index % materials.length];
      const mesh = new THREE.Mesh(geometry, material);
      mesh.castShadow = !compact;
      mesh.receiveShadow = !compact;
      mesh.position.copy(home);
      mesh.rotation.y = rotationY;
      const radial = home.clone().setY(home.y * 0.35).normalize();
      const drift = home.clone().add(radial.multiplyScalar(2.2 + (index % 5) * 0.34));
      drift.y += Math.sin(index * 1.71) * 1.35 + 0.7;
      drift.z += Math.cos(index * 0.83) * 1.4;
      const side = index % 2 === 0 ? -1 : 1;
      const row = Math.floor(index / 2) % 9;
      const column = Math.floor(index / 18) % 3;
      const frame = new THREE.Vector3(
        side * (3.75 + column * 0.78),
        -2.75 + row * 0.7,
        0.5 - column * 0.62 + Math.sin(index) * 0.22,
      );
      scene.add(mesh);
      blocks.push({
        mesh,
        home,
        drift,
        frame,
        homeRotation: rotationY,
        phase: index * 0.73,
      });
    };

    rings.forEach((ring, ringIndex) => {
      for (let index = 0; index < ring.count; index += 1) {
        const angle = (index / ring.count) * Math.PI * 2 + (ringIndex % 2 ? 0.15 : 0);
        const opening = ringIndex < 3 && angleDistance(angle, Math.PI / 2) < (ringIndex === 0 ? 0.46 : 0.31);
        if (opening) continue;
        const home = new THREE.Vector3(Math.cos(angle) * ring.r, ring.y, Math.sin(angle) * ring.r * 0.74);
        addBlock(home, blocks.length, -angle + Math.PI / 2);
      }
    });

    const archCount = compact ? 9 : 11;
    for (let index = 0; index < archCount; index += 1) {
      const angle = Math.PI - (index / (archCount - 1)) * Math.PI;
      const home = new THREE.Vector3(Math.cos(angle) * 1.22, -1.48 + Math.sin(angle) * 1.62, 2.9);
      addBlock(home, blocks.length, -angle + Math.PI / 2);
    }

    const glow = new THREE.Mesh(
      new THREE.SphereGeometry(1.45, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0xffd5a8, transparent: true, opacity: 0.38 }),
    );
    glow.scale.set(1.25, 0.9, 0.65);
    glow.position.set(0, -0.88, 1.65);
    scene.add(glow);

    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(4.4, 5.1, 0.24, compact ? 28 : 52),
      new THREE.MeshPhysicalMaterial({ color: 0xd9f7f4, roughness: 0.42, clearcoat: 0.55, transparent: true }),
    );
    platform.position.y = -2.15;
    platform.receiveShadow = !compact;
    scene.add(platform);

    let frame = 0;
    let currentProgress = progress;
    const target = new THREE.Vector3();
    const lookAt = new THREE.Vector3(0, -0.1, 0);

    const resize = () => {
      const rect = stage.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      renderer.setSize(rect.width, rect.height, false);
      camera.aspect = rect.width / rect.height;
      camera.updateProjectionMatrix();
    };

    const render = () => {
      frame = window.requestAnimationFrame(render);
      const motion = motionRef.current;
      currentProgress += (motion.progress - currentProgress) * (reducedMotion ? 1 : 0.065);
      const p = clamp01(currentProgress);
      const separate = ease(p, 0.34, 0.7);
      const frameScene = ease(p, 0.68, 0.98);
      const elapsed = performance.now() * 0.001;

      blocks.forEach((block, index) => {
        target.copy(block.home).lerp(block.drift, separate).lerp(block.frame, frameScene);
        if (!reducedMotion) target.y += Math.sin(elapsed * 0.75 + block.phase) * 0.06 * separate;
        block.mesh.position.lerp(target, reducedMotion ? 1 : 0.09);
        block.mesh.rotation.y += ((block.homeRotation + separate * Math.sin(block.phase) * 0.5) - block.mesh.rotation.y) * 0.08;
        block.mesh.rotation.x += ((separate * Math.cos(block.phase) * 0.28) - block.mesh.rotation.x) * 0.08;
        block.mesh.scale.setScalar(1 - frameScene * (index % 7 === 0 ? 0.12 : 0));
      });

      const pointerX = (motion.x - 0.5) * (compact ? 0.5 : 1.35);
      const pointerY = (motion.y - 0.5) * (compact ? 0.25 : 0.72);
      const orbit = p * Math.PI * 0.36;
      camera.position.x += ((Math.sin(orbit) * 3.5 + pointerX) - camera.position.x) * 0.045;
      camera.position.y += ((1.05 + p * 0.8 - pointerY) - camera.position.y) * 0.045;
      camera.position.z += (((compact ? 13.8 : 14.8) - p * 2.2) - camera.position.z) * 0.045;
      lookAt.x += (pointerX * 0.22 - lookAt.x) * 0.05;
      lookAt.y += ((-0.2 + pointerY * 0.1) - lookAt.y) * 0.05;
      camera.lookAt(lookAt);
      scene.rotation.y = pointerX * 0.035;
      glow.material.opacity = 0.38 * (1 - separate * 0.72);
      platform.material.opacity = 1 - frameScene * 0.78;
      renderer.render(scene, camera);
    };

    resize();
    window.addEventListener('resize', resize);
    render();

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      geometry.dispose();
      materials.forEach((material) => material.dispose());
      glow.geometry.dispose();
      glow.material.dispose();
      platform.geometry.dispose();
      platform.material.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div ref={stageRef} className="immersive-iglu-stage" role="img" aria-label="Interactive block iglu that responds to scrolling and pointer movement">
      <canvas ref={canvasRef} className="immersive-iglu-canvas" aria-hidden="true" />
      <div className="immersive-iglu-fallback" aria-hidden="true" />
    </div>
  );
}
