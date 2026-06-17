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
      cash_recon_values: {
        Row: {
          cashflow_line_id: string
          created_at: string
          id: string
          manual_value: number
          note: string | null
          reconciliation_id: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          cashflow_line_id: string
          created_at?: string
          id?: string
          manual_value?: number
          note?: string | null
          reconciliation_id: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          cashflow_line_id?: string
          created_at?: string
          id?: string
          manual_value?: number
          note?: string | null
          reconciliation_id?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_recon_values_cashflow_line_id_fkey"
            columns: ["cashflow_line_id"]
            isOneToOne: false
            referencedRelation: "cashflow_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_recon_values_reconciliation_id_fkey"
            columns: ["reconciliation_id"]
            isOneToOne: false
            referencedRelation: "cash_reconciliations"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_reconciliations: {
        Row: {
          business_date: string
          created_at: string
          created_by: string | null
          finalised_at: string | null
          finalised_by: string | null
          id: string
          restaurant_id: string
          section_key: string
          status: Database["public"]["Enums"]["recon_status"]
          updated_at: string
        }
        Insert: {
          business_date: string
          created_at?: string
          created_by?: string | null
          finalised_at?: string | null
          finalised_by?: string | null
          id?: string
          restaurant_id: string
          section_key: string
          status?: Database["public"]["Enums"]["recon_status"]
          updated_at?: string
        }
        Update: {
          business_date?: string
          created_at?: string
          created_by?: string | null
          finalised_at?: string | null
          finalised_by?: string | null
          id?: string
          restaurant_id?: string
          section_key?: string
          status?: Database["public"]["Enums"]["recon_status"]
          updated_at?: string
        }
        Relationships: []
      }
      cash_sections: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          key: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          key: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          key?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      cashflow_lines: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          label: string
          restaurant_id: string
          section_key: string | null
          sign: Database["public"]["Enums"]["cashflow_sign"]
          source: Database["public"]["Enums"]["cashflow_source"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          label: string
          restaurant_id: string
          section_key?: string | null
          sign: Database["public"]["Enums"]["cashflow_sign"]
          source?: Database["public"]["Enums"]["cashflow_source"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          label?: string
          restaurant_id?: string
          section_key?: string | null
          sign?: Database["public"]["Enums"]["cashflow_sign"]
          source?: Database["public"]["Enums"]["cashflow_source"]
          updated_at?: string
        }
        Relationships: []
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
      denomination_config: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          label: string
          restaurant_id: string
          updated_at: string
          value: number | null
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          label: string
          restaurant_id: string
          updated_at?: string
          value?: number | null
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          label?: string
          restaurant_id?: string
          updated_at?: string
          value?: number | null
        }
        Relationships: []
      }
      denomination_counts: {
        Row: {
          count: number
          created_at: string
          denomination_id: string
          id: string
          reconciliation_id: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          count?: number
          created_at?: string
          denomination_id: string
          id?: string
          reconciliation_id: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          count?: number
          created_at?: string
          denomination_id?: string
          id?: string
          reconciliation_id?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "denomination_counts_denomination_id_fkey"
            columns: ["denomination_id"]
            isOneToOne: false
            referencedRelation: "denomination_config"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "denomination_counts_reconciliation_id_fkey"
            columns: ["reconciliation_id"]
            isOneToOne: false
            referencedRelation: "cash_reconciliations"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_categories: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          name: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: []
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
          is_base: boolean
          is_favorite: boolean
          item_code: string
          kot_short_name: string
          name: string
          restaurant_id: string
          stock_benchmark: number | null
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
          is_base?: boolean
          is_favorite?: boolean
          item_code: string
          kot_short_name: string
          name: string
          restaurant_id: string
          stock_benchmark?: number | null
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
          is_base?: boolean
          is_favorite?: boolean
          item_code?: string
          kot_short_name?: string
          name?: string
          restaurant_id?: string
          stock_benchmark?: number | null
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
          can_edit_payment: boolean | null
          contact_email: string | null
          created_at: string
          id: string
          is_active: boolean
          last_active_at: string | null
          name: string
          notify_stock: boolean
          photo_url: string | null
          pin_hash: string | null
          restaurant_id: string
        }
        Insert: {
          auth_email: string
          can_edit_payment?: boolean | null
          contact_email?: string | null
          created_at?: string
          id: string
          is_active?: boolean
          last_active_at?: string | null
          name: string
          notify_stock?: boolean
          photo_url?: string | null
          pin_hash?: string | null
          restaurant_id: string
        }
        Update: {
          auth_email?: string
          can_edit_payment?: boolean | null
          contact_email?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          last_active_at?: string | null
          name?: string
          notify_stock?: boolean
          photo_url?: string | null
          pin_hash?: string | null
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
      purchase_lines: {
        Row: {
          amount: number
          business_date: string
          category_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_amount: number
          id: string
          note: string | null
          paid_amount: number
          pay_mode: Database["public"]["Enums"]["purchase_pay_mode"]
          qty: number
          restaurant_id: string
          unit_price: number
          updated_at: string
          vendor_id: string
          vendor_product_id: string | null
        }
        Insert: {
          amount?: number
          business_date: string
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_amount?: number
          id?: string
          note?: string | null
          paid_amount?: number
          pay_mode?: Database["public"]["Enums"]["purchase_pay_mode"]
          qty?: number
          restaurant_id: string
          unit_price?: number
          updated_at?: string
          vendor_id: string
          vendor_product_id?: string | null
        }
        Update: {
          amount?: number
          business_date?: string
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_amount?: number
          id?: string
          note?: string | null
          paid_amount?: number
          pay_mode?: Database["public"]["Enums"]["purchase_pay_mode"]
          qty?: number
          restaurant_id?: string
          unit_price?: number
          updated_at?: string
          vendor_id?: string
          vendor_product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_lines_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_lines_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_lines_vendor_product_id_fkey"
            columns: ["vendor_product_id"]
            isOneToOne: false
            referencedRelation: "vendor_products"
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
          business_date: string
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
          business_date?: string
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
          business_date?: string
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
      table_groups: {
        Row: {
          code: string
          created_at: string
          display_order: number
          id: string
          restaurant_id: string
          seats: number
          split_count: number
          updated_at: string
          waiter_id: string | null
        }
        Insert: {
          code: string
          created_at?: string
          display_order?: number
          id?: string
          restaurant_id: string
          seats?: number
          split_count?: number
          updated_at?: string
          waiter_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string
          display_order?: number
          id?: string
          restaurant_id?: string
          seats?: number
          split_count?: number
          updated_at?: string
          waiter_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "table_groups_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "table_groups_waiter_id_fkey"
            columns: ["waiter_id"]
            isOneToOne: false
            referencedRelation: "waiters"
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
          role: string
          user_id: string
        }
        Insert: {
          id?: string
          restaurant_id: string
          role: string
          user_id: string
        }
        Update: {
          id?: string
          restaurant_id?: string
          role?: string
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
      vendor_payments: {
        Row: {
          amount: number
          business_date: string
          created_at: string
          created_by: string | null
          id: string
          mode: Database["public"]["Enums"]["purchase_pay_mode"]
          note: string | null
          restaurant_id: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          amount: number
          business_date: string
          created_at?: string
          created_by?: string | null
          id?: string
          mode?: Database["public"]["Enums"]["purchase_pay_mode"]
          note?: string | null
          restaurant_id: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          amount?: number
          business_date?: string
          created_at?: string
          created_by?: string | null
          id?: string
          mode?: Database["public"]["Enums"]["purchase_pay_mode"]
          note?: string | null
          restaurant_id?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_payments_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_products: {
        Row: {
          category_id: string | null
          created_at: string
          display_order: number
          fixed_price: number | null
          gst_applicable: boolean
          id: string
          is_active: boolean
          name: string
          name_tamil: string | null
          price_mode: Database["public"]["Enums"]["price_mode"]
          restaurant_id: string
          unit: string
          updated_at: string
          vendor_id: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          display_order?: number
          fixed_price?: number | null
          gst_applicable?: boolean
          id?: string
          is_active?: boolean
          name: string
          name_tamil?: string | null
          price_mode?: Database["public"]["Enums"]["price_mode"]
          restaurant_id: string
          unit?: string
          updated_at?: string
          vendor_id: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          display_order?: number
          fixed_price?: number | null
          gst_applicable?: boolean
          id?: string
          is_active?: boolean
          name?: string
          name_tamil?: string | null
          price_mode?: Database["public"]["Enums"]["price_mode"]
          restaurant_id?: string
          unit?: string
          updated_at?: string
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_products_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          created_at: string
          default_category_id: string | null
          display_order: number
          id: string
          is_active: boolean
          is_fixed_amount: boolean
          is_multi_product: boolean
          name: string
          name_tamil: string | null
          phone: string | null
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_category_id?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          is_fixed_amount?: boolean
          is_multi_product?: boolean
          name: string
          name_tamil?: string | null
          phone?: string | null
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_category_id?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          is_fixed_amount?: boolean
          is_multi_product?: boolean
          name?: string
          name_tamil?: string | null
          phone?: string | null
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendors_default_category_id_fkey"
            columns: ["default_category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
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
      cash_expense_total: { Args: { _business_date: string }; Returns: number }
      close_business_day: { Args: { _decisions: Json }; Returns: undefined }
      current_restaurant_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: string
          _user_id: string
        }
        Returns: boolean
      }
      menu_availability: { Args: Record<never, never>; Returns: Json[] }
      pin_login_lookup: {
        Args: { _pin: string }
        Returns: Json
      }
      request_admin_otp: { Args: { _user_id: string }; Returns: Json }
      set_staff_pin: {
        Args: { _pin: string; _user_id: string }
        Returns: undefined
      }
      verify_admin_otp: { Args: { _otp: string; _user_id: string }; Returns: Json }
      check_stock_alerts: { Args: Record<never, never>; Returns: undefined }
      pool_qty: { Args: { _pool_id: string }; Returns: number }
      record_vendor_payment: {
        Args: {
          _amount: number
          _business_date: string
          _mode: Database["public"]["Enums"]["purchase_pay_mode"]
          _note: string
          _vendor_id: string
        }
        Returns: Json
      }
      reopen_cash_reconciliation: {
        Args: { _recon_id: string }
        Returns: undefined
      }
      reopen_invoice: {
        Args: { _invoice_id: string; _manager_pin: string; _reason: string }
        Returns: Json
      }
      request_bill: { Args: { _session_id: string }; Returns: Json }
      save_cash_reconciliation: {
        Args: {
          _business_date: string
          _counts: Json
          _finalise: boolean
          _section_key: string
          _values: Json
        }
        Returns: string
      }
      save_vendor_day_purchases: {
        Args: { _business_date: string; _lines: Json; _vendor_id: string }
        Returns: Json
      }
      section_finance: {
        Args: { _business_date: string; _section_key: string }
        Returns: {
          card_total: number
          cash_sales_total: number
          gpay_total: number
          sales_total: number
          swiggy_total: number
        }[]
      }
      send_kot: {
        Args: { _items: Json; _note?: string; _session_id: string }
        Returns: Json
      }
      settle_bill: {
        Args: { _params: Json; _payments: Json; _session_id: string }
        Returns: Json
      }
      settle_takeaway: {
        Args: {
          _items: Json
          _kot_note: string
          _params: Json
          _payments: Json
          _session_id: string
        }
        Returns: Json
      }
      sync_table_group: { Args: { _group_id: string }; Returns: undefined }
      vendor_due_balance: { Args: { _vendor_id: string }; Returns: number }
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
      cashflow_sign: "add" | "subtract"
      cashflow_source:
        | "manual"
        | "auto_sales"
        | "auto_gpay"
        | "auto_card"
        | "auto_swiggy"
        | "auto_cash_expense"
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
      price_mode: "fixed" | "variable"
      purchase_pay_mode: "cash" | "online"
      recon_status: "draft" | "finalised"
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
      cashflow_sign: ["add", "subtract"],
      cashflow_source: [
        "manual",
        "auto_sales",
        "auto_gpay",
        "auto_card",
        "auto_swiggy",
        "auto_cash_expense",
      ],
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
      price_mode: ["fixed", "variable"],
      purchase_pay_mode: ["cash", "online"],
      recon_status: ["draft", "finalised"],
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
