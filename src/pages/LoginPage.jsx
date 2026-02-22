import { useState } from 'react';
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from '@mui/material';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { loginUsuario } from '../services/api';

const ROLES_PERMITIDOS = new Set(['admin', 'superadmin', 'repartidor']);

export default function LoginPage() {
  const navigate = useNavigate();
  const { usuario, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (usuario) return <Navigate to="/" replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await loginUsuario({ email, password });
      const data = res?.data || {};
      if (!ROLES_PERMITIDOS.has(data?.rol)) {
        setError('Tu usuario no tiene permisos para este modulo de repartidores.');
        setLoading(false);
        return;
      }
      login(data);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err?.response?.data?.error || 'No se pudo iniciar sesion');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', p: 2 }}>
      <Paper elevation={4} sx={{ width: '100%', maxWidth: 420, p: 3.5, borderRadius: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
          Modulo Repartidores
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          Inicia sesion con usuario admin/superadmin o repartidor.
        </Typography>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Box component="form" onSubmit={onSubmit}>
          <Stack spacing={2}>
            <TextField label="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <TextField
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Button type="submit" variant="contained" disabled={loading}>
              {loading ? 'Ingresando...' : 'Ingresar'}
            </Button>
          </Stack>
        </Box>
      </Paper>
    </Box>
  );
}