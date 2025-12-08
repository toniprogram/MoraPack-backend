import dayjs from "dayjs";
import "dayjs/locale/es";
import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";

export default function Navbar() {
  const [status] = useState(true);
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
    <div className="navbar bg-primary/80 backdrop-blur-md border-b border-primary/30 px-3 py-1 h-12 min-h-0 sticky top-0 z-50">
      {/* Izquierda: Logo y nombre */}
      <div className="navbar-start gap-2">
          <img
            src="/MoraPackLogo.png"
            alt="Logo"
            className="w-8 h-8 rounded-md shadow-sm"
          />
          <div className="flex flex-col leading-tight text-left">
            <span className="text-lg font-bold">MoraPack</span>
            <span className="text-xs opacity-80">SkyRoute System</span>
          </div>
      </div>

      <div className="navbar-center">
        <ul className="menu menu-horizontal px-1 gap-1">
          <li>
            <NavLink
              to="/packages"
              className={({ isActive }) =>
                `btn btn-ghost btn-sm rounded-full ${isActive ? "btn-active" : ""}`
              }
            >
              Pedidos
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/flights"
              className={({ isActive }) =>
                `btn btn-ghost btn-sm rounded-full ${isActive ? "btn-active" : ""}`
              }
            >
              Vuelos
            </NavLink>
          </li>
          <li>
            <NavLink
              to="/simulacion"
              className={({ isActive }) =>
                `btn btn-ghost btn-sm rounded-full ${isActive ? "btn-active" : ""}`
              }
            >
              Simulación
            </NavLink>
          </li>
          <li>
              <NavLink
                to="/operacion"
                className={({ isActive }) =>
                  `btn btn-ghost btn-sm rounded-full ${isActive ? "btn-active" : ""}`
                }
              >
                Operación
              </NavLink>
           </li>
        </ul>
      </div>

      <div className="navbar-end">
        <div className="flex flex-col items-end mr-4 text-right leading-tight">
          <span className={`text-xs font-semibold ${status ? "text-success" : "text-error"}`}>
            ● {status ? "Conectado" : "Desconectado"}
          </span>
          <span className="text-[11px] opacity-80">{time}</span>
        </div>
        <div className="dropdown dropdown-end">
          <button className="btn btn-circle btn-ghost avatar">
            <img
              src="https://img.daisyui.com/images/stock/photo-1534528741775-53994a69daeb.webp"
              alt="User"
              className="rounded-full w-8 h-8"
            />
          </button>
          <ul className="dropdown-content menu bg-base-100/80 backdrop-blur-md rounded-box z-10 mt-3 w-30 shadow">
            <li><a>Profile</a></li>
            <li><a>Logout</a></li>
          </ul>
        </div>
      </div>
    </div>
  );
}
