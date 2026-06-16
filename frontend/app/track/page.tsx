"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Package, Truck, CheckCircle,
  AlertTriangle, MapPin, ArrowRight, Loader2,
} from "lucide-react";
import { apiGet } from "@/lib/api/client";
import { StatusBadge } from "@/components/ui";
import { formatDate, getCarrierConfig, cn } from "@/lib/utils";
import { ShipmentStatus, CarrierType } from "@/types";

interface PublicTracking {
  tracking_number: string;
  carrier: string;
  status: string;
  origin: string | null;
  destination: string | null;
  estimated_delivery: string | null;
  ai_eta: string | null;
  delay_risk: string;
  timeline: Array<{
    status: string;
    label: string;
    done: boolean;
    active: boolean;
    is_failure: boolean;
    timestamp: string | null;
    description: string | null;
    location: string | null;
  }>;
}

export default function PublicTrackPage() {
  const [input,   setInput]   = useState("");
  const [query,   setQuery]   = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["public-track", query],
    queryFn:  () => apiGet<PublicTracking>(`/tracking/public/${query}`),
    enabled:  !!query,
    retry:    false,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const val = input.trim().toUpperCase();
    if (val) setQuery(val);
  };

  return (
    <div className="min-h-screen bg-[hsl(var(--surface-1))] flex flex-col">
      {/* Nav */}
      <nav className="h-14 border-b border-white/6 flex items-center px-6 gap-3">
        <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
          <span className="text-white font-bold text-xs">AZ</span>
        </div>
        <span className="font-semibold text-sm">A to Z Routes</span>
        <span className="ml-auto text-xs text-muted-foreground">Public Tracking</span>
      </nav>

      <div className="flex-1 flex flex-col items-center px-4 pt-16 pb-8">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }}
          className="text-center mb-10"
        >
          <div className="w-14 h-14 rounded-2xl bg-primary/15 border border-primary/20 flex items-center justify-center mx-auto mb-4">
            <Package className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-3xl font-bold font-display">Track Your Shipment</h1>
          <p className="text-muted-foreground mt-2">Enter a tracking number to see real-time delivery status</p>
        </motion.div>

        {/* Search */}
        <motion.form
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          onSubmit={handleSearch}
          className="w-full max-w-xl flex gap-2 mb-10"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase())}
              placeholder="e.g. AZ1A2B3C4D5E"
              className="input-field pl-10 h-12 font-mono uppercase text-sm w-full"
            />
          </div>
          <button type="submit" disabled={!input.trim() || isLoading} className="btn-primary h-12 px-6">
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><span>Track</span><ArrowRight className="w-4 h-4" /></>}
          </button>
        </motion.form>

        {/* Results */}
        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              key="error"
              initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
              className="w-full max-w-xl card-premium p-6 text-center border-red-500/20"
            >
              <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto mb-3" />
              <p className="font-semibold font-display">Tracking number not found</p>
              <p className="text-sm text-muted-foreground mt-1">
                Check the number and try again, or contact your sender.
              </p>
            </motion.div>
          )}

          {data && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="w-full max-w-2xl space-y-4"
            >
              {/* Summary card */}
              <div className="card-premium p-5">
                <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
                  <div>
                    <p className="font-mono text-lg font-bold">{data.tracking_number}</p>
                    <p className="text-sm text-muted-foreground mt-0.5" style={{ color: getCarrierConfig(data.carrier as CarrierType).color }}>
                      {getCarrierConfig(data.carrier as CarrierType).label}
                    </p>
                  </div>
                  <StatusBadge status={data.status as ShipmentStatus} />
                </div>

                {/* Route */}
                {(data.origin || data.destination) && (
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-white/3 border border-white/6 mb-4">
                    <div className="flex-1 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">From</p>
                      <p className="text-sm font-medium mt-0.5">{data.origin ?? "—"}</p>
                    </div>
                    <Truck className="w-4 h-4 text-primary shrink-0" />
                    <div className="flex-1 text-center">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">To</p>
                      <p className="text-sm font-medium mt-0.5">{data.destination ?? "—"}</p>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Expected delivery</span>
                  <span className="font-medium">{formatDate(data.ai_eta ?? data.estimated_delivery)}</span>
                </div>
              </div>

              {/* Timeline */}
              <div className="card-premium p-5">
                <h3 className="font-semibold font-display text-sm mb-5 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-primary" /> Tracking History
                </h3>
                <div className="relative">
                  <div className="absolute left-3.5 top-4 bottom-4 w-px bg-white/6" />
                  <div className="space-y-0">
                    {data.timeline.map((step, i) => (
                      <motion.div
                        key={step.status}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className={cn("relative flex gap-4 pb-5", i === data.timeline.length - 1 && "pb-0", !step.done && "opacity-35")}
                      >
                        <div className="relative z-10 shrink-0 mt-0.5">
                          <div className={cn(
                            "w-7 h-7 rounded-full border-2 flex items-center justify-center",
                            step.active && !step.is_failure && "border-primary bg-primary/20",
                            step.active && step.is_failure  && "border-red-500 bg-red-500/20",
                            step.done && !step.active       && "border-green-500/60 bg-green-500/10",
                            !step.done                      && "border-white/10 bg-white/3",
                          )}>
                            {step.done && !step.active && !step.is_failure && <CheckCircle className="w-3 h-3 text-green-400" />}
                            {step.active && !step.is_failure && <div className="w-1.5 h-1.5 rounded-full bg-primary" />}
                            {step.is_failure && <AlertTriangle className="w-3 h-3 text-red-400" />}
                            {!step.done && <div className="w-1.5 h-1.5 rounded-full bg-white/15" />}
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-baseline justify-between gap-2 flex-wrap">
                            <p className={cn(
                              "text-sm font-medium",
                              step.active && !step.is_failure && "text-primary",
                              step.active && step.is_failure  && "text-red-400",
                            )}>
                              {step.label}
                            </p>
                            {step.timestamp && (
                              <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                                {formatDate(step.timestamp, "MMM d, h:mm a")}
                              </span>
                            )}
                          </div>
                          {step.description && <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>}
                          {step.location && (
                            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                              <MapPin className="w-2.5 h-2.5" />{step.location}
                            </p>
                          )}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
