import React, { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { boardsApi } from '../lib/api/boardsApi';
import { teamsApi } from '../lib/api/teamsApi';
import { Board, hasRole } from '../types';

interface CreateBoardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBoardCreated: (newBoard: Board) => void;
  preselectedTeamId?: string;
}

const CreateBoardModal: React.FC<CreateBoardModalProps> = ({
  isOpen,
  onClose,
  onBoardCreated,
  preselectedTeamId,
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState('');

  const teamsQuery = useQuery({
    queryKey: ['teams'],
    queryFn: () => teamsApi.list(),
    enabled: isOpen,
  });

  // Board creation requires ADMIN+ on the team — only offer those.
  const manageableTeams = (teamsQuery.data?.teams ?? []).filter((t) => hasRole(t.role, 'ADMIN'));

  useEffect(() => {
    if (!isOpen) return;
    setSelectedTeamId(
      preselectedTeamId && manageableTeams.some((t) => t.id === preselectedTeamId)
        ? preselectedTeamId
        : (manageableTeams[0]?.id ?? '')
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, preselectedTeamId, teamsQuery.data]);

  const createBoard = useMutation({
    mutationFn: () => {
      if (!selectedTeamId) throw new Error('No team available');
      return boardsApi.create({
        teamId: selectedTeamId,
        title: title.trim(),
        description: description || null,
      });
    },
    onSuccess: ({ board }) => {
      toast.success('Board created successfully');
      setTitle('');
      setDescription('');
      onBoardCreated(board);
      onClose();
    },
    onError: (error) => {
      toast.error(
        error instanceof Error && error.message ? error.message : 'Failed to create board'
      );
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (!selectedTeamId) {
      toast.error('You need an admin role in a team to create boards');
      return;
    }
    createBoard.mutate();
  };

  if (!isOpen) return null;

  const loading = createBoard.isPending;
  const noTeams = teamsQuery.isSuccess && manageableTeams.length === 0;

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4">
      <div className="bg-slate-100 border border-slate-200/90 rounded-2xl p-5 sm:p-6 w-full max-w-md shadow-2xl ring-1 ring-slate-900/5">
        <h2 className="text-xl font-bold text-slate-900 mb-4">Create New Board</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="title" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Title
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none transition-all shadow-sm"
              required
            />
          </div>
          <div className="mb-4">
            <label htmlFor="description" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Description (optional)
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none transition-all shadow-sm"
              rows={3}
            />
          </div>
          <div className="mb-5">
            <label htmlFor="board-team" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Team
            </label>
            <select
              id="board-team"
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 bg-white text-slate-900 text-sm outline-none transition-all shadow-sm"
              disabled={noTeams}
            >
              {manageableTeams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
            {noTeams && (
              <p className="mt-1.5 text-xs text-red-600">
                You need an admin or owner role in a team to create boards.
              </p>
            )}
          </div>
          <div className="flex justify-end space-x-3 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-200 rounded-xl font-medium transition-colors"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !title.trim() || !selectedTeamId}
              className={`px-4 py-2 text-sm bg-blue-600 text-white rounded-xl font-medium shadow-sm transition-colors ${
                loading || !title.trim() || !selectedTeamId
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:bg-blue-700'
              }`}
            >
              {loading ? 'Creating...' : 'Create Board'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateBoardModal;
