import { Suspense, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  ScrollControls,
  useScroll,
  Stars,
  Image,
  Text,
  useTexture
} from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import type { Photo } from "../types";

const tex = (name: string) => `${import.meta.env.BASE_URL}textures/${name}`;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/* ---------- Planets ---------- */

interface PlanetDef {
  name: string;
  map: string;
  position: [number, number, number];
  radius: number;
  spin: number;
  tilt?: number;
  ring?: { inner: number; outer: number; map: string };
  clouds?: boolean;
  moon?: { radius: number; distance: number; speed: number };
}

const SUN_POS: [number, number, number] = [-15, 5, 10];

const PLANETS: PlanetDef[] = [
  { name: "Mercury", map: "mercury.jpg", position: [7, -2, -6], radius: 0.9, spin: 0.12 },
  { name: "Venus", map: "venus.jpg", position: [-9, 3, -20], radius: 1.5, spin: 0.08, tilt: 0.05 },
  {
    name: "Earth",
    map: "earth.jpg",
    position: [8.5, -3, -34],
    radius: 1.7,
    spin: 0.32,
    tilt: 0.41,
    clouds: true,
    moon: { radius: 0.46, distance: 3.1, speed: 0.6 }
  },
  { name: "Mars", map: "mars.jpg", position: [-8.5, 2.4, -48], radius: 1.15, spin: 0.3, tilt: 0.44 },
  { name: "Jupiter", map: "jupiter.jpg", position: [12, 4.5, -66], radius: 4.4, spin: 0.5, tilt: 0.05 },
  {
    name: "Saturn",
    map: "saturn.jpg",
    position: [-13, -3.5, -86],
    radius: 3.6,
    spin: 0.45,
    tilt: 0.47,
    ring: { inner: 4.4, outer: 7.4, map: "saturn_ring.jpg" }
  },
  { name: "Uranus", map: "uranus.jpg", position: [9.5, 3.5, -104], radius: 2.3, spin: 0.3, tilt: 1.7 },
  { name: "Neptune", map: "neptune.jpg", position: [-10.5, -2.5, -122], radius: 2.2, spin: 0.32, tilt: 0.49 }
];

const NEPTUNE_Z = -122;

function SaturnRing({ inner, outer, map }: { inner: number; outer: number; map: string }) {
  const ringMap = useTexture(tex(map));
  const geometry = useMemo(() => {
    const g = new THREE.RingGeometry(inner, outer, 128);
    const pos = g.attributes.position;
    const uv = g.attributes.uv;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const r = v.length();
      uv.setXY(i, (r - inner) / (outer - inner), 0.5);
    }
    return g;
  }, [inner, outer]);
  return (
    <mesh geometry={geometry} rotation={[-Math.PI / 2 + 0.12, 0, 0]}>
      <meshStandardMaterial
        map={ringMap}
        side={THREE.DoubleSide}
        transparent
        opacity={0.92}
        roughness={1}
      />
    </mesh>
  );
}

function Planet({ def }: { def: PlanetDef }) {
  const map = useTexture(tex(def.map));
  const cloudMap = useTexture(tex(def.clouds ? "earth_clouds.jpg" : def.map));
  const bodyRef = useRef<THREE.Mesh>(null);
  const cloudRef = useRef<THREE.Mesh>(null);
  const moonPivot = useRef<THREE.Group>(null);

  useFrame((_, dt) => {
    if (bodyRef.current) bodyRef.current.rotation.y += def.spin * dt;
    if (cloudRef.current) cloudRef.current.rotation.y += def.spin * 1.35 * dt;
    if (moonPivot.current) moonPivot.current.rotation.y += (def.moon?.speed ?? 0) * dt;
  });

  return (
    <group position={def.position} rotation={[def.tilt ?? 0, 0, 0]}>
      <mesh ref={bodyRef}>
        <sphereGeometry args={[def.radius, 64, 64]} />
        <meshStandardMaterial map={map} roughness={1} metalness={0} />
      </mesh>

      {def.clouds && (
        <mesh ref={cloudRef} scale={1.02}>
          <sphereGeometry args={[def.radius, 48, 48]} />
          <meshStandardMaterial
            map={cloudMap}
            alphaMap={cloudMap}
            transparent
            opacity={0.55}
            depthWrite={false}
          />
        </mesh>
      )}

      {def.ring && <SaturnRing inner={def.ring.inner} outer={def.ring.outer} map={def.ring.map} />}

      {def.moon && (
        <group ref={moonPivot}>
          <mesh position={[def.moon.distance, 0, 0]}>
            <sphereGeometry args={[def.moon.radius, 32, 32]} />
            <MoonMaterial />
          </mesh>
        </group>
      )}
    </group>
  );
}

function MoonMaterial() {
  const map = useTexture(tex("moon.jpg"));
  return <meshStandardMaterial map={map} roughness={1} metalness={0} />;
}

function Sun() {
  const map = useTexture(tex("sun.jpg"));
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += 0.03 * dt;
  });
  return (
    <group position={SUN_POS}>
      <mesh ref={ref}>
        <sphereGeometry args={[6, 64, 64]} />
        <meshBasicMaterial map={map} color="#fff2cc" toneMapped={false} />
      </mesh>
      {/* warm glow shell */}
      <mesh scale={1.18}>
        <sphereGeometry args={[6, 32, 32]} />
        <meshBasicMaterial color="#ffcf6a" transparent opacity={0.18} side={THREE.BackSide} />
      </mesh>
      <pointLight intensity={3.2} distance={400} decay={0.4} color="#fff4dd" />
    </group>
  );
}

/* ---------- Photos floating in space ---------- */

