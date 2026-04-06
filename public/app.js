/**
 * VAULT — Galería Privada
 * app.js — Lógica del frontend
 *
 * No se descarga ni cachea ningún contenido multimedia.
 * Todo llega via streaming desde el servidor Node.js → MEGA.
 */

;(function () {
  'use strict'

  // ── Estado ───────────────────────────────────────────────────
  const state = {
    files:        [],       // todos los archivos (metadatos)
    filtered:     [],       // lista filtrada/buscada
    filter:       'all',    // 'all' | 'image' | 'video'
    query:        '',       // texto de búsqueda
    lbIndex:      -1,       // índice actual en el lightbox
    lbImgIndices: [],       // índices de imágenes visibles (para navegación)
    pollTimer:    null,
  }

  // ── Elementos del DOM ────────────────────────────────────────
  const $ = id => document.getElementById(id)

  const loadingScreen = $('loadingScreen')
  const loaderStatus  = $('loaderStatus')
  const loaderBar     = $('loaderBar')
  const appEl         = $('app')
  const gallery       = $('gallery')
  const fileCount     = $('fileCount')
  const emptyState    = $('emptyState')

  const searchToggle  = $('searchToggle')
  const searchBar     = $('searchBar')
  const searchInput   = $('searchInput')
  const searchClear   = $('searchClear')

  const lightbox      = $('lightbox')
  const lbBackdrop    = $('lbBackdrop')
  const lbClose       = $('lbClose')
  const lbPrev        = $('lbPrev')
  const lbNext        = $('lbNext')
  const lbImg         = $('lbImg')
  const lbSpinner     = $('lbSpinner')
  const lbName        = $('lbName')
  const lbSize        = $('lbSize')
  const lbCounter     = $('lbCounter')

  const videoModal    = $('videoModal')
  const vmBackdrop    = $('vmBackdrop')
  const vmClose       = $('vmClose')
  const vmTitle       = $('vmTitle')
  const vmPlayer      = $('vmPlayer')
  const vmSpinner     = $('vmSpinner')
  const vmMeta        = $('vmMeta')

  // ── Polling hasta que el servidor esté listo ─────────────────

  function pollStatus() {
    fetch('/api/status')
      .then(r => r.json())
      .then(data => {
        if (data.error && !data.ready) {
          loaderStatus.textContent = 'Error: ' + data.error
          return
        }
        if (data.ready) {
          loaderStatus.textContent = `${data.total} archivos cargados`
          loaderBar.classList.add('complete')
          clearInterval(state.pollTimer)
          setTimeout(initGallery, 600)
        } else {
          loaderStatus.textContent = 'Conectando con MEGA…'
        }
      })
      .catch(() => {
        loaderStatus.textContent = 'Esperando servidor…'
      })
  }

  state.pollTimer = setInterval(pollStatus, 1500)
  pollStatus() // primera llamada inmediata

  // ── Inicializar galería ──────────────────────────────────────

  async function initGallery() {
    try {
      const res   = await fetch('/api/files')
      const files = await res.json()
      state.files = files

      // Ocultar loading, mostrar app
      loadingScreen.classList.add('fade-out')
      setTimeout(() => loadingScreen.classList.add('hidden'), 500)
      appEl.classList.remove('hidden')

      applyFilter()
    } catch (err) {
      loaderStatus.textContent = 'Error cargando archivos: ' + err.message
    }
  }

  // ── Filtrado y búsqueda ──────────────────────────────────────

  function applyFilter() {
    const q = state.query.toLowerCase().trim()

    state.filtered = state.files.filter(f => {
      const matchType  = state.filter === 'all' || f.type === state.filter
      const matchQuery = !q || f.name.toLowerCase().includes(q)
      return matchType && matchQuery
    })

    renderGallery()
    updateImageNavList()
  }

  function updateImageNavList() {
    // Lista de índices de imágenes en el conjunto filtrado, para navegar en lightbox
    state.lbImgIndices = state.filtered
      .map((f, i) => f.type === 'image' ? i : -1)
      .filter(i => i !== -1)
  }

  // ── Render de cuadrícula ─────────────────────────────────────

  function renderGallery() {
    gallery.innerHTML = ''

    if (state.filtered.length === 0) {
      emptyState.classList.remove('hidden')
      fileCount.textContent = '0 archivos'
      return
    }

    emptyState.classList.add('hidden')
    fileCount.textContent = `${state.filtered.length} archivos`

    const fragment = document.createDocumentFragment()

    state.filtered.forEach((file, i) => {
      const item = createGalleryItem(file, i)
      fragment.appendChild(item)
    })

    gallery.appendChild(fragment)

    // Lazy loading con IntersectionObserver
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          loadThumbnail(entry.target)
          observer.unobserve(entry.target)
        }
      })
    }, { rootMargin: '200px' })

    gallery.querySelectorAll('.gallery-item').forEach(el => observer.observe(el))
  }

  function createGalleryItem(file, filteredIndex) {
    const item = document.createElement('div')
    item.className = 'gallery-item'
    item.dataset.index    = file.index   // índice global
    item.dataset.filtered = filteredIndex
    item.dataset.type     = file.type

    // Badge tipo
    const badge = document.createElement('span')
    badge.className = `type-badge ${file.type}`
    badge.textContent = file.type === 'video' ? '▶ VIDEO' : 'IMG'
    item.appendChild(badge)

    // Imagen / placeholder
    if (file.type === 'image') {
      const img = document.createElement('img')
      img.alt = file.name
      img.loading = 'lazy'
      item.appendChild(img)
    } else {
      // Placeholder video — se reemplaza si hay thumbnail
      const placeholder = document.createElement('div')
      placeholder.className = 'video-placeholder'
      placeholder.innerHTML = `
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5v14l11-7z"/>
        </svg>`
      item.appendChild(placeholder)

      // También puede haber thumbnail en MEGA para videos
      const img = document.createElement('img')
      img.alt = file.name
      img.style.display = 'none'
      item.appendChild(img)
    }

    // Overlay de info
    const overlay = document.createElement('div')
    overlay.className = 'item-overlay'
    overlay.innerHTML = `
      <div class="item-name">${escHtml(file.name)}</div>
      <div class="item-size">${file.sizeStr || ''}</div>`
    item.appendChild(overlay)

    // Click handler
    item.addEventListener('click', () => openMedia(file, filteredIndex))

    return item
  }

  function loadThumbnail(itemEl) {
    const globalIdx = itemEl.dataset.index
    const type      = itemEl.dataset.type
    const img       = itemEl.querySelector('img')
    if (!img) return

    img.src = `/api/thumbnail/${globalIdx}`

    img.onload = () => {
      if (type === 'video') {
        img.style.display = 'block'
        const placeholder = itemEl.querySelector('.video-placeholder')
        if (placeholder) placeholder.style.display = 'none'
      }
      itemEl.classList.add('loaded')
    }

    img.onerror = () => {
      // Sin thumbnail: para imágenes mostramos el archivo completo de todas formas
      // Para videos, dejamos el placeholder
      if (type === 'image') {
        img.src = `/api/stream/${globalIdx}`
        img.onload = () => itemEl.classList.add('loaded')
      } else {
        itemEl.classList.add('loaded') // quitar shimmer en video sin thumb
      }
    }
  }

  // ── Abrir media ──────────────────────────────────────────────

  function openMedia(file, filteredIndex) {
    if (file.type === 'image') {
      openLightbox(file, filteredIndex)
    } else {
      openVideoModal(file)
    }
  }

  // ── Lightbox (imágenes) ──────────────────────────────────────

  function openLightbox(file, filteredIndex) {
    state.lbIndex = filteredIndex

    lbImg.style.opacity = '0'
    lbSpinner.classList.remove('done')
    lightbox.classList.remove('hidden')
    document.body.style.overflow = 'hidden'

    loadLightboxImage(file)
    updateLightboxNav()
  }

  function loadLightboxImage(file) {
    lbName.textContent    = file.name
    lbSize.textContent    = file.sizeStr || ''
    lbImg.style.opacity   = '0'
    lbSpinner.classList.remove('done')

    lbImg.onload = () => {
      lbImg.style.opacity = '1'
      lbSpinner.classList.add('done')
    }
    lbImg.onerror = () => {
      lbSpinner.classList.add('done')
    }

    // Streaming: no descarga completa, el navegador gestiona la carga
    lbImg.src = `/api/stream/${file.index}`
  }

  function updateLightboxNav() {
    const pos = state.lbImgIndices.indexOf(state.lbIndex)
    const total = state.lbImgIndices.length
    lbCounter.textContent = total > 1 ? `${pos + 1} / ${total}` : ''
    lbPrev.style.display = total > 1 ? '' : 'none'
    lbNext.style.display = total > 1 ? '' : 'none'
  }

  function navigateLightbox(dir) {
    const pos      = state.lbImgIndices.indexOf(state.lbIndex)
    const newPos   = (pos + dir + state.lbImgIndices.length) % state.lbImgIndices.length
    const newFiltI = state.lbImgIndices[newPos]
    const newFile  = state.filtered[newFiltI]

    state.lbIndex = newFiltI
    loadLightboxImage(newFile)
    updateLightboxNav()
  }

  function closeLightbox() {
    lightbox.classList.add('hidden')
    lbImg.src = ''
    document.body.style.overflow = ''
  }

  lbClose.addEventListener('click', closeLightbox)
  lbBackdrop.addEventListener('click', closeLightbox)
  lbPrev.addEventListener('click', () => navigateLightbox(-1))
  lbNext.addEventListener('click', () => navigateLightbox(1))

  // ── Modal de video ───────────────────────────────────────────

  function openVideoModal(file) {
    vmTitle.textContent = file.name
    vmMeta.textContent  = file.sizeStr ? `Tamaño: ${file.sizeStr}` : ''

    vmPlayer.src = ''
    vmSpinner.classList.remove('done')
    videoModal.classList.remove('hidden')
    document.body.style.overflow = 'hidden'

    // Asignar src DESPUÉS de mostrar el modal
    // preload="metadata" + streaming Range → el navegador carga solo lo necesario
    vmPlayer.src = `/api/stream/${file.index}`
    vmPlayer.load()

    vmPlayer.oncanplay = () => vmSpinner.classList.add('done')
    vmPlayer.onerror   = () => {
      vmSpinner.classList.add('done')
      vmMeta.textContent = 'Error al cargar el video.'
    }
  }

  function closeVideoModal() {
    videoModal.classList.add('hidden')
    vmPlayer.pause()
    vmPlayer.src = ''  // liberar recursos inmediatamente
    vmPlayer.load()
    document.body.style.overflow = ''
  }

  vmClose.addEventListener('click', closeVideoModal)
  vmBackdrop.addEventListener('click', closeVideoModal)

  // ── Búsqueda ─────────────────────────────────────────────────

  searchToggle.addEventListener('click', () => {
    const hidden = searchBar.classList.toggle('hidden')
    if (!hidden) {
      searchInput.focus()
    } else {
      searchInput.value = ''
      state.query = ''
      applyFilter()
    }
  })

  searchInput.addEventListener('input', () => {
    state.query = searchInput.value
    applyFilter()
  })

  searchClear.addEventListener('click', () => {
    searchInput.value = ''
    state.query = ''
    searchInput.focus()
    applyFilter()
  })

  // ── Filtros ──────────────────────────────────────────────────

  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'))
      btn.classList.add('active')
      state.filter = btn.dataset.filter
      applyFilter()
    })
  })

  // ── Teclado ──────────────────────────────────────────────────

  document.addEventListener('keydown', e => {
    if (!lightbox.classList.contains('hidden')) {
      if (e.key === 'Escape')      closeLightbox()
      if (e.key === 'ArrowLeft')   navigateLightbox(-1)
      if (e.key === 'ArrowRight')  navigateLightbox(1)
    }
    if (!videoModal.classList.contains('hidden')) {
      if (e.key === 'Escape') closeVideoModal()
    }
  })

  // ── Swipe táctil en lightbox ─────────────────────────────────
  let touchStartX = 0

  lightbox.addEventListener('touchstart', e => {
    touchStartX = e.changedTouches[0].clientX
  }, { passive: true })

  lightbox.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX
    if (Math.abs(dx) > 60) navigateLightbox(dx < 0 ? 1 : -1)
  }, { passive: true })

  // ── Utilidades ───────────────────────────────────────────────

  function escHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

})()
