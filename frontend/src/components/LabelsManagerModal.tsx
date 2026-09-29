import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Trash2, X } from 'lucide-react';
import { labelsApi } from '../lib/api/cardsApi';
import { boardKey } from '../hooks/useBoardData';
import type { BoardDetail, Label } from '../types';

interface LabelsManagerModalProps {
  boardId: string;
  labels: Label[];
  onClose: () => void;
}

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#84cc16', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280',
];

const LabelsManagerModal: React.FC<LabelsManagerModalProps> = ({ boardId, labels, onClose }) => {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[6]);
  const [pending, setPending] = useState(false);

  // Realtime echoes are deduped for this tab — patch the board cache directly.
  const patchLabels = (fn: (old: Label[]) => Label[]) =>
    queryClient.setQueryData<BoardDetail>(boardKey(boardId), (old) => {
      if (!old) return old;
      const next = fn(old.labels);
      const byId = new Map(next.map((l) => [l.id, l]));
      return {
        ...old,
        labels: next,
        // keep embedded card copies in sync (rename/color/delete)
        cards: old.cards.map((c) => {
          const labels = c.labels.filter((l) => byId.has(l.id)).map((l) => byId.get(l.id)!);
          const changed =
            labels.length !== c.labels.length || labels.some((l, i) => l !== c.labels[i]);
          return changed ? { ...c, labels } : c;
        }),
      };
    });

  const fail = (e: unknown, fallback: string) =>
    toast.error(e instanceof Error && e.message ? e.message : fallback);

  const createLabel = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || pending) return;
    setPending(true);
    try {
      const { label } = await labelsApi.create(boardId, { name: trimmed, color });
      patchLabels((old) => [...old, label]);
      setName('');
    } catch (err) {
      fail(err, 'Could not create label');
    } finally {
      setPending(false);
    }
  };

  const renameLabel = async (label: Label, next: string) => {
    const trimmed = next.trim();
    if (!trimmed || trimmed === label.name) return;
    try {
      const { label: updated } = await labelsApi.update(label.id, { name: trimmed });
      patchLabels((old) => old.map((l) => (l.id === label.id ? updated : l)));
    } catch (e) {
      fail(e, 'Could not rename label');
    }
  };

  const recolorLabel = async (label: Label, nextColor: string) => {
    if (nextColor === label.color) return;
    try {
      const { label: updated } = await labelsApi.update(label.id, { color: nextColor });
      patchLabels((old) => old.map((l) => (l.id === label.id ? updated : l)));
    } catch (e) {
      fail(e, 'Could not update color');
    }
  };

  const deleteLabel = async (label: Label) => {
    if (!confirm(`Delete label "${label.name}"? It will be removed from all cards.`)) return;
    try {
      await labelsApi.remove(label.id);
      patchLabels((old) => old.filter((l) => l.id !== label.id));
    } catch (e) {
      fail(e, 'Could not delete label');
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-3 sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-800">Board labels</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <ul className="divide-y divide-slate-100 max-h-[50vh] overflow-y-auto">
          {labels.map((label) => (
            <li key={label.id} className="px-4 sm:px-5 py-3 flex items-center gap-2 group/l">
              <input
                type="color"
                value={label.color}
                onChange={(e) => recolorLabel(label, e.target.value)}
                className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent p-0"
                title="Change color"
                aria-label={`Color for ${label.name}`}
              />
              <input
                defaultValue={label.name}
                onBlur={(e) => {
                  if (e.target.value.trim() !== label.name) renameLabel(label, e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                }}
                className="flex-1 text-sm px-2 py-1.5 rounded bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500/30"
                aria-label={`Name of ${label.name}`}
              />
              <button
                onClick={() => deleteLabel(label)}
                className="p-1.5 rounded text-slate-400 hover:text-red-500 opacity-100 sm:opacity-0 sm:group-hover/l:opacity-100 transition-opacity"
                title="Delete label"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </li>
          ))}
          {labels.length === 0 && (
            <li className="px-5 py-6 text-sm text-slate-500 text-center">No labels yet.</li>
          )}
        </ul>

        <form onSubmit={createLabel} className="px-4 sm:px-5 py-3.5 sm:py-4 border-t border-slate-100 flex items-center gap-2">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-7 h-7 rounded cursor-pointer border-0 bg-transparent p-0 flex-shrink-0"
            aria-label="New label color"
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New label name…"
            maxLength={40}
            className="flex-1 text-sm px-3 py-2 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-blue-500/30"
          />
          <button
            type="submit"
            disabled={!name.trim() || pending}
            className="flex items-center gap-1 px-3 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
        </form>
      </div>
    </div>
  );
};

export default LabelsManagerModal;
