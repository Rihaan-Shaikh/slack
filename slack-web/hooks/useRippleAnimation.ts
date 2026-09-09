import { useState, useEffect } from "react";

export function useRippleAnimation(disruptedBookingId?: string | null, ripplePath: string[] = []) {
  const [revealedRippleIndex, setRevealedRippleIndex] = useState<number>(-1);

  useEffect(() => {
    if (disruptedBookingId && ripplePath.length > 0) {
      setRevealedRippleIndex(0);
      let step = 0;
      const interval = setInterval(() => {
        step += 1;
        if (step < ripplePath.length) {
          setRevealedRippleIndex(step);
        } else {
          clearInterval(interval);
        }
      }, 280);

      return () => clearInterval(interval);
    } else {
      setRevealedRippleIndex(-1);
    }
  }, [disruptedBookingId, ripplePath]);

  return { revealedRippleIndex };
}
