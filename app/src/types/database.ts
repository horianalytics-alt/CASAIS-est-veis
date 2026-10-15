export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      account_goals: {
        Row: {
          account_id: string;
          amount: number;
          created_at: string;
          family_id: string;
          id: string;
        };
        ComputedFields: never;
        Insert: {
          account_id: string;
          amount: number;
          created_at?: string;
          family_id: string;
          id?: string;
        };
        Update: {
          account_id?: string;
          amount?: number;
          created_at?: string;
          family_id?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "account_goals_family_id_account_id_fkey";
            columns: ["family_id", "account_id"];
            isOneToOne: true;
            referencedRelation: "accounts";
            referencedColumns: ["family_id", "id"];
          },
          {
            foreignKeyName: "account_goals_family_id_account_id_fkey";
            columns: ["family_id", "account_id"];
            isOneToOne: true;
            referencedRelation: "v_account_balances";
            referencedColumns: ["family_id", "account_id"];
          },
          {
            foreignKeyName: "account_goals_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
        ];
      };
      accounts: {
        Row: {
          archived_at: string | null;
          closing_day: number | null;
          created_at: string;
          due_day: number | null;
          external_id: string | null;
          family_id: string;
          id: string;
          initial_balance: number;
          name: string;
          owner_member_id: string | null;
          sort_order: number;
          type: string;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          closing_day?: number | null;
          created_at?: string;
          due_day?: number | null;
          external_id?: string | null;
          family_id: string;
          id?: string;
          initial_balance?: number;
          name: string;
          owner_member_id?: string | null;
          sort_order?: number;
          type: string;
        };
        Update: {
          archived_at?: string | null;
          closing_day?: number | null;
          created_at?: string;
          due_day?: number | null;
          external_id?: string | null;
          family_id?: string;
          id?: string;
          initial_balance?: number;
          name?: string;
          owner_member_id?: string | null;
          sort_order?: number;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "accounts_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "accounts_family_id_owner_member_id_fkey";
            columns: ["family_id", "owner_member_id"];
            isOneToOne: false;
            referencedRelation: "family_members";
            referencedColumns: ["family_id", "id"];
          },
          {
            foreignKeyName: "accounts_family_id_owner_member_id_fkey";
            columns: ["family_id", "owner_member_id"];
            isOneToOne: false;
            referencedRelation: "v_settlement";
            referencedColumns: ["family_id", "member_id"];
          },
        ];
      };
      categories: {
        Row: {
          archived_at: string | null;
          color: string | null;
          created_at: string;
          family_id: string;
          group_id: string | null;
          icon: string | null;
          id: string;
          name: string;
          sort_order: number;
          type: string;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          color?: string | null;
          created_at?: string;
          family_id: string;
          group_id?: string | null;
          icon?: string | null;
          id?: string;
          name: string;
          sort_order?: number;
          type: string;
        };
        Update: {
          archived_at?: string | null;
          color?: string | null;
          created_at?: string;
          family_id?: string;
          group_id?: string | null;
          icon?: string | null;
          id?: string;
          name?: string;
          sort_order?: number;
          type?: string;
        };
        Relationships: [
          {
            foreignKeyName: "categories_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "categories_family_id_group_id_fkey";
            columns: ["family_id", "group_id"];
            isOneToOne: false;
            referencedRelation: "category_groups";
            referencedColumns: ["family_id", "id"];
          },
        ];
      };
      category_budgets: {
        Row: {
          amount: number;
          category_id: string;
          created_at: string;
          family_id: string;
          id: string;
          month: string;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          category_id: string;
          created_at?: string;
          family_id: string;
          id?: string;
          month: string;
        };
        Update: {
          amount?: number;
          category_id?: string;
          created_at?: string;
          family_id?: string;
          id?: string;
          month?: string;
        };
        Relationships: [
          {
            foreignKeyName: "category_budgets_family_id_category_id_fkey";
            columns: ["family_id", "category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["family_id", "id"];
          },
          {
            foreignKeyName: "category_budgets_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
        ];
      };
      category_groups: {
        Row: {
          created_at: string;
          family_id: string;
          id: string;
          name: string;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          family_id: string;
          id?: string;
          name: string;
          sort_order?: number;
        };
        Update: {
          created_at?: string;
          family_id?: string;
          id?: string;
          name?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "category_groups_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
        ];
      };
      families: {
        Row: {
          created_at: string;
          id: string;
          join_code: string;
          member_limit: number;
          name: string;
          split_rule: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          join_code: string;
          member_limit?: number;
          name: string;
          split_rule?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          join_code?: string;
          member_limit?: number;
          name?: string;
          split_rule?: string;
        };
        Relationships: [];
      };
      family_members: {
        Row: {
          avatar_url: string | null;
          display_name: string;
          family_id: string;
          id: string;
          joined_at: string;
          monthly_income: number | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          avatar_url?: string | null;
          display_name: string;
          family_id: string;
          id?: string;
          joined_at?: string;
          monthly_income?: number | null;
          user_id: string;
        };
        Update: {
          avatar_url?: string | null;
          display_name?: string;
          family_id?: string;
          id?: string;
          joined_at?: string;
          monthly_income?: number | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "family_members_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
        ];
      };
      join_attempts: {
        Row: {
          id: number;
          origem: string;
          tentado_em: string;
          tentou_code: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          id?: never;
          origem: string;
          tentado_em?: string;
          tentou_code: string;
          user_id: string;
        };
        Update: {
          id?: never;
          origem?: string;
          tentado_em?: string;
          tentou_code?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      payment_methods: {
        Row: {
          archived_at: string | null;
          created_at: string;
          family_id: string;
          id: string;
          name: string;
          sort_order: number;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          family_id: string;
          id?: string;
          name: string;
          sort_order?: number;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          family_id?: string;
          id?: string;
          name?: string;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "payment_methods_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
        ];
      };
      push_subscriptions: {
        Row: {
          auth: string;
          created_at: string;
          endpoint: string;
          family_id: string;
          id: string;
          member_id: string;
          p256dh: string;
        };
        ComputedFields: never;
        Insert: {
          auth: string;
          created_at?: string;
          endpoint: string;
          family_id: string;
          id?: string;
          member_id: string;
          p256dh: string;
        };
        Update: {
          auth?: string;
          created_at?: string;
          endpoint?: string;
          family_id?: string;
          id?: string;
          member_id?: string;
          p256dh?: string;
        };
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "push_subscriptions_family_id_member_id_fkey";
            columns: ["family_id", "member_id"];
            isOneToOne: false;
            referencedRelation: "family_members";
            referencedColumns: ["family_id", "id"];
          },
          {
            foreignKeyName: "push_subscriptions_family_id_member_id_fkey";
            columns: ["family_id", "member_id"];
            isOneToOne: false;
            referencedRelation: "v_settlement";
            referencedColumns: ["family_id", "member_id"];
          },
        ];
      };
      transactions: {
        Row: {
          account_id: string;
          amount: number;
          category_id: string | null;
          created_at: string;
          created_by_member_id: string;
          date: string;
          description: string;
          family_id: string;
          futile_label: string | null;
          id: string;
          invoice_month: number | null;
          invoice_year: number | null;
          is_benefit: boolean;
          is_futile: boolean;
          is_paid: boolean;
          notes: string | null;
          owner_member_id: string | null;
          owner_share: number | null;
          paid_by_member_id: string;
          paid_date: string | null;
          payment_method_id: string | null;
          recurrence_index: number | null;
          recurrence_months: number | null;
          recurrence_parent_id: string | null;
          settlement_to_member_id: string | null;
          to_account_id: string | null;
          type: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          account_id: string;
          amount: number;
          category_id?: string | null;
          created_at?: string;
          created_by_member_id: string;
          date: string;
          description: string;
          family_id: string;
          futile_label?: string | null;
          id?: string;
          invoice_month?: number | null;
          invoice_year?: number | null;
          is_benefit?: boolean;
          is_futile?: boolean;
          is_paid?: boolean;
          notes?: string | null;
          owner_member_id?: string | null;
          owner_share?: number | null;
          paid_by_member_id: string;
          paid_date?: string | null;
          payment_method_id?: string | null;
          recurrence_index?: number | null;
          recurrence_months?: number | null;
          recurrence_parent_id?: string | null;
          settlement_to_member_id?: string | null;
          to_account_id?: string | null;
          type: string;
          updated_at?: string;
        };
        Update: {
          account_id?: string;
          amount?: number;
          category_id?: string | null;
          created_at?: string;
          created_by_member_id?: string;
          date?: string;
          description?: string;
          family_id?: string;
          futile_label?: string | null;
          id?: string;
          invoice_month?: number | null;
          invoice_year?: number | null;
          is_benefit?: boolean;
          is_futile?: boolean;
          is_paid?: boolean;
          notes?: string | null;
          owner_member_id?: string | null;
          owner_share?: number | null;
          paid_by_member_id?: string;
          paid_date?: string | null;
          payment_method_id?: string | null;
          recurrence_index?: number | null;
          recurrence_months?: number | null;
          recurrence_parent_id?: string | null;
          settlement_to_member_id?: string | null;
          to_account_id?: string | null;
          type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_family_id_account_id_fkey";
            columns: ["family_id", "account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["family_id", "id"];
          },
          {
            foreignKeyName: "transactions_family_id_account_id_fkey";
            columns: ["family_id", "account_id"];
            isOneToOne: false;
            referencedRelation: "v_account_balances";
            referencedColumns: ["family_id", "account_id"];
          },
          {
            foreignKeyName: "transactions_family_id_category_id_fkey";
            columns: ["family_id", "category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["family_id", "id"];
          },
          {
            foreignKeyName: "transactions_family_id_created_by_member_id_fkey";
            columns: ["family_id", "created_by_member_id"];
            isOneToOne: false;
            referencedRelation: "family_members";
            referencedColumns: ["family_id", "id"];
          },
          {
            foreignKeyName: "transactions_family_id_created_by_member_id_fkey";
            columns: ["family_id", "created_by_member_id"];
            isOneToOne: false;
            referencedRelation: "v_settlement";
            referencedColumns: ["family_id", "member_id"];
          },
          {
            foreignKeyName: "transactions_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_family_id_owner_member_id_fkey";
            columns: ["family_id", "owner_member_id"];
            isOneToOne: false;
            referencedRelation: "family_members";
            referencedColumns: ["family_id", "id"];
          },
          {
            foreignKeyName: "transactions_family_id_owner_member_id_fkey";
            columns: ["family_id", "owner_member_id"];
            isOneToOne: false;
            referencedRelation: "v_settlement";
            referencedColumns: ["family_id", "member_id"];
          },
          {
            foreignKeyName: "transactions_family_id_paid_by_member_id_fkey";
            columns: ["family_id", "paid_by_member_id"];
            isOneToOne: false;
            referencedRelation: "family_members";
            referencedColumns: ["family_id", "id"];
          },
          {
            foreignKeyName: "transactions_family_id_paid_by_member_id_fkey";
            columns: ["family_id", "paid_by_member_id"];
            isOneToOne: false;
            referencedRelation: "v_settlement";
            referencedColumns: ["family_id", "member_id"];
          },
          {
            foreignKeyName: "transactions_family_id_payment_method_id_fkey";
            columns: ["family_id", "payment_method_id"];
            isOneToOne: false;
            referencedRelation: "payment_methods";
            referencedColumns: ["family_id", "id"];
          },
          {
            foreignKeyName: "transactions_family_id_settlement_to_member_id_fkey";
            columns: ["family_id", "settlement_to_member_id"];
            isOneToOne: false;
            referencedRelation: "family_members";
            referencedColumns: ["family_id", "id"];
          },
          {
            foreignKeyName: "transactions_family_id_settlement_to_member_id_fkey";
            columns: ["family_id", "settlement_to_member_id"];
            isOneToOne: false;
            referencedRelation: "v_settlement";
            referencedColumns: ["family_id", "member_id"];
          },
          {
            foreignKeyName: "transactions_family_id_to_account_id_fkey";
            columns: ["family_id", "to_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["family_id", "id"];
          },
          {
            foreignKeyName: "transactions_family_id_to_account_id_fkey";
            columns: ["family_id", "to_account_id"];
            isOneToOne: false;
            referencedRelation: "v_account_balances";
            referencedColumns: ["family_id", "account_id"];
          },
        ];
      };
    };
    Views: {
      v_account_balances: {
        Row: {
          account_id: string | null;
          archived_at: string | null;
          closing_day: number | null;
          current_balance: number | null;
          due_day: number | null;
          family_id: string | null;
          initial_balance: number | null;
          name: string | null;
          owner_member_id: string | null;
          pending_inflow: number | null;
          pending_outflow: number | null;
          sort_order: number | null;
          type: string | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "accounts_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "accounts_family_id_owner_member_id_fkey";
            columns: ["family_id", "owner_member_id"];
            isOneToOne: false;
            referencedRelation: "family_members";
            referencedColumns: ["family_id", "id"];
          },
          {
            foreignKeyName: "accounts_family_id_owner_member_id_fkey";
            columns: ["family_id", "owner_member_id"];
            isOneToOne: false;
            referencedRelation: "v_settlement";
            referencedColumns: ["family_id", "member_id"];
          },
        ];
      };
      v_invoices: {
        Row: {
          account_id: string | null;
          account_name: string | null;
          closing_day: number | null;
          due_date: string | null;
          due_day: number | null;
          family_id: string | null;
          invoice_month: number | null;
          invoice_year: number | null;
          is_paid: boolean | null;
          open_amount: number | null;
          total_amount: number | null;
          tx_count: number | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "transactions_family_id_account_id_fkey";
            columns: ["family_id", "account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["family_id", "id"];
          },
          {
            foreignKeyName: "transactions_family_id_account_id_fkey";
            columns: ["family_id", "account_id"];
            isOneToOne: false;
            referencedRelation: "v_account_balances";
            referencedColumns: ["family_id", "account_id"];
          },
          {
            foreignKeyName: "transactions_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
        ];
      };
      v_monthly_summary: {
        Row: {
          expense_paid: number | null;
          expense_total: number | null;
          family_id: string | null;
          income_paid: number | null;
          income_total: number | null;
          investment_paid: number | null;
          investment_total: number | null;
          month: string | null;
          payable: number | null;
          receivable: number | null;
          tx_count: number | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "transactions_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
        ];
      };
      v_orcamento_progresso: {
        Row: {
          budget_amount: number | null;
          budget_id: string | null;
          category_archived_at: string | null;
          category_color: string | null;
          category_icon: string | null;
          category_id: string | null;
          category_name: string | null;
          category_type: string | null;
          family_id: string | null;
          month: string | null;
          remaining_amount: number | null;
          spent_amount: number | null;
          tx_count: number | null;
          used_ratio: number | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "category_budgets_family_id_category_id_fkey";
            columns: ["family_id", "category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["family_id", "id"];
          },
          {
            foreignKeyName: "category_budgets_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
        ];
      };
      v_patrimonio_mensal: {
        Row: {
          family_id: string | null;
          month: string | null;
          net_change: number | null;
          total_balance: number | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "accounts_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
        ];
      };
      v_settlement: {
        Row: {
          balance: number | null;
          display_name: string | null;
          family_id: string | null;
          member_id: string | null;
          share: number | null;
          total_owed: number | null;
          total_paid: number | null;
          total_settled_received: number | null;
          total_settled_sent: number | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "family_members_family_id_fkey";
            columns: ["family_id"];
            isOneToOne: false;
            referencedRelation: "families";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Functions: {
      chave_nome: { Args: { p_nome: string }; Returns: string };
      create_family: {
        Args: {
          p_family_name: string;
          p_member_name: string;
          p_monthly_income?: number;
          p_split_rule: string;
        };
        Returns: {
          family_id: string;
          join_code: string;
          member_id: string;
        }[];
      };
      delete_transactions: { Args: { p_id: string; p_scope?: string }; Returns: number };
      family_preview: {
        Args: { p_join_code: string };
        Returns: {
          has_room: boolean;
          member_count: number;
          member_limit: number;
          name: string;
        }[];
      };
      generate_join_code: { Args: Record<PropertyKey, never>; Returns: string };
      get_user_family_id: { Args: { uid: string }; Returns: string };
      get_user_family_id_self: { Args: Record<PropertyKey, never>; Returns: string };
      get_user_member_id: { Args: { uid: string }; Returns: string };
      get_user_member_id_self: { Args: Record<PropertyKey, never>; Returns: string };
      join_family: {
        Args: { p_join_code: string; p_member_name: string; p_monthly_income?: number };
        Returns: {
          family_id: string;
          member_id: string;
        }[];
      };
      pay_invoice: {
        Args: {
          p_card_account_id: string;
          p_date?: string;
          p_from_account_id: string;
          p_invoice_month: number;
          p_invoice_year: number;
        };
        Returns: string;
      };
      registrar_tentativa_join: { Args: { p_code: string; p_origem: string }; Returns: undefined };
      rotacionar_join_code: { Args: Record<PropertyKey, never>; Returns: string };
      save_transactions: {
        Args: { p_items: Json };
        Returns: {
          account_id: string;
          amount: number;
          category_id: string | null;
          created_at: string;
          created_by_member_id: string;
          date: string;
          description: string;
          family_id: string;
          futile_label: string | null;
          id: string;
          invoice_month: number | null;
          invoice_year: number | null;
          is_benefit: boolean;
          is_futile: boolean;
          is_paid: boolean;
          notes: string | null;
          owner_member_id: string | null;
          owner_share: number | null;
          paid_by_member_id: string;
          paid_date: string | null;
          payment_method_id: string | null;
          recurrence_index: number | null;
          recurrence_months: number | null;
          recurrence_parent_id: string | null;
          settlement_to_member_id: string | null;
          to_account_id: string | null;
          type: string;
          updated_at: string;
        }[];
        SetofOptions: {
          from: "*";
          to: "transactions";
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      seed_family_defaults: { Args: { p_family_id: string }; Returns: undefined };
      settle_up: {
        Args: {
          p_amount: number;
          p_date?: string;
          p_from_member_id: string;
          p_to_member_id: string;
        };
        Returns: string;
      };
      tentativas_join_estouradas: { Args: Record<PropertyKey, never>; Returns: boolean };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
