// ─────────────────────────────────────────────
// A TO Z ROUTES — Global TypeScript Types
// ─────────────────────────────────────────────

// ── Auth ──────────────────────────────────────────────────────────────────────

export type Role = "admin" | "user" | "driver";

export interface RoleObject {
  id: string;
  name: Role;
  permissions: Record<string, unknown>;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  is_active: boolean;
  role: RoleObject;
  last_login: string | null;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

// ── API ───────────────────────────────────────────────────────────────────────

export interface APIResponse<T> {
  success: boolean;
  message: string;
  data: T | null;
}

export interface PaginatedResponse<T> {
  success: boolean;
  message: string;
  data: T[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}

// ── Shipments ─────────────────────────────────────────────────────────────────

export type ShipmentStatus =
  | "pending"
  | "picked_up"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "failed"
  | "returned";

export type CarrierType =
  | "amazon"
  | "flipkart"
  | "myntra"
  | "dhl"
  | "fedex"
  | "delhivery"
  | "bluedart"
  | "custom";

export type DelayRisk = "low" | "medium" | "high";

export interface Shipment {
  id: string;
  tracking_number: string;
  user_id: string;
  driver_id: string | null;
  origin_warehouse_id: string | null;
  dest_warehouse_id: string | null;
  route_id: string | null;
  carrier: CarrierType;
  status: ShipmentStatus;
  service_type: string | null;
  weight_kg: number | null;
  description: string | null;
  estimated_delivery: string | null;
  actual_delivery: string | null;
  ai_eta: string | null;
  ai_confidence: number | null;
  delay_risk: DelayRisk;
  created_at: string;
  updated_at: string;
  // Joined
  origin_warehouse?: Warehouse;
  dest_warehouse?: Warehouse;
  driver?: Driver;
}

export interface CreateShipmentRequest {
  tracking_number: string;
  carrier: CarrierType;
  description?: string;
  weight_kg?: number;
  service_type?: string;
  origin_warehouse_id?: string;
  dest_warehouse_id?: string;
}

// ── Tracking ──────────────────────────────────────────────────────────────────

export interface TrackingEvent {
  id: string;
  shipment_id: string;
  driver_id: string | null;
  status: string;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  location_name: string | null;
  occurred_at: string;
  created_at: string;
}

// ── Drivers ───────────────────────────────────────────────────────────────────

export type DriverStatus = "online" | "offline" | "on_delivery";
export type VehicleType = "bike" | "van" | "truck" | "air";

export interface Driver {
  id: string;
  user_id: string;
  vehicle_type: VehicleType;
  license_number: string;
  current_lat: number | null;
  current_lng: number | null;
  status: DriverStatus;
  rating: number;
  created_at: string;
  // Joined
  user?: User;
}

// ── Warehouses ────────────────────────────────────────────────────────────────

export type WarehouseType = "origin" | "transit" | "destination" | "hub";

export interface Warehouse {
  id: string;
  name: string;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
  type: WarehouseType;
  is_active: boolean;
  created_at: string;
}

// ── Routes ────────────────────────────────────────────────────────────────────

export interface Waypoint {
  lat: number;
  lng: number;
  name?: string;
}

export interface Route {
  id: string;
  name: string;
  waypoints: Waypoint[];
  distance_km: number | null;
  estimated_minutes: number | null;
  status: "active" | "inactive" | "maintenance";
  created_at: string;
}

// ── Notifications ─────────────────────────────────────────────────────────────

export type NotificationType =
  | "shipment_update"
  | "delay_alert"
  | "delivery_confirmed"
  | "system";

export type NotificationChannel = "email" | "sms" | "push";

export interface Notification {
  id: string;
  user_id: string;
  shipment_id: string | null;
  type: NotificationType;
  channel: NotificationChannel;
  title: string;
  body: string;
  is_read: boolean;
  sent_at: string | null;
  created_at: string;
}

// ── Analytics ─────────────────────────────────────────────────────────────────

export interface AnalyticsSummary {
  total_shipments: number;
  delivered: number;
  in_transit: number;
  failed: number;
  on_time_rate: number;
  avg_delivery_days: number;
  delay_risk_distribution: { low: number; medium: number; high: number };
}

export interface ShipmentTrend {
  date: string;
  created: number;
  delivered: number;
  failed: number;
}

// ── WebSocket ─────────────────────────────────────────────────────────────────

export type WSMessageType =
  | "tracking_update"
  | "driver_location"
  | "shipment_status"
  | "notification"
  | "ping"
  | "pong";

export interface WSMessage {
  type: WSMessageType;
  payload: unknown;
  timestamp: string;
}

// ── UI ────────────────────────────────────────────────────────────────────────

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  badge?: number;
  roles?: Role[];
}

export interface BreadcrumbItem {
  label: string;
  href?: string;
}
