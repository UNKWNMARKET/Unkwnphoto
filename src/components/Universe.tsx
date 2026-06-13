import { Suspense, useEffect, useMemo, useRef } from "react";
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
  bump?: number;
  ring?: { inner: number; outer: number; map: string };
  clouds?: boolean;
  atmosphere?: { color: string; intensity: number };
  moon?: { radius: number; distance: number; speed: number };
}

const SUN_POS: [number, number, number] = [-15, 5, 10];

const PLANETS: PlanetDef[] = [
  { name: "Mercury", map: "mercury.jpg", position: [7, -2, -6], radius: 0.9, spin: 0.12, bump: 0.045 },
  {
    name: "Venus",
    map: "venus.jpg",
    position: [-9, 3, -20],
    radius: 1.5,
    spin: 0.08,
    tilt: 0.05,
    bump: 0.02,
    atmosphere: { color: "#e8c98a", intensity: 0.7 }
  },
  {
    name: "Earth",
    map: "earth.jpg",
    position: [8.5, -3, -34],
    radius: 1.7,
    spin: 0.32,
    tilt: 0.41,
    bump: 0.05,
    clouds: true,
    atmosphere: { color: "#5b9bff", intensity: 1.25 },
    moon: { radius: 0.46, distance: 3.1, speed: 0.6 }
  },
  { name: "Mars", map: "mars.jpg", position: [-8.5, 2.4, -48], radius: 1.15, spin: 0.3, tilt: 0.44, bump: 0.06, atmosphere: { color: "#e0875a", intensity: 0.5 } },
  { name: "Jupiter", map: "jupiter.jpg", position: [12, 4.5, -66], radius: 4.4, spin: 0.5, tilt: 0.05, atmosphere: { color: "#d9b98c", intensity: 0.45 } },
  {
    name: "Saturn",
    map: "saturn.jpg",
    position: [-13, -3.5, -86],
    radius: 3.6,
    spin: 0.45,
    tilt: 0.47,
    ring: { inner: 4.4, outer: 7.4, map: "saturn_ring.jpg" }
  },
  { name: "Uranus", map: "uranus.jpg", position: [9.5, 3.5, -104], radius: 2.3, spin: 0.3, tilt: 1.7, atmosphere: { color: "#9fe6ea", intensity: 0.8 } },
  { name: "Neptune", map: "neptune.jpg", position: [-10.5, -2.5, -122], radius: 2.2, spin: 0.32, tilt: 0.49, atmosphere: { color: "#5a78ff", intensity: 0.95 } }
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

// Fresnel rim shell that reads as a planet's atmosphere/limb glow.
function makeAtmosphereMaterial(color: string, intensity: number) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: intensity }
    },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = mv.xyz;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      uniform vec3 uColor;
      uniform float uIntensity;
      void main() {
        vec3 viewDir = normalize(-vView);
        float rim = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 3.0);
        gl_FragColor = vec4(uColor, rim * uIntensity);
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false
  });
}

function Atmosphere({
  radius,
  color,
  intensity
}: {
  radius: number;
  color: string;
  intensity: number;
}) {
  const material = useMemo(
    () => makeAtmosphereMaterial(color, intensity),
    [color, intensity]
  );
  return (
    <mesh scale={1.14}>
      <sphereGeometry args={[radius, 48, 48]} />
      <primitive object={material} attach="material" />
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
        <sphereGeometry args={[def.radius, 96, 96]} />
        <meshStandardMaterial
          map={map}
          bumpMap={def.bump ? map : undefined}
          bumpScale={def.bump ?? 0}
          roughness={1}
          metalness={0}
        />
      </mesh>

      {def.atmosphere && (
        <Atmosphere
          radius={def.radius}
          color={def.atmosphere.color}
          intensity={def.atmosphere.intensity}
        />
      )}

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

function roundedRectGeometry(w: number, h: number, r: number) {
  const x = -w / 2;
  const y = -h / 2;
  const s = new THREE.Shape();
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return new THREE.ShapeGeometry(s, 24);
}

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
  const backing = useMemo(() => roundedRectGeometry(w + 0.34, h + 0.34, 0.42), []);
  const border = useMemo(() => roundedRectGeometry(w + 0.18, h + 0.18, 0.36), []);

  useFrame(() => {
    // Always face the camera so the photo reads head-on as you pass.
    if (groupRef.current) groupRef.current.lookAt(camera.position);
  });

  return (
    <group ref={groupRef} position={panel.position}>
      <mesh geometry={backing} position={[0, 0, -0.06]}>
        <meshStandardMaterial color="#080a14" roughness={0.9} metalness={0.1} />
      </mesh>
      <mesh geometry={border} position={[0, 0, -0.04]}>
        <meshBasicMaterial color="#8aa0ff" toneMapped={false} />
      </mesh>
      <Image
        url={panel.photo.url}
        scale={[w, h]}
        radius={0.28}
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
      Math.cos(offset * Math.PI * 2) * 1.3 + Math.sin(t * 0.4) * 0.25,
      baseZ + warpPull
    );
    const damp = e < 1.8 ? 6 : 3.2;
    camera.position.lerp(target, 1 - Math.exp(-damp * dt));
    // Gentle roll so the camera feels like it's drifting, not on rails.
    camera.up.set(Math.sin(t * 0.09) * 0.05, 1, 0);
    camera.lookAt(camera.position.x * 0.4, camera.position.y * 0.4, camera.position.z - 12);
  });

  return null;
}

function ResponsiveCamera() {
  const { camera, size } = useThree();
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = size.width / size.height;
    // Portrait phones have a narrow horizontal FOV; widen it so the planets
    // and photo panels off to the sides stay on screen.
    cam.fov = aspect < 1 ? Math.min(96, 58 / Math.max(aspect, 0.42)) : 58;
    cam.updateProjectionMatrix();
  }, [camera, size.width, size.height]);
  return null;
}

function MovingStars() {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.006;
  });
  return (
    <group ref={ref}>
      <Stars radius={240} depth={120} count={6000} factor={4} saturation={0} fade speed={0.5} />
    </group>
  );
}

// Real Milky Way panorama wrapped around the whole scene as deep-space sky.
function MilkyWay() {
  const map = useTexture(tex("milkyway.jpg"));
  map.colorSpace = THREE.SRGBColorSpace;
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.0015;
  });
  return (
    <mesh ref={ref} scale={[-1, 1, 1]}>
      <sphereGeometry args={[420, 64, 64]} />
      <meshBasicMaterial
        map={map}
        side={THREE.BackSide}
        color="#7c84a0"
        toneMapped={false}
        depthWrite={false}
        fog={false}
      />
    </mesh>
  );
}

// Faint particles spread along the route that stream past for a floating feel.
function SpaceDust() {
  const ref = useRef<THREE.Points>(null);
  const geometry = useMemo(() => {
    const count = 1400;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() * 2 - 1) * 44;
      positions[i * 3 + 1] = (Math.random() * 2 - 1) * 32;
      positions[i * 3 + 2] = 30 - Math.random() * 180;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, []);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.z += dt * 0.012;
  });
  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial
        size={0.07}
        color="#aebbd6"
        transparent
        opacity={0.5}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
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
      <fog attach="fog" args={["#04050b", 90, 260]} />
      <ResponsiveCamera />
      <ambientLight intensity={0.14} />
      <MilkyWay />
      <MovingStars />
      <SpaceDust />
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
