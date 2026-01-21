-- =============================================================================
-- AyD Funcional Gym - Database Schema
-- =============================================================================
-- Instrucciones de Uso:
-- 1. Copia todo el contenido de este archivo.
-- 2. Pégalo en el "SQL Editor" de tu proyecto en Supabase.
-- 3. Ejecuta el script (botón "Run").
-- =============================================================================

-- 1. Limpieza Inicial (Opcional - Descomentar si se quiere reiniciar la DB)
-- DROP TABLE IF EXISTS payments CASCADE;
-- DROP TABLE IF EXISTS members CASCADE;
-- DROP TABLE IF EXISTS products CASCADE;
-- DROP TABLE IF EXISTS attendance CASCADE;

-- 2. Configuraciones Generales
SET timezone = 'America/Argentina/Buenos_Aires';

-- 3. Tablas Principales

-- -----------------------------------------------------------------------------
-- TABLE: members
-- Almacena la información de los alumnos.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    contact TEXT,
    active BOOLEAN DEFAULT true,
    notes TEXT, -- Notas adicionales (médicas, observaciones)
    join_date DATE DEFAULT CURRENT_DATE,
    schedule_time TEXT, -- Horario preferido (ej: "08:00", "18:30")
    attendance_days TEXT -- Días que asiste en formato JSON array (ej: '["Lun","Mie","Vie"]')
);

-- Run this ALTER to add columns to existing tables:
-- ALTER TABLE members ADD COLUMN IF NOT EXISTS schedule_time TEXT;
-- ALTER TABLE members ADD COLUMN IF NOT EXISTS attendance_days TEXT;

-- -----------------------------------------------------------------------------
-- TABLE: payments
-- Historial de pagos. Se borra automáticamente si el alumno es borrado (CASCADE).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL,
    month_year TEXT NOT NULL, -- Formato: 'YYYY-MM' (ej: '2025-12')
    payment_method TEXT DEFAULT 'Efectivo', -- Efectivo, Transferencia, etc.
    notes TEXT,
    payment_date TIMESTAMP WITH TIME ZONE DEFAULT now(),
    expiration_date TIMESTAMP WITH TIME ZONE -- Fecha límite de acceso
);

-- -----------------------------------------------------------------------------
-- TABLE: products (Futuro)
-- Control de stock simple para agua, barras, etc.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    name TEXT NOT NULL,
    price NUMERIC NOT NULL DEFAULT 0,
    stock INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN DEFAULT true
);

-- -----------------------------------------------------------------------------
-- TABLE: attendance (Futuro)
-- Registro de ingresos de alumnos.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    check_in_time TIMESTAMP WITH TIME ZONE DEFAULT now(),
    member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE
);

-- 4. Seguridad (Row Level Security - RLS)

-- Habilitar RLS en todas las tablas
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;

-- Crear políticas de acceso
-- "Authenticated" cubre a los usuarios logueados en la app (Electron)
-- Se permite TODO (Select, Insert, Update, Delete) a usuarios autenticados.

-- Policy for 'members'
CREATE POLICY "Allow ALL for authenticated users on members"
ON members FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Policy for 'payments'
CREATE POLICY "Allow ALL for authenticated users on payments"
ON payments FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Policy for 'products'
CREATE POLICY "Allow ALL for authenticated users on products"
ON products FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Policy for 'attendance'
CREATE POLICY "Allow ALL for authenticated users on attendance"
ON attendance FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- 5. Índices de Rendimiento
-- Optimizan las búsquedas más frecuentes de la APP.

CREATE INDEX IF NOT EXISTS idx_members_active ON members(active);
CREATE INDEX IF NOT EXISTS idx_payments_member_id ON payments(member_id);
CREATE INDEX IF NOT EXISTS idx_payments_month_year ON payments(month_year);
CREATE INDEX IF NOT EXISTS idx_attendance_member_id ON attendance(member_id);

-- =============================================================================
-- Fin del Schema
-- =============================================================================
