import { ShieldOff } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

export function UnauthorizedPage() {
  const { user } = useAuth();

  const dashboardPath =
    user?.role === "SUPERADMIN" ? "/admin/dashboard" : "/client/dashboard";

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <ShieldOff className="h-8 w-8" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">
          Access Denied
        </h1>
        <p className="text-sm text-muted-foreground">
          You don't have permission to view this page.
        </p>
      </div>
      {user ? (
        <Button asChild>
          <Link to={dashboardPath}>Go to my dashboard</Link>
        </Button>
      ) : (
        <Button asChild>
          <Link to="/admin/login">Sign in</Link>
        </Button>
      )}
    </div>
  );
}
