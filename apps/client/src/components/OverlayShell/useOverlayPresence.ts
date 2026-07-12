import { useEffect, useState } from "react";

export type OverlayPresence = "closed" | "opening" | "opened" | "closing";

type OverlayTransition = {
  readonly isTargetOpen: boolean;
  readonly presence: OverlayPresence;
};

export const useOverlayPresence = ({
  isOpen = false,
  animationDurationMs,
}: {
  readonly isOpen: boolean;
  readonly animationDurationMs: number;
}) => {
  const [transition, setTransition] = useState<OverlayTransition>(() => ({
    isTargetOpen: isOpen,
    presence: isOpen ? "opening" : "closed",
  }));

  if (transition.isTargetOpen !== isOpen) {
    setTransition({
      isTargetOpen: isOpen,
      presence: isOpen ? "opening" : "closing",
    });
  }

  useEffect(() => {
    if (transition.presence !== "opening" && transition.presence !== "closing") {
      return;
    }

    const timerId = window.setTimeout(() => {
      setTransition((current) => {
        switch (current.presence) {
          case "opening":
            return { ...current, presence: "opened" };
          case "closing":
            return { ...current, presence: "closed" };
          case "opened":
          case "closed":
            return current;
        }
      });
    }, animationDurationMs);

    return () => window.clearTimeout(timerId);
  }, [transition.presence, animationDurationMs]);

  return transition.presence;
};
