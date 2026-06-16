"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard, Package, MapPin, BarChart3,
  Bell, Settings, Users, Truck, Shield,
  ChevronRight, LogOut, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/hooks/useAuth";

const NAV_ITEMS = [
  { label: "Overview",      href: "/overview",      icon: LayoutDashboard, roles: ["admin", "user", "driver"] },
  { label: "Shipments",     href: "/shipments",     icon: Package,         roles: ["admin", "user"] },
  { label: "Tracking",      href: "/tracking",      icon: MapPin,          roles: ["admin", "user", "driver"] },
  { label: "Analytics",     href: "/analytics",     icon: BarChart3,       roles: ["admin", "user"] },
  { label: "Notifications", href: "/notifications", icon: Bell,            roles: ["admin", "user", "driver"] },
];

const BOTTOM_ITEMS = [
  { label: "Settings",  href: "/settings",        icon: Settings, roles: ["admin", "user", "driver"] },
  { label: "Admin",     href: "/admin",            icon: Shield,   roles: ["admin"] },
];

export function Sidebar() {
  const pathname   = usePathname();
  const { user, logout, isLoggingOut } = useAuth();
  const role       = user?.role?.name ?? "user";

  const visibleNav    = NAV_ITEMS.filter((i) => i.roles.includes(role));
  const visibleBottom = BOTTOM_ITEMS.filter((i) => i.roles.includes(role));

  return (
    <aside className="w-60 shrink-0 flex flex-col border-r border-[hsl(var(--sidebar-border))] bg-[hsl(var(--sidebar-background))]">
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-[hsl(var(--sidebar-border))]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shadow-glow-sm">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <div>
            <div className="text-sm font-semibold font-display leading-none">A to Z Routes</div>
            <div className="text-[10px] text-muted-foreground mt-0.5 uppercase tracking-wider">
              Logistics Platform
            </div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
        <div className="mb-3 px-2">
          <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
            Navigation
          </p>
        </div>

        {visibleNav.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn("nav-item group", isActive && "active")}
            >
              <item.icon className={cn("w-4 h-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground")} />
              <span className="flex-1">{item.label}</span>
              {isActive && (
                <motion.div
                  layoutId="nav-indicator"
                  className="w-1 h-1 rounded-full bg-primary"
                />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="px-3 pb-4 space-y-0.5 border-t border-[hsl(var(--sidebar-border))] pt-3">
        {visibleBottom.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn("nav-item group", isActive && "active")}
            >
              <item.icon className="w-4 h-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
              <span>{item.label}</span>
            </Link>
          );
        })}

        {/* User card */}
        <div className="mt-3 p-3 rounded-lg bg-white/3 border border-white/6">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
              <span className="text-xs font-semibold text-primary">
                {user?.full_name?.[0]?.toUpperCase() ?? "U"}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{user?.full_name ?? "User"}</p>
              <p className="text-[10px] text-muted-foreground capitalize">{role}</p>
            </div>
            <button
              onClick={() => logout()}
              disabled={isLoggingOut}
              className="text-muted-foreground hover:text-foreground transition-colors"
              title="Logout"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
