import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { Calendar, CheckCircle2, Clock, Trash2, X } from 'lucide-react';
import { cardsApi } from '../lib/api/cardsApi';
import { ApiError } from '../lib/api';
import { boardKey, useBoardMutations } from '../hooks/useBoardData';
import { cardKey, useCardDetail } from '../hooks/useCardDetail';
import { hasRole } from '../types';
import { useAuth } from '../contexts/AuthContext';
import type { ActivityItem, BoardMember, Card, CardDetail, Comment, Priority, Role } from '../types';

interface TaskDetailModalProps {
  cardId: string;
  boardId: string;
  members: BoardMember[];
  myRole: Role;
  onClose: () => void;
}

const PRIORITY_META: Record<Priority, { label: string; cls: string }> = {
  NONE: { label: 'No priority', cls: 'bg-slate-100 text-slate-600' },
  LOW: { label: 'Low', cls: 'bg-sky-100 text-sky-700' },
  MEDIUM: { label: 'Medium', cls: 'bg-amber-100 text-amber-700' },
  HIGH: { label: 'High', cls: 'bg-orange-100 text-orange-700' },
  URGENT: { label: 'Urgent', cls: 'bg-red-100 text-red-700' },
};

const toLocalInput = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const errMsg = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/** Human sentence for an activity feed entry. */
function activityText(item: ActivityItem): string {
  const meta = item.metadata ?? {};
  const fields = Array.isArray(meta.fields) ? (meta.fields as string[]) : [];
  switch (item.type) {
    case 'CARD_CREATED':
      return 'created this card';
    case 'CARD_MOVED':
      return 'moved this card';
    case 'CARD_DELETED':
      return 'deleted this card';
    case 'CARD_UPDATED':
      if (fields.includes('assignees')) {
        return meta.assigned ? 'assigned a member' : 'removed an assignee';
      }
      if (fields.includes('done')) {
        return meta.done ? 'marked this card as completed' : 'marked this card as incomplete';
      }
      if (fields.includes('title')) return 'renamed the card';
      if (fields.includes('priority')) return 'changed the priority';
      if (fields.includes('dueDate')) return 'changed the due date';
      if (fields.includes('description')) return 'updated the description';
      return 'updated the card';
    case 'COMMENT_ADDED':
      return 'added a comment';
    case 'COMMENT_UPDATED':
      return 'edited a comment';
    case 'COMMENT_DELETED':
      return 'deleted a comment';
    case 'LABEL_CREATED':
      return 'created a label';
    case 'LABEL_UPDATED':
      return 'renamed a label';
    case 'LABEL_DELETED':
      return 'deleted a label';
    case 'MEMBER_JOINED':
      return 'joined the team';
    case 'MEMBER_REMOVED':
      return 'removed a member';
    case 'MEMBER_ROLE_CHANGED':
      return 'changed a member role';
    default:
      return 'made an update';
  }
}

