import { Navigate, Route, Routes } from 'react-router-dom';
import { Box } from '@mui/material';
import LoginPage from './pages/LoginPage';
import RepartosPage from './pages/RepartosPage';
import { useAuth } from './context/AuthContext';

function ProtectedRoute({ children }) {
  const { usuario } = useAuth();
  if (!usuario) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Box sx={{ minHeight: '100vh', background: 'linear-gradient(180deg, #f3f6fb 0%, #e9eef8 100%)' }}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <RepartosPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Box>
  );
}