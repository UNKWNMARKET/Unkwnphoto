import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Environment,
  MeshReflectorMaterial,
  ContactShadows,
  useTexture,
  Text
} from "@react-three/drei";
import * as THREE from "three";
import { Water } from "three/examples/jsm/objects/Water.js";
import type { Photo } from "../types";

const BASE = import.meta.env.BASE_URL;
const HDRI = `${BASE}textures/ocean.hdr`;
const FONT = `${BASE}fonts/SpaceGrotesk.ttf`;

/* ---------- Building dimensions ---------- */
const HALF_W = 5.5; // glass curtain wall at +x, art wall at -x
const ROOM_H = 4.4;
const ROOM_LEN = 7.5; // one room per 3 photos, chained along -z
const FRONT_Z = 5.2;
const EYE = 1.6;
const PER_ROOM = 3;
const DOOR_HALF = 1.3; // doorway half-width in the dividing walls
const WATER_Y = -1.1;

// Morning sun, low over the water, shining in through the glass.
const SUN_POS = new THREE.Vector3(16, 7.5, -4);

interface Layout {
  rooms: number;
  backZ: number;
  length: number;
  centerZ: number;
  dividers: number[]; // z of each internal dividing wall
}

function layoutFor(count: number): Layout {
  const rooms = Math.max(1, Math.ceil(count / PER_ROOM));
  const backZ = FRONT_Z - rooms * ROOM_LEN;
  const dividers: number[] = [];
  for (let i = 1; i < rooms; i++) dividers.push(FRONT_Z - i * ROOM_LEN);
  return {
    rooms,
    backZ,
    length: FRONT_Z - backZ,
    centerZ: (FRONT_Z + backZ) / 2,
    dividers
  };
}

/* ---------- A framed photograph on the long art wall ---------- */
function Artwork({
  photo,
  index,
  z,
  onSelect
}: {
  photo: Photo;
  index: number;
  z: number;
  onSelect: (i: number) => void;
}) {
  const tex = useTexture(photo.url);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const img = tex.image as HTMLImageElement | undefined;
  const aspect = img && img.width && img.height ? img.width / img.height : 1.5;

  let w = 2.0;
  let h = w / aspect;
  const MAX_H = 1.55;
  if (h > MAX_H) {
    h = MAX_H;
    w = MAX_H * aspect;
  }

  const spotRef = useRef<THREE.SpotLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);
  useEffect(() => {
    if (spotRef.current && targetRef.current) {
      spotRef.current.target = targetRef.current;
    }
  }, []);

  return (
    <group position={[-HALF_W + 0.06, EYE + 0.2, z]} rotation={[0, Math.PI / 2, 0]}>
      {/* lacquered slim frame */}
      <mesh position={[0, 0, -0.02]} castShadow>
        <boxGeometry args={[w + 0.14, h + 0.14, 0.07]} />
        <meshPhysicalMaterial
          color="#111116"
          clearcoat={1}
          clearcoatRoughness={0.18}
          roughness={0.42}
          metalness={0.25}
        />
      </mesh>
      {/* archival mat */}
      <mesh position={[0, 0, 0.019]}>
        <planeGeometry args={[w + 0.06, h + 0.06]} />
        <meshStandardMaterial color="#f5f1e8" roughness={0.96} />
      </mesh>
      {/* the print — unlit so its colours stay true */}
      <mesh
        position={[0, 0, 0.028]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(index);
        }}
        onPointerOver={() => (document.body.style.cursor = "pointer")}
        onPointerOut={() => (document.body.style.cursor = "auto")}
      >
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>

      {/* gallery spot washing the piece */}
      <spotLight
        ref={spotRef}
        position={[0, ROOM_H - EYE - 0.5, 1.7]}
        angle={0.55}
        penumbra={0.9}
        intensity={5}
        distance={7}
        decay={1.8}
        color="#fff1dc"
      />
      <object3D ref={targetRef} position={[0, 0, 0]} />

      <Text
        position={[0, -h / 2 - 0.24, 0.03]}
        font={FONT}
        fontSize={0.068}
        letterSpacing={0.08}
        color="#43434a"
        anchorX="center"
        anchorY="middle"
        maxWidth={w + 0.5}
      >
        {photo.title.toUpperCase()}
      </Text>
    </group>
  );
}