const TaskDetailModal: React.FC<TaskDetailModalProps> = ({
  cardId,
  boardId,
  members,
  myRole,
  onClose,
}) => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const detailQuery = useCardDetail(cardId);
  const m = useBoardMutations(boardId);

  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [descDraft, setDescDraft] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [commentEdit, setCommentEdit] = useState('');
  const [popover, setPopover] = useState<'assign' | null>(null);

  const detail = detailQuery.data;
  const card = detail?.card;

  // Card deleted elsewhere (realtime removal → 404 refetch) → close.
  useEffect(() => {
    if (detailQuery.error instanceof ApiError && detailQuery.error.status === 404) onClose();
  }, [detailQuery.error, onClose]);

  // Escape closes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const patchDetail = (fn: (old: CardDetail | undefined) => CardDetail | undefined) =>
    queryClient.setQueryData<CardDetail>(cardKey(cardId), fn);

  // Own-tab realtime echoes are deduped, so keep the board cache in sync here.
  const patchBoardCard = (partial: Partial<Card>) =>
    queryClient.setQueryData<{ cards: Card[] }>(boardKey(boardId), (old) =>
      old
        ? { ...old, cards: old.cards.map((c) => (c.id === cardId ? { ...c, ...partial } : c)) }
        : old
    );

  // Adjust _count against the board cache's own values (may differ from the
  // detail payload — e.g. while other mutations are in flight).
  const bumpBoardCount = (delta: { comments?: number }) =>
    queryClient.setQueryData<{ cards: Card[] }>(boardKey(boardId), (old) =>
      old
        ? {
            ...old,
            cards: old.cards.map((c) => {
              if (c.id !== cardId) return c;
              const count = c._count ?? { checklists: 0, comments: 0 };
              return {
                ...c,
                _count: {
                  ...count,
                  comments: Math.max(count.comments + (delta.comments ?? 0), 0),
                },
              };
            }),
          }
        : old
    );

  const fail = (e: unknown, fallback: string) => toast.error(errMsg(e, fallback));

  // ── core fields ───────────────────────────────────────────────────────────
  const savePatch = (patch: Partial<Card>) => {
    m.updateCard.mutate(
      { id: cardId, patch },
      {
        onSuccess: ({ card: updated }) => {
          patchDetail((old) => (old ? { ...old, card: { ...old.card, ...updated } } : old));
        },
        onError: (e) => fail(e, 'Update failed'),
      }
    );
  };

  const saveTitle = () => {
    if (titleDraft === null || !card) return;
    const trimmed = titleDraft.trim();
    setTitleDraft(null);
    if (!trimmed || trimmed === card.title) return;
    savePatch({ title: trimmed });
  };

  const saveDescription = () => {
    if (descDraft === null || !card) return;
    setDescDraft(null);
    if (descDraft === card.description) return;
    savePatch({ description: descDraft });
  };

  // ── assignees ─────────────────────────────────────────────────────────────

  const toggleAssignee = async (user: BoardMember) => {
    if (!card) return;
    const assigned = card.assignees.some((a) => a.id === user.id);
    try {
      if (assigned) {
        await cardsApi.unassign(cardId, user.id);
        const assignees = card.assignees.filter((a) => a.id !== user.id);
        patchDetail((old) => (old ? { ...old, card: { ...old.card, assignees } } : old));
        patchBoardCard({ assignees });
      } else {
        const { card: updated } = await cardsApi.assign(cardId, user.id);
        patchDetail((old) => (old ? { ...old, card: { ...old.card, assignees: updated.assignees } } : old));
        patchBoardCard({ assignees: updated.assignees });
      }
      setPopover(null);
      // Own echoes are deduped — refetch so the activity feed picks up the entry.
      queryClient.invalidateQueries({ queryKey: cardKey(cardId) });
    } catch (e) {
      fail(e, 'Could not update assignees');
    }
  };


  // ── comments ──────────────────────────────────────────────────────────────
  const addComment = async () => {
    const body = commentDraft.trim();
    if (!body) return;
    try {
      const { comment } = await cardsApi.addComment(cardId, body);
      patchDetail((old) =>
        old ? { ...old, card: { ...old.card, comments: [...old.card.comments, comment] } } : old
      );
      bumpBoardCount({ comments: 1 });
      setCommentDraft('');
      // Own echo is deduped — refetch so the activity feed gains the entry.
      queryClient.invalidateQueries({ queryKey: cardKey(cardId) });
    } catch (e) {
      fail(e, 'Could not post comment');
    }
  };

  const saveCommentEdit = async (comment: Comment) => {
    const body = commentEdit.trim();
    setEditingComment(null);
    if (!body || body === comment.body) return;
    try {
      const { comment: updated } = await cardsApi.updateComment(comment.id, body);
      patchDetail((old) =>
        old
          ? {
              ...old,
              card: {
                ...old.card,
                comments: old.card.comments.map((c) => (c.id === comment.id ? updated : c)),
              },
            }
          : old
      );
    } catch (e) {
      fail(e, 'Could not edit comment');
    }
  };

  const deleteComment = async (commentId: string) => {
    try {
      await cardsApi.removeComment(commentId);
      patchDetail((old) =>
        old
          ? {
              ...old,
              card: { ...old.card, comments: old.card.comments.filter((c) => c.id !== commentId) },
            }
          : old
      );
      bumpBoardCount({ comments: -1 });
    } catch (e) {
      fail(e, 'Could not delete comment');
    }
  };

  const deleteCard = () => {
    if (!confirm('Delete this card? This cannot be undone.')) return;
    m.deleteCard.mutate(cardId, {
      onSuccess: () => onClose(),
      onError: (e) => fail(e, 'Delete failed'),
    });
  };

  // ── render states ─────────────────────────────────────────────────────────
  const overlay = (children: React.ReactNode) => (
    <div
      className="fixed inset-0 z-40 bg-black/50 overflow-y-auto"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="min-h-full flex items-start justify-center p-2 sm:p-4 md:p-8">
        <div
          className="bg-white rounded-xl shadow-xl w-full max-w-3xl relative my-2 sm:my-0"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </div>
  );

  if (detailQuery.isLoading) {
    return overlay(
      <div className="p-4 sm:p-6 animate-pulse space-y-4">
        <div className="h-7 bg-slate-200 rounded w-2/3" />
        <div className="h-24 bg-slate-100 rounded" />
        <div className="h-32 bg-slate-100 rounded" />
      </div>
    );
  }

  if (!card || !detail) {
    if (detailQuery.isError && !(detailQuery.error instanceof ApiError && detailQuery.error.status === 404)) {
      return overlay(
        <div className="p-6 sm:p-8 text-center">
          <p className="text-slate-600 mb-4">
            {detailQuery.error instanceof Error ? detailQuery.error.message : 'Failed to load card'}
          </p>
          <button onClick={() => detailQuery.refetch()} className="text-blue-600 hover:underline">
            Retry
          </button>
        </div>
      );
    }
    return null;
  }

  const unassigned = members.filter((m2) => !card.assignees.some((a) => a.id === m2.id));

  return overlay(
    <>
      {/* Header */}
      <div className="px-4 py-3.5 sm:px-6 sm:pt-5 sm:pb-3 border-b border-slate-100 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => savePatch({ done: !card.done })}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                card.done
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-300'
              }`}
              aria-label={card.done ? 'Mark as incomplete' : 'Mark as done'}
            >
              <CheckCircle2 className={`w-3.5 h-3.5 ${card.done ? 'text-white' : 'text-slate-500'}`} />
              <span>{card.done ? 'Completed' : 'Mark as done'}</span>
            </button>
            <span className="text-xs text-slate-400 inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Updated {format(new Date(card.updatedAt), 'MMM d, HH:mm')}
            </span>
          </div>
          <input
            value={titleDraft ?? card.title}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'Escape') setTitleDraft(null);
            }}
            className={`w-full text-base sm:text-lg font-semibold bg-transparent outline-none rounded px-1 -ml-1 py-0.5 hover:bg-slate-50 focus:bg-slate-50 transition-colors ${
              card.done ? 'line-through text-slate-400' : 'text-slate-800'
            }`}
            aria-label="Card title"
          />
          <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 flex-wrap">
            <span className={`px-2 py-0.5 rounded-full font-medium ${PRIORITY_META[card.priority].cls}`}>
              {PRIORITY_META[card.priority].label}
            </span>
            {card.dueDate && (
              <span className="inline-flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {format(new Date(card.dueDate), 'MMM d, yyyy HH:mm')}
              </span>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex-shrink-0"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_220px]">
        {/* ── Main column ── */}
        <div className="p-4 sm:p-6 space-y-5 sm:space-y-6 border-b md:border-b-0 md:border-r border-slate-100">
          {/* Description */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
              Description
            </h3>
            <textarea
              value={descDraft ?? card.description}
              onChange={(e) => setDescDraft(e.target.value)}
              onBlur={saveDescription}
              placeholder="Add a more detailed description…"
              rows={descDraft === null && !card.description ? 2 : 4}
              className="w-full text-sm text-slate-700 bg-slate-50 rounded-lg p-3 outline-none focus:ring-2 focus:ring-blue-500/30 resize-y"
            />
          </section>



          {/* Comments */}
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">
              Comments ({card.comments.length})
            </h3>
            <ul className="space-y-3 mb-4">
              {card.comments.map((c) => (
                <li key={c.id} className="flex gap-2.5 group/c">
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
                    style={{ backgroundColor: c.author.avatarColor }}
                  >
                    {c.author.name?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-medium text-slate-800">{c.author.name}</span>
                      <span className="text-xs text-slate-400">
                        {format(new Date(c.createdAt), 'MMM d, HH:mm')}
                        {c.updatedAt !== c.createdAt && ' (edited)'}
                      </span>
                      <div className="flex-1" />
                      <div className="flex gap-1 opacity-0 group-hover/c:opacity-100 transition-opacity">
                        {c.authorId === user?.id && (
                          <button
                            onClick={() => {
                              setEditingComment(c.id);
                              setCommentEdit(c.body);
                            }}
                            className="text-xs text-slate-400 hover:text-blue-600"
                          >
                            Edit
                          </button>
                        )}
                        {(c.authorId === user?.id || hasRole(myRole, 'ADMIN')) && (
                          <button
                            onClick={() => {
                              if (confirm('Delete this comment?')) deleteComment(c.id);
                            }}
                            className="text-xs text-slate-400 hover:text-red-600"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                    {editingComment === c.id ? (
                      <div className="mt-1">
                        <textarea
                          value={commentEdit}
                          onChange={(e) => setCommentEdit(e.target.value)}
                          rows={2}
                          className="w-full text-sm border border-slate-200 rounded-lg p-2 outline-none focus:ring-2 focus:ring-blue-500/30"
                          autoFocus
                        />
                        <div className="flex gap-2 mt-1">
                          <button
                            onClick={() => saveCommentEdit(c)}
                            className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingComment(null)}
                            className="text-xs px-2 py-1 text-slate-500 hover:text-slate-700"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-600 whitespace-pre-wrap break-words mt-0.5">
                        {c.body}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex gap-2.5">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold flex-shrink-0"
                style={{ backgroundColor: user?.avatarColor ?? '#3b82f6' }}
              >
                {user?.name?.charAt(0)?.toUpperCase() || '?'}
              </div>
              <div className="flex-1">
                <textarea
                  value={commentDraft}
                  onChange={(e) => setCommentDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addComment();
                  }}
                  placeholder="Write a comment… (Ctrl+Enter to post)"
                  rows={2}
                  className="w-full text-sm border border-slate-200 rounded-lg p-2.5 outline-none focus:ring-2 focus:ring-blue-500/30 resize-y"
                />
                <button
                  onClick={addComment}
                  disabled={!commentDraft.trim()}
                  className="mt-1.5 px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40"
                >
                  Comment
                </button>
              </div>
            </div>
          </section>

          {/* Activity */}
          <section data-testid="activity-feed">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-3">
              Activity
            </h3>
            {detail && detail.activity.length > 0 ? (
              <ul className="space-y-2.5">
                {detail.activity.map((item) => (
                  <li key={item.id} className="flex gap-2.5 items-start">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-semibold flex-shrink-0"
                      style={{ backgroundColor: item.actor.avatarColor }}
                    >
                      {item.actor.name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-slate-600">
                        <span className="font-medium text-slate-800">{item.actor.name}</span>{' '}
                        {activityText(item)}
                      </p>
                      <p className="text-xs text-slate-400">{format(new Date(item.createdAt), 'MMM d, HH:mm')}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-slate-400">No activity yet</p>
            )}
          </section>
        </div>

        {/* ── Sidebar ── */}
        <div className="p-4 sm:p-5 space-y-5 bg-slate-50/50 rounded-b-xl md:rounded-b-none md:rounded-br-xl">
          {/* Assignees */}
          <div className="relative">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
              Assignees
            </h3>
            <div className="space-y-1.5">
              {card.assignees.map((a) => (
                <div key={a.id} className="flex items-center gap-2 text-sm">
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-semibold"
                    style={{ backgroundColor: a.avatarColor }}
                  >
                    {a.name?.charAt(0)?.toUpperCase()}
                  </div>
                  <span className="flex-1 truncate text-slate-700">{a.name}</span>
                  <button
                    onClick={() => toggleAssignee(a as BoardMember)}
                    className="text-slate-300 hover:text-red-500 p-1"
                    title="Unassign"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() => setPopover(popover === 'assign' ? null : 'assign')}
              className="mt-2 w-full text-xs text-slate-500 border border-dashed border-slate-300 rounded-lg py-2 hover:border-blue-400 hover:text-blue-600 transition-colors"
            >
              + Assign member
            </button>
            {popover === 'assign' && (
              <div className="absolute z-10 mt-1 left-0 right-0 bg-white border border-slate-200 rounded-lg shadow-lg p-1 max-h-44 overflow-y-auto">
                {unassigned.length === 0 && (
                  <p className="text-xs text-slate-400 p-2">Everyone is assigned</p>
                )}
                {unassigned.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => toggleAssignee(u)}
                    className="w-full text-left text-sm px-2.5 py-2 rounded hover:bg-slate-50 flex items-center gap-2"
                  >
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-semibold"
                      style={{ backgroundColor: u.avatarColor }}
                    >
                      {u.name?.charAt(0)?.toUpperCase()}
                    </div>
                    <span className="truncate">{u.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Status */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
              Status
            </h3>
            <button
              type="button"
              onClick={() => savePatch({ done: !card.done })}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                card.done
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span className="flex items-center gap-2">
                <CheckCircle2 className={`w-4 h-4 ${card.done ? 'text-emerald-600' : 'text-slate-400'}`} />
                {card.done ? 'Completed' : 'In Progress'}
              </span>
              <span className="text-xs text-slate-400">{card.done ? 'Reopen' : 'Complete'}</span>
            </button>
          </div>

          {/* Priority */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
              Priority
            </h3>
            <select
              value={card.priority}
              onChange={(e) => savePatch({ priority: e.target.value as Priority })}
              className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:ring-2 focus:ring-blue-500/30"
            >
              {(Object.keys(PRIORITY_META) as Priority[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_META[p].label}
                </option>
              ))}
            </select>
          </div>

          {/* Due date */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400 mb-2">
              Due date
            </h3>
            <input
              type="datetime-local"
              value={toLocalInput(card.dueDate)}
              onChange={(e) => savePatch({ dueDate: e.target.value ? new Date(e.target.value).toISOString() : null })}
              className="w-full text-sm border border-slate-200 rounded-lg px-2.5 py-2 bg-white outline-none focus:ring-2 focus:ring-blue-500/30 min-h-[40px]"
            />
          </div>

          {/* Last updated */}
          <div className="pt-2 border-t border-slate-200 text-[11px] text-slate-400 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            <span>Last updated: {format(new Date(card.updatedAt), 'MMM d, yyyy HH:mm')}</span>
          </div>

          {/* Danger zone */}
          <div className="pt-1">
            <button
              onClick={deleteCard}
              className="w-full flex items-center justify-center gap-1.5 text-sm text-red-600 border border-red-200 rounded-lg py-2 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" />
              Delete card
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default TaskDetailModal;
