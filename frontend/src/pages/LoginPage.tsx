import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate } from "react-router-dom";
import { Loader2, ShieldCheck, Users, Phone, Mail } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { useAuth } from "@/hooks/useAuth";
import { getApiErrorMessage, api } from "@/services/api";
import { tokenService } from "@/services/api";
import type { UserRole, LoginResponse } from "@/types/auth";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/* Schemas                                                                     */
/* -------------------------------------------------------------------------- */

const emailSchema = z.object({
  email: z.string().min(1, "Email is required"),
  password: z.string().min(1, "Password is required"),
});
type EmailFormValues = z.infer<typeof emailSchema>;

const otpRequestSchema = z.object({
  mobile_number: z
    .string()
    .min(10, "Enter a valid 10-digit mobile number")
    .max(15)
    .regex(/^\d+$/, "Digits only"),
});
type OtpRequestValues = z.infer<typeof otpRequestSchema>;

const otpVerifySchema = z.object({
  otp_code: z
    .string()
    .min(4, "Enter the OTP sent to your mobile")
    .max(10),
});
type OtpVerifyValues = z.infer<typeof otpVerifySchema>;

/* -------------------------------------------------------------------------- */
/* Props                                                                       */
/* -------------------------------------------------------------------------- */

interface LoginPageProps {
  role: UserRole;
  title: string;
  subtitle: string;
  redirectTo: string;
}

/* -------------------------------------------------------------------------- */
/* Component                                                                   */
/* -------------------------------------------------------------------------- */

