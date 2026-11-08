export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      workspaces: {
        Row: { id: string; name: string; created_by: string; created_at: string; updated_at: string };
        Insert: { id?: string; name: string; created_by: string; created_at?: string; updated_at?: string };
        Update: { id?: string; name?: string; created_by?: string; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      workspace_members: {
        Row: { id: string; workspace_id: string; user_id: string; role: string; created_at: string };
        Insert: { id?: string; workspace_id: string; user_id: string; role?: string; created_at?: string };
        Update: { id?: string; workspace_id?: string; user_id?: string; role?: string; created_at?: string };
        Relationships: [];
      };
      tasks: {
        Row: { id: string; workspace_id: string; title: string; description: string | null; status: string; due_date: string | null; assigned_to: string | null; created_by: string; created_at: string; updated_at: string };
        Insert: { id?: string; workspace_id: string; title: string; description?: string | null; status?: string; due_date?: string | null; assigned_to?: string | null; created_by: string; created_at?: string; updated_at?: string };
        Update: { id?: string; workspace_id?: string; title?: string; description?: string | null; status?: string; due_date?: string | null; assigned_to?: string | null; created_by?: string; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      customers: {
        Row: { id: string; workspace_id: string; name: string; email: string | null; phone: string | null; company: string | null; notes: string | null; created_by: string; created_at: string; updated_at: string };
        Insert: { id?: string; workspace_id: string; name: string; email?: string | null; phone?: string | null; company?: string | null; notes?: string | null; created_by: string; created_at?: string; updated_at?: string };
        Update: { id?: string; workspace_id?: string; name?: string; email?: string | null; phone?: string | null; company?: string | null; notes?: string | null; created_by?: string; created_at?: string; updated_at?: string };
        Relationships: [];
      };
      expenses: {
        Row: { id: string; workspace_id: string; description: string; category: string; amount: number; currency: string; incurred_on: string; created_by: string; created_at: string };
        Insert: { id?: string; workspace_id: string; description: string; category?: string; amount: number; currency?: string; incurred_on?: string; created_by: string; created_at?: string };
        Update: { id?: string; workspace_id?: string; description?: string; category?: string; amount?: number; currency?: string; incurred_on?: string; created_by?: string; created_at?: string };
        Relationships: [];
      };
      sales: {
        Row: { id: string; workspace_id: string; customer_id: string | null; description: string; amount: number; currency: string; status: string; sold_on: string; created_by: string; created_at: string };
        Insert: { id?: string; workspace_id: string; customer_id?: string | null; description: string; amount: number; currency?: string; status?: string; sold_on?: string; created_by: string; created_at?: string };
        Update: { id?: string; workspace_id?: string; customer_id?: string | null; description?: string; amount?: number; currency?: string; status?: string; sold_on?: string; created_by?: string; created_at?: string };
        Relationships: [];
      };
      inventory_items: {
        Row: { id: string; workspace_id: string; name: string; sku: string | null; quantity: number; reorder_level: number; unit_price: number | null; created_by: string; created_at: string; updated_at: string };
        Insert: { id?: string; workspace_id: string; name: string; sku?: string | null; quantity?: number; reorder_level?: number; unit_price?: number | null; created_by: string; created_at?: string; updated_at?: string };
        Update: { id?: string; workspace_id?: string; name?: string; sku?: string | null; quantity?: number; reorder_level?: number; unit_price?: number | null; created_by?: string; created_at?: string; updated_at?: string };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
