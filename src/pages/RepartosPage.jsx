import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppBar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Tabs,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Toolbar,
  Typography,
} from '@mui/material';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  actualizarEstadoPedido,
  asignarRepartidorConLocal,
  obtenerLocales,
  obtenerEstadosRepartidor,
  obtenerPedidosReparto,
  obtenerRepartidores,
  obtenerResumenRepartos,
} from '../services/api';

const ESTADOS_CERRADOS = new Set(['entregado', 'cancelado', 'rechazado']);
const TODOS_LOCALES = '__all__';

const ESTADOS_REPARTIDOR_UI = [
  { value: 'repartidor llego al restaurante', label: 'Repartidor llego al restaurante' },
  { value: 'repartidor esta en espera', label: 'Repartidor esta en espera' },
  { value: 'repartidor va con tu pedido', label: 'Repartidor va con tu pedido' },
  { value: 'llego el repartidor', label: 'Llego el repartidor' },
  { value: 'entregado', label: 'Pedido entregado' },
  { value: 'cancelado', label: 'Cancelado' },
];

const estadoColor = (estado) => {
  const e = String(estado || '').toLowerCase();
  if (e === 'entregado') return 'success';
  if (e === 'repartidor va con tu pedido' || e === 'llego el repartidor' || e === 'listo') return 'info';
  if (e === 'cancelado' || e === 'rechazado') return 'error';
  return 'warning';
};

const toMonthValue = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

const parseMonthValue = (value) => {
  const [y, m] = String(value || '').split('-');
  return { anio: Number(y), mes: Number(m) };
};

const extraerDireccionDeObservaciones = (pedido) => {
  const items = Array.isArray(pedido?.productos) ? pedido.productos : [];
  for (const item of items) {
    const obs = String(item?.observacion || '');
    const match = obs.match(/delivery:\s*([^|]+)/i);
    if (match?.[1]) return match[1].trim();
  }
  return '';
};

const getDireccionPedido = (pedido) => {
  const directa = String(pedido?.cliente_direccion || '').trim();
  if (directa) return directa;
  return extraerDireccionDeObservaciones(pedido) || '-';
};

const emitirSonidoNuevoPedido = () => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc.start(now);
    osc.stop(now + 0.3);
  } catch {
    // noop
  }
};

const getEstadoLabel = (estado) => {
  const found = ESTADOS_REPARTIDOR_UI.find((e) => e.value === String(estado || '').toLowerCase());
  return found?.label || String(estado || 'pendiente');
};

const getLocalIdFromUser = (usuario) => {
  if (typeof usuario?.local === 'string') return usuario.local;
  if (usuario?.local?._id) return usuario.local._id;
  return '';
};

const getPedidoLocalId = (pedido) => {
  if (typeof pedido?.__localId === 'string') return pedido.__localId;
  if (typeof pedido?.local === 'string') return pedido.local;
  if (pedido?.local?._id) return pedido.local._id;
  return '';
};