/* ---------- Real animated ocean (three.js Water) ---------- */
function Ocean() {
  const normals = useTexture(`${BASE}textures/floor_normal.jpg`);
  normals.wrapS = normals.wrapT = THREE.RepeatWrapping;

  const water = useMemo(() => {
    const geo = new THREE.PlaneGeometry(3000, 3000);
    const w = new Water(geo, {
      textureWidth: 384,
      textureHeight: 384,
      waterNormals: normals,
      sunDirection: SUN_POS.clone().normalize(),
      sunColor: 0xfff0da,
      waterColor: 0x0b4d63,
      distortionScale: 3.2,
      fog: false
    });
    w.rotation.x = -Math.PI / 2;
    w.position.y = WATER_Y;
    return w;
  }, [normals]);

  useEffect(() => () => {
    water.geometry.dispose();
    (water.material as THREE.ShaderMaterial).dispose();
  }, [water]);

  useFrame((_, dt) => {
    (water.material as THREE.ShaderMaterial).uniforms.time.value += dt * 0.55;
  });

  return <primitive object={water} />;
}

/* ---------- Sailboats drifting past ---------- */
function Sail({ h, back }: { h: number; back: number }) {
  // right triangle: mast edge vertical, foot sweeping back
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const v = new Float32Array([0, 0, 0, 0, h, 0, back, 0, 0]);
    g.setAttribute("position", new THREE.BufferAttribute(v, 3));
    g.computeVertexNormals();
    return g;
  }, [h, back]);
  return (
    <mesh geometry={geo}>
      <meshStandardMaterial color="#f7f4ec" roughness={0.7} side={THREE.DoubleSide} />
    </mesh>
  );
}

function Boat({
  x,
  z0,
  drift,
  speed,
  phase,
  scale
}: {
  x: number;
  z0: number;
  drift: number; // how far it travels along z before looping
  speed: number;
  phase: number;
  scale: number;
}) {
  const ref = useRef<THREE.Group>(null);
  useFrame((state) => {
    const t = state.clock.elapsedTime + phase * 40;
    const g = ref.current;
    if (!g) return;
    // slow drift with a soft turn-around at the ends
    const p = (t * speed) % (drift * 2);
    const along = p < drift ? p : drift * 2 - p;
    const dir = p < drift ? 1 : -1;
    g.position.set(x, WATER_Y + 0.1 + Math.sin(t * 1.1) * 0.05, z0 + along - drift / 2);
    g.rotation.y = dir > 0 ? 0 : Math.PI;
    g.rotation.z = Math.sin(t * 0.8) * 0.045;
    g.rotation.x = Math.sin(t * 1.3 + 1) * 0.03;
  });
  return (
    <group ref={ref} scale={scale}>
      {/* hull */}
      <mesh position={[0, 0.12, 0]} scale={[1, 0.42, 0.62]}>
        <sphereGeometry args={[1.1, 20, 12]} />
        <meshStandardMaterial color="#20242c" roughness={0.5} metalness={0.15} />
      </mesh>
      <mesh position={[0, 0.32, 0]} scale={[0.92, 0.14, 0.5]}>
        <sphereGeometry args={[1.1, 16, 10]} />
        <meshStandardMaterial color="#e9e4d8" roughness={0.7} />
      </mesh>
      {/* mast */}
      <mesh position={[0.1, 1.75, 0]}>
        <cylinderGeometry args={[0.025, 0.035, 2.9, 8]} />
        <meshStandardMaterial color="#8b857a" roughness={0.6} />
      </mesh>
      {/* main + jib */}
      <group position={[0.08, 0.5, 0]} rotation={[0, -Math.PI / 2, 0]}>
        <Sail h={2.5} back={1.15} />
      </group>
      <group position={[0.12, 0.6, 0]} rotation={[0, Math.PI / 2, 0]}>
        <Sail h={1.9} back={0.85} />
      </group>
    </group>
  );
}

function Boats() {
  return (
    <>
      <Boat x={HALF_W + 14} z0={-6} drift={30} speed={0.55} phase={0} scale={1} />
      <Boat x={HALF_W + 30} z0={4} drift={44} speed={0.8} phase={1.7} scale={1.15} />
      <Boat x={HALF_W + 52} z0={-14} drift={60} speed={1.05} phase={3.1} scale={1.3} />
    </>
  );
}

