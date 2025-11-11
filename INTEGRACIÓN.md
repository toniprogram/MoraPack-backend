# 🧠 Guía completa de integración del algoritmo con el backend

**Proyecto:** Planificador de vuelos y rutas logísticas
**Autor:** Ariel Guerra
**Propósito:** Documentar cómo integrar el algoritmo genético de planificación con el backend operativo, garantizando persistencia, modularidad y soporte para modo operativo y modo simulación.

---

## 🧩 1. Arquitectura general

### Componentes principales


| Capa                         | Rol                                                                                       | Ejemplos de clases                       |
| ---------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------- |
| **Frontend**                 | Interfaz de visualización y control. Muestra el grafo de vuelos, almacenes y pedidos.    | React/Vue o equivalente                  |
| **Backend (Spring Boot)**    | Orquesta la ejecución del algoritmo, gestiona la base de datos, y expone endpoints REST. | Controllers, Services, Repositories      |
| **Algoritmo genético (GA)** | Núcleo de planificación: genera, evalúa y selecciona soluciones óptimas.              | `GeneticAlgorithm`,`Individual`,`World`  |
| **Base de datos (JPA)**      | Almacena datos estructurales y el estado actual del plan.                                 | `Airport`,`Flight`,`Order`,`CurrentPlan` |

---

## ⚙️ 2. Flujo general de ejecución

### A. Modo operativo diario

```
1️⃣ El usuario (frontend) crea o actualiza pedidos (Orders) → BD.
2️⃣ El backend ejecuta el GA sobre los pedidos activos.
3️⃣ El GA genera muchos Individuals → selecciona el mejor.
4️⃣ El backend convierte el mejor Individual en entidades JPA y lo guarda como CurrentPlan.
5️⃣ El frontend consulta /plan/current → visualiza la planificación.
```

### B. Modo simulación semanal

```
1️⃣ El usuario carga un archivo de órdenes proyectadas y las persiste en `/api/orders` con `projected = true`.
2️⃣ El backend recibe `startDate` / `endDate`, construye un World temporal (solo lectura) y consulta los pedidos `PROJECTED` en ese rango.
3️⃣ El GA ejecuta las simulaciones día por día.
4️⃣ Los resultados viven en memoria y se muestran en tiempo real.
5️⃣ Al finalizar, se descarta todo.
```

---

## 🧱 3. Estructura del modelo de datos

### Persistentes (JPA)


| Entidad                            | Descripción                                                | Persiste en BD |
| ---------------------------------- | ----------------------------------------------------------- | -------------- |
| `Airport`                          | Nodos fijos del grafo.                                      | ✅             |
| `Flight`                           | Plantillas de vuelos (repetitivos diarios).                 | ✅             |
| `Client`                           | Identificador de cliente.                                   | ✅             |
| `Order`                            | Pedido real o proyectado (`scope = REAL | PROJECTED`).     | ✅             |
| `FlightCapacity`                   | Capacidad usada por vuelo y fecha.                          | ✅             |
| `AirportOperation`                 | Cambios (+/–) de capacidad en un aeropuerto.               | ✅             |
| `CurrentPlan`                      | Última planificación válida (foto del mejor Individual). | ✅             |
| `OrderPlan`,`Route`,`RouteSegment` | Detalles del CurrentPlan.                                   | ✅             |

### Temporales (en memoria)


| Clase                              | Rol                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------ |
| `World`                            | Contexto de simulación: mantiene hashmaps de airports, flights, orders. |
| `Individual`                       | Representa una solución candidata (plan de vuelos).                     |
| `OrderPlan`                        | Plan interno por pedido dentro de un Individual.                         |
| `Route`/`RouteSegment`             | Desglose detallado del envío de productos.                              |
| `AirportSchedule`,`FlightSchedule` | Estructuras temporales de capacidad (RAM).                               |

---

## 🧩 4. Modos de ejecución y persistencia


