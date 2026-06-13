import { useEffect, useRef } from "react";

interface Star {
  x: number;
  y: number;
  r: number;
  baseAlpha: number;
  twinkleSpeed: number;
  twinklePhase: number;
  depth: number; // 0..1, larger = closer = more parallax
}

interface ShootingStar {
  x: number;
  y: number;
  vx: number;
  vy: number;
  len: number;
  life: number;
  maxLife: number;
}

interface Planet {
  cx: number; // center as fraction of width
  cy: number; // center as fraction of height
  radius: number; // px
  colorInner: string;
  colorOuter: string;
  glow: string;
  driftX: number;
  driftY: number;
  driftSpeed: number;
  phase: number;
}

const PLANETS: Planet[] = [
  {
    cx: 0.16,
    cy: 0.72,
    radius: 90,
    colorInner: "#7aa2ff",
    colorOuter: "#1a2a5e",
    glow: "rgba(122,162,255,0.25)",
    driftX: 18,
    driftY: 10,
    driftSpeed: 0.06,
    phase: 0
  },
  {
    cx: 0.83,
    cy: 0.24,
    radius: 54,
    colorInner: "#ffb38a",
    colorOuter: "#5e2a1a",
    glow: "rgba(255,150,110,0.22)",
    driftX: 14,
    driftY: 20,
    driftSpeed: 0.045,
    phase: 2.1
  },
  {
    cx: 0.62,
    cy: 0.85,
    radius: 32,
    colorInner: "#b58aff",
    colorOuter: "#2a1a5e",
    glow: "rgba(170,130,255,0.18)",
    driftX: 22,
    driftY: 12,
    driftSpeed: 0.05,
    phase: 4.0
  }
];

export default function SpaceScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const node = canvasRef.current;
    if (!node) return;
    const rawCtx = node.getContext("2d");
    if (!rawCtx) return;
    // Explicit non-null types so narrowing holds inside the animation closures.
    const canvas: HTMLCanvasElement = node;
    const ctx: CanvasRenderingContext2D = rawCtx;

    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let stars: Star[] = [];
    let shooting: ShootingStar[] = [];
    let rafId = 0;
    let last = performance.now();
    let nextShootingAt = 1200;
    let elapsed = 0;

    function buildStars() {
      const count = Math.round((width * height) / 7000);
      stars = Array.from({ length: count }, () => {
        const depth = Math.random();
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          r: 0.4 + depth * 1.4,
          baseAlpha: 0.25 + Math.random() * 0.6,
          twinkleSpeed: 0.6 + Math.random() * 1.8,
          twinklePhase: Math.random() * Math.PI * 2,
          depth
        };
      });
    }

    function resize() {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildStars();
    }

    function spawnShootingStar() {
      const fromLeft = Math.random() > 0.5;
      const startX = fromLeft ? -40 : width + 40;
      const startY = Math.random() * height * 0.5;
      const speed = 480 + Math.random() * 360;
      const angle = (fromLeft ? 0.32 : Math.PI - 0.32) + (Math.random() - 0.5) * 0.18;
      shooting.push({
        x: startX,
        y: startY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        len: 120 + Math.random() * 120,
        life: 0,
        maxLife: 1.1 + Math.random() * 0.6
      });
    }

    function drawPlanet(p: Planet, t: number) {
      const offX = Math.cos(t * p.driftSpeed + p.phase) * p.driftX;
      const offY = Math.sin(t * p.driftSpeed + p.phase) * p.driftY;
      const x = p.cx * width + offX;
      const y = p.cy * height + offY;

      // soft glow halo
      const halo = ctx.createRadialGradient(x, y, p.radius * 0.6, x, y, p.radius * 2.4);
      halo.addColorStop(0, p.glow);
      halo.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(x, y, p.radius * 2.4, 0, Math.PI * 2);
      ctx.fill();

      // planet body, lit from upper-left
      const body = ctx.createRadialGradient(
        x - p.radius * 0.4,
        y - p.radius * 0.4,
        p.radius * 0.2,
        x,
        y,
        p.radius
      );
      body.addColorStop(0, p.colorInner);
      body.addColorStop(1, p.colorOuter);
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(x, y, p.radius, 0, Math.PI * 2);
      ctx.fill();
    }

    function frame(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      elapsed += dt * 1000;
      const t = now / 1000;

      ctx.clearRect(0, 0, width, height);

      // deep-space vertical wash
      const bg = ctx.createLinearGradient(0, 0, 0, height);
      bg.addColorStop(0, "#05060f");
      bg.addColorStop(0.55, "#070514");
      bg.addColorStop(1, "#02030a");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, width, height);

      // planets sit behind the stars
      for (const p of PLANETS) drawPlanet(p, prefersReduced ? 0 : t);

      // stars
      for (const s of stars) {
        const tw = prefersReduced
          ? s.baseAlpha
          : s.baseAlpha *
            (0.55 + 0.45 * Math.sin(t * s.twinkleSpeed + s.twinklePhase));
        ctx.globalAlpha = Math.max(0, Math.min(1, tw));
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // shooting stars
      if (!prefersReduced && elapsed >= nextShootingAt) {
        spawnShootingStar();
        nextShootingAt = elapsed + 2600 + Math.random() * 4200;
      }
      shooting = shooting.filter((m) => m.life < m.maxLife);
      for (const m of shooting) {
        m.life += dt;
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        const fade = 1 - m.life / m.maxLife;
        const tailX = m.x - (m.vx / 600) * m.len;
        const tailY = m.y - (m.vy / 600) * m.len;
        const grad = ctx.createLinearGradient(m.x, m.y, tailX, tailY);
        grad.addColorStop(0, `rgba(255,255,255,${0.9 * fade})`);
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(tailX, tailY);
        ctx.stroke();
      }

      rafId = requestAnimationFrame(frame);
    }

    resize();
    window.addEventListener("resize", resize);
    rafId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="space-canvas" aria-hidden="true" />;
}
