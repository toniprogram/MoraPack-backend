# 🌐 Especificación de Endpoints REST

### Integración Frontend ↔ Backend ↔ Algoritmo

**Proyecto:** Planificador logístico de vuelos y pedidos
**Autor:** Ariel Guerra
**Objetivo:** Documentar todos los endpoints necesarios para la comunicación entre el frontend y el backend, incluyendo estructura de payloads, propósito funcional y uso esperado desde el frontend.

---

## 🧭 1. Estructura general de módulos


| Módulo     | Descripción                                                                      |
| ----------- | --------------------------------------------------------------------------------- |
| `/orders`      | Gestión de pedidos (crear, listar, eliminar).                                    |
| `/plan`        | Ejecución del algoritmo genético y visualización de la planificación vigente. |
| `/capacity`    | Consulta de capacidades actuales (vuelos y aeropuertos).                          |
| `/simulations` | Modo simulación semanal (carga de órdenes, snapshots en tiempo real).            |
| `/base`        | Acceso a datos estructurales (aeropuertos, vuelos).                              |

---

## 📦 2. Módulo `/base`

### `GET /base/airports`

**Devuelve** todos los aeropuertos registrados.

**Response**

```json
[
  {
    "id": "LIM",
    "name": "Lima Intl",
    "latitude": -12.021,
    "longitude": -77.114
  },
  {
    "id": "CUZ",
    "name": "Cusco Intl",
    "latitude": -13.535,
    "longitude": -71.938
  }
]
```

**Frontend usa para:**

* Dibujar nodos del grafo de vuelos.
* Mostrar lista desplegable de aeropuertos origen/destino.

---

### `GET /base/flights`

**Devuelve** todos los vuelos base (plantillas repetitivas).

**Response**

```json
[
  {
    "id": "F001",
    "origin": "LIM",
    "destination": "CUZ",
    "capacity": 500,
    "durationMinutes": 90
  },
  ...
]
```

**Frontend usa para:**

* Mostrar aristas del grafo (vuelos posibles).
* Calcular rutas y capacidades visualmente.

---

### `GET /base/clients`

**Devuelve lista de clientes registrados.**

**Response**

```json
[
  { "id": "C001" },
  { "id": "C002" }
]
```

**Frontend usa para:**

* Asignar pedidos nuevos a clientes.
* Mostrar pedidos agrupados por cliente.

---

## 📦 3. Módulo `/orders`

### `GET /api/orders`

**Lista** todos los pedidos persistidos.

**Response (paginado)**

```json
{
  "items": [
    {
      "id": "000000001",
      "customerReference": "0007729",
      "destinationAirport": {
        "code": "EBCI",
        "name": "Brussels South Charleroi",
        "gmtOffsetHours": 1,
        "storageCapacity": 3200,
        "continent": "EUROPE",
        "latitude": 50.4592,
        "longitude": 4.4538
      },
      "quantity": 6,
      "creationUtc": "2025-01-02T01:38:00Z",
      "dueUtc": "2025-01-03T19:38:00Z",
      "scope": "REAL"
    }
  ],
  "page": 0,
  "size": 50,
  "totalElements": 1240,
  "totalPages": 25
}
```

**Frontend usa para:**

* Mostrar la cola de pedidos activos.
* Sincronizar la vista antes/después de recalcular el plan.

**Query params**

* `scope=REAL|PROJECTED` → filtra por tipo de pedido (default `REAL`).
* `page=<n>` → página deseada (0-index, default `0`).
* `size=<n>` → tamaño de página (default `50`, máximo `2000`).

---

### `POST /api/orders`

**Crea** un nuevo pedido.

**Request**

```json
{
  "id": "000000001",
  "customerReference": "0007729",
  "destinationAirportCode": "EBCI",
  "quantity": 6,
  "creationLocal": "2025-01-02T01:38:00",
  "projected": false
}
```

