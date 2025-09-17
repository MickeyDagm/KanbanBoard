/*
  # Kanban Board Schema

  1. New Tables
    - `boards`
      - `id` (uuid, primary key)
      - `title` (text)
      - `description` (text, optional)
      - `user_id` (uuid, references auth.users)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)
    
    - `lists`
      - `id` (uuid, primary key)
      - `title` (text)
      - `board_id` (uuid, references boards)
      - `position` (integer)
      - `created_at` (timestamp)
    
    - `cards`
      - `id` (uuid, primary key)
      - `title` (text)
      - `description` (text, optional)
      - `list_id` (uuid, references lists)
      - `position` (integer)
      - `due_date` (date, optional)
      - `labels` (text array)
      - `created_at` (timestamp)
      - `updated_at` (timestamp)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to manage their own data
*/

-- Create boards table
CREATE TABLE IF NOT EXISTS boards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create lists table
CREATE TABLE IF NOT EXISTS lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  board_id uuid REFERENCES boards(id) ON DELETE CASCADE NOT NULL,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create cards table
CREATE TABLE IF NOT EXISTS cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text DEFAULT '',
  list_id uuid REFERENCES lists(id) ON DELETE CASCADE NOT NULL,
  position integer NOT NULL DEFAULT 0,
  due_date date,
  labels text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE boards ENABLE ROW LEVEL SECURITY;
ALTER TABLE lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE cards ENABLE ROW LEVEL SECURITY;

-- Create policies for boards
CREATE POLICY "Users can manage their own boards"
  ON boards
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Create policies for lists
CREATE POLICY "Users can manage lists in their boards"
  ON lists
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM boards 
      WHERE boards.id = lists.board_id 
      AND boards.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM boards 
      WHERE boards.id = lists.board_id 
      AND boards.user_id = auth.uid()
    )
  );

-- Create policies for cards
CREATE POLICY "Users can manage cards in their boards"
  ON cards
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM lists 
      JOIN boards ON boards.id = lists.board_id 
      WHERE lists.id = cards.list_id 
      AND boards.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM lists 
      JOIN boards ON boards.id = lists.board_id 
      WHERE lists.id = cards.list_id 
      AND boards.user_id = auth.uid()
    )
  );

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_boards_user_id ON boards(user_id);
CREATE INDEX IF NOT EXISTS idx_lists_board_id ON lists(board_id);
CREATE INDEX IF NOT EXISTS idx_lists_position ON lists(position);
CREATE INDEX IF NOT EXISTS idx_cards_list_id ON cards(list_id);
CREATE INDEX IF NOT EXISTS idx_cards_position ON cards(position);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_boards_updated_at 
  BEFORE UPDATE ON boards 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cards_updated_at 
  BEFORE UPDATE ON cards 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();