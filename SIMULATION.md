# 🧪 Simulación semanal

Este backend ofrece un modo de simulación “en memoria” que genera planes parciales con el GA y los publica en tiempo real por WebSocket.

## 1. Requisitos previos

- El catálogo base debe estar cargado (`POST /api/setup` o similar) para que existan aeropuertos y vuelos.
- Se necesita una lista ordenada de órdenes proyectadas (hora local del aeropuerto destino).
- El backend debe permitirse conexiones WebSocket (endpoint STOMP `/ws`).

## 2. Endpoints HTTP

### `POST /api/simulations`

Inicia una nueva sesión. El cuerpo es un JSON con la lista de órdenes en orden cronológico. Cada orden usa el mismo formato que `/api/orders`:

```json
{
  "orders": [
    {
      "id": "000000001",
      "customerReference": "0007729",
      "destinationAirportCode": "EBCI",
      "quantity": 6,
      "creationLocal": "2025-01-02T01:38:00"
    }
  ]
}
```

Respuesta (`202 Accepted`):

```json
{ "simulationId": "d4d9fbaa-9c0f-4f28-8b41-1d36d8aca3c1" }
```

### `GET /api/simulations/{id}/status`

Devuelve el estado actual (órdenes procesadas, total, último snapshot, flags `completed`, `cancelled`, `error`).

### `DELETE /api/simulations/{id}`

Cancela la simulación (respuesta `204 No Content`).

> Nota: la simulación vive en memoria. Si el backend se reinicia, la sesión se pierde.

## 3. WebSocket

- Endpoint STOMP: `/ws`
- Suscripción: `/topic/simulations/{simulationId}`

Mensajes (`SimulationMessage`):

```json
{
  "simulationId": "...",
  "type": "PROGRESS | COMPLETED | ERROR",
  "snapshot": {
    "simulationId": "...",
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
  },
  "error": null
}
```

## 4. Flujo de prueba

1. **Cargar base** (si aún no existe):
   ```bash
   curl -X POST http://localhost:8080/api/setup \
     -H "Content-Type: application/json" \
     -d '{ "airports": [...], "flights": [...] }'
   ```

2. **Iniciar simulación**:
   ```bash
   curl -X POST http://localhost:8080/api/simulations \
     -H "Content-Type: application/json" \
     -d '{ "orders": [ { ... } ] }'
   ```
   Guarda el `simulationId` que retorna.

3. **Conectar al WebSocket**:
   - Usa una herramienta STOMP (STOMP over WebSocket) o una librería JavaScript (`SockJS + StompJS`).
   - Conecta a `ws://localhost:8080/ws` y suscríbete a `/topic/simulations/{simulationId}`.
   - Verás mensajes `PROGRESS` cada vez que se procesa una orden, y `COMPLETED` al terminar.

4. **Consultar estado** (opcional):
   ```bash
   curl http://localhost:8080/api/simulations/{simulationId}/status
   ```

5. **Cancelar** (opcional):
   ```bash
   curl -X DELETE http://localhost:8080/api/simulations/{simulationId}
   ```

## 5. Consideraciones

- La simulación se ejecuta en memoria: si el backend se reinicia, la sesión se pierde.
- Todos los clientes conectados reciben exactamente los mismos snapshots en tiempo real.
- El SLA (`dueUtc`) aún se fija con el valor intercontinental por defecto (72 h); el GA puede ajustarlo en el futuro según origen/destino.
- Para compartir la simulación entre dispositivos, basta distribuir la URL y suscribirse con el mismo `simulationId`.
