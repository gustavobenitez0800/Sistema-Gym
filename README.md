# AyD Funcional Gym - Sistema de Gestión

![Logo](./img/Logo.png)

Sistema de gestión profesional para **AyD Funcional Gym**, diseñado para administrar alumnos, pagos y estadísticas financieras con una interfaz moderna y fluida.

## 🚀 Características Principales

### 👥 Gestión de Alumnos
- **Alta de Alumnos**: Registro completo con Nombre, Apellido y Contacto
- **Límite de Cupo**: Control automático de cupo máximo (300 alumnos)
- **Borrado Permanente**: Funcionalidad "Hard Delete" para eliminar alumnos y su historial
- **🔍 Búsqueda Instantánea**: Filtra alumnos en tiempo real por nombre, apellido o contacto
- **🎯 Filtros Rápidos**: Visualiza Todos | Pagados | Vencidos con un solo clic
- **🏷️ Badges de Estado**: Indicadores visuales verde (Pagado) y rojo (Vencido)
- **📊 Contador Dinámico**: Muestra cantidad de alumnos activos y filtrados
- **🩺 Observaciones Médicas**: Registro de notas médicas para cada alumno

### 💰 Pagos y Membresías
- **Control de Estado**: Visualización inmediata del estado de pago de cada alumno
- **Historial de Pagos**: Registro detallado de todas las transacciones
- **💳 Badges de Método**: Indicadores visuales para Efectivo/Transferencia
- **📅 Fechas Mejoradas**: Formato legible (ej: "18 Dic 2025")
- **💰 Resumen Automático**: Tarjeta con total del mes y cantidad de pagos
- **Alertas Visuales**: Alumnos con deuda resaltados automáticamente

### 📊 Dashboard y Estadísticas
- **📅 Navegador Interactivo**: Navega entre meses/años con flechas (← →)
- **🎯 Detección Automática**: Inicia en el mes actual real
- **✨ Tarjetas Animadas**: Stats cards con iconos grandes y efectos hover
- **💫 Animación Pulsante**: El contador de vencimientos pulsa para llamar la atención
- **📈 Gráfico de Ingresos**: Visualización de barras con gradiente dorado
- **📊 Tabla Anual Interactiva**: Haz clic en cualquier mes para navegar
- **Indicadores de Crecimiento**: Comparativa vs. mes anterior

### 🎨 Diseño y Experiencia (UI/UX)
- **Tema Premium**: Modo oscuro con acentos dorados (#FFD700)
- **Gradientes Profesionales**: Fondos con degradados sutiles
- **Animaciones Fluidas**: Transiciones suaves de 0.3s en todos los elementos
- **Efectos Hover**: Brillo dorado y elevación en tarjetas
- **Filas Alternadas**: Zebra striping para mejor lectura de tablas
- **Alertas Personalizadas**: Sistema de notificaciones modales propio

## 🛠️ Tecnologías

- **Frontend**: HTML5, CSS3 (Variables, Flexbox, Grid), JavaScript (ES6+ Modules)
- **Visualización**: Chart.js para gráficos interactivos
- **Backend / DB**: [Supabase](https://supabase.com) (PostgreSQL + Auth + RLS)
- **Empaquetado**: Electron (aplicación de escritorio)
- **Reportes**: jsPDF + jsPDF-AutoTable

## ⚙️ Instalación y Ejecución

### Requisitos Previos
- Node.js instalado
- Cuenta de Supabase configurada

### Pasos de Instalación

1. **Instalar Dependencias**:
   ```bash
   npm install
   ```

2. **Configuración**:
   - Edita `src/config.js` con tus credenciales de Supabase (`URL` y `KEY`)

3. **Base de Datos**:
   - Ejecuta el contenido de `SCHEMA.sql` en el Editor SQL de Supabase
   - Esto creará las tablas: `members`, `payments`, `products`, `attendance`
   - Incluye políticas RLS y índices de rendimiento

4. **Iniciar Aplicación**:
   ```bash
   npm start
   ```
   
   ⚠️ **IMPORTANTE**: El sistema debe ejecutarse en Electron o un servidor local. No funcionará abriendo `index.html` directamente en el navegador debido a restricciones CORS con ES modules.

## 📁 Estructura del Proyecto

```
Sistema-Gym/
├── index.html          # Interfaz principal
├── style.css           # Estilos (tema dark/gold)
├── app.js              # Lógica de la aplicación
├── SCHEMA.sql          # Esquema de base de datos
├── src/
│   ├── config.js       # Configuración de Supabase
│   └── supabaseClient.js
└── img/
    └── Logo.png
```

## 🔐 Seguridad

- **Row Level Security (RLS)**: Solo usuarios autenticados pueden acceder a los datos
- **Políticas de Supabase**: Permisos granulares por tabla
- **Borrado en Cascada**: Al eliminar un alumno, se eliminan sus pagos automáticamente

## 🎯 Funcionalidades Destacadas

### Navegación Temporal
- Navegador de meses con detección automática del mes actual
- Navegación infinita hacia atrás (historial) y adelante (planificación)
- Sincronización global: cambiar el mes actualiza Dashboard, Alumnos y Pagos

### Búsqueda y Filtros
- Búsqueda instantánea sin recargar
- Filtros por estado de pago
- Contador que muestra resultados filtrados

### Visualización de Datos
- Gráfico de barras animado con gradiente dorado
- Tabla anual clickeable para navegación rápida
- Resumen automático de pagos mensuales

## 📄 Exportación de Reportes

- **Reporte Mensual**: PDF con estadísticas y detalle de pagos
- **Lista de Pagos**: Exportación del historial filtrado por mes

## 🚧 Notas de Desarrollo

- El sistema usa ES6 modules (`import/export`)
- Requiere Electron o servidor HTTP para funcionar
- Chart.js se carga desde CDN
- Todas las fechas usan el formato ISO (YYYY-MM)

---

**Desarrollado para AyD Funcional Gym** 💪