/* ---------- Visitors ---------- */
interface Wardrobe {
  coat: string;
  pants: string;
  skin: string;
  hair: string;
}
const WARDROBES: Wardrobe[] = [
  { coat: "#2b2d36", pants: "#1b1c21", skin: "#c9a181", hair: "#241d16" },
  { coat: "#6b5230", pants: "#26221d", skin: "#b98d6d", hair: "#171310" },
  { coat: "#39414e", pants: "#20242b", skin: "#d4ab8a", hair: "#3a2c1c" },
  { coat: "#5d5a52", pants: "#211f1c", skin: "#a97c5f", hair: "#100d0b" },
  { coat: "#403036", pants: "#1d181b", skin: "#cfa585", hair: "#2b2019" }
];

function Person({
  mode,
  position,
  faceYaw,
  phase,
  wardrobe,
  walkPath
}: {
  mode: "stand" | "talk" | "walk";
  position: [number, number, number];
  faceYaw: number;
  phase: number;
  wardrobe: Wardrobe;
  walkPath?: { zFrom: number; zTo: number; speed: number };
}) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const legL = useRef<THREE.Group>(null);
  const legR = useRef<THREE.Group>(null);
  const armL = useRef<THREE.Group>(null);
  const armR = useRef<THREE.Group>(null);
  const heading = useRef(faceYaw);

  useFrame((state) => {
    const t = state.clock.elapsedTime + phase * 13.7;
    const g = root.current;
    if (!g) return;

    if (mode === "walk" && walkPath) {
      // ping-pong stroll between zFrom and zTo, turning smoothly at each end
      const span = Math.abs(walkPath.zTo - walkPath.zFrom);
      const outboundSign = Math.sign(walkPath.zTo - walkPath.zFrom);
      const p = (t * walkPath.speed) % (span * 2);
      const along = p < span ? p : span * 2 - p;
      const movingSign = p < span ? outboundSign : -outboundSign;
      g.position.set(position[0], 0, walkPath.zFrom + outboundSign * along);
      const targetYaw = movingSign < 0 ? 0 : Math.PI; // faces −z at yaw 0
      heading.current += (targetYaw - heading.current) * 0.06;
      g.rotation.y = heading.current;
      // gait
      const step = Math.sin(t * 2.9);
      if (legL.current) legL.current.rotation.x = step * 0.38;
      if (legR.current) legR.current.rotation.x = -step * 0.38;
      if (armL.current) armL.current.rotation.x = -step * 0.24;
      if (armR.current) armR.current.rotation.x = step * 0.24;
      if (body.current) body.current.position.y = Math.abs(Math.cos(t * 2.9)) * 0.028;
      if (head.current) head.current.rotation.y = Math.sin(t * 0.5) * 0.25;
      return;
    }

    // standing / talking: planted feet, weight shift, living head
    g.position.set(position[0], 0, position[2]);
    g.rotation.y = faceYaw + Math.sin(t * 0.22) * 0.05;
    if (body.current) {
      body.current.position.y = Math.sin(t * 1.05) * 0.012;
      body.current.rotation.z = Math.sin(t * 0.3) * 0.02;
    }
    if (legL.current) legL.current.rotation.x = 0;
    if (legR.current) legR.current.rotation.x = 0;
    if (head.current) {
      head.current.rotation.y =
        mode === "talk"
          ? Math.sin(t * 0.4) * 0.45 // turning between the art and their companion
          : Math.sin(t * 0.3) * 0.22;
      head.current.rotation.x = 0.06 + Math.sin(t * 0.7) * 0.03;
    }
    if (armR.current) {
      // occasional gesture while talking
      armR.current.rotation.x =
        mode === "talk" ? -0.15 + Math.max(0, Math.sin(t * 0.9)) * -0.45 : -0.04;
    }
    if (armL.current) armL.current.rotation.x = -0.04;
  });

  return (
    <group ref={root} position={position} rotation={[0, faceYaw, 0]}>
      <group ref={body}>
        {/* legs, pivoted at the hip, with shoes */}
        {([-0.11, 0.11] as const).map((hx, i) => (
          <group key={i} ref={i === 0 ? legL : legR} position={[hx, 0.92, 0]}>
            <mesh position={[0, -0.44, 0]} castShadow>
              <capsuleGeometry args={[0.07, 0.66, 4, 10]} />
              <meshStandardMaterial color={wardrobe.pants} roughness={0.92} />
            </mesh>
            <mesh position={[0, -0.885, -0.045]} castShadow>
              <boxGeometry args={[0.11, 0.07, 0.26]} />
              <meshStandardMaterial color="#141216" roughness={0.55} />
            </mesh>
          </group>
        ))}
        {/* hips join the legs to the coat */}
        <mesh position={[0, 0.93, 0]} castShadow>
          <capsuleGeometry args={[0.15, 0.1, 4, 12]} />
          <meshStandardMaterial color={wardrobe.pants} roughness={0.92} />
        </mesh>
        {/* torso — slightly broader at the shoulders */}
        <mesh position={[0, 1.19, 0]} scale={[1.15, 1, 0.82]} castShadow>
          <capsuleGeometry args={[0.16, 0.46, 6, 14]} />
          <meshStandardMaterial color={wardrobe.coat} roughness={0.88} />
        </mesh>
        {/* arms, pivoted at the shoulder */}
        <group ref={armL} position={[-0.245, 1.4, 0]} rotation={[0, 0, 0.1]}>
          <mesh position={[0, -0.3, 0]} castShadow>
            <capsuleGeometry args={[0.05, 0.48, 4, 8]} />
            <meshStandardMaterial color={wardrobe.coat} roughness={0.88} />
          </mesh>
          <mesh position={[0, -0.58, 0]} castShadow>
            <sphereGeometry args={[0.045, 10, 8]} />
            <meshStandardMaterial color={wardrobe.skin} roughness={0.8} />
          </mesh>
        </group>
        <group ref={armR} position={[0.245, 1.4, 0]} rotation={[0, 0, -0.1]}>
          <mesh position={[0, -0.3, 0]} castShadow>
            <capsuleGeometry args={[0.05, 0.48, 4, 8]} />
            <meshStandardMaterial color={wardrobe.coat} roughness={0.88} />
          </mesh>
          <mesh position={[0, -0.58, 0]} castShadow>
            <sphereGeometry args={[0.045, 10, 8]} />
            <meshStandardMaterial color={wardrobe.skin} roughness={0.8} />
          </mesh>
        </group>
        {/* neck + head + hair */}
        <mesh position={[0, 1.53, 0]} castShadow>
          <cylinderGeometry args={[0.045, 0.055, 0.09, 10]} />
          <meshStandardMaterial color={wardrobe.skin} roughness={0.8} />
        </mesh>
        <group ref={head} position={[0, 1.64, 0]}>
          <mesh scale={[0.92, 1.06, 0.96]} castShadow>
            <sphereGeometry args={[0.112, 18, 16]} />
            <meshStandardMaterial color={wardrobe.skin} roughness={0.75} />
          </mesh>
          {/* hair cap sits at the back of the head (face looks along −z) */}
          <mesh position={[0, 0.042, 0.016]} scale={[0.98, 0.85, 1.02]}>
            <sphereGeometry args={[0.112, 18, 14]} />
            <meshStandardMaterial color={wardrobe.hair} roughness={0.95} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

function Visitors({
  layout,
  hung
}: {
  layout: Layout;
  hung: { z: number }[];
}) {
  const people = useMemo(() => {
    const out: JSX.Element[] = [];
    // a chatting pair in front of the 2nd piece of room 0
    if (hung[1]) {
      const z = hung[1].z;
      out.push(
        <Person
          key="talk-a"
          mode="talk"
          position={[-3.4, 0, z - 0.42]}
          faceYaw={Math.PI / 2 + 0.32}
          phase={0.2}
          wardrobe={WARDROBES[0]}
        />,
        <Person
          key="talk-b"
          mode="talk"
          position={[-3.55, 0, z + 0.5]}
          faceYaw={Math.PI / 2 - 0.3}
          phase={1.4}
          wardrobe={WARDROBES[1]}
        />
      );
    }
    // a lone viewer per deeper room, alternating pieces
    for (let r = 1; r < layout.rooms; r++) {
      const idx = r * PER_ROOM + (r % 2 === 0 ? 2 : 0);
      const a = hung[idx];
      if (!a) continue;
      out.push(
        <Person
          key={`viewer-${r}`}
          mode="stand"
          position={[-3.6, 0, a.z + 0.1]}
          faceYaw={Math.PI / 2}
          phase={r * 2.3}
          wardrobe={WARDROBES[(r + 2) % WARDROBES.length]}
        />
      );
    }
    // two figures strolling the whole museum through the doorways
    out.push(
      <Person
        key="walk-1"
        mode="walk"
        position={[1.0, 0, 0]}
        faceYaw={0}
        phase={0}
        wardrobe={WARDROBES[2]}
        walkPath={{ zFrom: FRONT_Z - 1.3, zTo: layout.backZ + 1.3, speed: 0.62 }}
      />
    );
    if (layout.rooms > 1) {
      out.push(
        <Person
          key="walk-2"
          mode="walk"
          position={[-1.0, 0, 0]}
          faceYaw={Math.PI}
          phase={4.2}
          wardrobe={WARDROBES[4]}
          walkPath={{ zFrom: layout.backZ + 1.6, zTo: FRONT_Z - 1.6, speed: 0.5 }}
        />
      );
    }
    return out;
  }, [layout, hung]);

  return <>{people}</>;
}

/* ---------- Glass curtain wall + terrace over the water ---------- */
function OceanWall({ layout }: { layout: Layout }) {
  const wood = useTexture(`${BASE}textures/wood_diffuse.jpg`);
  wood.wrapS = wood.wrapT = THREE.RepeatWrapping;
  wood.repeat.set(1, 8);
  wood.colorSpace = THREE.SRGBColorSpace;

  const { backZ, length, centerZ } = layout;

  const mullions = useMemo(() => {
    const arr: number[] = [];
    for (let z = backZ; z <= FRONT_Z + 0.01; z += 2.28) arr.push(z);
    return arr;
  }, [backZ]);

  const posts = useMemo(() => {
    const arr: number[] = [];
    for (let z = backZ - 0.5; z <= FRONT_Z + 0.5; z += 3) arr.push(z);
    return arr;
  }, [backZ]);

  return (
    <group>
      {/* the glass itself — reflective, see-through, cheap on mobile */}
      <mesh position={[HALF_W, ROOM_H / 2, centerZ]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[length, ROOM_H]} />
        <meshPhysicalMaterial
          transparent
          opacity={0.09}
          roughness={0.04}
          metalness={0.4}
          color="#cfe8ec"
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
      {/* mullions — these cast the long window shadows on the floor */}
      {mullions.map((z, i) => (
        <mesh key={i} position={[HALF_W, ROOM_H / 2, z]} castShadow>
          <boxGeometry args={[0.1, ROOM_H, 0.14]} />
          <meshStandardMaterial color="#1c1e22" metalness={0.7} roughness={0.35} />
        </mesh>
      ))}
      {/* head + sill rails */}
      {[0.06, ROOM_H - 0.06].map((y, i) => (
        <mesh key={`r${i}`} position={[HALF_W, y, centerZ]} castShadow>
          <boxGeometry args={[0.12, 0.12, length]} />
          <meshStandardMaterial color="#1c1e22" metalness={0.7} roughness={0.35} />
        </mesh>
      ))}

      {/* wooden terrace outside, cantilevered over the sea */}
      <mesh position={[HALF_W + 1.25, -0.09, centerZ]} receiveShadow>
        <boxGeometry args={[2.5, 0.16, length + 2]} />
        <meshStandardMaterial map={wood} color="#8a7358" roughness={0.85} />
      </mesh>
      {/* slim railing at the deck edge */}
      {posts.map((z, i) => (
        <mesh key={`p${i}`} position={[HALF_W + 2.4, 0.55, z]} castShadow>
          <boxGeometry args={[0.05, 1.1, 0.05]} />
          <meshStandardMaterial color="#2a2c31" metalness={0.8} roughness={0.3} />
        </mesh>
      ))}
      <mesh position={[HALF_W + 2.4, 1.08, centerZ]}>
        <boxGeometry args={[0.07, 0.05, length + 2]} />
        <meshStandardMaterial color="#2a2c31" metalness={0.8} roughness={0.3} />
      </mesh>
    </group>
  );
}

/* ---------- Dividing walls with a walk-through doorway ---------- */
function Dividers({ layout }: { layout: Layout }) {
  const panelW = HALF_W - DOOR_HALF;
  return (
    <>
      {layout.dividers.map((z, i) => (
        <group key={i} position={[0, 0, z]}>
          {/* side panels */}
          <mesh
            position={[-(DOOR_HALF + panelW / 2), ROOM_H / 2, 0]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[panelW, ROOM_H, 0.22]} />
            <meshStandardMaterial color="#efece5" roughness={0.97} />
          </mesh>
          <mesh
            position={[DOOR_HALF + panelW / 2, ROOM_H / 2, 0]}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[panelW, ROOM_H, 0.22]} />
            <meshStandardMaterial color="#efece5" roughness={0.97} />
          </mesh>
          {/* header above the opening */}
          <mesh position={[0, (3.1 + ROOM_H) / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[DOOR_HALF * 2, ROOM_H - 3.1, 0.22]} />
            <meshStandardMaterial color="#efece5" roughness={0.97} />
          </mesh>
          {/* dark doorway trim */}
          {[-DOOR_HALF, DOOR_HALF].map((x, k) => (
            <mesh key={k} position={[x, 1.55, 0]}>
              <boxGeometry args={[0.06, 3.1, 0.26]} />
              <meshStandardMaterial color="#17161a" roughness={0.85} />
            </mesh>
          ))}
          <mesh position={[0, 3.1, 0]}>
            <boxGeometry args={[DOOR_HALF * 2 + 0.06, 0.06, 0.26]} />
            <meshStandardMaterial color="#17161a" roughness={0.85} />
          </mesh>
        </group>
      ))}
    </>
  );
}

/* ---------- The pavilion shell ---------- */
function Pavilion({ layout }: { layout: Layout }) {
  const [wood, woodRough, woodBump] = useTexture([
    `${BASE}textures/wood_diffuse.jpg`,
    `${BASE}textures/wood_rough.jpg`,
    `${BASE}textures/wood_bump.jpg`
  ]);
  [wood, woodRough, woodBump].forEach((t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
  });
  wood.colorSpace = THREE.SRGBColorSpace;

  const { backZ, length, centerZ, rooms } = layout;
  useEffect(() => {
    [wood, woodRough, woodBump].forEach((t) => t.repeat.set(3, length / 3.2));
  }, [wood, woodRough, woodBump, length]);

  const slats = useMemo(() => {
    const arr: number[] = [];
    for (let x = -HALF_W + 0.3; x <= HALF_W - 0.05; x += 0.3) arr.push(x);
    return arr;
  }, []);

  const roomCenters = useMemo(() => {
    const arr: number[] = [];
    for (let i = 0; i < rooms; i++) arr.push(FRONT_Z - (i + 0.5) * ROOM_LEN);
    return arr;
  }, [rooms]);

  return (
    <group>
      {/* satin oak floor with soft real reflections */}
      <mesh position={[0, 0, centerZ]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[HALF_W * 2, length]} />
        <MeshReflectorMaterial
          mirror={0.16}
          resolution={384}
          blur={[260, 70]}
          mixBlur={1.6}
          mixStrength={0.6}
          depthScale={1}
          minDepthThreshold={0.45}
          maxDepthThreshold={1.3}
          map={wood}
          roughnessMap={woodRough}
          bumpMap={woodBump}
          bumpScale={0.04}
          roughness={0.62}
          metalness={0.05}
          color="#b09a78"
        />
      </mesh>

      {/* long art wall on the left */}
      <mesh
        position={[-HALF_W, ROOM_H / 2, centerZ]}
        rotation={[0, Math.PI / 2, 0]}
        receiveShadow
      >
        <planeGeometry args={[length, ROOM_H]} />
        <meshStandardMaterial color="#efece5" roughness={0.97} />
      </mesh>
      {/* far end wall */}
      <mesh position={[0, ROOM_H / 2, backZ]} receiveShadow>
        <planeGeometry args={[HALF_W * 2, ROOM_H]} />
        <meshStandardMaterial color="#eae6de" roughness={0.97} />
      </mesh>
      {/* wall behind the entrance */}
      <mesh position={[0, ROOM_H / 2, FRONT_Z]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[HALF_W * 2, ROOM_H]} />
        <meshStandardMaterial color="#eae6de" roughness={0.97} />
      </mesh>

      {/* shadow-gap reveal along the art wall */}
      <mesh position={[-HALF_W + 0.03, 0.035, centerZ]}>
        <boxGeometry args={[0.05, 0.07, length]} />
        <meshStandardMaterial color="#17161a" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.035, backZ + 0.03]}>
        <boxGeometry args={[HALF_W * 2, 0.07, 0.05]} />
        <meshStandardMaterial color="#17161a" roughness={0.9} />
      </mesh>

      {/* dark ceiling void above walnut slats */}
      <mesh position={[0, ROOM_H, centerZ]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[HALF_W * 2, length]} />
        <meshStandardMaterial color="#221e1a" roughness={0.95} />
      </mesh>
      {slats.map((x, i) => (
        <mesh key={i} position={[x, ROOM_H - 0.16, centerZ]}>
          <boxGeometry args={[0.07, 0.22, length]} />
          <meshStandardMaterial color="#4c3b28" roughness={0.75} />
        </mesh>
      ))}
      {/* recessed linear lights glowing between the slats */}
      {[-2.6, 0.2, 3.0].map((x, i) => (
        <mesh key={`l${i}`} position={[x, ROOM_H - 0.09, centerZ]}>
          <boxGeometry args={[0.12, 0.04, length - 1.2]} />
          <meshStandardMaterial
            color="#fff3e0"
            emissive="#ffe9cd"
            emissiveIntensity={1.6}
          />
        </mesh>
      ))}
      {/* one warm pool of light per room */}
      {roomCenters.map((z, i) => (
        <pointLight
          key={`pl${i}`}
          position={[0, ROOM_H - 0.7, z]}
          intensity={0.7}
          distance={7.5}
          decay={2}
          color="#ffedd6"
        />
      ))}

      {/* a bench in every room + its grounding shadow */}
      {roomCenters.map((z, i) => (
        <group key={`b${i}`} position={[0.4, 0, z]}>
          <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
            <boxGeometry args={[2.4, 0.11, 0.62]} />
            <meshStandardMaterial map={wood} color="#9a8265" roughness={0.55} />
          </mesh>
          {[-1.05, 1.05].map((x, k) => (
            <mesh key={k} position={[x, 0.19, 0]} castShadow>
              <boxGeometry args={[0.08, 0.38, 0.5]} />
              <meshStandardMaterial color="#191a1e" metalness={0.85} roughness={0.3} />
            </mesh>
          ))}
          <ContactShadows
            position={[0, 0.012, 0]}
            scale={6}
            far={2.2}
            blur={2.6}
            opacity={0.38}
            frames={1}
          />
        </group>
      ))}
    </group>
  );
}

