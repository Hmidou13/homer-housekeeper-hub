import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, CalendarDays, Upload, Home, Users, FileBarChart, LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { ReactNode } from "react";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/planning", label: "Planning", icon: CalendarDays },
  { to: "/import", label: "Import", icon: Upload },
  { to: "/maisons", label: "Maisons", icon: Home },
  { to: "/equipes", label: "Équipes", icon: Users },
  { to: "/rapport", label: "Rapport mensuel", icon: FileBarChart },
] as const;

export function AppLayout({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { user, signOut } = useAuth();

  return (
    <div className="flex min-h-screen w-full bg-background text-foreground">
      <aside className="w-60 shrink-0 bg-sidebar text-sidebar-foreground flex flex-col">
        <div className="h-14 flex items-center px-5 border-b border-sidebar-border">
          <span className="font-semibold text-base tracking-tight text-primary">Homer Conciergerie</span>
        </div>
        <nav className="flex-1 px-2 py-4 space-y-1">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = path === to || path.startsWith(to + "/");
            return (
              <Link
                key={to}
                to={to}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border text-xs space-y-2">
          <div className="truncate opacity-80">{user?.email}</div>
          <button
            onClick={signOut}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-sidebar-accent/60"
          >
            <LogOut className="h-3.5 w-3.5" /> Déconnexion
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <header className="h-14 border-b bg-card flex items-center px-8">
          <h1 className="text-base font-medium text-foreground">{getTitle(path)}</h1>
        </header>
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}

function getTitle(path: string): string {
  const m = NAV.find((n) => path.startsWith(n.to));
  return m?.label ?? "Homer";
}
