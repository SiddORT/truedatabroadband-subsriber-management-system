import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate } from "react-router-dom";
import { Loader2, ShieldCheck, Users } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useAuth } from "@/hooks/useAuth";
import { getApiErrorMessage } from "@/services/api";
import type { UserRole } from "@/types/auth";

const schema = z.object({
  email: z.string().min(1, "Email is required"),
  password: z.string().min(1, "Password is required"),
});
type FormValues = z.infer<typeof schema>;

interface LoginPageProps {
  role: UserRole;
  title: string;
  subtitle: string;
  redirectTo: string;
}

export function LoginPage({ role, title, subtitle, redirectTo }: LoginPageProps) {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const Icon = role === "SUPERADMIN" ? ShieldCheck : Users;

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      const user = await login(values);
      if (user.role !== role) {
        setServerError(`This account is not authorized for the ${title}.`);
        return;
      }
      // Force password change takes priority over the normal destination.
      if (user.must_change_password) {
        navigate("/change-password", { replace: true });
        return;
      }
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setServerError(getApiErrorMessage(err, "Unable to sign in. Please try again."));
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background lg:flex-row">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between bg-primary-dark p-12 text-white lg:flex lg:w-[42%]">
        <div className="flex items-center">
          <img src="/logo.png" alt="True Data Broadband" className="h-10 w-auto" />
        </div>
        <div className="space-y-4">
          <h2 className="text-3xl font-semibold leading-tight">
            Broadband management,
            <br />
            built for reliability.
          </h2>
          <p className="max-w-md text-sm text-white/60">
            True Data Broadband Pvt. Ltd. — a secure platform for
            managing your network operations.
          </p>
        </div>
        <p className="text-xs text-white/40">Powered by ORT</p>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md animate-fade-in">
          <div className="mb-8 text-center lg:text-left">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="you@truedata.local"
                aria-invalid={!!errors.email}
                {...register("email")}
              />
              {errors.email && (
                <p className="text-xs text-destructive">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <PasswordInput
                id="password"
                autoComplete="current-password"
                placeholder="••••••••"
                aria-invalid={!!errors.password}
                {...register("password")}
              />
              {errors.password && (
                <p className="text-xs text-destructive">{errors.password.message}</p>
              )}
            </div>

            {serverError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {serverError}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Sign in
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
