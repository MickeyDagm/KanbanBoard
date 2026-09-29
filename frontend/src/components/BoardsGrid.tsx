import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import type { Board } from '../types';

interface BoardsGridProps {
  boards: Board[];
  canCreate?: boolean;
  onCreate?: () => void;
}

const BoardsGrid: React.FC<BoardsGridProps> = ({ boards, canCreate, onCreate }) => {
  const navigate = useNavigate();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
      {boards.map((board) => (
        <button
          key={board.id}
          onClick={() => navigate(`/boards/${board.id}`)}
          className="text-left bg-slate-100 rounded-xl border border-slate-200/90 shadow-sm hover:shadow-md hover:border-slate-300
                   transition-all overflow-hidden group focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        >
          <div className="h-14" style={{ backgroundColor: board.background }} />
          <div className="p-4">
            <h3 className="font-semibold text-slate-800 group-hover:text-blue-700 truncate">
              {board.title}
            </h3>
            {board.description && (
              <p className="text-sm text-slate-500 mt-1 line-clamp-2">{board.description}</p>
            )}
          </div>
        </button>
      ))}

      {canCreate && onCreate && (
        <button
          onClick={onCreate}
          className="h-[118px] bg-slate-100 border-2 border-dashed border-slate-300 rounded-xl flex
                   items-center justify-center gap-2 text-slate-500 hover:border-blue-400
                   hover:text-blue-600 hover:bg-blue-50/40 transition-all"
        >
          <Plus className="w-5 h-5" />
          <span className="font-medium">New board</span>
        </button>
      )}
    </div>
  );
};

export default BoardsGrid;
