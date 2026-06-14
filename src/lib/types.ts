export type AppRole = "admin" | "manager" | "cashier" | "waiter" | "kitchen";

export interface Profile {
  id: string;
  restaurant_id: string;
  name: string;
  pin_hash?: string;
  auth_email: string;
  contact_email: string | null;
  is_active: boolean;
  last_active_at: string | null;
  can_edit_payment?: boolean;
}

export interface Restaurant {
  id: string;
  name: string;
  address: string | null;
  gstin: string | null;
  fssai: string | null;
  phone: string | null;
  logo_url: string | null;
  business_day_close_time: string; // 'HH:MM:SS'
  bill_retention_until?: string | null; // 'YYYY-MM-DD'; null = keep everything
}