/* ---------- Walk-through controls: drag to look, hold to walk ---------- */
export interface MoveState {
  dir: number;
  impulse: number;
}

function WalkControls({
  active,
  moveRef,
  layout
}: {
  active: boolean;
  moveRef: React.MutableRefObject<MoveState>;
  layout: Layout;
}) {
  const { camera, gl } = useThree();
  const yaw = useRef(0.4); // 0 faces down the hall (-z); + turns right
  const pitch = useRef(0.02);
  const tYaw = useRef(0.4);
  const tPitch = useRef(0.02);
  const pos = useRef(new THREE.Vector3(-0.7, EYE, 3.6));

  useEffect(() => {
    camera.rotation.order = "YXZ";
    camera.position.copy(pos.current);
  }, [camera]);

  useEffect(() => {
    const el = gl.domElement;
    let drag: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY };
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag = { x: e.clientX, y: e.clientY };
      tYaw.current += dx * 0.0032;
      tPitch.current = THREE.MathUtils.clamp(tPitch.current + dy * 0.0028, -0.5, 0.45);
    };
    const up = () => {
      drag = null;
    };
    const key = (downEvt: boolean) => (e: KeyboardEvent) => {
      if (["w", "W", "ArrowUp"].includes(e.key)) moveRef.current.dir = downEvt ? 1 : 0;
      if (["s", "S", "ArrowDown"].includes(e.key)) moveRef.current.dir = downEvt ? -1 : 0;
    };
    const kd = key(true);
    const ku = key(false);
    const wheel = (e: WheelEvent) => {
      moveRef.current.impulse += -e.deltaY * 0.0014;
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    el.addEventListener("wheel", wheel, { passive: true });
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      el.removeEventListener("wheel", wheel);
    };
  }, [gl, moveRef]);

  useFrame((state, dt) => {
    if (!active) {
      const t = state.clock.elapsedTime;
      tYaw.current = 0.45 + Math.sin(t * 0.1) * 0.25;
      tPitch.current = 0.02;
    }
    const k = 1 - Math.exp(-8 * dt);
    yaw.current += (tYaw.current - yaw.current) * k;
    pitch.current += (tPitch.current - pitch.current) * k;

    // walking
    const m = moveRef.current;
    let step = m.dir * 2.7 * dt + m.impulse;
    m.impulse *= 0.82;
    if (Math.abs(step) > 1e-5 && active) {
      step = THREE.MathUtils.clamp(step, -0.35, 0.35);
      const p = pos.current;
      const nx = p.x + -Math.sin(yaw.current) * step * -1;
      const nz = p.z + -Math.cos(yaw.current) * step;
      let x = THREE.MathUtils.clamp(nx, -HALF_W + 0.55, HALF_W - 0.55);
      let z = THREE.MathUtils.clamp(nz, layout.backZ + 0.7, FRONT_Z - 0.7);
      // doorway collision at each dividing wall
      for (const dz of layout.dividers) {
        const crossing = (p.z - dz) * (z - dz) < 0 || Math.abs(z - dz) < 0.25;
        if (crossing && Math.abs(x) > DOOR_HALF - 0.18) {
          z = p.z; // blocked by the wall — slide along it
          break;
        }
      }
      p.set(x, EYE, z);
    }

    camera.position.copy(pos.current);
    camera.rotation.y = -yaw.current;
    camera.rotation.x = -pitch.current;
  });
  return null;
}

