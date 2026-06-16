import { useEffect, useRef, useCallback } from "react";
import mapboxgl from "mapbox-gl";

mapboxgl.accessToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  type: "origin" | "destination" | "transit" | "driver" | "event";
  label?: string;
  color?: string;
}

export interface RouteCoord {
  lat: number;
  lng: number;
}

interface UseMapboxOptions {
  containerRef: React.RefObject<HTMLDivElement>;
  markers?: MapMarker[];
  route?: RouteCoord[];
  driverLocation?: { lat: number; lng: number } | null;
  onLoad?: () => void;
}

export function useMapbox({
  containerRef,
  markers = [],
  route = [],
  driverLocation = null,
  onLoad,
}: UseMapboxOptions) {
  const mapRef         = useRef<mapboxgl.Map | null>(null);
  const markersRef     = useRef<Map<string, mapboxgl.Marker>>(new Map());
  const driverMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const isLoadedRef    = useRef(false);

  // ── Initialize map ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (!mapboxgl.accessToken) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style:     "mapbox://styles/mapbox/dark-v11",
      center:    [78.9629, 20.5937], // India default
      zoom:      4,
      attributionControl: false,
      logoPosition: "bottom-right",
    });

    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    map.on("load", () => {
      isLoadedRef.current = true;
      onLoad?.();
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      isLoadedRef.current = false;
    };
  }, []);

  // ── Sync markers ──────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current) return;

    // Remove stale markers
    const incomingIds = new Set(markers.map((m) => m.id));
    markersRef.current.forEach((marker, id) => {
      if (!incomingIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    });

    // Add or update markers
    markers.forEach((m) => {
      if (markersRef.current.has(m.id)) return;

      const el = createMarkerEl(m);
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat([m.lng, m.lat]);

      if (m.label) {
        marker.setPopup(
          new mapboxgl.Popup({ offset: 24, closeButton: false })
            .setHTML(`<div class="px-2 py-1 text-xs font-medium">${m.label}</div>`)
        );
      }

      marker.addTo(map);
      markersRef.current.set(m.id, marker);
    });
  }, [markers]);

  // ── Draw route line ───────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const drawRoute = () => {
      if (route.length < 2) return;

      const coords = route.map((c) => [c.lng, c.lat] as [number, number]);
      const geojson: GeoJSON.Feature<GeoJSON.LineString> = {
        type:     "Feature",
        geometry: { type: "LineString", coordinates: coords },
        properties: {},
      };

      // Remove existing layers
      if (map.getLayer("route-glow"))  map.removeLayer("route-glow");
      if (map.getLayer("route-line"))  map.removeLayer("route-line");
      if (map.getLayer("route-dash"))  map.removeLayer("route-dash");
      if (map.getSource("route"))      map.removeSource("route");

      map.addSource("route", { type: "geojson", data: geojson });

      // Glow layer
      map.addLayer({
        id:   "route-glow",
        type: "line",
        source: "route",
        paint: {
          "line-color": "#3370f5",
          "line-width": 8,
          "line-opacity": 0.15,
          "line-blur": 4,
        },
      });

      // Solid line
      map.addLayer({
        id:   "route-line",
        type: "line",
        source: "route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: {
          "line-color": "#3370f5",
          "line-width": 2.5,
          "line-opacity": 0.9,
        },
      });

      // Animated dash overlay
      map.addLayer({
        id:   "route-dash",
        type: "line",
        source: "route",
        layout: { "line-join": "round", "line-cap": "butt" },
        paint: {
          "line-color": "#06d6e8",
          "line-width": 1.5,
          "line-dasharray": [0, 4, 3],
          "line-opacity": 0.7,
        },
      });

      // Fit bounds to route
      const bounds = coords.reduce(
        (b, c) => b.extend(c),
        new mapboxgl.LngLatBounds(coords[0], coords[0])
      );
      map.fitBounds(bounds, { padding: 60, maxZoom: 12, duration: 1000 });
    };

    if (isLoadedRef.current) {
      drawRoute();
    } else {
      map.once("load", drawRoute);
    }
  }, [route]);

  // ── Driver location marker ────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const updateDriver = () => {
      if (!driverLocation) {
        driverMarkerRef.current?.remove();
        driverMarkerRef.current = null;
        return;
      }

      const { lat, lng } = driverLocation;

      if (driverMarkerRef.current) {
        driverMarkerRef.current.setLngLat([lng, lat]);
      } else {
        const el = createDriverEl();
        driverMarkerRef.current = new mapboxgl.Marker({ element: el })
          .setLngLat([lng, lat])
          .setPopup(
            new mapboxgl.Popup({ offset: 20, closeButton: false })
              .setHTML('<div class="px-2 py-1 text-xs font-medium">Driver Location</div>')
          )
          .addTo(map);
      }
    };

    if (isLoadedRef.current) {
      updateDriver();
    } else {
      map.once("load", updateDriver);
    }
  }, [driverLocation]);

  // ── Fly to ────────────────────────────────────────────────────────────────
  const flyTo = useCallback((lat: number, lng: number, zoom = 12) => {
    mapRef.current?.flyTo({ center: [lng, lat], zoom, duration: 1200 });
  }, []);

  const fitMarkers = useCallback(() => {
    const map = mapRef.current;
    if (!map || markers.length === 0) return;
    const bounds = new mapboxgl.LngLatBounds();
    markers.forEach((m) => bounds.extend([m.lng, m.lat]));
    if (driverLocation) bounds.extend([driverLocation.lng, driverLocation.lat]);
    map.fitBounds(bounds, { padding: 60, maxZoom: 12, duration: 800 });
  }, [markers, driverLocation]);

  return { flyTo, fitMarkers };
}