export default function RepartosPage() {
  const { usuario, logout } = useAuth();
  const [pedidos, setPedidos] = useState([]);
  const [repartidores, setRepartidores] = useState([]);
  const [estadosDisponibles, setEstadosDisponibles] = useState([]);
  const [resumen, setResumen] = useState({ totalHistorico: 0, totalMes: 0, totalMesEntregados: 0 });
  const [localesDisponibles, setLocalesDisponibles] = useState([]);
  const [localRepartidor, setLocalRepartidor] = useState('');
  const [mes, setMes] = useState(toMonthValue());
  const [tab, setTab] = useState('abiertos');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [alertaPedido, setAlertaPedido] = useState(null);
  const [detallePedido, setDetallePedido] = useState(null);
  const [notaEstado, setNotaEstado] = useState('');
  const seenRef = useRef(new Set());

  const rol = usuario?.rol || '';
  const localTokenId = getLocalIdFromUser(usuario);
  const esSuperadmin = rol === 'superadmin';
  const esAdmin = rol === 'admin' || rol === 'superadmin';
  const esRepartidor = rol === 'repartidor';
  const esRepartidorGlobal = esRepartidor && !localTokenId;
  const requiereSelectorLocal = esSuperadmin || esRepartidorGlobal;
  const modoTodosLocales = requiereSelectorLocal && localRepartidor === TODOS_LOCALES;
  const permitido = esAdmin || esRepartidor;

  useEffect(() => {
    const raw = localStorage.getItem('repartidor_alert_seen') || '[]';
    try {
      seenRef.current = new Set(JSON.parse(raw));
    } catch {
      seenRef.current = new Set();
    }
  }, []);

  useEffect(() => {
    if (!requiereSelectorLocal) return;
    const stored = localStorage.getItem('localSeleccionadoRepartidor');
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      const id = typeof parsed === 'string' ? parsed : parsed?._id || '';
      if (id) setLocalRepartidor(id);
    } catch {
      // ignore
    }
  }, [requiereSelectorLocal]);

  useEffect(() => {
    if (!requiereSelectorLocal) return;
    const cargarLocales = async () => {
      try {
        const res = await obtenerLocales();
        const data = Array.isArray(res?.data) ? res.data : [];
        setLocalesDisponibles(data);
        if (!localRepartidor && data.length > 0) {
          const defaultLocal = requiereSelectorLocal ? TODOS_LOCALES : data[0]._id;
          setLocalRepartidor(defaultLocal);
          localStorage.setItem('localSeleccionadoRepartidor', JSON.stringify(defaultLocal));
        }
      } catch {
        setLocalesDisponibles([]);
      }
    };
    cargarLocales();
  }, [requiereSelectorLocal, localRepartidor]);

  const persistSeen = () => {
    localStorage.setItem('repartidor_alert_seen', JSON.stringify(Array.from(seenRef.current).slice(-300)));
  };

  const cargarBase = async ({ mostrarLoading = true } = {}) => {
    if (!permitido) return;
    if (requiereSelectorLocal && !localRepartidor) {
      setPedidos([]);
      setResumen({ totalHistorico: 0, totalMes: 0, totalMesEntregados: 0 });
      setError('Selecciona un local para ver repartos.');
      return;
    }

    if (mostrarLoading) setLoading(true);
    setError('');
    try {
      const { anio, mes: mesNum } = parseMonthValue(mes);
      const pedidosParams = { solo_domicilio: true, tipo_pedido: 'delivery', anio, mes: mesNum };
      let pedidosCargados = [];
      if (modoTodosLocales) {
        const locales = localesDisponibles.filter((local) => local?._id);
        const resultados = await Promise.all(
          locales.map(async (local) => {
            const localId = local._id;
            const [pedidosRes, resumenRes, repartidoresRes, estadosRes] = await Promise.allSettled([
              obtenerPedidosReparto(pedidosParams, localId),
              obtenerResumenRepartos({ anio, mes: mesNum }, localId),
              esAdmin ? obtenerRepartidores(localId) : Promise.resolve({ data: [] }),
              obtenerEstadosRepartidor(localId),
            ]);
            return { local, pedidosRes, resumenRes, repartidoresRes, estadosRes };
          })
        );

        const pedidosAll = [];
        const repartidoresMap = new Map();
        const estadosSet = new Set();
        const resumenAll = { totalHistorico: 0, totalMes: 0, totalMesEntregados: 0 };

        for (const bloque of resultados) {
          if (bloque.pedidosRes.status === 'fulfilled' && Array.isArray(bloque.pedidosRes.value?.data)) {
            const dataLocal = bloque.pedidosRes.value.data.map((pedido) => ({
              ...pedido,
              __localId: bloque.local._id,
              __localNombre: bloque.local.nombre || 'Local',
            }));
            pedidosAll.push(...dataLocal);
          }
          if (bloque.resumenRes.status === 'fulfilled') {
            const r = bloque.resumenRes.value?.data || {};
            resumenAll.totalHistorico += Number(r.totalHistorico || 0);
            resumenAll.totalMes += Number(r.totalMes || 0);
            resumenAll.totalMesEntregados += Number(r.totalMesEntregados || 0);
          }
          if (bloque.repartidoresRes.status === 'fulfilled' && Array.isArray(bloque.repartidoresRes.value?.data)) {
            for (const rep of bloque.repartidoresRes.value.data) {
              if (rep?._id && !repartidoresMap.has(rep._id)) {
                repartidoresMap.set(rep._id, rep);
              }
            }
          }
          if (bloque.estadosRes.status === 'fulfilled' && Array.isArray(bloque.estadosRes.value?.data?.estados)) {
            for (const estado of bloque.estadosRes.value.data.estados) {
              estadosSet.add(String(estado).toLowerCase());
            }
          }
        }

        setPedidos(pedidosAll);
        setResumen(resumenAll);
        setRepartidores(Array.from(repartidoresMap.values()));
        setEstadosDisponibles(Array.from(estadosSet));
        pedidosCargados = pedidosAll;
      } else {
        const localActivo = requiereSelectorLocal ? localRepartidor : undefined;
        const [pedidosRes, resumenRes, repartidoresRes, estadosRes] = await Promise.allSettled([
          obtenerPedidosReparto(pedidosParams, localActivo),
          obtenerResumenRepartos({ anio, mes: mesNum }, localActivo),
          esAdmin ? obtenerRepartidores(localActivo) : Promise.resolve({ data: [] }),
          obtenerEstadosRepartidor(localActivo),
        ]);

        const data = pedidosRes.status === 'fulfilled' && Array.isArray(pedidosRes.value?.data)
          ? pedidosRes.value.data
          : [];
        setPedidos(data);
        setResumen(
          resumenRes.status === 'fulfilled'
            ? (resumenRes.value?.data || { totalHistorico: 0, totalMes: 0, totalMesEntregados: 0 })
            : { totalHistorico: 0, totalMes: 0, totalMesEntregados: 0 }
        );
        setRepartidores(
          repartidoresRes.status === 'fulfilled' && Array.isArray(repartidoresRes.value?.data)
            ? repartidoresRes.value.data
            : []
        );
        setEstadosDisponibles(
          estadosRes.status === 'fulfilled' && Array.isArray(estadosRes.value?.data?.estados)
            ? estadosRes.value.data.estados.map((e) => String(e).toLowerCase())
            : []
        );
        pedidosCargados = data;

        if (pedidosRes.status === 'rejected') {
          const apiMsg = pedidosRes.reason?.response?.data?.error || '';
          setError(apiMsg || 'No se pudieron cargar los repartos');
        } else if (estadosRes.status === 'rejected') {
          setError('');
        }
      }
      const abiertos = pedidosCargados
        .filter((p) => !ESTADOS_CERRADOS.has(String(p?.estado_pedido || '').toLowerCase()))
        .sort((a, b) => new Date(b?.fecha || 0).getTime() - new Date(a?.fecha || 0).getTime());

      const nuevo = abiertos.find((p) => p?._id && !seenRef.current.has(String(p._id)));
      if (nuevo) {
        setAlertaPedido(nuevo);
        emitirSonidoNuevoPedido();
        seenRef.current.add(String(nuevo._id));
        persistSeen();
      }
    } catch (err) {
      setError(err?.response?.data?.error || 'No se pudieron cargar los repartos');
    } finally {
      if (mostrarLoading) setLoading(false);
    }
  };

  useEffect(() => {
    if (!permitido) return undefined;
    cargarBase();
    const id = setInterval(() => {
      cargarBase({ mostrarLoading: false });
    }, 5000);
    return () => clearInterval(id);
  }, [mes, rol, localRepartidor, localesDisponibles.length, modoTodosLocales]);

  const pedidosOrdenados = useMemo(() => {
    return [...pedidos].sort((a, b) => new Date(b?.fecha || 0).getTime() - new Date(a?.fecha || 0).getTime());
  }, [pedidos]);

  const pedidosFiltrados = useMemo(() => {
    if (tab === 'cerrados') {
      return pedidosOrdenados.filter((p) => ESTADOS_CERRADOS.has(String(p?.estado_pedido || '').toLowerCase()));
    }
    return pedidosOrdenados.filter((p) => !ESTADOS_CERRADOS.has(String(p?.estado_pedido || '').toLowerCase()));
  }, [pedidosOrdenados, tab]);

  const pedidosPorLocal = useMemo(() => {
    if (!modoTodosLocales) return [];
    const grupos = new Map();
    for (const pedido of pedidosFiltrados) {
      const localId = getPedidoLocalId(pedido) || 'sin_local';
      const localNombre = pedido?.__localNombre || 'Local';
      if (!grupos.has(localId)) {
        grupos.set(localId, { localId, localNombre, pedidos: [] });
      }
      grupos.get(localId).pedidos.push(pedido);
    }
    return Array.from(grupos.values()).sort((a, b) => a.localNombre.localeCompare(b.localNombre));
  }, [modoTodosLocales, pedidosFiltrados]);

  const opcionesEstado = useMemo(() => {
    if (!Array.isArray(estadosDisponibles) || estadosDisponibles.length === 0) return ESTADOS_REPARTIDOR_UI;
    const fromConfig = ESTADOS_REPARTIDOR_UI.filter((e) => estadosDisponibles.includes(e.value));
    return fromConfig.length > 0 ? fromConfig : ESTADOS_REPARTIDOR_UI;
  }, [estadosDisponibles]);

  const cambiarEstado = async (id, estado) => {
    try {
      const pedido = pedidos.find((item) => item?._id === id);
      const localId = getPedidoLocalId(pedido);
      await actualizarEstadoPedido(id, { estado, nota: notaEstado }, localId || undefined);
      setNotaEstado('');
      await cargarBase({ mostrarLoading: false });
    } catch (err) {
      alert(err?.response?.data?.error || 'No se pudo cambiar el estado');
    }
  };

  const cambiarRepartidor = async (id, repartidorId) => {
    try {
      const pedido = pedidos.find((item) => item?._id === id);
      const localId = getPedidoLocalId(pedido);
      await asignarRepartidorConLocal(id, repartidorId || null, localId || undefined);
      await cargarBase({ mostrarLoading: false });
    } catch (err) {
      alert(err?.response?.data?.error || 'No se pudo asignar repartidor');
    }
  };

  const abrirDetallePedido = (pedido, { moverALocalPedido = false } = {}) => {
    if (!pedido) return;
    if (moverALocalPedido && requiereSelectorLocal) {
      const localIdPedido = getPedidoLocalId(pedido);
      if (localIdPedido) {
        setLocalRepartidor(localIdPedido);
        localStorage.setItem('localSeleccionadoRepartidor', JSON.stringify(localIdPedido));
      }
    }
    setTab('abiertos');
    setDetallePedido(pedido);
  };

  if (!usuario) return <Navigate to="/login" replace />;
  if (!permitido) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="error">Tu rol actual no tiene acceso a este modulo.</Alert>
        <Button sx={{ mt: 2 }} variant="outlined" onClick={logout}>Cerrar sesion</Button>
      </Box>
    );
  }

  return (
    <Box>
      <AppBar position="static" color="default" elevation={1}>
        <Toolbar sx={{ display: 'flex', justifyContent: 'space-between', gap: 1, flexWrap: 'wrap' }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700 }}>Dashboard Repartidores</Typography>
            <Typography variant="caption" color="text.secondary">
              {usuario?.nombre || usuario?.email} ({rol})
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Button variant="outlined" onClick={() => cargarBase()}>Actualizar</Button>
            <Button color="error" variant="contained" onClick={logout}>Salir</Button>
          </Stack>
        </Toolbar>
      </AppBar>

      <Box sx={{ p: { xs: 1.25, md: 2 } }}>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

        <Paper sx={{ p: 2, mb: 2 }}>
          <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.2} alignItems={{ xs: 'stretch', md: 'center' }}>
            {requiereSelectorLocal && (
              <FormControl sx={{ minWidth: 240 }} size="small">
                <InputLabel>Local activo</InputLabel>
                <Select
                  label="Local activo"
                  value={localRepartidor}
                  onChange={(e) => {
                    const value = e.target.value;
                    setLocalRepartidor(value);
                    localStorage.setItem('localSeleccionadoRepartidor', JSON.stringify(value));
                  }}
                >
                  {requiereSelectorLocal && (
                    <MenuItem value={TODOS_LOCALES}>Todos los locales</MenuItem>
                  )}
                  {localesDisponibles.map((local) => (
                    <MenuItem key={local._id} value={local._id}>{local.nombre}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            <TextField
              type="month"
              label="Mes"
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              sx={{ minWidth: 180 }}
              InputLabelProps={{ shrink: true }}
            />
            <Chip label={`Repartos mes: ${Number(resumen?.totalMes || 0)}`} color="info" />
            <Chip label={`Entregados mes: ${Number(resumen?.totalMesEntregados || 0)}`} color="success" />
            <Chip label={`Total historico: ${Number(resumen?.totalHistorico || 0)}`} color="primary" />
          </Stack>
        </Paper>

        <Paper sx={{ mb: 2 }}>
          <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="fullWidth">
            <Tab value="abiertos" label="Activos" />
            <Tab value="cerrados" label="Completados/Cancelados" />
          </Tabs>
        </Paper>

        <Box sx={{ display: { xs: 'block', md: 'none' } }}>
          <Stack spacing={1.2}>
            {pedidosFiltrados.map((p) => (
              <Card key={p._id} variant="outlined" sx={{ borderRadius: 2 }}>
                <CardContent sx={{ p: 1.5 }}>
                  <Stack spacing={1}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Typography sx={{ fontWeight: 700 }}>#{p?.numero_pedido || String(p?._id || '').slice(-6)}</Typography>
                      <Chip size="small" color={estadoColor(p?.estado_pedido)} label={getEstadoLabel(p?.estado_pedido)} />
                    </Stack>
                    <Typography variant="body2">{new Date(p?.fecha || Date.now()).toLocaleString()}</Typography>
                    {modoTodosLocales && (
                      <Typography variant="body2"><strong>Local:</strong> {p?.__localNombre || '-'}</Typography>
                    )}
                    <Divider />
                    <Typography variant="body2"><strong>Cliente:</strong> {p?.cliente_nombre || '-'}</Typography>
                    <Typography variant="body2"><strong>Telefono:</strong> {p?.cliente_telefono || '-'}</Typography>
                    <Typography variant="body2"><strong>Direccion:</strong> {getDireccionPedido(p)}</Typography>
                    <Typography variant="body2"><strong>Total:</strong> ${Number(p?.total || 0).toLocaleString('es-CL')}</Typography>

                    {esAdmin && (
                      <FormControl fullWidth size="small">
                        <InputLabel>Asignado</InputLabel>
                        <Select
                          label="Asignado"
                          value={p?.repartidor_asignado?._id || ''}
                          onChange={(e) => cambiarRepartidor(p._id, e.target.value)}
                        >
                          <MenuItem value="">Sin asignar</MenuItem>
                          {repartidores.map((r) => (
                            <MenuItem key={r._id} value={r._id}>{r.nombre || r.email}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    )}

                    <FormControl size="small" fullWidth>
                      <InputLabel>Estado</InputLabel>
                      <Select
                        label="Estado"
                        value={String(p?.estado_pedido || 'pendiente').toLowerCase()}
                        onChange={(e) => cambiarEstado(p._id, e.target.value)}
                      >
                        {opcionesEstado.map((estado) => (
                          <MenuItem key={estado.value} value={estado.value}>{estado.label}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    <Button
                      variant="outlined"
                      size="small"
                      onClick={() => abrirDetallePedido(p)}
                    >
                      Ver info
                    </Button>
                  </Stack>
                </CardContent>
              </Card>
            ))}
            {pedidosFiltrados.length === 0 && (
              <Paper variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                {loading ? 'Cargando...' : 'No hay repartos en esta vista.'}
              </Paper>
            )}
          </Stack>
        </Box>

        <Box sx={{ display: { xs: 'none', md: 'block' } }}>
          {modoTodosLocales ? (
            <Stack spacing={2}>
              {pedidosPorLocal.map((grupo) => (
                <Paper key={grupo.localId} sx={{ overflowX: 'auto', p: 1 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 700, px: 1, py: 0.5 }}>
                    {grupo.localNombre}
                  </Typography>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>N orden</TableCell>
                        <TableCell>Fecha</TableCell>
                        <TableCell>Cliente</TableCell>
                        <TableCell>Telefono</TableCell>
                        <TableCell>Direccion</TableCell>
                        <TableCell>Total</TableCell>
                        <TableCell>Estado</TableCell>
                        <TableCell>Repartidor</TableCell>
                        <TableCell>Acciones</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {grupo.pedidos.map((p) => (
                        <TableRow key={p._id} hover>
                          <TableCell>#{p?.numero_pedido || String(p?._id || '').slice(-6)}</TableCell>
                          <TableCell>{new Date(p?.fecha || Date.now()).toLocaleString()}</TableCell>
                          <TableCell>{p?.cliente_nombre || '-'}</TableCell>
                          <TableCell>{p?.cliente_telefono || '-'}</TableCell>
                          <TableCell>{getDireccionPedido(p)}</TableCell>
                          <TableCell>${Number(p?.total || 0).toLocaleString('es-CL')}</TableCell>
                          <TableCell>
                            <Chip size="small" color={estadoColor(p?.estado_pedido)} label={getEstadoLabel(p?.estado_pedido)} />
                          </TableCell>
                          <TableCell>
                            {esAdmin ? (
                              <FormControl fullWidth size="small">
                                <InputLabel>Asignado</InputLabel>
                                <Select
                                  label="Asignado"
                                  value={p?.repartidor_asignado?._id || ''}
                                  onChange={(e) => cambiarRepartidor(p._id, e.target.value)}
                                >
                                  <MenuItem value="">Sin asignar</MenuItem>
                                  {repartidores.map((r) => (
                                    <MenuItem key={r._id} value={r._id}>{r.nombre || r.email}</MenuItem>
                                  ))}
                                </Select>
                              </FormControl>
                            ) : (
                              p?.repartidor_asignado?.nombre || 'Sin asignar'
                            )}
                          </TableCell>
                          <TableCell>
                            <Stack direction="row" spacing={1} alignItems="center">
                              <FormControl size="small" sx={{ minWidth: 220 }}>
                                <InputLabel>Estado</InputLabel>
                                <Select
                                  label="Estado"
                                  value={String(p?.estado_pedido || 'pendiente').toLowerCase()}
                                  onChange={(e) => cambiarEstado(p._id, e.target.value)}
                                >
                                  {opcionesEstado.map((estado) => (
                                    <MenuItem key={estado.value} value={estado.value}>{estado.label}</MenuItem>
                                  ))}
                                </Select>
                              </FormControl>
                              <Button variant="outlined" size="small" onClick={() => abrirDetallePedido(p)}>
                                Ver info
                              </Button>
                            </Stack>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Paper>
              ))}
              {pedidosPorLocal.length === 0 && (
                <Paper sx={{ p: 2 }}>
                  <Typography align="center">{loading ? 'Cargando...' : 'No hay repartos en esta vista.'}</Typography>
                </Paper>
              )}
            </Stack>
          ) : (
            <Paper sx={{ overflowX: 'auto' }}>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>N orden</TableCell>
                    <TableCell>Fecha</TableCell>
                    <TableCell>Cliente</TableCell>
                    <TableCell>Telefono</TableCell>
                    <TableCell>Direccion</TableCell>
                    <TableCell>Total</TableCell>
                    <TableCell>Estado</TableCell>
                    <TableCell>Repartidor</TableCell>
                    <TableCell>Acciones</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pedidosFiltrados.map((p) => (
                    <TableRow key={p._id} hover>
                      <TableCell>#{p?.numero_pedido || String(p?._id || '').slice(-6)}</TableCell>
                      <TableCell>{new Date(p?.fecha || Date.now()).toLocaleString()}</TableCell>
                      <TableCell>{p?.cliente_nombre || '-'}</TableCell>
                      <TableCell>{p?.cliente_telefono || '-'}</TableCell>
                      <TableCell>{getDireccionPedido(p)}</TableCell>
                      <TableCell>${Number(p?.total || 0).toLocaleString('es-CL')}</TableCell>
                      <TableCell>
                        <Chip size="small" color={estadoColor(p?.estado_pedido)} label={getEstadoLabel(p?.estado_pedido)} />
                      </TableCell>
                      <TableCell>
                        {esAdmin ? (
                          <FormControl fullWidth size="small">
                            <InputLabel>Asignado</InputLabel>
                            <Select
                              label="Asignado"
                              value={p?.repartidor_asignado?._id || ''}
                              onChange={(e) => cambiarRepartidor(p._id, e.target.value)}
                            >
                              <MenuItem value="">Sin asignar</MenuItem>
                              {repartidores.map((r) => (
                                <MenuItem key={r._id} value={r._id}>{r.nombre || r.email}</MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        ) : (
                          p?.repartidor_asignado?.nombre || 'Sin asignar'
                        )}
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <FormControl size="small" sx={{ minWidth: 220 }}>
                            <InputLabel>Estado</InputLabel>
                            <Select
                              label="Estado"
                              value={String(p?.estado_pedido || 'pendiente').toLowerCase()}
                              onChange={(e) => cambiarEstado(p._id, e.target.value)}
                            >
                              {opcionesEstado.map((estado) => (
                                <MenuItem key={estado.value} value={estado.value}>{estado.label}</MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                          <Button variant="outlined" size="small" onClick={() => abrirDetallePedido(p)}>
                            Ver info
                          </Button>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))}
                  {pedidosFiltrados.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={9} align="center">{loading ? 'Cargando...' : 'No hay repartos en esta vista.'}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Paper>
          )}
        </Box>

        <Paper sx={{ p: 2, mt: 2 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>Nota para proximo cambio de estado (opcional)</Typography>
          <TextField
            placeholder="Ej: Cliente no respondio, se reagenda entrega..."
            value={notaEstado}
            onChange={(e) => setNotaEstado(e.target.value)}
            fullWidth
          />
        </Paper>
      </Box>

      <Dialog open={Boolean(alertaPedido)} onClose={() => setAlertaPedido(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Nuevo pedido de reparto</DialogTitle>
        <DialogContent>
          {alertaPedido && (
            <Stack spacing={1} sx={{ mt: 0.5 }}>
              <Typography><strong>Pedido:</strong> #{alertaPedido?.numero_pedido || String(alertaPedido?._id || '').slice(-6)}</Typography>
              <Typography><strong>Cliente:</strong> {alertaPedido?.cliente_nombre || '-'}</Typography>
              <Typography><strong>Telefono:</strong> {alertaPedido?.cliente_telefono || '-'}</Typography>
              <Typography><strong>Direccion:</strong> {getDireccionPedido(alertaPedido)}</Typography>
              <Typography><strong>Total:</strong> ${Number(alertaPedido?.total || 0).toLocaleString('es-CL')}</Typography>
              <Typography><strong>Estado:</strong> {getEstadoLabel(alertaPedido?.estado_pedido)}</Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAlertaPedido(null)}>Cerrar</Button>
          <Button
            variant="contained"
            onClick={() => {
              abrirDetallePedido(alertaPedido, { moverALocalPedido: true });
              setAlertaPedido(null);
            }}
          >
            Aceptar y ver datos
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(detallePedido)} onClose={() => setDetallePedido(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Detalle de reparto</DialogTitle>
        <DialogContent>
          {detallePedido && (
            <Stack spacing={1} sx={{ mt: 0.5 }}>
              <Typography><strong>Pedido:</strong> #{detallePedido?.numero_pedido || String(detallePedido?._id || '').slice(-6)}</Typography>
              <Typography><strong>Cliente:</strong> {detallePedido?.cliente_nombre || '-'}</Typography>
              <Typography><strong>Telefono:</strong> {detallePedido?.cliente_telefono || '-'}</Typography>
              <Typography><strong>Direccion:</strong> {getDireccionPedido(detallePedido)}</Typography>
              <Typography><strong>Total:</strong> ${Number(detallePedido?.total || 0).toLocaleString('es-CL')}</Typography>
              <Typography><strong>Estado:</strong> {getEstadoLabel(detallePedido?.estado_pedido)}</Typography>
              <Typography variant="subtitle2" sx={{ mt: 1 }}>Productos</Typography>
              {(detallePedido?.productos || []).map((item, idx) => (
                <Typography key={`${detallePedido?._id || 'pedido'}_${idx}`} variant="body2">
                  {item?.cantidad || 1}x {item?.nombre || 'Producto'} {item?.observacion ? `(${item.observacion})` : ''}
                </Typography>
              ))}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDetallePedido(null)}>Cerrar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
