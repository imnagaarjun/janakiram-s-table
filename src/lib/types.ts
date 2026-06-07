export type AppRole = "admin" | "manager" | "cashier" | "waiter" | "kitchen";

export interface Profile {
  id: string;
  restaurant_id: string;
  name: string;
  pin: string;
  auth_email: string;
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
}
