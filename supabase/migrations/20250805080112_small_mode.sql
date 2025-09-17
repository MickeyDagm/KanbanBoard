/*
  # Seed Sample Data for Kanban Application

  1. Sample Boards
    - Creates example boards for demonstration
    - Includes various project types (Web Development, Marketing Campaign, Personal Tasks)

  2. Sample Lists
    - Creates standard Kanban columns (To Do, In Progress, Review, Done)
    - Proper positioning for drag-and-drop functionality

  3. Sample Cards
    - Realistic task examples with descriptions
    - Various due dates and labels
    - Different priorities and categories

  4. Security
    - All data respects existing RLS policies
    - Uses placeholder user IDs that will be replaced with actual user data
*/

-- Note: This seed data uses a placeholder user_id. 
-- In a real application, you would replace this with actual user IDs after authentication.
-- For demo purposes, we'll create sample data that can be viewed by any authenticated user.

-- Insert sample boards
INSERT INTO boards (id, title, description, user_id) VALUES
  ('550e8400-e29b-41d4-a716-446655440001', 'Web Development Project', 'Main project board for our new website redesign', auth.uid()),
  ('550e8400-e29b-41d4-a716-446655440002', 'Marketing Campaign Q1', 'Planning and execution of Q1 marketing initiatives', auth.uid()),
  ('550e8400-e29b-41d4-a716-446655440003', 'Personal Tasks', 'Personal productivity and goal tracking', auth.uid())
ON CONFLICT (id) DO NOTHING;

-- Insert sample lists for Web Development Project
INSERT INTO lists (id, title, board_id, position) VALUES
  ('660e8400-e29b-41d4-a716-446655440001', 'Backlog', '550e8400-e29b-41d4-a716-446655440001', 0),
  ('660e8400-e29b-41d4-a716-446655440002', 'To Do', '550e8400-e29b-41d4-a716-446655440001', 1),
  ('660e8400-e29b-41d4-a716-446655440003', 'In Progress', '550e8400-e29b-41d4-a716-446655440001', 2),
  ('660e8400-e29b-41d4-a716-446655440004', 'Review', '550e8400-e29b-41d4-a716-446655440001', 3),
  ('660e8400-e29b-41d4-a716-446655440005', 'Done', '550e8400-e29b-41d4-a716-446655440001', 4)
ON CONFLICT (id) DO NOTHING;

-- Insert sample lists for Marketing Campaign
INSERT INTO lists (id, title, board_id, position) VALUES
  ('660e8400-e29b-41d4-a716-446655440006', 'Ideas', '550e8400-e29b-41d4-a716-446655440002', 0),
  ('660e8400-e29b-41d4-a716-446655440007', 'Planning', '550e8400-e29b-41d4-a716-446655440002', 1),
  ('660e8400-e29b-41d4-a716-446655440008', 'In Progress', '550e8400-e29b-41d4-a716-446655440002', 2),
  ('660e8400-e29b-41d4-a716-446655440009', 'Completed', '550e8400-e29b-41d4-a716-446655440002', 3)
ON CONFLICT (id) DO NOTHING;

-- Insert sample lists for Personal Tasks
INSERT INTO lists (id, title, board_id, position) VALUES
  ('660e8400-e29b-41d4-a716-446655440010', 'To Do', '550e8400-e29b-41d4-a716-446655440003', 0),
  ('660e8400-e29b-41d4-a716-446655440011', 'Doing', '550e8400-e29b-41d4-a716-446655440003', 1),
  ('660e8400-e29b-41d4-a716-446655440012', 'Done', '550e8400-e29b-41d4-a716-446655440003', 2)
ON CONFLICT (id) DO NOTHING;

