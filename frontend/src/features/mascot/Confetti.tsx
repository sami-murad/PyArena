import { useReducedMotion } from "@/hooks/useReducedMotion";

const PIECES = 26;
const COLORS = ["var(--color-primary)", "var(--color-accent)", "var(--color-success)", "var(--color-danger)"];

/**
 * A short confetti burst made of CSS-animated spans (no canvas, no library).
 * Renders nothing with reduced motion. Decorative: hidden from assistive tech.
 */
export function Confetti() {
  const reduced = useReducedMotion();
  if (reduced) return null;
  return (
    <div className="confetti" aria-hidden="true" data-testid="confetti">
      {Array.from({ length: PIECES }, (_, i) => {
        // Deterministic spread: evenly around a half circle, varied distance and spin.
        const angle = Math.PI * (0.05 + (0.9 * i) / (PIECES - 1));
        const distance = 90 + ((i * 37) % 70);
        const style = {
          "--dx": `${(-Math.cos(angle) * distance).toFixed(0)}px`,
          "--dy": `${(-Math.sin(angle) * distance).toFixed(0)}px`,
          "--spin": `${((i * 97) % 540) - 270}deg`,
          "--delay": `${(i % 5) * 30}ms`,
          background: COLORS[i % COLORS.length],
        } as React.CSSProperties;
        return <span key={i} className="confetti__piece" style={style} />;
      })}
    </div>
  );
}
