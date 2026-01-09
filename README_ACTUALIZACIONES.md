# Sistema de Actualización Automática - Gimnasio

## Para tu amigo (Usuario Final)

### ¿Cómo actualizar el sistema?

**Es MUY FÁCIL:**

1. **Cierra** el sistema de gimnasio si está abierto
2. **Haz doble clic** en el archivo `ACTUALIZAR.bat`
3. **Espera** a que aparezca el mensaje "ACTUALIZACIÓN COMPLETADA"
4. **Abre** el sistema nuevamente

¡Eso es todo! 🎉

---

## Para ti (Desarrollador)

### Configuración Inicial (Solo una vez)

#### 1. Crear Repositorio en GitHub

```bash
# En tu carpeta del proyecto
cd "C:\Users\Gustavo Benitez\Desktop\Sistema-Gym"

# Inicializar Git
git init

# Crear .gitignore
echo node_modules/ > .gitignore
echo .env >> .gitignore

# Primer commit
git add .
git commit -m "Initial commit - Sistema Gimnasio"

# Crear repositorio en GitHub (hazlo desde github.com)
# Luego conecta tu repositorio local:
git remote add origin https://github.com/TU-USUARIO/Sistema-Gym.git
git branch -M main
git push -u origin main
```

#### 2. Actualizar el Script

Edita `ACTUALIZAR.bat` y reemplaza:
- `TU-USUARIO` con tu usuario de GitHub
- `Sistema-Gym` con el nombre de tu repositorio

#### 3. Enviar a tu Amigo

Envía a tu amigo la carpeta completa del proyecto (solo la primera vez).

### Flujo de Trabajo Diario

Cuando hagas cambios al sistema:

```bash
# 1. Haces tus cambios en el código
# 2. Guardas y pruebas

# 3. Subes los cambios a GitHub
git add .
git commit -m "Descripción de los cambios"
git push

# 4. Le dices a tu amigo: "Hay una actualización disponible"
# 5. Tu amigo hace doble clic en ACTUALIZAR.bat
# ¡Listo!
```

### Ventajas de este Sistema

✅ **Para tu amigo:**
- Solo hace doble clic
- No necesita saber nada de tecnología
- Sus datos NO se borran (están en Supabase)

✅ **Para ti:**
- Subes cambios cuando quieras
- No necesitas TeamViewer
- Control de versiones con Git

### Archivos Protegidos

El script NO sobrescribe estos archivos (para proteger la configuración):
- `src/config.js` (configuración de Supabase)
- `.git` (historial de Git)
- `node_modules` (dependencias)

### Solución de Problemas

**Si tu amigo no tiene internet:**
- Puedes enviarle un ZIP con los archivos actualizados
- Él solo copia y pega los archivos

**Si el script no funciona:**
- Verifica que la URL de GitHub sea correcta
- Asegúrate de que el repositorio sea público (o configura autenticación)

### Alternativa: GitHub Releases

Para actualizaciones más controladas:

1. Crea un "Release" en GitHub cuando tengas una versión estable
2. Tu amigo descarga el ZIP del release
3. Extrae y reemplaza archivos

---

## Próximos Pasos Recomendados

1. **Crear repositorio en GitHub**
2. **Probar el script de actualización** en tu máquina
3. **Enviar todo a tu amigo** (primera vez)
4. **Hacer un cambio pequeño** y probar que funcione la actualización

¿Necesitas ayuda con algún paso? ¡Avísame!
