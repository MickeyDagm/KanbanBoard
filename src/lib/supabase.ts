import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Database = {
  public: {
    Tables: {
      boards: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          user_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          user_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          description?: string | null;
          user_id?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      lists: {
        Row: {
          id: string;
          title: string;
          board_id: string;
          position: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          board_id: string;
          position?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          board_id?: string;
          position?: number;
          created_at?: string;
        };
      };
      cards: {
        Row: {
          id: string;
          title: string;
          description: string;
          list_id: string;
          position: number;
          due_date: string | null;
          labels: string[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string;
          list_id: string;
          position?: number;
          due_date?: string | null;
          labels?: string[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          description?: string;
          list_id?: string;
          position?: number;
          due_date?: string | null;
          labels?: string[];
          created_at?: string;
          updated_at?: string;
        };
      };
    };
  };
};