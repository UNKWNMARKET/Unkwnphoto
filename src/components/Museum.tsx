import { Suspense, useEffect, useMemo, useRef, useState } from "react";
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

/* ---------- Room dimensions ---------- */
const HALF_W = 5.5; // glass curtain wall at +x
const ROOM_H = 4.4;
const BACK_Z = -6.2; // art wall
const FRONT_Z = 5.2;
const EYE = 1.6;
const PER_PAGE = 3;
const LENGTH = FRONT_Z - BACK_Z;
const CENTER_Z = (FRONT_Z + BACK_Z) / 2;

// Morning sun, low over the water, shining in through the glass.
const SUN_POS = new THREE.Vector3(16, 7.5, -4);

/* ---------- A framed, spotlit photograph ---------- */
function Artwork({
  photo,
  index,
  slot,
  onSelect
}: {
  photo: Photo;
  index: number;
  slot: -1 | 0 | 1;
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
    <group position={[slot * 3.2, EYE + 0.2, BACK_Z + 0.05]}>
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
    w.position.y = -1.1;
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

/* ---------- Glass curtain wall + terrace over the water ---------- */
function OceanWall() {
  const wood = useTexture(`${BASE}textures/wood_diffuse.jpg`);
  wood.wrapS = wood.wrapT = THREE.RepeatWrapping;
  wood.repeat.set(1, 6);
  wood.colorSpace = THREE.SRGBColorSpace;

  const mullions = useMemo(() => {
    const arr: number[] = [];
    for (let z = BACK_Z; z <= FRONT_Z + 0.01; z += 2.28) arr.push(z);
    return arr;
  }, []);

  return (
    <group>
      {/* the glass itself — reflective, see-through, cheap on mobile */}
      <mesh position={[HALF_W, ROOM_H / 2, CENTER_Z]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[LENGTH, ROOM_H]} />
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
        <mesh key={`r${i}`} position={[HALF_W, y, CENTER_Z]} castShadow>
          <boxGeometry args={[0.12, 0.12, LENGTH]} />
          <meshStandardMaterial color="#1c1e22" metalness={0.7} roughness={0.35} />
        </mesh>
      ))}

      {/* wooden terrace outside, cantilevered over the sea */}
      <mesh position={[HALF_W + 1.25, -0.09, CENTER_Z]} receiveShadow>
        <boxGeometry args={[2.5, 0.16, LENGTH + 2]} />
        <meshStandardMaterial map={wood} color="#8a7358" roughness={0.85} />
      </mesh>
      {/* slim glass railing posts at the deck edge */}
      {[-4.5, -1.5, 1.5, 4.5].map((z, i) => (
        <mesh key={`p${i}`} position={[HALF_W + 2.4, 0.55, CENTER_Z + z]} castShadow>
          <boxGeometry args={[0.05, 1.1, 0.05]} />
          <meshStandardMaterial color="#2a2c31" metalness={0.8} roughness={0.3} />
        </mesh>
      ))}
      <mesh position={[HALF_W + 2.4, 1.08, CENTER_Z]}>
        <boxGeometry args={[0.07, 0.05, LENGTH + 2]} />
        <meshStandardMaterial color="#2a2c31" metalness={0.8} roughness={0.3} />
      </mesh>
    </group>
  );
}

