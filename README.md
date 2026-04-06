# VAULT — Galería Privada con MEGA Streaming

Galería multimedia que transmite fotos y videos desde carpetas
compartidas de MEGA sin descargar ni cachear nada en el navegador.

---

## Requisitos

- Android con Termux instalado
- Conexión a internet
- Los 4 links de tus carpetas compartidas de MEGA

---

## Instalación paso a paso en Termux

### 1. Actualizar Termux e instalar Node.js

```bash
pkg update && pkg upgrade -y
pkg install nodejs -y
```

Verificá que funcionó:
```bash
node --version
npm --version
```

### 2. Crear la carpeta del proyecto

```bash
cd ~
mkdir galeria-mega
cd galeria-mega
```

### 3. Copiar los archivos del proyecto

Desde KickEdit Plus, copiá los archivos que te dio Claude a estas rutas:

```
~/galeria-mega/
├── package.json
├── server.js
└── public/
    ├── index.html
    ├── style.css
    └── app.js
```

Primero creá la carpeta `public`:
```bash
mkdir public
```

### 4. Configurar tus links de MEGA

Abrí `server.js` con KickEdit Plus y buscá esta sección:

```javascript
const FOLDER_LINKS = [
  'https://mega.nz/folder/XXXXXXXX#YYYYYYYY',   // Cuenta 1
  'https://mega.nz/folder/XXXXXXXX#YYYYYYYY',   // Cuenta 2
  'https://mega.nz/folder/XXXXXXXX#YYYYYYYY',   // Cuenta 3
  'https://mega.nz/folder/XXXXXXXX#YYYYYYYY',   // Cuenta 4
]
```

Reemplazá cada línea con tus links reales. Ejemplo:
```javascript
const FOLDER_LINKS = [
  'https://mega.nz/folder/AbCd1234#clave1aqui',
  'https://mega.nz/folder/EfGh5678#clave2aqui',
  'https://mega.nz/folder/IjKl9012#clave3aqui',
  'https://mega.nz/folder/MnOp3456#clave4aqui',
]
```

### 5. Instalar dependencias

```bash
cd ~/galeria-mega
npm install
```

Esto descarga automáticamente `express` y `megajs`.

### 6. Arrancar el servidor

```bash
node server.js
```

Deberías ver algo así:
```
  🚀 Servidor iniciado en http://localhost:3000

╔══════════════════════════════════════╗
║   GALERÍA MEGA — Cargando archivos   ║
╚══════════════════════════════════════╝

  📂 Carpeta 1/4: conectando...
  ✅ Carpeta 1: 87 archivos multimedia
  ...
  🎬 Total listo: 312 archivos ordenados
  🌐 Abrí: http://localhost:3000
```

### 7. Abrir en el navegador

Abrí Chrome o cualquier navegador en tu Android y andá a:
```
http://localhost:3000
```

La página aparecerá con un spinner mientras conecta con MEGA.
Una vez cargados los metadatos, verás la cuadrícula.

---

## Uso de la galería

| Acción | Resultado |
|--------|-----------|
| Tap en foto | Abre lightbox en pantalla completa |
| Tap en video | Abre reproductor con controles |
| Deslizar ← → en lightbox | Navegar entre fotos |
| Botón ✕ / tap en fondo | Cerrar |
| Filtros arriba | Mostrar solo fotos o solo videos |
| Lupa 🔍 | Buscar por nombre de archivo |

---

## Funcionamiento técnico

- El servidor carga **solo los metadatos** de MEGA al inicio (nombres, tamaños).
- Los thumbnails y archivos se transmiten **en tiempo real** cuando los pedís.
- Los videos usan **HTTP Range Requests** (como YouTube), lo que permite:
  - Buscar en cualquier punto del video sin descargar todo.
  - El navegador solo tiene en memoria el fragmento actual.
- **Nada** se guarda en caché del navegador ni en disco.

---

## Mantener el servidor corriendo

Si cerrás Termux, el servidor se detiene. Para dejarlo en background:

```bash
# Opción 1: tmux (recomendado)
pkg install tmux -y
tmux new -s galeria
node server.js
# Ctrl+B luego D para dejar en background
# tmux attach -t galeria para volver

# Opción 2: nohup simple
nohup node server.js &
```

---

## Solución de problemas

**Error: "Cannot find module 'megajs'"**
```bash
npm install
```

**Carpeta sin archivos / error de acceso**
- Verificá que el link sea correcto (incluyendo la parte `#clave`)
- Asegurate de tener internet en Termux

**Video no reproduce / no se puede buscar**
- Asegurate de usar Chrome o un navegador moderno
- El video formato `.avi` o `.mkv` puede no soportarse en el navegador; `.mp4` y `.webm` funcionan mejor

**Puerto 3000 en uso**
```bash
# Cambiar el puerto en server.js:
const PORT = 3001  # o cualquier otro número
```
