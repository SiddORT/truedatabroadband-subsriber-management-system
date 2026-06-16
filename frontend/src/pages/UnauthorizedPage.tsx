import { ShieldOff } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";

export function UnauthorizedPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleClick = () => {
    if (user) {
      navigate(user.role === "SUPERADMIN" ? "/admin/dashboard" : "/client/dashboard");
    } else {
      navigate("/admin/login");
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <ShieldOff className="h-8 w-8" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">Access Denied</h1>
        <p className="text-sm text-muted-foreground">
          You don't have permission to view this page.
        </p>
      </div>
      <Button onClick={handleClick}>
        {user ? "Go to my dashboard" : "Sign in"}
      </Button>
    </div>
  );
}
