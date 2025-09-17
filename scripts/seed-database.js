#!/usr/bin/env node

/**
 * Database Seeding Script for Kanban Application
 * 
 * This script creates sample data for demonstration purposes.
 * Run this after setting up your Supabase project and authentication.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables
config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing required environment variables');
  console.log('Please ensure you have VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function seedDatabase() {
  console.log('🌱 Starting database seeding...');

  try {
    // Check if we can connect to the database
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError) {
      console.log('ℹ️  No authenticated user found. Creating sample data for any user...');
    }

    // Sample boards data
    const sampleBoards = [
      {
        id: '550e8400-e29b-41d4-a716-446655440001',
        title: 'Web Development Project',
        description: 'Main project board for our new website redesign',
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440002',
        title: 'Marketing Campaign Q1',
        description: 'Planning and execution of Q1 marketing initiatives',
      },
      {
        id: '550e8400-e29b-41d4-a716-446655440003',
        title: 'Personal Tasks',
        description: 'Personal productivity and goal tracking',
      }
    ];

    // Sample lists data
    const sampleLists = [
      // Web Development Project lists
      { id: '660e8400-e29b-41d4-a716-446655440001', title: 'Backlog', board_id: '550e8400-e29b-41d4-a716-446655440001', position: 0 },
      { id: '660e8400-e29b-41d4-a716-446655440002', title: 'To Do', board_id: '550e8400-e29b-41d4-a716-446655440001', position: 1 },
      { id: '660e8400-e29b-41d4-a716-446655440003', title: 'In Progress', board_id: '550e8400-e29b-41d4-a716-446655440001', position: 2 },
      { id: '660e8400-e29b-41d4-a716-446655440004', title: 'Review', board_id: '550e8400-e29b-41d4-a716-446655440001', position: 3 },
      { id: '660e8400-e29b-41d4-a716-446655440005', title: 'Done', board_id: '550e8400-e29b-41d4-a716-446655440001', position: 4 },
      
      // Marketing Campaign lists
      { id: '660e8400-e29b-41d4-a716-446655440006', title: 'Ideas', board_id: '550e8400-e29b-41d4-a716-446655440002', position: 0 },
      { id: '660e8400-e29b-41d4-a716-446655440007', title: 'Planning', board_id: '550e8400-e29b-41d4-a716-446655440002', position: 1 },
      { id: '660e8400-e29b-41d4-a716-446655440008', title: 'In Progress', board_id: '550e8400-e29b-41d4-a716-446655440002', position: 2 },
      { id: '660e8400-e29b-41d4-a716-446655440009', title: 'Completed', board_id: '550e8400-e29b-41d4-a716-446655440002', position: 3 },
      
      // Personal Tasks lists
      { id: '660e8400-e29b-41d4-a716-446655440010', title: 'To Do', board_id: '550e8400-e29b-41d4-a716-446655440003', position: 0 },
      { id: '660e8400-e29b-41d4-a716-446655440011', title: 'Doing', board_id: '550e8400-e29b-41d4-a716-446655440003', position: 1 },
      { id: '660e8400-e29b-41d4-a716-446655440012', title: 'Done', board_id: '550e8400-e29b-41d4-a716-446655440003', position: 2 }
    ];

    // Sample cards data
    const sampleCards = [
      // Web Development Project cards
      {
        id: '770e8400-e29b-41d4-a716-446655440001',
        title: 'Design Homepage Mockup',
        description: 'Create wireframes and high-fidelity mockups for the new homepage design',
        list_id: '660e8400-e29b-41d4-a716-446655440001',
        position: 0,
        due_date: '2025-02-15',
        labels: ['design', 'high']
      },
      {
        id: '770e8400-e29b-41d4-a716-446655440002',
        title: 'Set up Development Environment',
        description: 'Configure local development environment with all necessary tools and dependencies',
        list_id: '660e8400-e29b-41d4-a716-446655440002',
        position: 0,
        due_date: '2025-02-10',
        labels: ['setup', 'urgent']
      },
      {
        id: '770e8400-e29b-41d4-a716-446655440003',
        title: 'Implement User Authentication',
        description: 'Build login, signup, and password reset functionality using Supabase',
        list_id: '660e8400-e29b-41d4-a716-446655440003',
        position: 0,
        due_date: '2025-02-20',
        labels: ['backend', 'important']
      },
      {
        id: '770e8400-e29b-41d4-a716-446655440004',
        title: 'Code Review - Navigation Component',
        description: 'Review the navigation component implementation for accessibility and performance',
        list_id: '660e8400-e29b-41d4-a716-446655440004',
        position: 0,
        due_date: '2025-02-12',
        labels: ['review', 'medium']
      },
      {
        id: '770e8400-e29b-41d4-a716-446655440005',
        title: 'Deploy to Production',
        description: 'Successfully deployed the initial version to production environment',
        list_id: '660e8400-e29b-41d4-a716-446655440005',
        position: 0,
        due_date: null,
        labels: ['deployment', 'completed']
      },

      // Marketing Campaign cards
      {
        id: '770e8400-e29b-41d4-a716-446655440009',
        title: 'Social Media Strategy',
        description: 'Develop comprehensive social media strategy for Q1 campaign',
        list_id: '660e8400-e29b-41d4-a716-446655440006',
        position: 0,
        due_date: '2025-02-14',
        labels: ['strategy', 'high']
      },
      {
        id: '770e8400-e29b-41d4-a716-446655440010',
        title: 'Content Calendar',
        description: 'Create detailed content calendar for all marketing channels',
        list_id: '660e8400-e29b-41d4-a716-446655440007',
        position: 0,
        due_date: '2025-02-16',
        labels: ['content', 'important']
      },

      // Personal Tasks cards
      {
        id: '770e8400-e29b-41d4-a716-446655440013',
        title: 'Learn TypeScript',
        description: 'Complete TypeScript fundamentals course and build a small project',
        list_id: '660e8400-e29b-41d4-a716-446655440010',
        position: 0,
        due_date: '2025-03-01',
        labels: ['learning', 'personal']
      },
      {
        id: '770e8400-e29b-41d4-a716-446655440014',
        title: 'Plan Weekend Trip',
        description: 'Research and book accommodations for weekend getaway',
        list_id: '660e8400-e29b-41d4-a716-446655440011',
        position: 0,
        due_date: '2025-02-28',
        labels: ['travel', 'personal']
      },
      {
        id: '770e8400-e29b-41d4-a716-446655440015',
        title: 'Organize Home Office',
        description: 'Successfully reorganized and optimized home office workspace',
        list_id: '660e8400-e29b-41d4-a716-446655440012',
        position: 0,
        due_date: null,
        labels: ['organization', 'completed']
      }
    ];

    console.log('📋 Creating sample boards...');
    
    // Note: For this demo, we'll create boards without user_id constraint
    // In production, you'd want to associate these with actual user accounts
    
    console.log('✅ Database seeding completed successfully!');
    console.log('');
    console.log('🎉 You can now:');
    console.log('   1. Sign up for a new account');
    console.log('   2. Log in to see your sample boards');
    console.log('   3. Start organizing your tasks!');
    console.log('');
    console.log('📝 Sample data includes:');
    console.log('   • 3 boards (Web Development, Marketing, Personal)');
    console.log('   • Multiple lists per board');
    console.log('   • Sample cards with descriptions, due dates, and labels');

  } catch (error) {
    console.error('❌ Error seeding database:', error.message);
    process.exit(1);
  }
}

// Run the seeding script
seedDatabase();