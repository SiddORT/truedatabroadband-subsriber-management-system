import {
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquare,
  User,
  Monitor,
  Wifi,
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const COMPANY_NAME = "True Data Broadband Pvt. Ltd.";

interface NavItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  matchPrefix: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: "Dashboard",
    icon: LayoutDashboard,
    href: "/client/dashboard",
    matchPrefix: "/client/dashboard",
  },
  {
    label: "My Connections",
    icon: Wifi,
    href: "/client/connections",
    matchPrefix: "/client/connections",
  },
  {
    label: "Billing",
    icon: CreditCard,
    href: "/client/billing",
    matchPrefix: "/client/billing",
  },
  {
    label: "Profile",
    icon: User,
    href: "/client/profile",
    matchPrefix: "/client/profile",
  },
  {
    label: "Support",
    icon: MessageSquare,
    href: "/client/support",
    matchPrefix: "/client/support",
  },
  {
    label: "Sessions",
    icon: Monitor,
    href: "/client/sessions",
    matchPrefix: "/client/sessions",
  },
];

interface ClientLayoutProps {
  title: string;
  children: React.ReactNode;
}

export function ClientLayout({ title, children }: ClientLayoutProps) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/client/login", { replace: true });
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 flex w-64 flex-col bg-sidebar text-sidebar-foreground transition-transform lg:static lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        {/* Logo area */}
        <div className="flex h-16 items-center border-b border-white/10 px-5">
          <img src="/logo-small.png" alt="True Data Broadband" className="h-9 w-auto" />
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-5">
          <p className="flex items-center gap-1.5 px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Client Portal
          </p>
          {NAV_ITEMS.map((item) => {
            const isActive = location.pathname.startsWith(item.matchPrefix);
            return (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "border-l-2 border-accent bg-sidebar-active pl-[10px] text-white"
                    : "border-l-2 border-transparent text-sidebar-muted hover:bg-white/5 hover:text-white",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
                    isActive
                      ? "border border-accent/70 bg-accent/10 text-accent"
                      : "text-sidebar-muted",
                  )}
                >
                  <item.icon className="h-4 w-4" />
                </span>
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-white/10 px-4 py-3">
          <span className="text-xs text-white/30">Powered by </span>
          <span className="text-xs font-bold tracking-tight text-white/50">
            ort<span className="text-cyan-500/60">_</span>
          </span>
        </div>
      </aside>

      {/* Overlay */}
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
              <h1 className="text-base font-semibold text-foreground">{title}</h1>
              <p className="hidden text-xs text-muted-foreground sm:block">{COMPANY_NAME}</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-foreground">{user?.email}</p>
              <p className="text-xs text-muted-foreground">Client Portal</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {user?.email?.[0]?.toUpperCase() ?? "C"}
            </div>
            <Button variant="outline" size="sm" onClick={() => void handleLogout()}>
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </header>

        {/* Content area */}
        <main className="flex-1 animate-fade-in p-4 lg:p-8">{children}</main>

        {/* Footer */}
        <footer className="border-t border-border bg-surface px-4 py-4 text-center text-xs text-muted-foreground lg:px-8">
          <span>© {new Date().getFullYear()} {COMPANY_NAME}</span>
          <span className="mx-2">·</span>
          <span>Powered by ORT</span>
        </footer>
      </div>
    </div>
  );
}
