import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { teamsApi } from '../lib/api/teamsApi';
import type { Team } from '../types';

interface CreateTeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTeamCreated?: (team: Team) => void;
}

const CreateTeamModal: React.FC<CreateTeamModalProps> = ({ isOpen, onClose, onTeamCreated }) => {
  const [name, setName] = useState('');
  const queryClient = useQueryClient();

  const createTeam = useMutation({
    mutationFn: () => teamsApi.create(name.trim()),
    onSuccess: ({ team }) => {
      toast.success(`Team "${team.name}" created`);
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      setName('');
      onTeamCreated?.(team);
      onClose();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to create team');
    },
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Create Team</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) createTeam.mutate();
          }}
        >
          <div className="mb-4">
            <label htmlFor="team-name" className="block text-sm font-medium text-gray-700">
              Team name
            </label>
            <input
              id="team-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#72c02c] focus:border-transparent"
              placeholder="e.g. Marketing"
              required
              maxLength={60}
              autoFocus
            />
          </div>
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              disabled={createTeam.isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createTeam.isPending || !name.trim()}
              className={`px-4 py-2 bg-[#72c02c] text-white rounded-lg font-medium transition-colors ${
                createTeam.isPending || !name.trim()
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:bg-[#5a9c23]'
              }`}
            >
              {createTeam.isPending ? 'Creating...' : 'Create Team'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateTeamModal;