interface PanelDef {
  photo: Photo;
  position: [number, number, number];
  index: number;
}

function PhotoPanel({ panel, onSelect }: { panel: PanelDef; onSelect: (i: number) => void }) {
  const groupRef = useRef<THREE.Group>(null);
  const { camera } = useThree();
  const w = 5.4;
  const h = 3.6;

  useFrame(() => {
    // Always face the camera so the photo reads head-on as you pass.
    if (groupRef.current) groupRef.current.lookAt(camera.position);
  });

  return (
    <group ref={groupRef} position={panel.position}>
      <mesh position={[0, 0, -0.06]}>
        <planeGeometry args={[w + 0.34, h + 0.34]} />
        <meshStandardMaterial color="#080a14" roughness={0.9} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0, -0.04]}>
        <planeGeometry args={[w + 0.2, h + 0.2]} />
        <meshBasicMaterial color="#8aa0ff" toneMapped={false} />
      </mesh>
      <Image
        url={panel.photo.url}
        scale={[w, h]}
        transparent
        onClick={(e) => {
          e.stopPropagation();
          onSelect(panel.index);
        }}
        onPointerOver={() => (document.body.style.cursor = "pointer")}
        onPointerOut={() => (document.body.style.cursor = "auto")}
      />
      <Text
        position={[0, -h / 2 - 0.5, 0]}
        font={`${import.meta.env.BASE_URL}fonts/SpaceGrotesk.ttf`}
        fontSize={0.32}
        letterSpacing={0.08}
        color="#eef1fb"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.004}
        outlineColor="#000"
        maxWidth={w + 1}
      >
        {panel.photo.title}
      </Text>
    </group>
  );
}

/* ---------- Camera rig ---------- */

const CAM_START = 22;

function Rig({ active, endZ }: { active: boolean; endZ: number }) {
  const scroll = useScroll();
  const { camera } = useThree();
  const warpStart = useRef<number | null>(null);
  const target = useMemo(() => new THREE.Vector3(0, 0, CAM_START), []);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;

    if (!active) {
      // Idle: a slow cinematic drift near the inner system, framing the sun.
      target.set(Math.sin(t * 0.12) * 3, 1.4 + Math.cos(t * 0.1) * 0.6, CAM_START);
      camera.position.lerp(target, 1 - Math.exp(-2 * dt));
      camera.lookAt(SUN_POS[0] * 0.25, 1, CAM_START - 18);
      return;
    }

    if (warpStart.current === null) warpStart.current = t;
    const e = t - warpStart.current;
    const warpPull = (1 - easeOutCubic(Math.min(1, e / 1.7))) * 46; // fly-in surge

    const offset = scroll.offset; // 0..1
    const baseZ = THREE.MathUtils.lerp(CAM_START, endZ, offset);
    target.set(
      Math.sin(offset * Math.PI * 3) * 2.4 + Math.sin(t * 0.15) * 0.5,
      Math.cos(offset * Math.PI * 2) * 1.3,
      baseZ + warpPull
    );
    const damp = e < 1.8 ? 6 : 3.2;
    camera.position.lerp(target, 1 - Math.exp(-damp * dt));
    camera.lookAt(camera.position.x * 0.4, camera.position.y * 0.4, camera.position.z - 12);
  });

  return null;
}

function MovingStars() {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.006;
  });
  return (
    <group ref={ref}>
      <Stars radius={260} depth={120} count={9000} factor={4.5} saturation={0} fade speed={0.6} />
    </group>
  );
}

/* ---------- Scene + Canvas ---------- */

function Scene({
  photos,
  active,
  onSelect
}: {
  photos: Photo[];
  active: boolean;
  onSelect: (i: number) => void;
}) {
  const panels = useMemo<PanelDef[]>(() => {
    if (photos.length === 0) return [];
    const top = -6;
    const bottom = NEPTUNE_Z + 8;
    const span = top - bottom;
    return photos.map((photo, i) => {
      const f = photos.length === 1 ? 0.18 : i / (photos.length - 1);
      const z = top - f * span;
      const side = i % 2 === 0 ? 1 : -1;
      return {
        photo,
        index: i,
        position: [side * 3.4, side * -0.8, z] as [number, number, number]
      };
    });
  }, [photos]);

  const endZ = NEPTUNE_Z - 14;

  return (
    <>
      <color attach="background" args={["#04050b"]} />
      <fog attach="fog" args={["#04050b", 60, 200]} />
      <ambientLight intensity={0.12} />
      <MovingStars />
      <Sun />
      {PLANETS.map((p) => (
        <Planet key={p.name} def={p} />
      ))}
      {panels.map((panel) => (
        <PhotoPanel key={panel.photo.id} panel={panel} onSelect={onSelect} />
      ))}
      <Rig active={active} endZ={endZ} />
    </>
  );
}

export default function Universe({
  photos,
  active,
  onSelect
}: {
  photos: Photo[];
  active: boolean;
  onSelect: (i: number) => void;
}) {
  const pages = Math.max(6, (CAM_START - (NEPTUNE_Z - 14)) / 13);

  return (
    <div className="universe">
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{ position: [0, 1.4, CAM_START], fov: 58, near: 0.1, far: 600 }}
      >
        <Suspense fallback={null}>
          <ScrollControls pages={pages} damping={0.28} enabled={active}>
            <Scene photos={photos} active={active} onSelect={onSelect} />
          </ScrollControls>
        </Suspense>
        <EffectComposer>
          <Bloom
            intensity={1.15}
            luminanceThreshold={0.55}
            luminanceSmoothing={0.2}
            mipmapBlur
          />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
