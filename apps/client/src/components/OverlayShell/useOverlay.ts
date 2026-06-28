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
      return "opening";
    }
    return "closed";
  });

  const open = useCallback(() => setPresence("opening"), []);
  const close = useCallback(() => setPresence("closing"), []);

  useEffect(() => {
    switch (presence) {
      case "opening": {
        const timerId = window.setTimeout(() => {
          setPresence("opened");
        }, presenceAnimationDurationMs);
        return () => window.clearTimeout(timerId);
      }
      case "closing": {
        const timerId = window.setTimeout(() => {
          setPresence("closed");
        }, presenceAnimationDurationMs);
        return () => window.clearTimeout(timerId);
      }
      default:
        break;
    }
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
