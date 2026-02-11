import { useEffect, useRef } from "react";

const VEC_GREEN = { r: 0, g: 255, b: 65 };
const VEC_CYAN = { r: 0, g: 229, b: 255 };
const GRID_SIZE = 48;

interface Star {
  x: number;
  y: number;
  brightness: number;
  speed: number;
  phase: number;
}

function createStar(width: number, height: number): Star {
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    brightness: Math.random() * 0.4 + 0.1,
    speed: Math.random() * 0.002 + 0.001,
    phase: Math.random() * Math.PI * 2,
  };
}

export function WorldGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const starsRef = useRef<Star[]>([]);
  const timeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const canvasElement: HTMLCanvasElement = canvas;
    const context: CanvasRenderingContext2D = ctx;

    let width = 0;
    let height = 0;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      width = window.innerWidth;
      height = window.innerHeight;
      canvasElement.width = width * dpr;
      canvasElement.height = height * dpr;
      canvasElement.style.width = `${width}px`;
      canvasElement.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    resize();
    window.addEventListener("resize", resize);

    starsRef.current = Array.from({ length: 80 }, () =>
      createStar(width, height),
    );

    function draw() {
      timeRef.current++;
      const t = timeRef.current;
      context.clearRect(0, 0, width, height);

      // ── Perspective grid (Atari Battlezone style) ──
      const horizon = height * 0.55;
      const vanishX = width / 2;
      const gridAlpha = 0.12;

      context.strokeStyle = `rgba(${VEC_GREEN.r}, ${VEC_GREEN.g}, ${VEC_GREEN.b}, ${gridAlpha})`;
      context.lineWidth = 0.5;

      // Horizontal lines receding toward horizon
      const hLineCount = 14;
      for (let i = 0; i < hLineCount; i++) {
        const ratio = i / hLineCount;
        const y = horizon + (height - horizon) * (ratio * ratio);
        const spread = 1 + ratio * 2;
        const x1 = vanishX - (width * spread) / 2;
        const x2 = vanishX + (width * spread) / 2;
        const lineAlpha = gridAlpha * (0.3 + ratio * 0.7);

        context.strokeStyle = `rgba(${VEC_GREEN.r}, ${VEC_GREEN.g}, ${VEC_GREEN.b}, ${lineAlpha})`;
        context.beginPath();
        context.moveTo(x1, y);
        context.lineTo(x2, y);
        context.stroke();
      }

      // Radial lines from vanishing point
      const vLineCount = 20;
      for (let i = 0; i < vLineCount; i++) {
        const angle = ((i - vLineCount / 2) / vLineCount) * Math.PI * 0.8;
        const endX = vanishX + Math.tan(angle) * (height - horizon) * 3;
        const lineAlpha =
          gridAlpha *
          (1 - (Math.abs(i - vLineCount / 2) / (vLineCount / 2)) * 0.5);

        context.strokeStyle = `rgba(${VEC_GREEN.r}, ${VEC_GREEN.g}, ${VEC_GREEN.b}, ${lineAlpha})`;
        context.beginPath();
        context.moveTo(vanishX, horizon);
        context.lineTo(endX, height + 20);
        context.stroke();
      }

      // ── Sky grid (subtle) ──
      const skyGridAlpha = 0.04;
      context.strokeStyle = `rgba(${VEC_CYAN.r}, ${VEC_CYAN.g}, ${VEC_CYAN.b}, ${skyGridAlpha})`;
      context.lineWidth = 0.5;
      const scrollOffset = (t * 0.08) % GRID_SIZE;

      for (
        let x = -GRID_SIZE + scrollOffset;
        x <= width + GRID_SIZE;
        x += GRID_SIZE
      ) {
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, horizon);
        context.stroke();
      }
      for (let y = -GRID_SIZE + scrollOffset; y <= horizon; y += GRID_SIZE) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();
      }

      // ── Stars (twinkling) ──
      const stars = starsRef.current;
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        if (!s) continue;
        const twinkle =
          s.brightness * (0.5 + 0.5 * Math.sin(t * s.speed * 10 + s.phase));
        if (s.y > horizon) continue;

        context.fillStyle = `rgba(${VEC_GREEN.r}, ${VEC_GREEN.g}, ${VEC_GREEN.b}, ${twinkle})`;
        context.fillRect(s.x, s.y, 1, 1);
      }

      // ── Horizon glow line ──
      const horizonGrad = context.createLinearGradient(
        0,
        horizon - 2,
        0,
        horizon + 8,
      );
      horizonGrad.addColorStop(0, "rgba(0, 255, 65, 0)");
      horizonGrad.addColorStop(0.3, "rgba(0, 255, 65, 0.15)");
      horizonGrad.addColorStop(0.5, "rgba(0, 255, 65, 0.3)");
      horizonGrad.addColorStop(0.7, "rgba(0, 255, 65, 0.15)");
      horizonGrad.addColorStop(1, "rgba(0, 255, 65, 0)");
      context.fillStyle = horizonGrad;
      context.fillRect(0, horizon - 2, width, 10);

      // Bright horizon line
      context.strokeStyle = `rgba(${VEC_GREEN.r}, ${VEC_GREEN.g}, ${VEC_GREEN.b}, 0.4)`;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(0, horizon);
      context.lineTo(width, horizon);
      context.stroke();

      // ── Floating vector shapes (distant mountains/structures) ──
      context.strokeStyle = `rgba(${VEC_GREEN.r}, ${VEC_GREEN.g}, ${VEC_GREEN.b}, 0.08)`;
      context.lineWidth = 1;

      // Mountain silhouettes
      const mtY = horizon - 20;
      context.beginPath();
      context.moveTo(width * 0.1, mtY);
      context.lineTo(width * 0.18, mtY - 60);
      context.lineTo(width * 0.25, mtY - 20);
      context.lineTo(width * 0.32, mtY - 80);
      context.lineTo(width * 0.42, mtY);
      context.stroke();

      context.beginPath();
      context.moveTo(width * 0.55, mtY);
      context.lineTo(width * 0.65, mtY - 50);
      context.lineTo(width * 0.72, mtY - 15);
      context.lineTo(width * 0.78, mtY - 70);
      context.lineTo(width * 0.88, mtY - 25);
      context.lineTo(width * 0.95, mtY);
      context.stroke();

      // ── Vignette ──
      const vignette = context.createRadialGradient(
        width / 2,
        height / 2,
        height * 0.15,
        width / 2,
        height / 2,
        height * 0.85,
      );
      vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
      vignette.addColorStop(1, "rgba(0, 0, 0, 0.7)");
      context.fillStyle = vignette;
      context.fillRect(0, 0, width, height);

      animRef.current = requestAnimationFrame(draw);
    }

    animRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas ref={canvasRef} className="fixed inset-0 z-0 pointer-events-none" />
  );
}
