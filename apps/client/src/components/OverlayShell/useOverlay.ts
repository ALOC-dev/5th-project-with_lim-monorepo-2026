import { useCallback, useEffect, useState } from "react";

export type OverlayPresence = "closed" | "opened" | "closing" | "opening";

type Brand<K, T> = K & { __brand: T };

export type PresenceAnimationDurationMs = Brand<number, "ms">;

export const useOverlay = ({
  initialOpen = false,
  presenceAnimationDurationMs,
}: {
  initialOpen: boolean;
  presenceAnimationDurationMs: number;
}) => {
  const [presence, setPresence] = useState<OverlayPresence>(() => {
    if (initialOpen) {
      if (presenceAnimationDurationMs === 0) {
        return "opened";
      }
      return "opening";
    }
    return "closed";
  });

  const open = useCallback(() => setPresence("opening"), []);
  const close = useCallback(() => setPresence("closing"), []);

  useEffect(() => {
    if (presence !== "opening" && presence !== "closing") return;

    const nextPresence = presence === "opening" ? "opened" : "closed";

    const timerId = window.setTimeout(() => {
      setPresence(nextPresence);
    }, presenceAnimationDurationMs);

    return () => window.clearTimeout(timerId);
  }, [presence, presenceAnimationDurationMs]);

  return {
    presence,
    isMounted: presence !== "closed",
    isAnimating: presence === "opening" || presence === "closing",
    presenceAnimationDurationMs: presenceAnimationDurationMs as PresenceAnimationDurationMs,
    open,
    close,
  };
};
