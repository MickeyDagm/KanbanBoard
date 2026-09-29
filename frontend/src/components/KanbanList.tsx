import React, { useState } from 'react';
import { List, Card } from '../types';
import KanbanCard from './KanbanCard';
import { Plus, MoreHorizontal, Edit3, Trash2 } from 'lucide-react';

interface KanbanListProps {
  list: List;
  cards: Card[];
  onUpdateList: (listId: string, updates: Partial<List>) => void;
  onDeleteList: (listId: string) => void;
  onCreateCard: (listId: string, title: string) => void;
  onOpenCard: (cardId: string) => void;
}

const KanbanList: React.FC<KanbanListProps> = ({
  list,
  cards,
  onUpdateList,
  onDeleteList,
  onCreateCard,
  onOpenCard,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(list.title);
  const [showMenu, setShowMenu] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState('');

  const handleTitleSubmit = () => {
    if (title.trim() && title !== list.title) {
      onUpdateList(list.id, { title: title.trim() });
    }
    setIsEditing(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTitleSubmit();
    } else if (e.key === 'Escape') {
      setTitle(list.title);
      setIsEditing(false);
    }
  };

  const handleAddCard = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault();
    if (newCardTitle.trim()) {
      onCreateCard(list.id, newCardTitle.trim());
      setNewCardTitle('');
    }
  };

  const handleCardKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddCard(e);
    }
  };

  return (
    <div className="w-80 bg-slate-100/90 border border-slate-200/80 rounded-2xl p-3.5 flex-shrink-0 flex flex-col shadow-sm">
      {/* List Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        {isEditing ? (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleSubmit}
            onKeyDown={handleKeyPress}
            className="flex-1 text-sm font-semibold bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 focus:outline-none shadow-sm"
            autoFocus
          />
        ) : (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <h3
              className="text-sm font-semibold text-slate-800 truncate cursor-pointer hover:bg-slate-200/70 px-2 py-1 rounded-lg transition-colors"
              onClick={() => setIsEditing(true)}
              title="Click to rename"
            >
              {list.title}
            </h3>
            <span className="text-xs font-semibold text-slate-500 bg-slate-200/70 px-2 py-0.5 rounded-full flex-shrink-0">
              {cards.length}
            </span>
          </div>
        )}

        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1.5 hover:bg-slate-200/70 text-slate-500 hover:text-slate-700 rounded-lg transition-colors"
            title="List actions"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>

          {showMenu && (
            <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-lg border border-slate-200 py-1.5 z-10 w-36 ring-1 ring-slate-900/5">
              <button
                onClick={() => {
                  setIsEditing(true);
                  setShowMenu(false);
                }}
                className="w-full text-left text-xs font-medium px-3 py-2 hover:bg-slate-50 text-slate-700 flex items-center space-x-2 transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5 text-slate-500" />
                <span>Edit title</span>
              </button>
              <button
                onClick={() => {
                  onDeleteList(list.id);
                  setShowMenu(false);
                }}
                className="w-full text-left text-xs font-medium px-3 py-2 hover:bg-red-50 text-red-600 flex items-center space-x-2 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-500" />
                <span>Delete list</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Cards Container */}
      <div className="flex-1 space-y-2.5 overflow-y-auto px-0.5 min-h-[80px] max-h-[calc(100vh-280px)]">
        {cards.map((card) => (
          <KanbanCard key={card.id} card={card} onOpen={onOpenCard} />
        ))}
        {cards.length === 0 && (
          <div className="h-20 flex flex-col items-center justify-center border-2 border-dashed border-slate-200/90 rounded-xl text-xs text-slate-400 font-medium select-none">
            No cards yet
          </div>
        )}
      </div>

      {/* Add Card Input */}
      <div className="mt-3 pt-1">
        <div className="relative">
          <input
            value={newCardTitle}
            onChange={(e) => setNewCardTitle(e.target.value)}
            onKeyDown={handleCardKeyPress}
            placeholder="Add a card..."
            className="w-full pl-3 pr-10 py-2 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 text-sm focus:outline-none transition-all shadow-sm"
          />
          <button
            onClick={handleAddCard}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 hover:bg-blue-50 text-slate-400 hover:text-blue-600 rounded-lg transition-colors disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-slate-400"
            disabled={!newCardTitle.trim()}
            type="button"
          >
            <Plus className={`w-4 h-4 ${newCardTitle.trim() ? 'text-blue-600' : 'text-slate-400'}`} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default KanbanList;