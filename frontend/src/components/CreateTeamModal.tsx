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
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4">
      <div className="bg-slate-100 border border-slate-200/90 rounded-2xl p-5 sm:p-6 w-full max-w-md shadow-2xl ring-1 ring-slate-900/5">
        <h2 className="text-xl font-bold text-slate-900 mb-4">Create Team</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) createTeam.mutate();
          }}
        >
          <div className="mb-5">
            <label htmlFor="team-name" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Team name
            </label>
            <input
              id="team-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none transition-all shadow-sm"
              placeholder="e.g. Marketing"
              required
              maxLength={60}
              autoFocus
            />
          </div>
          <div className="flex justify-end space-x-3 pt-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-700 hover:bg-slate-200 rounded-xl font-medium transition-colors"
              disabled={createTeam.isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createTeam.isPending || !name.trim()}
              className={`px-4 py-2 text-sm bg-blue-600 text-white rounded-xl font-medium shadow-sm transition-colors ${
                createTeam.isPending || !name.trim()
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:bg-blue-700'
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
