import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({ component: Index });

function Index() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  useEffect(() => {
    if (loading) return;
    nav({ to: user ? "/dashboard" : "/login" });
  }, [user, loading, nav]);
  return <div className="flex h-screen items-center justify-center text-muted-foreground">Chargement…</div>;
}
