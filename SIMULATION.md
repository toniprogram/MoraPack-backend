# 🧪 Simulación semanal

Este backend ofrece un modo de simulación “en memoria” que genera planes parciales con el GA y los publica en tiempo real por WebSocket.

## 1. Requisitos previos

- El catálogo base debe estar cargado (`POST /api/setup` o similar) para que existan aeropuertos y vuelos.
- Las órdenes proyectadas deben haberse cargado previamente en la BD mediante `POST /api/orders` con el campo `projected: true`. Por defecto todos los pedidos creados desde el endpoint son `REAL`.
- Puedes consultar los pedidos proyectados vigentes con `GET /api/orders?scope=PROJECTED`.
- El backend debe permitir conexiones WebSocket (endpoint STOMP `/ws`).

## 2. Endpoints HTTP

### `POST /api/simulations`

Inicia una nueva sesión tomando todos los pedidos `PROJECTED` almacenados entre un rango de fechas (UTC). Ambos campos son opcionales:

```json
{
  "startDate": "2025-01-02T00:00:00",
  "endDate": "2025-01-09T23:59:59",
  "windowMinutes": 5,
  "useHeuristicSeed": false

```

`windowMinutes` controla el tamaño de cada lote temporal (por defecto **3 horas = 180 minutos**). Usa `0` para habilitar el modo legacy que procesa pedido por pedido.
`useHeuristicSeed` permite intentar una inserción heurística previa a cada corrida del GA; el GA se ejecuta siempre.

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
2. **Registrar pedidos proyectados** (solo la primera vez o cuando recibas un nuevo archivo):

   ```bash
   curl -X POST http://localhost:8080/api/orders/batch \
     -H "Content-Type: application/json" \
     -d '{
       "orders": [
         {
           "id": "000000001",
           "customerReference": "0007729",
           "destinationAirportCode": "EBCI",
           "quantity": 6,
           "creationLocal": "2025-01-02T01:38:00",
           "projected": true
         }
       ]
     }'
   ```

   > Por defecto, los pedidos se marcan como `REAL`. Envía `projected: true` únicamente para los escenarios simulados.
   >
3. **Iniciar simulación**:

   ```bash
   curl -X POST http://localhost:8080/api/simulations \
     -H "Content-Type: application/json" \
     -d '{ "startDate": "2025-01-02T00:00:00", "endDate": "2025-01-05T23:59:59" }'
   ```

   Si omites las fechas, se toma el rango completo de pedidos `PROJECTED` existentes.
4. **Conectar al WebSocket**:

   - Usa una herramienta STOMP (STOMP over WebSocket) o una librería JavaScript (`SockJS + StompJS`).
   - Conecta a `ws://localhost:8080/ws` y suscríbete a `/topic/simulations/{simulationId}`.
   - Verás mensajes `PROGRESS` cada vez que se procesa una orden, y `COMPLETED` al terminar.
5. **Consultar estado** (opcional):

   ```bash
   curl http://localhost:8080/api/simulations/{simulationId}/status
   ```
6. **Cancelar** (opcional):

   ```bash
   curl -X DELETE http://localhost:8080/api/simulations/{simulationId}
   ```

## 5. Consideraciones

- La simulación se ejecuta en memoria: si el backend se reinicia, la sesión se pierde.
- Todos los clientes conectados reciben exactamente los mismos snapshots en tiempo real.
- El SLA (`dueUtc`) aún se fija con el valor intercontinental por defecto (72 h); el GA puede ajustarlo en el futuro según origen/destino.
- Para compartir la simulación entre dispositivos, basta distribuir la URL y suscribirse con el mismo `simulationId`.
