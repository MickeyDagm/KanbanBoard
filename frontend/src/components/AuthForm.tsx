import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  KeyRound,
  LogIn,
  MailCheck,
  UserPlus,
  Loader2,
  ArrowLeft,
  Mail,
  Lock,
  User as UserIcon,
  Eye,
  EyeOff,
  CheckCircle2,
  Users,
  Check,
} from 'lucide-react';
import { ApiError } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { invitesApi } from '../lib/api/invitesApi';

type Mode = 'signin' | 'signup' | 'forgot' | 'reset';
type SignupStep = 'email' | 'otp' | 'profile';

const AuthForm: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const inviteCode = searchParams.get('invite') || '';

  const [mode, setMode] = useState<Mode>(inviteCode ? 'signup' : 'signin');
  const [signupStep, setSignupStep] = useState<SignupStep>('email');

  // Form fields
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // UI state
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [signupToken, setSignupToken] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  const {
    signIn,
    sendSignupOtp,
    verifySignupOtp,
    completeSignup,
    resendVerification,
    forgotPassword,
    resetPassword,
  } = useAuth();

  // Load invite preview if invite code is present
  const { data: invitePreview } = useQuery({
    queryKey: ['invite-preview', inviteCode],
    queryFn: () => invitesApi.preview(inviteCode),
    enabled: !!inviteCode,
    retry: false,
  });

  // Countdown timer for OTP resend
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  const passwordsMatch = password.length > 0 && password === confirmPassword;

  // Handle Step 1.2 & 1.3: User enters email, OTP is emailed
  const handleSendSignupOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setFormError(null);
    try {
      await sendSignupOtp(email.trim());
      setSignupStep('otp');
      setResendCooldown(30);
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle Step 1.4: User verifies OTP
  const handleVerifySignupOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (code.length !== 6) return;

    setLoading(true);
    setFormError(null);
    try {
      const token = await verifySignupOtp(email.trim(), code.trim());
      setSignupToken(token);
      setSignupStep('profile');
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle Step 1.5 & 1.6: User enters name & password confirmation, user created in DB
  const handleCompleteRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      setFormError('Passwords do not match');
      return;
    }
    if (password.length < 8) {
      setFormError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    setFormError(null);
    try {
      const result = await completeSignup({
        email: email.trim(),
        name: name.trim(),
        password,
        signupToken,
        inviteCode: inviteCode || undefined,
      });

      if (result?.joinedTeamId) {
        navigate(`/teams/${result.joinedTeamId}`, { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle Sign In
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFormError(null);
    try {
      const result = await signIn(email.trim(), password, inviteCode || undefined);
      if (result?.joinedTeamId) {
        navigate(`/teams/${result.joinedTeamId}`, { replace: true });
      } else {
        navigate('/', { replace: true });
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle Forgot Password
  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFormError(null);
    try {
      await forgotPassword(email.trim());
      setCode('');
      setMode('reset');
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  // Handle Reset Password
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFormError(null);
    try {
      await resetPassword(email.trim(), code.trim(), newPassword);
      setMode('signin');
      setPassword('');
      setNewPassword('');
      setCode('');
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendSignupCode = async () => {
    if (resendCooldown > 0) return;
    setLoading(true);
    setFormError(null);
    try {
      await resendVerification(email.trim());
      setResendCooldown(30);
    } catch (err) {
      if (err instanceof ApiError) setFormError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (newMode: Mode) => {
    setMode(newMode);
    setFormError(null);
    if (newMode === 'signup') {
      setSignupStep('email');
      setCode('');
      setSignupToken('');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 relative overflow-x-hidden overflow-y-auto">
      {/* ── Ambient Background Glow matching system palette ── */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[620px] h-[620px] bg-gradient-to-tr from-blue-600/15 via-indigo-600/10 to-transparent rounded-full blur-3xl pointer-events-none" />
      <div className="absolute top-12 left-1/4 w-72 h-72 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-12 right-1/4 w-72 h-72 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* ── Brand Header (Centered) ── */}
      <div className="relative z-10 flex flex-col items-center mb-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-xl shadow-blue-500/25 border border-blue-400/20 mb-3">
          <span className="text-white font-extrabold text-2xl tracking-tight">K</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-white font-bold text-xl tracking-tight">Task Manager</span>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 border border-blue-500/30">
            Workspace
          </span>
        </div>
        <p className="text-slate-400 text-xs mt-1">Real-time collaborative project boards</p>
      </div>

      {/* ── Centered Modal Container ── */}
      <div className="w-full max-w-md relative z-10">
        {/* Invitation Banner */}
        {invitePreview && invitePreview.status === 'active' && (
          <div className="mb-4 p-4 rounded-2xl bg-slate-100 border border-blue-200/90 shadow-xl shadow-black/20">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Users className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-900">Team Invitation</h4>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                  You've been invited to join{' '}
                  <strong className="text-blue-700 font-semibold">{invitePreview.team.name}</strong>{' '}
                  as {invitePreview.role === 'ADMIN' ? 'an Admin' : 'a Member'}.
                </p>
                <p className="text-[11px] text-blue-600 font-medium mt-1">
                  {mode === 'signup'
                    ? 'Create your account below to access this team.'
                    : 'Sign in below to join this team.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Main Form Card (Soft Slate Tone - a bit darker than plain white) */}
        <div className="bg-slate-100 border border-slate-200/90 rounded-3xl p-7 sm:p-9 shadow-2xl shadow-black/50 ring-1 ring-slate-900/5">
          {/* Header info */}
          <div className="mb-6">
            {mode === 'signin' && (
              <>
                <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Welcome back</h2>
                <p className="text-sm text-slate-600 mt-1">
                  Sign in to your account to access your boards.
                </p>
              </>
            )}

              {mode === 'signup' && (
                <>
                  <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                    Create an account
                  </h2>
                  <p className="text-sm text-slate-500 mt-1">
                    {signupStep === 'email' && 'Step 1: Enter your email to receive a secure code.'}
                    {signupStep === 'otp' && 'Step 2: Enter the 6-digit code sent to your inbox.'}
                    {signupStep === 'profile' && 'Step 3: Set your name and confirm your password.'}
                  </p>

                  {/* Signup Stepper Indicator */}
                  <div className="mt-5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                          signupStep === 'email'
                            ? 'bg-blue-600 text-white ring-4 ring-blue-100 shadow-sm'
                            : 'bg-emerald-600 text-white'
                        }`}
                      >
                        {signupStep === 'email' ? '1' : <Check className="w-3.5 h-3.5" />}
                      </div>
                      <span
                        className={`text-xs font-semibold ${
                          signupStep === 'email' ? 'text-slate-900' : 'text-slate-500'
                        }`}
                      >
                        Email
                      </span>
                    </div>

                    <div
                      className={`h-0.5 flex-1 mx-3 rounded transition-all ${
                        signupStep !== 'email' ? 'bg-emerald-500' : 'bg-slate-300'
                      }`}
                    />

                    <div className="flex items-center gap-2">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                          signupStep === 'otp'
                            ? 'bg-blue-600 text-white ring-4 ring-blue-100 shadow-sm'
                            : signupStep === 'profile'
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-200 text-slate-500 border border-slate-300'
                        }`}
                      >
                        {signupStep === 'profile' ? (
                          <Check className="w-3.5 h-3.5" />
                        ) : (
                          '2'
                        )}
                      </div>
                      <span
                        className={`text-xs font-semibold ${
                          signupStep === 'otp'
                            ? 'text-slate-900'
                            : signupStep === 'profile'
                              ? 'text-slate-600'
                              : 'text-slate-500'
                        }`}
                      >
                        Verify
                      </span>
                    </div>

                    <div
                      className={`h-0.5 flex-1 mx-3 rounded transition-all ${
                        signupStep === 'profile' ? 'bg-blue-600' : 'bg-slate-300'
                      }`}
                    />

                    <div className="flex items-center gap-2">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                          signupStep === 'profile'
                            ? 'bg-blue-600 text-white ring-4 ring-blue-100 shadow-sm'
                            : 'bg-slate-200 text-slate-500 border border-slate-300'
                        }`}
                      >
                        3
                      </div>
                      <span
                        className={`text-xs font-semibold ${
                          signupStep === 'profile' ? 'text-slate-900' : 'text-slate-500'
                        }`}
                      >
                        Password
                      </span>
                    </div>
                  </div>
                </>
              )}

              {mode === 'forgot' && (
                <>
                  <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Reset password</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Enter your email to receive a password reset code.
                  </p>
                </>
              )}

              {mode === 'reset' && (
                <>
                  <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Set new password</h2>
                  <p className="text-sm text-slate-500 mt-1">
                    Enter the code from your email and your new password.
                  </p>
                </>
              )}
            </div>

            {/* Error banner */}
            {formError && (
              <div className="mb-5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
                {formError}
              </div>
            )}

            {/* ── Mode 1: Sign In ─────────────────────────────────── */}
            {mode === 'signin' && (
              <form onSubmit={handleSignIn} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@company.com"
                      autoComplete="email"
                      aria-label="Email Address"
                      className="w-full pl-11 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all shadow-sm"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => switchMode('forgot')}
                      className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <div className="relative">
                    <Lock className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      aria-label="Password"
                      className="w-full pl-11 pr-11 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all shadow-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !email.trim() || !password}
                  className="w-full mt-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-medium text-sm rounded-xl transition-all shadow-md shadow-blue-600/20 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <LogIn className="w-4 h-4" />
                      <span>Sign In</span>
                    </>
                  )}
                </button>
              </form>
            )}

            {/* ── Mode 2: Multi-step Signup ───────────────────────── */}
            {mode === 'signup' && (
              <>
                {/* Step 1.2 & 1.3: Email Step */}
                {signupStep === 'email' && (
                  <form onSubmit={handleSendSignupOtp} className="space-y-4">
                    <div>
                      <div className="relative">
                        <Mail className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="name@company.com"
                          autoComplete="email"
                          aria-label="Email Address"
                          className="w-full pl-11 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all shadow-sm"
                        />
                      </div>
                      <p className="text-xs text-slate-500 mt-2">
                        A one-time verification code will be sent to this email.
                      </p>
                    </div>

                    <button
                      type="submit"
                      disabled={loading || !email.trim()}
                      className="w-full mt-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-medium text-sm rounded-xl transition-all shadow-md shadow-blue-600/20 flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Sending code…</span>
                        </>
                      ) : (
                        <>
                          <MailCheck className="w-4 h-4" />
                          <span>Continue with Email</span>
                        </>
                      )}
                    </button>
                  </form>
                )}

                {/* Step 1.4: OTP Verification Step */}
                {signupStep === 'otp' && (
                  <form onSubmit={handleVerifySignupOtp} className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider">
                          6-Digit Verification Code
                        </label>
                        <button
                          type="button"
                          onClick={() => setSignupStep('email')}
                          className="text-xs text-blue-600 hover:text-blue-700 font-semibold"
                        >
                          Change email
                        </button>
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="\d{6}"
                          maxLength={6}
                          required
                          value={code}
                          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                          placeholder="000000"
                          aria-label="6-digit code"
                          className="w-full px-4 py-3 bg-white border border-slate-300 rounded-xl text-slate-900 text-center font-mono tracking-[0.4em] text-xl focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all shadow-sm"
                        />
                      </div>
                      <p className="text-xs text-slate-500 mt-2 text-center">
                        Code sent to <span className="font-semibold text-slate-800">{email}</span>
                      </p>
                    </div>

                    <button
                      type="submit"
                      disabled={loading || code.length !== 6}
                      className="w-full mt-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-medium text-sm rounded-xl transition-all shadow-md shadow-blue-600/20 flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Verifying…</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>Verify & Proceed</span>
                        </>
                      )}
                    </button>

                    <div className="pt-2 flex items-center justify-center">
                      <button
                        type="button"
                        onClick={handleResendSignupCode}
                        disabled={loading || resendCooldown > 0}
                        className="text-xs font-medium text-slate-500 hover:text-blue-600 disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
                      >
                        {resendCooldown > 0
                          ? `Resend code in ${resendCooldown}s`
                          : 'Did not receive code? Resend'}
                      </button>
                    </div>
                  </form>
                )}

                {/* Step 1.5 & 1.6: Name & Password with Confirmation */}
                {signupStep === 'profile' && (
                  <form onSubmit={handleCompleteRegistration} className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                        Full Name
                      </label>
                      <div className="relative">
                        <UserIcon className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type="text"
                          required
                          minLength={1}
                          maxLength={60}
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Name"
                          aria-label="Name"
                          className="w-full pl-11 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all shadow-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                        Password
                      </label>
                      <div className="relative">
                        <Lock className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          minLength={8}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="At least 8 characters"
                          autoComplete="new-password"
                          aria-label="Password"
                          className="w-full pl-11 pr-11 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all shadow-sm"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          {showPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                        Confirm Password
                      </label>
                      <div className="relative">
                        <Lock className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                        <input
                          type={showConfirmPassword ? 'text' : 'password'}
                          required
                          minLength={8}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Re-enter password"
                          autoComplete="new-password"
                          aria-label="Confirm Password"
                          className={`w-full pl-11 pr-11 py-2.5 bg-white border rounded-xl text-slate-900 placeholder-slate-400 text-sm outline-none transition-all shadow-sm ${
                            confirmPassword && !passwordsMatch
                              ? 'border-amber-400 focus:ring-2 focus:ring-amber-400/20'
                              : confirmPassword && passwordsMatch
                                ? 'border-emerald-500 focus:ring-2 focus:ring-emerald-500/20'
                                : 'border-slate-300 focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20'
                          }`}
                        />
                        <button
                          type="button"
                          onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          {showConfirmPassword ? (
                            <EyeOff className="w-4 h-4" />
                          ) : (
                            <Eye className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                      {confirmPassword && (
                        <div className="mt-1.5 flex items-center gap-1.5 text-xs">
                          {passwordsMatch ? (
                            <span className="text-emerald-600 font-medium flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Passwords match
                            </span>
                          ) : (
                            <span className="text-amber-600 font-medium">Passwords must match</span>
                          )}
                        </div>
                      )}
                    </div>

                    <button
                      type="submit"
                      disabled={loading || !name.trim() || !passwordsMatch || password.length < 8}
                      className="w-full mt-3 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-medium text-sm rounded-xl transition-all shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Creating account…</span>
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-4 h-4" />
                          <span>Create Account & Sign In</span>
                        </>
                      )}
                    </button>
                  </form>
                )}
              </>
            )}

            {/* ── Mode 3: Forgot Password ─────────────────────────── */}
            {mode === 'forgot' && (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="name@company.com"
                      autoComplete="email"
                      aria-label="Email Address"
                      className="w-full pl-11 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all shadow-sm"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !email.trim()}
                  className="w-full mt-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-medium text-sm rounded-xl transition-all shadow-md shadow-blue-600/20 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <KeyRound className="w-4 h-4" />
                      <span>Email me a code</span>
                    </>
                  )}
                </button>

                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => switchMode('signin')}
                    className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 transition-colors font-medium"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back to sign in
                  </button>
                </div>
              </form>
            )}

            {/* ── Mode 4: Reset Password ──────────────────────────── */}
            {mode === 'reset' && (
              <form onSubmit={handleResetPassword} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    6-Digit Code
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={6}
                    required
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    aria-label="6-digit code"
                    className="w-full px-4 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 text-center font-mono tracking-[0.3em] text-lg focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all shadow-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    New Password
                  </label>
                  <div className="relative">
                    <Lock className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="At least 8 characters"
                      autoComplete="new-password"
                      aria-label="New password"
                      className="w-full pl-11 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-900 placeholder-slate-400 text-sm focus:border-blue-600 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all shadow-sm"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || code.length !== 6 || newPassword.length < 8}
                  className="w-full mt-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-medium text-sm rounded-xl transition-all shadow-md shadow-blue-600/20 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <KeyRound className="w-4 h-4" />
                      <span>Set new password</span>
                    </>
                  )}
                </button>
              </form>
            )}

            {/* Switch Mode Footer */}
            <div className="mt-6 pt-5 border-t border-slate-200 text-center">
              {mode === 'signin' && (
                <p className="text-xs text-slate-500">
                  Don't have an account?{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('signup')}
                    className="text-blue-600 hover:text-blue-700 font-semibold transition-colors"
                  >
                    Sign up
                  </button>
                </p>
              )}

              {mode === 'signup' && (
                <p className="text-xs text-slate-500">
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => switchMode('signin')}
                    className="text-blue-600 hover:text-blue-700 font-semibold transition-colors"
                  >
                    Sign in
                  </button>
                </p>
              )}
            </div>
          </div>

          {/* Minimalist Trust & Feature Footer */}
          <div className="mt-6 flex items-center justify-center gap-5 text-xs text-slate-500 font-medium">
            <span className="text-slate-700">•</span>
            <div className="flex items-center gap-1.5 text-slate-400">
              <Users className="w-4 h-4 text-blue-400" />
              <span>Team Workspaces</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

export default AuthForm;
