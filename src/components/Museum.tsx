import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Text, useTexture, MeshReflectorMaterial } from "@react-three/drei";
import * as THREE from "three";
import type { Photo } from "../types";

export interface MoveState {
  dir: number; // -1 back, 0 idle, +1 forward
  impulse: number; // from wheel
}

/* ---------- Gallery dimensions ---------- */
const HALF_WIDTH = 4; // side walls at x = ±4
const WALL_HEIGHT = 5;
const EYE = 1.6; // camera/eye height
const FIRST_Z = -7; // first artwork
const GAP = 7; // spacing between artworks along the hall
const FONT = `${import.meta.env.BASE_URL}fonts/SpaceGrotesk.ttf`;

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

  // Left wall faces +x (rotY +90°), right wall faces -x (rotY -90°).
  const rotationY = side === -1 ? Math.PI / 2 : -Math.PI / 2;
  const x = side * (HALF_WIDTH - 0.06);

  const spotRef = useRef<THREE.SpotLight>(null);
  const targetRef = useRef<THREE.Object3D>(null);
  useEffect(() => {
    if (spotRef.current && targetRef.current) {
      spotRef.current.target = targetRef.current;
    }
  }, []);

  return (
    <group position={[x, EYE, z]} rotation={[0, rotationY, 0]}>
      {/* warm gallery spotlight: washes the wall + casts a soft shadow */}
      <spotLight
        ref={spotRef}
        position={[0, 2.9, 1.1]}
        angle={0.5}
        penumbra={0.9}
        intensity={13}
        distance={9}
        decay={1.6}
        color="#ffe9cf"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0008}
      />
      <object3D ref={targetRef} position={[0, -0.5, 0.2]} />

      {/* frame */}
      <mesh position={[0, 0, 0.02]} castShadow>
        <boxGeometry
          args={[w + frameBorder + matBorder, h + frameBorder + matBorder, 0.1]}
        />
        <meshStandardMaterial color="#100e0a" metalness={0.3} roughness={0.55} />
      </mesh>
      {/* off-white mat board */}
      <mesh position={[0, 0, 0.075]}>
        <planeGeometry args={[w + matBorder, h + matBorder]} />
        <meshStandardMaterial color="#efe7d6" roughness={0.95} />
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
    </group>
  );
}

/* ---------- Polished reflective stone floor ---------- */
function Floor({ length, centerZ }: { length: number; centerZ: number }) {
  const normal = useTexture(`${import.meta.env.BASE_URL}textures/floor_normal.jpg`);
  normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
  normal.repeat.set(HALF_WIDTH, length / 3);
  return (
    <mesh position={[0, 0, centerZ]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[HALF_WIDTH * 2, length]} />
      <MeshReflectorMaterial
        mirror={0.35}
        resolution={512}
        blur={[320, 110]}
        mixBlur={1.4}
        mixStrength={0.9}
        depthScale={1}
        minDepthThreshold={0.4}
        maxDepthThreshold={1.3}
        roughness={0.82}
        metalness={0.2}
        color="#b6a684"
        normalMap={normal}
        normalScale={new THREE.Vector2(0.06, 0.06)}
      />
    </mesh>
  );
}

/* ---------- The room shell ---------- */
function Hall({ frontZ, backZ }: { frontZ: number; backZ: number }) {
  const length = Math.abs(frontZ - backZ);
  const centerZ = (frontZ + backZ) / 2;
  return (
    <group>
      <Floor length={length} centerZ={centerZ} />
      {/* ceiling */}
      <mesh position={[0, WALL_HEIGHT, centerZ]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[HALF_WIDTH * 2, length]} />
        <meshStandardMaterial color="#b8a98c" roughness={0.97} />
      </mesh>
      {/* left wall */}
      <mesh position={[-HALF_WIDTH, WALL_HEIGHT / 2, centerZ]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[length, WALL_HEIGHT]} />
        <meshStandardMaterial color="#cdc1a9" roughness={0.97} />
      </mesh>
      {/* right wall */}
      <mesh position={[HALF_WIDTH, WALL_HEIGHT / 2, centerZ]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[length, WALL_HEIGHT]} />
        <meshStandardMaterial color="#cdc1a9" roughness={0.97} />
      </mesh>
      {/* far wall + a soft light so the hall end isn't a dark void */}
      <mesh position={[0, WALL_HEIGHT / 2, backZ]} rotation={[0, Math.PI, 0]}>
        <planeGeometry args={[HALF_WIDTH * 2, WALL_HEIGHT]} />
        <meshStandardMaterial color="#c2ad8f" roughness={0.97} />
      </mesh>
      <pointLight
        position={[0, 2.6, backZ + 3]}
        intensity={5}
        distance={14}
        decay={2}
        color="#ffeccf"
      />
      {/* entrance wall behind the start */}
      <mesh position={[0, WALL_HEIGHT / 2, frontZ]}>
        <planeGeometry args={[HALF_WIDTH * 2, WALL_HEIGHT]} />
        <meshStandardMaterial color="#c2ad8f" roughness={0.97} />
      </mesh>
    </group>
  );
}

