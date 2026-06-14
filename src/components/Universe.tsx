import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  ScrollControls,
  useScroll,
  Stars,
  Image,
  Text,
  useTexture,
  useCubeTexture
} from "@react-three/drei";
import { EffectComposer, Bloom, GodRays } from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import * as THREE from "three";
import type { Photo } from "../types";

const tex = (name: string) => `${import.meta.env.BASE_URL}textures/${name}`;

// Load a texture and configure it for realistic colour + sharpness.
function useSpaceTexture(name: string): THREE.Texture {
  const texture = useTexture(tex(name));
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

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
  const ringMap = useSpaceTexture(map);
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
  const map = useSpaceTexture(def.map);
  const cloudMap = useSpaceTexture(def.clouds ? "earth_clouds.jpg" : def.map);
  const groupRef = useRef<THREE.Group>(null);
  const bodyRef = useRef<THREE.Mesh>(null);
  const cloudRef = useRef<THREE.Mesh>(null);
  const moonPivot = useRef<THREE.Group>(null);
  const phase = useMemo(() => Math.random() * Math.PI * 2, []);

  useFrame((state, dt) => {
    if (bodyRef.current) bodyRef.current.rotation.y += def.spin * dt;
    if (cloudRef.current) cloudRef.current.rotation.y += def.spin * 1.35 * dt;
    if (moonPivot.current) moonPivot.current.rotation.y += (def.moon?.speed ?? 0) * dt;
    if (groupRef.current) {
      // gentle drift so the worlds feel alive, not pinned in place
      const t = state.clock.elapsedTime;
      groupRef.current.position.x = def.position[0] + Math.sin(t * 0.12 + phase) * 0.5;
      groupRef.current.position.y = def.position[1] + Math.cos(t * 0.1 + phase) * 0.4;
    }
  });

  return (
    <group ref={groupRef} position={def.position} rotation={[def.tilt ?? 0, 0, 0]}>
      <mesh ref={bodyRef}>
        <sphereGeometry args={[def.radius, 64, 64]} />
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
  const map = useSpaceTexture("moon.jpg");
  return <meshStandardMaterial map={map} roughness={1} metalness={0} />;
}

// Flares / prominences erupting from the sun's surface.
function SolarProminences({ radius, count = 16 }: { radius: number; count?: number }) {
  const items = useMemo(() => {
    const arr = [];
    for (let i = 0; i < count; i++) {
      const y = 1 - (i / (count - 1)) * 2;
      const r = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = i * 2.399963; // golden angle → even spread
      const dir = new THREE.Vector3(Math.cos(theta) * r, y, Math.sin(theta) * r).normalize();
      const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      arr.push({
        position: dir.clone().multiplyScalar(radius * 0.98).toArray() as [number, number, number],
        quaternion: quat,
        phase: Math.random() * Math.PI * 2,
        speed: 0.5 + Math.random() * 1.4,
        len: 2.4 + Math.random() * 3.4
      });
    }
    return arr;
  }, [count, radius]);

  const groups = useRef<THREE.Group[]>([]);
  const mats = useRef<THREE.MeshBasicMaterial[]>([]);
  useFrame((state) => {
    const t = state.clock.elapsedTime;
    items.forEach((it, i) => {
      const g = groups.current[i];
      const m = mats.current[i];
      const pulse = 0.5 + 0.5 * Math.sin(t * it.speed + it.phase);
      if (g) g.scale.y = 0.35 + 0.85 * pulse;
      if (m) m.opacity = 0.2 + 0.6 * pulse;
    });
  });

  return (
    <>
      {items.map((it, i) => (
        <group
          key={i}
          position={it.position}
          quaternion={it.quaternion}
          ref={(el) => {
            if (el) groups.current[i] = el;
          }}
        >
          <mesh position={[0, it.len / 2, 0]}>
            <coneGeometry args={[0.6, it.len, 14, 1, true]} />
            <meshBasicMaterial
              ref={(el) => {
                if (el) mats.current[i] = el as THREE.MeshBasicMaterial;
              }}
              color="#ff7b1e"
              transparent
              opacity={0.5}
              side={THREE.DoubleSide}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        </group>
      ))}
    </>
  );
}

// 3D simplex noise (Ashima) for the procedural sun surface.
const SUN_NOISE_GLSL = `
vec3 mod289(vec3 x){return x - floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x - floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute( permute( permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
float fbm(vec3 p){
  float v = 0.0; float a = 0.5;
  for(int i=0;i<5;i++){ v += a*snoise(p); p *= 2.0; a *= 0.5; }
  return v;
}
`;

const SUN_VERT = `
varying vec3 vPos;
varying vec3 vNormal;
varying vec3 vView;
void main(){
  vPos = position;
  vNormal = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const SUN_FRAG = `
uniform float uTime;
varying vec3 vPos;
varying vec3 vNormal;
varying vec3 vView;
${SUN_NOISE_GLSL}
void main(){
  vec3 p = normalize(vPos);
  float t = uTime * 0.05;
  // domain-warped turbulence → roiling, detailed plasma
  vec3 q = p * 2.4;
  float warp = fbm(q + vec3(t, t * 0.7, -t));
  float n  = fbm(q + warp * 0.9 + vec3(t * 0.5, -t * 0.3, t * 0.4));
  float n2 = fbm(p * 7.5 + warp * 0.6 - vec3(t * 0.8, -t * 0.4, t * 0.6));
  float n3 = fbm(p * 16.0 - vec3(t * 1.1));
  float v = clamp((n * 0.55 + n2 * 0.32 + n3 * 0.13) * 0.5 + 0.5, 0.0, 1.0);
  vec3 deep = vec3(0.5, 0.08, 0.02);
  vec3 mid  = vec3(1.0, 0.40, 0.05);
  vec3 hot  = vec3(1.0, 0.82, 0.32);
  vec3 white= vec3(1.0, 0.98, 0.88);
  vec3 col = mix(deep, mid, smoothstep(0.16, 0.45, v));
  col = mix(col, hot, smoothstep(0.45, 0.72, v));
  col = mix(col, white, smoothstep(0.80, 0.97, v));
  // darker sunspots in the lowest troughs
  col *= 0.5 + 0.5 * smoothstep(0.05, 0.2, v);
  // bright chromosphere rim so it reads as a 3D sphere
  float fres = pow(1.0 - max(dot(normalize(-vView), vNormal), 0.0), 2.2);
  col += vec3(1.0, 0.5, 0.16) * fres * 0.85;
  gl_FragColor = vec4(col * 1.6, 1.0);
}
`;

function Sun({ onReady }: { onReady?: (mesh: THREE.Mesh | null) => void }) {
  const ref = useRef<THREE.Mesh | null>(null);
  const coronaRef = useRef<THREE.Mesh>(null);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 } },
        vertexShader: SUN_VERT,
        fragmentShader: SUN_FRAG,
        toneMapped: false
      }),
    []
  );
  useFrame((state, dt) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
    if (ref.current) ref.current.rotation.y += 0.02 * dt;
    if (coronaRef.current) {
      const p = 1 + Math.sin(state.clock.elapsedTime * 0.8) * 0.03;
      coronaRef.current.scale.setScalar(1.16 * p);
    }
  });
  return (
    <group position={SUN_POS}>
      {/* procedural plasma core */}
      <mesh
        ref={(m) => {
          ref.current = m;
          onReady?.(m);
        }}
      >
        <sphereGeometry args={[6, 128, 128]} />
        <primitive object={material} attach="material" />
      </mesh>
      {/* inner corona */}
      <mesh ref={coronaRef} scale={1.16}>
        <sphereGeometry args={[6, 48, 48]} />
        <meshBasicMaterial
          color="#ffae3c"
          transparent
          opacity={0.32}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      {/* outer glow halo */}
      <mesh scale={1.9}>
        <sphereGeometry args={[6, 32, 32]} />
        <meshBasicMaterial
          color="#ff8a1e"
          transparent
          opacity={0.1}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <SolarProminences radius={6} />
      <pointLight intensity={3.4} distance={420} decay={0.35} color="#fff4dd" />
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
      Math.sin(offset * Math.PI * 1.6) * 1.8 + Math.sin(t * 0.12) * 0.35,
      Math.cos(offset * Math.PI * 1.3) * 1.0 + Math.sin(t * 0.3) * 0.18,
      baseZ + warpPull
    );
    // Smooth, frame-rate-independent follow with a gentle warp-in ease.
    const damp = e < 1.6 ? 5 : 4.2;
    camera.position.lerp(target, 1 - Math.exp(-damp * dt));
    // Very subtle roll so it drifts rather than runs on rails.
    camera.up.set(Math.sin(t * 0.07) * 0.03, 1, 0);
    camera.lookAt(camera.position.x * 0.45, camera.position.y * 0.45, camera.position.z - 12);
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
      <Stars radius={240} depth={120} count={4500} factor={4} saturation={0} fade speed={0.4} />
    </group>
  );
}

// A real dark Milky Way cube map as the deep-space sky (stars + galactic band).
function SpaceBackground() {
  const { scene } = useThree();
  const cube = useCubeTexture(
    ["px.jpg", "nx.jpg", "py.jpg", "ny.jpg", "pz.jpg", "nz.jpg"],
    { path: `${import.meta.env.BASE_URL}textures/skybox/` }
  );
  useEffect(() => {
    cube.colorSpace = THREE.SRGBColorSpace;
    const prev = scene.background;
    scene.background = cube;
    return () => {
      scene.background = prev;
    };
  }, [cube, scene]);
  return null;
}

// Meteors that streak across and fade, respawning ahead of the camera.
function ShootingStars({ count = 6 }: { count?: number }) {
  const { camera } = useThree();
  const meshes = useRef<THREE.Mesh[]>([]);
  const meteors = useRef(
    Array.from({ length: count }, () => ({
      pos: new THREE.Vector3(),
      vel: new THREE.Vector3(),
      life: 0,
      max: 1,
      delay: Math.random() * 7
    }))
  );

  const respawn = (m: (typeof meteors.current)[number]) => {
    const cam = camera.position;
    m.pos.set(
      cam.x + (Math.random() * 2 - 1) * 55,
      cam.y + 18 + Math.random() * 22,
      cam.z - 25 - Math.random() * 70
    );
    m.vel.set(
      -(14 + Math.random() * 16) * (Math.random() > 0.5 ? 1 : -1),
      -(10 + Math.random() * 12),
      0
    );
    m.life = 0;
    m.max = 0.8 + Math.random() * 0.9;
    m.delay = Math.random() * 5;
  };

  useFrame((_, dt) => {
    meteors.current.forEach((m, i) => {
      const mesh = meshes.current[i];
      if (!mesh) return;
      // Lazily initialise each meteor relative to the camera.
      if (m.vel.lengthSq() === 0) {
        respawn(m);
        mesh.visible = false;
        return;
      }
      if (m.delay > 0) {
        m.delay -= dt;
        mesh.visible = false;
        return;
      }
      mesh.visible = true;
      m.life += dt;
      m.pos.addScaledVector(m.vel, dt);
      mesh.position.copy(m.pos);
      mesh.lookAt(m.pos.clone().add(m.vel));
      const k = Math.max(0, 1 - m.life / m.max);
      (mesh.material as THREE.MeshBasicMaterial).opacity = k;
      if (m.life >= m.max) respawn(m);
    });
  });

  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <mesh
          key={i}
          visible={false}
          ref={(el) => {
            if (el) meshes.current[i] = el;
          }}
        >
          <boxGeometry args={[0.04, 0.04, 3.2]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={1} toneMapped={false} />
        </mesh>
      ))}
    </>
  );
}

// Reusable solar-array wing (deep-blue cells on a thin frame).
function SolarWing({
  position,
  size = [2.6, 1.0]
}: {
  position: [number, number, number];
  size?: [number, number];
}) {
  return (
    <mesh position={position}>
      <boxGeometry args={[size[0], 0.03, size[1]]} />
      <meshStandardMaterial
        color="#16224d"
        emissive="#0c1740"
        emissiveIntensity={0.55}
        metalness={0.5}
        roughness={0.45}
      />
    </mesh>
  );
}

// A detailed International Space Station, lit by the sun.
function SpaceStation({
  position,
  scale = 1
}: {
  position: [number, number, number];
  scale?: number;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) {
      ref.current.rotation.y += dt * 0.1;
      ref.current.rotation.z += dt * 0.02;
    }
  });
  return (
    <group ref={ref} position={position} scale={scale} rotation={[0.32, 0.5, 0.14]}>
      {/* main truss */}
      <mesh>
        <boxGeometry args={[7, 0.18, 0.18]} />
        <meshStandardMaterial color="#b9bec8" metalness={0.75} roughness={0.4} />
      </mesh>
      {/* gold-foil core modules in a cross */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.34, 0.34, 2.6, 20]} />
        <meshStandardMaterial color="#c9a24c" metalness={0.85} roughness={0.32} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.28, 0.28, 2.0, 20]} />
        <meshStandardMaterial color="#d7b257" metalness={0.85} roughness={0.32} />
      </mesh>
      <mesh>
        <sphereGeometry args={[0.42, 20, 20]} />
        <meshStandardMaterial color="#cfd3da" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* white radiator panels */}
      <mesh position={[0, 0.05, 0.95]} rotation={[0.2, 0, 0]}>
        <boxGeometry args={[1.5, 0.02, 0.9]} />
        <meshStandardMaterial color="#eef0f4" metalness={0.2} roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.05, -0.95]} rotation={[-0.2, 0, 0]}>
        <boxGeometry args={[1.5, 0.02, 0.9]} />
        <meshStandardMaterial color="#eef0f4" metalness={0.2} roughness={0.7} />
      </mesh>
      {/* solar arrays at both ends of the truss */}
      <SolarWing position={[3.0, 0, 1.25]} />
      <SolarWing position={[3.0, 0, -1.25]} />
      <SolarWing position={[-3.0, 0, 1.25]} />
      <SolarWing position={[-3.0, 0, -1.25]} />
      {/* antenna dish */}
      <mesh position={[0, 0.7, 0.5]} rotation={[Math.PI / 2.4, 0, 0]}>
        <sphereGeometry args={[0.36, 18, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#dfe2e7" metalness={0.5} roughness={0.5} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// A small detailed satellite with gold body, solar wings and a dish.
function Satellite({
  position,
  scale = 1,
  spin = 0.3
}: {
  position: [number, number, number];
  scale?: number;
  spin?: number;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (ref.current) {
      ref.current.rotation.y += dt * spin;
      ref.current.rotation.x += dt * spin * 0.35;
    }
  });
  return (
    <group ref={ref} position={position} scale={scale} rotation={[0.4, 0.6, 0.2]}>
      {/* gold-foil body */}
      <mesh>
        <boxGeometry args={[0.7, 0.7, 1.0]} />
        <meshStandardMaterial color="#c8a24a" metalness={0.88} roughness={0.28} />
      </mesh>
      {/* connecting boom */}
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.03, 0.03, 2.1, 8]} />
        <meshStandardMaterial color="#888d98" metalness={0.6} roughness={0.4} />
      </mesh>
      {/* solar wings */}
      <SolarWing position={[1.15, 0, 0]} size={[1.4, 0.7]} />
      <SolarWing position={[-1.15, 0, 0]} size={[1.4, 0.7]} />
      {/* dish antenna */}
      <mesh position={[0, 0.5, 0.1]} rotation={[Math.PI / 2, 0, 0]}>
        <sphereGeometry args={[0.3, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#e3e6ea" metalness={0.45} roughness={0.5} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

// A stylized Space Shuttle orbiter drifting through the scene.
function SpaceShuttle({
  position,
  scale = 1
}: {
  position: [number, number, number];
  scale?: number;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state, dt) => {
    if (ref.current) {
      ref.current.rotation.y += dt * 0.06;
      ref.current.position.y =
        position[1] + Math.sin(state.clock.elapsedTime * 0.4) * 0.4;
    }
  });
  return (
    <group ref={ref} position={position} scale={scale} rotation={[0.2, -0.6, 0.1]}>
      {/* fuselage */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.42, 0.5, 3.4, 20]} />
        <meshStandardMaterial color="#eef1f6" metalness={0.2} roughness={0.6} />
      </mesh>
      {/* nose cone */}
      <mesh position={[0, 0, 1.95]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.42, 0.9, 20]} />
        <meshStandardMaterial color="#2b2f38" metalness={0.3} roughness={0.5} />
      </mesh>
      {/* delta wings */}
      <mesh position={[0, -0.18, -0.6]}>
        <boxGeometry args={[3.4, 0.08, 1.7]} />
        <meshStandardMaterial color="#e7eaf0" metalness={0.2} roughness={0.6} />
      </mesh>
      {/* tail fin */}
      <mesh position={[0, 0.5, -1.4]}>
        <boxGeometry args={[0.08, 1.0, 0.8]} />
        <meshStandardMaterial color="#e7eaf0" metalness={0.2} roughness={0.6} />
      </mesh>
    </group>
  );
}

// Faint particles spread along the route that stream past for a floating feel.
function SpaceDust() {
  const ref = useRef<THREE.Points>(null);
  const geometry = useMemo(() => {
    const count = 1000;
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
  onSelect,
  onSunReady
}: {
  photos: Photo[];
  active: boolean;
  onSelect: (i: number) => void;
  onSunReady: (mesh: THREE.Mesh | null) => void;
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
      <color attach="background" args={["#03040a"]} />
      <fog attach="fog" args={["#03040a", 110, 300]} />
      <ResponsiveCamera />
      <SpaceBackground />
      <ambientLight intensity={0.16} />
      <MovingStars />
      <SpaceDust />
      <ShootingStars count={6} />
      <Sun onReady={onSunReady} />
      {PLANETS.map((p) => (
        <Planet key={p.name} def={p} />
      ))}
      <SpaceStation position={[5, 1.4, -30]} scale={0.95} />
      <SpaceShuttle position={[-4.5, -0.6, -44]} scale={0.85} />
      <Satellite position={[-7, 2.6, -15]} scale={0.7} spin={0.4} />
      <Satellite position={[10.5, -2.2, -58]} scale={0.95} spin={0.22} />
      <Satellite position={[-8.5, 3, -98]} scale={0.8} spin={0.32} />
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
  const [sunMesh, setSunMesh] = useState<THREE.Mesh | null>(null);

  return (
    <div className="universe">
      <Canvas
        dpr={[1, 1.5]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{ position: [0, 1.4, CAM_START], fov: 58, near: 0.1, far: 600 }}
      >
        <Suspense fallback={null}>
          <ScrollControls pages={pages} damping={0.32} enabled={active}>
            <Scene
              photos={photos}
              active={active}
              onSelect={onSelect}
              onSunReady={setSunMesh}
            />
          </ScrollControls>
        </Suspense>
        <EffectComposer>
          {(sunMesh
            ? [
                <GodRays
                  key="godrays"
                  sun={sunMesh}
                  blendFunction={BlendFunction.SCREEN}
                  samples={45}
                  density={0.94}
                  decay={0.92}
                  weight={0.42}
                  exposure={0.42}
                  clampMax={1}
                  blur
                />
              ]
            : []) as unknown as JSX.Element}
          <Bloom
            intensity={1.2}
            luminanceThreshold={0.5}
            luminanceSmoothing={0.2}
            mipmapBlur
          />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