/* ---------- The pavilion shell ---------- */
function Pavilion() {
  const [wood, woodRough, woodBump] = useTexture([
    `${BASE}textures/wood_diffuse.jpg`,
    `${BASE}textures/wood_rough.jpg`,
    `${BASE}textures/wood_bump.jpg`
  ]);
  [wood, woodRough, woodBump].forEach((t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(3, 3.4);
    t.anisotropy = 8;
  });
  wood.colorSpace = THREE.SRGBColorSpace;

  const slats = useMemo(() => {
    const arr: number[] = [];
    for (let x = -HALF_W + 0.3; x <= HALF_W - 0.05; x += 0.3) arr.push(x);
    return arr;
  }, []);

  return (
    <group>
      {/* satin oak floor with soft real reflections */}
      <mesh position={[0, 0, CENTER_Z]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[HALF_W * 2, LENGTH]} />
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

      {/* back art wall */}
      <mesh position={[0, ROOM_H / 2, BACK_Z]} receiveShadow>
        <planeGeometry args={[HALF_W * 2, ROOM_H]} />
        <meshStandardMaterial color="#efece5" roughness={0.97} />
      </mesh>
      {/* left wall */}
      <mesh
        position={[-HALF_W, ROOM_H / 2, CENTER_Z]}
        rotation={[0, Math.PI / 2, 0]}
        receiveShadow
      >
        <planeGeometry args={[LENGTH, ROOM_H]} />
        <meshStandardMaterial color="#eae6de" roughness={0.97} />
      </mesh>
      {/* wall behind viewer */}
      <mesh position={[0, ROOM_H / 2, FRONT_Z]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[HALF_W * 2, ROOM_H]} />
        <meshStandardMaterial color="#eae6de" roughness={0.97} />
      </mesh>

      {/* shadow-gap reveal where walls meet the floor (modern detail) */}
      <mesh position={[0, 0.035, BACK_Z + 0.03]}>
        <boxGeometry args={[HALF_W * 2, 0.07, 0.05]} />
        <meshStandardMaterial color="#17161a" roughness={0.9} />
      </mesh>
      <mesh position={[-HALF_W + 0.03, 0.035, CENTER_Z]}>
        <boxGeometry args={[0.05, 0.07, LENGTH]} />
        <meshStandardMaterial color="#17161a" roughness={0.9} />
      </mesh>

      {/* dark ceiling void above walnut slats */}
      <mesh position={[0, ROOM_H, CENTER_Z]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[HALF_W * 2, LENGTH]} />
        <meshStandardMaterial color="#221e1a" roughness={0.95} />
      </mesh>
      {slats.map((x, i) => (
        <mesh key={i} position={[x, ROOM_H - 0.16, CENTER_Z]}>
          <boxGeometry args={[0.07, 0.22, LENGTH]} />
          <meshStandardMaterial color="#4c3b28" roughness={0.75} />
        </mesh>
      ))}
      {/* recessed linear lights glowing between the slats */}
      {[-2.6, 0.2, 3.0].map((x, i) => (
        <group key={`l${i}`}>
          <mesh position={[x, ROOM_H - 0.09, CENTER_Z]}>
            <boxGeometry args={[0.12, 0.04, LENGTH - 1.6]} />
            <meshStandardMaterial
              color="#fff3e0"
              emissive="#ffe9cd"
              emissiveIntensity={1.6}
            />
          </mesh>
          <pointLight
            position={[x, ROOM_H - 0.7, CENTER_Z]}
            intensity={0.7}
            distance={7}
            decay={2}
            color="#ffedd6"
          />
        </group>
      ))}

      {/* museum bench: oak slab on steel */}
      <group position={[-0.8, 0, -0.4]}>
        <mesh position={[0, 0.42, 0]} castShadow receiveShadow>
          <boxGeometry args={[2.4, 0.11, 0.62]} />
          <meshStandardMaterial map={wood} color="#9a8265" roughness={0.55} />
        </mesh>
        {[-1.05, 1.05].map((x, i) => (
          <mesh key={i} position={[x, 0.19, 0]} castShadow>
            <boxGeometry args={[0.08, 0.38, 0.5]} />
            <meshStandardMaterial color="#191a1e" metalness={0.85} roughness={0.3} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/* ---------- Stand-and-look camera (can never leave the room) ---------- */
const CAM_POS = new THREE.Vector3(-0.7, EYE, 3.4);

function LookControls({ active }: { active: boolean }) {
  const { camera, gl } = useThree();
  // yaw 0 faces the art wall; positive = turning right toward the ocean
  const yaw = useRef(0.12);
  const pitch = useRef(0.02);
  const tYaw = useRef(0.12);
  const tPitch = useRef(0.02);

  useEffect(() => {
    camera.position.copy(CAM_POS);
    camera.rotation.order = "YXZ";
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
      tYaw.current = THREE.MathUtils.clamp(tYaw.current + dx * 0.0032, -0.95, 1.85);
      tPitch.current = THREE.MathUtils.clamp(tPitch.current + dy * 0.0028, -0.5, 0.45);
    };
    const up = () => {
      drag = null;
    };
    el.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [gl]);

  useFrame((state, dt) => {
    if (!active) {
      // gentle establishing drift behind the intro
      const t = state.clock.elapsedTime;
      tYaw.current = 0.35 + Math.sin(t * 0.1) * 0.25;
      tPitch.current = 0.02;
    }
    const k = 1 - Math.exp(-8 * dt);
    yaw.current += (tYaw.current - yaw.current) * k;
    pitch.current += (tPitch.current - pitch.current) * k;
    camera.position.copy(CAM_POS);
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
  const pages = useMemo(() => {
    const out: { photos: Photo[]; start: number }[] = [];
    for (let i = 0; i < photos.length; i += PER_PAGE) {
      out.push({ photos: photos.slice(i, i + PER_PAGE), start: i });
    }
    return out.length ? out : [{ photos: [], start: 0 }];
  }, [photos]);

  const [page, setPage] = useState(0);
  const [fading, setFading] = useState(false);
  const count = pages.length;

  const go = (dir: number) => {
    if (count < 2) return;
    setFading(true);
    window.setTimeout(() => {
      setPage((p) => (p + dir + count) % count);
      window.setTimeout(() => setFading(false), 90);
    }, 240);
  };

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, count]);

  const current = pages[Math.min(page, count - 1)];

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
        camera={{ position: [-0.6, EYE, 3.6], fov: 56, near: 0.1, far: 4000 }}
      >
        <Suspense fallback={null}>
          {/* real morning-ocean HDRI lights the room and fills the sky */}
          <Environment files={HDRI} background />
          <ambientLight intensity={0.22} color="#e8eef2" />
          {/* the sun — streams through the glass, casts the window shadows */}
          <directionalLight
            position={SUN_POS.toArray()}
            intensity={2.2}
            color="#ffe9c6"
            castShadow
            shadow-mapSize={[2048, 2048]}
            shadow-bias={-0.0004}
            shadow-camera-left={-10}
            shadow-camera-right={10}
            shadow-camera-top={8}
            shadow-camera-bottom={-4}
            shadow-camera-near={1}
            shadow-camera-far={50}
          />

          <Pavilion />
          <OceanWall />
          <Ocean />
          <ContactShadows
            position={[0, 0.012, -0.4]}
            scale={12}
            far={2.6}
            blur={2.6}
            opacity={0.38}
            frames={1}
          />

          <Suspense fallback={null}>
            {current.photos.map((p, i) => (
              <Artwork
                key={p.id}
                photo={p}
                index={current.start + i}
                slot={(i - 1) as -1 | 0 | 1}
                onSelect={onSelect}
              />
            ))}
          </Suspense>
        </Suspense>

        <LookControls active={active} />
        <ResponsiveCamera />
      </Canvas>

      <div className="vignette" aria-hidden="true" />
      <div className={`room-fade${fading ? " on" : ""}`} />

      {active && count > 1 && (
        <div className="room-nav">
          <button className="room-btn" aria-label="Previous wall" onClick={() => go(-1)}>
            ‹
          </button>
          <span className="room-name">
            Wall {page + 1} / {count}
          </span>
          <button className="room-btn" aria-label="Next wall" onClick={() => go(1)}>
            ›
          </button>
        </div>
      )}
    </div>
  );
}
