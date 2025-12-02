import type { Airport } from '../../types/airport';

interface SidebarAeropuertosPanelProps {
  aeropuertos: Airport[];
}

export function SidebarAeropuertosPanel({ aeropuertos }: SidebarAeropuertosPanelProps) {
  return (
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
  );
}
