import React from 'react';
import { CalendarDays, LayoutGrid, List as ListIcon, Table2 } from 'lucide-react';

export type BoardView = 'board' | 'list' | 'table' | 'calendar';

const VIEWS: { key: BoardView; label: string; icon: React.ReactNode }[] = [
  { key: 'board', label: 'Board', icon: <LayoutGrid className="w-4 h-4" /> },
  { key: 'list', label: 'List', icon: <ListIcon className="w-4 h-4" /> },
  { key: 'table', label: 'Table', icon: <Table2 className="w-4 h-4" /> },
  { key: 'calendar', label: 'Calendar', icon: <CalendarDays className="w-4 h-4" /> },
];

interface ViewSwitcherProps {
  value: BoardView;
  onChange: (view: BoardView) => void;
}

const ViewSwitcher: React.FC<ViewSwitcherProps> = ({ value, onChange }) => (
  <div
    data-testid="view-switcher"
    className="flex items-center bg-slate-100 border border-slate-200 rounded-lg p-0.5"
    role="tablist"
    aria-label="Board view"
  >
    {VIEWS.map((v) => (
      <button
        key={v.key}
        role="tab"
        aria-selected={value === v.key}
        aria-label={`${v.label} view`}
        title={`${v.label} view`}
        onClick={() => onChange(v.key)}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
          value === v.key
            ? 'bg-white text-slate-800 shadow-sm'
            : 'text-slate-500 hover:text-slate-700'
        }`}
      >
        {v.icon}
        <span className="hidden sm:inline">{v.label}</span>
      </button>
    ))}
  </div>
);

export default ViewSwitcher;
