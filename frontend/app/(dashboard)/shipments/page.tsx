"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Plus, Search, Filter, Package, X } from "lucide-react";
import Link from "next/link";
import { useShipments } from "@/lib/hooks/useShipments";
import {
  StatusBadge, Skeleton, EmptyState, SectionHeader,
} from "@/components/ui";
import { formatDate, getCarrierConfig, cn } from "@/lib/utils";
import { Shipment, ShipmentStatus, CarrierType } from "@/types";

const STATUSES: { value: string; label: string }[] = [
  { value: "",                label: "All Statuses" },
  { value: "pending",         label: "Pending" },
  { value: "picked_up",       label: "Picked Up" },
  { value: "in_transit",      label: "In Transit" },
  { value: "out_for_delivery",label: "Out for Delivery" },
  { value: "delivered",       label: "Delivered" },
  { value: "failed",          label: "Failed" },
  { value: "returned",        label: "Returned" },
];

const CARRIERS: { value: string; label: string }[] = [
  { value: "",          label: "All Carriers" },
  { value: "amazon",    label: "Amazon" },
  { value: "flipkart",  label: "Flipkart" },
  { value: "dhl",       label: "DHL" },
  { value: "fedex",     label: "FedEx" },
  { value: "delhivery", label: "Delhivery" },
  { value: "bluedart",  label: "Blue Dart" },
  { value: "custom",    label: "Custom" },
];

export default function ShipmentsPage() {
  const [search,  setSearch]  = useState("");
  const [status,  setStatus]  = useState("");
  const [carrier, setCarrier] = useState("");
  const [page,    setPage]    = useState(1);

  const { data, isLoading } = useShipments({
    page, per_page: 15,
    search: search || undefined,
    status: status || undefined,
    carrier: carrier || undefined,
  });

  const shipments: Shipment[] = data?.data ?? [];
  const total  = data?.total ?? 0;
  const pages  = data?.pages ?? 1;
  const hasFilters = !!(search || status || carrier);

  function clearFilters() {
    setSearch(""); setStatus(""); setCarrier(""); setPage(1);
  }

  return (
    <div className="space-y-6 max-w-7xl">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold font-display">Shipments</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {total > 0 ? `${total} shipment${total !== 1 ? "s" : ""} total` : "Manage your shipments"}
          </p>
        </div>
        <Link href="/shipments/new" className="btn-primary">
          <Plus className="w-4 h-4" /> Add Shipment
        </Link>
      </motion.div>

      {/* Filters bar */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
        className="card-premium p-4 flex flex-wrap items-center gap-3"
      >
        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search tracking number..."
            className="input-field pl-9 h-9 text-sm"
          />
        </div>

        {/* Status select */}
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="input-field h-9 text-sm w-44 cursor-pointer"
        >
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>

        {/* Carrier select */}
        <select
          value={carrier}
          onChange={(e) => { setCarrier(e.target.value); setPage(1); }}
          className="input-field h-9 text-sm w-40 cursor-pointer"
        >
          {CARRIERS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>

        {hasFilters && (
          <button onClick={clearFilters}
            className="btn-ghost h-9 px-3 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        )}
      </motion.div>

      {/* Table */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
        className="card-premium overflow-hidden"
      >
        {isLoading ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-40" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-6 w-24 rounded-full" />
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-3 w-20" />
              </div>
            ))}
          </div>
        ) : shipments.length === 0 ? (
          <EmptyState
            title={hasFilters ? "No shipments match your filters" : "No shipments yet"}
            description={hasFilters ? "Try adjusting or clearing your filters" : "Create your first shipment to start tracking packages"}
            icon={Package}
            action={!hasFilters ? (
              <Link href="/shipments/new" className="btn-primary text-sm">
                <Plus className="w-4 h-4" /> Add Shipment
              </Link>
            ) : (
              <button onClick={clearFilters} className="btn-ghost border border-white/8">
                Clear filters
              </button>
            )}
          />
        ) : (
          <>
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  {["Shipment", "Carrier", "Status", "Route", "Est. Delivery", "Delay Risk", ""].map((h) => (
                    <th key={h} className="px-5 py-3.5 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shipments.map((s, i) => (
                  <motion.tr
                    key={s.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="table-row-hover"
                  >
                    {/* Shipment info */}
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-white/4 border border-white/6 flex items-center justify-center shrink-0">
                          <Package className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-mono font-medium tracking-wide">
                            {s.tracking_number}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Added {formatDate(s.created_at)}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Carrier */}
                    <td className="px-5 py-3.5">
                      <span className="text-sm font-medium capitalize"
                        style={{ color: getCarrierConfig(s.carrier as CarrierType).color }}
                      >
                        {getCarrierConfig(s.carrier as CarrierType).label}
                      </span>
                    </td>

                    {/* Status */}
                    <td className="px-5 py-3.5">
                      <StatusBadge status={s.status as ShipmentStatus} />
                    </td>

                    {/* Route */}
                    <td className="px-5 py-3.5">
                      {s.origin_warehouse || s.dest_warehouse ? (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <span>{s.origin_warehouse?.city ?? "—"}</span>
                          <span className="text-white/20">→</span>
                          <span>{s.dest_warehouse?.city ?? "—"}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>

                    {/* ETA */}
                    <td className="px-5 py-3.5 text-sm text-muted-foreground whitespace-nowrap">
                      {formatDate(s.ai_eta ?? s.estimated_delivery)}
                    </td>

                    {/* Delay risk */}
                    <td className="px-5 py-3.5">
                      <span className={cn(
                        "text-xs font-medium",
                        s.delay_risk === "low"    && "text-green-400",
                        s.delay_risk === "medium" && "text-amber-400",
                        s.delay_risk === "high"   && "text-red-400",
                      )}>
                        {s.delay_risk === "low" ? "Low" : s.delay_risk === "medium" ? "Medium" : "High"}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="px-5 py-3.5">
                      <Link href={`/tracking/${s.id}`}
                        className="text-xs text-primary hover:text-primary/80 transition-colors whitespace-nowrap"
                      >
                        Track →
                      </Link>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {pages > 1 && (
              <div className="flex items-center justify-between px-5 py-4 border-t border-white/5">
                <p className="text-xs text-muted-foreground">
                  Showing {(page - 1) * 15 + 1}–{Math.min(page * 15, total)} of {total}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="btn-ghost h-8 px-3 text-xs disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-muted-foreground">{page} / {pages}</span>
                  <button
                    onClick={() => setPage((p) => Math.min(pages, p + 1))}
                    disabled={page === pages}
                    className="btn-ghost h-8 px-3 text-xs disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </motion.div>
    </div>
  );
}
