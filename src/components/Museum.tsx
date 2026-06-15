import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { ScrollControls, useScroll, Text, useTexture } from "@react-three/drei";
import * as THREE from "three";
import type { Photo } from "../types";

/* ---------- Gallery dimensions ---------- */
const HALF_WIDTH = 4; // side walls at x = ±4
const WALL_HEIGHT = 5;
const EYE = 1.6; // camera/eye height
const FIRST_Z = -7; // first artwork
const GAP = 7; // spacing between artworks along the hall
const FONT = `${import.meta.env.BASE_URL}fonts/SpaceGrotesk.ttf`;

const _v = new THREE.Vector3();

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

// Soft warm radial gradient used to fake a spotlight wash on the wall.
let glowTexture: THREE.CanvasTexture | null = null;
function getGlowTexture() {
  if (glowTexture) return glowTexture;
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d")!;
  const g = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
  g.addColorStop(0, "rgba(255,240,214,0.85)");
  g.addColorStop(0.45, "rgba(255,228,188,0.28)");
  g.addColorStop(1, "rgba(255,228,188,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  glowTexture = new THREE.CanvasTexture(c);
  return glowTexture;
}

interface ArtworkPlacement {
  photo: Photo;
  index: number;
  z: number;
  side: -1 | 1; // -1 left wall, +1 right wall
}

/* ---------- A single framed photo on the wall ---------- */
function Artwork({
  placement,
  onSelect
}: {
  placement: ArtworkPlacement;
  onSelect: (i: number) => void;
}) {
  const { photo, side, z, index } = placement;
  const texture = useTexture(photo.url);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  // Size the frame to the photo's real aspect so nothing is distorted.
  const img = texture.image as HTMLImageElement | undefined;
  const aspect = img && img.width && img.height ? img.width / img.height : 1.5;
  const MAX_W = 3.0;
  const MAX_H = 2.1;
  let w = MAX_W;
  let h = MAX_W / aspect;
  if (h > MAX_H) {
    h = MAX_H;
    w = MAX_H * aspect;
  }

  const frameBorder = 0.16;
  const matBorder = 0.12;
  const glow = getGlowTexture();

  // Left wall faces +x (rotY +90°), right wall faces -x (rotY -90°).
  const rotationY = side === -1 ? Math.PI / 2 : -Math.PI / 2;
  const x = side * (HALF_WIDTH - 0.06);

  return (
    <group position={[x, EYE, z]} rotation={[0, rotationY, 0]}>
      {/* spotlight wash on the wall behind the piece */}
      <mesh position={[0, 0.1, -0.05]} renderOrder={-1}>
        <planeGeometry args={[w + 2.4, h + 2.8]} />
        <meshBasicMaterial
          map={glow}
          transparent
          opacity={0.5}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {/* frame */}
      <mesh position={[0, 0, 0.02]} castShadow>
        <boxGeometry
          args={[w + frameBorder + matBorder, h + frameBorder + matBorder, 0.1]}
        />
        <meshStandardMaterial color="#0e0d11" metalness={0.35} roughness={0.5} />
      </mesh>
      {/* white mat board */}
      <mesh position={[0, 0, 0.075]}>
        <planeGeometry args={[w + matBorder, h + matBorder]} />
        <meshStandardMaterial color="#f3eee4" roughness={0.95} />
      </mesh>
      {/* the photo (unlit so colours stay true and crisp) */}
      <mesh
        position={[0, 0, 0.085]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(index);
        }}
        onPointerOver={() => (document.body.style.cursor = "pointer")}
        onPointerOut={() => (document.body.style.cursor = "auto")}
      >
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>

      {/* title plaque */}
      <group position={[0, -h / 2 - 0.5, 0.09]}>
        <mesh>
          <planeGeometry args={[Math.max(1.1, w * 0.5), 0.26]} />
          <meshStandardMaterial color="#e7e0d2" roughness={1} />
        </mesh>
        <Text
          position={[0, 0, 0.012]}
          font={FONT}
          fontSize={0.085}
          letterSpacing={0.04}
          color="#1a1a1a"
          anchorX="center"
          anchorY="middle"
          maxWidth={Math.max(1.0, w * 0.46)}
        >
          {photo.title.toUpperCase()}
        </Text>
      </group>

      {/* warm pool of light on this piece */}
      <pointLight
        position={[0, 1.4, 1.6]}
        intensity={5}
        distance={7}
        decay={2}
        color="#ffe6c2"
      />
    </group>
  );
}

