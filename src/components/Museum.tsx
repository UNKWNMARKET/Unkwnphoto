import { Suspense, useEffect, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import {
  Environment,
  OrbitControls,
  ContactShadows,
  useTexture,
  Text
} from "@react-three/drei";
import * as THREE from "three";
import type { Photo } from "../types";

// Real photographed interior HDRIs (background + image-based lighting),
// bundled locally so nothing depends on a blocked CDN.
import esplanade from "@pmndrs/assets/hdri/esplanade.exr";
import hall from "@pmndrs/assets/hdri/hall.exr";
import lobby from "@pmndrs/assets/hdri/lobby.exr";
import warehouse from "@pmndrs/assets/hdri/warehouse.exr";

const ROOMS = [esplanade, lobby, hall, warehouse];
const ROOM_NAMES = ["The Esplanade", "The Lobby", "The Great Hall", "The Annex"];
const PER_ROOM = 3;
const FONT = `${import.meta.env.BASE_URL}fonts/SpaceGrotesk.ttf`;
const EYE = 1.5;

/* ---------- A framed photo hung in the space ---------- */
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

  let w = 1.7;
  let h = w / aspect;
  const MAX_H = 1.25;
  if (h > MAX_H) {
    h = MAX_H;
    w = MAX_H * aspect;
  }

  // Slight arc: side pieces sit forward and angle inward.
  const x = slot * 2.05;
  const z = -3.1 + Math.abs(slot) * 0.45;
  const rotY = -slot * 0.26;

  return (
    <group position={[x, EYE, z]} rotation={[0, rotY, 0]}>
      {/* gallery frame — metallic so it catches the real-room lighting */}
      <mesh position={[0, 0, -0.04]} castShadow>
        <boxGeometry args={[w + 0.16, h + 0.16, 0.08]} />
        <meshStandardMaterial color="#111014" metalness={0.7} roughness={0.35} />
      </mesh>
      {/* mat */}
      <mesh position={[0, 0, 0.005]}>
        <planeGeometry args={[w + 0.06, h + 0.06]} />
        <meshStandardMaterial color="#f2ece0" roughness={0.9} />
      </mesh>
      {/* photo (unlit → true colour) */}
      <mesh
        position={[0, 0, 0.01]}
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
      {/* picture light bar above */}
      <mesh position={[0, h / 2 + 0.18, 0.12]}>
        <boxGeometry args={[Math.min(w, 0.9), 0.04, 0.12]} />
        <meshStandardMaterial
          color="#fff3d8"
          emissive="#ffe8bf"
          emissiveIntensity={1.4}
        />
      </mesh>
      <pointLight
        position={[0, h / 2 + 0.3, 0.5]}
        intensity={2.2}
        distance={2.6}
        decay={2}
        color="#ffe9c8"
      />
      {/* plaque */}
      <Text
        position={[0, -h / 2 - 0.22, 0.02]}
        font={FONT}
        fontSize={0.058}
        letterSpacing={0.05}
        color="#f4efe6"
        anchorX="center"
        anchorY="middle"
        outlineWidth={0.002}
        outlineColor="#000"
        maxWidth={w}
      >
        {photo.title.toUpperCase()}
      </Text>
    </group>
  );
}

/* ---------- One gallery room (real HDRI + its artworks) ---------- */
function Room({
  hdri,
  photos,
  startIndex,
  onSelect
}: {
  hdri: string;
  photos: Photo[];
  startIndex: number;
  onSelect: (i: number) => void;
}) {
  return (
    <>
      <Environment files={hdri} background backgroundBlurriness={0} />
      <ContactShadows
        position={[0, 0.01, -2.6]}
        opacity={0.5}
        scale={14}
        blur={2.4}
        far={6}
        color="#000000"
      />
      <Suspense fallback={null}>
        {photos.map((p, i) => (
          <Artwork
            key={p.id}
            photo={p}
            index={startIndex + i}
            slot={(i - 1) as -1 | 0 | 1}
            onSelect={onSelect}
          />
        ))}
      </Suspense>
    </>
  );
}

/* ---------- Canvas wrapper + room navigation ---------- */
export default function Museum({
  photos,
  active,
  onSelect
}: {
  photos: Photo[];
  active: boolean;
  onSelect: (i: number) => void;
}) {
  const rooms = useMemo(() => {
    const out: { photos: Photo[]; start: number }[] = [];
    for (let i = 0; i < photos.length; i += PER_ROOM) {
      out.push({ photos: photos.slice(i, i + PER_ROOM), start: i });
    }
    return out.length ? out : [{ photos: [], start: 0 }];
  }, [photos]);

  const [room, setRoom] = useState(0);
  const [fading, setFading] = useState(false);
  const roomCount = rooms.length;

  const go = (dir: number) => {
    setFading(true);
    window.setTimeout(() => {
      setRoom((r) => (r + dir + roomCount) % roomCount);
      window.setTimeout(() => setFading(false), 80);
    }, 280);
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
  }, [active, roomCount]);

  const current = rooms[Math.min(room, roomCount - 1)];
  const hdri = ROOMS[room % ROOMS.length];

  return (
    <div className="universe">
      <Canvas
        shadows
        dpr={[1, 1.5]}
        gl={{ antialias: true, powerPreference: "high-performance", toneMappingExposure: 1.0 }}
        camera={{ position: [0, EYE, 3.4], fov: 60, near: 0.1, far: 100 }}
      >
        <Suspense fallback={null}>
          <Room
            key={room}
            hdri={hdri}
            photos={current.photos}
            startIndex={current.start}
            onSelect={onSelect}
          />
        </Suspense>
        <OrbitControls
          enabled={active}
          target={[0, EYE, -2.8]}
          enablePan={false}
          enableZoom
          minDistance={1.5}
          maxDistance={5}
          minPolarAngle={Math.PI * 0.28}
          maxPolarAngle={Math.PI * 0.62}
          minAzimuthAngle={-Math.PI * 0.42}
          maxAzimuthAngle={Math.PI * 0.42}
          enableDamping
          dampingFactor={0.08}
          rotateSpeed={-0.4}
        />
      </Canvas>

      <div className={`room-fade${fading ? " on" : ""}`} />

      {active && roomCount > 1 && (
        <div className="room-nav">
          <button className="room-btn" aria-label="Previous room" onClick={() => go(-1)}>
            ‹
          </button>
          <span className="room-name">
            {ROOM_NAMES[room % ROOM_NAMES.length]} · {room + 1}/{roomCount}
          </span>
          <button className="room-btn" aria-label="Next room" onClick={() => go(1)}>
            ›
          </button>
        </div>
      )}
    </div>
  );
}
