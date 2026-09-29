import React, { useEffect, useState } from 'react';
import { DndContext, DragEndEvent, DragOverEvent, DragStartEvent, closestCorners } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Plus, Search, RefreshCw, Tags } from 'lucide-react';
import { ApiError } from '../lib/api';
import { useBoardData, useBoardMutations } from '../hooks/useBoardData';
import { useBoardRealtime } from '../hooks/useBoardRealtime';
import { List, Card, hasRole } from '../types';
import KanbanList from '../components/KanbanList';
import CreateListModal from '../components/CreateListModal';
import TaskDetailModal from '../components/TaskDetailModal';
import LabelsManagerModal from '../components/LabelsManagerModal';
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
  const [showLabelsModal, setShowLabelsModal] = useState(false);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [draggedCard, setDraggedCard] = useState<Card | null>(null);
  // Local mirror of the card list used only while a drag is in progress, so
  // drag handlers can shuffle positions freely without touching the query cache.
  const [dragCards, setDragCards] = useState<Card[] | null>(null);

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
  const cards = dragCards ?? detail?.cards ?? [];

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

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const card = cards.find((c) => c.id === active.id);
    setDraggedCard(card || null);
    setDragCards(detail?.cards ?? []);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || !draggedCard || !dragCards) return;

    const activeCard = dragCards.find((c) => c.id === active.id);
    if (!activeCard) return;

    const overId = String(over.id);

    if (lists.some((list) => list.id === overId)) {
      if (activeCard.listId !== overId) {
        setDragCards((prev) => {
          const prevCards = prev ?? [];
          const updatedCards = prevCards.map((card) => {
            if (card.id === activeCard.id) {
              return {
                ...card,
                listId: overId,
                position: prevCards.filter((c) => c.listId === overId).length,
              };
            }
            return card;
          });
          const sourceCards = updatedCards
            .filter((c) => c.listId === activeCard.listId)
            .sort((a, b) => a.position - b.position)
            .map((card, index) => ({ ...card, position: index }));
          const targetCards = updatedCards
            .filter((c) => c.listId === overId)
            .sort((a, b) => a.position - b.position)
            .map((card, index) => ({ ...card, position: index }));
          return [
            ...updatedCards.filter((c) => c.listId !== activeCard.listId && c.listId !== overId),
            ...sourceCards,
            ...targetCards,
          ];
        });
      }
      return;
    }

    const overCard = dragCards.find((c) => c.id === overId);
    if (overCard && activeCard.id !== overCard.id) {
      const sourceListId = activeCard.listId;
      const targetListId = overCard.listId;

      setDragCards((prev) => {
        const prevCards = prev ?? [];
        const updatedCards = prevCards.map((card) => {
          if (card.id === activeCard.id) {
            return { ...card, listId: targetListId };
          }
          return card;
        });

        const sourceCards = updatedCards
          .filter((c) => c.listId === sourceListId)
          .sort((a, b) => a.position - b.position)
          .map((card, index) => ({ ...card, position: index }));

        const targetCards = updatedCards
          .filter((c) => c.listId === targetListId)
          .sort((a, b) => a.position - b.position);

        const overCardIndex = targetCards.findIndex((c) => c.id === overCard.id);
        const activeCardInTarget = targetCards.find((c) => c.id === activeCard.id);
        if (activeCardInTarget) {
          targetCards.splice(targetCards.indexOf(activeCardInTarget), 1);
        }
        targetCards.splice(overCardIndex, 0, { ...activeCard, listId: targetListId });

        targetCards.forEach((card, index) => {
          card.position = index;
        });

        return [
          ...updatedCards.filter((c) => c.listId !== sourceListId && c.listId !== targetListId),
          ...sourceCards,
          ...targetCards,
        ];
      });
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setDraggedCard(null);

    const finalCards = dragCards;
    setDragCards(null);

    if (!over || !finalCards || !boardId) return;

    const activeCard = finalCards.find((c) => c.id === active.id);
    if (!activeCard) return;

    const overId = String(over.id);
    const overIsList = lists.some((list) => list.id === overId);

    const persist = (listId: string, index: number, settled: Card[]) => {
      m.applyCards(settled);
      m.moveCard.mutate({ cardId: activeCard.id, listId, index });
    };

    if (overIsList && overId !== activeCard.listId) {
      // Safety net: dropped straight onto a different list container.
      const othersInTarget = finalCards.filter((c) => c.listId === overId);
      const settled = finalCards.map((c) =>
        c.id === activeCard.id ? { ...c, listId: overId, position: othersInTarget.length } : c
      );
      persist(overId, othersInTarget.length, settled);
      return;
    }

    // Same list (dropped on the list container or on a card): dragOver has
    // already normalized positions locally — find where the card ended up.
    const targetListId = activeCard.listId;
    const ordered = finalCards
      .filter((c) => c.listId === targetListId)
      .sort((a, b) => a.position - b.position);
    const index = ordered.findIndex((c) => c.id === activeCard.id);

    persist(targetListId, Math.max(index, 0), finalCards);
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
    patch: Partial<Pick<Card, 'title' | 'description' | 'dueDate' | 'priority' | 'cover'>>
  ) => {
    m.updateCard.mutate({ id, patch });
  };

  if (!boardId) return <Navigate to="/" replace />;

  if (boardQuery.isLoading) {
    return (
      <div className="p-6 md:p-8">
        <div className="animate-pulse space-y-8">
          <div className="h-8 bg-slate-200 rounded w-64"></div>
          <div className="flex gap-6">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="w-80 bg-white rounded-xl p-5 shadow-sm">
                <div className="h-6 bg-slate-200 rounded mb-5"></div>
                <div className="space-y-4">
                  {[...Array(2)].map((_, j) => (
                    <div key={j} className="h-24 bg-slate-100 rounded-lg"></div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (boardQuery.isError || !board || !detail) {
    const notFound = boardQuery.error instanceof ApiError && boardQuery.error.status === 404;
    if (notFound) return <Navigate to="/" replace />;
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-semibold text-slate-800 mb-2">Failed to load board</h2>
          <p className="text-slate-600 mb-6">
            {boardQuery.error instanceof Error ? boardQuery.error.message : 'Something went wrong.'}
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => boardQuery.refetch()}
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium shadow transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              Retry
            </button>
            <Link to="/" className="text-slate-500 hover:text-slate-700 font-medium">
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
          {hasRole(detail.membership.role, 'ADMIN') && (
            <button
              onClick={() => setShowLabelsModal(true)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 border border-slate-200 px-3 py-2 rounded-lg hover:bg-slate-50 hover:text-slate-800 transition-colors"
            >
              <Tags className="w-4 h-4" />
              Labels
            </button>
          )}
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
      <div className="p-6 md:p-8 flex-1">
        {view === 'board' && (
          <DndContext
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragOver={handleDragOver}
          >
            <div className="flex gap-4 items-start overflow-x-auto pb-6">
              <SortableContext items={lists.map((l) => l.id)} strategy={horizontalListSortingStrategy}>
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
              </SortableContext>

              <button
                onClick={() => setShowCreateListModal(true)}
                className="flex-shrink-0 w-80 h-[140px] bg-white border-2 border-dashed border-slate-300
                         rounded-xl flex items-center justify-center gap-2 text-slate-500
                         hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/40
                         transition-all duration-200 shadow-sm hover:shadow"
              >
                <Plus className="w-5 h-5" />
                <span className="font-medium">Add another list</span>
              </button>
            </div>
          </DndContext>
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

      {showLabelsModal && (
        <LabelsManagerModal
          boardId={boardId}
          labels={detail.labels}
          onClose={() => setShowLabelsModal(false)}
        />
      )}

      {openCardId && (
        <TaskDetailModal
          cardId={openCardId}
          boardId={boardId}
          members={detail.members}
          boardLabels={detail.labels}
          myRole={detail.membership.role}
          onClose={() => setOpenCardId(null)}
        />
      )}
    </div>
  );
};

export default BoardPage;