// ── Marker element factories ──────────────────────────────────────────────────

function createMarkerEl(marker: MapMarker): HTMLElement {
  const config: Record<string, { bg: string; border: string; icon: string }> = {
    origin: {
      bg: "rgba(51,112,245,0.2)", border: "#3370f5",
      icon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#3370f5" stroke-width="2.5"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>`,
    },
    destination: {
      bg: "rgba(0,229,160,0.2)", border: "#00e5a0",
      icon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#00e5a0" stroke-width="2.5"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>`,
    },
    transit: {
      bg: "rgba(245,166,35,0.2)", border: "#f5a623",
      icon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f5a623" stroke-width="2.5"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a4 4 0 0 0-8 0v2"/></svg>`,
    },
    event: {
      bg: "rgba(168,85,247,0.2)", border: "#a855f7",
      icon: `<svg width="10" height="10" viewBox="0 0 24 24" fill="#a855f7"><circle cx="12" cy="12" r="6"/></svg>`,
    },
    driver: {
      bg: "rgba(6,214,232,0.2)", border: "#06d6e8",
      icon: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#06d6e8" stroke-width="2"><rect x="2" y="10" width="20" height="10" rx="2"/><path d="M16 10l-3-6H9L6 10"/><circle cx="7" cy="20" r="2"/><circle cx="17" cy="20" r="2"/></svg>`,
    },
  };

  const c = config[marker.type] ?? config.event;
  const el = document.createElement("div");
  el.innerHTML = `
    <div style="
      width:32px;height:32px;border-radius:50%;
      background:${c.bg};border:2px solid ${c.border};
      display:flex;align-items:center;justify-content:center;
      cursor:pointer;transition:transform 0.15s;
      box-shadow:0 0 10px ${c.border}40;
    " onmouseenter="this.style.transform='scale(1.15)'" onmouseleave="this.style.transform='scale(1)'">
      ${c.icon}
    </div>
  `;
  return el;
}

function createDriverEl(): HTMLElement {
  const el = document.createElement("div");
  el.innerHTML = `
    <div style="position:relative;width:40px;height:40px;">
      <div style="
        position:absolute;inset:0;border-radius:50%;
        background:rgba(6,214,232,0.15);
        animation:ping 1.5s cubic-bezier(0,0,0.2,1) infinite;
      "></div>
      <div style="
        position:relative;width:40px;height:40px;border-radius:50%;
        background:rgba(6,214,232,0.25);border:2px solid #06d6e8;
        display:flex;align-items:center;justify-content:center;
        box-shadow:0 0 16px rgba(6,214,232,0.4);
      ">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#06d6e8" stroke-width="2">
          <rect x="2" y="10" width="20" height="10" rx="2"/>
          <path d="M16 10l-3-6H9L6 10"/>
          <circle cx="7" cy="20" r="2"/>
          <circle cx="17" cy="20" r="2"/>
        </svg>
      </div>
    </div>
  `;
  // Inject ping animation if not present
  if (!document.getElementById("mapbox-ping-style")) {
    const style = document.createElement("style");
    style.id = "mapbox-ping-style";
    style.textContent = `
      @keyframes ping {
        75%, 100% { transform: scale(2); opacity: 0; }
      }
    `;
    document.head.appendChild(style);
  }
  return el;
}
