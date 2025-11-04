export interface Aeropuerto {
  id: number;
  codigo: string;
  nombre: string;
  gmt: number;
  almacenCapacidad: number;
  latitud: number;
  longitud: number;
  continente: string;
  esExportador: boolean;
  flg_activo: boolean;
}