# MoraPack
Proyecto MoraPack

# 🚚 MoraPack

**MoraPack** es una plataforma de simulación y monitoreo de envíos internacionales de paquetes para MPE.  
Permite planificar rutas con restricciones de tiempo y capacidad, y ejecutar tres escenarios:

1. 🕓 Operaciones en tiempo real  
2. 📅 Simulación semanal  
3. ⚠️ Simulación hasta colapso  

El sistema aplica dos algoritmos metaheurísticos y sigue la norma **NTP-ISO/IEC 29110-5-1-2 (VSE)**, utilizando el modelo arquitectónico **4+1 Views**.

---

## 🏗️ Estructura del Proyecto

src/
├── main/
│ ├── java/
│ │ └── com/morapack/
│ │ ├── config/
│ │ ├── controllers/
│ │ ├── services/
│ │ ├── repositories/
│ │ ├── models/
│ │ ├── exceptions/
│ │ └── utils/
│ └── resources/
│ ├── application.properties
│ ├── static/
│ └── templates/
└── test/
└── java/com/morapack/


### 📂 Descripción de paquetes

- **config/** → Configuraciones generales de la aplicación (seguridad, CORS, JWT, etc.)  
- **controllers/** → Controladores REST que gestionan peticiones HTTP  
- **services/** → Lógica de negocio del sistema  
- **repositories/** → Acceso a datos mediante JPA/Hibernate  
- **models/** → Entidades del dominio (Paquete, Ciudad, Vuelo, Almacén, etc.)  
- **exceptions/** → Manejo de excepciones personalizadas  
- **utils/** → Clases auxiliares (validaciones, formateos, cálculos)  
- **resources/** → Configuraciones y archivos estáticos  
- **test/** → Pruebas unitarias e integradas  

---

### 🛠️ Tecnologías
- Java 17  
- Spring Boot  
- MySQL (AWS RDS)  
- Maven o Gradle  
- JPA / Hibernate  



### 🚀 Cómo ejecutar
```bash
# Clonar el repositorio
git clone https://github.com/<tu-usuario>/MoraPack.git

# Compilar y ejecutar
cd MoraPack
./mvnw spring-boot:run


