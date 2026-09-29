import React from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Mail, Users } from 'lucide-react';
import { invitesApi } from '../lib/api/invitesApi';
import { ROLE_RANK, type Role } from '../types';

const roleLabel: Record<Role, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MEMBER: 'Member',
};

const InviteRedeemPage: React.FC = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const previewQuery = useQuery({
    queryKey: ['invite', code],
    queryFn: () => invitesApi.preview(code!),
    enabled: !!code,
    retry: false,
  });

  const redeem = useMutation({
    mutationFn: () => invitesApi.redeem(code!),
    onSuccess: ({ team, joined }) => {
      toast.success(joined ? `Joined ${team.name}!` : `Already a member of ${team.name}`);
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['boards'] });
      navigate(`/teams/${team.id}`);
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'Failed to join team');
    },
  });

  const wrap = (children: React.ReactNode) => (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );

  if (previewQuery.isLoading) {
    return wrap(
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 animate-pulse">
        <div className="h-6 bg-slate-200 rounded w-2/3 mb-4" />
        <div className="h-4 bg-slate-100 rounded w-1/2" />
      </div>
    );
  }

  if (previewQuery.isError || !previewQuery.data) {
    return wrap(
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
        <h1 className="text-xl font-semibold text-slate-800 mb-2">Invite not found</h1>
        <p className="text-slate-600 mb-6">This invite link is invalid or no longer available.</p>
        <Link to="/" className="text-blue-600 hover:underline font-medium">
          Go to your boards
        </Link>
      </div>
    );
  }

  const preview = previewQuery.data;

  if (preview.status !== 'active') {
    const reasons: Record<string, string> = {
      revoked: 'This invite has been revoked.',
      expired: 'This invite has expired.',
      maxed: 'This invite has reached its usage limit.',
    };
    return wrap(
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
        <h1 className="text-xl font-semibold text-slate-800 mb-2">Invite unavailable</h1>
        <p className="text-slate-600 mb-6">{reasons[preview.status] ?? 'This invite is not active.'}</p>
        <Link to="/" className="text-blue-600 hover:underline font-medium">
          Go to your boards
        </Link>
      </div>
    );
  }

  if (preview.alreadyMember) {
    return wrap(
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Users className="w-6 h-6 text-blue-600" />
        </div>
        <h1 className="text-xl font-semibold text-slate-800 mb-2">
          You&apos;re already in {preview.team.name}
        </h1>
        <p className="text-slate-600 mb-6">Your account already has access to this team.</p>
        <Link
          to={`/teams/${preview.team.id}`}
          className="inline-block bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium shadow-sm"
        >
          Go to team
        </Link>
      </div>
    );
  }

  return wrap(
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <Mail className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-800">Join a team</h1>
          <p className="text-sm text-slate-500">
            {preview.inviter.name} invited you to join
          </p>
        </div>
      </div>

      <div className="bg-slate-50 rounded-lg p-4 mb-6 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-slate-500">Team</span>
          <span className="font-medium text-slate-800">{preview.team.name}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-slate-500">Role</span>
          <span className="font-medium text-slate-800">
            {roleLabel[preview.role]}
            {preview.role !== 'MEMBER' && (
              <span className="ml-1.5 text-xs text-slate-400">
                ({ROLE_RANK[preview.role] >= 2 ? 'can manage team settings' : ''})
              </span>
            )}
          </span>
        </div>
      </div>

      <button
        onClick={() => redeem.mutate()}
        disabled={redeem.isPending}
        className={`w-full bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-lg font-medium shadow-sm transition-all ${
          redeem.isPending ? 'opacity-60 cursor-not-allowed' : ''
        }`}
      >
        {redeem.isPending ? 'Joining...' : 'Join team'}
      </button>
      <div className="mt-4 text-center">
        <Link to="/" className="text-sm text-slate-500 hover:text-slate-700">
          Not now
        </Link>
      </div>
    </div>
  );
};

export default InviteRedeemPage;
