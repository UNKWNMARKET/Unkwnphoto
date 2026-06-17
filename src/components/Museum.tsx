import { Suspense, useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import {
  Environment,
  OrbitControls,
  MeshReflectorMaterial,
  useTexture,
  Text
} from "@react-three/drei";
import * as THREE from "three";
import type { Photo } from "../types";

const HDRI = `${import.meta.env.BASE_URL}textures/ocean.hdr`;
const FONT = `${import.meta.env.BASE_URL}fonts/SpaceGrotesk.ttf`;

const HALF_W = 5; // room half width
const ROOM_H = 4.2;
const BACK_Z = -6; // art wall
const FRONT_Z = 5; // wall behind the camera
const EYE = 1.6;
const PER_PAGE = 3;

/* ---------- A framed photo on the art wall ---------- */
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

  let w = 1.9;
  let h = w / aspect;
  const MAX_H = 1.5;
  if (h > MAX_H) {
    h = MAX_H;
    w = MAX_H * aspect;
  }

  return (
    <group position={[slot * 2.9, EYE + 0.15, BACK_Z + 0.06]}>
      {/* slim modern frame */}
      <mesh position={[0, 0, -0.03]} castShadow>
        <boxGeometry args={[w + 0.08, h + 0.08, 0.06]} />
        <meshStandardMaterial color="#15151a" metalness={0.5} roughness={0.45} />
      </mesh>
      <mesh
        position={[0, 0, 0.005]}
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
      {/* picture light */}
      <mesh position={[0, h / 2 + 0.22, 0.18]}>
        <boxGeometry args={[Math.min(w, 1.1), 0.05, 0.16]} />
        <meshStandardMaterial color="#fff4e0" emissive="#ffeccb" emissiveIntensity={1.5} />
      </mesh>
      <spotLight
        position={[0, h / 2 + 0.7, 1.1]}
        angle={0.6}
        penumbra={0.85}
        intensity={5}
        distance={5}
        color="#fff0d8"
        castShadow
      />
      <Text
        position={[0, -h / 2 - 0.26, 0.02]}
        font={FONT}
        fontSize={0.07}
        letterSpacing={0.06}
        color="#2a2a2e"
        anchorX="center"
        anchorY="middle"
        maxWidth={w + 0.4}
      >
        {photo.title.toUpperCase()}
      </Text>
    </group>
  );
}