> 💡 El identificador completo del archivo (`000000001-20250102-01-38-EBCI-006-0007729`) se descompone así:
> `id` = `000000001`, `creationLocal` = `2025-01-02T01:38` (hora local del destino), `destinationAirportCode` = `EBCI`, `quantity` = `006` → `6` y `customerReference` = `0007729`.
> El backend convierte `creationLocal` a UTC usando el huso del aeropuerto destino y, por ahora, fija `dueUtc` internamente; el GA podrá ajustar el vencimiento según el origen final.
> Si `projected` se omite o es `false`, el pedido se marca como `REAL`. Envía `true` únicamente para pedidos usados por la simulación semanal.

**Response** `201 Created`

```json
{
  "id": "000000001",
  "customerReference": "0007729",
  "destinationAirport": {
    "code": "EBCI",
    "name": "Brussels South Charleroi",
    "gmtOffsetHours": 1,
    "storageCapacity": 3200,
    "continent": "EUROPE",
    "latitude": 50.4592,
    "longitude": 4.4538
  },
  "quantity": 6,
  "creationUtc": "2025-01-02T01:38:00Z",
  "dueUtc": "2025-01-03T19:38:00Z"
}
```

**Validaciones clave**

* `destinationAirportCode` debe existir en BD (de lo contrario responde 400).
* `quantity` > 0.
* `creationUtc` y `dueUtc` son obligatorios y `dueUtc` ≥ `creationUtc`.
* Si el `id` ya existe, responde 409.

---

### `DELETE /api/orders/{id}`

Elimina un pedido existente.

**Response**

* `204 No Content` si se elimina.
* `404 Not Found` si el pedido no existe.

**Frontend usa para:**

* Borrar pedidos cargados por error.
* Resetear el escenario antes de recalcular.

---

## 📦 4. Módulo `/plan`

### `POST /plan/run`

Ejecuta el algoritmo genético usando los pedidos activos.

**Request**

```json
{ "recalculate": true }
```

**Response**

```json
{
  "status": "SUCCESS",
  "generatedAt": "2025-11-03T13:00:00Z",
  "fitness": 0.978,
  "message": "Planificación actualizada correctamente."
}
```

**Frontend usa para:**

* Botón “Recalcular rutas”.
* Mostrar spinner de ejecución y luego actualizar grafo.

---

### `GET /plan/current`

Devuelve la planificación vigente (último plan guardado).

**Response**

```json
{
  "generatedAt": "2025-11-03T13:00:00Z",
  "fitness": 0.978,
  "orderPlans": [
    {
      "orderId": 1,
      "routes": [
        {
          "routeId": "R01",
          "quantity": 30,
          "segments": [
            {
              "from": "LIM",
              "to": "CUZ",
              "departure": "2025-11-04T09:00:00Z",
              "arrival": "2025-11-04T10:30:00Z"
            }
          ]
        }
      ]
    }
  ]
}
```

**Frontend usa para:**

* Dibujar el grafo de vuelos con las rutas activas.
* Mostrar tooltips con cantidades, tiempos y fitness.
* Actualizar la línea temporal de operaciones.

---

### `DELETE /plan/current`

Reinicia el plan (deja sin planificación vigente).

**Frontend usa para:**

* Botón de “reset” del planificador.
* Modo debug o limpieza de entorno operativo.

---

## 📦 5. Módulo `/capacity`

### `GET /capacity/flights`

Muestra la capacidad utilizada por vuelo y fecha.

**Response**

```json
[
  {
    "flightId": "F001",
    "date": "2025-11-04",
    "usedCapacity": 320,
    "totalCapacity": 500
  },
  {
    "flightId": "F002",
    "date": "2025-11-04",
    "usedCapacity": 450,
    "totalCapacity": 500
  }
]
```

**Frontend usa para:**

* Mostrar indicadores de llenado en el grafo (colores o porcentajes).
* Filtrar vuelos saturados.

---

### `GET /capacity/airports`

Devuelve la capacidad usada por aeropuerto en intervalos de simulación (por ejemplo, cada 5 min o según configuración).

**Query params**

intervalMinutes=5   // opcional, default=10

Response

