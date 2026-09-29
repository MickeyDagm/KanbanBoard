import React, { useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Check, Copy, LogOut, Mail, Plus, Settings2, Trash2, UserPlus, X } from 'lucide-react';
import { ApiError } from '../lib/api';
import { boardsApi } from '../lib/api/boardsApi';
import { invitesApi } from '../lib/api/invitesApi';
import { teamsApi } from '../lib/api/teamsApi';
import { useAuth } from '../contexts/AuthContext';
import { hasRole, type Board, type Invite, type Role, type TeamMember } from '../types';
import BoardsGrid from '../components/BoardsGrid';
import CreateBoardModal from '../components/CreateBoardModal';

const roleLabel: Record<Role, string> = { OWNER: 'Owner', ADMIN: 'Admin', MEMBER: 'Member' };

const statusBadge: Record<Invite['status'], { label: string; cls: string }> = {
  active: { label: 'Active', cls: 'bg-emerald-100 text-emerald-700' },
  revoked: { label: 'Revoked', cls: 'bg-slate-100 text-slate-500' },
  expired: { label: 'Expired', cls: 'bg-amber-100 text-amber-700' },
  maxed: { label: 'Used up', cls: 'bg-amber-100 text-amber-700' },
};

const TeamDetailPage: React.FC = () => {
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [showCreateBoard, setShowCreateBoard] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const detailQuery = useQuery({
    queryKey: ['team', teamId],
    queryFn: () => teamsApi.get(teamId!),
    enabled: !!teamId,
  });
  const boardsQuery = useQuery({ queryKey: ['boards'], queryFn: () => boardsApi.list() });

  const detail = detailQuery.data;
  const myRole = detail?.role;
  const canManage = hasRole(myRole, 'ADMIN');
  const isOwner = myRole === 'OWNER';
  const teamBoards = (boardsQuery.data?.boards ?? []).filter((b) => b.teamId === teamId);

  const invitesQuery = useQuery({
    queryKey: ['team-invites', teamId],
    queryFn: () => invitesApi.list(teamId!),
    enabled: !!teamId && canManage,
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['team', teamId] });
    queryClient.invalidateQueries({ queryKey: ['teams'] });
    queryClient.invalidateQueries({ queryKey: ['team-invites', teamId] });
  };

  const rename = useMutation({
    mutationFn: (name: string) => teamsApi.update(teamId!, name),
    onSuccess: () => {
      toast.success('Team renamed');
      invalidateAll();
      setEditingName(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Rename failed'),
  });

  const deleteTeam = useMutation({
    mutationFn: () => teamsApi.remove(teamId!),
    onSuccess: () => {
      toast.success('Team deleted');
      queryClient.removeQueries({ queryKey: ['team', teamId] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['boards'] });
      navigate('/');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Delete failed'),
  });

  const leaveTeam = useMutation({
    mutationFn: () => teamsApi.removeMember(teamId!, user!.id),
    onSuccess: () => {
      toast.success('You left the team');
      queryClient.removeQueries({ queryKey: ['team', teamId] });
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      navigate('/');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not leave team'),
  });

  const updateRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: Role }) =>
      teamsApi.updateMemberRole(teamId!, userId, role),
    onSuccess: () => {
      toast.success('Role updated');
      invalidateAll();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Role update failed'),
  });

  const removeMember = useMutation({
    mutationFn: (userId: string) => teamsApi.removeMember(teamId!, userId),
    onSuccess: () => {
      toast.success('Member removed');
      invalidateAll();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Remove failed'),
  });

  const addByEmail = useMutation({
    mutationFn: (email: string) => teamsApi.addMemberByEmail(teamId!, email),
    onSuccess: () => {
      toast.success('Member added');
      setAddEmail('');
      invalidateAll();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not add member'),
  });

  const sendInviteEmail = useMutation({
    mutationFn: (email: string) => invitesApi.sendEmail(teamId!, { email, role: 'MEMBER' }),
    onSuccess: (_data, email) => {
      toast.success(`Invitation sent to ${email}`);
      setInviteEmail('');
      invalidateAll();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not send invitation'),
  });

  const createInvite = useMutation({
    mutationFn: () => invitesApi.create(teamId!, { role: 'MEMBER' }),
    onSuccess: ({ invite, url }) => {
      navigator.clipboard
        ?.writeText(url)
        .then(() => toast.success('Invite link created and copied'))
        .catch(() => toast.success('Invite link created'));
      invalidateAll();
      return invite;
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Could not create invite'),
  });

  const revokeInvite = useMutation({
    mutationFn: (id: string) => invitesApi.revoke(id),
    onSuccess: () => {
      toast.success('Invite revoked');
      invalidateAll();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Revoke failed'),
  });

  const copyLink = (invite: Invite) => {
    const url = `${window.location.origin}/invite/${invite.code}`;
    navigator.clipboard
      ?.writeText(url)
      .then(() => {
        setCopiedId(invite.id);
        toast.success('Link copied');
        setTimeout(() => setCopiedId((prev) => (prev === invite.id ? null : prev)), 2000);
      })
      .catch(() => toast.error('Could not copy link'));
  };

  // ── Render guards ────────────────────────────────────────────────────────

  if (!teamId) return <Navigate to="/" replace />;

  if (detailQuery.isLoading) {
    return (
      <div className="p-6 md:p-8 animate-pulse space-y-6">
        <div className="h-8 bg-slate-200 rounded w-64" />
        <div className="h-40 bg-white rounded-xl border border-slate-200" />
        <div className="h-48 bg-white rounded-xl border border-slate-200" />
      </div>
    );
  }

  if (detailQuery.isError) {
    const notFound =
      detailQuery.error instanceof ApiError && detailQuery.error.status === 404;
    if (notFound) return <Navigate to="/" replace />;
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <h2 className="text-xl font-semibold text-slate-800 mb-2">Failed to load team</h2>
          <p className="text-slate-600 mb-6">
            {detailQuery.error instanceof Error ? detailQuery.error.message : 'Something went wrong.'}
          </p>
          <button
            onClick={() => detailQuery.refetch()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!detail) return <Navigate to="/" replace />;

  const { team, members, memberCount } = detail;

  const canChangeRoleOf = (target: TeamMember) => {
    if (!canManage) return false;
    if (target.userId === user?.id) return false;
    if (target.role === 'OWNER' && !isOwner) return false;
    return true;
  };

  const canRemove = (target: TeamMember) => {
    if (!canManage) return false;
    if (target.userId === user?.id) return false;
    if (target.role === 'OWNER' && !isOwner) return false;
    return true;
  };

  const roleOptions: Role[] = isOwner ? ['MEMBER', 'ADMIN', 'OWNER'] : ['MEMBER', 'ADMIN'];

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-6 md:p-8 max-w-5xl">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          {editingName ? (
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (nameDraft.trim()) rename.mutate(nameDraft.trim());
              }}
            >
              <input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                className="text-2xl font-bold text-slate-800 bg-white border border-slate-300 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500/40 outline-none"
                autoFocus
                maxLength={60}
              />
              <button
                type="submit"
                disabled={rename.isPending || !nameDraft.trim()}
                className="p-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                title="Save"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setEditingName(false)}
                className="p-2 rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-100"
                title="Cancel"
              >
                <X className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-800 tracking-tight truncate">
                {team.name}
              </h1>
              {canManage && (
                <button
                  onClick={() => {
                    setNameDraft(team.name);
                    setEditingName(true);
                  }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                  title="Rename team"
                >
                  <Settings2 className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
          <div className="flex items-center gap-3 mt-1.5 text-sm text-slate-500">
            <span>{memberCount} member{memberCount === 1 ? '' : 's'}</span>
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              You: {myRole ? roleLabel[myRole] : '—'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canManage && (
            <button
              onClick={() => setShowCreateBoard(true)}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3.5 py-2 rounded-lg text-sm font-medium shadow-sm"
            >
              <Plus className="w-4 h-4" />
              New board
            </button>
          )}
          <button
            onClick={() => {
              if (confirm('Leave this team? You will lose access to its boards.')) {
                leaveTeam.mutate();
              }
            }}
            className="flex items-center gap-1.5 border border-slate-300 text-slate-600 hover:bg-slate-100 px-3.5 py-2 rounded-lg text-sm font-medium"
          >
            <LogOut className="w-4 h-4" />
            Leave
          </button>
          {isOwner && (
            <button
              onClick={() => {
                if (
                  confirm(
                    `Delete "${team.name}"? All of its boards, lists and cards will be permanently removed.`
                  )
                ) {
                  deleteTeam.mutate();
                }
              }}
              className="flex items-center gap-1.5 border border-red-200 text-red-600 hover:bg-red-50 px-3.5 py-2 rounded-lg text-sm font-medium"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          )}
        </div>
      </div>

      {/* Members */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm mb-6">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-800">Members</h2>
          <span className="text-sm text-slate-400">{memberCount}</span>
        </div>
        <ul className="divide-y divide-slate-100">
          {members.map((member) => {
            const isSelf = member.userId === user?.id;
            return (
              <li key={member.userId} className="px-5 py-3 flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0"
                  style={{ backgroundColor: member.user.avatarColor }}
                >
                  {member.user.name?.charAt(0)?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-800 truncate">
                    {member.user.name}
                    {isSelf && <span className="ml-1.5 text-xs text-slate-400">(you)</span>}
                  </div>
                  <div className="text-xs text-slate-500 truncate">{member.user.email}</div>
                </div>

                {canChangeRoleOf(member) ? (
                  <select
                    value={member.role}
                    onChange={(e) =>
                      updateRole.mutate({ userId: member.userId, role: e.target.value as Role })
                    }
                    className="text-sm border border-slate-300 rounded-lg px-2 py-1.5 bg-white text-slate-700 focus:ring-2 focus:ring-blue-500/40 outline-none"
                    aria-label={`Role of ${member.user.name}`}
                  >
                    {roleOptions.map((r) => (
                      <option key={r} value={r}>
                        {roleLabel[r]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs font-medium text-slate-500 bg-slate-100 rounded-full px-2.5 py-1">
                    {roleLabel[member.role]}
                  </span>
                )}

                {isSelf ? (
                  <button
                    onClick={() => {
                      if (confirm('Leave this team?')) leaveTeam.mutate();
                    }}
                    className="text-xs text-slate-400 hover:text-red-600 px-2 py-1"
                  >
                    Leave
                  </button>
                ) : canRemove(member) ? (
                  <button
                    onClick={() => {
                      if (confirm(`Remove ${member.user.name} from this team?`)) {
                        removeMember.mutate(member.userId);
                      }
                    }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50"
                    title="Remove from team"
                  >
                    <X className="w-4 h-4" />
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>

        {canManage && (
          <form
            className="px-5 py-4 border-t border-slate-100 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (addEmail.trim()) addByEmail.mutate(addEmail.trim());
            }}
          >
            <input
              type="email"
              value={addEmail}
              onChange={(e) => setAddEmail(e.target.value)}
              placeholder="Add an existing member by email…"
              className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/40 outline-none"
              required
            />
            <button
              type="submit"
              disabled={addByEmail.isPending || !addEmail.trim()}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              <UserPlus className="w-4 h-4" />
              Add
            </button>
          </form>
        )}
      </section>

      {/* Invite links */}
      {canManage && (
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm mb-6">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-slate-800">Team invite link</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Share this link or email it — creating a new link automatically replaces the previous one.
              </p>
            </div>
            <button
              onClick={() => {
                const count = (invitesQuery.data?.invites ?? []).length;
                if (count > 0) {
                  if (confirm('Creating a new link will replace the existing invite link. Continue?')) {
                    createInvite.mutate();
                  }
                } else {
                  createInvite.mutate();
                }
              }}
              disabled={createInvite.isPending}
              className="flex items-center gap-1.5 border border-blue-200 text-blue-600 hover:bg-blue-50 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              {(invitesQuery.data?.invites ?? []).length > 0 ? 'Regenerate link' : 'Create link'}
            </button>
          </div>

          <form
            className="px-5 py-4 border-b border-slate-100 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (inviteEmail.trim()) sendInviteEmail.mutate(inviteEmail.trim());
            }}
          >
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="friend@example.com"
              aria-label="Email address to invite"
              className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500/40 outline-none"
              required
            />
            <button
              type="submit"
              disabled={sendInviteEmail.isPending || !inviteEmail.trim()}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              <Mail className="w-4 h-4" />
              {sendInviteEmail.isPending ? 'Sending…' : 'Send invite'}
            </button>
          </form>

          {invitesQuery.data?.emailConfigured === false && (
            <p className="px-5 py-3 text-xs text-amber-700 bg-amber-50 border-b border-slate-100">
              Email isn't configured on the server yet — set{' '}
              <code className="font-mono bg-amber-100 px-1 rounded">SMTP_HOST</code>,{' '}
              <code className="font-mono bg-amber-100 px-1 rounded">SMTP_USER</code> and{' '}
              <code className="font-mono bg-amber-100 px-1 rounded">SMTP_PASS</code> in{' '}
              <code className="font-mono bg-amber-100 px-1 rounded">backend/.env</code> to send
              invites. Until then, copy a link below and share it manually.
            </p>
          )}

          {invitesQuery.isLoading ? (
            <div className="px-5 py-6 text-sm text-slate-400">Loading…</div>
          ) : (invitesQuery.data?.invites ?? []).length === 0 ? (
            <div className="px-5 py-6 text-sm text-slate-500">No invite links yet.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {(invitesQuery.data?.invites ?? []).map((invite) => {
                const badge = statusBadge[invite.status];
                return (
                  <li key={invite.id} className="px-5 py-3 flex items-center gap-3 text-sm">
                    <code className="text-xs bg-slate-100 text-slate-600 rounded px-2 py-1 font-mono truncate max-w-[140px]">
                      /invite/{invite.code.slice(0, 8)}…
                    </code>
                    <span className="text-slate-600">{roleLabel[invite.role]}</span>
                    <span
                      className={`text-xs font-medium rounded-full px-2 py-0.5 ${badge.cls}`}
                    >
                      {badge.label}
                    </span>
                    <span className="text-xs text-slate-400">
                      {invite.usedCount}
                      {invite.maxUses !== null ? `/${invite.maxUses}` : ''} uses
                    </span>
                    {invite.expiresAt && (
                      <span className="text-xs text-slate-400">
                        expires {new Date(invite.expiresAt).toLocaleDateString()}
                      </span>
                    )}
                    <div className="flex-1" />
                    {invite.status === 'active' && (
                      <button
                        onClick={() => copyLink(invite)}
                        className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600 px-2 py-1"
                      >
                        {copiedId === invite.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        Copy
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (confirm('Revoke this invite link?')) revokeInvite.mutate(invite.id);
                      }}
                      className="text-xs text-slate-400 hover:text-red-600 px-2 py-1"
                    >
                      Revoke
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {/* Boards */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-800">Boards</h2>
          <Link to="/" className="text-sm text-blue-600 hover:underline">
            All boards
          </Link>
        </div>
        {boardsQuery.isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-[118px] bg-white rounded-xl border border-slate-200 animate-pulse" />
            ))}
          </div>
        ) : (
          <BoardsGrid
            boards={teamBoards}
            canCreate={canManage}
            onCreate={() => setShowCreateBoard(true)}
          />
        )}
      </section>

      <CreateBoardModal
        isOpen={showCreateBoard}
        preselectedTeamId={teamId}
        onClose={() => setShowCreateBoard(false)}
        onBoardCreated={(board) => {
          queryClient.setQueryData<{ boards: Board[] }>(['boards'], (old) => ({
            boards: [board, ...(old?.boards ?? [])],
          }));
          navigate(`/boards/${board.id}`);
        }}
      />
    </div>
  );
};

export default TeamDetailPage;
