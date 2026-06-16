import { Sidebar } from "@/components/shared/Sidebar";
import { Topbar } from "@/components/shared/Topbar";
import { GlobalWSProvider } from "@/components/shared/GlobalWSProvider";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <GlobalWSProvider>
      <div className="flex h-screen overflow-hidden bg-[hsl(var(--surface-1))]">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <Topbar />
          <main className="flex-1 overflow-y-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </GlobalWSProvider>
  );
}
