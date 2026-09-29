import React, { createContext, useContext, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { authApi } from '../lib/api/authApi';
import { connectSocket, disconnectSocket } from '../lib/socket';
import type { User } from '../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string, name: string) => Promise<{ requiresVerification: boolean }>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  verifyEmail: (email: string, code: string) => Promise<void>;
  resendVerification: (email: string) => Promise<void>;
  forgotPassword: (email: string) => Promise<void>;
  resetPassword: (email: string, code: string, password: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    authApi
      .me()
      .then(({ user }) => {
        if (!cancelled) setUser(user);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Realtime: keep one socket alive while authenticated, drop it on logout.
  useEffect(() => {
    if (user) connectSocket();
    else disconnectSocket();
  }, [user]);

  const signUp = async (email: string, password: string, name: string) => {
    try {
      const { user: created, requiresVerification } = await authApi.register({
        email,
        password,
        name,
      });
      if (requiresVerification) {
        // The AuthForm shows the code step; no session until it is confirmed.
        return { requiresVerification: true };
      }
      setUser(created);
      toast.success('Account created successfully!');
      return { requiresVerification: false };
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create account');
      throw error;
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { user: signedIn } = await authApi.login({ email, password });
      setUser(signedIn);
      toast.success('Welcome back!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to sign in');
      throw error;
    }
  };

  const verifyEmail = async (email: string, code: string) => {
    try {
      const { user: verified } = await authApi.verifyEmail({ email, code });
      setUser(verified);
      toast.success('Email verified — welcome!');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Invalid code');
      throw error;
    }
  };

  const resendVerification = async (email: string) => {
    try {
      await authApi.resendVerification({ email });
      toast.success(`New code sent to ${email}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send the code');
      throw error;
    }
  };

  const forgotPassword = async (email: string) => {
    try {
      await authApi.forgotPassword({ email });
      toast.success(`Reset code sent to ${email}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send the code');
      throw error;
    }
  };

  const resetPassword = async (email: string, code: string, password: string) => {
    try {
      await authApi.resetPassword({ email, code, password });
      toast.success('Password updated — sign in with it now');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not reset the password');
      throw error;
    }
  };

  const signOut = async () => {
    try {
      await authApi.logout();
      setUser(null);
      toast.success('Signed out successfully');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to sign out');
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signUp,
        signIn,
        signOut,
        verifyEmail,
        resendVerification,
        forgotPassword,
        resetPassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
