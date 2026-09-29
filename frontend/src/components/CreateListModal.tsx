import React, { useState } from 'react';
import toast from 'react-hot-toast';

interface CreateListModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateList: (title: string) => void;
  boardId: string | undefined;
}

const CreateListModal: React.FC<CreateListModalProps> = ({ isOpen, onClose, onCreateList, boardId }) => {
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Please enter a list title');
      return;
    }
    if (!boardId) {
      toast.error('No board selected');
      return;
    }

    setLoading(true);
    try {
      await onCreateList(title.trim());
      setTitle('');
      onClose();
    } catch {
      toast.error('Failed to create list');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4">
      <div className="bg-slate-100 border border-slate-200/90 rounded-2xl p-5 sm:p-6 w-full max-w-md shadow-2xl ring-1 ring-slate-900/5">
        <h2 className="text-xl font-bold text-slate-900 mb-4">Create New List</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-5">
            <label htmlFor="title" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              List Title
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 outline-none transition-all shadow-sm"
              placeholder="e.g. In Progress"
              required
              autoFocus
            />
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
              disabled={loading || !title.trim()}
              className={`px-4 py-2 text-sm bg-blue-600 text-white rounded-xl font-medium shadow-sm transition-colors ${
                loading || !title.trim() ? 'opacity-50 cursor-not-allowed' : 'hover:bg-blue-700'
              }`}
            >
              {loading ? 'Creating...' : 'Create List'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateListModal;