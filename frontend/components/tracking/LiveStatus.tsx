"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Wifi, WifiOff, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type WSState = "idle" | "connecting" | "connected" | "disconnected" | "error";

interface WSStatusProps {
  state: WSState;
  className?: string;
  showLabel?: boolean;
}

export function WSStatus({ state, className, showLabel = true }: WSStatusProps) {
  const config = {
    idle:         { color: "text-muted-foreground", dot: "bg-white/20",   label: "Offline" },
    connecting:   { color: "text-amber-400",         dot: "bg-amber-400",  label: "Connecting..." },
    connected:    { color: "text-green-400",          dot: "bg-green-400",  label: "Live" },
    disconnected: { color: "text-amber-400",          dot: "bg-amber-400",  label: "Reconnecting..." },
    error:        { color: "text-red-400",            dot: "bg-red-400",    label: "Disconnected" },
  }[state];

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <div className="relative">
        <div className={cn("w-1.5 h-1.5 rounded-full", config.dot)} />
        {state === "connected" && (
          <div className={cn(
            "absolute inset-0 rounded-full animate-ping opacity-75",
            config.dot,
          )} />
        )}
        {(state === "connecting" || state === "disconnected") && (
          <div className={cn("absolute inset-0 rounded-full animate-pulse", config.dot)} />
        )}
      </div>
      {showLabel && (
        <span className={cn("text-[11px] font-medium", config.color)}>
          {config.label}
        </span>
      )}
    </div>
  );
}

// ── Live event feed ────────────────────────────────────────────────────────────
interface LiveEvent {
  status: string;
  description: string | null;
  location_name: string | null;
  timestamp: string;
}

interface LiveEventFeedProps {
  events: LiveEvent[];
  className?: string;
}

export function LiveEventFeed({ events, className }: LiveEventFeedProps) {
  if (events.length === 0) return null;

  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
        Live Updates
      </p>
      <div className="space-y-1.5 max-h-40 overflow-y-auto">
        <AnimatePresence initial={false}>
          {events.slice(0, 8).map((event, i) => (
            <motion.div
              key={`${event.timestamp}-${i}`}
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white/3 border border-white/6"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium capitalize">
                  {event.status.replace(/_/g, " ")}
                </p>
                {event.description && (
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
                    {event.description}
                  </p>
                )}
                {event.location_name && (
                  <p className="text-[11px] text-muted-foreground truncate">
                    📍 {event.location_name}
                  </p>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                {new Date(event.timestamp).toLocaleTimeString([], {
                  hour: "2-digit", minute: "2-digit",
                })}
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
