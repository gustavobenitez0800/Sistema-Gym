# AyD Funcional Gym - Sistema de Gestión

![Logo](./img/Logo.png)

Este es el sistema de gestión oficial para **AyD Funcional Gym**, diseñado específicamente para administrar alumnos, pagos y estadísticas financieras.

## 🚀 Características Principales

### 👥 Gestión de Alumnos
- **Alta de Alumnos**: Registro completo con Nombre, Apellido y Contacto.
- **Limite de Cupo**: Control automático de cupo máximo (300 alumnos).
- **Borrado Permanente**: Funcionalidad "Hard Delete" para eliminar alumnos y su historial por completo.

### 💰 Pagos y Membresías
- **Control de Estado**: Visualización inmediata de alumnos **PAGADO** (Verde) o **VENCIDO** (Rojo).
- **Historial de Pagos**: Registro detallado de todas las transacciones ordenadas cronológicamente.
- **Alertas Visuales**: Los alumnos con deuda se resaltan automáticamente en la lista.

### 📊 Estadísticas y Finanzas
- **Selector Mensual Global**: Navegación fluida entre los meses de 2026 (Enero - Diciembre).
- **Balance Mensual**: Cálculo automático del total recaudado por mes.
- **Indicadores de Crecimiento**: Comparativa porcentual de alumnos activos vs. el mes anterior.
- **Reporte Anual**: Tabla resumen con la evolución financiera y de matrícula mes a mes.

### 🎨 Diseño y Experiencia (UI/UX)
- **Tema Premium**: Diseño moderno en modo oscuro (Negro/Amarillo Oro).
- **Interfaz Interactiva**: Animaciones fluidas, efectos hover en tarjetas y botones.
- **Alertas Personalizadas**: Sistema de notificaciones modales propio (sin popups del navegador).

## 🛠️ Tecnologías

- **Frontend**: HTML5, CSS3 (Variables, Flexbox, Grid), JavaScript (ES6+ Modules).
- **Backend / DB**: [Supabase](https://supabase.com) (PostgreSQL + Auth).
- **Empaquetado**: Electron (para ejecución como aplicación de escritorio).

## ⚙️ Instalación y Ejecución

1. **Requisitos Previos**:
   - Node.js instalado.
   - Cuenta de Supabase configurada.

2. **Instalar Dependencias**:
   ```bash
   npm install
   ```

3. **Configuración**:
   - Asegúrate de que `src/config.js` tenga tus credenciales de Supabase (`URL` y `KEY`).

4. **Base de Datos**:
   - Ejecuta el contenido de `SCHEMA.sql` en el Editor SQL de Supabase para crear las tablas y políticas de seguridad.

5. **Iniciar Aplicación**:
   ```bash
   npm start
   ```

## 🔐 Seguridad

El sistema utiliza **Row Level Security (RLS)** de Supabase, asegurando que solo los usuarios autenticados puedan leer o modificar la base de datos.
