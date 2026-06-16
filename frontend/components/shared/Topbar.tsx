"use client";

import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";
import { NotificationBell } from "@/components/shared/NotificationBell";
import { cn } from "@/lib/utils";

const BREADCRUMB_MAP: Record<string, string> = {
  "/overview":      "Overview",
  "/shipments":     "Shipments",
  "/tracking":      "Tracking",
  "/analytics":     "Analytics",
  "/notifications": "Notifications",
  "/settings":      "Settings",
  "/admin":         "Admin",
};

export function Topbar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const pageTitle = BREADCRUMB_MAP[pathname] ?? "Dashboard";

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  return (
    <header className="h-16 shrink-0 border-b border-white/6 bg-[hsl(var(--surface-2))/50] backdrop-blur-sm flex items-center px-6 gap-4">
      {/* Page title */}
      <div className="flex-1 min-w-0">
        <h1 className="text-base font-semibold font-display">{pageTitle}</h1>
        <p className="text-xs text-muted-foreground hidden sm:block">
          {greeting}, {user?.full_name?.split(" ")[0] ?? "there"} 👋
        </p>
      </div>

      {/* Search */}
      <div className="hidden md:flex items-center gap-2 px-3 py-2 rounded-lg bg-white/4 border border-white/6 text-sm text-muted-foreground w-52 cursor-pointer hover:border-white/12 transition-colors">
        <Search className="w-3.5 h-3.5 shrink-0" />
        <span className="text-xs">Search shipments...</span>
        <kbd className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-white/8 font-mono">⌘K</kbd>
      </div>

      {/* Notifications */}
      <NotificationBell />

      {/* Avatar */}
      <div className="w-9 h-9 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center cursor-pointer hover:border-primary/50 transition-all">
        <span className="text-xs font-semibold text-primary">
          {user?.full_name?.[0]?.toUpperCase() ?? "U"}
        </span>
      </div>
    </header>
  );
}
