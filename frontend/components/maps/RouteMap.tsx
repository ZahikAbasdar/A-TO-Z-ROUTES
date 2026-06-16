"use client";

import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Maximize2, Minimize2, Crosshair, Layers } from "lucide-react";
import { useMapbox, MapMarker, RouteCoord } from "@/lib/hooks/useMapbox";
import { cn } from "@/lib/utils";
import "mapbox-gl/dist/mapbox-gl.css";

interface RouteMapProps {
  markers?: MapMarker[];
  route?: RouteCoord[];
  driverLocation?: { lat: number; lng: number } | null;
  className?: string;
  height?: string;
  showLegend?: boolean;
}

export function RouteMap({
  markers = [],
  route = [],
  driverLocation = null,
  className,
  height = "h-80",
  showLegend = true,
}: RouteMapProps) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded]   = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const hasToken = !!process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  const { flyTo, fitMarkers } = useMapbox({
    containerRef,
    markers,
    route,
    driverLocation,
    onLoad: () => setMapLoaded(true),
  });

  if (!hasToken) {
    return (
      <div className={cn("rounded-xl border border-white/6 bg-white/3 flex items-center justify-center", height, className)}>
        <div className="text-center space-y-2 p-6">
          <Layers className="w-8 h-8 text-muted-foreground mx-auto" />
          <p className="text-sm font-medium">Map Preview</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            Add <code className="bg-white/8 px-1 py-0.5 rounded text-[11px]">NEXT_PUBLIC_MAPBOX_TOKEN</code> to{" "}
            <code className="bg-white/8 px-1 py-0.5 rounded text-[11px]">.env.local</code> to enable the live map.
          </p>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      layout
      className={cn(
        "relative rounded-xl overflow-hidden border border-white/6",
        expanded ? "fixed inset-4 z-50" : height,
        className
      )}
    >
      {/* Map container */}
      <div ref={containerRef} className="absolute inset-0" />

      {/* Loading overlay */}
      {!mapLoaded && (
        <div className="absolute inset-0 bg-[hsl(var(--surface-2))] flex items-center justify-center">
          <div className="text-center space-y-3">
            <div className="w-8 h-8 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
            <p className="text-xs text-muted-foreground">Loading map...</p>
          </div>
        </div>
      )}

      {/* Controls overlay */}
      {mapLoaded && (
        <div className="absolute top-3 left-3 flex flex-col gap-2 z-10">
          {/* Re-center */}
          <button
            onClick={fitMarkers}
            className="w-8 h-8 rounded-lg glass flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            title="Fit all markers"
          >
            <Crosshair className="w-3.5 h-3.5" />
          </button>

          {/* Expand / collapse */}
          <button
            onClick={() => setExpanded((e) => !e)}
            className="w-8 h-8 rounded-lg glass flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
            title={expanded ? "Collapse map" : "Expand map"}
          >
            {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      )}

      {/* Legend */}
      {mapLoaded && showLegend && (
        <div className="absolute bottom-3 left-3 z-10">
          <div className="glass rounded-lg px-3 py-2 flex items-center gap-3">
            {[
              { color: "#3370f5", label: "Origin" },
              { color: "#00e5a0", label: "Destination" },
              ...(driverLocation ? [{ color: "#06d6e8", label: "Driver" }] : []),
              ...(route.length > 0 ? [{ color: "#3370f5", label: "Route", isDash: true }] : []),
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-1.5">
                {item.isDash ? (
                  <div className="flex items-center gap-0.5">
                    <div className="w-2 h-px rounded" style={{ backgroundColor: item.color }} />
                    <div className="w-1 h-px rounded opacity-0" />
                    <div className="w-2 h-px rounded" style={{ backgroundColor: item.color }} />
                  </div>
                ) : (
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                )}
                <span className="text-[10px] text-muted-foreground">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Live indicator for driver */}
      {driverLocation && mapLoaded && (
        <div className="absolute top-3 right-12 z-10">
          <div className="glass rounded-full px-2.5 py-1 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <span className="text-[10px] text-muted-foreground">Live</span>
          </div>
        </div>
      )}

      {/* Expanded backdrop */}
      {expanded && (
        <div
          className="fixed inset-0 bg-black/60 -z-10"
          onClick={() => setExpanded(false)}
        />
      )}
    </motion.div>
  );
}
