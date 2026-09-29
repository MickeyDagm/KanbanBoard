import React, { useState } from 'react';
import { ApiError } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { KeyRound, LogIn, MailCheck, Send, UserPlus, Loader2, ArrowLeft } from 'lucide-react';

type Mode = 'signin' | 'signup' | 'verify' | 'forgot' | 'reset';

const copy: Record<Mode, { title: string; subtitle: string }> = {
  signin: { title: 'Welcome Back', subtitle: 'Sign in to your Kanban workspace' },
  signup: { title: 'Create Account', subtitle: 'Start organizing your projects today' },
  verify: { title: 'Check your inbox', subtitle: 'Enter the 6-digit code we emailed you' },
  forgot: { title: 'Reset your password', subtitle: "We'll email you a code" },
  reset: { title: 'Choose a new password', subtitle: 'Enter the code from your email' },
};

const fieldClass =
  'w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors';
const labelClass = 'block text-sm font-medium text-gray-700 mb-2';
const submitClass =
  'w-full bg-blue-500 hover:bg-blue-600 text-white py-3 px-4 rounded-lg font-medium transition-colors flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed';

const AuthForm: React.FC = () => {
  const [mode, setMode] = useState<Mode>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const { signUp, signIn, verifyEmail, resendVerification, forgotPassword, resetPassword } =
    useAuth();

  const isCodeStep = mode === 'verify' || mode === 'reset';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (mode === 'signup') {
        const { requiresVerification } = await signUp(email, password, name);
        if (requiresVerification) {
          setCode('');
          setMode('verify');
        }
      } else if (mode === 'signin') {
        await signIn(email, password);
      } else if (mode === 'verify') {
        await verifyEmail(email, code);
      } else if (mode === 'forgot') {
        await forgotPassword(email);
        setCode('');
        setMode('reset');
      } else if (mode === 'reset') {
        await resetPassword(email, code, newPassword);
        setPassword('');
        setNewPassword('');
        setCode('');
        setMode('signin');
      }
    } catch (error) {
      // The context already toasted the message; only branch on known codes.
      if (mode === 'signin' && error instanceof ApiError && error.code === 'EMAIL_NOT_VERIFIED') {
        setCode('');
        setMode('verify');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await resendVerification(email);
    } catch {
      // Toast handled in the context
    } finally {
      setResending(false);
    }
  };

  const backToSignIn = () => {
    setMode('signin');
    setPassword('');
    setCode('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-500 rounded-xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-2xl font-bold">K</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{copy[mode].title}</h1>
          <p className="text-gray-600 mt-2">{copy[mode].subtitle}</p>
          {isCodeStep && (
            <p className="text-sm text-gray-500 mt-1 break-all">
              Code for <span className="font-medium text-gray-700">{email}</span>
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {mode === 'signup' && (
            <div>
              <label htmlFor="name" className={labelClass}>
                Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={fieldClass}
                placeholder="Enter your name"
                required
                minLength={1}
                maxLength={60}
              />
            </div>
          )}

          {!isCodeStep && (
            <div>
              <label htmlFor="email" className={labelClass}>
                Email Address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={fieldClass}
                placeholder="Enter your email"
                autoComplete="email"
                required
              />
            </div>
          )}

          {isCodeStep && (
            <div>
              <label htmlFor="code" className={labelClass}>
                6-digit code
              </label>
              <input
                id="code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="\d{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                className={`${fieldClass} text-center tracking-[0.4em] font-mono text-lg`}
                placeholder="000000"
                required
              />
              {mode === 'verify' && (
                <div className="mt-3 flex items-center justify-between text-sm">
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resending}
                    className="text-blue-500 hover:text-blue-600 font-medium disabled:opacity-50"
                  >
                    {resending ? 'Sending…' : 'Resend code'}
                  </button>
                  <button
                    type="button"
                    onClick={backToSignIn}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    Start over
                  </button>
                </div>
              )}
            </div>
          )}

          {(mode === 'signin' || mode === 'signup') && (
            <div>
              <label htmlFor="password" className={labelClass}>
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={fieldClass}
                placeholder={
                  mode === 'signup' ? 'At least 8 characters' : 'Enter your password'
                }
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                required
                minLength={mode === 'signup' ? 8 : 1}
              />
              {mode === 'signin' && (
                <button
                  type="button"
                  onClick={() => setMode('forgot')}
                  className="mt-2 text-sm text-blue-500 hover:text-blue-600 font-medium"
                >
                  Forgot password?
                </button>
              )}
            </div>
          )}

          {mode === 'reset' && (
            <div>
              <label htmlFor="new-password" className={labelClass}>
                New password
              </label>
              <input
                id="new-password"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={fieldClass}
                placeholder="At least 8 characters"
                autoComplete="new-password"
                required
                minLength={8}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading || (isCodeStep && code.length !== 6)}
            className={submitClass}
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                {mode === 'signup' && <UserPlus className="w-5 h-5" />}
                {mode === 'signin' && <LogIn className="w-5 h-5" />}
                {mode === 'verify' && <MailCheck className="w-5 h-5" />}
                {(mode === 'forgot' || mode === 'reset') && <KeyRound className="w-5 h-5" />}
                <span>
                  {mode === 'signup' && 'Create Account'}
                  {mode === 'signin' && 'Sign In'}
                  {mode === 'verify' && 'Verify & continue'}
                  {mode === 'forgot' && 'Email me a code'}
                  {mode === 'reset' && 'Set new password'}
                </span>
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center space-y-3">
          {(mode === 'signin' || mode === 'signup') && (
            <button
              onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
              className="text-blue-500 hover:text-blue-600 font-medium transition-colors"
            >
              {mode === 'signin'
                ? "Don't have an account? Sign up"
                : 'Already have an account? Sign in'}
            </button>
          )}

          {mode === 'forgot' && (
            <button
              onClick={backToSignIn}
              className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-700 font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to sign in
            </button>
          )}

          {mode === 'reset' && (
            <button
              onClick={() => setMode('forgot')}
              className="inline-flex items-center gap-1.5 text-gray-500 hover:text-gray-700 font-medium"
            >
              <Send className="w-4 h-4" />
              Send a new code
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuthForm;
