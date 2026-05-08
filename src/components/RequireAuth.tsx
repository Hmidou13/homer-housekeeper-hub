import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import { AppLayout } from "./AppLayout";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  useEffect(() => {
    if (!loading && !user) nav({ to: "/login" });
  }, [user, loading, nav]);
  if (loading) {
    return <div className="flex h-screen items-center justify-center text-muted-foreground">Chargement…</div>;
  }
  if (!user) return null;
  return <AppLayout>{children}</AppLayout>;
}