/* ---------- Modern glass curtain wall to the ocean ---------- */
function GlassWall() {
  const length = FRONT_Z - BACK_Z;
  const centerZ = (FRONT_Z + BACK_Z) / 2;
  const mullionZ = useMemo(() => {
    const arr: number[] = [];
    for (let z = BACK_Z + 0.05; z <= FRONT_Z; z += 2.2) arr.push(z);
    return arr;
  }, []);
  return (
    <group position={[HALF_W - 0.02, 0, 0]}>
      {/* the glass */}
      <mesh rotation={[0, -Math.PI / 2, 0]} position={[0, ROOM_H / 2, centerZ]}>
        <planeGeometry args={[length, ROOM_H]} />
        <meshPhysicalMaterial
          transmission={0.92}
          thickness={0.4}
          roughness={0.06}
          ior={1.45}
          transparent
          opacity={0.5}
          color="#dff2f5"
          metalness={0}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* vertical mullions */}
      {mullionZ.map((z, i) => (
        <mesh key={i} position={[0, ROOM_H / 2, z]} castShadow>
          <boxGeometry args={[0.12, ROOM_H, 0.1]} />
          <meshStandardMaterial color="#202227" metalness={0.7} roughness={0.4} />
        </mesh>
      ))}
      {/* head + sill rails */}
      {[0.05, ROOM_H - 0.05].map((y, i) => (
        <mesh key={`r${i}`} position={[0, y, centerZ]} castShadow>
          <boxGeometry args={[0.14, 0.12, length]} />
          <meshStandardMaterial color="#202227" metalness={0.7} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}

/* ---------- The modern gallery shell ---------- */
function Gallery() {
  const length = FRONT_Z - BACK_Z;
  const centerZ = (FRONT_Z + BACK_Z) / 2;
  return (
    <group>
      {/* polished concrete floor */}
      <mesh position={[0, 0, centerZ]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[HALF_W * 2, length]} />
        <MeshReflectorMaterial
          mirror={0.35}
          resolution={512}
          blur={[260, 90]}
          mixBlur={1.4}
          mixStrength={0.7}
          depthScale={1}
          minDepthThreshold={0.4}
          maxDepthThreshold={1.3}
          roughness={0.55}
          metalness={0.1}
          color="#cfccc4"
        />
      </mesh>
      {/* ceiling */}
      <mesh position={[0, ROOM_H, centerZ]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[HALF_W * 2, length]} />
        <meshStandardMaterial color="#eeece6" roughness={0.95} />
      </mesh>
      {/* ceiling light strips */}
      {[-2.4, 0, 2.4].map((z, i) => (
        <mesh key={i} position={[-1.4, ROOM_H - 0.04, z]}>
          <boxGeometry args={[5, 0.04, 0.18]} />
          <meshStandardMaterial color="#fff6ea" emissive="#ffe7cb" emissiveIntensity={1.1} />
        </mesh>
      ))}
      {/* art wall (back) */}
      <mesh position={[0, ROOM_H / 2, BACK_Z]} receiveShadow>
        <planeGeometry args={[HALF_W * 2, ROOM_H]} />
        <meshStandardMaterial color="#edeae3" roughness={0.97} />
      </mesh>
      {/* left wall */}
      <mesh position={[-HALF_W, ROOM_H / 2, centerZ]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[length, ROOM_H]} />
        <meshStandardMaterial color="#e7e4dd" roughness={0.97} />
      </mesh>
      {/* wall behind the viewer */}
      <mesh position={[0, ROOM_H / 2, FRONT_Z]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[HALF_W * 2, ROOM_H]} />
        <meshStandardMaterial color="#e7e4dd" roughness={0.97} />
      </mesh>
      {/* right side: glass to the ocean */}
      <GlassWall />
      {/* a long modern bench */}
      <mesh position={[-0.6, 0.28, 0.5]} castShadow receiveShadow>
        <boxGeometry args={[2.6, 0.18, 0.7]} />
        <meshStandardMaterial color="#2a2723" roughness={0.5} metalness={0.1} />
      </mesh>
      <mesh position={[-0.6, 0.12, 0.5]} castShadow>
        <boxGeometry args={[2.5, 0.1, 0.6]} />
        <meshStandardMaterial color="#cfcabf" roughness={0.6} />
      </mesh>
    </group>
  );
}

/* ---------- Canvas + page navigation ---------- */
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
      window.setTimeout(() => setFading(false), 80);
    }, 260);
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
        shadows
        dpr={[1, 1.5]}
        gl={{ antialias: true, powerPreference: "high-performance", toneMappingExposure: 0.95 }}
        camera={{ position: [0.4, EYE, 3.2], fov: 62, near: 0.1, far: 100 }}
      >
        <Suspense fallback={null}>
          <Environment files={HDRI} background backgroundBlurriness={0} />
          <ambientLight intensity={0.25} color="#dfeaf2" />
          <directionalLight
            position={[6, 6, 4]}
            intensity={1.1}
            color="#fff4e2"
            castShadow
            shadow-mapSize={[1024, 1024]}
          />
          <Gallery />
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
        <OrbitControls
          enabled={active}
          target={[0, EYE, BACK_Z]}
          enablePan={false}
          enableZoom
          minDistance={2}
          maxDistance={7}
          minPolarAngle={Math.PI * 0.3}
          maxPolarAngle={Math.PI * 0.6}
          minAzimuthAngle={-Math.PI * 0.5}
          maxAzimuthAngle={Math.PI * 0.52}
          enableDamping
          dampingFactor={0.08}
          rotateSpeed={-0.4}
        />
      </Canvas>

      <div className={`room-fade${fading ? " on" : ""}`} />

      {active && count > 1 && (
        <div className="room-nav">
          <button className="room-btn" aria-label="Previous" onClick={() => go(-1)}>
            ‹
          </button>
          <span className="room-name">
            Gallery · {page + 1}/{count}
          </span>
          <button className="room-btn" aria-label="Next" onClick={() => go(1)}>
            ›
          </button>
        </div>
      )}
    </div>
  );
}
