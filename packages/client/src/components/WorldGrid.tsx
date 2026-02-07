import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
}

const PARTICLE_COUNT = 60;
const GRID_SIZE = 40;

function createParticle(width: number, height: number): Particle {
  const isAmber = Math.random() > 0.4;
  return {
    x: Math.random() * width,
    y: Math.random() * height,
    vx: (Math.random() - 0.5) * 0.3,
    vy: (Math.random() - 0.5) * 0.3 - 0.15,
    radius: Math.random() * 2 + 0.5,
    color: isAmber ? "232, 168, 50" : "34, 211, 238",
    alpha: 0,
    life: 0,
    maxLife: Math.random() * 400 + 200,
  };
}

export function WorldGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>([]);
  const mouseRef = useRef({ x: -1000, y: -1000 });
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

    // Initialize particles
    particlesRef.current = Array.from({ length: PARTICLE_COUNT }, () =>
      createParticle(width, height),
    );
    // Stagger their initial life so they don't all appear at once
    for (const p of particlesRef.current) {
      p.life = Math.random() * p.maxLife;
    }

    function handleMouseMove(e: MouseEvent) {
      mouseRef.current = { x: e.clientX, y: e.clientY };
    }
    window.addEventListener("mousemove", handleMouseMove);

    function draw() {
      timeRef.current++;
      const t = timeRef.current;
      context.clearRect(0, 0, width, height);

      // --- Draw grid ---
      const gridOffset = (t * 0.15) % GRID_SIZE;
      context.strokeStyle = "rgba(26, 48, 68, 0.25)";
      context.lineWidth = 0.5;

      // Vertical lines
      for (
        let x = -GRID_SIZE + gridOffset;
        x <= width + GRID_SIZE;
        x += GRID_SIZE
      ) {
        const mx = mouseRef.current.x;
        const my = mouseRef.current.y;
        const distToMouse = Math.abs(x - mx);
        const warp =
          distToMouse < 120
            ? Math.sin(((120 - distToMouse) / 120) * Math.PI) * 6
            : 0;

        context.beginPath();
        context.moveTo(x, 0);
        // Slight curve near mouse
        if (warp > 0) {
          const dir = my < height / 2 ? 1 : -1;
          context.quadraticCurveTo(x + warp * dir, my, x, height);
        } else {
          context.lineTo(x, height);
        }
        context.stroke();
      }

      // Horizontal lines
      for (
        let y = -GRID_SIZE + gridOffset;
        y <= height + GRID_SIZE;
        y += GRID_SIZE
      ) {
        const mx = mouseRef.current.x;
        const my = mouseRef.current.y;
        const distToMouse = Math.abs(y - my);
        const warp =
          distToMouse < 120
            ? Math.sin(((120 - distToMouse) / 120) * Math.PI) * 6
            : 0;

        context.beginPath();
        context.moveTo(0, y);
        if (warp > 0) {
          const dir = mx < width / 2 ? 1 : -1;
          context.quadraticCurveTo(mx, y + warp * dir, width, y);
        } else {
          context.lineTo(width, y);
        }
        context.stroke();
      }

      // --- Grid intersection highlights near mouse ---
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      for (
        let x = -GRID_SIZE + gridOffset;
        x <= width + GRID_SIZE;
        x += GRID_SIZE
      ) {
        for (
          let y = -GRID_SIZE + gridOffset;
          y <= height + GRID_SIZE;
          y += GRID_SIZE
        ) {
          const dx = x - mx;
          const dy = y - my;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 150) {
            const alpha = (1 - dist / 150) * 0.4;
            context.fillStyle = `rgba(232, 168, 50, ${alpha})`;
            context.beginPath();
            context.arc(x, y, 1.5, 0, Math.PI * 2);
            context.fill();
          }
        }
      }

      // --- Particles ---
      const particles = particlesRef.current;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (!p) continue;
        p.life++;
        p.x += p.vx;
        p.y += p.vy;

        // Fade in/out
        const lifeRatio = p.life / p.maxLife;
        if (lifeRatio < 0.1) {
          p.alpha = lifeRatio / 0.1;
        } else if (lifeRatio > 0.8) {
          p.alpha = (1 - lifeRatio) / 0.2;
        } else {
          p.alpha = 1;
        }

        // Respawn
        if (
          p.life >= p.maxLife ||
          p.x < -20 ||
          p.x > width + 20 ||
          p.y < -20 ||
          p.y > height + 20
        ) {
          particles[i] = createParticle(width, height);
          continue;
        }

        // Mouse repulsion
        const pdx = p.x - mx;
        const pdy = p.y - my;
        const pdist = Math.sqrt(pdx * pdx + pdy * pdy);
        if (pdist < 100 && pdist > 0) {
          const force = ((100 - pdist) / 100) * 0.5;
          p.vx += (pdx / pdist) * force;
          p.vy += (pdy / pdist) * force;
        }

        // Damping
        p.vx *= 0.99;
        p.vy *= 0.99;

        // Draw particle
        const glowAlpha = p.alpha * 0.15;
        const gradient = context.createRadialGradient(
          p.x,
          p.y,
          0,
          p.x,
          p.y,
          p.radius * 8,
        );
        gradient.addColorStop(0, `rgba(${p.color}, ${glowAlpha})`);
        gradient.addColorStop(1, `rgba(${p.color}, 0)`);
        context.fillStyle = gradient;
        context.beginPath();
        context.arc(p.x, p.y, p.radius * 8, 0, Math.PI * 2);
        context.fill();

        // Core
        context.fillStyle = `rgba(${p.color}, ${p.alpha * 0.8})`;
        context.beginPath();
        context.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        context.fill();
      }

      // --- Vignette ---
      const vignette = context.createRadialGradient(
        width / 2,
        height / 2,
        height * 0.2,
        width / 2,
        height / 2,
        height * 0.9,
      );
      vignette.addColorStop(0, "rgba(5, 7, 11, 0)");
      vignette.addColorStop(1, "rgba(5, 7, 11, 0.6)");
      context.fillStyle = vignette;
      context.fillRect(0, 0, width, height);

      animRef.current = requestAnimationFrame(draw);
    }

    animRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  return (
    <canvas ref={canvasRef} className="fixed inset-0 z-0 pointer-events-none" />
  );
}
