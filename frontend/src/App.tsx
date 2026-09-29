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
  <div className="min-h-screen bg-gray-100 flex items-center justify-center">
    <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-[#72c02c]"></div>
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
    return (
      <Navigate
        to="/login"
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
            style: { background: '#363636', color: '#fff' },
          }}
        />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
