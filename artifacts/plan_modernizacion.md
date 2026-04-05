# Plan de Modernización: Plataforma Ciudadana Campeche

Analizando la estructura actual de tu proyecto, efectivamente es un sistema funcional pero construido con patrones que pueden modernizarse para ser más escalables, seguros y fáciles de mantener.

Aquí tienes un plan estructurado para llevar este sistema al siguiente nivel.

## 1. Migración de Base de Datos y ORM (Recomendación)

Me preguntas sobre **SQLite**. Es una **excelente elección** si planeas alojar este sistema en un único servidor (VPS) usando PM2, ya que:
- No requiere instalar ni configurar motores de bases de datos pesados.
- Todo se guarda en un solo archivo `.db`, lo que hace los respaldos tan simples como copiar y pegar.
- Los datos de este sistema (Reportes, Personas, Eventos) son altamente relacionales, lo que encaja perfecto.

**Recomendación:** Usa **SQLite con Prisma ORM**.
Prisma te dará autocompletado en TypeScript, migraciones automáticas y un código mucho más limpio que Mongoose. Si en el futuro el sistema crece muchísimo, cambiar de SQLite a PostgreSQL con Prisma toma solo cambiar 1 línea de código.

## 2. Mejoras en el Backend (Refactorización)

Tu archivo `server/index.js` actual tiene casi 600 líneas que mezclan rutas, modelos de base de datos, lógica de inteligencia artificial y configuración.

*   **Migrar el Backend a TypeScript:** Para tener el mismo lenguaje tipado que el Frontend.
*   **Arquitectura Modular (MVC):** Dividir el servidor en:
    *   `routes/`: Para definir los endpoints (`/api/reports`, `/api/auth`).
    *   `controllers/`: Para la lógica de negocio.
    *   `services/`: Para lógica externa (Cloudinary, Gemini AI).
*   **Seguridad y Autenticación:** Actualmente el login solo busca el usuario y devuelve el rol. Necesitamos implementar **JSON Web Tokens (JWT)** para que cada petición al backend esté protegida y valide quién está modificando o creando datos.

## 3. Mejoras en el Frontend

*   **Manejo de Estado con TanStack Query (React Query):** En lugar de hacer `fetch` manualmente en `useEffect`, React Query manejará el caché, los estados de carga (`isLoading`), y los reintentos automáticos si falla la red, lo cual es oro puro para una PWA (Progressive Web App).
*   **Diseño y UI Premium:** El sistema actual se ve funcional pero podemos inyectarle un diseño vibrante, con 'Modo Oscuro', micro-animaciones (framer-motion) y diseño *Glassmorphism* usando variables de CSS puro.
*   **Sincronización Offline Avanzada:** Tienes un hook `syncHook.ts` con Dexie que está muy bien pensado. Podemos llevarlo un paso más allá integrando *Workbox Background Sync* nativo de la PWA para sincronizar reportes incluso cuando la pestaña de la app está cerrada en el celular del usuario en campo.

---

## 🗺️ Fases de Ejecución

Para no romper el sistema actual, lo haríamos paso a paso:

### Fase 1: Base de Datos Relacional y Backend Base
1. Configurar **Prisma ORM con SQLite**.
2. Crear los esquemas en Prisma (`User`, `Report`, `Person`, `Event`).
3. Reemplazar la lógica de Mongoose en tu API por Prisma y separar en carpetas (`controllers`, `routes`).
4. Implementar Autenticación JWT.

### Fase 2: Conexión del Frontend Moderno
1. Instalar `@tanstack/react-query` y refactorizar las llamadas a la API.
2. Actualizar el código para enviar el Token de autenticación en las cabeceras.
3. Asegurar que Dexie.js (modo offline) se comunique correctamente con la nueva estructura SQL.

### Fase 3: Renovación de la Interfaz Visual (UI)
1. Integrar fuentes modernas (ej. *Inter* o *Outfit*) e iconos renovados.
2. Rehacer los modales y el mapa (`Leaflet`) con un diseño más limpio y responsivo.
3. Incluir dashboards con gráficos que resalten más la información estratégica.

--

¿Qué te parece este enfoque? Si estás de acuerdo, podemos empezar por la **Fase 1**: eliminar Mongoose, inicializar SQLite con Prisma y dividir tu `index.js`.
