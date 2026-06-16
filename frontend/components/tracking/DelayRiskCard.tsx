"use client";

import { motion } from "framer-motion";
import { AlertTriangle, RefreshCw, Loader2, Shield, CheckCircle } from "lucide-react";
import { useDelayPrediction } from "@/lib/hooks/useNotifications";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";

interface DelayRiskCardProps {
  shipmentId: string;
  riskLevel: "low" | "medium" | "high";
  className?: string;
}

interface DelayPrediction {
  risk_score: number;
  risk_level: string;
  factors: string[];
  confidence: number;
}

export function DelayRiskCard({
  shipmentId,
  riskLevel,
  className,
}: DelayRiskCardProps) {
  const qc = useQueryClient();
  const { mutate, isPending, data: prediction } = useDelayPrediction(shipmentId);

  const handlePredict = () => {
    mutate(undefined, {
      onSuccess: (result: any) => {
        qc.invalidateQueries({ queryKey: ["tracking", shipmentId] });
        qc.invalidateQueries({ queryKey: ["shipments"] });
        const level = result?.risk_level ?? riskLevel;
        if (level === "high") toast.error("High delay risk detected");
        else if (level === "medium") toast("Medium delay risk", { icon: "⚠️" });
        else toast.success("Low delay risk — shipment on track");
      },
    });
  };

 const displayRisk: "low" | "medium" | "high" =
  ((prediction as any)?.risk_level ?? riskLevel) as "low" | "medium" | "high";
  const riskScore   = (prediction as any)?.risk_score;
  const factors     = (prediction as any)?.factors ?? [];
  const confidence  = (prediction as any)?.confidence;

  const config = {
    low:    { color: "text-green-400",  border: "border-green-500/20",  bg: "bg-green-500/5",  icon: CheckCircle,   label: "Low Risk" },
    medium: { color: "text-amber-400",  border: "border-amber-500/20",  bg: "bg-amber-500/5",  icon: AlertTriangle, label: "Medium Risk" },
    high:   { color: "text-red-400",    border: "border-red-500/20",    bg: "bg-red-500/5",    icon: AlertTriangle, label: "High Risk" },
  }[displayRisk] ?? { color: "text-muted-foreground", border: "border-white/8", bg: "bg-white/3", icon: Shield, label: "Unknown" };

  const Icon = config.icon;

  return (
    <div className={cn("card-premium p-4 space-y-3", config.border, config.bg, className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className={cn("w-4 h-4", config.color)} />
          <span className="text-sm font-semibold font-display">Delay Risk</span>
        </div>
        <button
          onClick={handlePredict}
          disabled={isPending}
          className="btn-ghost h-7 px-2.5 text-xs gap-1.5"
        >
          {isPending
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : <RefreshCw className="w-3 h-3" />}
          Assess
        </button>
      </div>

      {/* Risk level + score */}
      <div className="flex items-end justify-between">
        <div>
          <p className={cn("text-xl font-bold font-display", config.color)}>
            {config.label}
          </p>
          {riskScore !== undefined && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Score: {riskScore}/100
            </p>
          )}
        </div>

        {riskScore !== undefined && (
          <div className="text-right">
            {/* Radial-like mini gauge */}
            <div className="relative w-12 h-12">
              <svg viewBox="0 0 36 36" className="w-12 h-12 -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
                <motion.circle
                  cx="18" cy="18" r="15.9" fill="none"
                  stroke={displayRisk === "high" ? "#ef4444" : displayRisk === "medium" ? "#f5a623" : "#00e5a0"}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray="100"
                  initial={{ strokeDashoffset: 100 }}
                  animate={{ strokeDashoffset: 100 - riskScore }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                />
              </svg>
              <span className={cn("absolute inset-0 flex items-center justify-center text-[10px] font-bold", config.color)}>
                {Math.round(riskScore)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Score bar */}
      {riskScore !== undefined && (
        <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
          <motion.div
            className={cn(
              "h-full rounded-full",
              displayRisk === "high"   ? "bg-red-500"   :
              displayRisk === "medium" ? "bg-amber-500" : "bg-green-500"
            )}
            initial={{ width: 0 }}
            animate={{ width: `${riskScore}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        </div>
      )}

      {/* Risk factors */}
      {factors.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            Risk Factors
          </p>
          {factors.slice(0, 3).map((f: string, i: number) => (
            <div key={i} className="flex items-start gap-2">
              <div className={cn("w-1 h-1 rounded-full mt-1.5 shrink-0", config.color)} />
              <p className="text-xs text-muted-foreground leading-snug">{f}</p>
            </div>
          ))}
        </div>
      )}

      {/* Confidence */}
      {confidence !== undefined && (
        <p className="text-[10px] text-muted-foreground">
          Assessment confidence: {Math.round(confidence)}%
        </p>
      )}
    </div>
  );
}
