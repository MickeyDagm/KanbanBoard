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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Create New Board</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="title" className="block text-sm font-medium text-gray-700">
              Title
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#72c02c] focus:border-transparent"
              required
            />
          </div>
          <div className="mb-4">
            <label htmlFor="description" className="block text-sm font-medium text-gray-700">
              Description (optional)
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#72c02c] focus:border-transparent"
              rows={3}
            />
          </div>
          <div className="mb-4">
            <label htmlFor="board-team" className="block text-sm font-medium text-gray-700">
              Team
            </label>
            <select
              id="board-team"
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#72c02c] focus:border-transparent bg-white"
              disabled={noTeams}
            >
              {manageableTeams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
            {noTeams && (
              <p className="mt-1 text-sm text-red-600">
                You need an admin or owner role in a team to create boards.
              </p>
            )}
          </div>
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !title.trim() || !selectedTeamId}
              className={`px-4 py-2 bg-[#72c02c] text-white rounded-lg font-medium transition-colors ${
                loading || !title.trim() || !selectedTeamId
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:bg-[#5a9c23]'
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
