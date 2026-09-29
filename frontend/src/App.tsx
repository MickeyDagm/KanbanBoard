import React from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import AuthForm from './components/AuthForm';
import AppShell from './components/AppShell';
import HomePage from './pages/HomePage';
import BoardPage from './pages/BoardPage';
import TeamDetailPage from './pages/TeamDetailPage';
import InviteRedeemPage from './pages/InviteRedeemPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5_000,
    },
  },
});

const Spinner: React.FC = () => (
  <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xl shadow-slate-200/50 flex flex-col items-center">
      <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-xl shadow-md shadow-blue-500/25 mb-4 animate-pulse">
        K
      </div>
      <div className="flex items-center space-x-1.5">
        <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce [animation-delay:-0.3s]" />
        <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce [animation-delay:-0.15s]" />
        <div className="w-2 h-2 bg-blue-600 rounded-full animate-bounce" />
      </div>
      <p className="text-xs text-slate-500 mt-3 font-medium tracking-wide">
        Connecting to workspace…
      </p>
    </div>
  </div>
);

interface LocationState {
  from?: string;
}

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (!user) {
    // Requirement 2.2: when a user clicks the invitation link, navigate to login page
    const inviteMatch = location.pathname.match(/^\/invite\/([^/]+)/);
    const target = inviteMatch ? `/login?invite=${inviteMatch[1]}` : '/login';
    return (
      <Navigate
        to={target}
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }
  return <>{children}</>;
};

const GuestRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <Spinner />;
  if (user) {
    const from = (location.state as LocationState | null)?.from;
    return <Navigate to={from || '/'} replace />;
  }
  return <>{children}</>;
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Routes>
          <Route
            path="/login"
            element={
              <GuestRoute>
                <AuthForm />
              </GuestRoute>
            }
          />
          <Route
            element={
              <ProtectedRoute>
                <AppShell />
              </ProtectedRoute>
            }
          >
            <Route path="/" element={<HomePage />} />
            <Route path="/boards/:boardId" element={<BoardPage />} />
            <Route path="/teams/:teamId" element={<TeamDetailPage />} />
            <Route path="/invite/:code" element={<InviteRedeemPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 4000,
            style: { background: '#1e293b', color: '#f8fafc', border: '1px solid #334155' },
          }}
        />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
