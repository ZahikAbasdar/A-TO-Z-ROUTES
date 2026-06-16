"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart2, TrendingUp, Clock, CheckCircle,
  AlertTriangle, Package,
} from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
  RadialBarChart, RadialBar, PieChart, Pie, Cell,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";
import { Skeleton, SectionHeader } from "@/components/ui";
import { getCarrierConfig, formatPercent, cn } from "@/lib/utils";

const FADE = {
  hidden: { opacity: 0, y: 12 },
  show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.07, duration: 0.35 } }),
};
const PIE_COLORS = ["#3370f5", "#06d6e8", "#00e5a0", "#f5a623", "#a855f7", "#ef4444"];

export default function AnalyticsPage() {
  const [days, setDays] = useState(30);

  const { data, isLoading } = useQuery({
    queryKey: ["analytics", "performance", days],
    queryFn:  () => apiGet<any>(`/analytics/performance?days=${days}`),
  });

  const daily        = data?.daily        ?? [];
  const carrierPerf  = data?.carrier_perf ?? [];
  const statusDist   = data?.status_dist  ?? [];
  const riskDist     = data?.risk_dist    ?? {};
  const hourPattern  = data?.hour_pattern ?? [];

  // Derived metrics
  const totalShipments  = statusDist.reduce((s: number, d: any) => s + d.count, 0);
  const totalDelivered  = statusDist.find((d: any) => d.status === "delivered")?.count ?? 0;
  const deliveryRate    = totalShipments ? Math.round((totalDelivered / totalShipments) * 100) : 0;
  const avgDeliveryDays = carrierPerf.length
    ? (carrierPerf.reduce((s: number, c: any) => s + c.avg_delivery_days, 0) / carrierPerf.length).toFixed(1)
    : "—";

  const riskData = [
    { name: "Low",    value: riskDist.low    ?? 0, fill: "#00e5a0" },
    { name: "Medium", value: riskDist.medium ?? 0, fill: "#f5a623" },
    { name: "High",   value: riskDist.high   ?? 0, fill: "#ef4444" },
  ];

  return (
    <div className="max-w-7xl space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-primary" /> Analytics
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Delivery performance and logistics insights</p>
        </div>
        <div className="flex items-center gap-2 p-1 rounded-lg bg-white/4 border border-white/6">
          {[7, 30, 90].map((d) => (
            <button key={d} onClick={() => setDays(d)}
              className={cn("px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                days === d ? "bg-primary text-white" : "text-muted-foreground hover:text-foreground")}>
              {d}d
            </button>
          ))}
        </div>
      </motion.div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)
          : [
              { label: "Total Shipments",  value: totalShipments,            icon: Package,       color: "text-primary" },
              { label: "Delivery Rate",    value: `${deliveryRate}%`,        icon: CheckCircle,   color: "text-green-400" },
              { label: "Avg Delivery",     value: `${avgDeliveryDays} days`, icon: Clock,         color: "text-blue-400" },
              { label: "High Risk",        value: riskDist.high ?? 0,        icon: AlertTriangle, color: "text-amber-400" },
            ].map((k, i) => (
              <motion.div key={k.label} custom={i} variants={FADE} initial="hidden" animate="show" className="card-premium p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">{k.label}</p>
                    <p className={cn("text-2xl font-bold font-display mt-1", k.color)}>{k.value}</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/6 flex items-center justify-center">
                    <k.icon className={cn("w-4.5 h-4.5", k.color)} />
                  </div>
                </div>
              </motion.div>
            ))}
      </div>

      {/* Daily area chart */}
      <motion.div custom={4} variants={FADE} initial="hidden" animate="show" className="card-premium p-5">
        <SectionHeader title="Shipment Activity" description={`Daily breakdown over ${days} days`} />
        {isLoading ? <Skeleton className="h-52 w-full" /> : daily.length === 0 ? (
          <div className="h-52 flex items-center justify-center text-sm text-muted-foreground">No data for this period</div>
        ) : (
          <ResponsiveContainer width="100%" height={210}>
            <AreaChart data={daily} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
              <defs>
                {[["gT","#3370f5"],["gD","#00e5a0"],["gF","#ef4444"]].map(([id,c])=>(
                  <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={c} stopOpacity={0.3}/>
                    <stop offset="95%" stopColor={c} stopOpacity={0}/>
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false}
                tickFormatter={(v) => new Date(v).toLocaleDateString("en",{month:"short",day:"numeric"})} />
              <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background:"hsl(222,22%,11%)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:8, fontSize:12 }} />
              <Area type="monotone" dataKey="total"     stroke="#3370f5" strokeWidth={2} fill="url(#gT)" dot={false} name="Total" />
              <Area type="monotone" dataKey="delivered" stroke="#00e5a0" strokeWidth={2} fill="url(#gD)" dot={false} name="Delivered" />
              <Area type="monotone" dataKey="failed"    stroke="#ef4444" strokeWidth={1.5} fill="url(#gF)" dot={false} name="Failed" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </motion.div>

      {/* Carrier performance + Delay risk */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Carrier bar chart */}
        <motion.div custom={5} variants={FADE} initial="hidden" animate="show" className="xl:col-span-2 card-premium p-5">
          <SectionHeader title="Carrier Performance" description="Success rate by carrier" />
          {isLoading ? <Skeleton className="h-44 w-full" /> : carrierPerf.length === 0 ? (
            <div className="h-44 flex items-center justify-center text-sm text-muted-foreground">No carrier data</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={carrierPerf} margin={{ top: 4, right: 4, bottom: 0, left: -20 }} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="carrier" tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false}
                  tickFormatter={(v) => getCarrierConfig(v).label.split(" ")[0]} />
                <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} domain={[0,100]} tickFormatter={v=>`${v}%`} />
                <Tooltip contentStyle={{ background:"hsl(222,22%,11%)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:8, fontSize:12 }}
                  formatter={(v: any) => [`${v}%`, "Success Rate"]} />
                <Bar dataKey="success_rate" radius={[4,4,0,0]}>
                  {carrierPerf.map((_: any, i: number) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} opacity={0.85} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </motion.div>

        {/* Delay risk pie */}
        <motion.div custom={6} variants={FADE} initial="hidden" animate="show" className="card-premium p-5">
          <SectionHeader title="Delay Risk" description="Current distribution" />
          {isLoading ? <Skeleton className="h-44 w-full" /> : (
            <>
              <ResponsiveContainer width="100%" height={130}>
                <PieChart>
                  <Pie data={riskData} cx="50%" cy="50%" innerRadius={38} outerRadius={58} dataKey="value" paddingAngle={4} strokeWidth={0}>
                    {riskData.map((entry, i) => <Cell key={i} fill={entry.fill} opacity={0.9} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background:"hsl(222,22%,11%)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:8, fontSize:12 }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2">
                {riskData.map((r) => (
                  <div key={r.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ backgroundColor: r.fill }} />
                      <span className="text-xs">{r.name} Risk</span>
                    </div>
                    <span className="text-xs font-medium">{r.value}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </motion.div>
      </div>

      {/* Carrier table + Hour pattern */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Carrier detail table */}
        <motion.div custom={7} variants={FADE} initial="hidden" animate="show" className="card-premium overflow-hidden">
          <div className="p-5 pb-0">
            <SectionHeader title="Carrier Details" />
          </div>
          <table className="w-full">
            <thead><tr className="border-b border-white/5">
              {["Carrier","Total","Delivered","Rate","Avg Days"].map(h=>(
                <th key={h} className="px-5 py-3 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {(isLoading ? [] : carrierPerf).map((c: any) => (
                <tr key={c.carrier} className="table-row-hover">
                  <td className="px-5 py-3">
                    <span className="text-sm font-medium capitalize" style={{ color: getCarrierConfig(c.carrier).color }}>
                      {getCarrierConfig(c.carrier).label}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-sm">{c.total}</td>
                  <td className="px-5 py-3 text-sm text-green-400">{c.delivered}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-white/6 overflow-hidden">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${c.success_rate}%` }} />
                      </div>
                      <span className="text-xs">{c.success_rate}%</span>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-sm text-muted-foreground">{c.avg_delivery_days}d</td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>

        {/* Hour of day pattern */}
        <motion.div custom={8} variants={FADE} initial="hidden" animate="show" className="card-premium p-5">
          <SectionHeader title="Shipment Creation Hours" description="When shipments are typically added" />
          {isLoading ? <Skeleton className="h-44 w-full" /> : hourPattern.length === 0 ? (
            <div className="h-44 flex items-center justify-center text-sm text-muted-foreground">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={hourPattern} margin={{ top: 4, right: 4, bottom: 0, left: -20 }} barCategoryGap="15%">
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                <XAxis dataKey="hour" tick={{ fontSize: 9, fill: "#6b7280" }} tickLine={false} axisLine={false}
                  tickFormatter={(v) => v % 6 === 0 ? `${v}:00` : ""} />
                <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ background:"hsl(222,22%,11%)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:8, fontSize:12 }}
                  labelFormatter={(v) => `${v}:00`} />
                <Bar dataKey="count" fill="#3370f5" opacity={0.8} radius={[2,2,0,0]} name="Shipments" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </motion.div>
      </div>
    </div>
  );
}
