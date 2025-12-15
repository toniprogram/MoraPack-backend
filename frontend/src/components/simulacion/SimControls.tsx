import { Play, Pause, XCircle } from 'lucide-react';

interface SimControlsProps {
  estaActivo: boolean;
  estaVisualizando: boolean;
  animPaused: boolean;
  isStarting: boolean;
  estaSincronizando: boolean;
  onIniciar: () => void;
  onTerminar: () => void;
  onPausar: () => void;
}

export function SimControls({
  estaActivo,
  estaVisualizando,
  animPaused,
  isStarting,
  estaSincronizando,
  onIniciar,
  onTerminar,
  onPausar,
}: SimControlsProps) {
  const controlIsDisabled = estaSincronizando || isStarting;
  const terminarDisabled = isStarting ? true : (!estaActivo && !estaVisualizando);
  const isPaused = animPaused || (!estaActivo && !estaVisualizando);
  const playPauseIcon = isPaused ? <Play size={16} /> : <Pause size={16} />;
  const playPauseClass = isPaused ? 'btn-success' : (estaActivo ? 'btn-warning' : 'btn-success');

  return (
    <div className="flex gap-2">
      <button
        className={`btn btn-sm flex-1 ${playPauseClass}`}
        onClick={() => {
          if (!estaActivo && !estaVisualizando) {
            onIniciar();
          } else {
            onPausar();
          }
        }}
        disabled={controlIsDisabled}
      >
        {isPaused ? (
          <span className="flex items-center gap-2">
            <Play size={16} /> <span>{isStarting ? 'Preparando...' : (estaVisualizando ? 'Reanudar' : 'Iniciar')}</span>
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Pause size={16} /> <span>Pausar</span>
          </span>
        )}
      </button>

      <button
        className="btn btn-sm btn-error flex-1"
        onClick={onTerminar}
        disabled={terminarDisabled}
      >
        <XCircle size={16} /> Terminar
      </button>
    </div>
  );
}
