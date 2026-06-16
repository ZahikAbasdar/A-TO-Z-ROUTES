"use client";

import { useRef, useEffect } from "react";
import mapboxgl from "mapbox-gl";
import { cn } from "@/lib/utils";
import "mapbox-gl/dist/mapbox-gl.css";

interface MiniMapProps {
  lat: number;
  lng: number;
  zoom?: number;
  className?: string;
  markerColor?: string;
}

export function MiniMap({
  lat,
  lng,
  zoom = 11,
  className,
  markerColor = "#3370f5",
}: MiniMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef       = useRef<mapboxgl.Map | null>(null);
  const hasToken     = !!process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !hasToken) return;
    mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

    const map = new mapboxgl.Map({
      container:          containerRef.current,
      style:              "mapbox://styles/mapbox/dark-v11",
      center:             [lng, lat],
      zoom,
      interactive:        false,   // static mini map
      attributionControl: false,
    });

    // Dot marker
    map.on("load", () => {
      const el = document.createElement("div");
      el.style.cssText = `
        width:14px;height:14px;border-radius:50%;
        background:${markerColor};
        border:2.5px solid white;
        box-shadow:0 0 8px ${markerColor}80;
      `;
      new mapboxgl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
    });

    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [lat, lng, zoom, markerColor, hasToken]);

  if (!hasToken) {
    return (
      <div className={cn("rounded-lg bg-white/4 border border-white/6 flex items-center justify-center text-xs text-muted-foreground", className)}>
        Map
      </div>
    );
  }

  return <div ref={containerRef} className={cn("rounded-lg overflow-hidden", className)} />;
}
