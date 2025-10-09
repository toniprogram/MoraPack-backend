import dayjs from "dayjs";
import "dayjs/locale/es";
import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";

export default function Navbar() {
  const [status, setStatus] = useState(true);
  const [time, setTime] = useState("");

  useEffect(() => {
    dayjs.locale("es");

    const updateTime = () => {
      setTime(dayjs().format("DD MMM YYYY, HH:mm"));
    };

    updateTime();
    const interval = setInterval(updateTime, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="navbar bg-primary px-4">
      {/* Izquierda: Logo y nombre */}
      <div className="navbar-start">
          <img
            src="/MoraPackLogo.png"
            alt="Logo"
            className="w-10 h-10 rounded-md"
          />
          <div className="flex flex-col leading-tight text-left">
            <span className="text-xl font-bold">MoraPack</span>
            <span className="text-sm opacity-80">SkyRoute System</span>
          </div>
      </div>
      {/* Centro: Botones de Navegación */}
      <div className="navbar-center">
        <ul className="menu menu-horizontal px-1 gap-2">
          <li>
            <NavLink
              to="/rutas"
              className={({ isActive }) =>
                `btn btn-ghost ${isActive ? "btn-active" : ""}`
              } 
            >
              Pedidos
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/paquetes"
              className={({ isActive }) =>
                `btn btn-ghost ${isActive ? "btn-active" : ""}`
              }
            >
              Vuelos
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/reportes"
              className={({ isActive }) =>
                `btn btn-ghost ${isActive ? "btn-active" : ""}`
              }
            >
              Simulación
            </NavLink>
          </li>
        </ul>
      </div>

      {/* Derecha: Estado del sistema y usuario */}
      <div className="navbar-end">
        {/* 🟢 Estado del sistema + fecha */}
        <div className="flex flex-col items-end mr-4 text-right leading-tight">
          <span className={`text-sm font-semibold ${status ? "text-success" : "text-error"}`}>
            ● {status ? "Conectado" : "Desconectado"}
          </span>
          <span className="text-xs opacity-80">{time}</span>
        </div>
        <div className="dropdown dropdown-end">
          <button className="btn btn-circle avatar">
            <img
              src="https://img.daisyui.com/images/stock/photo-1534528741775-53994a69daeb.webp"
              alt="User"
              className="rounded-full w-10 h-10"
            />
          </button>
          <ul className="dropdown-content menu bg-base-100 rounded-box z-10 mt-3 w-30 shadow">
          {/*Luego hay que modificar esto para que redirija a las páginas correspondientes*/}
            <li><a>Profile</a></li> 
            <li><a>Logout</a></li>
          </ul>
        </div>
      </div>
    </div>
  );
}
