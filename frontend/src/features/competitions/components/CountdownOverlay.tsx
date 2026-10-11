interface CountdownOverlayProps {
  secondsLeft: number;
}

/** Full-screen 3-2-1, driven by the server's start time. */
export function CountdownOverlay({ secondsLeft }: CountdownOverlayProps) {
  // The small bias absorbs network latency in the clock offset so 3s never shows as "4".
  const value = Math.max(1, Math.ceil(secondsLeft - 0.15));
  return (
    <div className="countdown" role="timer" aria-live="assertive" aria-label={`Starting in ${value}`}>
      <p className="countdown__label">Get ready</p>
      <p key={value} className="countdown__digit">
        {value}
      </p>
      <p className="countdown__hint">The question appears for everyone at the same moment.</p>
    </div>
  );
}
