"use client";

import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft, Truck, CheckCircle,
  AlertTriangle, Shield, Calendar,
  Weight, Tag, MapPin,
} from "lucide-react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";
import { StatusBadge, DelayRiskBadge, PageLoader } from "@/components/ui";
import { RouteMap } from "@/components/maps/RouteMap";
import { WSStatus, LiveEventFeed } from "@/components/tracking/LiveStatus";
import { useLiveTracking } from "@/lib/hooks/useLiveTracking";
import { formatDateTime, formatDate, getCarrierConfig, cn } from "@/lib/utils";
import { ShipmentStatus, CarrierType, DelayRisk } from "@/types";
import type { MapMarker, RouteCoord } from "@/lib/hooks/useMapbox";

interface TimelineStep {
  status: string; label: string; done: boolean; active: boolean;
  is_failure: boolean; timestamp: string | null;
  description: string | null; location: string | null;
  latitude: number | null; longitude: number | null;
}

interface TrackingDetail {
  shipment_id: string; tracking_number: string; carrier: string;
  status: string; delay_risk: string; origin: string | null; destination: string | null;
  estimated_delivery: string | null; ai_eta: string | null; ai_confidence: number | null;
  actual_delivery: string | null; weight_kg: number | null; service_type: string | null;
  timeline: TimelineStep[];
  driver: { vehicle_type: string; rating: number; current_lat: number | null; current_lng: number | null } | null;
  origin_warehouse:  { name: string; city: string; latitude: number; longitude: number } | null;
  dest_warehouse:    { name: string; city: string; latitude: number; longitude: number } | null;
}

function buildMapData(tracking: TrackingDetail, liveDriverLoc?: { lat: number; lng: number } | null) {
  const markers: MapMarker[] = [];
  const route: RouteCoord[]  = [];

  if (tracking.origin_warehouse) {
    markers.push({ id: "origin", type: "origin", lat: tracking.origin_warehouse.latitude, lng: tracking.origin_warehouse.longitude, label: `Origin: ${tracking.origin_warehouse.name}` });
    route.push({ lat: tracking.origin_warehouse.latitude, lng: tracking.origin_warehouse.longitude });
  }

  tracking.timeline.forEach((step, i) => {
    if (step.latitude && step.longitude && step.done && step.status !== "pending") {
      markers.push({ id: `event-${i}`, type: "transit", lat: step.latitude, lng: step.longitude, label: step.label });
      route.push({ lat: step.latitude, lng: step.longitude });
    }
  });

  if (tracking.dest_warehouse) {
    markers.push({ id: "dest", type: "destination", lat: tracking.dest_warehouse.latitude, lng: tracking.dest_warehouse.longitude, label: `Destination: ${tracking.dest_warehouse.name}` });
    route.push({ lat: tracking.dest_warehouse.latitude, lng: tracking.dest_warehouse.longitude });
  }

  const driverLocation =
    liveDriverLoc ??
    (tracking.driver?.current_lat && tracking.driver?.current_lng
      ? { lat: tracking.driver.current_lat, lng: tracking.driver.current_lng }
      : null);

  return { markers, route, driverLocation };
}

