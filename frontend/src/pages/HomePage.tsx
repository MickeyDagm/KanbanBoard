import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { boardsApi } from '../lib/api/boardsApi';
import { teamsApi } from '../lib/api/teamsApi';
import { hasRole } from '../types';
import BoardsGrid from '../components/BoardsGrid';
import CreateBoardModal from '../components/CreateBoardModal';

const HomePage: React.FC = () => {
  const [showCreateBoard, setShowCreateBoard] = useState(false);

  const boardsQuery = useQuery({ queryKey: ['boards'], queryFn: () => boardsApi.list() });
  const teamsQuery = useQuery({ queryKey: ['teams'], queryFn: () => teamsApi.list() });

  const boards = boardsQuery.data?.boards ?? [];
  const canCreate = (teamsQuery.data?.teams ?? []).some((t) => hasRole(t.role, 'ADMIN'));

  return (
    <div className="p-6 md:p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">All boards</h1>
          <p className="text-sm text-slate-500 mt-1">
            {boards.length === 1 ? '1 board' : `${boards.length} boards`} across your teams
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowCreateBoard(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2.5
                     rounded-lg font-medium shadow-sm transition-all"
          >
            <Plus className="w-4 h-4" />
            New board
          </button>
        )}
      </div>

      {boardsQuery.isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-[118px] bg-slate-100 rounded-xl border border-slate-200/90 animate-pulse" />
          ))}
        </div>
      ) : boards.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-slate-600 mb-4">No boards yet.</p>
          {canCreate && (
            <button
              onClick={() => setShowCreateBoard(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium shadow"
            >
              Create your first board
            </button>
          )}
        </div>
      ) : (
        <BoardsGrid boards={boards} canCreate={canCreate} onCreate={() => setShowCreateBoard(true)} />
      )}

      <CreateBoardModal
        isOpen={showCreateBoard}
        onClose={() => setShowCreateBoard(false)}
        onBoardCreated={() => undefined}
      />
    </div>
  );
};

export default HomePage;
