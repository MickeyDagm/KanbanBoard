import React, { createContext, useContext, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { authApi } from '../lib/api/authApi';
import { connectSocket, disconnectSocket } from '../lib/socket';
import type { User } from '../types';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  sendSignupOtp: (email: string) => Promise<void>;
  verifySignupOtp: (email: string, code: string) => Promise<string>;
  completeSignup: (params: {
    email: string;
    name: string;
    password: string;
    signupToken?: string;
    inviteCode?: string;
  }) => Promise<{ joinedTeamId?: string }>;
  signUp: (
    email: string,
    password: string,
    name: string,
    signupToken?: string,
    inviteCode?: string
  ) => Promise<{ requiresVerification?: boolean; joinedTeamId?: string }>;
  signIn: (email: string, password: string, inviteCode?: string) => Promise<{ joinedTeamId?: string }>;
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

    // Timeout guard so the app never gets permanently stuck on a loading screen
    const timeoutId = setTimeout(() => {
      if (!cancelled) {
        setLoading(false);
      }
    }, 8000);

    authApi
      .me()
      .then(({ user }) => {
        if (!cancelled) setUser(user);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        clearTimeout(timeoutId);
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, []);

  // Realtime: keep one socket alive while authenticated, drop it on logout.
  useEffect(() => {
    if (user) connectSocket();
    else disconnectSocket();
  }, [user]);

  const sendSignupOtp = async (email: string) => {
    try {
      await authApi.sendSignupOtp({ email });
      toast.success(`Verification code sent to ${email}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send verification code');
      throw error;
    }
  };

  const verifySignupOtp = async (email: string, code: string) => {
    try {
      const { signupToken } = await authApi.verifySignupOtp({ email, code });
      toast.success('Email verified successfully!');
      return signupToken;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Invalid code');
      throw error;
    }
  };

  const completeSignup = async (params: {
    email: string;
    name: string;
    password: string;
    signupToken?: string;
    inviteCode?: string;
  }) => {
    try {
      const { user: created, joinedTeamId } = await authApi.register(params);
      setUser(created);
      toast.success('Account created successfully!');
      return { joinedTeamId };
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create account');
      throw error;
    }
  };

  const signUp = async (
    email: string,
    password: string,
    name: string,
    signupToken?: string,
    inviteCode?: string
  ) => {
    return completeSignup({ email, name, password, signupToken, inviteCode });
  };

  const signIn = async (email: string, password: string, inviteCode?: string) => {
    try {
      const { user: signedIn, joinedTeamId } = await authApi.login({
        email,
        password,
        inviteCode,
      });
      setUser(signedIn);
      toast.success('Welcome back!');
      return { joinedTeamId };
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
        sendSignupOtp,
        verifySignupOtp,
        completeSignup,
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
