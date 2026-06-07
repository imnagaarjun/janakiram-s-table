export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor: string | null
          after: Json | null
          before: Json | null
          entity: string
          entity_id: string | null
          id: string
          restaurant_id: string
          ts: string
        }
        Insert: {
          action: string
          actor?: string | null
          after?: Json | null
          before?: Json | null
          entity: string
          entity_id?: string | null
          id?: string
          restaurant_id: string
          ts?: string
        }
        Update: {
          action?: string
          actor?: string | null
          after?: Json | null
          before?: Json | null
          entity?: string
          entity_id?: string | null
          id?: string
          restaurant_id?: string
          ts?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          display_order: number
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          base: number
          cgst: number
          complimentary: boolean
          created_at: string
          discount: number
          discount_reason: string | null
          id: string
          invoice_no: string
          issued_at: string
          issued_by: string | null
          notes: string | null
          print_payload: Json | null
          reopened_at: string | null
          restaurant_id: string
          round_off: number
          service_charge: number
          session_id: string
          sgst: number
          status: string
          total: number
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          base?: number
          cgst?: number
          complimentary?: boolean
          created_at?: string
          discount?: number
          discount_reason?: string | null
          id?: string
          invoice_no: string
          issued_at?: string
          issued_by?: string | null
          notes?: string | null
          print_payload?: Json | null
          reopened_at?: string | null
          restaurant_id: string
          round_off?: number
          service_charge?: number
          session_id: string
          sgst?: number
          status?: string
          total?: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          base?: number
          cgst?: number
          complimentary?: boolean
          created_at?: string
          discount?: number
          discount_reason?: string | null
          id?: string
          invoice_no?: string
          issued_at?: string
          issued_by?: string | null
          notes?: string | null
          print_payload?: Json | null
          reopened_at?: string | null
          restaurant_id?: string
          round_off?: number
          service_charge?: number
          session_id?: string
          sgst?: number
          status?: string
          total?: number
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "order_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      kot_items: {
        Row: {
          created_at: string
          id: string
          kot_id: string
          menu_item_id: string
          note: string | null
          qty: number
          restaurant_id: string
          status: Database["public"]["Enums"]["kot_item_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          kot_id: string
          menu_item_id: string
          note?: string | null
          qty: number
          restaurant_id: string
          status?: Database["public"]["Enums"]["kot_item_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          kot_id?: string
          menu_item_id?: string
          note?: string | null
          qty?: number
          restaurant_id?: string
          status?: Database["public"]["Enums"]["kot_item_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kot_items_kot_id_fkey"
            columns: ["kot_id"]
            isOneToOne: false
            referencedRelation: "kots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kot_items_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kot_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      kots: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          kitchen_id: string
          kot_no: number
          note: string | null
          restaurant_id: string
          sent_at: string
          session_id: string
          status: Database["public"]["Enums"]["kot_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          kitchen_id?: string
          kot_no: number
          note?: string | null
          restaurant_id: string
          sent_at?: string
          session_id: string
          status?: Database["public"]["Enums"]["kot_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          kitchen_id?: string
          kot_no?: number
          note?: string | null
          restaurant_id?: string
          sent_at?: string
          session_id?: string
          status?: Database["public"]["Enums"]["kot_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kots_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kots_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "order_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          category_id: string | null
          created_at: string
          display_order: number
          gst_rate: number
          id: string
          image_url: string | null
          is_86: boolean
          is_active: boolean
          is_favorite: boolean
          item_code: string
          kot_short_name: string
          name: string
          restaurant_id: string
          stock_mode: Database["public"]["Enums"]["stock_mode"]
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          display_order?: number
          gst_rate?: number
          id?: string
          image_url?: string | null
          is_86?: boolean
          is_active?: boolean
          is_favorite?: boolean
          item_code: string
          kot_short_name: string
          name: string
          restaurant_id: string
          stock_mode?: Database["public"]["Enums"]["stock_mode"]
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          display_order?: number
          gst_rate?: number
          id?: string
          image_url?: string | null
          is_86?: boolean
          is_active?: boolean
          is_favorite?: boolean
          item_code?: string
          kot_short_name?: string
          name?: string
          restaurant_id?: string
          stock_mode?: Database["public"]["Enums"]["stock_mode"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_prices: {
        Row: {
          base_price: number
          channel_key: string
          gst_rate: number
          id: string
          inclusive_price: number
          menu_item_id: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          base_price: number
          channel_key: string
          gst_rate?: number
          id?: string
          inclusive_price: number
          menu_item_id: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          base_price?: number
          channel_key?: string
          gst_rate?: number
          id?: string
          inclusive_price?: number
          menu_item_id?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_prices_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_prices_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_sessions: {
        Row: {
          channel: Database["public"]["Enums"]["order_channel"]
          closed_at: string | null
          created_at: string
          id: string
          opened_at: string
          opened_by: string | null
          pax: number
          restaurant_id: string
          status: Database["public"]["Enums"]["session_status"]
          table_code: string | null
          updated_at: string
        }
        Insert: {
          channel?: Database["public"]["Enums"]["order_channel"]
          closed_at?: string | null
          created_at?: string
          id?: string
          opened_at?: string
          opened_by?: string | null
          pax?: number
          restaurant_id: string
          status?: Database["public"]["Enums"]["session_status"]
          table_code?: string | null
          updated_at?: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["order_channel"]
          closed_at?: string | null
          created_at?: string
          id?: string
          opened_at?: string
          opened_by?: string | null
          pax?: number
          restaurant_id?: string
          status?: Database["public"]["Enums"]["session_status"]
          table_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_sessions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          id: string
          invoice_id: string
          mode: Database["public"]["Enums"]["payment_mode"]
          ref_no: string | null
          restaurant_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id: string
          mode: Database["public"]["Enums"]["payment_mode"]
          ref_no?: string | null
          restaurant_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string
          mode?: Database["public"]["Enums"]["payment_mode"]
          ref_no?: string | null
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      price_channels: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          key: string
          label: string
          restaurant_id: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          key: string
          label: string
          restaurant_id: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          key?: string
          label?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_channels_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          auth_email: string
          created_at: string
          id: string
          name: string
          pin: string
          restaurant_id: string
        }
        Insert: {
          auth_email: string
          created_at?: string
          id: string
          name: string
          pin: string
          restaurant_id: string
        }
        Update: {
          auth_email?: string
          created_at?: string
          id?: string
          name?: string
          pin?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      recipes: {
        Row: {
          consume_ratio: number
          created_at: string
          id: string
          menu_item_id: string
          restaurant_id: string
          stock_pool_id: string
        }
        Insert: {
          consume_ratio: number
          created_at?: string
          id?: string
          menu_item_id: string
          restaurant_id: string
          stock_pool_id: string
        }
        Update: {
          consume_ratio?: number
          created_at?: string
          id?: string
          menu_item_id?: string
          restaurant_id?: string
          stock_pool_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recipes_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recipes_stock_pool_id_fkey"
            columns: ["stock_pool_id"]
            isOneToOne: false
            referencedRelation: "stock_pools"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          address: string | null
          business_day_close_time: string
          created_at: string
          fssai: string | null
          gstin: string | null
          id: string
          invoice_prefix: string
          logo_url: string | null
          name: string
          phone: string | null
          service_charge_pct: number
          updated_at: string
        }
        Insert: {
          address?: string | null
          business_day_close_time?: string
          created_at?: string
          fssai?: string | null
          gstin?: string | null
          id?: string
          invoice_prefix?: string
          logo_url?: string | null
          name: string
          phone?: string | null
          service_charge_pct?: number
          updated_at?: string
        }
        Update: {
          address?: string | null
          business_day_close_time?: string
          created_at?: string
          fssai?: string | null
          gstin?: string | null
          id?: string
          invoice_prefix?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          service_charge_pct?: number
          updated_at?: string
        }
        Relationships: []
      }
      stock_ledger: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          pool_id: string
          qty_delta: number
          reason: Database["public"]["Enums"]["ledger_reason"]
          ref_id: string | null
          restaurant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          pool_id: string
          qty_delta: number
          reason: Database["public"]["Enums"]["ledger_reason"]
          ref_id?: string | null
          restaurant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          pool_id?: string
          qty_delta?: number
          reason?: Database["public"]["Enums"]["ledger_reason"]
          ref_id?: string | null
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_ledger_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "stock_pools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_ledger_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_pools: {
        Row: {
          created_at: string
          id: string
          name: string
          restaurant_id: string
          type: Database["public"]["Enums"]["stock_pool_type"]
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          restaurant_id: string
          type: Database["public"]["Enums"]["stock_pool_type"]
          unit?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          restaurant_id?: string
          type?: Database["public"]["Enums"]["stock_pool_type"]
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_pools_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      tables: {
        Row: {
          code: string
          created_at: string
          display_order: number
          id: string
          restaurant_id: string
          seats: number
          section: string | null
          status: Database["public"]["Enums"]["table_status"]
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          display_order?: number
          id?: string
          restaurant_id: string
          seats?: number
          section?: string | null
          status?: Database["public"]["Enums"]["table_status"]
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          display_order?: number
          id?: string
          restaurant_id?: string
          seats?: number
          section?: string | null
          status?: Database["public"]["Enums"]["table_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tables_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          restaurant_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          restaurant_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          restaurant_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      waiter_allocations: {
        Row: {
          created_at: string
          date: string
          id: string
          restaurant_id: string
          shift: Database["public"]["Enums"]["waiter_shift"]
          table_code: string
          waiter_id: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          restaurant_id: string
          shift?: Database["public"]["Enums"]["waiter_shift"]
          table_code: string
          waiter_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          restaurant_id?: string
          shift?: Database["public"]["Enums"]["waiter_shift"]
          table_code?: string
          waiter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "waiter_allocations_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waiter_allocations_waiter_id_fkey"
            columns: ["waiter_id"]
            isOneToOne: false
            referencedRelation: "waiters"
            referencedColumns: ["id"]
          },
        ]
      }
      waiters: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          join_date: string | null
          name: string
          payroll_ref: string | null
          phone: string | null
          restaurant_id: string
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          join_date?: string | null
          name: string
          payroll_ref?: string | null
          phone?: string | null
          restaurant_id: string
          role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          join_date?: string | null
          name?: string
          payroll_ref?: string | null
          phone?: string | null
          restaurant_id?: string
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "waiters_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      available_qty: { Args: { _menu_item_id: string }; Returns: number }
      bump_kot: { Args: { _kot_id: string }; Returns: Json }
      business_day_start: { Args: { _rid: string }; Returns: string }
      close_business_day: { Args: { _decisions: Json }; Returns: undefined }
      current_restaurant_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      pool_qty: { Args: { _pool_id: string }; Returns: number }
      reopen_invoice: {
        Args: { _invoice_id: string; _manager_pin: string; _reason: string }
        Returns: Json
      }
      request_bill: { Args: { _session_id: string }; Returns: Json }
      send_kot: {
        Args: { _items: Json; _note?: string; _session_id: string }
        Returns: Json
      }
      settle_bill: {
        Args: { _params: Json; _payments: Json; _session_id: string }
        Returns: Json
      }
      verify_staff_pin: { Args: { _pin: string }; Returns: string }
      void_kot_item: {
        Args: {
          _kot_item_id: string
          _manager_pin: string
          _note: string
          _reason: string
        }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "cashier" | "waiter" | "kitchen"
      kot_item_status: "pending" | "preparing" | "ready" | "served" | "void"
      kot_status: "pending" | "preparing" | "ready" | "served" | "void"
      ledger_reason:
        | "opening"
        | "sale"
        | "void"
        | "wastage"
        | "restock"
        | "adjustment"
      order_channel: "dinein" | "takeaway"
      payment_mode: "cash" | "upi" | "card" | "other"
      session_status: "open" | "bill_requested" | "settled" | "voided"
      stock_mode: "counted" | "unlimited"
      stock_pool_type: "prepared_base" | "raw_ingredient"
      table_status:
        | "free"
        | "seated_no_kot"
        | "occupied"
        | "bill_requested"
        | "inactive"
      waiter_shift: "morning" | "evening" | "full"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "manager", "cashier", "waiter", "kitchen"],
      kot_item_status: ["pending", "preparing", "ready", "served", "void"],
      kot_status: ["pending", "preparing", "ready", "served", "void"],
      ledger_reason: [
        "opening",
        "sale",
        "void",
        "wastage",
        "restock",
        "adjustment",
      ],
      order_channel: ["dinein", "takeaway"],
      payment_mode: ["cash", "upi", "card", "other"],
      session_status: ["open", "bill_requested", "settled", "voided"],
      stock_mode: ["counted", "unlimited"],
      stock_pool_type: ["prepared_base", "raw_ingredient"],
      table_status: [
        "free",
        "seated_no_kot",
        "occupied",
        "bill_requested",
        "inactive",
      ],
      waiter_shift: ["morning", "evening", "full"],
    },
  },
} as const
