import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";

import { PwaOfflineScreen } from "./PwaStatusScreen";

const getIsOnline = () => {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
};

export const PwaConnectionBoundary = ({ children }: { readonly children: ReactNode }) => {
  const queryClient = useQueryClient();
  const [isOnline, setIsOnline] = useState(getIsOnline);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (isOnline) return;

    void queryClient.cancelQueries();
    queryClient.clear();
  }, [isOnline, queryClient]);

  if (isOnline) return <>{children}</>;

  return <PwaOfflineScreen onRetry={() => window.location.reload()} />;
};