```json[
{
"airportId": "LIM",
"timestamp": "2025-11-04T09:05:00Z",
"balance": 100
},
{
"airportId": "LIM",
"timestamp": "2025-11-04T09:10:00Z",
"balance": 120
},
{
"airportId": "CUZ",
"timestamp": "2025-11-04T09:10:00Z",
"balance": 85
}
]

```

**Frontend usa para:**

* Graficar la **evolución temporal de carga/descarga** por aeropuerto durante la simulación o el día operativo.
* Mostrar animaciones en el grafo sincronizadas con la línea temporal.
* Permitir “scrubbing” (mover el tiempo de simulación y ver el estado en ese minuto).

---

### `POST /capacity/recalculate`

Recalcula la capacidad desde la BD o la planificación actual.

**Frontend usa para:**

* Botón de sincronización rápida tras modificar el plan.

---

## 📦 6. Módulo `/simulations`

### `POST /api/simulations`

Inicia una simulación semanal en memoria tomando los pedidos `PROJECTED` almacenados en la base de datos. El body define un rango opcional (UTC) para acotar la ejecución.

**Request**

```json
{
  "startDate": "2025-01-02T00:00:00",
  "endDate": "2025-01-05T23:59:59",
  "windowMinutes": 5
}
```

**Response** `202 Accepted`

```json
{ "simulationId": "d4d9fbaa-9c0f-4f28-8b41-1d36d8aca3c1" }
```

Si omites `startDate` o `endDate`, el backend usa automáticamente la primera y última fecha disponible entre los pedidos proyectados. `windowMinutes` define la longitud de cada lote temporal (por defecto 10 minutos); usa `0` para ejecutar el modo legacy pedido por pedido. El backend empieza a procesar las órdenes en segundo plano y a publicar snapshots parciales.

---

### `GET /api/simulations/{id}/status`

Devuelve el estado actual.

```json
{
  "simulationId": "d4d9fbaa-9c0f-4f28-8b41-1d36d8aca3c1",
  "processedOrders": 3,
  "totalOrders": 10,
  "completed": false,
  "cancelled": false,
  "error": null,
  "lastSnapshot": {
    "simulationId": "d4d9fbaa-9c0f-4f28-8b41-1d36d8aca3c1",
    "processedOrders": 3,
    "totalOrders": 10,
    "fitness": 0.912,
    "generatedAt": "2025-01-02T04:15:20.418Z",
    "orderPlans": [
      {
        "orderId": "000000001",
        "slackMinutes": 90,
        "routes": [
          {
            "quantity": 6,
            "slackMinutes": 45,
            "segments": [
              {
                "flightId": "SPIM-EBCI-01:00",
                "origin": "SPIM",
                "destination": "EBCI",
                "date": "2025-01-02",
                "quantity": 6,
                "departureUtc": "2025-01-02T06:00:00Z",
                "arrivalUtc": "2025-01-02T14:00:00Z"
              }
            ]
          }
        ]
      }
    ]
  }
}
```

---

### `DELETE /api/simulations/{id}`

Cancela una simulación en curso (`204 No Content`).

---

### WebSocket `/ws`

Los clientes se conectan al endpoint STOMP `/ws` y se suscriben a `/topic/simulations/{simulationId}`. El backend envía mensajes:

```json
{
  "simulationId": "d4d9fbaa-9c0f-4f28-8b41-1d36d8aca3c1",
  "type": "PROGRESS",
  "snapshot": { ... },
  "error": null
}
```

`type` puede ser `PROGRESS`, `COMPLETED` o `ERROR`. Todos los dispositivos conectados reciben exactamente los mismos snapshots en tiempo real.

---

## 📦 7. Módulo `/admin` (opcional)

### `GET /admin/stats`

Estadísticas globales del algoritmo y del sistema.

**Response**

```json
{
  "totalOrders": 312,
  "totalFlights": 27,
  "avgFitness": 0.91,
  "executionTimeMs": 12345
}
```

**Frontend usa para:**

* Dashboard de métricas y rendimiento.

