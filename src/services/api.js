import axios from 'axios';

const rawBase = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000/api';
const API_BASE = rawBase.endsWith('/api') ? rawBase : `${rawBase.replace(/\/+$/, '')}/api`;

const API = axios.create({
  baseURL: API_BASE,
});

const withLocalHeader = (localId) =>
  localId ? { headers: { 'x-local-id': localId } } : {};

API.interceptors.request.use((config) => {
  const stored = localStorage.getItem('usuario_reparto');
  let token = '';
  let role = '';
  let localId = '';
  const parseLocalStorageId = (key) => {
    const raw = localStorage.getItem(key);
    if (!raw) return '';
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed === 'string' ? parsed : parsed?._id || '';
    } catch {
      return '';
    }
  };

  if (stored) {
    try {
      const usuario = JSON.parse(stored);
      token = typeof usuario?.token === 'string' ? usuario.token : '';
      role = typeof usuario?.rol === 'string' ? usuario.rol : '';
      if (role && role !== 'superadmin') {
        localId = typeof usuario?.local === 'string' ? usuario.local : usuario?.local?._id || '';
      }
      if (role === 'superadmin') {
        localId =
          parseLocalStorageId('localSeleccionadoRepartidor') ||
          parseLocalStorageId('localSeleccionado') ||
          '';
      }
    } catch {
      // ignore parse errors
    }
  }

  if (role === 'repartidor' && !localId) {
    localId = parseLocalStorageId('localSeleccionadoRepartidor');
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
export const obtenerPedidosReparto = (params, localId) =>
  API.get('/ventasCliente/local/pedidos', { params, ...withLocalHeader(localId) });
export const obtenerEstadosRepartidor = (localId) =>
  API.get('/ventasCliente/local/estados-repartidor', withLocalHeader(localId));
export const actualizarEstadoPedido = (id, data, localId) =>
  API.patch(`/ventasCliente/local/pedidos/${id}/estado`, data, withLocalHeader(localId));
export const obtenerRepartidores = (localId) =>
  API.get('/ventasCliente/local/repartidores', withLocalHeader(localId));
export const asignarRepartidor = (id, repartidor_id) =>
  API.patch(`/ventasCliente/local/pedidos/${id}/repartidor`, { repartidor_id });
export const asignarRepartidorConLocal = (id, repartidor_id, localId) =>
  API.patch(`/ventasCliente/local/pedidos/${id}/repartidor`, { repartidor_id }, withLocalHeader(localId));
export const obtenerResumenRepartos = (params, localId) =>
  API.get('/ventasCliente/local/repartos/resumen', { params, ...withLocalHeader(localId) });

export default API;
