"use client";

import { useEffect } from "react";
import { useWebSocket } from "@/lib/hooks/useWebSocket";
import { useAuthStore } from "@/lib/store/authStore";

/**
 * Mounts a single persistent WebSocket connection for the authenticated user.
 * Handles global notifications and keeps the connection alive.
 * Place this inside the dashboard layout so it only runs when logged in.
 */
export function GlobalWSProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();

  const { state } = useWebSocket({
    enabled: isAuthenticated,
    // No extra rooms — personal user room is auto-joined by the server
  });

  return <>{children}</>;
}
