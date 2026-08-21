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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      ai_actions: {
        Row: {
          autonomy_level: string
          confidence: number | null
          conversation_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          error: string | null
          expires_at: string | null
          id: string
          intent: string | null
          new_state: Json | null
          origin: string
          owner_id: string
          parameters: Json
          previous_state: Json | null
          resolved_at: string | null
          result: Json | null
          state_hash: string | null
          status: string
          tool_name: string
        }
        Insert: {
          autonomy_level?: string
          confidence?: number | null
          conversation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          error?: string | null
          expires_at?: string | null
          id?: string
          intent?: string | null
          new_state?: Json | null
          origin?: string
          owner_id: string
          parameters?: Json
          previous_state?: Json | null
          resolved_at?: string | null
          result?: Json | null
          state_hash?: string | null
          status?: string
          tool_name: string
        }
        Update: {
          autonomy_level?: string
          confidence?: number | null
          conversation_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          error?: string | null
          expires_at?: string | null
          id?: string
          intent?: string | null
          new_state?: Json | null
          origin?: string
          owner_id?: string
          parameters?: Json
          previous_state?: Json | null
          resolved_at?: string | null
          result?: Json | null
          state_hash?: string | null
          status?: string
          tool_name?: string
        }
        Relationships: []
      }
      ai_conversations: {
        Row: {
          context: Json | null
          created_at: string
          id: string
          message: string
          owner_id: string
          role: string
          session_id: string
        }
        Insert: {
          context?: Json | null
          created_at?: string
          id?: string
          message: string
          owner_id: string
          role: string
          session_id: string
        }
        Update: {
          context?: Json | null
          created_at?: string
          id?: string
          message?: string
          owner_id?: string
          role?: string
          session_id?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_type: string
          after_state: Json | null
          before_state: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          metadata: Json
          owner_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_type?: string
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          metadata?: Json
          owner_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_type?: string
          after_state?: Json | null
          before_state?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          metadata?: Json
          owner_id?: string
        }
        Relationships: []
      }
      client_memory: {
        Row: {
          client_id: string | null
          confidence: number
          created_at: string
          id: string
          memory_key: string
          memory_type: string
          memory_value: Json
          owner_id: string
          source: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          confidence?: number
          created_at?: string
          id?: string
          memory_key: string
          memory_type: string
          memory_value: Json
          owner_id: string
          source?: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          confidence?: number
          created_at?: string
          id?: string
          memory_key?: string
          memory_type?: string
          memory_value?: Json
          owner_id?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_memory_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          billing_address: string | null
          company_name: string | null
          created_at: string
          email: string | null
          id: string
          is_demo: boolean
          name: string
          notes: string | null
          owner_id: string
          phone: string | null
          preferred_language: string
          status: string
          updated_at: string
        }
        Insert: {
          billing_address?: string | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_demo?: boolean
          name: string
          notes?: string | null
          owner_id: string
          phone?: string | null
          preferred_language?: string
          status?: string
          updated_at?: string
        }
        Update: {
          billing_address?: string | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_demo?: boolean
          name?: string
          notes?: string | null
          owner_id?: string
          phone?: string | null
          preferred_language?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_policies: {
        Row: {
          created_at: string
          id: string
          owner_id: string
          policy_key: string
          policy_value: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_id: string
          policy_key: string
          policy_value: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_id?: string
          policy_key?: string
          policy_value?: Json
          updated_at?: string
        }
        Relationships: []
      }
      invoice_items: {
        Row: {
          created_at: string
          description: string
          id: string
          invoice_id: string
          line_total: number
          owner_id: string
          quantity: number
          sort_order: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          line_total?: number
          owner_id: string
          quantity?: number
          sort_order?: number
          unit_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          line_total?: number
          owner_id?: string
          quantity?: number
          sort_order?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          cancelled_at: string | null
          client_id: string
          created_at: string
          currency: string
          discount_amount: number
          discount_type: string
          discount_value: number
          due_date: string
          id: string
          invoice_number: string
          is_demo: boolean
          issue_date: string
          items: Json
          notes: string | null
          owner_id: string
          paid_amount: number
          paid_date: string | null
          pdf_url: string | null
          remaining_balance: number
          sent_at: string | null
          status: string
          subtotal: number
          tax_amount: number
          tax_rate: number
          updated_at: string
        }
        Insert: {
          amount?: number
          cancelled_at?: string | null
          client_id: string
          created_at?: string
          currency?: string
          discount_amount?: number
          discount_type?: string
          discount_value?: number
          due_date?: string
          id?: string
          invoice_number: string
          is_demo?: boolean
          issue_date?: string
          items?: Json
          notes?: string | null
          owner_id: string
          paid_amount?: number
          paid_date?: string | null
          pdf_url?: string | null
          remaining_balance?: number
          sent_at?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          updated_at?: string
        }
        Update: {
          amount?: number
          cancelled_at?: string | null
          client_id?: string
          created_at?: string
          currency?: string
          discount_amount?: number
          discount_type?: string
          discount_value?: number
          due_date?: string
          id?: string
          invoice_number?: string
          is_demo?: boolean
          issue_date?: string
          items?: Json
          notes?: string | null
          owner_id?: string
          paid_amount?: number
          paid_date?: string | null
          pdf_url?: string | null
          remaining_balance?: number
          sent_at?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          client_id: string | null
          created_at: string
          dedupe_key: string
          event_type: string
          id: string
          installment_id: string | null
          invoice_id: string | null
          owner_id: string
          plan_id: string | null
          read_at: string | null
          title: string
        }
        Insert: {
          body?: string | null
          client_id?: string | null
          created_at?: string
          dedupe_key: string
          event_type: string
          id?: string
          installment_id?: string | null
          invoice_id?: string | null
          owner_id: string
          plan_id?: string | null
          read_at?: string | null
          title: string
        }
        Update: {
          body?: string | null
          client_id?: string | null
          created_at?: string
          dedupe_key?: string
          event_type?: string
          id?: string
          installment_id?: string | null
          invoice_id?: string | null
          owner_id?: string
          plan_id?: string | null
          read_at?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "payment_plan_installments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "payment_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_plan_installments: {
        Row: {
          amount: number
          created_at: string
          due_date: string
          id: string
          owner_id: string
          paid_amount: number
          plan_id: string
          seq: number
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          due_date: string
          id?: string
          owner_id: string
          paid_amount?: number
          plan_id: string
          seq: number
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          due_date?: string
          id?: string
          owner_id?: string
          paid_amount?: number
          plan_id?: string
          seq?: number
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_plan_installments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "payment_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_plans: {
        Row: {
          client_id: string
          created_at: string
          currency: string
          end_date: string | null
          frequency: string
          id: string
          installment_count: number
          invoice_id: string | null
          notes: string | null
          owner_id: string
          paid_amount: number
          paused_at: string | null
          remaining_amount: number
          start_date: string
          status: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          currency?: string
          end_date?: string | null
          frequency?: string
          id?: string
          installment_count?: number
          invoice_id?: string | null
          notes?: string | null
          owner_id: string
          paid_amount?: number
          paused_at?: string | null
          remaining_amount?: number
          start_date?: string
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          currency?: string
          end_date?: string | null
          frequency?: string
          id?: string
          installment_count?: number
          invoice_id?: string | null
          notes?: string | null
          owner_id?: string
          paid_amount?: number
          paused_at?: string | null
          remaining_amount?: number
          start_date?: string
          status?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_plans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_plans_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          client_id: string | null
          created_at: string
          currency: string
          id: string
          idempotency_key: string | null
          installment_id: string | null
          invoice_id: string | null
          is_demo: boolean
          notes: string | null
          owner_id: string
          payment_date: string
          payment_method: string | null
          plan_id: string | null
          reference: string | null
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
        }
        Insert: {
          amount: number
          client_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          idempotency_key?: string | null
          installment_id?: string | null
          invoice_id?: string | null
          is_demo?: boolean
          notes?: string | null
          owner_id: string
          payment_date?: string
          payment_method?: string | null
          plan_id?: string | null
          reference?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
        }
        Update: {
          amount?: number
          client_id?: string | null
          created_at?: string
          currency?: string
          id?: string
          idempotency_key?: string | null
          installment_id?: string | null
          invoice_id?: string | null
          is_demo?: boolean
          notes?: string | null
          owner_id?: string
          payment_date?: string
          payment_method?: string | null
          plan_id?: string | null
          reference?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "payment_plan_installments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "payment_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          company_name: string | null
          created_at: string
          currency: string
          email: string | null
          full_name: string | null
          id: string
          onboarded: boolean
          phone: string | null
          preferred_language: string
          updated_at: string
        }
        Insert: {
          company_name?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          full_name?: string | null
          id: string
          onboarded?: boolean
          phone?: string | null
          preferred_language?: string
          updated_at?: string
        }
        Update: {
          company_name?: string | null
          created_at?: string
          currency?: string
          email?: string | null
          full_name?: string | null
          id?: string
          onboarded?: boolean
          phone?: string | null
          preferred_language?: string
          updated_at?: string
        }
        Relationships: []
      }
      reminders: {
        Row: {
          channel: string
          client_id: string | null
          created_at: string
          id: string
          invoice_id: string | null
          message: string
          owner_id: string
          reminder_type: string
          scheduled_at: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          channel?: string
          client_id?: string | null
          created_at?: string
          id?: string
          invoice_id?: string | null
          message: string
          owner_id: string
          reminder_type?: string
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          channel?: string
          client_id?: string | null
          created_at?: string
          id?: string
          invoice_id?: string | null
          message?: string
          owner_id?: string
          reminder_type?: string
          scheduled_at?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