/* ---------- Coffered wood ceiling beams ---------- */
function CofferedCeiling({ frontZ, backZ }: { frontZ: number; backZ: number }) {
  const length = Math.abs(frontZ - backZ);
  const centerZ = (frontZ + backZ) / 2;
  const cross = useMemo(() => {
    const arr: number[] = [];
    for (let z = frontZ - 2; z > backZ + 1; z -= 2.4) arr.push(z);
    return arr;
  }, [frontZ, backZ]);
  return (
    <group position={[0, WALL_HEIGHT - 0.13, 0]}>
      {[-2.6, 0, 2.6].map((x, i) => (
        <mesh key={`l${i}`} position={[x, 0, centerZ]} castShadow>
          <boxGeometry args={[0.16, 0.26, length]} />
          <meshStandardMaterial color="#4a3a27" roughness={0.85} />
        </mesh>
      ))}
      {cross.map((z, i) => (
        <mesh key={`c${i}`} position={[0, 0, z]} castShadow>
          <boxGeometry args={[HALF_WIDTH * 2, 0.26, 0.16]} />
          <meshStandardMaterial color="#4a3a27" roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

/* ---------- A viewing bench ---------- */
function Bench({ z }: { z: number }) {
  return (
    <group position={[0, 0, z]}>
      <mesh position={[0, 0.34, 0]} castShadow receiveShadow>
        <boxGeometry args={[2.1, 0.16, 0.62]} />
        <meshStandardMaterial color="#34281d" roughness={0.5} metalness={0.05} />
      </mesh>
      <mesh position={[0, 0.22, 0]} castShadow>
        <boxGeometry args={[2.2, 0.1, 0.7]} />
        <meshStandardMaterial color="#1d160e" roughness={0.6} />
      </mesh>
      {([[-0.95, -0.26], [0.95, -0.26], [-0.95, 0.26], [0.95, 0.26]] as const).map(
        ([lx, lz], i) => (
          <mesh key={i} position={[lx, 0.09, lz]} castShadow>
            <boxGeometry args={[0.08, 0.18, 0.08]} />
            <meshStandardMaterial color="#120d08" roughness={0.7} />
          </mesh>
        )
      )}
    </group>
  );
}

/* ---------- A plinth with a small sculpture ---------- */
function Pedestal({ x, z, kind }: { x: number; z: number; kind: 0 | 1 }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.55, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.5, 1.1, 0.5]} />
        <meshStandardMaterial color="#d9cfb9" roughness={0.7} />
      </mesh>
      {kind === 0 ? (
        <mesh position={[0, 1.36, 0]} castShadow>
          <icosahedronGeometry args={[0.26, 0]} />
          <meshStandardMaterial color="#b79c63" metalness={0.85} roughness={0.28} />
        </mesh>
      ) : (
        <mesh position={[0, 1.36, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[0.2, 0.07, 16, 40]} />
          <meshStandardMaterial color="#9aa3ad" metalness={0.9} roughness={0.25} />
        </mesh>
      )}
    </group>
  );
}

/* ---------- Furnishings placed down the hall ---------- */
function Furnishings({ placements }: { placements: ArtworkPlacement[] }) {
  return (
    <>
      {placements.map((p, i) =>
        i % 2 === 1 ? <Bench key={`bench${i}`} z={p.z} /> : null
      )}
      {placements.map((p, i) =>
        i % 2 === 0 ? (
          <Pedestal
            key={`ped${i}`}
            x={-p.side * 1.1}
            z={p.z}
            kind={(i % 4 === 0 ? 0 : 1) as 0 | 1}
          />
        ) : null
      )}
    </>
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

/* ---------- First-person tour controls (drag to look, walk) ---------- */
interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function FirstPerson({
  active,
  moveRef,
  bounds
}: {
  active: boolean;
  moveRef: React.MutableRefObject<MoveState>;
  bounds: Bounds;
}) {
  const { camera, gl } = useThree();
  const yaw = useRef(0); // 0 → looking down the hall (−z)
  const pitch = useRef(0);
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = gl.domElement;
    const onDown = (e: PointerEvent) => {
      drag.current = { x: e.clientX, y: e.clientY };
    };
    const onMove = (e: PointerEvent) => {
      if (!drag.current) return;
      const dx = e.clientX - drag.current.x;
      const dy = e.clientY - drag.current.y;
      drag.current = { x: e.clientX, y: e.clientY };
      yaw.current -= dx * 0.004;
      pitch.current = Math.max(-0.7, Math.min(0.7, pitch.current - dy * 0.004));
    };
    const onUp = () => {
      drag.current = null;
    };
    const setDir = (down: boolean) => (e: KeyboardEvent) => {
      if (e.key === "w" || e.key === "ArrowUp") moveRef.current.dir = down ? 1 : 0;
      if (e.key === "s" || e.key === "ArrowDown") moveRef.current.dir = down ? -1 : 0;
    };
    const kd = setDir(true);
    const ku = setDir(false);
    const onWheel = (e: WheelEvent) => {
      moveRef.current.impulse += -e.deltaY * 0.0016;
    };
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    el.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      el.removeEventListener("wheel", onWheel);
    };
  }, [gl, moveRef]);

  useFrame((state, dt) => {
    if (!active) {
      const t = state.clock.elapsedTime;
      camera.position.set(Math.sin(t * 0.18) * 0.15, EYE, 2.5);
      camera.lookAt(0, EYE, -10);
      return;
    }
    camera.rotation.order = "YXZ";
    camera.rotation.y = yaw.current;
    camera.rotation.x = pitch.current;

    const m = moveRef.current;
    let step = m.dir * 3.0 * dt + m.impulse;
    m.impulse *= 0.82;
    if (Math.abs(step) > 1e-5) {
      camera.position.x += -Math.sin(yaw.current) * step;
      camera.position.z += -Math.cos(yaw.current) * step;
    }
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, bounds.minX, bounds.maxX);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, bounds.minZ, bounds.maxZ);
    camera.position.y = EYE;
  });
  return null;
}