/* ---------- Camera helpers ---------- */
function ResponsiveCamera() {
  const { camera, size } = useThree();
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = size.width / size.height;
    cam.fov = aspect < 1 ? Math.min(88, 56 / Math.max(aspect, 0.52)) : 56;
    cam.updateProjectionMatrix();
  }, [camera, size.width, size.height]);
  return null;
}

/* ---------- Root ---------- */
export default function Museum({
  photos,
  active,
  onSelect
}: {
  photos: Photo[];
  active: boolean;
  onSelect: (i: number) => void;
}) {
  const layout = useMemo(() => layoutFor(photos.length), [photos.length]);

  // hang photos 3 per room along the left wall
  const hung = useMemo(
    () =>
      photos.map((photo, i) => {
        const room = Math.floor(i / PER_ROOM);
        const slot = i % PER_ROOM;
        const roomFront = FRONT_Z - room * ROOM_LEN;
        const z = roomFront - 1.55 - slot * 2.35;
        return { photo, index: i, z };
      }),
    [photos]
  );

  const moveRef = useRef<MoveState>({ dir: 0, impulse: 0 });
  const set = (d: number) => () => (moveRef.current.dir = d);

  return (
    <div className="universe">
      <Canvas
        shadows="soft"
        dpr={[1, 1.75]}
        gl={{
          antialias: true,
          powerPreference: "high-performance",
          toneMappingExposure: 1.0
        }}
        camera={{ position: [-0.7, EYE, 3.6], fov: 56, near: 0.1, far: 4000 }}
      >
        <Suspense fallback={null}>
          {/* real morning-ocean HDRI lights the room and fills the sky */}
          <Environment files={HDRI} background />
          <ambientLight intensity={0.22} color="#e8eef2" />
          {/* the sun — streams through the glass, casts the window shadows */}
          <directionalLight
            key={`sun-${layout.rooms}`}
            position={SUN_POS.toArray()}
            intensity={2.2}
            color="#ffe9c6"
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-bias={-0.0004}
            shadow-camera-left={-(layout.length / 2 + 6)}
            shadow-camera-right={layout.length / 2 + 6}
            shadow-camera-top={10}
            shadow-camera-bottom={-6}
            shadow-camera-near={1}
            shadow-camera-far={60}
          />

          <Pavilion layout={layout} />
          <Dividers layout={layout} />
          <OceanWall layout={layout} />
          <Ocean />
          <Boats />
          <Visitors layout={layout} hung={hung} />

          <Suspense fallback={null}>
            {hung.map((a) => (
              <Artwork
                key={a.photo.id}
                photo={a.photo}
                index={a.index}
                z={a.z}
                onSelect={onSelect}
              />
            ))}
          </Suspense>
        </Suspense>

        <WalkControls active={active} moveRef={moveRef} layout={layout} />
        <ResponsiveCamera />
      </Canvas>

      <div className="vignette" aria-hidden="true" />

      {active && (
        <div className="tour-controls">
          <button
            className="tour-btn"
            aria-label="Walk forward"
            onPointerDown={set(1)}
            onPointerUp={set(0)}
            onPointerLeave={set(0)}
            onContextMenu={(e) => e.preventDefault()}
          >
            ▲
          </button>
          <button
            className="tour-btn"
            aria-label="Walk back"
            onPointerDown={set(-1)}
            onPointerUp={set(0)}
            onPointerLeave={set(0)}
            onContextMenu={(e) => e.preventDefault()}
          >
            ▼
          </button>
        </div>
      )}
    </div>
  );
}
