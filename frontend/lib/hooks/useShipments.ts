import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api/client";
import {
  Shipment, PaginatedResponse,
  AnalyticsSummary, ShipmentTrend,
} from "@/types";
import toast from "react-hot-toast";

// ── Query keys ────────────────────────────────────────────────────────────────
export const shipmentKeys = {
  all:       ()                              => ["shipments"] as const,
  list:      (filters: object)              => ["shipments", "list", filters] as const,
  detail:    (id: string)                   => ["shipments", "detail", id] as const,
  stats:     ()                             => ["shipments", "dashboard", "stats"] as const,
  trends:    (days: number)                 => ["shipments", "dashboard", "trends", days] as const,
  carriers:  ()                             => ["shipments", "dashboard", "carriers"] as const,
};

// ── Dashboard stats ───────────────────────────────────────────────────────────
export function useDashboardStats() {
  return useQuery({
    queryKey: shipmentKeys.stats(),
    queryFn:  () => apiGet<AnalyticsSummary>("/shipments/dashboard/stats"),
    staleTime: 2 * 60 * 1000,
  });
}

export function useShipmentTrends(days = 30) {
  return useQuery({
    queryKey: shipmentKeys.trends(days),
    queryFn:  () => apiGet<ShipmentTrend[]>(`/shipments/dashboard/trends?days=${days}`),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCarrierBreakdown() {
  return useQuery({
    queryKey: shipmentKeys.carriers(),
    queryFn:  () => apiGet<{ carrier: string; count: number; percentage: number }[]>("/shipments/dashboard/carriers"),
    staleTime: 5 * 60 * 1000,
  });
}

// ── Shipment list ─────────────────────────────────────────────────────────────
interface ListFilters {
  page?: number;
  per_page?: number;
  status?: string;
  carrier?: string;
  search?: string;
}

export function useShipments(filters: ListFilters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => v !== undefined && params.set(k, String(v)));

  return useQuery({
    queryKey: shipmentKeys.list(filters),
    queryFn:  () => apiGet<any>(`/shipments?${params}`),
    placeholderData: (prev) => prev,
  });
}

// ── Single shipment ───────────────────────────────────────────────────────────
export function useShipment(id: string) {
  return useQuery({
    queryKey: shipmentKeys.detail(id),
    queryFn:  () => apiGet<Shipment>(`/shipments/${id}`),
    enabled:  !!id,
  });
}

// ── Mutations ─────────────────────────────────────────────────────────────────
export function useCreateShipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => apiPost<Shipment>("/shipments", data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: shipmentKeys.all() });
      toast.success("Shipment added successfully");
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? "Failed to create shipment"),
  });
}

export function useUpdateShipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiPatch<Shipment>(`/shipments/${id}`, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: shipmentKeys.detail(id) });
      qc.invalidateQueries({ queryKey: shipmentKeys.all() });
      toast.success("Shipment updated");
    },
  });
}

export function useDeleteShipment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/shipments/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: shipmentKeys.all() });
      toast.success("Shipment removed");
    },
  });
}
