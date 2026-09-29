import React, { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Plus, Search, RefreshCw } from 'lucide-react';
import { ApiError } from '../lib/api';
import { useBoardData, useBoardMutations } from '../hooks/useBoardData';
import { useBoardRealtime } from '../hooks/useBoardRealtime';
import { List, Card } from '../types';
import KanbanList from '../components/KanbanList';
import CreateListModal from '../components/CreateListModal';
import TaskDetailModal from '../components/TaskDetailModal';
import ViewSwitcher, { type BoardView } from '../components/views/ViewSwitcher';
import ListView from '../components/views/ListView';
import TableView from '../components/views/TableView';
import CalendarView from '../components/views/CalendarView';

const VIEW_STORAGE_KEY = 'kanban.boardView';

const readStoredView = (): BoardView => {
  try {
    const saved = localStorage.getItem(VIEW_STORAGE_KEY);
    if (saved === 'list' || saved === 'table' || saved === 'calendar' || saved === 'board') {
      return saved;
    }
  } catch {
    /* localStorage unavailable */
  }
  return 'board';
};

const BoardPage: React.FC = () => {
  const { boardId: routeBoardId } = useParams<{ boardId: string }>();
  const boardId = routeBoardId ?? null;

  const [searchQuery, setSearchQuery] = useState('');
  const [view, setView] = useState<BoardView>(readStoredView);
  const [showCreateListModal, setShowCreateListModal] = useState(false);
  const [openCardId, setOpenCardId] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, view);
    } catch {
      /* localStorage unavailable */
    }
  }, [view]);

  const boardQuery = useBoardData(boardId);
  const detail = boardQuery.data;
  const board = detail?.board ?? null;
  const lists = detail?.lists ?? [];
  const cards = detail?.cards ?? [];

  const m = useBoardMutations(boardId);
  useBoardRealtime(boardId);

  const createList = (title: string) => {
    if (!title.trim() || !boardId) return;
    m.createList.mutate(title.trim());
  };

  const updateList = (listId: string, updates: Partial<List>) => {
    if (updates.title === undefined) return;
    m.updateList.mutate({ id: listId, title: updates.title });
  };

  const deleteList = (listId: string) => {
    if (!confirm('Are you sure you want to delete this list and all its cards?')) return;
    m.deleteList.mutate(listId);
  };

  const createCard = (listId: string, title: string) => {
    if (!title.trim()) return;
    m.createCard.mutate({ listId, title: title.trim() });
  };

  const filteredCards = cards.filter((card) =>
    card.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (card.description && card.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const getListCards = (listId: string) => {
    return filteredCards.filter((card) => card.listId === listId).sort((a, b) => a.position - b.position);
  };

  const updateCardPatch = (
    id: string,
    patch: Partial<Pick<Card, 'title' | 'description' | 'dueDate' | 'priority' | 'cover' | 'done'>>
  ) => {
    m.updateCard.mutate({ id, patch });
  };

  if (!boardId) return <Navigate to="/" replace />;

  if (boardQuery.isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="flex flex-col items-center space-y-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-600 text-sm">Loading board...</p>
        </div>
      </div>
    );
  }

  if (boardQuery.isError || !board || !detail) {
    const error = boardQuery.error;
    const is404 = error instanceof ApiError && error.status === 404;
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-bold text-slate-800 mb-2">
            {is404 ? 'Board not found' : 'Could not load board'}
          </h2>
          <p className="text-slate-600 mb-6 text-sm">
            {is404
              ? 'This board may have been deleted or you do not have permission to view it.'
              : error instanceof Error
              ? error.message
              : 'Unknown error'}
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => boardQuery.refetch()}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium text-sm transition-colors shadow-sm"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
            <Link to="/" className="text-slate-500 hover:text-slate-700 font-medium text-sm">
              All boards
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Toolbar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between gap-4 flex-shrink-0">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold text-slate-800 truncate tracking-tight">
            {board.title}
          </h1>
          {board.description && (
            <p className="text-xs text-slate-500 truncate">{board.description}</p>
          )}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          <ViewSwitcher value={view} onChange={setView} />
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg
                       text-sm focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/60
                       outline-none transition-all w-64 shadow-sm hover:shadow"
            />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6 md:p-8 flex-1 overflow-x-auto">
        {view === 'board' && (
          <div className="flex gap-4 items-start overflow-x-auto pb-6">
            {lists.map((list) => (
              <KanbanList
                key={list.id}
                list={list}
                cards={getListCards(list.id)}
                onUpdateList={updateList}
                onDeleteList={deleteList}
                onCreateCard={createCard}
                onOpenCard={setOpenCardId}
              />
            ))}

            <button
              onClick={() => setShowCreateListModal(true)}
              className="flex-shrink-0 w-80 h-[140px] bg-white border-2 border-dashed border-slate-300
                       rounded-2xl flex items-center justify-center gap-2 text-slate-500
                       hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/40
                       transition-all duration-200 shadow-sm hover:shadow"
            >
              <Plus className="w-5 h-5" />
              <span className="font-semibold text-sm">Add another list</span>
            </button>
          </div>
        )}

        {view === 'list' && (
          <ListView
            lists={lists}
            cards={filteredCards}
            onOpenCard={setOpenCardId}
            onUpdateCard={updateCardPatch}
          />
        )}

        {view === 'table' && (
          <TableView lists={lists} cards={filteredCards} onOpenCard={setOpenCardId} />
        )}

        {view === 'calendar' && (
          <CalendarView
            cards={filteredCards}
            onOpenCard={setOpenCardId}
            onUpdateCard={updateCardPatch}
          />
        )}
      </div>

      <CreateListModal
        isOpen={showCreateListModal}
        onClose={() => setShowCreateListModal(false)}
        onCreateList={createList}
        boardId={boardId ?? undefined}
      />

      {openCardId && (
        <TaskDetailModal
          cardId={openCardId}
          boardId={boardId}
          members={detail.members}
          myRole={detail.membership.role}
          onClose={() => setOpenCardId(null)}
        />
      )}
    </div>
  );
};

export default BoardPage;
