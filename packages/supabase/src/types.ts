export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      announcements: {
        Row: {
          active: boolean
          created_at: string
          ends_at: string | null
          id: string
          message: string
          starts_at: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          ends_at?: string | null
          id?: string
          message: string
          starts_at?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          ends_at?: string | null
          id?: string
          message?: string
          starts_at?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          actor_name: string | null
          at: string
          detail: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_name?: string | null
          at?: string
          detail?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_name?: string | null
          at?: string
          detail?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
        }
        Relationships: []
      }
      batches: {
        Row: {
          created_at: string
          id: string
          landed_cost_pkr: number
          product_id: string
          qty_received: number
          received_on: string
          source_po_line_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          landed_cost_pkr: number
          product_id: string
          qty_received: number
          received_on?: string
          source_po_line_id: string
        }
        Update: {
          created_at?: string
          id?: string
          landed_cost_pkr?: number
          product_id?: string
          qty_received?: number
          received_on?: string
          source_po_line_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "investor_product_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_sales_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "purchase_line_detail"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_source_po_line_id_fkey"
            columns: ["source_po_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_line_detail"
            referencedColumns: ["line_id"]
          },
          {
            foreignKeyName: "batches_source_po_line_id_fkey"
            columns: ["source_po_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_source_po_line_id_fkey"
            columns: ["source_po_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_lines_costed"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          author: string | null
          body_md: string | null
          created_at: string
          excerpt: string | null
          hero_image: string | null
          id: string
          published: boolean
          published_at: string | null
          read_minutes: number | null
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          author?: string | null
          body_md?: string | null
          created_at?: string
          excerpt?: string | null
          hero_image?: string | null
          id?: string
          published?: boolean
          published_at?: string | null
          read_minutes?: number | null
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          author?: string | null
          body_md?: string | null
          created_at?: string
          excerpt?: string | null
          hero_image?: string | null
          id?: string
          published?: boolean
          published_at?: string | null
          read_minutes?: number | null
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      cash_marketing: {
        Row: {
          amount_pkr: number
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["marketing_type"]
          note: string | null
          recipient: string | null
          spent_on: string
        }
        Insert: {
          amount_pkr: number
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["marketing_type"]
          note?: string | null
          recipient?: string | null
          spent_on?: string
        }
        Update: {
          amount_pkr?: number
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["marketing_type"]
          note?: string | null
          recipient?: string | null
          spent_on?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          name: string
          parent_id: string | null
          slug: string
          sort_order: number
          tagline: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number
          tagline?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number
          tagline?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "category_sales"
            referencedColumns: ["category_id"]
          },
        ]
      }
      collections: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      corrections: {
        Row: {
          action: Database["public"]["Enums"]["correction_action"]
          amount_pkr: number | null
          correction_no: string | null
          created_at: string
          id: string
          notes: string | null
          order_id: string
          order_item_id: string | null
          product_id: string | null
          qty: number | null
          reason: string
          replacement_order_id: string | null
          wrong_unit_disposition:
            | Database["public"]["Enums"]["wrong_unit_disposition"]
            | null
        }
        Insert: {
          action: Database["public"]["Enums"]["correction_action"]
          amount_pkr?: number | null
          correction_no?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          order_id: string
          order_item_id?: string | null
          product_id?: string | null
          qty?: number | null
          reason: string
          replacement_order_id?: string | null
          wrong_unit_disposition?:
            | Database["public"]["Enums"]["wrong_unit_disposition"]
            | null
        }
        Update: {
          action?: Database["public"]["Enums"]["correction_action"]
          amount_pkr?: number | null
          correction_no?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          order_id?: string
          order_item_id?: string | null
          product_id?: string | null
          qty?: number | null
          reason?: string
          replacement_order_id?: string | null
          wrong_unit_disposition?:
            | Database["public"]["Enums"]["wrong_unit_disposition"]
            | null
        }
        Relationships: [
          {
            foreignKeyName: "corrections_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_invoice_mismatch"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "corrections_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corrections_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corrections_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "sale_margin"
            referencedColumns: ["order_item_id"]
          },
          {
            foreignKeyName: "corrections_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "investor_product_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "corrections_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "corrections_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "corrections_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_sales_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "corrections_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corrections_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corrections_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "purchase_line_detail"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "corrections_replacement_order_id_fkey"
            columns: ["replacement_order_id"]
            isOneToOne: false
            referencedRelation: "order_invoice_mismatch"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "corrections_replacement_order_id_fkey"
            columns: ["replacement_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      currencies: {
        Row: {
          code: string
          name: string
          symbol: string | null
        }
        Insert: {
          code: string
          name: string
          symbol?: string | null
        }
        Update: {
          code?: string
          name?: string
          symbol?: string | null
        }
        Relationships: []
      }
      customer_deliveries: {
        Row: {
          amount_pkr: number
          billed_on: string
          courier: string | null
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          order_id: string | null
          paid_on: string | null
        }
        Insert: {
          amount_pkr: number
          billed_on?: string
          courier?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          order_id?: string | null
          paid_on?: string | null
        }
        Update: {
          amount_pkr?: number
          billed_on?: string
          courier?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          order_id?: string | null
          paid_on?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_deliveries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_invoice_mismatch"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "customer_deliveries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          postal_code: string | null
          province: string | null
          since: string
          type: Database["public"]["Enums"]["customer_type"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          since?: string
          type?: Database["public"]["Enums"]["customer_type"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          since?: string
          type?: Database["public"]["Enums"]["customer_type"]
          updated_at?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount_pkr: number
          category: Database["public"]["Enums"]["expense_category"]
          created_at: string
          id: string
          note: string | null
          order_id: string | null
          receipt_path: string | null
          spent_on: string
          supplier_id: string | null
        }
        Insert: {
          amount_pkr: number
          category: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          id?: string
          note?: string | null
          order_id?: string | null
          receipt_path?: string | null
          spent_on?: string
          supplier_id?: string | null
        }
        Update: {
          amount_pkr?: number
          category?: Database["public"]["Enums"]["expense_category"]
          created_at?: string
          id?: string
          note?: string | null
          order_id?: string | null
          receipt_path?: string | null
          spent_on?: string
          supplier_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_invoice_mismatch"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "expenses_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      investor_deals: {
        Row: {
          active: boolean
          created_at: string
          id: string
          investor_id: string
          label: string | null
          split_pct: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          investor_id: string
          label?: string | null
          split_pct?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          investor_id?: string
          label?: string | null
          split_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "investor_deals_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investor_owed"
            referencedColumns: ["investor_id"]
          },
          {
            foreignKeyName: "investor_deals_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
        ]
      }
      investor_payouts: {
        Row: {
          amount_pkr: number
          created_at: string
          id: string
          investor_id: string
          kind: Database["public"]["Enums"]["payout_kind"]
          method: Database["public"]["Enums"]["payment_method"] | null
          note: string | null
          paid_on: string
          reverses_id: string | null
        }
        Insert: {
          amount_pkr: number
          created_at?: string
          id?: string
          investor_id: string
          kind?: Database["public"]["Enums"]["payout_kind"]
          method?: Database["public"]["Enums"]["payment_method"] | null
          note?: string | null
          paid_on?: string
          reverses_id?: string | null
        }
        Update: {
          amount_pkr?: number
          created_at?: string
          id?: string
          investor_id?: string
          kind?: Database["public"]["Enums"]["payout_kind"]
          method?: Database["public"]["Enums"]["payment_method"] | null
          note?: string | null
          paid_on?: string
          reverses_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "investor_payouts_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investor_owed"
            referencedColumns: ["investor_id"]
          },
          {
            foreignKeyName: "investor_payouts_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investor_payouts_reverses_id_fkey"
            columns: ["reverses_id"]
            isOneToOne: false
            referencedRelation: "investor_payouts"
            referencedColumns: ["id"]
          },
        ]
      }
      investors: {
        Row: {
          active: boolean
          contact: string | null
          created_at: string
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          contact?: string | null
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          contact?: string | null
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      invoice_items: {
        Row: {
          brand: string | null
          discount_pct: number
          discount_pkr: number
          id: string
          invoice_id: string
          name: string
          price_pkr: number
          product_id: string | null
          qty: number
          shipping_type: string
          sku: string | null
        }
        Insert: {
          brand?: string | null
          discount_pct?: number
          discount_pkr?: number
          id?: string
          invoice_id: string
          name: string
          price_pkr: number
          product_id?: string | null
          qty: number
          shipping_type?: string
          sku?: string | null
        }
        Update: {
          brand?: string | null
          discount_pct?: number
          discount_pkr?: number
          id?: string
          invoice_id?: string
          name?: string
          price_pkr?: number
          product_id?: string | null
          qty?: number
          shipping_type?: string
          sku?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "category_sales"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_balances"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "order_invoice_mismatch"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "investor_product_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_sales_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "purchase_line_detail"
            referencedColumns: ["product_id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          customer_id: string
          discount_pkr: number
          due_date: string | null
          id: string
          invoice_no: string | null
          issue_date: string
          order_id: string | null
          quotation_id: string | null
          subtotal_pkr: number
          tax_pkr: number
          total_pkr: number
          updated_at: string
          voided_at: string | null
        }
        Insert: {
          created_at?: string
          customer_id: string
          discount_pkr?: number
          due_date?: string | null
          id?: string
          invoice_no?: string | null
          issue_date?: string
          order_id?: string | null
          quotation_id?: string | null
          subtotal_pkr?: number
          tax_pkr?: number
          total_pkr?: number
          updated_at?: string
          voided_at?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string
          discount_pkr?: number
          due_date?: string | null
          id?: string
          invoice_no?: string | null
          issue_date?: string
          order_id?: string | null
          quotation_id?: string | null
          subtotal_pkr?: number
          tax_pkr?: number
          total_pkr?: number
          updated_at?: string
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_invoice_mismatch"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      oneoff_products: {
        Row: {
          active: boolean
          created_at: string
          id: string
          landed_cost_pkr: number
          name: string
          oem_part_no: string | null
          sale_price_pkr: number
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          landed_cost_pkr?: number
          name: string
          oem_part_no?: string | null
          sale_price_pkr?: number
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          landed_cost_pkr?: number
          name?: string
          oem_part_no?: string | null
          sale_price_pkr?: number
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "oneoff_products_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          discount_pct: number
          discount_pkr: number
          id: string
          landed_cost_pkr: number | null
          list_price_pkr: number | null
          name: string
          oneoff_product_id: string | null
          order_id: string
          price_pkr: number
          product_id: string | null
          qty: number
          qty_delivered: number
          sku: string | null
          source_purchase_order_id: string | null
        }
        Insert: {
          discount_pct?: number
          discount_pkr?: number
          id?: string
          landed_cost_pkr?: number | null
          list_price_pkr?: number | null
          name: string
          oneoff_product_id?: string | null
          order_id: string
          price_pkr: number
          product_id?: string | null
          qty: number
          qty_delivered?: number
          sku?: string | null
          source_purchase_order_id?: string | null
        }
        Update: {
          discount_pct?: number
          discount_pkr?: number
          id?: string
          landed_cost_pkr?: number | null
          list_price_pkr?: number | null
          name?: string
          oneoff_product_id?: string | null
          order_id?: string
          price_pkr?: number
          product_id?: string | null
          qty?: number
          qty_delivered?: number
          sku?: string | null
          source_purchase_order_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_oneoff_product_id_fkey"
            columns: ["oneoff_product_id"]
            isOneToOne: false
            referencedRelation: "oneoff_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_invoice_mismatch"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "investor_product_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_sales_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "purchase_line_detail"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "order_items_source_purchase_order_id_fkey"
            columns: ["source_purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_oneoff_deliveries: {
        Row: {
          created_at: string
          delivered_on: string
          id: string
          order_item_id: string
          qty: number
        }
        Insert: {
          created_at?: string
          delivered_on?: string
          id?: string
          order_item_id: string
          qty: number
        }
        Update: {
          created_at?: string
          delivered_on?: string
          id?: string
          order_item_id?: string
          qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_oneoff_deliveries_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_oneoff_deliveries_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "sale_margin"
            referencedColumns: ["order_item_id"]
          },
        ]
      }
      order_stage_events: {
        Row: {
          actor: string | null
          at: string
          id: string
          order_id: string
          stage: Database["public"]["Enums"]["order_stage"]
        }
        Insert: {
          actor?: string | null
          at?: string
          id?: string
          order_id: string
          stage: Database["public"]["Enums"]["order_stage"]
        }
        Update: {
          actor?: string | null
          at?: string
          id?: string
          order_id?: string
          stage?: Database["public"]["Enums"]["order_stage"]
        }
        Relationships: [
          {
            foreignKeyName: "order_stage_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_invoice_mismatch"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_stage_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          notes: string | null
          order_no: string | null
          replaces_order_id: string | null
          stage: Database["public"]["Enums"]["order_stage"]
          total_pkr: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          notes?: string | null
          order_no?: string | null
          replaces_order_id?: string | null
          stage?: Database["public"]["Enums"]["order_stage"]
          total_pkr?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          notes?: string | null
          order_no?: string | null
          replaces_order_id?: string | null
          stage?: Database["public"]["Enums"]["order_stage"]
          total_pkr?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_replaces_order_id_fkey"
            columns: ["replaces_order_id"]
            isOneToOne: false
            referencedRelation: "order_invoice_mismatch"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "orders_replaces_order_id_fkey"
            columns: ["replaces_order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_pkr: number
          created_at: string
          id: string
          invoice_id: string
          kind: Database["public"]["Enums"]["payment_kind"]
          method: Database["public"]["Enums"]["payment_method"]
          paid_on: string
          reverses_payment_id: string | null
        }
        Insert: {
          amount_pkr: number
          created_at?: string
          id?: string
          invoice_id: string
          kind?: Database["public"]["Enums"]["payment_kind"]
          method: Database["public"]["Enums"]["payment_method"]
          paid_on?: string
          reverses_payment_id?: string | null
        }
        Update: {
          amount_pkr?: number
          created_at?: string
          id?: string
          invoice_id?: string
          kind?: Database["public"]["Enums"]["payment_kind"]
          method?: Database["public"]["Enums"]["payment_method"]
          paid_on?: string
          reverses_payment_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "category_sales"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoice_balances"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "order_invoice_mismatch"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "payments_reverses_payment_id_fkey"
            columns: ["reverses_payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      planned_purchases: {
        Row: {
          created_at: string
          est_unit_cost_pkr: number | null
          graduated_to_po_id: string | null
          id: string
          item_name: string
          notes: string | null
          planned_qty: number | null
          priority: Database["public"]["Enums"]["plan_priority"]
          product_id: string | null
          status: Database["public"]["Enums"]["plan_status"]
          supplier_id: string | null
          target_retail_pkr: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          est_unit_cost_pkr?: number | null
          graduated_to_po_id?: string | null
          id?: string
          item_name: string
          notes?: string | null
          planned_qty?: number | null
          priority?: Database["public"]["Enums"]["plan_priority"]
          product_id?: string | null
          status?: Database["public"]["Enums"]["plan_status"]
          supplier_id?: string | null
          target_retail_pkr?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          est_unit_cost_pkr?: number | null
          graduated_to_po_id?: string | null
          id?: string
          item_name?: string
          notes?: string | null
          planned_qty?: number | null
          priority?: Database["public"]["Enums"]["plan_priority"]
          product_id?: string | null
          status?: Database["public"]["Enums"]["plan_status"]
          supplier_id?: string | null
          target_retail_pkr?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "planned_purchases_graduated_to_po_id_fkey"
            columns: ["graduated_to_po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_purchases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "investor_product_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "planned_purchases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "planned_purchases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "planned_purchases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_sales_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "planned_purchases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_purchases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "planned_purchases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "purchase_line_detail"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "planned_purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      pr_gifts: {
        Row: {
          content_type: string | null
          created_at: string
          expected_reach: number | null
          id: string
          notes: string | null
          occurred_on: string
          platform: string | null
          product_id: string
          qty: number
          recipient: string | null
          status: Database["public"]["Enums"]["pr_status"]
          updated_at: string
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          expected_reach?: number | null
          id?: string
          notes?: string | null
          occurred_on?: string
          platform?: string | null
          product_id: string
          qty: number
          recipient?: string | null
          status?: Database["public"]["Enums"]["pr_status"]
          updated_at?: string
        }
        Update: {
          content_type?: string | null
          created_at?: string
          expected_reach?: number | null
          id?: string
          notes?: string | null
          occurred_on?: string
          platform?: string | null
          product_id?: string
          qty?: number
          recipient?: string | null
          status?: Database["public"]["Enums"]["pr_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pr_gifts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "investor_product_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "pr_gifts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "pr_gifts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "pr_gifts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_sales_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "pr_gifts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pr_gifts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pr_gifts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "purchase_line_detail"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_collections: {
        Row: {
          collection_id: string
          product_id: string
        }
        Insert: {
          collection_id: string
          product_id: string
        }
        Update: {
          collection_id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_collections_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_collections_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "investor_product_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_collections_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_collections_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_collections_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_sales_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_collections_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_collections_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_collections_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "purchase_line_detail"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_relations: {
        Row: {
          product_id: string
          related_product_id: string
        }
        Insert: {
          product_id: string
          related_product_id: string
        }
        Update: {
          product_id?: string
          related_product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_relations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "investor_product_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_relations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_relations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_relations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_sales_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_relations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_relations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_relations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "purchase_line_detail"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_relations_related_product_id_fkey"
            columns: ["related_product_id"]
            isOneToOne: false
            referencedRelation: "investor_product_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_relations_related_product_id_fkey"
            columns: ["related_product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_relations_related_product_id_fkey"
            columns: ["related_product_id"]
            isOneToOne: false
            referencedRelation: "product_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_relations_related_product_id_fkey"
            columns: ["related_product_id"]
            isOneToOne: false
            referencedRelation: "product_sales_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_relations_related_product_id_fkey"
            columns: ["related_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_relations_related_product_id_fkey"
            columns: ["related_product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_relations_related_product_id_fkey"
            columns: ["related_product_id"]
            isOneToOne: false
            referencedRelation: "purchase_line_detail"
            referencedColumns: ["product_id"]
          },
        ]
      }
      products: {
        Row: {
          brand: string | null
          category_id: string
          compatibility: string | null
          created_at: string
          description: string | null
          featured: boolean
          id: string
          images: string[]
          investor_deal_id: string | null
          low_stock_threshold: number | null
          made_to_order: boolean
          meta_description: string | null
          mpn: string | null
          name: string
          owner_kind: Database["public"]["Enums"]["owner_kind"]
          price_pkr: number | null
          published: boolean
          reseller_price_pkr: number | null
          sale_price_pkr: number | null
          short_description: string | null
          sku: string
          slug: string | null
          specs: Json
          status: Database["public"]["Enums"]["product_status"]
          updated_at: string
          visibility: Database["public"]["Enums"]["visibility"]
        }
        Insert: {
          brand?: string | null
          category_id: string
          compatibility?: string | null
          created_at?: string
          description?: string | null
          featured?: boolean
          id?: string
          images?: string[]
          investor_deal_id?: string | null
          low_stock_threshold?: number | null
          made_to_order?: boolean
          meta_description?: string | null
          mpn?: string | null
          name: string
          owner_kind?: Database["public"]["Enums"]["owner_kind"]
          price_pkr?: number | null
          published?: boolean
          reseller_price_pkr?: number | null
          sale_price_pkr?: number | null
          short_description?: string | null
          sku?: string
          slug?: string | null
          specs?: Json
          status?: Database["public"]["Enums"]["product_status"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["visibility"]
        }
        Update: {
          brand?: string | null
          category_id?: string
          compatibility?: string | null
          created_at?: string
          description?: string | null
          featured?: boolean
          id?: string
          images?: string[]
          investor_deal_id?: string | null
          low_stock_threshold?: number | null
          made_to_order?: boolean
          meta_description?: string | null
          mpn?: string | null
          name?: string
          owner_kind?: Database["public"]["Enums"]["owner_kind"]
          price_pkr?: number | null
          published?: boolean
          reseller_price_pkr?: number | null
          sale_price_pkr?: number | null
          short_description?: string | null
          sku?: string
          slug?: string | null
          specs?: Json
          status?: Database["public"]["Enums"]["product_status"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "category_sales"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "products_investor_deal_id_fkey"
            columns: ["investor_deal_id"]
            isOneToOne: false
            referencedRelation: "investor_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          created_at: string
          email: string | null
          id: string
          name: string | null
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          active?: boolean
          created_at?: string
          email?: string | null
          id: string
          name?: string | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          active?: boolean
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: []
      }
      purchase_order_lines: {
        Row: {
          created_at: string
          freight_vendor_id: string | null
          id: string
          item_credit_added_pkr: number
          item_paid_amount_pkr: number | null
          item_paid_from_credit: boolean
          item_paid_on: string | null
          packaging_per_unit_pkr: number
          product_id: string
          purchase_order_id: string
          qty_ordered: number
          qty_received: number
          ship_paid_amount_pkr: number | null
          ship_paid_from_credit: boolean
          ship_paid_on: string | null
          shipping_per_unit_pkr: number
          unit_cost_rmb: number
        }
        Insert: {
          created_at?: string
          freight_vendor_id?: string | null
          id?: string
          item_credit_added_pkr?: number
          item_paid_amount_pkr?: number | null
          item_paid_from_credit?: boolean
          item_paid_on?: string | null
          packaging_per_unit_pkr?: number
          product_id: string
          purchase_order_id: string
          qty_ordered: number
          qty_received?: number
          ship_paid_amount_pkr?: number | null
          ship_paid_from_credit?: boolean
          ship_paid_on?: string | null
          shipping_per_unit_pkr?: number
          unit_cost_rmb: number
        }
        Update: {
          created_at?: string
          freight_vendor_id?: string | null
          id?: string
          item_credit_added_pkr?: number
          item_paid_amount_pkr?: number | null
          item_paid_from_credit?: boolean
          item_paid_on?: string | null
          packaging_per_unit_pkr?: number
          product_id?: string
          purchase_order_id?: string
          qty_ordered?: number
          qty_received?: number
          ship_paid_amount_pkr?: number | null
          ship_paid_from_credit?: boolean
          ship_paid_on?: string | null
          shipping_per_unit_pkr?: number
          unit_cost_rmb?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_lines_freight_vendor_id_fkey"
            columns: ["freight_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_freight_vendor_id_fkey"
            columns: ["freight_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_advance_balances"
            referencedColumns: ["vendor_account_id"]
          },
          {
            foreignKeyName: "purchase_order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "investor_product_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "purchase_order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "purchase_order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "purchase_order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_sales_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "purchase_order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "purchase_line_detail"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "purchase_order_lines_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string
          expected_on: string | null
          freight_vendor_id: string | null
          frozen_rate_rmb_pkr: number | null
          id: string
          notes: string | null
          ordered_on: string | null
          po_no: string | null
          received_on: string | null
          status: Database["public"]["Enums"]["po_status"]
          supplier_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expected_on?: string | null
          freight_vendor_id?: string | null
          frozen_rate_rmb_pkr?: number | null
          id?: string
          notes?: string | null
          ordered_on?: string | null
          po_no?: string | null
          received_on?: string | null
          status?: Database["public"]["Enums"]["po_status"]
          supplier_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expected_on?: string | null
          freight_vendor_id?: string | null
          frozen_rate_rmb_pkr?: number | null
          id?: string
          notes?: string | null
          ordered_on?: string | null
          po_no?: string | null
          received_on?: string | null
          status?: Database["public"]["Enums"]["po_status"]
          supplier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_freight_vendor_id_fkey"
            columns: ["freight_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_freight_vendor_id_fkey"
            columns: ["freight_vendor_id"]
            isOneToOne: false
            referencedRelation: "vendor_advance_balances"
            referencedColumns: ["vendor_account_id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      query_sheet_rows: {
        Row: {
          cells: Json
          created_at: string
          id: string
          position: number
          product_id: string | null
          sheet_id: string
          updated_at: string
        }
        Insert: {
          cells?: Json
          created_at?: string
          id?: string
          position?: number
          product_id?: string | null
          sheet_id: string
          updated_at?: string
        }
        Update: {
          cells?: Json
          created_at?: string
          id?: string
          position?: number
          product_id?: string | null
          sheet_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "query_sheet_rows_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "investor_product_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "query_sheet_rows_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "query_sheet_rows_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "query_sheet_rows_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_sales_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "query_sheet_rows_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "query_sheet_rows_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "query_sheet_rows_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "purchase_line_detail"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "query_sheet_rows_sheet_id_fkey"
            columns: ["sheet_id"]
            isOneToOne: false
            referencedRelation: "query_sheets"
            referencedColumns: ["id"]
          },
        ]
      }
      query_sheets: {
        Row: {
          columns: Json
          created_at: string
          created_by: string | null
          custom_columns: Json
          id: string
          notes: string | null
          title: string
          updated_at: string
        }
        Insert: {
          columns?: Json
          created_at?: string
          created_by?: string | null
          custom_columns?: Json
          id?: string
          notes?: string | null
          title?: string
          updated_at?: string
        }
        Update: {
          columns?: Json
          created_at?: string
          created_by?: string | null
          custom_columns?: Json
          id?: string
          notes?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      quotation_items: {
        Row: {
          brand: string | null
          id: string
          name: string
          price_pkr: number
          product_id: string | null
          qty: number
          quotation_id: string
          shipping_type: string
          sku: string | null
        }
        Insert: {
          brand?: string | null
          id?: string
          name: string
          price_pkr: number
          product_id?: string | null
          qty: number
          quotation_id: string
          shipping_type?: string
          sku?: string | null
        }
        Update: {
          brand?: string | null
          id?: string
          name?: string
          price_pkr?: number
          product_id?: string | null
          qty?: number
          quotation_id?: string
          shipping_type?: string
          sku?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotation_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "investor_product_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "quotation_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "quotation_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "quotation_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_sales_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "quotation_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotation_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "purchase_line_detail"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "quotation_items_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          issue_date: string
          notes: string | null
          order_id: string | null
          quote_no: string | null
          subtotal_pkr: number
          total_pkr: number
          updated_at: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          issue_date?: string
          notes?: string | null
          order_id?: string | null
          quote_no?: string | null
          subtotal_pkr?: number
          total_pkr?: number
          updated_at?: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          issue_date?: string
          notes?: string | null
          order_id?: string | null
          quote_no?: string | null
          subtotal_pkr?: number
          total_pkr?: number
          updated_at?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quotations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_invoice_mismatch"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "quotations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      refunds: {
        Row: {
          amount_pkr: number
          created_at: string
          created_by: string | null
          deduction_cycle: Database["public"]["Enums"]["refund_cycle"]
          id: string
          order_id: string | null
          reason: string
          refunded_on: string
        }
        Insert: {
          amount_pkr: number
          created_at?: string
          created_by?: string | null
          deduction_cycle?: Database["public"]["Enums"]["refund_cycle"]
          id?: string
          order_id?: string | null
          reason: string
          refunded_on?: string
        }
        Update: {
          amount_pkr?: number
          created_at?: string
          created_by?: string | null
          deduction_cycle?: Database["public"]["Enums"]["refund_cycle"]
          id?: string
          order_id?: string | null
          reason?: string
          refunded_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_invoice_mismatch"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          account_title: string | null
          bank_name: string | null
          iban: string | null
          id: boolean
          low_stock_threshold: number
          tax_inclusive: boolean
          tax_rate: number
          updated_at: string
        }
        Insert: {
          account_title?: string | null
          bank_name?: string | null
          iban?: string | null
          id?: boolean
          low_stock_threshold?: number
          tax_inclusive?: boolean
          tax_rate?: number
          updated_at?: string
        }
        Update: {
          account_title?: string | null
          bank_name?: string | null
          iban?: string | null
          id?: boolean
          low_stock_threshold?: number
          tax_inclusive?: boolean
          tax_rate?: number
          updated_at?: string
        }
        Relationships: []
      }
      sku_sequences: {
        Row: {
          last_seq: number
          prefix: string
        }
        Insert: {
          last_seq?: number
          prefix: string
        }
        Update: {
          last_seq?: number
          prefix?: string
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          batch_id: string
          cogs_pkr_snap: number | null
          correction_id: string | null
          created_at: string
          house_share_pkr_snap: number | null
          id: string
          investor_id_snap: string | null
          investor_share_pkr_snap: number | null
          kind: Database["public"]["Enums"]["movement_kind"]
          note: string | null
          occurred_on: string
          order_item_id: string | null
          owner_kind_snap: Database["public"]["Enums"]["owner_kind"] | null
          pr_gift_id: string | null
          qty: number
          reference: string | null
          reverses_id: string | null
        }
        Insert: {
          batch_id: string
          cogs_pkr_snap?: number | null
          correction_id?: string | null
          created_at?: string
          house_share_pkr_snap?: number | null
          id?: string
          investor_id_snap?: string | null
          investor_share_pkr_snap?: number | null
          kind: Database["public"]["Enums"]["movement_kind"]
          note?: string | null
          occurred_on?: string
          order_item_id?: string | null
          owner_kind_snap?: Database["public"]["Enums"]["owner_kind"] | null
          pr_gift_id?: string | null
          qty: number
          reference?: string | null
          reverses_id?: string | null
        }
        Update: {
          batch_id?: string
          cogs_pkr_snap?: number | null
          correction_id?: string | null
          created_at?: string
          house_share_pkr_snap?: number | null
          id?: string
          investor_id_snap?: string | null
          investor_share_pkr_snap?: number | null
          kind?: Database["public"]["Enums"]["movement_kind"]
          note?: string | null
          occurred_on?: string
          order_item_id?: string | null
          owner_kind_snap?: Database["public"]["Enums"]["owner_kind"] | null
          pr_gift_id?: string | null
          qty?: number
          reference?: string | null
          reverses_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batch_on_hand"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "stock_movements_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_correction_id_fkey"
            columns: ["correction_id"]
            isOneToOne: false
            referencedRelation: "corrections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "sale_margin"
            referencedColumns: ["order_item_id"]
          },
          {
            foreignKeyName: "stock_movements_pr_gift_id_fkey"
            columns: ["pr_gift_id"]
            isOneToOne: false
            referencedRelation: "pr_gifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_reverses_id_fkey"
            columns: ["reverses_id"]
            isOneToOne: false
            referencedRelation: "investor_sale_accrual"
            referencedColumns: ["movement_id"]
          },
          {
            foreignKeyName: "stock_movements_reverses_id_fkey"
            columns: ["reverses_id"]
            isOneToOne: false
            referencedRelation: "sale_margin"
            referencedColumns: ["movement_id"]
          },
          {
            foreignKeyName: "stock_movements_reverses_id_fkey"
            columns: ["reverses_id"]
            isOneToOne: false
            referencedRelation: "stock_movements"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          active: boolean
          contact: string | null
          country: string | null
          created_at: string
          currency: string
          id: string
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          contact?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          contact?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      testimonials: {
        Row: {
          created_at: string
          id: string
          location: string | null
          name: string
          published: boolean
          quote: string | null
          rating: number | null
          sort_order: number
          video_url: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          location?: string | null
          name: string
          published?: boolean
          quote?: string | null
          rating?: number | null
          sort_order?: number
          video_url?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          location?: string | null
          name?: string
          published?: boolean
          quote?: string | null
          rating?: number | null
          sort_order?: number
          video_url?: string | null
        }
        Relationships: []
      }
      vendor_accounts: {
        Row: {
          active: boolean
          contact: string | null
          country: string | null
          created_at: string
          currency: string
          id: string
          name: string
          phone: string | null
          role: Database["public"]["Enums"]["vendor_role"] | null
          supplier_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          contact?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          id?: string
          name: string
          phone?: string | null
          role?: Database["public"]["Enums"]["vendor_role"] | null
          supplier_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          contact?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          id?: string
          name?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["vendor_role"] | null
          supplier_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_accounts_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "vendor_accounts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_advance_entries: {
        Row: {
          amount_pkr: number
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["advance_kind"]
          note: string | null
          occurred_on: string
          order_id: string | null
          purchase_order_id: string | null
          reverses_id: string | null
          vendor_account_id: string
        }
        Insert: {
          amount_pkr: number
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["advance_kind"]
          note?: string | null
          occurred_on?: string
          order_id?: string | null
          purchase_order_id?: string | null
          reverses_id?: string | null
          vendor_account_id: string
        }
        Update: {
          amount_pkr?: number
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["advance_kind"]
          note?: string | null
          occurred_on?: string
          order_id?: string | null
          purchase_order_id?: string | null
          reverses_id?: string | null
          vendor_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_advance_entries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_invoice_mismatch"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "vendor_advance_entries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_advance_entries_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_advance_entries_reverses_id_fkey"
            columns: ["reverses_id"]
            isOneToOne: false
            referencedRelation: "vendor_advance_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_advance_entries_vendor_account_id_fkey"
            columns: ["vendor_account_id"]
            isOneToOne: false
            referencedRelation: "vendor_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_advance_entries_vendor_account_id_fkey"
            columns: ["vendor_account_id"]
            isOneToOne: false
            referencedRelation: "vendor_advance_balances"
            referencedColumns: ["vendor_account_id"]
          },
        ]
      }
    }
    Views: {
      activity_days: {
        Row: {
          day: string | null
        }
        Relationships: []
      }
      analytics_daily: {
        Row: {
          day: string | null
          expense_pkr: number | null
          revenue_pkr: number | null
        }
        Relationships: []
      }
      batch_on_hand: {
        Row: {
          batch_id: string | null
          landed_cost_pkr: number | null
          product_id: string | null
          received_on: string | null
          remaining: number | null
          source_po_line_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "investor_product_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_sales_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "purchase_line_detail"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_source_po_line_id_fkey"
            columns: ["source_po_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_line_detail"
            referencedColumns: ["line_id"]
          },
          {
            foreignKeyName: "batches_source_po_line_id_fkey"
            columns: ["source_po_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_source_po_line_id_fkey"
            columns: ["source_po_line_id"]
            isOneToOne: false
            referencedRelation: "purchase_order_lines_costed"
            referencedColumns: ["id"]
          },
        ]
      }
      category_sales: {
        Row: {
          category_id: string | null
          category_name: string | null
          invoice_id: string | null
          issue_date: string | null
          item_id: string | null
          revenue_pkr: number | null
          rollup_id: string | null
          rollup_name: string | null
        }
        Relationships: []
      }
      corrections_loss: {
        Row: {
          refund_comp_pkr: number | null
          replacement_pkr: number | null
          total_pkr: number | null
        }
        Relationships: []
      }
      house_margin_daily: {
        Row: {
          day: string | null
          gross_margin_pkr: number | null
          house_margin_pkr: number | null
          revenue_pkr: number | null
        }
        Relationships: []
      }
      investor_owed: {
        Row: {
          accrued_pkr: number | null
          active: boolean | null
          investor_id: string | null
          name: string | null
          owed_pkr: number | null
          paid_out_pkr: number | null
        }
        Relationships: []
      }
      investor_product_pnl: {
        Row: {
          capital_returned_pkr: number | null
          cost_per_unit_pkr: number | null
          house_share_pkr: number | null
          investor_deal_id: string | null
          investor_id: string | null
          investor_name: string | null
          investor_share_pkr: number | null
          name: string | null
          on_hand_qty: number | null
          on_hand_value_pkr: number | null
          product_id: string | null
          profit_per_unit_pkr: number | null
          profit_pkr: number | null
          qty_sold: number | null
          revenue_pkr: number | null
          sku: string | null
          sold_price_per_unit_pkr: number | null
          split_pct: number | null
        }
        Relationships: [
          {
            foreignKeyName: "investor_deals_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investor_owed"
            referencedColumns: ["investor_id"]
          },
          {
            foreignKeyName: "investor_deals_investor_id_fkey"
            columns: ["investor_id"]
            isOneToOne: false
            referencedRelation: "investors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_investor_deal_id_fkey"
            columns: ["investor_deal_id"]
            isOneToOne: false
            referencedRelation: "investor_deals"
            referencedColumns: ["id"]
          },
        ]
      }
      investor_sale_accrual: {
        Row: {
          accrued_pkr: number | null
          capital_pkr: number | null
          investor_id: string | null
          investor_share_pkr: number | null
          movement_id: string | null
          order_item_id: string | null
          qty: number | null
        }
        Insert: {
          accrued_pkr?: never
          capital_pkr?: number | null
          investor_id?: string | null
          investor_share_pkr?: number | null
          movement_id?: string | null
          order_item_id?: string | null
          qty?: number | null
        }
        Update: {
          accrued_pkr?: never
          capital_pkr?: number | null
          investor_id?: string | null
          investor_share_pkr?: number | null
          movement_id?: string | null
          order_item_id?: string | null
          qty?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "sale_margin"
            referencedColumns: ["order_item_id"]
          },
        ]
      }
      invoice_balances: {
        Row: {
          balance_pkr: number | null
          invoice_id: string | null
          paid_pkr: number | null
          status: string | null
          total_pkr: number | null
        }
        Relationships: []
      }
      marketing_spend: {
        Row: {
          cash_pkr: number | null
          pr_gift_pkr: number | null
          total_pkr: number | null
        }
        Relationships: []
      }
      order_cogs: {
        Row: {
          cogs_pkr: number | null
          order_id: string | null
          order_item_id: string | null
          qty_sold: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_invoice_mismatch"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_movements_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "sale_margin"
            referencedColumns: ["order_item_id"]
          },
        ]
      }
      order_invoice_mismatch: {
        Row: {
          difference_pkr: number | null
          has_delivered_lines: boolean | null
          has_payments: boolean | null
          invoice_id: string | null
          invoice_no: string | null
          invoice_total_pkr: number | null
          order_id: string | null
          order_no: string | null
          order_total_pkr: number | null
          stage: Database["public"]["Enums"]["order_stage"] | null
        }
        Relationships: []
      }
      pnl_summary: {
        Row: {
          cogs_pkr: number | null
          corrections_pkr: number | null
          delivery_pkr: number | null
          gross_margin_pkr: number | null
          house_margin_pkr: number | null
          investor_share_pkr: number | null
          kept_pkr: number | null
          marketing_pkr: number | null
          operating_expense_pkr: number | null
          refunds_pkr: number | null
          revenue_pkr: number | null
        }
        Relationships: []
      }
      product_cost: {
        Row: {
          on_hand_qty: number | null
          product_id: string | null
          stock_value_pkr: number | null
          weighted_avg_cost_pkr: number | null
        }
        Relationships: [
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "investor_product_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_sales_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "purchase_line_detail"
            referencedColumns: ["product_id"]
          },
        ]
      }
      product_inventory: {
        Row: {
          availability: Database["public"]["Enums"]["availability"] | null
          batch_count: number | null
          on_hand_qty: number | null
          product_id: string | null
        }
        Relationships: []
      }
      product_pnl: {
        Row: {
          cogs_sold_pkr: number | null
          landed_cost_unit_pkr: number | null
          on_hand_qty: number | null
          po_status: Database["public"]["Enums"]["po_status"] | null
          product_id: string | null
          qty_sold: number | null
          received_qty: number | null
          revenue_reseller_pkr: number | null
          revenue_retail_pkr: number | null
          vendor_name: string | null
        }
        Relationships: []
      }
      product_sales_pnl: {
        Row: {
          cogs_pkr: number | null
          margin_pkr: number | null
          name: string | null
          owner_kind: Database["public"]["Enums"]["owner_kind"] | null
          product_id: string | null
          qty_sold: number | null
          revenue_pkr: number | null
          sku: string | null
        }
        Relationships: []
      }
      products_public: {
        Row: {
          availability: Database["public"]["Enums"]["availability"] | null
          brand: string | null
          category_id: string | null
          category_name: string | null
          category_slug: string | null
          created_at: string | null
          description: string | null
          effective_price_pkr: number | null
          featured: boolean | null
          id: string | null
          images: string[] | null
          meta_description: string | null
          mpn: string | null
          name: string | null
          parent_name: string | null
          parent_slug: string | null
          price_pkr: number | null
          sale_price_pkr: number | null
          short_description: string | null
          sku: string | null
          slug: string | null
          specs: Json | null
          stock_qty: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "category_sales"
            referencedColumns: ["category_id"]
          },
        ]
      }
      purchase_line_detail: {
        Row: {
          category_id: string | null
          frozen_rate_rmb_pkr: number | null
          item_paid_amount_pkr: number | null
          item_paid_on: string | null
          landed_cost_per_unit_pkr: number | null
          landed_total_pkr: number | null
          line_id: string | null
          owner_kind: Database["public"]["Enums"]["owner_kind"] | null
          packaging_per_unit_pkr: number | null
          po_created_at: string | null
          po_status: Database["public"]["Enums"]["po_status"] | null
          product_id: string | null
          product_name: string | null
          purchase_order_id: string | null
          qty_ordered: number | null
          qty_pr: number | null
          qty_received: number | null
          qty_sold: number | null
          reseller_pkr: number | null
          retail_pkr: number | null
          ship_paid_amount_pkr: number | null
          ship_paid_on: string | null
          shipping_per_unit_pkr: number | null
          sku: string | null
          unit_cost_pkr: number | null
          unit_cost_rmb: number | null
          vendor_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "category_sales"
            referencedColumns: ["category_id"]
          },
          {
            foreignKeyName: "purchase_order_lines_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_lines_costed: {
        Row: {
          frozen_rate_rmb_pkr: number | null
          id: string | null
          item_paid_amount_pkr: number | null
          item_paid_on: string | null
          landed_cost_per_unit_pkr: number | null
          landed_total_pkr: number | null
          packaging_per_unit_pkr: number | null
          product_id: string | null
          purchase_order_id: string | null
          qty_ordered: number | null
          qty_received: number | null
          ship_paid_amount_pkr: number | null
          ship_paid_on: string | null
          shipping_per_unit_pkr: number | null
          unit_cost_pkr: number | null
          unit_cost_rmb: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "investor_product_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "purchase_order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "purchase_order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "purchase_order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_sales_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "purchase_order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "purchase_line_detail"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "purchase_order_lines_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      sale_margin: {
        Row: {
          cogs_pkr: number | null
          house_share_pkr: number | null
          investor_id: string | null
          investor_share_pkr: number | null
          margin_pkr: number | null
          movement_id: string | null
          occurred_on: string | null
          order_id: string | null
          order_item_id: string | null
          owner_kind: Database["public"]["Enums"]["owner_kind"] | null
          product_id: string | null
          qty: number | null
          revenue_pkr: number | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "order_invoice_mismatch"
            referencedColumns: ["order_id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "investor_product_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_inventory"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "product_sales_pnl"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "purchase_line_detail"
            referencedColumns: ["product_id"]
          },
        ]
      }
      vendor_advance_balances: {
        Row: {
          active: boolean | null
          balance_pkr: number | null
          name: string | null
          role: Database["public"]["Enums"]["vendor_role"] | null
          supplier_id: string | null
          vendor_account_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vendor_accounts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_payables: {
        Row: {
          item_owed_pkr: number | null
          name: string | null
          ship_owed_pkr: number | null
          supplier_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      category_sku_prefix: { Args: { p_name: string }; Returns: string }
      create_invoice: {
        Args: {
          p_customer_id: string
          p_due_date: string
          p_items: Json
          p_new_customer: Json
          p_order_id: string
        }
        Returns: {
          created_at: string
          customer_id: string
          discount_pkr: number
          due_date: string | null
          id: string
          invoice_no: string | null
          issue_date: string
          order_id: string | null
          quotation_id: string | null
          subtotal_pkr: number
          tax_pkr: number
          total_pkr: number
          updated_at: string
          voided_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_order: {
        Args: {
          p_customer_id: string
          p_items: Json
          p_new_customer: Json
          p_notes: string
        }
        Returns: {
          created_at: string
          customer_id: string
          id: string
          notes: string | null
          order_no: string | null
          replaces_order_id: string | null
          stage: Database["public"]["Enums"]["order_stage"]
          total_pkr: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_quotation: {
        Args: {
          p_customer_id: string
          p_items: Json
          p_new_customer: Json
          p_notes: string
          p_order_id: string
        }
        Returns: {
          created_at: string
          customer_id: string
          id: string
          issue_date: string
          notes: string | null
          order_id: string | null
          quote_no: string | null
          subtotal_pkr: number
          total_pkr: number
          updated_at: string
          valid_until: string | null
        }
        SetofOptions: {
          from: "*"
          to: "quotations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      draw_stock_fifo: {
        Args: {
          p_correction_id: string
          p_kind: Database["public"]["Enums"]["movement_kind"]
          p_note: string
          p_occurred_on: string
          p_order_item_id: string
          p_pr_gift_id: string
          p_product_id: string
          p_qty: number
        }
        Returns: undefined
      }
      fulfil_order_line: {
        Args: { p_line_id: string; p_qty: number }
        Returns: undefined
      }
      gift_pr: {
        Args: {
          p_content_type: string
          p_expected_reach: number
          p_notes: string
          p_occurred_on: string
          p_platform: string
          p_product_id: string
          p_qty: number
          p_recipient: string
          p_status: Database["public"]["Enums"]["pr_status"]
        }
        Returns: string
      }
      graduate_planned_purchase: { Args: { p_id: string }; Returns: string }
      has_role: {
        Args: { roles: Database["public"]["Enums"]["user_role"][] }
        Returns: boolean
      }
      link_invoice_order: {
        Args: { p_invoice_id: string }
        Returns: {
          created_at: string
          customer_id: string
          id: string
          notes: string | null
          order_no: string | null
          replaces_order_id: string | null
          stage: Database["public"]["Enums"]["order_stage"]
          total_pkr: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      next_product_sku: { Args: { p_category_id: string }; Returns: string }
      pnl_summary_between: {
        Args: { p_end: string; p_start: string }
        Returns: {
          cogs_pkr: number
          corrections_pkr: number
          delivery_pkr: number
          gross_margin_pkr: number
          house_margin_pkr: number
          investor_share_pkr: number
          kept_pkr: number
          marketing_pkr: number
          operating_expense_pkr: number
          refunds_pkr: number
          revenue_pkr: number
        }[]
      }
      receive_po_line: {
        Args: { p_line_id: string; p_qty: number; p_received_on?: string }
        Returns: string
      }
      record_correction: {
        Args: {
          p_action: Database["public"]["Enums"]["correction_action"]
          p_amount_pkr: number
          p_method: Database["public"]["Enums"]["payment_method"]
          p_notes: string
          p_order_id: string
          p_order_item_id: string
          p_payment_id: string
          p_product_id: string
          p_qty: number
          p_reason: string
          p_wrong_unit_disposition: Database["public"]["Enums"]["wrong_unit_disposition"]
        }
        Returns: {
          action: Database["public"]["Enums"]["correction_action"]
          amount_pkr: number | null
          correction_no: string | null
          created_at: string
          id: string
          notes: string | null
          order_id: string
          order_item_id: string | null
          product_id: string | null
          qty: number | null
          reason: string
          replacement_order_id: string | null
          wrong_unit_disposition:
            | Database["public"]["Enums"]["wrong_unit_disposition"]
            | null
        }
        SetofOptions: {
          from: "*"
          to: "corrections"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_po_payment: {
        Args: {
          p_amount: number
          p_kind: string
          p_line_id: string
          p_occurred_on: string
          p_use_credit: boolean
        }
        Returns: undefined
      }
      sync_order_from_invoice: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
      unique_product_slug: {
        Args: { p_id: string; p_name: string }
        Returns: string
      }
      update_invoice: {
        Args: { p_id: string; p_items: Json }
        Returns: {
          created_at: string
          customer_id: string
          discount_pkr: number
          due_date: string | null
          id: string
          invoice_no: string | null
          issue_date: string
          order_id: string | null
          quotation_id: string | null
          subtotal_pkr: number
          tax_pkr: number
          total_pkr: number
          updated_at: string
          voided_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_order: {
        Args: { p_id: string; p_items: Json }
        Returns: {
          created_at: string
          customer_id: string
          id: string
          notes: string | null
          order_no: string | null
          replaces_order_id: string | null
          stage: Database["public"]["Enums"]["order_stage"]
          total_pkr: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_quotation: {
        Args: { p_id: string; p_items: Json; p_notes: string }
        Returns: {
          created_at: string
          customer_id: string
          id: string
          issue_date: string
          notes: string | null
          order_id: string | null
          quote_no: string | null
          subtotal_pkr: number
          total_pkr: number
          updated_at: string
          valid_until: string | null
        }
        SetofOptions: {
          from: "*"
          to: "quotations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      void_invoice: {
        Args: { p_id: string }
        Returns: {
          created_at: string
          customer_id: string
          discount_pkr: number
          due_date: string | null
          id: string
          invoice_no: string | null
          issue_date: string
          order_id: string | null
          quotation_id: string | null
          subtotal_pkr: number
          tax_pkr: number
          total_pkr: number
          updated_at: string
          voided_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "invoices"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      advance_kind: "topup" | "drawdown"
      availability: "in_stock" | "low_stock" | "made_to_order" | "out_of_stock"
      correction_action: "replacement" | "refund" | "compensation"
      customer_type: "retail" | "trade" | "workshop"
      expense_category:
        | "inventory"
        | "shipping"
        | "marketing"
        | "operations"
        | "salaries"
        | "rent"
        | "subscriptions"
        | "other"
      marketing_type: "sponsorship" | "paid_promo" | "discount" | "other"
      movement_kind:
        | "receive"
        | "sale"
        | "pr_gift"
        | "replacement"
        | "adjust_add"
        | "adjust_remove"
        | "reversal"
      order_stage:
        | "received"
        | "processing"
        | "sourcing"
        | "ready_to_ship"
        | "shipped"
        | "delivered"
        | "cancelled"
        | "partially_delivered"
      owner_kind: "house" | "investor"
      payment_kind: "payment" | "reversal"
      payment_method: "bank_transfer" | "cash" | "card" | "easypaisa" | "other"
      payout_kind: "payout" | "reversal"
      plan_priority: "high" | "medium" | "low"
      plan_status:
        | "researching"
        | "quoted"
        | "planning"
        | "approved"
        | "ordered"
        | "dropped"
      po_status:
        | "planning"
        | "approved"
        | "ordered"
        | "in_production"
        | "in_transit"
        | "received"
        | "cancelled"
      pr_status: "sent" | "posted" | "converted" | "no_result"
      product_status: "active" | "paused" | "discontinued"
      refund_cycle: "current" | "next"
      user_role: "admin" | "staff" | "viewer"
      vendor_role: "payment" | "air_freight" | "sea_freight"
      visibility: "visible" | "hidden" | "archived"
      wrong_unit_disposition: "written_off" | "restocked" | "na"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      advance_kind: ["topup", "drawdown"],
      availability: ["in_stock", "low_stock", "made_to_order", "out_of_stock"],
      correction_action: ["replacement", "refund", "compensation"],
      customer_type: ["retail", "trade", "workshop"],
      expense_category: [
        "inventory",
        "shipping",
        "marketing",
        "operations",
        "salaries",
        "rent",
        "subscriptions",
        "other",
      ],
      marketing_type: ["sponsorship", "paid_promo", "discount", "other"],
      movement_kind: [
        "receive",
        "sale",
        "pr_gift",
        "replacement",
        "adjust_add",
        "adjust_remove",
        "reversal",
      ],
      order_stage: [
        "received",
        "processing",
        "sourcing",
        "ready_to_ship",
        "shipped",
        "delivered",
        "cancelled",
        "partially_delivered",
      ],
      owner_kind: ["house", "investor"],
      payment_kind: ["payment", "reversal"],
      payment_method: ["bank_transfer", "cash", "card", "easypaisa", "other"],
      payout_kind: ["payout", "reversal"],
      plan_priority: ["high", "medium", "low"],
      plan_status: [
        "researching",
        "quoted",
        "planning",
        "approved",
        "ordered",
        "dropped",
      ],
      po_status: [
        "planning",
        "approved",
        "ordered",
        "in_production",
        "in_transit",
        "received",
        "cancelled",
      ],
      pr_status: ["sent", "posted", "converted", "no_result"],
      product_status: ["active", "paused", "discontinued"],
      refund_cycle: ["current", "next"],
      user_role: ["admin", "staff", "viewer"],
      vendor_role: ["payment", "air_freight", "sea_freight"],
      visibility: ["visible", "hidden", "archived"],
      wrong_unit_disposition: ["written_off", "restocked", "na"],
    },
  },
} as const

