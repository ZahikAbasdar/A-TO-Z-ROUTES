"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell, CheckCheck, Trash2, Package,
  AlertTriangle, CheckCircle, Info, Filter, X,
} from "lucide-react";
import Link from "next/link";
import {
  useNotifications, useMarkRead, useMarkAllRead,
  useDeleteNotification, AppNotification,
} from "@/lib/hooks/useNotifications";
import { Skeleton, EmptyState, Badge } from "@/components/ui";
import { timeAgo, cn } from "@/lib/utils";

const TYPE_CONFIG = {
  shipment_update:    { icon: Package,       color: "text-blue-400",  bg: "bg-blue-500/10 border-blue-500/20" },
  delay_alert:        { icon: AlertTriangle, color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
  delivery_confirmed: { icon: CheckCircle,   color: "text-green-400", bg: "bg-green-500/10 border-green-500/20" },
  system:             { icon: Info,          color: "text-muted-foreground", bg: "bg-white/5 border-white/10" },
};

export default function NotificationsPage() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage]             = useState(1);

  const { data, isLoading }  = useNotifications(page, unreadOnly);
  const { mutate: markRead } = useMarkRead();
  const { mutate: markAll, isPending: markingAll } = useMarkAllRead();
  const { mutate: deleteN }  = useDeleteNotification();

  const notifications: AppNotification[] = data?.data ?? [];
  const unreadCount  = data?.unread_count ?? 0;
  const totalPages   = data?.pages ?? 1;

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between flex-wrap gap-4"
      >
        <div>
          <h1 className="text-2xl font-bold font-display flex items-center gap-2">
            <Bell className="w-6 h-6 text-primary" /> Notifications
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-primary text-white text-xs font-medium">
                {unreadCount}
              </span>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.total ?? 0} total · {unreadCount} unread
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => { setUnreadOnly((v) => !v); setPage(1); }}
            className={cn("btn-ghost h-9 px-3 text-xs gap-1.5 border",
              unreadOnly ? "border-primary/40 bg-primary/10 text-primary" : "border-white/8")}
          >
            <Filter className="w-3.5 h-3.5" />
            {unreadOnly ? "All" : "Unread only"}
          </button>

          {unreadCount > 0 && (
            <button onClick={() => markAll()} disabled={markingAll}
              className="btn-ghost h-9 px-3 text-xs gap-1.5 border border-white/8"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Mark all read
            </button>
          )}
        </div>
      </motion.div>

      {/* List */}
      <div className="space-y-2">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card-premium p-4 flex items-start gap-3">
              <Skeleton className="w-9 h-9 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-64" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          ))
        ) : notifications.length === 0 ? (
          <EmptyState
            title={unreadOnly ? "No unread notifications" : "No notifications yet"}
            description="You'll see updates about your shipments here"
            icon={Bell}
            action={unreadOnly ? (
              <button onClick={() => setUnreadOnly(false)} className="btn-ghost border border-white/8">
                Show all notifications
              </button>
            ) : undefined}
          />
        ) : (
          <AnimatePresence initial={false}>
            {notifications.map((notif, i) => {
              const config = TYPE_CONFIG[notif.type] ?? TYPE_CONFIG.system;
              const Icon   = config.icon;
              return (
                <motion.div
                  key={notif.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className={cn(
                    "card-premium p-4 flex items-start gap-3 transition-all duration-150",
                    !notif.is_read && "border-primary/20 bg-primary/3",
                  )}
                >
                  {/* Icon */}
                  <div className={cn(
                    "w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 mt-0.5",
                    config.bg,
                  )}>
                    <Icon className={cn("w-4 h-4", config.color)} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn(
                        "text-sm font-medium leading-snug",
                        !notif.is_read ? "text-foreground" : "text-foreground/80",
                      )}>
                        {notif.title}
                      </p>
                      {!notif.is_read && (
                        <span className="w-2 h-2 rounded-full bg-primary mt-1 shrink-0 animate-pulse" />
                      )}
                    </div>

                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      {notif.body}
                    </p>

                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-[11px] text-muted-foreground">
                        {timeAgo(notif.created_at)}
                      </span>
                      <Badge size="sm" variant={
                        notif.type === "delay_alert"        ? "warning" :
                        notif.type === "delivery_confirmed" ? "success" :
                        notif.type === "shipment_update"    ? "info"    : "default"
                      }>
                        {notif.type.replace("_", " ")}
                      </Badge>
                      {notif.shipment_id && (
                        <Link href={`/tracking/${notif.shipment_id}`}
                          className="text-[11px] text-primary hover:text-primary/80 transition-colors"
                        >
                          View shipment →
                        </Link>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    {!notif.is_read && (
                      <button onClick={() => markRead(notif.id)}
                        className="w-7 h-7 rounded-lg hover:bg-white/8 flex items-center justify-center text-muted-foreground hover:text-foreground transition-all"
                        title="Mark as read"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button onClick={() => deleteN(notif.id)}
                      className="w-7 h-7 rounded-lg hover:bg-red-500/10 flex items-center justify-center text-muted-foreground hover:text-red-400 transition-all"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Page {page} of {totalPages}</p>
          <div className="flex items-center gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="btn-ghost h-8 px-3 text-xs disabled:opacity-40">Previous</button>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="btn-ghost h-8 px-3 text-xs disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}
