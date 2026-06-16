"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, CheckCheck, Package, AlertTriangle, CheckCircle, Info, ArrowRight } from "lucide-react";
import Link from "next/link";
import { useNotifications, useMarkAllRead, AppNotification } from "@/lib/hooks/useNotifications";
import { timeAgo, cn } from "@/lib/utils";

const TYPE_ICON = {
  shipment_update:    { icon: Package,       color: "text-blue-400" },
  delay_alert:        { icon: AlertTriangle, color: "text-amber-400" },
  delivery_confirmed: { icon: CheckCircle,   color: "text-green-400" },
  system:             { icon: Info,          color: "text-muted-foreground" },
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data } = useNotifications(1, false);
  const { mutate: markAll } = useMarkAllRead();

  const notifications: AppNotification[] = (data?.data ?? []).slice(0, 6);
  const unreadCount = data?.unread_count ?? 0;

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      {/* Bell button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative w-9 h-9 rounded-lg bg-white/4 border border-white/6 flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-white/12 transition-all"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary border-2 border-[hsl(var(--surface-2))] flex items-center justify-center text-[9px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -8 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-11 w-80 z-50"
          >
            <div className="card-premium shadow-xl border border-white/8 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/6">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold font-display">Notifications</h3>
                  {unreadCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded-full bg-primary/15 text-primary text-[10px] font-medium">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button onClick={() => markAll()} className="text-[11px] text-primary hover:text-primary/80 flex items-center gap-1 transition-colors">
                    <CheckCheck className="w-3 h-3" /> Mark all read
                  </button>
                )}
              </div>

              {/* Notification list */}
              <div className="max-h-80 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="py-8 text-center">
                    <Bell className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-40" />
                    <p className="text-xs text-muted-foreground">No notifications yet</p>
                  </div>
                ) : (
                  notifications.map((notif) => {
                    const cfg  = TYPE_ICON[notif.type] ?? TYPE_ICON.system;
                    const Icon = cfg.icon;
                    return (
                      <div
                        key={notif.id}
                        className={cn(
                          "flex items-start gap-3 px-4 py-3 border-b border-white/4 last:border-0",
                          "hover:bg-white/3 transition-colors",
                          !notif.is_read && "bg-primary/3",
                        )}
                      >
                        <div className="w-7 h-7 rounded-lg bg-white/6 border border-white/8 flex items-center justify-center shrink-0 mt-0.5">
                          <Icon className={cn("w-3.5 h-3.5", cfg.color)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={cn("text-xs font-medium leading-snug", !notif.is_read ? "text-foreground" : "text-foreground/75")}>
                            {notif.title}
                          </p>
                          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">{notif.body}</p>
                          <p className="text-[10px] text-muted-foreground mt-1">{timeAgo(notif.created_at)}</p>
                        </div>
                        {!notif.is_read && (
                          <div className="w-1.5 h-1.5 rounded-full bg-primary mt-2 shrink-0 animate-pulse" />
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* Footer */}
              <div className="px-4 py-2.5 border-t border-white/6">
                <Link
                  href="/notifications"
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors"
                >
                  View all notifications <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
