import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { User, AuthState } from "@/types";
import { tokenStorage } from "@/lib/api/client";

interface AuthStore extends AuthState {
  setUser:       (user: User) => void;
  setTokens:     (access: string, refresh: string) => void;
  clearAuth:     () => void;
  setLoading:    (loading: boolean) => void;
  hydrateTokens: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user:            null,
      accessToken:     null,
      refreshToken:    null,
      isAuthenticated: false,
      isLoading:       true,

      setUser: (user) =>
        set({ user, isAuthenticated: true, isLoading: false }),

      setTokens: (access, refresh) => {
        tokenStorage.setAccess(access);
        tokenStorage.setRefresh(refresh);
        set({ accessToken: access, refreshToken: refresh });
      },

      clearAuth: () => {
        tokenStorage.clearAll();
        set({
          user:            null,
          accessToken:     null,
          refreshToken:    null,
          isAuthenticated: false,
          isLoading:       false,
        });
      },

      setLoading: (loading) => set({ isLoading: loading }),

      hydrateTokens: () => {
        const access  = tokenStorage.getAccess();
        const refresh = tokenStorage.getRefresh();
        if (access && refresh) {
          set({ accessToken: access, refreshToken: refresh });
        } else {
          set({ isLoading: false });
        }
      },
    }),
    {
      name:    "atoz-auth",
      storage: createJSONStorage(() => sessionStorage),
      // Only persist user — tokens live in cookies
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    }
  )
);