/* ---------- The room shell ---------- */
function Hall({ frontZ, backZ }: { frontZ: number; backZ: number }) {
  const length = Math.abs(frontZ - backZ);
  const centerZ = (frontZ + backZ) / 2;
  return (
    <group>
      {/* floor — dark polished stone that catches the lights */}
      <mesh
        position={[0, 0, centerZ]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
      >
        <planeGeometry args={[HALF_WIDTH * 2, length]} />
        <meshStandardMaterial color="#46424e" metalness={0.45} roughness={0.4} />
      </mesh>
      {/* ceiling */}
      <mesh position={[0, WALL_HEIGHT, centerZ]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[HALF_WIDTH * 2, length]} />
        <meshStandardMaterial color="#5e5a68" roughness={0.95} />
      </mesh>
      {/* left wall */}
      <mesh position={[-HALF_WIDTH, WALL_HEIGHT / 2, centerZ]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[length, WALL_HEIGHT]} />
        <meshStandardMaterial color="#7d7986" roughness={0.85} />
      </mesh>
      {/* right wall */}
      <mesh position={[HALF_WIDTH, WALL_HEIGHT / 2, centerZ]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[length, WALL_HEIGHT]} />
        <meshStandardMaterial color="#7d7986" roughness={0.85} />
      </mesh>
      {/* far wall */}
      <mesh position={[0, WALL_HEIGHT / 2, backZ]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[HALF_WIDTH * 2, WALL_HEIGHT]} />
        <meshStandardMaterial color="#736f7c" roughness={0.85} />
      </mesh>
      {/* entrance wall behind the start */}
      <mesh position={[0, WALL_HEIGHT / 2, frontZ]}>
        <planeGeometry args={[HALF_WIDTH * 2, WALL_HEIGHT]} />
        <meshStandardMaterial color="#736f7c" roughness={0.85} />
      </mesh>
    </group>
  );
}

/* ---------- Ceiling light fixtures down the centre ---------- */
function CeilingLights({ frontZ, backZ }: { frontZ: number; backZ: number }) {
  const fixtures = useMemo(() => {
    const arr: number[] = [];
    for (let z = frontZ - 4; z > backZ + 2; z -= 6) arr.push(z);
    return arr;
  }, [frontZ, backZ]);
  return (
    <>
      {fixtures.map((z, i) => (
        <group key={i} position={[0, WALL_HEIGHT - 0.06, z]}>
          <mesh>
            <boxGeometry args={[1.6, 0.06, 0.3]} />
            <meshBasicMaterial color="#fff3df" toneMapped={false} />
          </mesh>
          <pointLight intensity={2.2} distance={9} decay={2} color="#fff0d8" />
        </group>
      ))}
    </>
  );
}

/* ---------- Widen the view on portrait phones ---------- */
function ResponsiveCamera() {
  const { camera, size } = useThree();
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = size.width / size.height;
    cam.fov = aspect < 1 ? Math.min(92, 62 / Math.max(aspect, 0.5)) : 62;
    cam.updateProjectionMatrix();
  }, [camera, size.width, size.height]);
  return null;
}

/* ---------- Camera that walks the hall ---------- */
function Rig({ active, endZ }: { active: boolean; endZ: number }) {
  const scroll = useScroll();
  const { camera } = useThree();
  const start = useRef<number | null>(null);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    if (!active) {
      _v.set(Math.sin(t * 0.18) * 0.18, EYE + Math.sin(t * 0.5) * 0.02, 2.5);
      camera.position.lerp(_v, 1 - Math.exp(-3 * dt));
      camera.lookAt(0, EYE, -10);
      return;
    }
    if (start.current === null) start.current = t;
    const intro = 1 - easeOutCubic(Math.min(1, (t - start.current) / 1.6));
    const z = THREE.MathUtils.lerp(2, endZ, scroll.offset) + intro * 4;
    const sway = Math.sin(scroll.offset * Math.PI * 2) * 0.22 + Math.sin(t * 0.22) * 0.04;
    _v.set(sway, EYE + Math.sin(t * 0.4) * 0.015, z);
    camera.position.lerp(_v, 1 - Math.exp(-4 * dt));
    camera.lookAt(sway * 0.4, EYE, camera.position.z - 10);
  });
  return null;
}

/* ---------- Scene ---------- */
function Scene({
  photos,
  active,
  onSelect
}: {
  photos: Photo[];
  active: boolean;
  onSelect: (i: number) => void;
}) {
  const placements = useMemo<ArtworkPlacement[]>(
    () =>
      photos.map((photo, i) => ({
        photo,
        index: i,
        z: FIRST_Z - i * GAP,
        side: i % 2 === 0 ? -1 : 1
      })),
    [photos]
  );

  const lastZ = placements.length ? FIRST_Z - (placements.length - 1) * GAP : FIRST_Z;
  const frontZ = 6;
  const backZ = lastZ - 8;
  const endZ = lastZ - 4;

  return (
    <>
      <color attach="background" args={["#15131a"]} />
      <fog attach="fog" args={["#15131a", 24, 64]} />
      <ambientLight intensity={1.05} color="#fff3e6" />
      <hemisphereLight args={["#fff6ec", "#322e3a", 0.7]} />
      <directionalLight position={[0, 6, 6]} intensity={0.3} color="#fff2dd" />
      <ResponsiveCamera />

      <Hall frontZ={frontZ} backZ={backZ} />
      <CeilingLights frontZ={frontZ} backZ={backZ} />

      <Suspense fallback={null}>
        {placements.map((p) => (
          <Artwork key={p.photo.id} placement={p} onSelect={onSelect} />
        ))}
      </Suspense>

      <Rig active={active} endZ={endZ} />
    </>
  );
}

/* ---------- Canvas wrapper ---------- */
export default function Museum({
  photos,
  active,
  onSelect
}: {
  photos: Photo[];
  active: boolean;
  onSelect: (i: number) => void;
}) {
  const count = Math.max(1, photos.length);
  const pages = Math.max(3, ((count - 1) * GAP + 12) / 9);

  return (
    <div className="universe">
      <Canvas
        flat
        shadows={false}
        dpr={[1, 1.5]}
        gl={{ antialias: true, powerPreference: "high-performance" }}
        camera={{ position: [0, EYE, 2], fov: 62, near: 0.1, far: 100 }}
      >
        <Suspense fallback={null}>
          <ScrollControls pages={pages} damping={0.3}>
            <Scene photos={photos} active={active} onSelect={onSelect} />
          </ScrollControls>
        </Suspense>
      </Canvas>
    </div>
  );
}
