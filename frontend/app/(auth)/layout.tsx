import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Auth", template: "%s | A to Z Routes" },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      {/* ── Left panel — branding ── */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-[hsl(var(--surface-0))] flex-col justify-between p-12">
        {/* Mesh background */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
          <div className="absolute bottom-0 right-0 w-80 h-80 bg-neon-cyan/8 rounded-full blur-3xl translate-x-1/3 translate-y-1/3" />
          <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-neon-green/5 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
          {/* Grid pattern */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
              backgroundSize: "40px 40px",
            }}
          />
        </div>

        {/* Logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary flex items-center justify-center shadow-glow">
              <span className="text-white font-bold text-sm font-display">AZ</span>
            </div>
            <span className="text-lg font-semibold font-display tracking-tight">A to Z Routes</span>
          </div>
        </div>

        {/* Hero content */}
        <div className="relative z-10 space-y-8">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              Live tracking platform
            </div>
            <h1 className="text-4xl font-bold font-display leading-tight">
              Track every mile,<br />
              <span className="text-primary">from A to Z.</span>
            </h1>
            <p className="text-muted-foreground text-lg leading-relaxed max-w-sm">
              Premium logistics intelligence for modern businesses. Real-time tracking, AI predictions, and live route visualization.
            </p>
          </div>

          {/* Feature pills */}
          <div className="flex flex-wrap gap-2">
            {["Real-time tracking", "AI ETA prediction", "Route visualization", "Delay alerts"].map((f) => (
              <span
                key={f}
                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/8 text-sm text-muted-foreground"
              >
                {f}
              </span>
            ))}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-white/6">
            {[
              { value: "99.9%", label: "Uptime" },
              { value: "< 2s",  label: "Update latency" },
              { value: "8+",    label: "Carriers" },
            ].map((s) => (
              <div key={s.label}>
                <div className="text-xl font-bold font-display text-foreground">{s.value}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="relative z-10 text-xs text-muted-foreground">
          © {new Date().getFullYear()} A to Z Routes · Built by Zahik Abas
        </div>
      </div>

      {/* ── Right panel — form ── */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
