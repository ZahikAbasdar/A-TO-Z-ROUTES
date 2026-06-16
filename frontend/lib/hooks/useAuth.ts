"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useAuthStore } from "@/lib/store/authStore";
import { authApi } from "@/lib/api/auth";
import { tokenStorage } from "@/lib/api/client";

export function useAuth() {
  const router      = useRouter();
  const queryClient = useQueryClient();
  const { user, isAuthenticated, isLoading, setUser, clearAuth } = useAuthStore();

  // ── Fetch current user (runs if token exists) ─────────────────────────────
  const { isLoading: isFetchingUser } = useQuery({
    queryKey: ["auth", "me"],
    queryFn:  authApi.me,
    enabled:  !!tokenStorage.getAccess(),
    retry:    false,
    staleTime: 5 * 60 * 1000,
    select: (data) => {
      setUser(data);
      return data;
    },
  });

  // ── Login ─────────────────────────────────────────────────────────────────
  const loginMutation = useMutation({
    mutationFn: authApi.login,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auth", "me"] });
      toast.success("Welcome back!");
      router.push("/overview");
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message ?? "Login failed";
      toast.error(message);
    },
  });

  // ── Register ──────────────────────────────────────────────────────────────
  const registerMutation = useMutation({
    mutationFn: authApi.register,
    onSuccess: () => {
      toast.success("Account created! Please log in.");
      router.push("/login");
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message ?? "Registration failed";
      toast.error(message);
    },
  });

  // ── Logout ────────────────────────────────────────────────────────────────
  const logoutMutation = useMutation({
    mutationFn: authApi.logout,
    onSettled: () => {
      // Always clear regardless of API response
      clearAuth();
      queryClient.clear();
      toast.success("Logged out");
      router.push("/login");
    },
  });

  // ── Change password ───────────────────────────────────────────────────────
  const changePasswordMutation = useMutation({
    mutationFn: authApi.changePassword,
    onSuccess: () => toast.success("Password updated successfully"),
    onError: (error: any) => {
      const message = error?.response?.data?.message ?? "Failed to change password";
      toast.error(message);
    },
  });

  return {
    user,
    isAuthenticated,
    isLoading: isLoading || isFetchingUser,
    isAdmin:   user?.role?.name === "admin",
    isDriver:  user?.role?.name === "driver",

    login:          loginMutation.mutate,
    register:       registerMutation.mutate,
    logout:         logoutMutation.mutate,
    changePassword: changePasswordMutation.mutate,

    isLoggingIn:    loginMutation.isPending,
    isRegistering:  registerMutation.isPending,
    isLoggingOut:   logoutMutation.isPending,
  };
}