| Elemento              | Operativo diario                                   | Simulación semanal                             |
| --------------------- | -------------------------------------------------- | ----------------------------------------------- |
| Orders                | Persistente (`scope = REAL`)                       | Persistente (`scope = PROJECTED`, filtrado por fecha) |
| Flights / Airports    | Persistentes                                       | Persistentes (solo lectura)                     |
| Capacidades           | Persistentes (`FlightCapacity`,`AirportOperation`) | En memoria (`FlightSchedule`,`AirportSchedule`) |
| Planificación actual | Persistente (`CurrentPlan`)                        | En memoria                                      |
| Algoritmo GA          | Ejecutado bajo demanda                             | Ejecutado secuencialmente (por archivo)         |

---

## 🧮 5. Clases y persistencia

### Ejemplo de entidades clave

```java
@Entity
public class Airport {
    @Id private String id;
    private String name;
    private double latitude;
    private double longitude;
}
```

```java
@Entity
public class Flight {
    @Id private String id;
    private String origin;
    private String destination;
    private int capacity;
}
```

```java
@Entity
public class Order {
    @Id @GeneratedValue private Long id;
    @ManyToOne private Client client;
    private int quantity;
    private LocalDateTime createdAt;
    private String destination;
}
```

```java
@Entity
public class AirportOperation {
    @Id @GeneratedValue private Long id;
    @ManyToOne private Airport airport;
    private LocalDateTime timestamp;
    private int delta; // + deposito, - retiro
}
```

```java
@Entity
public class FlightCapacity {
    @EmbeddedId private FlightCapacityKey id; // (flight_id, date)
    private int usedCapacity;
}
```

```java
@Entity
public class CurrentPlan {
    @Id private Long id = 1L; // Singleton
    private LocalDateTime generatedAt;
    private double fitness;
    @OneToMany(mappedBy = "plan", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<OrderPlan> orderPlans;
}
```

---

### Consulta de pedidos proyectados

Los pedidos usados por la simulación semanal se almacenan en la misma tabla `orders`, diferenciados por `scope = PROJECTED`. Cuando el usuario solicita una simulación, el backend filtra ese subconjunto por fecha:

```java
Instant start = ...; // definido por startDate o el primer pedido PROJECTED disponible
Instant end = ...;   // definido por endDate o el último pedido PROJECTED disponible

List<Order> projected = orderRepository
        .findAllByScopeAndCreationUtcBetweenOrderByCreationUtcAsc(OrderScope.PROJECTED, start, end);
```

Ese listado (ya ordenado cronológicamente) se pasa al GA en RAM sin tocar los pedidos `REAL`.

---

## 🧠 6. Interacción algoritmo–backend

### Lógica general

1. El **Service** del backend orquesta la ejecución:
   ```java
   @Service
   public class PlanningService {
       @Autowired GeneticAlgorithm ga;
       @Autowired CurrentPlanRepository planRepo;
       @Autowired Mapper mapper;

       public void run() {
           World world = worldBuilder.buildFromDatabase();
           Individual best = ga.run(world);
           CurrentPlan entity = mapper.toEntity(best);
           planRepo.save(entity);
       }
   }
   ```
2. El **Mapper** convierte objetos del algoritmo a entidades JPA:
   ```java
   @Component
   public class Mapper {
       public CurrentPlan toEntity(Individual ind) {
           CurrentPlan p = new CurrentPlan();
           p.setGeneratedAt(LocalDateTime.now());
           p.setFitness(ind.getFitness());
           p.setOrderPlans(
               ind.getOrderPlans().stream()
                   .map(this::mapOrderPlan)
                   .toList());
           return p;
       }
       // mapOrderPlan(), mapRoute(), mapRouteSegment()...
   }
   ```
3. El **Controller** expone los endpoints:
   ```java
   @RestController
   @RequestMapping("/plan")
   public class PlanController {
       @Autowired PlanningService planningService;
       @Autowired CurrentPlanRepository repo;

       @PostMapping("/run")
       public ResponseEntity<?> runAlgorithm() {
           planningService.run();
           return ResponseEntity.ok("Plan actualizado");
       }

       @GetMapping("/current")
       public CurrentPlan getCurrentPlan() {
           return repo.findById(1L).orElseThrow();
       }
   }
   ```

