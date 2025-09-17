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
    } catch (error) {
      toast.error('Failed to create list');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Create New List</h2>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="title" className="block text-sm font-medium text-gray-700">
              List Title
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#72c02c] focus:border-transparent"
              placeholder="Enter list title"
              required
            />
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
              disabled={loading}
              className={`px-4 py-2 bg-[#72c02c] text-white rounded-lg font-medium transition-colors ${
                loading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-[#5a9c23]'
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