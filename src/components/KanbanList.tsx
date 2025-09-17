import React, { useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { List, Card } from '../types';
import KanbanCard from './KanbanCard';
import { Plus, MoreHorizontal, Edit3, Trash2 } from 'lucide-react';

interface KanbanListProps {
  list: List;
  cards: Card[];
  onUpdateList: (listId: string, updates: Partial<List>) => void;
  onDeleteList: (listId: string) => void;
  onCreateCard: (listId: string, title: string) => void;
  onUpdateCard: (cardId: string, updates: Partial<Card>) => void;
  onDeleteCard: (cardId: string) => void;
}

const KanbanList: React.FC<KanbanListProps> = ({
  list,
  cards,
  onUpdateList,
  onDeleteList,
  onCreateCard,
  onUpdateCard,
  onDeleteCard,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(list.title);
  const [showMenu, setShowMenu] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState('');

  const { setNodeRef } = useDroppable({
    id: list.id,
  });

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
    <div className="w-80 bg-white rounded-lg p-4 flex-shrink-0 flex flex-col shadow-lg">
      {/* List Header */}
      <div className="flex items-center justify-between mb-4 ">
        {isEditing ? (
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleSubmit}
            onKeyDown={handleKeyPress}
            className="flex-1 text-md font-semibold bg-white border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-[#72c02c] focus:border-transparent focus:outline-none"
            autoFocus
          />
        ) : (
          <h3 
            className="text-md font-semibold text-gray-800 cursor-pointer hover:bg-gray-200 px-2 py-1 rounded flex-1"
            onClick={() => setIsEditing(true)}
          >
            {list.title}
          </h3>
        )}

        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            className="p-1 hover:bg-gray-200 rounded transition-colors"
          >
            <MoreHorizontal className="w-4 h-4 text-gray-600" />
          </button>

          {showMenu && (
            <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-10 w-32">
              <button
                onClick={() => {
                  setIsEditing(true);
                  setShowMenu(false);
                }}
                className="w-full text-left text-sm px-2 py-2 hover:bg-gray-50 flex items-center space-x-2"
              >
                <Edit3 className="w-4 h-4" />
                <span>Edit title</span>
              </button>
              <button
                onClick={() => {
                  onDeleteList(list.id);
                  setShowMenu(false);
                }}
                className="w-full text-left text-sm px-2 py-2 hover:bg-red-50 text-red-600 flex items-center space-x-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete list</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Cards Container - Dynamic Height */}
      <div 
        ref={setNodeRef} 
        className="flex-1 space-y-3 overflow-y-auto"
        style={{
          maxHeight: `${Math.max(cards.length * 100, 40)}px`
        }}
      >
        <SortableContext items={cards.map(c => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              onUpdate={onUpdateCard}
              onDelete={onDeleteCard}
            />
          ))}
        </SortableContext>
      </div>

      {/* Add Card Input */}
      <div className="mt-3">
        <div className="relative">
          <input
            value={newCardTitle}
            onChange={(e) => setNewCardTitle(e.target.value)}
            onKeyDown={handleCardKeyPress}
            placeholder="Add a card..."
            className="w-full pl-2 pr-10 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#72c02c] focus:border-transparent text-sm focus:outline-none"
          />
          <button
            onClick={handleAddCard}
            className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-200 rounded"
            disabled={!newCardTitle.trim()}
            type="button"
          >
            <Plus className={`w-4 h-4 ${newCardTitle.trim() ? 'text-[#72c02c]' : 'text-gray-400'}`} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default KanbanList;