---

## 💾 7. Modo de persistencia de capacidades

### A. Flight capacities

Cada vuelo por día tiene una fila en `FlightCapacity`:

```
(FK flight_id, date, usedCapacity)
```

El algoritmo actualiza los valores y el backend los persiste.

### B. Airport capacities

Se registran operaciones (+/–) en `AirportOperation`:

```
(airport_id, timestamp, delta)
```

El backend puede agruparlas para obtener el estado actual:

```sql
SELECT airport_id, SUM(delta)
FROM airport_operation
WHERE timestamp::date = CURRENT_DATE
GROUP BY airport_id;
```

Y opcionalmente consolidar en snapshots diarios.

---

## 🧰 8. Capa de simulación

### Servicio ejemplo

```java
@Service
public class SimulationService {
    @Autowired GeneticAlgorithm ga;
    @Autowired ActivePlan activePlan;

    public void simulate(List<Order> projectedOrders) {
        World world = new World();
        world.loadBaseData(); // airports + flights
        for (Order o : projectedOrders) {
            world.addOrder(o);
            Individual best = ga.run(world);
            activePlan.update(world, best);
        }
    }
}
```

### Clase ActivePlan (RAM)

```java
@Component
public class ActivePlan {
    private World world;
    private Individual best;

    public void update(World world, Individual best) {
        this.world = world;
        this.best = best;
    }

    public Individual getCurrent() { return best; }
}
```

---

## 🔄 9. Flujo de datos resumido

```
Frontend → Controller → Service → Algorithm → Mapper → Repository → Database
                                ↑
                             ActivePlan (RAM)
```


| Paso | Acción                  | Origen        | Destino  |
| ---- | ------------------------ | ------------- | -------- |
| 1    | Crear pedido             | Frontend      | BD       |
| 2    | Ejecutar GA              | Service       | RAM      |
| 3    | Generar mejor Individual | GA            | RAM      |
| 4    | Guardar planificación   | Mapper + Repo | BD       |
| 5    | Consultar planificación | Controller    | Frontend |

---

## 🧮 10. Reglas de persistencia


| Clase                        | Tipo        | Guardar            | Motivo                    |
| ---------------------------- | ----------- | ------------------ | ------------------------- |
| Airport / Flight / Client    | Base        | Sí                | Datos estructurales fijos |
| Order                        | Operativo   | Sí                | Necesario para planificar |
| Individual                   | Algoritmo   | No                 | Efímero, solo en RAM     |
| CurrentPlan                  | Resultado   | Sí (una versión) | Último plan vigente      |
| Capacities (Flight, Airport) | Estado      | Sí                | Refleja disponibilidad    |
| Simulated Orders             | Simulación | Sí (`Order.scope = PROJECTED`) | Reutilizables por rango o eliminables manualmente |

---

## 🧩 11. Recuperación tras reinicio

Al reiniciar el backend:

1. Cargar última planificación desde `CurrentPlanRepository.findById(1L)`.
2. Cargar Airports, Flights, Orders activos.
3. Reconstruir el World en memoria.
4. Continuar planificación o mostrarla al frontend.

---

## 🧠 12. Beneficios del diseño

✅ Evita duplicados de datos durante iteraciones.
✅ Mantiene separadas las estructuras efímeras del algoritmo y las persistentes del sistema.
✅ Permite reiniciar el backend sin perder la planificación vigente.
✅ Soporta modo simulación sin riesgo para los datos reales.
✅ Escalable: futuras optimizaciones (caché, partición, multi-hilo) no rompen la arquitectura.

---

## 📊 13. Ejemplo de endpoints recomendados


