"use client";

import { motion } from "framer-motion";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Brain, RefreshCw, Loader2, Calendar, Clock, TrendingUp } from "lucide-react";
import { apiPost } from "@/lib/api/client";
import { formatDate, cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface ETAPrediction {
  eta: string;
  remaining_days: number;
  confidence: number;
  model_version: string;
  delay_risk: string;
  message?: string;
}

interface ETACardProps {
  shipmentId: string;
  currentEta: string | null;
  aiEta: string | null;
  confidence: number | null;
  status: string;
  className?: string;
}

export function ETACard({
  shipmentId,
  currentEta,
  aiEta,
  confidence,
  status,
  className,
}: ETACardProps) {
  const qc = useQueryClient();

  const predictMutation = useMutation({
    mutationFn: () => apiPost<ETAPrediction>(`/eta/${shipmentId}/predict`, {}),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["tracking", shipmentId] });
      qc.invalidateQueries({ queryKey: ["shipments"] });
      toast.success(`ETA updated: ${formatDate(data.eta)}`);
    },
    onError: () => toast.error("Prediction failed"),
  });

  const isTerminal = ["delivered", "failed", "returned"].includes(status);
  const displayEta = aiEta ?? currentEta;
  const conf       = confidence ?? 0;

  // Confidence gauge color
  const confColor =
    conf >= 80 ? "text-green-400"  :
    conf >= 60 ? "text-amber-400"  :
    "text-red-400";

  const confBarColor =
    conf >= 80 ? "bg-green-500"  :
    conf >= 60 ? "bg-amber-500"  :
    "bg-red-500";

  return (
    <div className={cn("card-premium p-4 space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary/15 border border-primary/20 flex items-center justify-center">
            <Brain className="w-3.5 h-3.5 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold font-display">AI ETA</p>
            <p className="text-[10px] text-muted-foreground">XGBoost prediction</p>
          </div>
        </div>

        {!isTerminal && (
          <button
            onClick={() => predictMutation.mutate()}
            disabled={predictMutation.isPending}
            className="btn-ghost h-7 px-2.5 text-xs gap-1.5"
            title="Refresh prediction"
          >
            {predictMutation.isPending
              ? <Loader2 className="w-3 h-3 animate-spin" />
              : <RefreshCw className="w-3 h-3" />}
            Refresh
          </button>
        )}
      </div>

      {/* ETA value */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Predicted delivery</span>
        </div>
        <p className={cn(
          "text-xl font-bold font-display",
          isTerminal && status === "delivered" && "text-green-400",
          isTerminal && status !== "delivered" && "text-red-400",
          !isTerminal && "text-foreground",
        )}>
          {displayEta ? formatDate(displayEta) : "—"}
        </p>
      </div>

      {/* Confidence gauge */}
      {!isTerminal && confidence !== null && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-3 h-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Model confidence</span>
            </div>
            <span className={cn("text-sm font-bold font-display", confColor)}>
              {Math.round(conf)}%
            </span>
          </div>

          {/* Gauge bar */}
          <div className="h-2 rounded-full bg-white/8 overflow-hidden">
            <motion.div
              className={cn("h-full rounded-full", confBarColor)}
              initial={{ width: 0 }}
              animate={{ width: `${conf}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
            />
          </div>

          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>Low</span>
            <span>High</span>
          </div>
        </div>
      )}

      {/* Remaining days */}
      {!isTerminal && displayEta && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/3 border border-white/6">
          <Clock className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">
            {(() => {
              const days = Math.max(
                0,
                Math.round((new Date(displayEta).getTime() - Date.now()) / 86400000)
              );
              return days === 0
                ? "Arriving today"
                : `~${days} day${days !== 1 ? "s" : ""} remaining`;
            })()}
          </span>
        </div>
      )}

      {/* Model tag */}
      {aiEta && (
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
          <span className="text-[10px] text-muted-foreground">AI-powered · updates automatically</span>
        </div>
      )}
    </div>
  );
}

// ── Inline confidence badge ───────────────────────────────────────────────────
export function ConfidenceBadge({ confidence }: { confidence: number | null }) {
  if (confidence === null) return null;
  const color =
    confidence >= 80 ? "text-green-400 border-green-500/20 bg-green-500/10" :
    confidence >= 60 ? "text-amber-400 border-amber-500/20 bg-amber-500/10" :
    "text-red-400 border-red-500/20 bg-red-500/10";

  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border", color)}>
      <Brain className="w-2.5 h-2.5" />
      {Math.round(confidence)}% confidence
    </span>
  );
}
