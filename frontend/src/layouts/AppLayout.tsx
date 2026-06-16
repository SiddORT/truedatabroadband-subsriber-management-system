import { LayoutDashboard, LogOut, Menu } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const COMPANY_NAME = "True Data Broadband Services Pvt. Ltd.";

interface AppLayoutProps {
  title: string;
  portalLabel: string;
  children: React.ReactNode;
}

export function AppLayout({ title, portalLabel, children }: AppLayoutProps) {
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems = [
    { label: "Dashboard", icon: LayoutDashboard, active: true },
  ];

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform lg:static lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center gap-2.5 border-b border-white/10 px-6">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            TD
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold">True Data</span>
            <span className="text-[11px] text-sidebar-muted">
              Broadband Services
            </span>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-5">
          <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">
            {portalLabel}
          </p>
          {navItems.map((item) => (
            <a
              key={item.label}
              href="#"
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                item.active
                  ? "bg-sidebar-active text-white"
                  : "text-sidebar-muted hover:bg-white/5 hover:text-white",
              )}
            >
              <item.icon className="h-4.5 w-4.5" />
              {item.label}
            </a>
          ))}
        </nav>

        <div className="border-t border-white/10 p-4 text-[11px] text-sidebar-muted">
          Phase 1 · Foundation
        </div>
      </aside>

      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header */}
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-border bg-surface px-4 lg:px-8">
          <div className="flex items-center gap-3">
            <button
              className="rounded-lg p-2 text-foreground hover:bg-muted lg:hidden"
              onClick={() => setSidebarOpen((v) => !v)}
              aria-label="Toggle navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-base font-semibold text-foreground">
                {title}
              </h1>
              <p className="hidden text-xs text-muted-foreground sm:block">
                {COMPANY_NAME}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-foreground">
                {user?.email}
              </p>
              <p className="text-xs text-muted-foreground">{user?.role}</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {user?.email?.[0]?.toUpperCase() ?? "U"}
            </div>
            <Button variant="outline" size="sm" onClick={() => void logout()}>
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </header>

        {/* Content area */}
        <main className="flex-1 animate-fade-in p-4 lg:p-8">{children}</main>

        {/* Footer */}
        <footer className="border-t border-border bg-surface px-4 py-4 text-center text-xs text-muted-foreground lg:px-8">
          <span>
            © {new Date().getFullYear()} {COMPANY_NAME}
          </span>
          <span className="mx-2">·</span>
          <span className="font-medium text-secondary">Powered by ORT</span>
        </footer>
      </div>
    </div>
  );
}