| Endpoint             | Método  | Función                               |
| -------------------- | -------- | -------------------------------------- |
| `/orders`            | GET/POST | Listar o crear pedidos                 |
| `/plan/run`          | POST     | Ejecutar algoritmo y guardar resultado |
| `/plan/current`      | GET      | Obtener planificación vigente         |
| `/capacity/flights`  | GET      | Consultar capacidades por vuelo        |
| `/capacity/airports` | GET      | Consultar cargas por aeropuerto        |
| `/simulate/upload`   | POST     | Cargar archivo de simulación          |
| `/simulate/start`    | POST     | Iniciar simulación semanal            |
| `/simulate/status`   | GET      | Ver estado actual de la simulación    |

---

## 🧰 14. Buenas prácticas y notas

* **Separar el algoritmo:** el paquete `algorithm/` debe ser independiente del de `entity/`.
* **Evitar acoplar GA con JPA:** el GA nunca debe importar `jakarta.persistence.*`.
* **Usar Mappers:** traduce los objetos del GA a entidades persistentes antes de guardarlos.
* **Actualizar capacidades:** durante la ejecución, reflejar en la BD solo los cambios confirmados.
* **Usar DTOs:** para enviar solo lo necesario al frontend.
* **Persistir solo una planificación vigente:**`CurrentPlan` con `id = 1L` actúa como singleton.
* **Modo simulación aislado:** nunca toca las tablas operativas.

---

## 🧩 15. Árbol de paquetes sugerido

```
src/main/java/com/morapack/
 ├── algorithm/
 │    ├── GeneticAlgorithm.java
 │    ├── Individual.java
 │    ├── OrderPlan.java
 │    ├── Route.java
 │    ├── RouteSegment.java
 │    ├── World.java
 │    └── schedule/
 │         ├── AirportSchedule.java
 │         └── FlightSchedule.java
 │
 ├── model/
 │    ├── entity/
 │    │    ├── Airport.java
 │    │    ├── Flight.java
 │    │    ├── Order.java
 │    │    ├── AirportOperation.java
 │    │    ├── FlightCapacity.java
 │    │    └── CurrentPlan.java
 │    └── repository/
 │         ├── AirportRepository.java
 │         ├── FlightRepository.java
 │         ├── OrderRepository.java
 │         ├── CurrentPlanRepository.java
 │         └── CapacityRepositories.java
 │
 ├── service/
 │    ├── PlanningService.java
 │    ├── SimulationService.java
 │    ├── Mapper.java
 │    └── WorldBuilder.java
 │
 └── controller/
      ├── PlanController.java
      ├── OrderController.java
      └── SimulationController.java
```

---

## 📘 16. Frase para documentación

> “La integración del algoritmo genético con el backend se realiza mediante una arquitectura híbrida en la que los datos estructurales y la última planificación vigente se mantienen persistentes en la base de datos, mientras que las estructuras del algoritmo y los procesos de simulación operan completamente en memoria.
> Esto garantiza rendimiento, consistencia y recuperación segura ante reinicios, sin sacrificar la flexibilidad del proceso evolutivo.”

---

## ✅ 17. Checklist de implementación

* [ ]  Definir entidades JPA (Airport, Flight, Order, CurrentPlan, Capacities).
* [ ]  Implementar repositorios correspondientes.
* [ ]  Crear módulo `algorithm/` sin dependencias de Spring ni JPA.
* [ ]  Implementar Mapper bidireccional (Individual ↔ Entities).
* [ ]  Crear servicio de planificación (`PlanningService`).
* [ ]  Añadir endpoints REST `/plan/run` y `/plan/current`.
* [ ]  Agregar persistencia de capacidades (FlightCapacity, AirportOperation).
* [ ]  Implementar `SimulationService` y endpoints `/simulate/*`.
* [ ]  Verificar recuperación de estado tras reinicio.
* [ ]  Probar con dataset real + simulación de archivo.

---

## 🧭 18. Próximos pasos (NO SE SI HAREMOS ESTO)

* Integrar notificaciones en tiempo real (WebSockets o SSE).
* Crear visualización de capacidades en el frontend.
* Implementar consolidación diaria de operaciones de aeropuerto.
* Añadir logs de rendimiento del GA.
* Optimizar persistencia con batch inserts y `@Transactional`.

---

**Fin del documento.**
