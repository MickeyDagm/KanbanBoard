import bcrypt from 'bcryptjs';
import { prisma } from '../src/lib/prisma.js';

const DEMO_EMAIL = 'demo@kanban.local';
const DEMO_PASSWORD = 'demo-password-123';

async function seed() {
  console.log('Seeding demo data...');

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: {},
    create: {
      email: DEMO_EMAIL,
      passwordHash,
      name: 'Demo User',
      avatarColor: '#3b82f6',
    },
  });

  let team = await prisma.team.findFirst({
    where: { name: 'Demo Team', createdById: user.id },
  });
  if (!team) {
    team = await prisma.team.create({
      data: {
        name: 'Demo Team',
        createdById: user.id,
        members: { create: { userId: user.id, role: 'OWNER' } },
      },
    });
  }

  let board = await prisma.board.findFirst({
    where: { teamId: team.id, title: 'Web Development Project' },
  });
  if (!board) {
    board = await prisma.board.create({
      data: {
        teamId: team.id,
        title: 'Web Development Project',
        description: 'Main project board for the website redesign',
        createdById: user.id,
      },
    });

    const listTitles = ['Backlog', 'To Do', 'In Progress', 'Review', 'Done'];
    const lists = [];
    for (let i = 0; i < listTitles.length; i++) {
      lists.push(
        await prisma.list.create({
          data: { boardId: board.id, title: listTitles[i], position: i },
        })
      );
    }

    const cards: { title: string; description: string; list: number; due?: string }[] = [
      {
        title: 'Design Homepage Mockup',
        description: 'Create wireframes and high-fidelity mockups for the new homepage',
        list: 0,
        due: '2026-10-15',
      },
      {
        title: 'Set up Development Environment',
        description: 'Configure local dev environment with all necessary tools',
        list: 1,
        due: '2026-10-10',
      },
      {
        title: 'Implement User Authentication',
        description: 'Build login, signup and session handling',
        list: 2,
        due: '2026-10-20',
      },
      {
        title: 'Deploy to Production',
        description: 'Ship the initial version',
        list: 4,
      },
    ];

    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      await prisma.card.create({
        data: {
          listId: lists[c.list].id,
          title: c.title,
          description: c.description,
          position: i,
          dueDate: c.due ? new Date(c.due) : null,
          createdById: user.id,
        },
      });
    }

    console.log(`Created board "${board.title}" with ${lists.length} lists and ${cards.length} cards`);
  } else {
    console.log('Demo board already exists, skipping');
  }

  console.log(`Done. Login → ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

seed()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