-- Insert sample cards for Web Development Project
INSERT INTO cards (id, title, description, list_id, position, due_date, labels) VALUES
  ('770e8400-e29b-41d4-a716-446655440001', 'Design Homepage Mockup', 'Create wireframes and high-fidelity mockups for the new homepage design', '660e8400-e29b-41d4-a716-446655440001', 0, '2025-02-15', ARRAY['design', 'high']),
  ('770e8400-e29b-41d4-a716-446655440002', 'Set up Development Environment', 'Configure local development environment with all necessary tools and dependencies', '660e8400-e29b-41d4-a716-446655440002', 0, '2025-02-10', ARRAY['setup', 'urgent']),
  ('770e8400-e29b-41d4-a716-446655440003', 'Implement User Authentication', 'Build login, signup, and password reset functionality using Supabase', '660e8400-e29b-41d4-a716-446655440003', 0, '2025-02-20', ARRAY['backend', 'important']),
  ('770e8400-e29b-41d4-a716-446655440004', 'Code Review - Navigation Component', 'Review the navigation component implementation for accessibility and performance', '660e8400-e29b-41d4-a716-446655440004', 0, '2025-02-12', ARRAY['review', 'medium']),
  ('770e8400-e29b-41d4-a716-446655440005', 'Deploy to Production', 'Successfully deployed the initial version to production environment', '660e8400-e29b-41d4-a716-446655440005', 0, NULL, ARRAY['deployment', 'completed']),
  ('770e8400-e29b-41d4-a716-446655440006', 'Create API Documentation', 'Document all API endpoints with examples and response formats', '660e8400-e29b-41d4-a716-446655440001', 1, '2025-02-25', ARRAY['documentation', 'low']),
  ('770e8400-e29b-41d4-a716-446655440007', 'Optimize Database Queries', 'Analyze and optimize slow database queries for better performance', '660e8400-e29b-41d4-a716-446655440002', 1, '2025-02-18', ARRAY['performance', 'medium']),
  ('770e8400-e29b-41d4-a716-446655440008', 'Build Responsive Layout', 'Ensure the application works perfectly on mobile and tablet devices', '660e8400-e29b-41d4-a716-446655440003', 1, '2025-02-22', ARRAY['frontend', 'important'])
ON CONFLICT (id) DO NOTHING;

-- Insert sample cards for Marketing Campaign
INSERT INTO cards (id, title, description, list_id, position, due_date, labels) VALUES
  ('770e8400-e29b-41d4-a716-446655440009', 'Social Media Strategy', 'Develop comprehensive social media strategy for Q1 campaign', '660e8400-e29b-41d4-a716-446655440006', 0, '2025-02-14', ARRAY['strategy', 'high']),
  ('770e8400-e29b-41d4-a716-446655440010', 'Content Calendar', 'Create detailed content calendar for all marketing channels', '660e8400-e29b-41d4-a716-446655440007', 0, '2025-02-16', ARRAY['content', 'important']),
  ('770e8400-e29b-41d4-a716-446655440011', 'Email Campaign Design', 'Design and develop email templates for the campaign', '660e8400-e29b-41d4-a716-446655440008', 0, '2025-02-20', ARRAY['email', 'design']),
  ('770e8400-e29b-41d4-a716-446655440012', 'Launch Press Release', 'Successfully launched the campaign with press release distribution', '660e8400-e29b-41d4-a716-446655440009', 0, NULL, ARRAY['pr', 'completed'])
ON CONFLICT (id) DO NOTHING;

-- Insert sample cards for Personal Tasks
INSERT INTO cards (id, title, description, list_id, position, due_date, labels) VALUES
  ('770e8400-e29b-41d4-a716-446655440013', 'Learn TypeScript', 'Complete TypeScript fundamentals course and build a small project', '660e8400-e29b-41d4-a716-446655440010', 0, '2025-03-01', ARRAY['learning', 'personal']),
  ('770e8400-e29b-41d4-a716-446655440014', 'Plan Weekend Trip', 'Research and book accommodations for weekend getaway', '660e8400-e29b-41d4-a716-446655440011', 0, '2025-02-28', ARRAY['travel', 'personal']),
  ('770e8400-e29b-41d4-a716-446655440015', 'Organize Home Office', 'Successfully reorganized and optimized home office workspace', '660e8400-e29b-41d4-a716-446655440012', 0, NULL, ARRAY['organization', 'completed']),
  ('770e8400-e29b-41d4-a716-446655440016', 'Read "Clean Code"', 'Finish reading Clean Code book and take notes on key concepts', '660e8400-e29b-41d4-a716-446655440010', 1, '2025-02-25', ARRAY['reading', 'learning']),
  ('770e8400-e29b-41d4-a716-446655440017', 'Update Resume', 'Update resume with recent projects and skills', '660e8400-e29b-41d4-a716-446655440010', 2, '2025-02-20', ARRAY['career', 'important'])
ON CONFLICT (id) DO NOTHING;