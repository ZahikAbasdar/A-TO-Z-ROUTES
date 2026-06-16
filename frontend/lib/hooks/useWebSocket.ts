"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/lib/store/authStore";
import { tokenStorage } from "@/lib/api/client";
import { WSMessage, WSMessageType } from "@/types";
import toast from "react-hot-toast";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000/ws";

type MessageHandler = (payload: unknown) => void;

interface UseWebSocketOptions {
  /** Rooms to auto-subscribe on connect */
  rooms?: string[];
  /** Per-message-type handlers */
  handlers?: Partial<Record<WSMessageType | string, MessageHandler>>;
  /** Whether to connect at all */
  enabled?: boolean;
}

type ConnectionState = "idle" | "connecting" | "connected" | "disconnected" | "error";

export function useWebSocket({
  rooms = [],
  handlers = {},
  enabled = true,
}: UseWebSocketOptions = {}) {
  const wsRef            = useRef<WebSocket | null>(null);
  const reconnectTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempt = useRef(0);
  const handlersRef      = useRef(handlers);
  const roomsRef         = useRef(rooms);
  const mountedRef       = useRef(true);

  const [state, setState] = useState<ConnectionState>("idle");
  const queryClient       = useQueryClient();
  const { user }          = useAuthStore();

  // Keep handler refs fresh without re-connecting
  useEffect(() => { handlersRef.current = handlers; }, [handlers]);
  useEffect(() => { roomsRef.current = rooms; }, [rooms]);

  const send = useCallback((message: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const subscribe = useCallback((room: string) => {
    send({ action: "subscribe", room });
  }, [send]);

  const unsubscribe = useCallback((room: string) => {
    send({ action: "unsubscribe", room });
  }, [send]);

  const sendDriverLocation = useCallback((
    shipmentId: string, lat: number, lng: number
  ) => {
    send({ action: "driver_location", shipment_id: shipmentId, lat, lng });
  }, [send]);

  const connect = useCallback(() => {
    if (!enabled || !mountedRef.current) return;

    const token = tokenStorage.getAccess();
    if (!token) {
      setState("idle");
      return;
    }

    // Close stale connection
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
    }

    setState("connecting");
    const ws = new WebSocket(`${WS_URL}?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      reconnectAttempt.current = 0;
      setState("connected");

      // Subscribe to all requested rooms
      roomsRef.current.forEach((room) => {
        ws.send(JSON.stringify({ action: "subscribe", room }));
      });
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const msg: WSMessage = JSON.parse(event.data);
        handleMessage(msg);
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = (event) => {
      if (!mountedRef.current) return;
      setState("disconnected");

      // Don't reconnect on auth failure
      if (event.code === 4001) {
        setState("error");
        return;
      }

      // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
      const delay = Math.min(1000 * 2 ** reconnectAttempt.current, 30_000);
      reconnectAttempt.current++;
      reconnectTimer.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      if (!mountedRef.current) return;
      setState("error");
    };
  }, [enabled]);

  const handleMessage = useCallback((msg: WSMessage) => {
    const handler = handlersRef.current[msg.type];
    if (handler) {
      handler(msg.payload);
      return;
    }

    // Default handlers for common message types
    switch (msg.type) {
      case "tracking_update": {
        const p = msg.payload as any;
        // Invalidate tracking query so UI refreshes
        queryClient.invalidateQueries({ queryKey: ["tracking", p.shipment_id] });
        queryClient.invalidateQueries({ queryKey: ["shipments"] });
        break;
      }
      case "notification": {
        const p = msg.payload as any;
        toast(p.body, {
          icon: "📦",
          style: {
            background: "hsl(222,22%,11%)",
            color: "hsl(210,20%,92%)",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: "10px",
            fontSize: "13px",
          },
        });
        // Invalidate notifications list
        queryClient.invalidateQueries({ queryKey: ["notifications"] });
        break;
      }
      case "connected":
        break; // handled by onopen
      case "pong":
        break; // heartbeat ack
    }
  }, [queryClient]);

  // Start heartbeat ping every 25s to keep connection alive
  useEffect(() => {
    if (state !== "connected") return;
    const interval = setInterval(() => send({ action: "ping" }), 25_000);
    return () => clearInterval(interval);
  }, [state, send]);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    mountedRef.current = true;
    if (enabled && user) connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [enabled, user?.id]);

  // Re-subscribe when rooms list changes
  useEffect(() => {
    if (state !== "connected") return;
    rooms.forEach((room) => subscribe(room));
  }, [rooms.join(","), state]);

  return {
    state,
    isConnected: state === "connected",
    subscribe,
    unsubscribe,
    send,
    sendDriverLocation,
  };
}
