import axios from 'axios';

const rawBase = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000/api';
const API_BASE = rawBase.endsWith('/api') ? rawBase : `${rawBase.replace(/\/+$/, '')}/api`;

const API = axios.create({
  baseURL: API_BASE,
});

API.interceptors.request.use((config) => {
  const stored = localStorage.getItem('usuario_reparto');
  let token = '';
  let role = '';
  let localId = '';

  if (stored) {
    try {
      const usuario = JSON.parse(stored);
      token = typeof usuario?.token === 'string' ? usuario.token : '';
      role = typeof usuario?.rol === 'string' ? usuario.rol : '';
      if (role && role !== 'superadmin') {
        localId = typeof usuario?.local === 'string' ? usuario.local : usuario?.local?._id || '';
      }
      if (role === 'superadmin') {
        const selected = localStorage.getItem('localSeleccionado');
        if (selected) {
          const parsed = JSON.parse(selected);
          localId = typeof parsed === 'string' ? parsed : parsed?._id || '';
        }
      }
    } catch {
      // ignore parse errors
    }
  }

  if (role === 'repartidor' && !localId) {
    const selectedRepartidorLocal = localStorage.getItem('localSeleccionadoRepartidor');
    if (selectedRepartidorLocal) {
      try {
        const parsed = JSON.parse(selectedRepartidorLocal);
        localId = typeof parsed === 'string' ? parsed : parsed?._id || '';
      } catch {
        // ignore parse errors
      }
    }
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  if (localId && (role === 'superadmin' || role === 'repartidor')) {
    config.headers['x-local-id'] = localId;
  }

  return config;
});

export const loginUsuario = (data) => API.post('/auth/login', data);
export const obtenerLocales = () => API.get('/locales');
export const obtenerPedidosReparto = (params) => API.get('/ventasCliente/local/pedidos', { params });
export const obtenerEstadosRepartidor = () => API.get('/ventasCliente/local/estados-repartidor');
export const actualizarEstadoPedido = (id, data) => API.patch(`/ventasCliente/local/pedidos/${id}/estado`, data);
export const obtenerRepartidores = () => API.get('/ventasCliente/local/repartidores');
export const asignarRepartidor = (id, repartidor_id) =>
  API.patch(`/ventasCliente/local/pedidos/${id}/repartidor`, { repartidor_id });
export const obtenerResumenRepartos = (params) => API.get('/ventasCliente/local/repartos/resumen', { params });

export default API;