/* ---------- Scene ---------- */
function Scene({
  photos,
  active,
  onSelect,
  moveRef
}: {
  photos: Photo[];
  active: boolean;
  onSelect: (i: number) => void;
  moveRef: React.MutableRefObject<MoveState>;
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
  const bounds: Bounds = {
    minX: -(HALF_WIDTH - 0.6),
    maxX: HALF_WIDTH - 0.6,
    minZ: backZ + 1.2,
    maxZ: frontZ - 1.2
  };

  return (
    <>
      <color attach="background" args={["#1c160f"]} />
      <fog attach="fog" args={["#241c12", 45, 120]} />
      <ambientLight intensity={0.5} color="#fff1e2" />
      <hemisphereLight args={["#ffe9d2", "#3a3226", 0.4]} />
      <directionalLight position={[0, 6, 6]} intensity={0.3} color="#fff2dd" />
      <ResponsiveCamera />

      <Hall frontZ={frontZ} backZ={backZ} />
      <CofferedCeiling frontZ={frontZ} backZ={backZ} />
      <CeilingLights frontZ={frontZ} backZ={backZ} />
      <Furnishings placements={placements} />

      <Suspense fallback={null}>
        {placements.map((p) => (
          <Artwork key={p.photo.id} placement={p} onSelect={onSelect} />
        ))}
      </Suspense>

      <FirstPerson active={active} moveRef={moveRef} bounds={bounds} />
    </>
  );
}

/* ---------- Canvas wrapper + on-screen walk controls ---------- */
export default function Museum({
  photos,
  active,
  onSelect
}: {
  photos: Photo[];
  active: boolean;
  onSelect: (i: number) => void;
}) {
  const moveRef = useRef<MoveState>({ dir: 0, impulse: 0 });
  const set = (d: number) => () => (moveRef.current.dir = d);

  return (
    <div className="universe">
      <Canvas
        shadows="soft"
        dpr={[1, 1.5]}
        gl={{ antialias: true, powerPreference: "high-performance", toneMappingExposure: 1.1 }}
        camera={{ position: [0, EYE, 2], fov: 62, near: 0.1, far: 100 }}
      >
        <Suspense fallback={null}>
          <Scene
            photos={photos}
            active={active}
            onSelect={onSelect}
            moveRef={moveRef}
          />
        </Suspense>
      </Canvas>

      {active && (
        <div className="tour-controls">
          <button
            className="tour-btn"
            aria-label="Walk forward"
            onPointerDown={set(1)}
            onPointerUp={set(0)}
            onPointerLeave={set(0)}
          >
            ▲
          </button>
          <button
            className="tour-btn"
            aria-label="Walk back"
            onPointerDown={set(-1)}
            onPointerUp={set(0)}
            onPointerLeave={set(0)}
          >
            ▼
          </button>
        </div>
      )}
    </div>
  );
}
