"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import Link from "next/link";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2, ArrowRight, Lock, Mail, User, Phone } from "lucide-react";
import { useAuth } from "@/lib/hooks/useAuth";
import { cn } from "@/lib/utils";

interface RegisterForm {
  full_name: string;
  email: string;
  phone?: string;
  password: string;
  confirm_password: string;
}

export default function RegisterPage() {
  const { register: registerUser, isRegistering } = useAuth();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterForm>();

  const password = watch("password");

  const onSubmit = ({ confirm_password, ...data }: RegisterForm) =>
    registerUser(data);

  const passwordStrength = (pw: string = "") => {
    let score = 0;
    if (pw.length >= 8)              score++;
    if (/[A-Z]/.test(pw))           score++;
    if (/[0-9]/.test(pw))           score++;
    if (/[^A-Za-z0-9]/.test(pw))   score++;
    return score;
  };

  const strength     = passwordStrength(password);
  const strengthLabels = ["", "Weak", "Fair", "Good", "Strong"];
  const strengthColors = ["", "bg-red-500", "bg-amber-500", "bg-yellow-400", "bg-green-500"];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="space-y-7"
    >
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 lg:hidden mb-6">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-white font-bold text-xs">AZ</span>
          </div>
          <span className="font-semibold">A to Z Routes</span>
        </div>
        <h2 className="text-2xl font-bold font-display">Create your account</h2>
        <p className="text-muted-foreground text-sm">
          Start tracking shipments in minutes
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Full name */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground/80">Full name</label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              {...register("full_name", {
                required: "Full name is required",
                minLength: { value: 2, message: "At least 2 characters" },
              })}
              type="text"
              placeholder="Zahik Abas"
              className={cn("input-field pl-10", errors.full_name && "border-destructive/50")}
            />
          </div>
          {errors.full_name && <p className="text-xs text-destructive">{errors.full_name.message}</p>}
        </div>

        {/* Email */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground/80">Email address</label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              {...register("email", {
                required: "Email is required",
                pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Invalid email" },
              })}
              type="email"
              placeholder="you@example.com"
              className={cn("input-field pl-10", errors.email && "border-destructive/50")}
            />
          </div>
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>

        {/* Phone (optional) */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground/80">
            Phone{" "}
            <span className="text-muted-foreground font-normal">(optional)</span>
          </label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              {...register("phone")}
              type="tel"
              placeholder="+91 98765 43210"
              className="input-field pl-10"
            />
          </div>
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground/80">Password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              {...register("password", {
                required: "Password is required",
                minLength: { value: 8, message: "At least 8 characters" },
                validate: {
                  hasUpper:  (v) => /[A-Z]/.test(v)  || "Must contain an uppercase letter",
                  hasNumber: (v) => /[0-9]/.test(v)  || "Must contain a number",
                },
              })}
              type={showPassword ? "text" : "password"}
              placeholder="Min. 8 characters"
              className={cn("input-field pl-10 pr-10", errors.password && "border-destructive/50")}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}

          {/* Strength meter */}
          {password && (
            <div className="space-y-1">
              <div className="flex gap-1">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className={cn(
                      "h-1 flex-1 rounded-full transition-all duration-300",
                      i <= strength ? strengthColors[strength] : "bg-white/10"
                    )}
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Strength:{" "}
                <span className={cn(
                  "font-medium",
                  strength <= 1 && "text-red-400",
                  strength === 2 && "text-amber-400",
                  strength === 3 && "text-yellow-400",
                  strength === 4 && "text-green-400",
                )}>
                  {strengthLabels[strength]}
                </span>
              </p>
            </div>
          )}
        </div>

        {/* Confirm password */}
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground/80">Confirm password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              {...register("confirm_password", {
                required: "Please confirm your password",
                validate: (v) => v === password || "Passwords do not match",
              })}
              type={showPassword ? "text" : "password"}
              placeholder="Repeat password"
              className={cn("input-field pl-10", errors.confirm_password && "border-destructive/50")}
            />
          </div>
          {errors.confirm_password && (
            <p className="text-xs text-destructive">{errors.confirm_password.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isRegistering}
          className="btn-primary w-full mt-2 h-11"
        >
          {isRegistering ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <>
              Create account
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-white/6" />
        </div>
        <div className="relative flex justify-center text-xs">
          <span className="px-3 bg-[hsl(var(--surface-1))] text-muted-foreground">
            Already have an account?
          </span>
        </div>
      </div>

      <Link
        href="/login"
        className="btn-ghost w-full h-11 border border-white/8 hover:border-white/12 flex items-center justify-center gap-2"
      >
        Sign in instead
      </Link>
    </motion.div>
  );
}