export function LoginPage({ role, title, subtitle, redirectTo }: LoginPageProps) {
  const { login } = useAuth();
  const navigate = useNavigate();

  // Which tab is active: "email" or "otp" (only CLIENT sees the OTP tab)
  const showOtpTab = role === "CLIENT";
  const [tab, setTab] = useState<"email" | "otp">("email");

  // OTP flow state machine
  const [otpStep, setOtpStep] = useState<"request" | "verify">("request");
  const [pendingMobile, setPendingMobile] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);

  // OTP countdown timer (180 s)
  const OTP_TTL = 180;
  const [secondsLeft, setSecondsLeft] = useState(OTP_TTL);
  const [resending, setResending] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setSecondsLeft(OTP_TTL);
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timerRef.current!);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleResendOtp = async () => {
    setResending(true);
    setServerError(null);
    try {
      await api.post("/auth/request-otp", {
        mobile_number: pendingMobile,
        purpose: "LOGIN",
      });
      startTimer();
    } catch (err) {
      setServerError(getApiErrorMessage(err, "Could not resend OTP. Please try again."));
    } finally {
      setResending(false);
    }
  };

  const Icon = role === "SUPERADMIN" ? ShieldCheck : Users;

  /* ---- Email+password form ---- */
  const emailForm = useForm<EmailFormValues>({ resolver: zodResolver(emailSchema) });

  const onEmailSubmit = async (values: EmailFormValues) => {
    setServerError(null);
    try {
      const user = await login(values);
      if (user.role !== role) {
        setServerError(`This account is not authorized for the ${title}.`);
        return;
      }
      if (user.must_change_password) {
        navigate("/change-password", { replace: true });
        return;
      }
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setServerError(getApiErrorMessage(err, "Unable to sign in. Please try again."));
    }
  };

  /* ---- OTP request form ---- */
  const otpRequestForm = useForm<OtpRequestValues>({ resolver: zodResolver(otpRequestSchema) });

  const onOtpRequest = async (values: OtpRequestValues) => {
    setServerError(null);
    try {
      await api.post("/auth/request-otp", {
        mobile_number: values.mobile_number,
        purpose: "LOGIN",
      });
      setPendingMobile(values.mobile_number);
      setOtpStep("verify");
      startTimer();
    } catch (err) {
      setServerError(getApiErrorMessage(err, "Could not send OTP. Please try again."));
    }
  };

  /* ---- OTP verify form ---- */
  const otpVerifyForm = useForm<OtpVerifyValues>({ resolver: zodResolver(otpVerifySchema) });

  const onOtpVerify = async (values: OtpVerifyValues) => {
    setServerError(null);
    try {
      const { data } = await api.post<LoginResponse>("/auth/verify-otp", {
        mobile_number: pendingMobile,
        otp_code: values.otp_code,
        purpose: "LOGIN",
      });
      tokenService.setTokens(data.access_token, data.refresh_token);
      const user = data.user;
      if (user.role !== role) {
        setServerError(`This account is not authorized for the ${title}.`);
        tokenService.clear();
        return;
      }
      // Re-bootstrap auth context by reloading
      navigate(redirectTo, { replace: true });
      window.location.reload();
    } catch (err) {
      setServerError(getApiErrorMessage(err, "Invalid or expired OTP. Please try again."));
    }
  };

  const switchTab = (t: "email" | "otp") => {
    setTab(t);
    setOtpStep("request");
    setServerError(null);
  };

  /* ---- render ---- */
  return (
    <div className="flex min-h-screen flex-col bg-background lg:flex-row">
      {/* Brand panel — desktop only */}
      <div className="relative hidden flex-col justify-between bg-primary-dark p-12 text-white lg:flex lg:w-[42%]">
        <div className="flex flex-col gap-3">
          <img
            src="/logo.png"
            alt="True Data Broadband"
            className="h-12 w-auto max-w-[220px] object-contain object-left"
          />
          <div>
            <p className="text-2xl font-bold tracking-wide text-white">
              True Data <span className="text-accent">Broadband</span>
            </p>
            <p className="text-base font-medium text-white/50">Pvt. Ltd.</p>
          </div>
        </div>

        <div className="space-y-4">
          <h2 className="text-3xl font-semibold leading-tight">
            Broadband management,
            <br />
            built for reliability.
          </h2>
          <p className="max-w-md text-sm text-white/60">
            A secure platform for managing your network operations.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-white/40">Powered by</span>
          <span className="text-sm font-bold tracking-tight text-white/80">
            ort<span className="text-cyan-400">_</span>
          </span>
        </div>
      </div>

      {/* Mobile brand strip — visible only on small screens */}
      <div className="flex items-center gap-3 bg-primary-dark px-5 py-4 lg:hidden">
        <img
          src="/logo-small.png"
          alt="True Data Broadband"
          className="h-9 w-auto object-contain"
        />
        <div>
          <p className="text-lg font-bold leading-tight text-white">
            True Data <span className="text-accent">Broadband</span>
          </p>
          <p className="text-xs font-medium text-white/50">Pvt. Ltd.</p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md animate-fade-in">
          {/* Header */}
          <div className="mb-8 text-center lg:text-left">
            <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          </div>

          {/* Tabs (CLIENT only) */}
          {showOtpTab && (
            <div className="mb-6 flex rounded-lg border border-border bg-muted/30 p-1">
              <button
                type="button"
                onClick={() => switchTab("email")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  tab === "email"
                    ? "bg-white text-primary shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Mail className="h-3.5 w-3.5" />
                Email
              </button>
              <button
                type="button"
                onClick={() => switchTab("otp")}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  tab === "otp"
                    ? "bg-white text-primary shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Phone className="h-3.5 w-3.5" />
                Mobile OTP
              </button>
            </div>
          )}

          {/* ---- Email + Password ---- */}
          {tab === "email" && (
            <form onSubmit={emailForm.handleSubmit(onEmailSubmit)} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  placeholder="you@example.com"
                  aria-invalid={!!emailForm.formState.errors.email}
                  {...emailForm.register("email")}
                />
                {emailForm.formState.errors.email && (
                  <p className="text-xs text-destructive">
                    {emailForm.formState.errors.email.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <PasswordInput
                  id="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  aria-invalid={!!emailForm.formState.errors.password}
                  {...emailForm.register("password")}
                />
                {emailForm.formState.errors.password && (
                  <p className="text-xs text-destructive">
                    {emailForm.formState.errors.password.message}
                  </p>
                )}
              </div>

              {serverError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {serverError}
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={emailForm.formState.isSubmitting}
              >
                {emailForm.formState.isSubmitting && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                Sign in
              </Button>
            </form>
          )}

          {/* ---- OTP — step 1: request ---- */}
          {tab === "otp" && otpStep === "request" && (
            <form onSubmit={otpRequestForm.handleSubmit(onOtpRequest)} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="mobile_number">Registered Mobile Number</Label>
                <Input
                  id="mobile_number"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  placeholder="10-digit mobile"
                  aria-invalid={!!otpRequestForm.formState.errors.mobile_number}
                  {...otpRequestForm.register("mobile_number")}
                />
                {otpRequestForm.formState.errors.mobile_number && (
                  <p className="text-xs text-destructive">
                    {otpRequestForm.formState.errors.mobile_number.message}
                  </p>
                )}
              </div>

              {serverError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {serverError}
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={otpRequestForm.formState.isSubmitting}
              >
                {otpRequestForm.formState.isSubmitting && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                Send OTP
              </Button>
            </form>
          )}

          {/* ---- OTP — step 2: verify ---- */}
          {tab === "otp" && otpStep === "verify" && (
            <form onSubmit={otpVerifyForm.handleSubmit(onOtpVerify)} className="space-y-5">
              <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary">
                OTP sent to registered number and email. Enter the code below.
              </div>

              <div className="space-y-2">
                <Label htmlFor="otp_code">OTP Code</Label>
                <Input
                  id="otp_code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="Enter OTP"
                  aria-invalid={!!otpVerifyForm.formState.errors.otp_code}
                  {...otpVerifyForm.register("otp_code")}
                />
                {otpVerifyForm.formState.errors.otp_code && (
                  <p className="text-xs text-destructive">
                    {otpVerifyForm.formState.errors.otp_code.message}
                  </p>
                )}
              </div>

              {serverError && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  {serverError}
                </div>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={otpVerifyForm.formState.isSubmitting}
              >
                {otpVerifyForm.formState.isSubmitting && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                Verify & Sign in
              </Button>

              {/* Timer / Resend OTP */}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setOtpStep("request");
                    setServerError(null);
                    otpVerifyForm.reset();
                    if (timerRef.current) clearInterval(timerRef.current);
                  }}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  ← Change number
                </button>

                {secondsLeft > 0 ? (
                  <span className="text-sm text-muted-foreground">
                    Resend OTP in{" "}
                    <span className="font-mono font-semibold text-primary">
                      {String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:
                      {String(secondsLeft % 60).padStart(2, "0")}
                    </span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={resending}
                    className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline disabled:opacity-60"
                  >
                    {resending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Resend OTP
                  </button>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
