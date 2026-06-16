"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Truck, MapPin, CheckCircle, Package, Navigation, Star, ArrowRight, Play, Loader2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api/client";
import { useWebSocket } from "@/lib/hooks/useWebSocket";
import { useAuth } from "@/lib/hooks/useAuth";
import { StatusBadge, Skeleton, EmptyState } from "@/components/ui";
import { RouteMap } from "@/components/maps/RouteMap";
import { WSStatus } from "@/components/tracking/LiveStatus";
import { formatDate, getCarrierConfig, cn } from "@/lib/utils";
import { Shipment } from "@/types";
import toast from "react-hot-toast";

const STATUS_TRANSITIONS: Record<string, { next: string; label: string; color: string }> = {
  pending:          { next: "picked_up",       label: "Mark Picked Up",   color: "bg-blue-500 hover:bg-blue-600" },
  picked_up:        { next: "in_transit",       label: "Start Transit",    color: "bg-primary hover:bg-primary/90" },
  in_transit:       { next: "out_for_delivery", label: "Out for Delivery", color: "bg-amber-500 hover:bg-amber-600" },
  out_for_delivery: { next: "delivered",        label: "Mark Delivered ✓", color: "bg-green-600 hover:bg-green-700" },
};

export default function DriverDashboard() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const { data: stats, isLoading: statsLoading } = useQuery({ queryKey: ["driver","stats"], queryFn: () => apiGet<any>("/drivers/me/stats") });
  const { data: activeData, isLoading: activeLoading } = useQuery({ queryKey: ["driver","active"], queryFn: () => apiGet<Shipment[]>("/drivers/me/active"), refetchInterval: 30_000 });

  const activeShipments = activeData ?? [];
  const selected = activeShipments.find((s) => s.id === activeId) ?? activeShipments[0] ?? null;

  const { state: wsState, sendDriverLocation } = useWebSocket({ enabled: true, rooms: selected ? [`shipment:${selected.id}`] : [] });

  const locationMutation = useMutation({ mutationFn: (d: any) => apiPost("/drivers/me/location", d) });

  useEffect(() => {
    if (!isTracking || !selected) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => { const { latitude: lat, longitude: lng } = pos.coords; locationMutation.mutate({ lat, lng, shipment_id: selected.id }); sendDriverLocation(selected.id, lat, lng); },
      (err) => setGeoError(err.message),
      { enableHighAccuracy: true, maximumAge: 5000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [isTracking, selected?.id]);

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => apiPost(`/drivers/me/shipments/${id}/status`, { status }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["driver"] }); toast.success("Status updated"); },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Failed"),
  });

  const mapMarkers = selected ? [
    ...(selected.origin_warehouse ? [{ id: "origin", type: "origin" as const, lat: (selected.origin_warehouse as any).latitude, lng: (selected.origin_warehouse as any).longitude, label: "Origin" }] : []),
    ...(selected.dest_warehouse   ? [{ id: "dest",   type: "destination" as const, lat: (selected.dest_warehouse as any).latitude, lng: (selected.dest_warehouse as any).longitude, label: "Destination" }] : []),
  ] : [];

  return (
    <div className="max-w-2xl mx-auto space-y-5 pb-8">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold font-display">Driver Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{user?.full_name} · <span className="capitalize">{stats?.vehicle_type ?? "—"}</span></p>
        </div>
        <div className="flex items-center gap-3">
          <WSStatus state={wsState} />
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20">
            <Star className="w-3 h-3 text-amber-400" />
            <span className="text-xs font-medium text-amber-400">{stats?.rating?.toFixed(1) ?? "—"}</span>
          </div>
        </div>
      </motion.div>

      <div className="grid grid-cols-3 gap-3">
        {statsLoading ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />) :
          [{ label: "Active", value: stats?.active ?? 0, color: "text-blue-400" },
           { label: "Delivered", value: stats?.delivered ?? 0, color: "text-green-400" },
           { label: "On-Time", value: `${stats?.on_time_rate ?? 0}%`, color: "text-primary" }].map((s) => (
          <div key={s.label} className="card-premium p-3 text-center">
            <p className={cn("text-xl font-bold font-display", s.color)}>{s.value}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {mapMarkers.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}>
          <RouteMap markers={mapMarkers} height="h-56" showLegend={false} />
        </motion.div>
      )}

      {selected && (
        <div className="card-premium p-4 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Live GPS Broadcast</p>
            <p className="text-xs text-muted-foreground mt-0.5">{isTracking ? "Broadcasting your location" : "Share location in real-time"}</p>
            {geoError && <p className="text-xs text-red-400 mt-1">{geoError}</p>}
          </div>
          <button onClick={() => { setGeoError(null); setIsTracking((t) => !t); }}
            className={cn("flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              isTracking ? "bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25"
                         : "bg-primary/15 border border-primary/30 text-primary hover:bg-primary/25")}>
            <Navigation className={cn("w-3.5 h-3.5", isTracking && "animate-pulse")} />
            {isTracking ? "Stop" : "Start"}
          </button>
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold font-display mb-3 flex items-center gap-2">
          <Truck className="w-4 h-4 text-primary" /> Active Deliveries
          {activeShipments.length > 0 && <span className="px-1.5 py-0.5 rounded-full bg-primary/15 text-primary text-[10px] font-medium">{activeShipments.length}</span>}
        </h2>
        {activeLoading ? <div className="space-y-3">{[1,2].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
        : activeShipments.length === 0 ? <EmptyState title="No active deliveries" description="Assigned shipments appear here" icon={Package} />
        : (
          <div className="space-y-3">
            <AnimatePresence>
              {activeShipments.map((shipment, i) => {
                const transition = STATUS_TRANSITIONS[shipment.status];
                const isSelected = selected?.id === shipment.id;
                return (
                  <motion.div key={shipment.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                    onClick={() => setActiveId(shipment.id)}
                    className={cn("card-premium p-4 cursor-pointer transition-all duration-150", isSelected && "border-primary/30 bg-primary/5")}
                  >
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <p className="text-sm font-mono font-semibold">{shipment.tracking_number}</p>
                        <p className="text-xs mt-0.5" style={{ color: getCarrierConfig(shipment.carrier as any).color }}>{getCarrierConfig(shipment.carrier as any).label}</p>
                      </div>
                      <StatusBadge status={shipment.status as any} />
                    </div>
                    {(shipment.origin_warehouse || shipment.dest_warehouse) && (
                      <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3 shrink-0" />
                        <span>{(shipment.origin_warehouse as any)?.city ?? "—"}</span>
                        <ArrowRight className="w-3 h-3 shrink-0" />
                        <span className="font-medium text-foreground">{(shipment.dest_warehouse as any)?.city ?? "—"}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">ETA: {formatDate(shipment.ai_eta ?? shipment.estimated_delivery)}</span>
                      {transition && (
                        <button onClick={(e) => { e.stopPropagation(); statusMutation.mutate({ id: shipment.id, status: transition.next }); }}
                          disabled={statusMutation.isPending}
                          className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-all", transition.color, statusMutation.isPending && "opacity-60")}>
                          {statusMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                          {transition.label}
                        </button>
                      )}
                      {shipment.status === "delivered" && (
                        <span className="flex items-center gap-1 text-xs text-green-400"><CheckCircle className="w-3.5 h-3.5" /> Delivered</span>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