export default function TrackingPage() {
  const { id } = useParams<{ id: string }>();

  const { data: tracking, isLoading, error } = useQuery({
    queryKey: ["tracking", id],
    queryFn:  () => apiGet<TrackingDetail>(`/tracking/${id}`),
    enabled:  !!id,
    refetchInterval: 60_000, // fallback poll every 60s (WS handles real-time)
  });

  const { wsState, isLive, liveEvents, driverLoc } = useLiveTracking(id ?? null);

  if (isLoading) return <PageLoader />;
  if (error || !tracking) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertTriangle className="w-12 h-12 text-amber-400 mb-4" />
        <h2 className="text-lg font-semibold font-display">Shipment not found</h2>
        <p className="text-sm text-muted-foreground mt-1 mb-6">Check the tracking ID and try again.</p>
        <Link href="/shipments" className="btn-primary text-sm">Back to Shipments</Link>
      </div>
    );
  }

  const carrier     = getCarrierConfig(tracking.carrier as CarrierType);
  const isDelivered = tracking.status === "delivered";
  const isFailed    = ["failed", "returned"].includes(tracking.status);
  const { markers, route, driverLocation } = buildMapData(tracking, driverLoc);
  const hasMapData  = markers.length > 0;

  return (
    <div className="max-w-5xl space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <Link href="/shipments" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-5">
          <ArrowLeft className="w-4 h-4" /> Back to Shipments
        </Link>
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1 flex-wrap">
              <h1 className="text-2xl font-bold font-display font-mono tracking-wide">{tracking.tracking_number}</h1>
              <StatusBadge status={tracking.status as ShipmentStatus} />
              <WSStatus state={wsState} />
            </div>
            <p className="text-sm text-muted-foreground">
              <span style={{ color: carrier.color }} className="font-medium">{carrier.label}</span>
              {tracking.service_type && <> · <span className="capitalize">{tracking.service_type}</span></>}
            </p>
          </div>
          <DelayRiskBadge risk={tracking.delay_risk as DelayRisk} />
        </div>
      </motion.div>

      {/* Map */}
      {hasMapData && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <RouteMap markers={markers} route={route} driverLocation={driverLocation} height="h-72" className="w-full" showLegend />
        </motion.div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Timeline */}
        <motion.div initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} className="lg:col-span-2 space-y-4">
          <div className="card-premium p-6">
            <h2 className="font-semibold font-display mb-6 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" /> Tracking Timeline
            </h2>

            {(tracking.origin || tracking.destination) && (
              <div className="flex items-center gap-3 mb-6 p-3 rounded-lg bg-white/3 border border-white/6">
                <div className="flex-1 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Origin</p>
                  <p className="text-sm font-medium">{tracking.origin_warehouse?.city ?? tracking.origin ?? "—"}</p>
                </div>
                <div className="flex-1 flex items-center gap-1">
                  <div className="flex-1 h-px bg-white/10" />
                  <Truck className="w-4 h-4 text-primary" />
                  <div className="flex-1 h-px bg-white/10" />
                </div>
                <div className="flex-1 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Destination</p>
                  <p className="text-sm font-medium">{tracking.dest_warehouse?.city ?? tracking.destination ?? "—"}</p>
                </div>
              </div>
            )}

            <div className="relative">
              <div className="absolute left-4 top-5 bottom-5 w-px bg-white/8" />
              <div className="space-y-0">
                {tracking.timeline.map((step, i) => (
                  <TimelineItem key={step.status} step={step} index={i} isLast={i === tracking.timeline.length - 1} />
                ))}
              </div>
            </div>
          </div>

          {/* Live event feed */}
          {liveEvents.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="card-premium p-4">
              <LiveEventFeed events={liveEvents} />
            </motion.div>
          )}
        </motion.div>

        {/* Details panel */}
        <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }} className="space-y-4">
          {/* AI ETA / status card */}
          <div className={cn(
            "card-premium p-4 space-y-3",
            isDelivered && "border-green-500/20 bg-green-500/5",
            isFailed    && "border-red-500/20 bg-red-500/5",
          )}>
            <div className="flex items-center gap-2">
              {isDelivered ? <CheckCircle className="w-4 h-4 text-green-400" />
              : isFailed   ? <AlertTriangle className="w-4 h-4 text-red-400" />
              :              <Shield className="w-4 h-4 text-primary" />}
              <span className="text-sm font-medium">
                {isDelivered ? "Delivered" : isFailed ? "Delivery Issue" : "AI Prediction"}
              </span>
            </div>
            {isDelivered ? (
              <div>
                <p className="text-xl font-bold font-display text-green-400">{formatDate(tracking.actual_delivery)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Delivered successfully</p>
              </div>
            ) : isFailed ? (
              <div>
                <p className="text-base font-semibold text-red-400 capitalize">{tracking.status.replace("_"," ")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Contact carrier for details</p>
              </div>
            ) : (
              <div>
                <p className="text-xl font-bold font-display">{formatDate(tracking.ai_eta ?? tracking.estimated_delivery)}</p>
                {tracking.ai_confidence && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-muted-foreground">AI Confidence</span>
                      <span className="text-[10px] font-medium text-primary">{Math.round(tracking.ai_confidence)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                      <motion.div className="h-full rounded-full bg-primary"
                        initial={{ width: 0 }} animate={{ width: `${tracking.ai_confidence}%` }}
                        transition={{ duration: 0.8, delay: 0.3 }}
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Details */}
          <div className="card-premium p-4 space-y-3">
            <h3 className="text-sm font-semibold font-display">Details</h3>
            <div className="space-y-2.5">
              {[
                { icon: Calendar, label: "Est. Delivery", value: formatDate(tracking.estimated_delivery) },
                { icon: Tag,      label: "Service",       value: tracking.service_type ? tracking.service_type.charAt(0).toUpperCase() + tracking.service_type.slice(1) : "—" },
                { icon: Weight,   label: "Weight",        value: tracking.weight_kg ? `${tracking.weight_kg} kg` : "—" },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <item.icon className="w-3.5 h-3.5" />
                    <span className="text-xs">{item.label}</span>
                  </div>
                  <span className="text-xs font-medium">{item.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Driver */}
          {tracking.driver && (
            <div className="card-premium p-4 space-y-3">
              <h3 className="text-sm font-semibold font-display">Driver</h3>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center">
                  <Truck className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium capitalize">{tracking.driver.vehicle_type} delivery</p>
                  <p className="text-xs text-muted-foreground">Rating: {tracking.driver.rating.toFixed(1)} ⭐</p>
                </div>
              </div>
              {driverLocation && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <MapPin className="w-3 h-3" /> Live location active
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                </p>
              )}
            </div>
          )}

          {/* Connection status */}
          <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-white/3 border border-white/6">
            <span className="text-[11px] text-muted-foreground">Real-time tracking</span>
            <WSStatus state={wsState} />
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function TimelineItem({ step, index, isLast }: { step: TimelineStep; index: number; isLast: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.06 }}
      className={cn("relative flex gap-5 pb-6", isLast && "pb-0")}
    >
      <div className="relative z-10 shrink-0">
        <div className={cn(
          "w-8 h-8 rounded-full border-2 flex items-center justify-center transition-all",
          step.active && !step.is_failure && "border-primary bg-primary/20 shadow-[0_0_12px_rgba(51,112,245,0.4)]",
          step.active && step.is_failure  && "border-red-500 bg-red-500/20",
          step.done && !step.active       && "border-green-500/50 bg-green-500/10",
          !step.done                      && "border-white/10 bg-white/3",
        )}>
          {step.active && !step.is_failure && <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />}
          {step.active && step.is_failure  && <AlertTriangle className="w-3.5 h-3.5 text-red-400" />}
          {step.done && !step.active       && <CheckCircle className="w-3.5 h-3.5 text-green-400" />}
          {!step.done                      && <div className="w-2 h-2 rounded-full bg-white/15" />}
        </div>
      </div>
      <div className={cn("flex-1 pb-1", !step.done && "opacity-40")}>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className={cn(
            "text-sm font-medium",
            step.active && !step.is_failure && "text-primary",
            step.active && step.is_failure  && "text-red-400",
            step.done && !step.active       && "text-foreground",
            !step.done                      && "text-muted-foreground",
          )}>{step.label}</p>
          {step.timestamp && <span className="text-xs text-muted-foreground">{formatDateTime(step.timestamp)}</span>}
        </div>
        {(step.description || step.location) && (
          <div className="mt-1 space-y-0.5">
            {step.description && <p className="text-xs text-muted-foreground">{step.description}</p>}
            {step.location && <p className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="w-2.5 h-2.5" />{step.location}</p>}
          </div>
        )}
      </div>
    </motion.div>
  );
}
