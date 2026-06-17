"use client";

import { useEffect, useRef } from "react";

/**
 * Fundo "centro de comando" do Radar 360 — porta o visual do mockup
 * conecta-são-josé: canvas de estrelas com cintilação suave + 3 orbs de aurora
 * em blur (estes via CSS, ver globals.css .aurora).
 *
 * Só o canvas precisa de JS, por isso é o único client component do shell —
 * as páginas de dados seguem server components (SSR + revalidate=0 preservados).
 */
export function AppBackground() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const cx = cv.getContext("2d");
    if (!cx) return;

    let stars: Array<{ x: number; y: number; r: number; a: number; v: number }> = [];
    let raf = 0;

    const seed = () => {
      cv.width = window.innerWidth;
      cv.height = window.innerHeight;
      const count = Math.min(110, Math.round((cv.width * cv.height) / 18000));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * cv.width,
        y: Math.random() * cv.height,
        r: Math.random() * 1.3 + 0.2,
        a: Math.random(),
        v: Math.random() * 0.012 + 0.004,
      }));
    };

    const loop = () => {
      cx.clearRect(0, 0, cv.width, cv.height);
      for (const s of stars) {
        s.a += s.v;
        const o = ((Math.sin(s.a * 6) + 1) / 2) * 0.6 + 0.1;
        cx.beginPath();
        cx.arc(s.x, s.y, s.r, 0, 7);
        cx.fillStyle = `rgba(160,200,255,${o})`;
        cx.fill();
      }
      raf = requestAnimationFrame(loop);
    };

    seed();
    loop();
    window.addEventListener("resize", seed);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", seed);
    };
  }, []);

  return (
    <>
      <canvas ref={ref} id="stars" aria-hidden />
      <div className="aurora" aria-hidden>
        <div className="orb o1" />
        <div className="orb o2" />
        <div className="orb o3" />
      </div>
    </>
  );
}
