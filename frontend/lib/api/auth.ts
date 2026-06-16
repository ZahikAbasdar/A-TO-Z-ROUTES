import { apiGet, apiPost, apiPatch, tokenStorage } from "./client";
import { User, TokenResponse } from "@/types";

export const authApi = {
  register: (data: { email: string; password: string; full_name: string; phone?: string }) =>
    apiPost<User>("/auth/register", data),

  login: async (data: { email: string; password: string }): Promise<TokenResponse> => {
    const result = await apiPost<TokenResponse>("/auth/login", data);
    tokenStorage.setAccess(result.access_token);
    tokenStorage.setRefresh(result.refresh_token);
    return result;
  },

  logout: () => apiPost<null>("/auth/logout"),

  refresh: (refresh_token: string) =>
    apiPost<TokenResponse>("/auth/refresh", { refresh_token }),

  me: () => apiGet<User>("/auth/me"),

  updateProfile: (data: { full_name?: string; phone?: string }) =>
    apiPatch<User>("/auth/me", data),

  changePassword: (data: {
    current_password: string;
    new_password: string;
    confirm_password: string;
  }) => apiPost<null>("/auth/change-password", data),
};
