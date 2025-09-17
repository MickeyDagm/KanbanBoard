export interface Board {
  id: string;
  title: string;
  description?: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface List {
  id: string;
  title: string;
  board_id: string;
  position: number;
  created_at: string;
  cards?: Card[];
}

export interface Card {
  id: string;
  title: string;
  description: string;
  list_id: string;
  position: number;
  due_date?: string;
  labels: string[];
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  email: string;
}