---

## 🧠 8. Qué hará el frontend con estos endpoints


| Sección del frontend                 | Endpoint principal                                                       | Comportamiento                                                             |
| ------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| **Dashboard**                         | `/plan/current`,`/capacity/flights`,`/capacity/airports`                 | Visualizar grafo de vuelos, indicadores de carga y rutas activas.          |
| **Gestión de pedidos**               | `/orders`(GET/POST/DELETE)                                               | Listar, crear y eliminar pedidos.                                          |
| **Panel de control del planificador** | `/plan/run`,`/plan/current`,`/capacity/recalculate`                      | Ejecutar el GA y actualizar resultados.                                    |
| **Simulación semanal**               | `/simulate/upload`,`/simulate/start`,`/simulate/status`,`/simulate/plan` | Cargar dataset proyectado, iniciar simulación, ver progreso y resultados. |
| **Administración / estadísticas**   | `/admin/stats`                                                           | Mostrar rendimiento del algoritmo, tiempos y fitness promedio.             |

---

## 💡 9. Recomendaciones para el frontend

* Implementar un **modo doble** (🟢 Operativo / 🧪 Simulación) visible en la interfaz.
* Mantener una **polling interval** de 5–10 s para `/plan/current` o `/simulate/status`.
* Usar **colores dinámicos**:
  * Verde → capacidad libre.
  * Naranja → en riesgo.
  * Rojo → saturado.
* Usar WebSocket opcional para actualizaciones en tiempo real del plan.
* Cachear datos estáticos (aeropuertos, vuelos) para reducir llamadas.

---

## ✅ 10. Resumen visual de endpoints

```
/base
 ├── GET /airports
 ├── GET /flights
 └── GET /clients

/orders
 ├── GET /orders
 ├── POST /orders
 └── DELETE /orders/{id}

/plan
 ├── POST /run
 ├── GET /current
 └── DELETE /current

/capacity
 ├── GET /flights
 ├── GET /airports
 └── POST /recalculate

/simulate
 ├── POST /upload
 ├── POST /start
 ├── GET /status
 ├── GET /plan
 └── POST /stop

/admin
 └── GET /stats
```

---

## 📘 11. Frase resumen para documentación

> “El frontend se comunica con el backend mediante endpoints REST organizados por dominio funcional.
> Los endpoints de `/plan` y `/capacity` permiten visualizar el estado operativo del sistema, mientras que los de `/simulate` habilitan la ejecución y monitoreo de simulaciones semanales sin alterar los datos reales.
> Toda la información estructural (vuelos, aeropuertos, clientes) se obtiene desde `/base`, garantizando consistencia entre el grafo visual y la lógica de planificación.”

---

**Fin del documento.**
### `POST /api/orders/batch`

**Crea** múltiples pedidos en una sola llamada. Se recomienda para importar proyecciones masivas.

**Request**

```json
{
  "orders": [
    {
      "id": "000000001",
      "customerReference": "0007729",
      "destinationAirportCode": "EBCI",
      "quantity": 6,
      "creationLocal": "2025-01-02T01:38:00",
      "projected": true
    },
    {
      "id": "000000002",
      "customerReference": "0008888",
      "destinationAirportCode": "LIM",
      "quantity": 4,
      "creationLocal": "2025-01-02T02:00:00",
      "projected": true
    }
  ]
}
```

**Response** `201 Created`

```json
[
  { "id": "000000001", "scope": "PROJECTED", ... },
  { "id": "000000002", "scope": "PROJECTED", ... }
]
```

> ⚠️ Todos los IDs deben ser únicos (tanto dentro del payload como en la base de datos) o la operación falla con `409 Conflict`.
### `GET /api/orders/count`

Devuelve el total de pedidos para el scope especificado.

```json
{
  "scope": "PROJECTED",
  "total": 24873
}
```

**Query params**

* `scope=REAL|PROJECTED` (opcional, default `REAL`).

Permite a la UI calcular la cantidad de páginas sin descargar todos los registros.

---
