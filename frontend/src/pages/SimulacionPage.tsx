import { useState, useMemo, useRef, useEffect } from 'react';
import type { ChangeEvent } from 'react';
import { useSimulacion } from '../hooks/useSimulacion';
import { MapaVuelos } from '../components/mapas/MapaVuelos';
import { Check, AlertTriangle, Play, Pause, XCircle, Package, Plane } from 'lucide-react';
import type { OrderRequest } from '../types/orderRequest';
import type { SimulationOrderPlan, SimulationSnapshot } from '../types/simulation';

// Interfaz extendida para mantener fechas originales del archivo TXT
interface OrderRequestExtended extends OrderRequest {
  fechaOriginal: string;
}

export default function SimulacionPage() {
  const {
      aeropuertos,
      activeSegments,
      reloj,
      isLoading,
      isStarting,
      isError,
      estaActivo,
      estaVisualizando,
      iniciar,
      pausar,
      terminar,
      snapshotFinal,
      snapshotVisible,
      snapshotProgreso,
      vuelosEnMovimiento,
      hasSnapshots,
      tiempoSimulado,
      simSpeed,
      setSimSpeed,
      status,
  } = useSimulacion();

  const [ordenesParaSimular, setOrdenesParaSimular] = useState<OrderRequestExtended[]>([]);
  const [vistaPanel, setVistaPanel] = useState<'envios' | 'vuelos' | 'aeropuertos'>('envios');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [estaSincronizando] = useState(false);
  const [, setProyeccionGuardada] = useState(false);

  const [filtroHub, setFiltroHub] = useState<string>('');
  const [dialogInfo, setDialogInfo] = useState<{ titulo: string; mensaje: string } | null>(null);
  const startSimRef = useRef<number | null>(null);
  const startRealRef = useRef<number | null>(null);

  const formatoInputDesdeIso = (iso: string) => iso.slice(0, 16);
  const ensureSeconds = (value?: string) => {
    if (!value) return undefined;
    return value.length === 16 ? `${value}:00` : value;
  };

  const actualizarRangoSimulacion = (ordenes: OrderRequestExtended[]) => {
    if (!ordenes.length) {
      setStartDate('');
      setEndDate('');
      return;
    }
    const sorted = [...ordenes].sort((a, b) =>
      new Date(`${a.creationLocal}Z`).getTime() - new Date(`${b.creationLocal}Z`).getTime()
    );
    setStartDate(formatoInputDesdeIso(sorted[0].creationLocal));
    setEndDate(formatoInputDesdeIso(sorted[sorted.length - 1].creationLocal));
  };

  const fechasOriginalesPorOrden = useMemo(() => {
    const mapa = new Map<string, { fecha: Date; fechaStr: string }>();
    ordenesParaSimular.forEach(orden => {
      mapa.set(orden.id, {
        fecha: new Date(orden.fechaOriginal),
        fechaStr: orden.fechaOriginal
      });
    });
    return mapa;
  }, [ordenesParaSimular]);

  const panelSnapshot: SimulationSnapshot | null =
    snapshotVisible ?? snapshotProgreso ?? snapshotFinal ?? null;
  type EnvioInfo = {
    plan: SimulationOrderPlan;
    estado: 'A tiempo' | 'Retrasado' | 'En proceso';
    creationMs: number;
    arrivalMs: number;
  };
  const enviosHistoricos = useRef<Map<string, EnvioInfo>>(new Map());

  // Agrupa pedidos por vuelo, mostrando horas UTC
  type FlightGroup = {
    flightId: string;
    origen: string;
    destino: string;
    pedidos: string[];
    hora: string;
    fecha: string;
    departureUtc: string;
    arrivalUtc: string;
    horaLlegada: string;
  };

  const vuelosPorFlightId = useMemo<Map<string, FlightGroup>>(() => {
    if (!panelSnapshot) return new Map();
    const mapa = new Map<string, FlightGroup>();

    panelSnapshot.orderPlans.forEach(plan => {
      plan.routes.forEach(ruta => {
        ruta.segments.forEach(segmento => {
          if (!segmento.departureUtc || !segmento.arrivalUtc) {
            return;
          }

          const uniqueFlightId = segmento.departureUtc;
          const diaVuelo = new Date(segmento.departureUtc).toLocaleDateString('es-PE', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                timeZone: 'UTC'
              });
          const horaSalida = new Date(segmento.departureUtc).toLocaleTimeString('es-PE', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'UTC'
              });
          const horaLlegada = new Date(segmento.arrivalUtc).toLocaleTimeString('es-PE', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'UTC'
              });
          if (!mapa.has(uniqueFlightId)) {
            mapa.set(uniqueFlightId, {
              flightId: segmento.flightId,
              origen: segmento.origin,
              destino: segmento.destination,
              pedidos: [],
              hora: horaSalida,
              fecha: diaVuelo,
              departureUtc: segmento.departureUtc,
              arrivalUtc: segmento.arrivalUtc,
              horaLlegada: horaLlegada
            });
          }
          const vueloData = mapa.get(uniqueFlightId)!;
          if (!vueloData.pedidos.includes(plan.orderId)) {
            vueloData.pedidos.push(plan.orderId);
          }
        });
      });
    });
    return mapa;
  }, [panelSnapshot]);

  // --- LÓGICA DE FILTRADO Y ORDEN PARA LOS PANELES ---
  const enviosFiltrados = useMemo(() => {
    if (!panelSnapshot) return [];
    const term = '';
    const currentMs = tiempoSimulado
      ? tiempoSimulado.getTime()
      : panelSnapshot?.generatedAt
        ? Date.parse(panelSnapshot.generatedAt)
        : 0;

    const prev = enviosHistoricos.current;
    const next = new Map(prev);
    const vistos = new Set<string>();

    panelSnapshot.orderPlans.forEach(plan => {
      const matchSearch = term === '' || plan.orderId.toLowerCase().includes(term);
      const matchHub = filtroHub === '' || plan.routes.some(ruta =>
        ruta.segments.some(seg => seg.origin === filtroHub)
      );
      if (!matchSearch || !matchHub) return;

      const idBase = plan.orderId.split('_')[0];
      const fechaOriginalData = fechasOriginalesPorOrden.get(plan.orderId) || fechasOriginalesPorOrden.get(idBase);
      const creationMs = fechaOriginalData?.fecha.getTime() ?? 0;
      const segmentos = plan.routes?.flatMap(r => r.segments ?? []) ?? [];
      const arrivalMs = segmentos.reduce((max, seg) => {
        const arr = seg?.arrivalUtc ? Date.parse(seg.arrivalUtc) : NaN;
        return Number.isNaN(arr) ? max : Math.max(max, arr);
      }, 0);

      let estado: EnvioInfo['estado'] = 'En proceso';
      if (arrivalMs && currentMs >= arrivalMs) {
        estado = plan.slackMinutes <= 0 ? 'Retrasado' : 'A tiempo';
      }
      next.set(plan.orderId, { plan, estado, creationMs, arrivalMs });
      vistos.add(plan.orderId);
    });

    // Mantener los pedidos que ya no llegan en el snapshot (posiblemente completados)
    prev.forEach((info, id) => {
      if (vistos.has(id)) return;
      let estado: EnvioInfo['estado'] = info.estado;
      if (info.arrivalMs && currentMs >= info.arrivalMs) {
        estado = info.plan.slackMinutes <= 0 ? 'Retrasado' : 'A tiempo';
      }
      next.set(id, { ...info, estado });
    });

    enviosHistoricos.current = next;

    const lista: EnvioInfo[] = Array.from(next.values());

    lista.sort((a, b) => {
      // Entregados al final
      const deliveredA = a.estado !== 'En proceso';
      const deliveredB = b.estado !== 'En proceso';
      if (deliveredA !== deliveredB) return deliveredA ? 1 : -1;
      // Activos: más recientes arriba
      if (!deliveredA) return b.creationMs - a.creationMs;
      // Entregados: más recientes arriba
      return b.arrivalMs - a.arrivalMs;
    });

    return lista;
  }, [panelSnapshot, filtroHub, fechasOriginalesPorOrden, tiempoSimulado]);

  // KPIs basados en lo que se muestra actualmente
  const kpisVista = useMemo(() => {
    const entregas = enviosFiltrados.filter(e => e.estado === 'A tiempo').length;
    const retrasados = enviosFiltrados.filter(e => e.estado === 'Retrasado').length;
    return { entregas, retrasados };
  }, [enviosFiltrados]);

  const vuelosFiltrados = useMemo<FlightGroup[]>(() => {
    const term = '';

    return Array.from(vuelosPorFlightId.values())
      .filter(vuelo => {
        // Filtro por término de búsqueda (ID de pedido en el vuelo)
        const matchSearch = term === '' || vuelo.pedidos.some(pedidoId => pedidoId.toLowerCase().includes(term));

        // Filtro por Hub de origen
        const matchHub = filtroHub === '' || vuelo.origen === filtroHub;

        return matchSearch && matchHub;
      })
      .sort((a, b) => {
        const dateA = a.departureUtc ? new Date(a.departureUtc).getTime() : 0;
        const dateB = b.departureUtc ? new Date(b.departureUtc).getTime() : 0;
        return dateA - dateB;
      });
  }, [vuelosPorFlightId, filtroHub]);

  // Lógica de carga de archivo
  const handleArchivoCargado = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim() !== '');

    try {
      const ordenesParseadas: OrderRequestExtended[] = lines.map(line => {
        const parts = line.split('-');

        if (parts.length < 7) throw new Error(`Línea inválida: "${line}"`);

        const id = parts[0].trim();
        const datePart = parts[1].trim();
        const hourPart = parts[2].trim();
        const minutePart = parts[3].trim();
        const dest = parts[4].trim();
        const qty = parts[5].trim();
        const ref = parts[6].trim();

        const year = datePart.substring(0, 4);
        const month = datePart.substring(4, 6);
        const day = datePart.substring(6, 8);

        const isoDate = `${year}-${month}-${day}`;
        const isoTime = `${hourPart.padStart(2, '0')}:${minutePart.padStart(2, '0')}:00`;
        const creationLocal = `${isoDate}T${isoTime}`;

        const quantity = parseInt(qty, 10);
        if (isNaN(quantity)) throw new Error(`Cantidad inválida: "${qty}"`);

        return {
          id: id,
          customerReference: ref,
          destinationAirportCode: dest,
          quantity: quantity,
          creationLocal: creationLocal,
          fechaOriginal: creationLocal
        };
      });
      setOrdenesParaSimular(ordenesParseadas);
      actualizarRangoSimulacion(ordenesParseadas);
      setProyeccionGuardada(false);
      alert(`Se cargaron ${ordenesParseadas.length} órdenes correctamente`);

    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.error('❌ Error al parsear archivo:', e);
      alert(`❌ Error: ${message}`);
      setOrdenesParaSimular([]);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleIniciarSimulacion = () => {
    const startUtc = ensureSeconds(startDate);
    const endUtc = ensureSeconds(endDate);
    startSimRef.current = startUtc ? Date.parse(startUtc) : null;
    const payload = {
      startDate: startUtc,
      endDate: endUtc,
      windowMinutes: 180,
    };
    iniciar(payload, { start: startUtc, end: endUtc });
  };

  const handleTerminarSimulacion = async () => {
    await terminar();
    startSimRef.current = null;
    setDialogInfo({
      titulo: 'Simulación terminada',
      mensaje: 'Se detuvo la simulación actual. Ahora puedes modificar los datos o iniciar una nueva corrida.',
    });
  };

  const handleCerrarDialogo = () => setDialogInfo(null);

  useEffect(() => {
    if (status === 'completed') {
      setDialogInfo({
        titulo: 'Simulación terminada',
        mensaje: 'La simulación finalizó correctamente. Puedes ajustar parámetros o comenzar otra simulación.',
      });
    }
  }, [status]);

  const formatElapsed = (elapsedMs: number) => {
    if (elapsedMs < 0 || !Number.isFinite(elapsedMs)) return '--:--:--';
    const hours = Math.floor(elapsedMs / 3_600_000);
    const minutes = Math.floor((elapsedMs % 3_600_000) / 60_000);
    const seconds = Math.floor((elapsedMs % 60_000) / 1000);
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  };

  if (isLoading) {
    return <div className="p-6 text-center">Cargando datos base...</div>;
  }
  if (isError) {
    return <div className="p-6 text-center text-red-500">Error al cargar datos.</div>;
  }
  const mostrandoOverlay = estaActivo && !hasSnapshots;

  return (
    <>
    <div className="flex h-screen w-full bg-base-200 text-base-content">

      {/* ========== PANEL LATERAL IZQUIERDO ========== */}
      <div className="w-80 bg-base-100 shadow-lg flex flex-col border-r border-base-300">

        {/* Header del Panel */}
        <div className="bg-primary text-primary-content p-4">
          {/*En esta posición un toggle para simulación semanal o hasta el colapso */}
          {/* Controles */}
          <div className="space-y-2">
            {ordenesParaSimular.length > 0 && (
              <div className="text-xs text-success-content text-center">
                 {ordenesParaSimular.length} órdenes listas para sincronizar
              </div>
            )}

            <div className="space-y-2 text-xs text-primary-content/90">
              <div>
                <label className="block uppercase tracking-wide text-[10px] text-primary-content/70 mb-1">
                  Inicio (UTC)
                </label>
                <input
                  type="datetime-local"
                  className="input input-sm w-full"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  disabled={estaActivo}
                />
              </div>
              <div>
                <label className="block uppercase tracking-wide text-[10px] text-primary-content/70 mb-1">
                  Fin (UTC)
                </label>
                <input
                  type="datetime-local"
                  className="input input-sm w-full"
                  value={endDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  disabled={estaActivo}
                />
                <p className="text-[10px] text-primary-content/70 mt-1">
                  Vacío = usa todo el rango de pedidos proyectados guardados.
                </p>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={handleArchivoCargado}
              disabled
            />

            <div className="flex gap-2">
              <button
                className={`btn btn-sm flex-1 ${estaActivo ? 'btn-warning' : 'btn-primary'}`}
                onClick={() => {
                  if (!estaActivo && !estaVisualizando) {
                    handleIniciarSimulacion();
                  } else {
                    pausar();
                  }
                }}
                disabled={estaSincronizando || isStarting}
              >
                {estaActivo ? (
                  <>
                    <Pause size={16} /> Pausar
                  </>
                ) : (
                  <>
                    <Play size={16} /> {isStarting ? 'Preparando...' : (estaVisualizando ? 'Reanudar' : 'Iniciar')}
                  </>
                )}
              </button>

              <button className="btn btn-sm btn-error flex-1" onClick={handleTerminarSimulacion}>
                <XCircle size={16} /> Terminar
              </button>
            </div>
          </div>
        </div>
        <div className="p-3 bg-base-200 border-b border-base-300 space-y-3">
          <h3 className="text-sm font-semibold text-base-content">Filtros de Visualización</h3>

          {/* Filtros de Hub */}
          <div>
            <label className="block uppercase tracking-wide text-[10px] text-base-content/70 mb-2">
              Hub de Origen
            </label>
            <select
              className="select select-sm w-full"
              value={filtroHub}
              onChange={(e) => setFiltroHub(e.target.value)}
              disabled={!panelSnapshot}
            >
              <option value="">Todos</option>
              <option value="SPIM">Lima (SPIM)</option>
              <option value="EBCI">Bruselas (EBCI)</option>
              <option value="UBBB">Baku (UBBB)</option>
            </select>
          </div>
        </div>

        {/* Tabs del Panel */}
        <div className="flex border-b border-base-300 bg-base-200">
          <button
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              vistaPanel === 'envios'
                ? 'border-b-2 border-primary text-primary bg-base-100'
                : 'text-base-content/60 hover:text-primary hover:bg-base-300'
            }`}
            onClick={() => setVistaPanel('envios')}
          >
            <Package size={16} className="inline mr-1" />
            Peds. ({enviosFiltrados.length})
          </button>
          <button
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              vistaPanel === 'vuelos'
                ? 'border-b-2 border-primary text-primary bg-base-100'
                : 'text-base-content/60 hover:text-primary hover:bg-base-300'
            }`}
            onClick={() => setVistaPanel('vuelos')}
          >
            <Plane size={16} className="inline mr-1" />
            Vuelos ({vuelosFiltrados.length})
          </button>
          <button
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              vistaPanel === 'aeropuertos'
                ? 'border-b-2 border-primary text-primary bg-base-100'
                : 'text-base-content/60 hover:text-primary hover:bg-base-300'
            }`}
            onClick={() => setVistaPanel('aeropuertos')}
          >
            Aeropuertos
          </button>
        </div>

        {/* Contenido del Panel */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-base-100">

          {/* ===== VISTA: ENVÍOS ===== */}
          {vistaPanel === 'envios' && (
            <>
              {(!panelSnapshot || panelSnapshot.orderPlans.length === 0) && (
                <div className="text-center text-base-content/60 py-8">
                  {ordenesParaSimular.length > 0
                    ? 'Sincroniza y presiona "Iniciar" para comenzar la simulación'
                    : 'Carga pedidos proyectados o usa los ya guardados para iniciar.'}
                </div>
              )}
              {panelSnapshot && enviosFiltrados.length === 0 && (
                 <div className="text-center text-base-content/60 py-8">
                  No se encontraron envíos con los filtros actuales.
                </div>
              )}

              {/* USAMOS enviosFiltrados en lugar de panelSnapshot.orderPlans */}
              {enviosFiltrados.map(({ plan, estado }) => {
                const primerSegmento = plan.routes[0]?.segments[0];
                const ultimoSegmento = plan.routes[plan.routes.length - 1]?.segments[
                  plan.routes[plan.routes.length - 1].segments.length - 1
                ];

                const estadoClase =
                  estado === 'A tiempo'
                    ? 'badge-success'
                    : estado === 'Retrasado'
                      ? 'badge-error'
                      : 'badge-warning';

                const idBase = plan.orderId.split('_')[0];
                const fechaOriginalData = fechasOriginalesPorOrden.get(plan.orderId) || fechasOriginalesPorOrden.get(idBase);

                let fechaRegistro = 'N/A';
                let horaRegistro = 'N/A';

                if (fechaOriginalData) {
                  fechaRegistro = fechaOriginalData.fecha.toLocaleDateString('es-PE', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric'
                  });
                  horaRegistro = fechaOriginalData.fecha.toLocaleTimeString('es-PE', {
                    hour: '2-digit',
                    minute: '2-digit'
                  });
                }

                return (
                  <div
                    key={plan.orderId}
                    className={`card bg-base-200 border-l-4 shadow-sm hover:shadow-md transition-shadow ${
                      estado === 'A tiempo'
                        ? 'border-success'
                        : estado === 'Retrasado'
                          ? 'border-error'
                          : 'border-warning'
                    }`}
                  >
                    <div className="card-body p-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-bold text-sm text-primary">
                            Pedido {plan.orderId}
                          </h3>
                          <p className="text-xs text-base-content/70">
                            Cantidad: {plan.routes.reduce((acc, r) => acc + r.quantity, 0) || 'N/A'}
                          </p>
                        </div>
                        <span className={`badge badge-sm ${estadoClase}`}>
                          {estado}
                        </span>
                      </div>

                        {/* Fecha y hora de REGISTRO */}
                        <div className="mt-2 pt-2 border-t border-base-300">
                          <p className="text-[10px] text-base-content/60 mb-1">Fecha de Registro:</p>
                          <div className="flex gap-3 text-xs">
                            <div>
                              <span className="text-base-content/70">📅</span> {fechaRegistro}
                            </div>
                            <div>
                              <span className="text-base-content/70">🕒</span> {horaRegistro}
                            </div>
                          </div>
                        </div>

                        <div className="text-xs mt-2 space-y-1">
                          <div className="flex justify-between">
                            <span className="text-base-content/70">Origen:</span>
                            <span className="font-semibold">{primerSegmento?.origin || 'N/A'}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-base-content/70">Destino:</span>
                            <span className="font-semibold">
                              {ultimoSegmento?.destination || 'N/A'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-base-content/70">Holgura:</span>
                            <span className={`font-semibold ${
                              estado === 'A tiempo'
                                ? 'text-success'
                                : estado === 'Retrasado'
                                  ? 'text-error'
                                  : 'text-warning'
                            }`}>
                              {plan.slackMinutes} min
                            </span>
                          </div>
                        </div>

                        {/* Ruta detallada */}
                        <div className="mt-2 pt-2 border-t border-base-300">
                          <p className="text-xs font-semibold text-base-content/70 mb-1">
                            Ruta ({plan.routes.reduce((acc, r) => acc + r.segments.length, 0)} tramos):
                          </p>
                          {plan.routes.map((ruta, rutaIdx) => (
                            <div key={rutaIdx}>
                              {ruta.segments.map((seg, segIdx) => (
                                <div key={segIdx} className="text-xs text-base-content/70 ml-2 mb-1">
                                  • {seg.origin} → {seg.destination}
                                  {seg.departureUtc && seg.arrivalUtc && (
                                    <span className="text-[10px] text-base-content/60 ml-2">
                                      ({new Date(seg.departureUtc).toLocaleTimeString('es-PE', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        timeZone: 'UTC'
                                      })} - {new Date(seg.arrivalUtc).toLocaleTimeString('es-PE', {
                                        hour: '2-digit',
                                        minute: '2-digit',
                                        timeZone: 'UTC'
                                      })})
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                })
              }
            </>
          )}

          {/* ===== VISTA: VUELOS ===== */}
          {vistaPanel === 'vuelos' && (
            <>
              {vuelosPorFlightId.size === 0 && (
                <div className="text-center text-base-content/60 py-8">
                  No hay vuelos activos
                </div>
              )}
              {vuelosPorFlightId.size > 0 && vuelosFiltrados.length === 0 && (
                 <div className="text-center text-base-content/60 py-8">
                  No se encontraron vuelos con los filtros actuales.
                </div>
              )}

              {/* USAMOS vuelosFiltrados en lugar de Array.from(vuelosPorFlightId.values()) */}
              {vuelosFiltrados.map(vuelo => {
                  // Buscamos el vuelo en movimiento usando su ID único
                  const vueloEnCurso = vuelosEnMovimiento.find(v => v.id === vuelo.departureUtc);

                  return (
                    // El key debe ser único (departureUtc)
                    <div key={vuelo.departureUtc} className="card bg-base-200 shadow-sm hover:shadow-md transition-shadow">
                      <div className="card-body p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <Plane size={16} className="text-primary" />
                            <span className="font-bold text-sm text-primary">
                              {vuelo.origen} → {vuelo.destino}
                            </span>
                          </div>

                          {vueloEnCurso && (
                            <span className={`badge badge-xs ${
                              vueloEnCurso.progreso >= 100
                                ? 'badge-info'
                                : 'badge-success'
                            }`}>
                              {vueloEnCurso.progreso >= 100 ? 'Aterrizado' : 'En vuelo'}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-base-content/70 font-semibold mb-1">
                          📅 {vuelo.fecha}
                        </div>

                        <div className="flex justify-between text-xs text-base-content/60 mb-2">
                          <div>
                            <span className="text-base-content/60">Salida:</span> {vuelo.hora}
                          </div>
                          <div>
                            <span className="text-base-content/60">Llegada:</span> {vuelo.horaLlegada}
                          </div>
                        </div>

                        <div className="mt-2 pt-2 border-t border-base-300">
                          <p className="text-xs text-base-content/70 font-semibold mb-1">
                            Pedidos ({vuelo.pedidos.length}):
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {vuelo.pedidos.map(pedido => (
                              <span key={pedido} className="badge badge-xs bg-base-300 text-base-content border-base-200">
                                {pedido}
                              </span>
                            ))}
                          </div>
                        </div>

                        {vueloEnCurso && (
                          <div className="mt-3">
                            <div className="w-full bg-base-300 rounded-full h-2">
                              <div
                                className="bg-success h-2 rounded-full transition-all"
                                style={{ width: `${Math.min(vueloEnCurso.progreso, 100)}%` }}
                              />
                            </div>
                            <p className="text-xs text-base-content/70 mt-1 text-center">
                              {Math.round(vueloEnCurso.progreso)}%
                              {vueloEnCurso.progreso >= 100 && ' - Completado'}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
            </>
          )}

          {/* ===== VISTA: AEROPUERTOS ===== */}
          {vistaPanel === 'aeropuertos' && (
            <>
              {aeropuertos.map(aeropuerto => (
                <div key={aeropuerto.id} className="card bg-base-200 shadow-sm hover:shadow-md transition-shadow">
                  <div className="card-body p-3">
                    <h3 className="font-bold text-sm text-primary">{aeropuerto.id}</h3>
                    <p className="text-xs text-base-content/80">{aeropuerto.name}</p>
                    <div className="text-xs text-base-content/70 mt-1">
                      <div>Lat: {aeropuerto.latitude?.toFixed(4) ?? 'N/A'}</div>
                      <div>Lon: {aeropuerto.longitude?.toFixed(4) ?? 'N/A'}</div>
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* ========== ÁREA DEL MAPA ========== */}
      <div className="flex-1 flex flex-col">

          {/* Barra superior con KPIs y Reloj */}
          <div className="bg-base-100 shadow-md p-3 flex justify-between items-center z-10">
            <div className="flex gap-6 text-sm">
              <div className="flex items-center gap-2 tooltip" data-tip="A tiempo">
                <Check size={18} className="text-success" />
                <span className="font-mono font-semibold">{kpisVista.entregas}</span>
              </div>
              <div className="flex items-center gap-2 tooltip" data-tip="Retrasados">
                <AlertTriangle size={18} className="text-error" />
                <span className="font-mono font-semibold">{kpisVista.retrasados}</span>
              </div>
            </div>
          <div className="flex items-center gap-4">
            <div className="text-sm tooltip" data-tip="Órdenes procesadas por el backend">
              <span className="font-mono font-semibold">{reloj}</span>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <label className="text-base-content/70 text-xs uppercase tracking-wide">Velocidad</label>
              {estaActivo ? (
                <span className="badge badge-outline font-mono">{simSpeed}x</span>
              ) : (
                <>
                  <input
                    type="number"
                    className="input input-xs w-20"
                    min={50}
                    max={500}
                    step={50}
                    value={simSpeed}
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (isNaN(value)) return;
                      const clamped = Math.min(500, Math.max(50, value));
                      const snapped = Math.round(clamped / 50) * 50;
                      setSimSpeed(Math.min(500, Math.max(50, snapped)));
                    }}
                  />
                  <span className="text-xs text-base-content/60">x</span>
                </>
              )}
            </div>

            {/* Reloj Mundial UTC */}
            <div className="flex gap-2 items-center">
              {tiempoSimulado && (
                <>
                  <div className="badge badge-info">
                    📅 {tiempoSimulado.toLocaleDateString('es-PE', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                      timeZone: 'UTC'
                    })}
                  </div>
                  <div className="badge badge-success">
                    🕒 {tiempoSimulado.toLocaleTimeString('es-PE', {
                        hour: '2-digit',
                        minute: '2-digit',
                        timeZone: 'UTC'
                    })}
                  </div>
                </>
              )}
              {estaActivo && startRealRef.current !== null && (
                <div className="tooltip" data-tip="Tiempo real desde inicio">
                  <div className="badge badge-warning badge-outline">
                    ⏱️ {formatElapsed(Date.now() - startRealRef.current)}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mapa */}
        <div className="flex-1 relative">

          {/* Mostramos overlay de carga si el GA está corriendo */}
          {mostrandoOverlay && (
            <div className="absolute top-0 left-0 w-full h-full bg-base-300/80 z-[1000] flex items-center justify-center text-base-content p-8">
              <div className="text-center space-y-4">
                <div
                  className="animate-spin rounded-full h-24 w-24 border-8 border-primary border-t-transparent mx-auto"
                ></div>
                <h2 className="text-2xl font-semibold">Planificando Rutas...</h2>
                <p className="text-lg text-base-content/70">
                  El Sistema está procesando las órdenes.
                </p>
                <div className="stats bg-base-200 shadow-xl">
                  <div className="stat">
                    <div className="stat-title">Órdenes Procesadas</div>
                    <div className="stat-value text-primary">
                      {reloj}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          <MapaVuelos
            aeropuertos={aeropuertos}
            activeSegments={activeSegments}
            isLoading={isLoading || isStarting}
            vuelosEnMovimiento={vuelosEnMovimiento}
            filtroHubActivo={filtroHub}
          />
        </div>
      </div>
    </div>
    {dialogInfo && (
      <dialog className="modal" open>
        <div className="modal-box">
          <h3 className="font-bold text-lg mb-2">{dialogInfo.titulo}</h3>
          <p className="text-base-content/80">{dialogInfo.mensaje}</p>
          <div className="modal-action">
            <button className="btn btn-primary" onClick={handleCerrarDialogo}>Entendido</button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop">
          <button onClick={handleCerrarDialogo}>close</button>
        </form>
      </dialog>
    )}
    </>
  );
}
