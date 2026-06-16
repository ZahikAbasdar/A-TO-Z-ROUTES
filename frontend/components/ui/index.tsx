import { cn } from "@/lib/utils";
import { Loader2, LucideIcon, Package } from "lucide-react";
import { ShipmentStatus, DelayRisk } from "@/types";
import { getStatusConfig, DELAY_RISK_CONFIG } from "@/lib/utils";

// ── Badge ──────────────────────────────────────────────────────────────────────
interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "info" | "purple";
  className?: string;
  size?: "sm" | "md";
}

export function Badge({ children, variant = "default", className, size = "md" }: BadgeProps) {
  const variants = {
    default: "bg-white/8 text-foreground/80 border-white/10",
    success: "bg-green-500/15 text-green-400 border-green-500/20",
    warning: "bg-amber-500/15 text-amber-400 border-amber-500/20",
    danger:  "bg-red-500/15 text-red-400 border-red-500/20",
    info:    "bg-blue-500/15 text-blue-400 border-blue-500/20",
    purple:  "bg-purple-500/15 text-purple-400 border-purple-500/20",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border font-medium",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

// ── Status Badge ───────────────────────────────────────────────────────────────
export function StatusBadge({ status }: { status: ShipmentStatus }) {
  const config = getStatusConfig(status);
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border", config.badgeClass)}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: config.color }} />
      {config.label}
    </span>
  );
}

// ── Delay Risk Badge ───────────────────────────────────────────────────────────
export function DelayRiskBadge({ risk }: { risk: DelayRisk }) {
  const config = DELAY_RISK_CONFIG[risk];
  return (
    <span className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border", config.badgeClass)}>
      {config.label}
    </span>
  );
}

// ── Skeleton ───────────────────────────────────────────────────────────────────
interface SkeletonProps { className?: string }
export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn("skeleton", className)} />;
}

export function StatCardSkeleton() {
  return (
    <div className="stat-card">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-16" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
interface StatCardProps {
  title: string;
  value: string | number;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: LucideIcon;
  iconColor?: string;
  subtitle?: string;
}

export function StatCard({ title, value, change, changeType = "neutral", icon: Icon, iconColor = "text-primary", subtitle }: StatCardProps) {
  return (
    <div className="stat-card animate-fade-in">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</p>
          <p className="text-2xl font-bold font-display">{value}</p>
        </div>
        <div className={cn("w-10 h-10 rounded-xl bg-white/5 border border-white/6 flex items-center justify-center", iconColor)}>
          <Icon className="w-4.5 h-4.5" />
        </div>
      </div>
      {(change || subtitle) && (
        <div className="flex items-center gap-1.5">
          {change && (
            <span className={cn("text-xs font-medium",
              changeType === "positive" && "text-green-400",
              changeType === "negative" && "text-red-400",
              changeType === "neutral"  && "text-muted-foreground",
            )}>
              {change}
            </span>
          )}
          {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
        </div>
      )}
    </div>
  );
}

// ── Loading Spinner ────────────────────────────────────────────────────────────
export function LoadingSpinner({ size = "md", className }: { size?: "sm" | "md" | "lg"; className?: string }) {
  const sizes = { sm: "w-4 h-4", md: "w-6 h-6", lg: "w-10 h-10" };
  return <Loader2 className={cn("animate-spin text-primary", sizes[size], className)} />;
}

export function PageLoader() {
  return (
    <div className="flex-1 flex items-center justify-center h-full">
      <div className="text-center space-y-3">
        <LoadingSpinner size="lg" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

// ── Empty State ────────────────────────────────────────────────────────────────
interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, icon: Icon = Package, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-16 h-16 rounded-2xl bg-white/4 border border-white/6 flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-muted-foreground" />
      </div>
      <h3 className="text-base font-semibold font-display mb-1">{title}</h3>
      {description && <p className="text-sm text-muted-foreground max-w-sm mb-6">{description}</p>}
      {action}
    </div>
  );
}

// ── Divider ────────────────────────────────────────────────────────────────────
export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-white/6", className)} />;
}

// ── Section Header ─────────────────────────────────────────────────────────────
interface SectionHeaderProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}
export function SectionHeader({ title, description, action }: SectionHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div>
        <h2 className="text-lg font-semibold font-display">{title}</h2>
        {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
