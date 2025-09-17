import React, { useState, useEffect } from 'react';
import { DndContext, DragEndEvent, DragOverEvent, DragStartEvent, closestCorners } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { supabase } from '../lib/supabase';
import { Board as BoardType, List, Card, User } from '../types';
import KanbanList from './KanbanList';
import { Plus, Search, LogOut } from 'lucide-react';
import toast from 'react-hot-toast';
import CreateBoardModal from './CreateBoardModal';
import CreateListModal from './CreateListModal';
import favicon from '../assets/favicon.png';

interface BoardProps {
  user: User | null;
  signOut: () => Promise<void>;
}

const Board: React.FC<BoardProps> = ({ user, signOut }) => {
  const [lists, setLists] = useState<List[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [boards, setBoards] = useState<BoardType[]>([]);
  const [selectedBoard, setSelectedBoard] = useState<BoardType | null>(null);
  const [loading, setLoading] = useState(true);
  const [draggedCard, setDraggedCard] = useState<Card | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateBoardModal, setShowCreateBoardModal] = useState(false);
  const [showCreateListModal, setShowCreateListModal] = useState(false);

  useEffect(() => {
    if (!user) return;

    const fetchBoards = async () => {
      try {
        const { data, error } = await supabase
          .from('boards')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;
        setBoards(data || []);
      } catch (error) {
        toast.error('Failed to fetch boards');
      }
    };

    fetchBoards();

    const boardsSubscription = supabase
      .channel('boards-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'boards', filter: `user_id=eq.${user.id}` },
        (payload) => {
          console.log('Board subscription event:', payload);
          const newBoard = payload.new as BoardType;
          const oldBoard = payload.old as BoardType;

          if (payload.eventType === 'INSERT') {
            setBoards((prev) =>
              [...prev, newBoard].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
            );
          } else if (payload.eventType === 'UPDATE') {
            setBoards((prev) =>
              prev.map((board) => (board.id === newBoard.id ? newBoard : board))
            );
          } else if (payload.eventType === 'DELETE') {
            setBoards((prev) => prev.filter((board) => board.id !== oldBoard.id));
            if (selectedBoard?.id === oldBoard.id) {
              setSelectedBoard(null);
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('Boards subscription status:', status);
      });

    return () => {
      supabase.removeChannel(boardsSubscription);
    };
  }, [user, selectedBoard?.id]);

  useEffect(() => {
    if (!selectedBoard) {
      setLists([]);
      setCards([]);
      setLoading(false);
      return;
    }

    const fetchBoardData = async () => {
      try {
        const { data: listsData, error: listsError } = await supabase
          .from('lists')
          .select('*')
          .eq('board_id', selectedBoard.id)
          .order('position');

        if (listsError) throw listsError;

        const { data: cardsData, error: cardsError } = await supabase
          .from('cards')
          .select('*')
          .in('list_id', listsData?.map((list) => list.id) || [])
          .order('position');

        if (cardsError) throw cardsError;

        setLists(listsData || []);
        setCards(cardsData || []);
      } catch (error) {
        toast.error('Failed to load board data');
      } finally {
        setLoading(false);
      }
    };

    fetchBoardData();

    const listsSubscription = supabase
      .channel(`lists-changes-${selectedBoard.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'lists', filter: `board_id=eq.${selectedBoard.id}` },
        (payload) => {
          console.log('List subscription event:', payload);
          handleRealtimeListChange(payload);
        }
      )
      .subscribe((status) => {
        console.log('Lists subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log(`Subscribed to lists for board_id: ${selectedBoard.id}`);
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          console.error(`Lists subscription error: ${status}`);
        }
      });

    const cardsSubscription = supabase
      .channel(`cards-changes-${selectedBoard.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'cards' },
        (payload) => {
          console.log('Card subscription event:', payload);
          handleRealtimeCardChange(payload);
        }
      )
      .subscribe((status) => {
        console.log('Cards subscription status:', status);
      });

    return () => {
      supabase.removeChannel(listsSubscription);
      supabase.removeChannel(cardsSubscription);
    };
  }, [selectedBoard]);

  const handleRealtimeListChange = (payload: any) => {
    if (payload.eventType === 'INSERT') {
      console.log('Inserting new list:', payload.new);
      setLists((prev) => {
        if (prev.some((list) => list.id === payload.new.id)) return prev;
        return [...prev, payload.new].sort((a, b) => a.position - b.position);
      });
    } else if (payload.eventType === 'UPDATE') {
      setLists((prev) =>
        prev
          .map((list) => (list.id === payload.new.id ? payload.new : list))
          .sort((a, b) => a.position - b.position)
      );
    } else if (payload.eventType === 'DELETE') {
      setLists((prev) => prev.filter((list) => list.id !== payload.old.id));
    }
  };

  const handleRealtimeCardChange = (payload: any) => {
    if (payload.eventType === 'INSERT') {
      setCards((prev) => {
        if (prev.some((card) => card.id === payload.new.id)) return prev;
        return [...prev, payload.new].sort((a, b) => a.position - b.position);
      });
    } else if (payload.eventType === 'UPDATE') {
      setCards((prev) =>
        prev
          .map((card) => (card.id === payload.new.id ? payload.new : card))
          .sort((a, b) => a.position - b.position)
      );
    } else if (payload.eventType === 'DELETE') {
      setCards((prev) => prev.filter((card) => card.id !== payload.old.id));
    }
  };

  const createList = async (title: string) => {
    if (!title || !selectedBoard) return;

    const tempId = `temp-${Date.now()}`;
    const currentTime = new Date().toISOString();
    const newList: List = {
      id: tempId,
      title,
      board_id: selectedBoard.id,
      position: lists.length,
      created_at: currentTime,
      cards: [],
    };

    // Optimistically update the UI
    setLists((prev) => [...prev, newList].sort((a, b) => a.position - b.position));

    try {
      const { data, error } = await supabase
        .from('lists')
        .insert({
          title,
          board_id: selectedBoard.id,
          position: lists.length,
        })
        .select()
        .single();

      if (error) throw error;

      // Replace temp list with the actual one from Supabase
      setLists((prev) =>
        prev
          .map((list) => (list.id === tempId ? (data as List) : list))
          .sort((a, b) => a.position - b.position)
      );

      toast.success('List created successfully');
    } catch (error) {
      console.error('List creation error:', error);
      toast.error('Failed to create list');
      // Rollback optimistic update
      setLists((prev) => prev.filter((list) => list.id !== tempId));
    }
  };

  const updateList = async (listId: string, updates: Partial<List>) => {
    try {
      const { error } = await supabase.from('lists').update(updates).eq('id', listId);

      if (error) throw error;
    } catch (error) {
      toast.error('Failed to update list');
    }
  };

  const deleteList = async (listId: string) => {
    if (!confirm('Are you sure you want to delete this list and all its cards?')) return;

    try {
      const { error } = await supabase.from('lists').delete().eq('id', listId);

      if (error) throw error;
      toast.success('List deleted successfully');
    } catch (error) {
      toast.error('Failed to delete list');
    }
  };

  const createCard = async (listId: string, title: string) => {
    try {
      const listCards = cards.filter((card) => card.list_id === listId);
      const currentTime = new Date().toISOString();
      const newCard: Card = {
        title,
        list_id: listId,
        position: listCards.length,
        id: `temp-${Date.now()}`,
        description: '',
        labels: [],
        created_at: currentTime,
        updated_at: currentTime,
        due_date: undefined,
      };

      setCards((prev) => [...prev, newCard].sort((a, b) => a.position - b.position));

      const { data, error } = await supabase
        .from('cards')
        .insert({
          title,
          list_id: listId,
          position: listCards.length,
          description: '',
          labels: [],
        })
        .select()
        .single();

      if (error) throw error;

      setCards((prev) =>
        prev
          .map((card) => (card.id === newCard.id ? (data as Card) : card))
          .sort((a, b) => a.position - b.position)
      );

      toast.success('Card created successfully');
    } catch (error) {
      toast.error('Failed to create card');
      setCards((prev) => prev.filter((card) => card.id !== `temp-${Date.now()}`));
    }
  };

  const updateCard = async (cardId: string, updates: Partial<Card>) => {
    try {
      const { error } = await supabase.from('cards').update(updates).eq('id', cardId);

      if (error) throw error;
    } catch (error) {
      toast.error('Failed to update card');
    }
  };

  const deleteCard = async (cardId: string) => {
    if (!confirm('Are you sure you want to delete this card?')) return;

    try {
      const { error } = await supabase.from('cards').delete().eq('id', cardId);

      if (error) throw error;
      toast.success('Card deleted successfully');
    } catch (error) {
      toast.error('Failed to delete card');
    }
  };

  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const card = cards.find((c) => c.id === active.id);
    setDraggedCard(card || null);
  };

  const handleDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over || !draggedCard) return;

    const activeCard = cards.find((c) => c.id === active.id);
    if (!activeCard) return;

    const overId = String(over.id);

    if (lists.some((list) => list.id === overId)) {
      if (activeCard.list_id !== overId) {
        setCards((prev) => {
          const updatedCards = prev.map((card) => {
            if (card.id === activeCard.id) {
              return { ...card, list_id: overId, position: cards.filter((c) => c.list_id === overId).length };
            }
            return card;
          });
          const sourceCards = updatedCards
            .filter((c) => c.list_id === activeCard.list_id)
            .sort((a, b) => a.position - b.position)
            .map((card, index) => ({ ...card, position: index }));
          const targetCards = updatedCards
            .filter((c) => c.list_id === overId)
            .sort((a, b) => a.position - b.position)
            .map((card, index) => ({ ...card, position: index }));
          return [
            ...updatedCards.filter((c) => c.list_id !== activeCard.list_id && c.list_id !== overId),
            ...sourceCards,
            ...targetCards,
          ];
        });
      }
      return;
    }

    const overCard = cards.find((c) => c.id === overId);
    if (overCard && activeCard.id !== overCard.id) {
      const sourceListId = activeCard.list_id;
      const targetListId = overCard.list_id;

      setCards((prev) => {
        const updatedCards = prev.map((card) => {
          if (card.id === activeCard.id) {
            return { ...card, list_id: targetListId };
          }
          return card;
        });

        const sourceCards = updatedCards
          .filter((c) => c.list_id === sourceListId)
          .sort((a, b) => a.position - b.position)
          .map((card, index) => ({ ...card, position: index }));

        const targetCards = updatedCards
          .filter((c) => c.list_id === targetListId)
          .sort((a, b) => a.position - b.position);

        const overCardIndex = targetCards.findIndex((c) => c.id === overCard.id);
        const activeCardInTarget = targetCards.find((c) => c.id === activeCard.id);
        if (activeCardInTarget) {
          targetCards.splice(targetCards.indexOf(activeCardInTarget), 1);
        }
        targetCards.splice(overCardIndex, 0, { ...activeCard, list_id: targetListId });

        targetCards.forEach((card, index) => {
          card.position = index;
        });

        return [
          ...updatedCards.filter((c) => c.list_id !== sourceListId && c.list_id !== targetListId),
          ...sourceCards,
          ...targetCards,
        ];
      });
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setDraggedCard(null);

    if (!over) return;

    const activeCard = cards.find((c) => c.id === active.id);
    if (!activeCard) return;

    const overId = String(over.id);
    const newListId = lists.some((list) => list.id === overId) ? overId : activeCard.list_id;

    const updatedCards = cards
      .filter((c) => c.list_id === newListId)
      .sort((a, b) => a.position - b.position);

    try {
      await Promise.all(
        updatedCards.map((card, index) =>
          supabase.from('cards').update({ position: index, list_id: card.list_id }).eq('id', card.id)
        )
      );
    } catch (error) {
      toast.error('Failed to update card positions');
      const { data: listsData } = await supabase
        .from('lists')
        .select('*')
        .eq('board_id', selectedBoard?.id)
        .order('position');
      const { data: cardsData } = await supabase
        .from('cards')
        .select('*')
        .in('list_id', listsData?.map((list) => list.id) || [])
        .order('position');
      setLists(listsData || []);
      setCards(cardsData || []);
    }
  };

  const filteredCards = cards.filter((card) =>
    card.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (card.description && card.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const getListCards = (listId: string) => {
    return filteredCards.filter((card) => card.list_id === listId).sort((a, b) => a.position - b.position);
  };

  if (!user) return null;

  return (
    <div className="min-h-screen  flex flex-col bg-gray-100">
      {/* Main Header */}
      <div className="bg-white ">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-[#72c02c] rounded-lg flex items-center justify-center">
              <span className="text-white font-bold">K</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Task Manager</h1>
              <p className="text-sm text-gray-600">{user.email}</p>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search cards..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#72c02c] focus:border-transparent w-64"
              />
            </div>
            <button
              onClick={signOut}
              className="flex items-center space-x-2 px-4 py-2 text-gray-700 hover:bg-red-50 hover:text-red-600 rounded-lg transition-colors"
            >
              <LogOut className="w-5 h-5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>

        {/* Horizontal Boards */}
        <div className="overflow-x-auto  pt-4">
          <div className="flex space-x-2 pb-2">
            {boards.map((board) => (
              <button
                key={board.id}
                onClick={() => setSelectedBoard(board)}
                className={`flex-shrink-0 px-4 py-2 rounded-lg transition-colors hover:border-l-4 hover:border-[#72c02c] ${
                  selectedBoard?.id === board.id
                    ? 'bg-green-50 text-[#72c02c] border-l-4 border-[#72c02c]'
                    : 'hover:bg-gray-50 text-gray-700'
                }`}
              >
                <div className="font-medium truncate max-w-[150px]">{board.title}</div>
                {board.description && (
                  <div className="text-sm text-gray-500 truncate  max-w-[150px]">
                    {board.description}
                  </div>
                )}
              </button>
            ))}
            <button
              onClick={() => setShowCreateBoardModal(true)}
              className="flex-shrink-0 px-4 py-2 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>Create Board</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1">
        {selectedBoard ? (
          loading ? (
            <div className="flex-1 p-6">
              <div className="animate-pulse">
                <div className="h-8 bg-gray-200 rounded w-64 mb-6"></div>
                <div className="flex space-x-6">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="w-80 bg-gray-100 rounded-lg p-4">
                      <div className="h-6 bg-gray-200 rounded mb-4"></div>
                      <div className="space-y-3">
                        {[...Array(2)].map((_, j) => (
                          <div key={j} className="h-20 bg-gray-200 rounded"></div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 p-6">
              <DndContext
                collisionDetection={closestCorners}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
              >
                <div className="flex space-x-3 items-start">
                  <SortableContext items={lists.map((l) => l.id)} strategy={horizontalListSortingStrategy}>
                    {lists.map((list) => (
                      <KanbanList
                        key={list.id}
                        list={list}
                        cards={getListCards(list.id)}
                        onUpdateList={updateList}
                        onDeleteList={deleteList}
                        onCreateCard={createCard}
                        onUpdateCard={updateCard}
                        onDeleteCard={deleteCard}
                      />
                    ))}
                  </SortableContext>
                  <div className="flex-shrink-0">
                    <button
                      onClick={() => setShowCreateListModal(true)}
                      className="w-80 bg-gray-100 hover:bg-gray-200 text-gray-700 p-4 rounded-lg transition-colors flex items-center justify-center space-x-2 min-h-[120px]"
                    >
                      <Plus className="w-5 h-5" />
                      <span className="font-medium">Add another list</span>
                    </button>
                  </div>
                </div>
              </DndContext>
            </div>
          )
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-32 h-32 bg-white rounded-full flex items-center justify-center mx-auto mb-6">
                <img src={favicon} alt="logo" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Welcome to Task Manager</h2>
              <p className="text-gray-600 mb-8 max-w-md mx-auto">
                Select a board from the header to get started, or create a new board to organize your tasks.
              </p>
              <button
                onClick={() => setShowCreateBoardModal(true)}
                className="bg-[#72c02c] hover:bg-[#72c02c] text-white px-6 py-3 rounded-lg font-medium transition-colors"
              >
                Create Your First Board
              </button>
            </div>
          </div>
        )}
      </div>

      <CreateBoardModal
        isOpen={showCreateBoardModal}
        onClose={() => setShowCreateBoardModal(false)}
        onBoardCreated={(newBoard: BoardType) => {
          setBoards((prev) =>
            [...prev, newBoard].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          );
          setShowCreateBoardModal(false);
        }}
      />
      <CreateListModal
        isOpen={showCreateListModal}
        onClose={() => setShowCreateListModal(false)}
        onCreateList={createList}
        boardId={selectedBoard?.id}
      />
    </div>
  );
};

export default Board;