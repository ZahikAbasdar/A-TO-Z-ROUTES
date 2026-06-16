import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiDelete } from "@/lib/api/client";
import toast from "react-hot-toast";

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  type: "shipment_update" | "delay_alert" | "delivery_confirmed" | "system";
  channel: string;
  is_read: boolean;
  shipment_id: string | null;
  created_at: string;
}

interface NotificationListResponse {
  data: AppNotification[];
  total: number;
  unread_count: number;
  page: number;
  pages: number;
}

export const notifKeys = {
  all:  ()                   => ["notifications"] as const,
  list: (filters: object)   => ["notifications", "list", filters] as const,
};

export function useNotifications(page = 1, unreadOnly = false) {
  return useQuery({
    queryKey: notifKeys.list({ page, unreadOnly }),
    queryFn:  () =>
      apiGet<NotificationListResponse>(
        `/notifications?page=${page}&per_page=20&unread_only=${unreadOnly}`
      ),
    refetchInterval: 30_000,
  });
}

export function useUnreadCount() {
  const { data } = useNotifications(1, true);
  return data?.unread_count ?? 0;
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPost(`/notifications/${id}/read`, {}),
    onSuccess:  () => qc.invalidateQueries({ queryKey: notifKeys.all() }),
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost("/notifications/read-all", {}),
    onSuccess:  (d: any) => {
      qc.invalidateQueries({ queryKey: notifKeys.all() });
      toast.success(`Marked ${d?.updated ?? "all"} as read`);
    },
  });
}

export function useDeleteNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/notifications/${id}`),
    onSuccess:  () => qc.invalidateQueries({ queryKey: notifKeys.all() }),
  });
}

export function useDelayPrediction(shipmentId: string | null) {
  return useMutation({
    mutationFn: () => apiPost(`/notifications/delay/${shipmentId}/predict`, {}),
  });
}
