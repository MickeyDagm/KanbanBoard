import React, { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card } from '../types';
import { Calendar, Edit3, Trash2, MoreHorizontal } from 'lucide-react';
import { format } from 'date-fns';

interface KanbanCardProps {
  card: Card;
  onUpdate: (cardId: string, updates: Partial<Card>) => void;
  onDelete: (cardId: string) => void;
}

const KanbanCard: React.FC<KanbanCardProps> = ({ card, onUpdate, onDelete }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const handleSave = () => {
    if (title.trim() !== card.title || description !== card.description) {
      onUpdate(card.id, {
        title: title.trim() || 'Untitled',
        description,
      });
    }
    setIsEditing(false);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === 'Escape') {
      setTitle(card.title);
      setDescription(card.description);
      setIsEditing(false);
    }
  };

  const getLabelColor = (label: string) => {
    const colors: { [key: string]: string } = {
      'urgent': 'bg-red-100 text-red-800',
      'important': 'bg-orange-100 text-orange-800',
      'low': 'bg-green-100 text-green-800',
      'medium': 'bg-yellow-100 text-yellow-800',
      'high': 'bg-red-100 text-red-800',
    };
    return colors[label.toLowerCase()] || 'bg-gray-100 text-gray-800';
  };

  if (isEditing) {
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full text-sm font-medium bg-transparent border-none outline-none focus:ring-0 p-0 mb-2"
          placeholder="Card title"
          autoFocus
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onKeyPress={handleKeyPress}
          className="w-full text-sm text-gray-600 bg-transparent border-none outline-none focus:ring-0 p-0 resize-none"
          placeholder="Add a description..."
          rows={3}
        />
        <div className="flex space-x-2 mt-3">
          <button
            onClick={handleSave}
            className="px-3 py-1 bg-[#72c02c] text-white text-xs rounded hover:bg-[#72c02c] transition-colors"
          >
            Save
          </button>
          <button
            onClick={() => {
              setTitle(card.title);
              setDescription(card.description);
              setIsEditing(false);
            }}
            className="px-3 py-1 bg-gray-300 text-gray-700 text-xs rounded hover:bg-gray-400 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`bg-white rounded-lg shadow-sm border border-gray-200 p-2 cursor-grab hover:shadow-md transition-shadow group ${
        isDragging ? 'opacity-50' : ''
      }`}
    >
      <div className="flex items-start justify-between">
        <h4 className="text-sm font-medium text-gray-900 flex-1 pr-2 ">
          {card.title}
        </h4>
        <div className="relative opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu(!showMenu);
            }}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
          >
            <MoreHorizontal className="w-3 h-3 text-gray-500" />
          </button>

          {showMenu && (
            <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20 w-36">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditing(true);
                  setShowMenu(false);
                }}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 flex items-center space-x-2 text-sm"
              >
                <Edit3 className="w-3 h-3" />
                <span>Edit</span>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(card.id);
                  setShowMenu(false);
                }}
                className="w-full text-left px-3 py-2 hover:bg-red-50 text-red-600 flex items-center space-x-2 text-sm"
              >
                <Trash2 className="w-3 h-3" />
                <span>Delete</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {card.description && (
        <p className="text-xs text-gray-600 mt-2 line-clamp-3">
          {card.description}
        </p>
      )}

      {/* Labels */}
      {card.labels && card.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {card.labels.map((label, index) => (
            <span
              key={index}
              className={`px-2 py-1 text-xs rounded-full ${getLabelColor(label)}`}
            >
              {label}
            </span>
          ))}
        </div>
      )}

      {/* Due Date */}
      {card.due_date && (
        <div className="flex items-center space-x-1 mt-3 text-xs text-gray-500">
          <Calendar className="w-3 h-3" />
          <span>{format(new Date(card.due_date), 'MMM d')}</span>
        </div>
      )}
    </div>
  );
};

export default KanbanCard;