import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import { ShipmentStatus, CarrierType, DelayRisk } from "@/types";

// ── Tailwind class merger ─────────────────────────────────────────────────────
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ── Date helpers ──────────────────────────────────────────────────────────────
export function formatDate(dateStr: string | null | undefined, fmt = "MMM d, yyyy"): string {
  if (!dateStr) return "—";
  try { return format(parseISO(dateStr), fmt); }
  catch { return "—"; }
}

export function formatDateTime(dateStr: string | null | undefined): string {
  return formatDate(dateStr, "MMM d, yyyy 'at' h:mm a");
}

export function timeAgo(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  try { return formatDistanceToNow(parseISO(dateStr), { addSuffix: true }); }
  catch { return "—"; }
}

// ── Shipment status ───────────────────────────────────────────────────────────
export const STATUS_CONFIG: Record<
  ShipmentStatus,
  { label: string; badgeClass: string; color: string }
> = {
  pending:           { label: "Pending",           badgeClass: "badge-pending",   color: "#f5a623" },
  picked_up:         { label: "Picked Up",         badgeClass: "badge-transit",   color: "#3370f5" },
  in_transit:        { label: "In Transit",        badgeClass: "badge-transit",   color: "#3370f5" },
  out_for_delivery:  { label: "Out for Delivery",  badgeClass: "badge-transit",   color: "#06d6e8" },
  delivered:         { label: "Delivered",         badgeClass: "badge-delivered", color: "#00e5a0" },
  failed:            { label: "Failed",            badgeClass: "badge-failed",    color: "#ef4444" },
  returned:          { label: "Returned",          badgeClass: "badge-returned",  color: "#a855f7" },
};

export function getStatusConfig(status: ShipmentStatus) {
  return STATUS_CONFIG[status] ?? { label: status, badgeClass: "", color: "#888" };
}

// ── Carrier config ────────────────────────────────────────────────────────────
export const CARRIER_CONFIG: Record<CarrierType, { label: string; color: string; logo?: string }> = {
  amazon:    { label: "Amazon",     color: "#FF9900" },
  flipkart:  { label: "Flipkart",   color: "#2874F0" },
  myntra:    { label: "Myntra",     color: "#FF3F6C" },
  dhl:       { label: "DHL",        color: "#FFCC00" },
  fedex:     { label: "FedEx",      color: "#4D148C" },
  delhivery: { label: "Delhivery",  color: "#D42B2B" },
  bluedart:  { label: "Blue Dart",  color: "#003087" },
  custom:    { label: "Custom",     color: "#6B7280" },
};

export function getCarrierConfig(carrier: CarrierType) {
  return CARRIER_CONFIG[carrier] ?? { label: carrier, color: "#6B7280" };
}

// ── Delay risk ────────────────────────────────────────────────────────────────
export const DELAY_RISK_CONFIG: Record<DelayRisk, { label: string; color: string; badgeClass: string }> = {
  low:    { label: "Low Risk",    color: "#00e5a0", badgeClass: "badge-delivered" },
  medium: { label: "Medium Risk", color: "#f5a623", badgeClass: "badge-pending" },
  high:   { label: "High Risk",   color: "#ef4444", badgeClass: "badge-failed" },
};

// ── Number formatters ─────────────────────────────────────────────────────────
export function formatNumber(n: number, decimals = 0): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: decimals }).format(n);
}

export function formatPercent(n: number): string {
  return `${Math.round(n)}%`;
}

export function formatWeight(kg: number | null): string {
  if (kg === null) return "—";
  return kg >= 1 ? `${kg.toFixed(1)} kg` : `${(kg * 1000).toFixed(0)} g`;
}

// ── Tracking number generator ─────────────────────────────────────────────────
export function generateTrackingNumber(carrier: CarrierType): string {
  const prefixes: Record<CarrierType, string> = {
    amazon:    "AZ",
    flipkart:  "FK",
    myntra:    "MY",
    dhl:       "DHL",
    fedex:     "FX",
    delhivery: "DL",
    bluedart:  "BD",
    custom:    "CS",
  };
  const prefix = prefixes[carrier] ?? "TRK";
  const rand   = Math.random().toString(36).substring(2, 10).toUpperCase();
  return `${prefix}${Date.now().toString(36).toUpperCase()}${rand}`;
}

// ── Route progress ────────────────────────────────────────────────────────────
const STATUS_PROGRESS: Record<ShipmentStatus, number> = {
  pending:           0,
  picked_up:         20,
  in_transit:        50,
  out_for_delivery:  80,
  delivered:         100,
  failed:            100,
  returned:          100,
};

export function getShipmentProgress(status: ShipmentStatus): number {
  return STATUS_PROGRESS[status] ?? 0;
}

// ── Error message extractor ───────────────────────────────────────────────────
export function getErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const e = error as Record<string, unknown>;
    if (e.response && typeof e.response === "object") {
      const res = e.response as Record<string, unknown>;
      if (res.data && typeof res.data === "object") {
        const data = res.data as Record<string, unknown>;
        if (typeof data.message === "string") return data.message;
      }
    }
    if (typeof e.message === "string") return e.message;
  }
  return "Something went wrong";
}
