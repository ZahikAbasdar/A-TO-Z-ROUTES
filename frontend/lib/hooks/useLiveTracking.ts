"use client";

import { useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWebSocket } from "./useWebSocket";

interface LiveEvent {
  status: string;
  description: string | null;
  location_name: string | null;
  latitude: number | null;
  longitude: number | null;
  timestamp: string;
}

interface LiveDriverLocation {
  lat: number;
  lng: number;
  timestamp: string;
}

export function useLiveTracking(shipmentId: string | null) {
  const [liveEvents,   setLiveEvents]   = useState<LiveEvent[]>([]);
  const [driverLoc,    setDriverLoc]    = useState<LiveDriverLocation | null>(null);
  const [lastActivity, setLastActivity] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const handleTrackingUpdate = useCallback((payload: unknown) => {
    const p = payload as any;
    if (p.shipment_id !== shipmentId) return;

    const event: LiveEvent = {
      status:        p.status,
      description:   p.description,
      location_name: p.location_name,
      latitude:      p.latitude,
      longitude:     p.longitude,
      timestamp:     new Date().toISOString(),
    };

    setLiveEvents((prev) => [event, ...prev].slice(0, 50));
    setLastActivity(event.timestamp);

    // Refresh full tracking data
    queryClient.invalidateQueries({ queryKey: ["tracking", shipmentId] });
  }, [shipmentId, queryClient]);

  const handleDriverLocation = useCallback((payload: unknown) => {
    const p = payload as any;
    if (p.shipment_id !== shipmentId) return;

    setDriverLoc({
      lat:       p.latitude,
      lng:       p.longitude,
      timestamp: new Date().toISOString(),
    });
    setLastActivity(new Date().toISOString());
  }, [shipmentId]);

  const { state, isConnected, subscribe, unsubscribe } = useWebSocket({
    enabled: !!shipmentId,
    rooms:   shipmentId ? [`shipment:${shipmentId}`] : [],
    handlers: {
      tracking_update: handleTrackingUpdate,
      driver_location: handleDriverLocation,
    },
  });

  return {
    wsState:      state,
    isLive:       isConnected,
    liveEvents,
    driverLoc,
    lastActivity,
    clearEvents:  () => setLiveEvents([]),
  };
}
