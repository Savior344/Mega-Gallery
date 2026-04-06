/**
 * GALERÍA MEGA — server.js
 * Servidor Node.js con streaming desde carpetas compartidas de MEGA.
 * Sin descarga, sin caché: todo en tiempo real.
 */

const express = require('express')
const path    = require('path')
const { File } = require('megajs')

const app  = express()
const PORT = 3000

// ================================================================
//  ⚙️  CONFIGURACIÓN — Pega aquí tus 4 links de carpetas de MEGA
//  Formato: 'https://mega.nz/folder/XXXXXXXX#YYYYYYYY'
// ================================================================
const FOLDER_LINKS = [
  'https://mega.nz/folder/XXXXXXXX#YYYYYYYY',   // Cuenta 1
  'https://mega.nz/folder/XXXXXXXX#YYYYYYYY',   // Cuenta 2
  'https://mega.nz/folder/XXXXXXXX#YYYYYYYY',   // Cuenta 3
  'https://mega.nz/folder/XXXXXXXX#YYYYYYYY',   // Cuenta 4
]
// ================================================================

// Extensiones reconocidas
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.avif'])
const VIDEO_EXTS = new Set(['.mp4', '.avi', '.mkv', '.mov', '.webm', '.flv', '.wmv', '.m4v', '.3gp'])

// Cache de metadatos (NO contenido, solo referencias)
let filesCache = []
let serverReady = false
let loadError   = null

// ────────────────────────────────────────────────────────────────
//  Utilidades
// ────────────────────────────────────────────────────────────────

function getExt(name) {
  return path.extname(name || '').toLowerCase()
}

function getMediaType(name) {
  const ext = getExt(name)
  if (IMAGE_EXTS.has(ext)) return 'image'
  if (VIDEO_EXTS.has(ext)) return 'video'
  return null
}

function getMimeType(name) {
  const mimes = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif',  '.webp': 'image/webp',  '.bmp': 'image/bmp',
    '.tiff': 'image/tiff', '.avif': 'image/avif',
    '.mp4': 'video/mp4',  '.webm': 'video/webm', '.mov': 'video/quicktime',
    '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo',
    '.flv': 'video/x-flv', '.wmv': 'video/x-ms-wmv',
    '.m4v': 'video/mp4',  '.3gp': 'video/3gpp',
  }
  return mimes[getExt(name)] || 'application/octet-stream'
}

function formatBytes(bytes) {
  if (!bytes) return '?'
  const units = ['B', 'KB', 'MB', 'GB']
  let u = 0
  while (bytes >= 1024 && u < units.length - 1) { bytes /= 1024; u++ }
  return `${bytes.toFixed(1)} ${units[u]}`
}

// ────────────────────────────────────────────────────────────────
//  Carga inicial de carpetas MEGA
// ────────────────────────────────────────────────────────────────

async function loadFolders() {
  console.log('\n╔══════════════════════════════════════╗')
  console.log('║   GALERÍA MEGA — Cargando archivos   ║')
  console.log('╚══════════════════════════════════════╝\n')

  for (let i = 0; i < FOLDER_LINKS.length; i++) {
    const link = FOLDER_LINKS[i]

    // Saltar links de ejemplo sin reemplazar
    if (link.includes('XXXXXXXX')) {
      console.warn(`  ⚠️  Carpeta ${i + 1}: Link no configurado, saltando.`)
      continue
    }

    try {
      console.log(`  📂 Carpeta ${i + 1}/${FOLDER_LINKS.length}: conectando...`)
      const folder = File.fromURL(link)
      await folder.loadAttributes()

      if (!folder.children || folder.children.length === 0) {
        console.warn(`  ⚠️  Carpeta ${i + 1}: vacía o sin acceso.`)
        continue
      }

      let count = 0
      for (const file of folder.children) {
        // Ignorar subcarpetas
        if (file.directory) continue

        const type = getMediaType(file.name)
        if (!type) continue

        filesCache.push({
          name:       file.name,
          type,
          size:       file.size || 0,
          sizeStr:    formatBytes(file.size),
          megaFile:   file,          // referencia para streaming — NO es el contenido
          folderIdx:  i,
        })
        count++
      }
      console.log(`  ✅ Carpeta ${i + 1}: ${count} archivos multimedia`)

    } catch (err) {
      console.error(`  ❌ Carpeta ${i + 1} error: ${err.message}`)
    }
  }

  // Orden alfabético global
  filesCache.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
  )

  serverReady = true
  console.log(`\n  🎬 Total listo: ${filesCache.length} archivos ordenados`)
  console.log(`  🌐 Abrí: http://localhost:${PORT}\n`)
}

// ────────────────────────────────────────────────────────────────
//  Servidor Express
// ────────────────────────────────────────────────────────────────

