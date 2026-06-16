import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";
import Cookies from "js-cookie";
import { APIResponse } from "@/types";

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api/v1";

// ── Create instance ───────────────────────────────────────────────────────────
const api: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
});

// ── Token helpers ─────────────────────────────────────────────────────────────
const TOKEN_KEY   = "atoz_access_token";
const REFRESH_KEY = "atoz_refresh_token";

export const tokenStorage = {
  getAccess:      ()          => Cookies.get(TOKEN_KEY) ?? null,
  getRefresh:     ()          => Cookies.get(REFRESH_KEY) ?? null,
  setAccess:      (t: string) => Cookies.set(TOKEN_KEY, t, { secure: true, sameSite: "strict" }),
  setRefresh:     (t: string) => Cookies.set(REFRESH_KEY, t, { secure: true, sameSite: "strict", expires: 7 }),
  clearAll:       ()          => { Cookies.remove(TOKEN_KEY); Cookies.remove(REFRESH_KEY); },
};

// ── Request interceptor — attach Bearer token ─────────────────────────────────
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = tokenStorage.getAccess();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response interceptor — auto refresh on 401 ───────────────────────────────
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: unknown) => void;
  reject:  (reason?: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null = null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (error) reject(error);
    else resolve(token);
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as AxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            if (originalRequest.headers) {
              (originalRequest.headers as Record<string, string>).Authorization = `Bearer ${token}`;
            }
            return api(originalRequest);
          })
          .catch(Promise.reject.bind(Promise));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      const refreshToken = tokenStorage.getRefresh();
      if (!refreshToken) {
        tokenStorage.clearAll();
        window.location.href = "/login";
        return Promise.reject(error);
      }

      try {
        const res = await axios.post<APIResponse<{ access_token: string; refresh_token: string }>>(
          `${BASE_URL}/auth/refresh`,
          { refresh_token: refreshToken }
        );
        const { access_token, refresh_token } = res.data.data!;
        tokenStorage.setAccess(access_token);
        tokenStorage.setRefresh(refresh_token);
        processQueue(null, access_token);
        if (originalRequest.headers) {
          (originalRequest.headers as Record<string, string>).Authorization = `Bearer ${access_token}`;
        }
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        tokenStorage.clearAll();
        window.location.href = "/login";
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

// ── Typed request helpers ─────────────────────────────────────────────────────
export async function apiGet<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const res: AxiosResponse<APIResponse<T>> = await api.get(url, config);
  return res.data.data as T;
}

export async function apiPost<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const res: AxiosResponse<APIResponse<T>> = await api.post(url, data, config);
  return res.data.data as T;
}

export async function apiPatch<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
  const res: AxiosResponse<APIResponse<T>> = await api.patch(url, data, config);
  return res.data.data as T;
}

export async function apiDelete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const res: AxiosResponse<APIResponse<T>> = await api.delete(url, config);
  return res.data.data as T;
}

export default api;
