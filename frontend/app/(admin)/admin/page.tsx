"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Users, Package, Truck, Wifi, TrendingUp, Shield, Search, ToggleLeft, ToggleRight, ChevronRight, Activity } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost } from "@/lib/api/client";
import { StatusBadge, Skeleton, SectionHeader, Badge } from "@/components/ui";
import { formatDate, getCarrierConfig, cn } from "@/lib/utils";
import { Shipment } from "@/types";
import toast from "react-hot-toast";

const FADE = { hidden: { opacity: 0, y: 12 }, show: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.3 } }) };

export default function AdminPage() {
  const qc = useQueryClient();
  const [userSearch, setUserSearch] = useState("");
  const [shipSearch, setShipSearch] = useState("");
  const [tab, setTab] = useState<"overview"|"users"|"shipments"|"logs">("overview");

  const { data: stats, isLoading: statsLoading } = useQuery({ queryKey: ["admin","stats"], queryFn: () => apiGet<any>("/admin/stats") });
  const { data: wsStats } = useQuery({ queryKey: ["admin","ws"], queryFn: () => apiGet<any>("/admin/ws-stats"), refetchInterval: 10_000 });
  const { data: usersData } = useQuery({ queryKey: ["admin","users", userSearch], queryFn: () => apiGet<any>(`/admin/users?search=${userSearch}&per_page=20`), enabled: tab === "users" });
  const { data: shipmentsData } = useQuery({ queryKey: ["admin","shipments", shipSearch], queryFn: () => apiGet<any>(`/admin/shipments?search=${shipSearch}&per_page=20`), enabled: tab === "shipments" });
  const { data: logsData } = useQuery({ queryKey: ["admin","logs"], queryFn: () => apiGet<any>("/admin/audit-logs?per_page=30"), enabled: tab === "logs" });

  const toggleUser = useMutation({
    mutationFn: (id: string) => apiPost(`/admin/users/${id}/toggle`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin","users"] }); toast.success("User status updated"); },
  });

  const TABS = [
    { id: "overview",   label: "Overview",   icon: Activity },
    { id: "users",      label: "Users",      icon: Users },
    { id: "shipments",  label: "Shipments",  icon: Package },
    { id: "logs",       label: "Audit Logs", icon: Shield },
  ] as const;

  return (
    <div className="max-w-7xl space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold font-display flex items-center gap-2">
          <Shield className="w-6 h-6 text-primary" /> Admin Dashboard
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Platform management and oversight</p>
      </motion.div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-white/3 border border-white/6 w-fit">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id as any)}
            className={cn("flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              tab === t.id ? "bg-primary text-white shadow-glow-sm" : "text-muted-foreground hover:text-foreground hover:bg-white/5")}>
            <t.icon className="w-3.5 h-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {/* OVERVIEW */}
      {tab === "overview" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {statsLoading ? Array.from({length:4}).map((_,i)=><Skeleton key={i} className="h-28 rounded-xl"/>) : [
              { label: "Total Users",     value: stats?.total_users ?? 0,       icon: Users,     color: "text-primary" },
              { label: "Total Shipments", value: stats?.total_shipments ?? 0,    icon: Package,   color: "text-blue-400" },
              { label: "Active Drivers",  value: stats?.active_drivers ?? 0,     icon: Truck,     color: "text-green-400" },
              { label: "New (24h)",       value: stats?.new_last_24h ?? 0,        icon: TrendingUp,color: "text-amber-400" },
            ].map((s, i) => (
              <motion.div key={s.label} custom={i} variants={FADE} initial="hidden" animate="show" className="card-premium p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">{s.label}</p>
                    <p className={cn("text-2xl font-bold font-display mt-1", s.color)}>{s.value}</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/6 flex items-center justify-center">
                    <s.icon className={cn("w-4.5 h-4.5", s.color)} />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Status breakdown + WS stats */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card-premium p-5">
              <h3 className="font-semibold font-display text-sm mb-4">Shipment Status Breakdown</h3>
              <div className="space-y-2.5">
                {Object.entries(stats?.status_breakdown ?? {}).map(([status, count]: any) => {
                  const pct = stats?.total_shipments ? Math.round((count/stats.total_shipments)*100) : 0;
                  return (
                    <div key={status}>
                      <div className="flex items-center justify-between mb-1">
                        <StatusBadge status={status as any} />
                        <span className="text-xs text-muted-foreground">{count} ({pct}%)</span>
                      </div>
                      <div className="h-1 rounded-full bg-white/6 overflow-hidden">
                        <motion.div className="h-full rounded-full bg-primary/60" initial={{width:0}} animate={{width:`${pct}%`}} transition={{duration:0.6}}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="card-premium p-5">
              <h3 className="font-semibold font-display text-sm mb-4 flex items-center gap-2">
                <Wifi className="w-4 h-4 text-green-400" /> WebSocket Status
              </h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg bg-white/3 border border-white/6">
                  <span className="text-sm text-muted-foreground">Active connections</span>
                  <span className="text-lg font-bold font-display text-green-400">{wsStats?.total_connections ?? 0}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-white/3 border border-white/6">
                  <span className="text-sm text-muted-foreground">Active rooms</span>
                  <span className="text-lg font-bold font-display text-primary">{wsStats?.total_rooms ?? 0}</span>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-white/3 border border-white/6">
                  <span className="text-sm text-muted-foreground">On-time rate</span>
                  <span className="text-lg font-bold font-display text-amber-400">{stats?.on_time_rate ?? 0}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* USERS */}
      {tab === "users" && (
        <div className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input value={userSearch} onChange={(e)=>setUserSearch(e.target.value)} placeholder="Search users..." className="input-field pl-9 h-9 text-sm" />
          </div>
          <div className="card-premium overflow-hidden">
            <table className="w-full">
              <thead><tr className="border-b border-white/5">
                {["User","Role","Status","Joined","Actions"].map(h=><th key={h} className="px-5 py-3.5 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{h}</th>)}
              </tr></thead>
              <tbody>
                {(usersData?.data ?? []).map((user: any) => (
                  <tr key={user.id} className="table-row-hover">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-xs font-semibold text-primary">{user.full_name?.[0]?.toUpperCase()}</div>
                        <div><p className="text-sm font-medium">{user.full_name}</p><p className="text-xs text-muted-foreground">{user.email}</p></div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5"><Badge variant={user.role?.name==="admin"?"warning":user.role?.name==="driver"?"info":"default"}>{user.role?.name}</Badge></td>
                    <td className="px-5 py-3.5"><Badge variant={user.is_active?"success":"danger"}>{user.is_active?"Active":"Suspended"}</Badge></td>
                    <td className="px-5 py-3.5 text-sm text-muted-foreground">{formatDate(user.created_at)}</td>
                    <td className="px-5 py-3.5">
                      <button onClick={()=>toggleUser.mutate(user.id)} className="btn-ghost h-8 px-3 text-xs gap-1.5">
                        {user.is_active ? <ToggleRight className="w-3.5 h-3.5 text-green-400"/> : <ToggleLeft className="w-3.5 h-3.5 text-muted-foreground"/>}
                        {user.is_active?"Suspend":"Activate"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SHIPMENTS */}
      {tab === "shipments" && (
        <div className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input value={shipSearch} onChange={(e)=>setShipSearch(e.target.value)} placeholder="Search tracking #..." className="input-field pl-9 h-9 text-sm" />
          </div>
          <div className="card-premium overflow-hidden">
            <table className="w-full">
              <thead><tr className="border-b border-white/5">
                {["Shipment","User","Carrier","Status","Driver","ETA"].map(h=><th key={h} className="px-5 py-3.5 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{h}</th>)}
              </tr></thead>
              <tbody>
                {(shipmentsData?.data ?? []).map((s: Shipment & {user?: any, driver?: any}) => (
                  <tr key={s.id} className="table-row-hover">
                    <td className="px-5 py-3.5"><p className="text-sm font-mono font-medium">{s.tracking_number}</p><p className="text-xs text-muted-foreground">{formatDate(s.created_at)}</p></td>
                    <td className="px-5 py-3.5 text-sm text-muted-foreground">{s.user?.full_name ?? "—"}</td>
                    <td className="px-5 py-3.5"><span className="text-sm font-medium capitalize" style={{color: getCarrierConfig(s.carrier as any).color}}>{getCarrierConfig(s.carrier as any).label}</span></td>
                    <td className="px-5 py-3.5"><StatusBadge status={s.status as any}/></td>
                    <td className="px-5 py-3.5 text-sm text-muted-foreground">{s.driver ? <Badge variant="info">Assigned</Badge> : <span className="text-xs text-muted-foreground">Unassigned</span>}</td>
                    <td className="px-5 py-3.5 text-sm text-muted-foreground">{formatDate(s.ai_eta ?? s.estimated_delivery)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* AUDIT LOGS */}
      {tab === "logs" && (
        <div className="card-premium overflow-hidden">
          <table className="w-full">
            <thead><tr className="border-b border-white/5">
              {["Action","User","Resource","IP","Time"].map(h=><th key={h} className="px-5 py-3.5 text-left text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{h}</th>)}
            </tr></thead>
            <tbody>
              {(logsData?.data ?? []).map((log: any) => (
                <tr key={log.id} className="table-row-hover">
                  <td className="px-5 py-3.5"><span className="text-xs font-mono bg-white/5 px-2 py-1 rounded">{log.action}</span></td>
                  <td className="px-5 py-3.5 text-xs text-muted-foreground font-mono">{log.user_id?.slice(0,8) ?? "system"}</td>
                  <td className="px-5 py-3.5 text-xs text-muted-foreground capitalize">{log.resource_type ?? "—"}</td>
                  <td className="px-5 py-3.5 text-xs text-muted-foreground font-mono">{log.ip_address ?? "—"}</td>
                  <td className="px-5 py-3.5 text-xs text-muted-foreground">{formatDate(log.created_at, "MMM d, h:mm a")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