// Archivos estáticos (frontend)
app.use(express.static(path.join(__dirname, 'public')))

// Estado del servidor (el frontend lo consulta mientras carga)
app.get('/api/status', (req, res) => {
  res.json({ ready: serverReady, total: filesCache.length, error: loadError })
})

// Lista de archivos
app.get('/api/files', (req, res) => {
  if (!serverReady) return res.status(503).json({ error: 'Cargando...' })
  res.setHeader('Cache-Control', 'no-store')
  res.json(
    filesCache.map((f, i) => ({
      index:   i,
      name:    f.name,
      type:    f.type,
      size:    f.size,
      sizeStr: f.sizeStr,
    }))
  )
})

// Thumbnail — intenta MEGA thumbnail, fallback al archivo (solo imágenes)
app.get('/api/thumbnail/:index', async (req, res) => {
  if (!serverReady) return res.status(503).end()

  const idx = parseInt(req.params.index, 10)
  if (isNaN(idx) || idx < 0 || idx >= filesCache.length)
    return res.status(404).end()

  const f = filesCache[idx]
  res.setHeader('Cache-Control', 'no-store')

  // Intentar thumbnail nativo de MEGA (120×120 JPEG)
  const hasMegaThumb = f.megaFile.attributes && (
    f.megaFile.attributes.thumbnail !== undefined ||
    f.megaFile.attributes['0'] !== undefined
  )

  if (hasMegaThumb) {
    try {
      await new Promise((resolve, reject) => {
        f.megaFile.downloadThumbnail((err, buf) => {
          if (err || !buf) return reject(err || new Error('empty'))
          res.setHeader('Content-Type', 'image/jpeg')
          res.send(buf)
          resolve()
        })
      })
      return
    } catch (_) {
      // fallthrough
    }
  }

  // Fallback: para imágenes, hacer streaming del archivo completo
  // (el navegador lo muestra a tamaño thumbnail via CSS)
  if (f.type === 'image') {
    res.setHeader('Content-Type', getMimeType(f.name))
    try {
      const stream = f.megaFile.download()
      stream.pipe(res)
      stream.on('error', () => res.end())
    } catch (_) {
      res.status(500).end()
    }
    return
  }

  // Videos sin thumbnail: 404, el frontend muestra ícono
  res.status(404).end()
})

// Stream — archivo completo con soporte de Range (imprescindible para video seeking)
app.get('/api/stream/:index', async (req, res) => {
  if (!serverReady) return res.status(503).end()

  const idx = parseInt(req.params.index, 10)
  if (isNaN(idx) || idx < 0 || idx >= filesCache.length)
    return res.status(404).end()

  const f        = filesCache[idx]
  const mimeType = getMimeType(f.name)
  const fileSize = f.size

  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Type',  mimeType)
  res.setHeader('Accept-Ranges', 'bytes')

  const rangeHeader = req.headers.range

  if (rangeHeader && fileSize > 0) {
    // ── Respuesta parcial 206 (permite seeking en video) ──────────
    const [rawStart, rawEnd] = rangeHeader.replace(/bytes=/, '').split('-')
    const start    = parseInt(rawStart, 10)
    const end      = rawEnd ? Math.min(parseInt(rawEnd, 10), fileSize - 1) : fileSize - 1
    const chunkLen = end - start + 1

    res.writeHead(206, {
      'Content-Range':  `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges':  'bytes',
      'Content-Length': chunkLen,
      'Content-Type':   mimeType,
      'Cache-Control':  'no-store',
    })

    try {
      const stream = f.megaFile.download({ start, end })
      stream.pipe(res)
      stream.on('error', err => {
        console.error(`[stream range error] ${f.name}: ${err.message}`)
        res.end()
      })
    } catch (err) {
      console.error(`[download range error] ${f.name}: ${err.message}`)
      res.status(500).end()
    }

  } else {
    // ── Respuesta completa 200 ─────────────────────────────────────
    const headers = {
      'Accept-Ranges': 'bytes',
      'Content-Type':  mimeType,
      'Cache-Control': 'no-store',
    }
    if (fileSize > 0) headers['Content-Length'] = fileSize
    res.writeHead(200, headers)

    try {
      const stream = f.megaFile.download()
      stream.pipe(res)
      stream.on('error', err => {
        console.error(`[stream error] ${f.name}: ${err.message}`)
        res.end()
      })
    } catch (err) {
      console.error(`[download error] ${f.name}: ${err.message}`)
      res.status(500).end()
    }
  }
})

// ────────────────────────────────────────────────────────────────
//  Arrancar
// ────────────────────────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  🚀 Servidor iniciado en http://localhost:${PORT}`)
  loadFolders().catch(err => {
    loadError = err.message
    console.error('Error fatal cargando carpetas:', err)
  })
})
