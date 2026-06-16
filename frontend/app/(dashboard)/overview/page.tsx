"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Package, Truck, AlertTriangle, CheckCircle,
  Clock, Plus, ArrowRight,
} from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import Link from "next/link";
import { useAuth } from "@/lib/hooks/useAuth";
import {
  useDashboardStats, useShipmentTrends,
  useCarrierBreakdown, useShipments,
} from "@/lib/hooks/useShipments";
import {
  StatCard, StatCardSkeleton, StatusBadge,
  Skeleton, EmptyState, SectionHeader,
} from "@/components/ui";
import { formatDate, formatPercent, getCarrierConfig, cn } from "@/lib/utils";
import { Shipment } from "@/types";

const FADE_UP = {
  hidden: { opacity: 0, y: 16 },
  show: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.07, duration: 0.35, ease: "easeOut" },
  }),
};
const PIE_COLORS = ["#3370f5","#06d6e8","#00e5a0","#f5a623","#a855f7","#ef4444","#f97316","#6B7280"];

export default function OverviewPage() {
  const { user } = useAuth();
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: trends, isLoading: trendsLoading } = useShipmentTrends(30);
  const { data: carriers } = useCarrierBreakdown();
  const { data: shipmentsData, isLoading: shipLoading } = useShipments({ per_page: 6 });
  const recentShipments: Shipment[] = shipmentsData?.data ?? [];
  const firstName = user?.full_name?.split(" ")[0] ?? "there";

  return (
    <div className="space-y-6 max-w-7xl">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold font-display">Hey, {firstName} 👋</h1>
          <p className="text-muted-foreground text-sm mt-1">Here&apos;s what&apos;s happening with your shipments today.</p>
        </div>
        <Link href="/shipments/new" className="btn-primary hidden sm:inline-flex">
          <Plus className="w-4 h-4" /> Add Shipment
        </Link>
      </motion.div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statsLoading ? Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />) : (
          <>
            {[
              { title: "Total Shipments", value: stats?.total_shipments ?? 0, icon: Package, color: "text-primary", change: "+12% this month", changeType: "positive" as const },
              { title: "In Transit",      value: stats?.in_transit ?? 0,       icon: Truck,   color: "text-blue-400",  subtitle: "Active deliveries" },
              { title: "Delivered",       value: stats?.delivered ?? 0,        icon: CheckCircle, color: "text-green-400", change: `${formatPercent(stats?.on_time_rate ?? 0)} on time`, changeType: "positive" as const },
             { title: "Needs Attention", value: stats?.failed ?? 0, icon: AlertTriangle, color: "text-amber-400", subtitle: "Failed shipments" },
            ].map((card, i) => (
              <motion.div key={card.title} custom={i} variants={FADE_UP} initial="hidden" animate="show">
                <StatCard {...card} iconColor={card.color} />
              </motion.div>
            ))}
          </>
        )}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <motion.div custom={4} variants={FADE_UP} initial="hidden" animate="show" className="xl:col-span-2 card-premium p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-semibold font-display text-sm">Shipment Activity</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Last 30 days</p>
            </div>
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              {[["#3370f5","Created"],["#00e5a0","Delivered"],["#ef4444","Failed"]].map(([c,l]) => (
                <span key={l} className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c }} /> {l}
                </span>
              ))}
            </div>
          </div>
          {trendsLoading ? <Skeleton className="h-48 w-full" /> : (trends?.length ?? 0) === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">No data yet — add your first shipment</div>
          ) : (
            <ResponsiveContainer width="100%" height={190}>
              <AreaChart data={trends} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="gC" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3370f5" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3370f5" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gD" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#00e5a0" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#00e5a0" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false}
                  tickFormatter={(v) => new Date(v).toLocaleDateString("en",{ month:"short", day:"numeric" })} />
                <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background:"hsl(222,22%,11%)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:8, fontSize:12 }} labelStyle={{ color:"#c2c0b6" }} />
                <Area type="monotone" dataKey="created"   stroke="#3370f5" strokeWidth={2} fill="url(#gC)" dot={false} />
                <Area type="monotone" dataKey="delivered" stroke="#00e5a0" strokeWidth={2} fill="url(#gD)" dot={false} />
                <Area type="monotone" dataKey="failed"    stroke="#ef4444" strokeWidth={1.5} fill="none" dot={false} strokeDasharray="3 3" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </motion.div>

        <motion.div custom={5} variants={FADE_UP} initial="hidden" animate="show" className="card-premium p-5">
          <h3 className="font-semibold font-display text-sm mb-1">By Carrier</h3>
          <p className="text-xs text-muted-foreground mb-4">Shipment distribution</p>
          {!carriers || carriers.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">No data yet</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={150}>
                <PieChart>
                  <Pie data={carriers} cx="50%" cy="50%" innerRadius={45} outerRadius={68} dataKey="count" nameKey="carrier" paddingAngle={3} strokeWidth={0}>
                    {carriers.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} opacity={0.9} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background:"hsl(222,22%,11%)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:8, fontSize:12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 mt-2">
                {carriers.slice(0, 4).map((c, i) => (
                  <div key={c.carrier} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-xs capitalize">{getCarrierConfig(c.carrier as any).label}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{c.percentage}%</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </motion.div>
      </div>

      {/* Recent Shipments */}
      <motion.div custom={6} variants={FADE_UP} initial="hidden" animate="show" className="card-premium">
        <div className="p-5 pb-0">
          <SectionHeader title="Recent Shipments" description="Your latest shipments"
            action={<Link href="/shipments" className="btn-ghost text-xs gap-1 px-3 py-1.5 h-auto">View all <ArrowRight className="w-3 h-3" /></Link>}
          />
        </div>
        {shipLoading ? (
          <div className="p-5 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-9 w-9 rounded-lg" />
                <div className="flex-1 space-y-1.5"><Skeleton className="h-3.5 w-36" /><Skeleton className="h-3 w-24" /></div>
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-3 w-20" />
              </div>
            ))}
          </div>
        ) : recentShipments.length === 0 ? (
          <EmptyState title="No shipments yet" description="Add your first shipment to start tracking" icon={Package}
            action={<Link href="/shipments/new" className="btn-primary text-sm"><Plus className="w-4 h-4" /> Add Shipment</Link>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/4">
                  {["Tracking #","Carrier","Status","Destination","ETA",""].map((h) => (
                    <th key={h} className="px-5 py-3 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {recentShipments.map((s) => (
                  <tr key={s.id} className="table-row-hover">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-white/4 border border-white/6 flex items-center justify-center">
                          <Package className="w-3.5 h-3.5 text-muted-foreground" />
                        </div>
                        <div>
                          <p className="text-sm font-mono font-medium">{s.tracking_number}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(s.created_at)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-sm capitalize" style={{ color: getCarrierConfig(s.carrier as any).color }}>
                        {getCarrierConfig(s.carrier as any).label}
                      </span>
                    </td>
                    <td className="px-5 py-3.5"><StatusBadge status={s.status as any} /></td>
                    <td className="px-5 py-3.5 text-sm text-muted-foreground">{s.dest_warehouse?.city ?? "—"}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{formatDate(s.ai_eta ?? s.estimated_delivery)}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <Link href={`/tracking/${s.id}`} className="text-xs text-primary hover:text-primary/80 transition-colors">Track →</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Performance cards */}
      {stats && (
        <motion.div custom={7} variants={FADE_UP} initial="hidden" animate="show" className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: "On-Time Delivery Rate",  value: formatPercent(stats.on_time_rate),             color: "text-green-400", bar: "bg-green-500",  prog: stats.on_time_rate },
            { label: "Avg. Delivery Time",     value: `${stats.avg_delivery_days} days`,             color: "text-blue-400",  bar: "bg-blue-500",   prog: Math.min((stats.avg_delivery_days/10)*100,100) },
            { label: "High Delay Risk",        value: `${stats.delay_risk_distribution?.high ?? 0} shipments`, color: "text-amber-400", bar: "bg-amber-500", prog: stats.total_shipments ? ((stats.delay_risk_distribution?.high ?? 0)/stats.total_shipments)*100 : 0 },
          ].map((p) => (
            <div key={p.label} className="card-premium p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">{p.label}</p>
                <span className={cn("text-sm font-semibold font-display", p.color)}>{p.value}</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/6 overflow-hidden">
                <motion.div className={cn("h-full rounded-full", p.bar)}
                  initial={{ width: 0 }} animate={{ width: `${Math.min(p.prog, 100)}%` }}
                  transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }}
                />
              </div>
            </div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
