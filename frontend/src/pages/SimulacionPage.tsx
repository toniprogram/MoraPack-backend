import { useSimulacion } from '../hooks/useSimulacion';
import { MapaVuelos } from '../components/mapas/MapaVuelos';
import { ControlesSimulacion } from '../components/simulacion/ControlesSimulacion';

export default function SimulacionPage() {
  // 1. Llama al hook que maneja toda la lógica
  const {
    vuelos,
    aeropuertos,
    isLoading,
    isError,
    estaActivo,
    iniciar,
    pausar,
    reiniciar,
  } = useSimulacion();

  // 2. Manejo de estados de carga y error
  if (isLoading) {
    return <div className="p-6 text-center">Cargando datos del escenario...</div>;
  }
  if (isError) {
    return <div className="p-6 text-center text-error">Error al cargar el escenario.</div>;
  }

  // 3. Renderiza los componentes
  return (
    <div className="relative w-full h-screen">
      <ControlesSimulacion
        estaActivo={estaActivo}
        onIniciar={iniciar}
        onPausar={pausar}
        onReiniciar={reiniciar}
      />
      <MapaVuelos vuelos={vuelos} aeropuertos={aeropuertos} />
    </div>
  );
}