import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, LogOut, Home } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTeamRealtime } from '../hooks/useTeamRealtime';
import { teamsApi } from '../lib/api/teamsApi';
import { boardsApi } from '../lib/api/boardsApi';
import { hasRole } from '../types';
import CreateBoardModal from './CreateBoardModal';
import CreateTeamModal from './CreateTeamModal';
import NotificationsBell from './NotificationsBell';

const AppShell: React.FC = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  useTeamRealtime();

  const teamsQuery = useQuery({ queryKey: ['teams'], queryFn: () => teamsApi.list() });
  const boardsQuery = useQuery({ queryKey: ['boards'], queryFn: () => boardsApi.list() });

  const teams = teamsQuery.data?.teams ?? [];
  const boards = boardsQuery.data?.boards ?? [];

  // null = closed; string = open preselected to that team
  const [createBoardFor, setCreateBoardFor] = useState<string | null | undefined>(undefined);
  const [showCreateTeam, setShowCreateTeam] = useState(false);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `block truncate rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
      isActive
        ? 'bg-blue-600/20 text-white font-medium'
        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
    }`;

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* ──────────────── Sidebar ──────────────── */}
      <aside className="w-64 bg-slate-900 text-slate-200 flex flex-col border-r border-slate-800">
        <div className="px-4 py-4 flex items-center gap-2.5 border-b border-slate-800">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold">K</span>
          </div>
          <span className="font-semibold text-white tracking-tight">Task Manager</span>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          <NavLink to="/" end className={linkClass}>
            <span className="flex items-center gap-2">
              <Home className="w-4 h-4 flex-shrink-0" />
              All boards
            </span>
          </NavLink>

          <div className="pt-4 pb-1 px-2.5 text-xs font-semibold uppercase text-slate-500">
            Teams
          </div>

          {teams.map((team) => {
            const teamBoards = boards.filter((b) => b.teamId === team.id);
            const canManage = hasRole(team.role, 'ADMIN');
            return (
              <div key={team.id}>
                <div className="flex items-center group/t rounded-lg hover:bg-slate-800">
                  <NavLink
                    to={`/teams/${team.id}`}
                    className={({ isActive }) =>
                      `flex-1 min-w-0 truncate rounded-l-lg px-2.5 py-1.5 text-sm transition-colors ${
                        isActive
                          ? 'bg-blue-600/20 text-white font-medium'
                          : 'text-slate-300 hover:text-white'
                      }`
                    }
                    title={team.name}
                  >
                    {team.name}
                  </NavLink>
                  {canManage && (
                    <button
                      onClick={() => setCreateBoardFor(team.id)}
                      title="New board in this team"
                      className="p-1.5 mr-1 rounded-md opacity-0 group-hover/t:opacity-100 text-slate-400 hover:text-white hover:bg-slate-700 transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {teamBoards.map((board) => (
                  <NavLink
                    key={board.id}
                    to={`/boards/${board.id}`}
                    className={({ isActive }) =>
                      `${linkClass({ isActive })} pl-6`
                    }
                    title={board.title}
                  >
                    {board.title}
                  </NavLink>
                ))}
                {teamBoards.length === 0 && (
                  <div className="pl-6 py-1 text-xs text-slate-600 select-none">No boards</div>
                )}
              </div>
            );
          })}

          <button
            onClick={() => setShowCreateTeam(true)}
            className="w-full flex items-center gap-1.5 px-2.5 py-1.5 mt-1 text-sm text-slate-400
                     hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New team
          </button>
        </nav>

        {user && (
          <div className="border-t border-slate-800 p-3 flex items-center gap-2.5">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
              style={{ backgroundColor: user.avatarColor }}
            >
              {user.name?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">{user.name}</div>
              <div className="text-xs text-slate-400 truncate">{user.email}</div>
            </div>
            <NotificationsBell />
            <button
              onClick={signOut}
              title="Sign out"
              className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </aside>

      {/* ──────────────── Main ──────────────── */}
      <main className="flex-1 min-w-0 flex flex-col overflow-x-auto">
        <Outlet />
      </main>

      <CreateBoardModal
        isOpen={createBoardFor !== undefined}
        preselectedTeamId={typeof createBoardFor === 'string' ? createBoardFor : undefined}
        onClose={() => setCreateBoardFor(undefined)}
        onBoardCreated={(board) => {
          navigate(`/boards/${board.id}`);
        }}
      />
      <CreateTeamModal
        isOpen={showCreateTeam}
        onClose={() => setShowCreateTeam(false)}
        onTeamCreated={(team) => navigate(`/teams/${team.id}`)}
      />
    </div>
  );
};

export default AppShell;
