// Patas & Memórias • Aplicação Conectada 100% ao Firebase (Auth + Cloud Firestore)
import {
  ensureAuthenticated,
  subscribeToMemories,
  createMemory,
  toggleMemoryFavorite,
  deleteMemoryById,
  subscribeToCapsuleProfile,
  saveCapsuleProfile,
  compressImageToDataUrl
} from './firebase.js';

// App State (100% synchronized with Cloud Firestore)
let memories = [];
let capsuleProfile = null;
let currentCategory = 'all';
let searchQuery = '';
let currentPhotoDataUrl = '';
let currentProfilePhotoDataUrl = '';
let currentLightboxIndex = -1;
let galleryPhotosList = [];
let isLoadingMemories = true;
let isLoadingProfile = true;

// Escape HTML helper to prevent XSS when rendering user content from Firestore
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Date Formatter
function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parts[0];
      const monthIndex = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const months = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
      ];
      if (months[monthIndex]) {
        return `${day} de ${months[monthIndex]} de ${year}`;
      }
    }
  } catch (e) {
    // fallback
  }
  return dateStr;
}

function formatYear(dateStr) {
  if (!dateStr) return '';
  return dateStr.substring(0, 4);
}

// Toast helper
function showToast(message) {
  const toast = document.getElementById('toastNotice');
  const msgEl = document.getElementById('toastMessage');
  if (toast && msgEl) {
    msgEl.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3000);
  }
}

// Render Capsule Profile from Firestore
function renderCapsuleProfile() {
  const profileCard = document.getElementById('profileCardSection');
  const photoImg = document.getElementById('profilePhotoImg');
  const photoPlaceholder = document.getElementById('profilePhotoPlaceholder');
  const nameEl = document.getElementById('profilePetName');
  const yearsEl = document.getElementById('profilePetYears');
  const dotEl = document.getElementById('profileLifespanDot');
  const subtitleEl = document.getElementById('profilePetSubtitle');
  const epitaphEl = document.getElementById('profilePetEpitaph');
  const brandTag = document.getElementById('brandTagText');
  const timelineTitle = document.getElementById('timelineHeaderTitle');

  if (isLoadingProfile) {
    if (profileCard) profileCard.classList.add('is-loading');
    return;
  }

  if (profileCard) profileCard.classList.remove('is-loading');

  if (!capsuleProfile) {
    if (photoImg) photoImg.style.display = 'none';
    if (photoPlaceholder) photoPlaceholder.style.display = 'flex';
    if (nameEl) nameEl.textContent = 'Sua Cápsula';
    if (yearsEl) yearsEl.textContent = 'Configure o perfil';
    if (dotEl) dotEl.style.display = 'none';
    if (subtitleEl) subtitleEl.textContent = '';
    if (epitaphEl) {
      epitaphEl.textContent = 'Personalize os dados do seu companheiro para eternizar cada lembrança com carinho.';
    }
    if (brandTag) brandTag.textContent = 'Cápsula Digital';
    if (timelineTitle) timelineTitle.textContent = 'A Jornada';
    document.title = 'Patas & Memórias 🐾';
    return;
  }

  const petName = capsuleProfile.name || 'Sua Cápsula';
  if (nameEl) nameEl.textContent = petName;
  if (brandTag) {
    brandTag.textContent = capsuleProfile.name ? `Cápsula Digital • ${capsuleProfile.name}` : 'Cápsula Digital';
  }
  if (timelineTitle) timelineTitle.textContent = `A Jornada de ${petName}`;
  document.title = `Patas & Memórias • ${petName} 🐾`;

  if (capsuleProfile.photo) {
    if (photoImg) {
      photoImg.src = capsuleProfile.photo;
      photoImg.alt = petName;
      photoImg.style.display = 'block';
    }
    if (photoPlaceholder) photoPlaceholder.style.display = 'none';
  } else {
    if (photoImg) photoImg.style.display = 'none';
    if (photoPlaceholder) photoPlaceholder.style.display = 'flex';
  }

  const hasYears = Boolean(capsuleProfile.years);
  const hasSubtitle = Boolean(capsuleProfile.subtitle);
  if (yearsEl) yearsEl.textContent = capsuleProfile.years || '';
  if (subtitleEl) subtitleEl.textContent = capsuleProfile.subtitle || '';
  if (dotEl) dotEl.style.display = hasYears && hasSubtitle ? 'inline' : 'none';

  if (epitaphEl) {
    epitaphEl.textContent = capsuleProfile.epitaph
      ? `“${capsuleProfile.epitaph.replace(/^[“"]|[”"]$/g, '')}”`
      : '';
  }
}

// Update Counters & Category Badges
function updateStatsAndCounts() {
  const total = memories.length;
  const photos = memories.filter(m => !!m.photo).length;
  const favorites = memories.filter(m => m.isFavorite).length;

  const countMem = document.getElementById('statMemoriesCount');
  const countPho = document.getElementById('statPhotosCount');
  const countFav = document.getElementById('statFavoritesCount');
  const galleryCountTag = document.getElementById('galleryCountTag');

  if (countMem) countMem.textContent = total;
  if (countPho) countPho.textContent = photos;
  if (countFav) countFav.textContent = favorites;
  if (galleryCountTag) galleryCountTag.textContent = `${photos} ${photos === 1 ? 'foto' : 'fotos'}`;

  const setElText = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setElText('countAll', total);
  setElText('countFav', favorites);
  setElText('countFilhote', memories.filter(m => m.category === 'Filhote').length);
  setElText('countBrincadeiras', memories.filter(m => m.category === 'Brincadeiras').length);
  setElText('countViagem', memories.filter(m => m.category === 'Viagem').length);
  setElText('countDia', memories.filter(m => m.category === 'Dia a Dia').length);
  setElText('countSoneca', memories.filter(m => m.category === 'Soneca').length);
  setElText('countFamilia', memories.filter(m => m.category === 'Família').length);
}

function getFilteredMemories() {
  return memories.filter(mem => {
    let matchCat = true;
    if (currentCategory === 'favoritas') {
      matchCat = Boolean(mem.isFavorite);
    } else if (currentCategory !== 'all') {
      matchCat = (mem.category === currentCategory);
    }

    let matchSearch = true;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const titleMatch = (mem.title || '').toLowerCase().includes(q);
      const storyMatch = (mem.story || '').toLowerCase().includes(q);
      const catMatch = (mem.category || '').toLowerCase().includes(q);
      matchSearch = titleMatch || storyMatch || catMatch;
    }

    return matchCat && matchSearch;
  });
}

// Render Feed
function renderFeed() {
  const container = document.getElementById('memoriesFeed');
  const emptyState = document.getElementById('emptyState');
  const emptyTitle = document.getElementById('emptyStateTitle');
  const emptyDesc = document.getElementById('emptyStateDesc');
  if (!container) return;

  if (isLoadingMemories) {
    if (emptyState) emptyState.style.display = 'none';
    container.innerHTML = `
      <div class="memory-card skeleton-memory-card" aria-hidden="true">
        <div class="card-header">
          <div class="skeleton-bone skeleton-badge"></div>
          <div class="skeleton-bone skeleton-date"></div>
          <div class="skeleton-bone skeleton-icon"></div>
        </div>
        <div class="skeleton-bone skeleton-photo"></div>
        <div class="card-content">
          <div class="skeleton-bone skeleton-title"></div>
          <div class="skeleton-bone skeleton-text line-1"></div>
          <div class="skeleton-bone skeleton-text line-2"></div>
          <div class="skeleton-bone skeleton-footer"></div>
        </div>
      </div>
      <div class="memory-card skeleton-memory-card" aria-hidden="true">
        <div class="card-header">
          <div class="skeleton-bone skeleton-badge"></div>
          <div class="skeleton-bone skeleton-date"></div>
          <div class="skeleton-bone skeleton-icon"></div>
        </div>
        <div class="skeleton-bone skeleton-photo"></div>
        <div class="card-content">
          <div class="skeleton-bone skeleton-title"></div>
          <div class="skeleton-bone skeleton-text line-1"></div>
          <div class="skeleton-bone skeleton-text line-2"></div>
          <div class="skeleton-bone skeleton-footer"></div>
        </div>
      </div>
    `;
    return;
  }

  const filtered = getFilteredMemories();

  if (filtered.length === 0) {
    container.innerHTML = '';
    if (emptyState) {
      emptyState.style.display = 'flex';
      const suggBox = emptyState.querySelector('.empty-suggestions');
      const emptyBtn = document.getElementById('btnEmptyCreate');
      if (memories.length === 0) {
        if (emptyTitle) emptyTitle.textContent = 'Sua cápsula está vazia';
        if (emptyDesc) emptyDesc.textContent = 'Eternize a primeira lembrança para guardar este momento para sempre.';
        if (suggBox) suggBox.style.display = 'flex';
        if (emptyBtn) emptyBtn.style.display = 'inline-flex';
      } else {
        if (emptyTitle) emptyTitle.textContent = 'Nenhuma lembrança encontrada';
        if (emptyDesc) emptyDesc.textContent = 'Tente alterar o filtro de categoria ou pesquisar por outro termo.';
        if (suggBox) suggBox.style.display = 'none';
        if (emptyBtn) emptyBtn.style.display = 'none';
      }
    }
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  container.innerHTML = filtered.map(mem => {
    const isFav = mem.isFavorite ? 'is-favorite' : '';
    const heartFill = mem.isFavorite ? 'currentColor' : 'none';
    const safeTitle = escapeHtml(mem.title);
    const safeStory = escapeHtml(mem.story);
    const safeCategory = escapeHtml(mem.category || 'Dia a Dia');
    const safeId = escapeHtml(mem.id);

    return `
      <article class="memory-card" data-id="${safeId}">
        <div class="card-top-meta">
          <div class="tag-date-group">
            <span class="cat-tag">${safeCategory}</span>
            <span class="date-text">${escapeHtml(formatDate(mem.date))}</span>
          </div>
          <button class="btn-fav ${isFav}" data-id="${safeId}" title="${mem.isFavorite ? 'Remover dos favoritos' : 'Favoritar'}">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="${heartFill}" stroke="currentColor" stroke-width="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
          </button>
        </div>

        ${mem.photo ? `
          <div class="photo-frame" data-action="zoom" data-id="${safeId}">
            <img src="${escapeHtml(mem.photo)}" alt="${safeTitle}" loading="lazy" />
            <span class="photo-zoom-hint" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                <polyline points="15 3 21 3 21 9"></polyline>
                <polyline points="9 21 3 21 3 15"></polyline>
                <line x1="21" y1="3" x2="14" y2="10"></line>
                <line x1="3" y1="21" x2="10" y2="14"></line>
              </svg>
            </span>
          </div>
        ` : ''}

        <div class="card-content">
          <h3 class="memory-headline">${safeTitle}</h3>
          <p class="memory-narrative">${safeStory}</p>
        </div>

        <div class="card-foot">
          <button class="btn-remove-mem" data-id="${safeId}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
            <span>Remover</span>
          </button>
        </div>
      </article>
    `;
  }).join('');
}

// Render Gallery
function renderGallery() {
  const grid = document.getElementById('galleryGrid');
  if (!grid) return;

  if (isLoadingMemories) {
    grid.innerHTML = Array.from({ length: 6 }).map(() => `
      <div class="gallery-card skeleton-gallery-card" aria-hidden="true">
        <div class="skeleton-bone skeleton-full"></div>
      </div>
    `).join('');
    return;
  }

  galleryPhotosList = memories.filter(m => !!m.photo);

  if (galleryPhotosList.length === 0) {
    grid.innerHTML = `
      <div class="empty-state-card gallery-empty-card" style="grid-column: 1 / -1;">
        <div class="empty-icon-circle">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <circle cx="8.5" cy="8.5" r="1.5"></circle>
            <polyline points="21 15 16 10 5 21"></polyline>
          </svg>
        </div>
        <h3 class="empty-title">Nenhum retrato guardado ainda</h3>
        <p class="empty-desc">As fotos que você adicionar às histórias serão reunidas e organizadas aqui neste álbum.</p>
        <button class="btn-create" id="btnEmptyGallery">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span>Guardar Primeira Foto</span>
        </button>
      </div>
    `;
    const btnEmptyGal = document.getElementById('btnEmptyGallery');
    if (btnEmptyGal) btnEmptyGal.addEventListener('click', openAddModal);
    return;
  }

  grid.innerHTML = galleryPhotosList.map((mem, idx) => `
    <div class="gallery-card" data-index="${idx}" data-id="${escapeHtml(mem.id)}">
      <img src="${escapeHtml(mem.photo)}" alt="${escapeHtml(mem.title)}" loading="lazy" />
      <div class="gallery-overlay">${escapeHtml(mem.title)}</div>
    </div>
  `).join('');
}

// Render Timeline
function renderTimeline() {
  const container = document.getElementById('timelineContainer');
  if (!container) return;

  if (isLoadingMemories) {
    container.innerHTML = Array.from({ length: 3 }).map(() => `
      <div class="timeline-step skeleton-timeline-step" aria-hidden="true">
        <div class="timeline-dot skeleton-bone" style="border:none;"></div>
        <div class="timeline-box" style="border-color: var(--border-delicate);">
          <div class="skeleton-bone skeleton-timeline-tag"></div>
          <div class="skeleton-bone skeleton-timeline-title"></div>
          <div class="skeleton-bone skeleton-text line-1"></div>
          <div class="skeleton-bone skeleton-text line-2"></div>
        </div>
      </div>
    `).join('');
    return;
  }

  const sorted = [...memories].sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  if (sorted.length === 0) {
    container.innerHTML = `
      <div class="empty-state-card timeline-empty-card">
        <div class="empty-icon-circle">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
        </div>
        <h3 class="empty-title">A história está pronta para começar</h3>
        <p class="empty-desc">Ao registrar memórias com datas, cada capítulo da vida do seu companheiro será desenhado cronologicamente aqui.</p>
        <button class="btn-create" id="btnEmptyTimeline">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          <span>Adicionar Primeiro Marco</span>
        </button>
      </div>
    `;
    const btnEmptyTime = document.getElementById('btnEmptyTimeline');
    if (btnEmptyTime) btnEmptyTime.addEventListener('click', openAddModal);
    return;
  }

  container.innerHTML = sorted.map(mem => `
    <div class="timeline-step">
      <div class="timeline-dot"></div>
      <div class="timeline-box">
        <div class="timeline-year-tag">${escapeHtml(formatYear(mem.date))} • ${escapeHtml(formatDate(mem.date))}</div>
        <h4 class="timeline-headline">${escapeHtml(mem.title)}</h4>
        <p class="timeline-body">${escapeHtml(mem.story)}</p>
      </div>
    </div>
  `).join('');
}

function renderAll() {
  updateStatsAndCounts();
  renderFeed();
  renderGallery();
  renderTimeline();
}

// Lightbox with Next / Previous Navigation
function updateLightboxMeta(index) {
  if (!galleryPhotosList || !galleryPhotosList[index]) return;
  const mem = galleryPhotosList[index];

  const title = document.getElementById('lightboxTitle');
  const caption = document.getElementById('lightboxCaption');
  const category = document.getElementById('lightboxCategory');
  const date = document.getElementById('lightboxDate');
  const counter = document.getElementById('lightboxCounter');

  if (title) title.textContent = mem.title || '';
  if (caption) caption.textContent = mem.story || '';
  if (category) category.textContent = mem.category || 'Memória';
  if (date) date.textContent = formatDate(mem.date);
  if (counter) counter.textContent = `${index + 1} de ${galleryPhotosList.length}`;

  const dots = document.querySelectorAll('.carousel-dot');
  dots.forEach((d, i) => d.classList.toggle('active', i === index));

  const metaEl = document.querySelector('.lightbox-meta');
  if (metaEl) metaEl.scrollTop = 0;
}

function scrollToSlide(index, behavior = 'smooth') {
  if (!galleryPhotosList || galleryPhotosList.length === 0) return;
  if (index < 0) index = 0;
  if (index >= galleryPhotosList.length) index = galleryPhotosList.length - 1;

  const track = document.getElementById('lightboxTrack');
  if (!track) return;

  const slide = track.children[index];
  if (slide) {
    track.scrollTo({ left: slide.offsetLeft, behavior });
    currentLightboxIndex = index;
    updateLightboxMeta(index);
  }
}

// Lightbox with Swipeable Carousel
function openLightboxByIndex(index) {
  if (!galleryPhotosList || galleryPhotosList.length === 0) {
    galleryPhotosList = memories.filter(m => !!m.photo);
  }
  if (!galleryPhotosList || galleryPhotosList.length === 0) return;

  if (index < 0) index = 0;
  if (index >= galleryPhotosList.length) index = galleryPhotosList.length - 1;

  currentLightboxIndex = index;

  const modal = document.getElementById('lightboxModal');
  const track = document.getElementById('lightboxTrack');
  const dotsContainer = document.getElementById('carouselDots');
  if (!modal || !track) return;

  // Render slides into carousel track
  track.innerHTML = galleryPhotosList.map((mem, idx) => `
    <div class="lightbox-slide" data-index="${idx}">
      <div class="lightbox-slide-inner">
        <img src="${escapeHtml(mem.photo)}" alt="${escapeHtml(mem.title)}" loading="${idx === index ? 'eager' : 'lazy'}" />
      </div>
    </div>
  `).join('');

  // Render navigation dots
  if (dotsContainer) {
    if (galleryPhotosList.length > 1) {
      dotsContainer.innerHTML = galleryPhotosList.map((_, idx) => `
        <span class="carousel-dot ${idx === index ? 'active' : ''}" data-index="${idx}" title="Ir para foto ${idx + 1}"></span>
      `).join('');
    } else {
      dotsContainer.innerHTML = '';
    }
  }

  updateLightboxMeta(index);

  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');
  updateBodyScrollLock();

  // Position track directly at selected slide
  requestAnimationFrame(() => {
    const slide = track.children[index];
    if (slide) {
      track.scrollTo({ left: slide.offsetLeft, behavior: 'instant' });
    }
  });
}

// Modal Scroll Lock Management (prevents background scrolling on desktop & mobile)
function updateBodyScrollLock() {
  requestAnimationFrame(() => {
    const hasOpenModal = Boolean(
      document.querySelector('.modal-backdrop.open, .lightbox.open')
    );
    document.body.classList.toggle('modal-open', hasOpenModal);
  });
}

// Touch and wheel guards to prevent background drag/scroll bleed-through
document.addEventListener('touchmove', (e) => {
  if (!document.body.classList.contains('modal-open')) return;
  const isScrollable = e.target.closest('.modal-card, .lightbox-track, .lightbox-meta, textarea, input, select');
  if (!isScrollable && e.cancelable) {
    e.preventDefault();
  }
}, { passive: false });

document.addEventListener('wheel', (e) => {
  if (!document.body.classList.contains('modal-open')) return;
  const isScrollable = e.target.closest('.modal-card, .lightbox-track, .lightbox-meta');
  if (!isScrollable && e.cancelable) {
    e.preventDefault();
  }
}, { passive: false });

function closeLightbox() {
  const modal = document.getElementById('lightboxModal');
  if (modal) {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    updateBodyScrollLock();
  }
}

// In-app Custom Confirmation Dialog (Replaces window.alert / confirm)
function showConfirmModal({
  title = 'Tem certeza?',
  message = 'Esta ação não poderá ser desfeita.',
  confirmText = 'Excluir',
  cancelText = 'Cancelar',
  isDanger = true,
  icon = 'trash'
} = {}) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirmModal');
    const titleEl = document.getElementById('confirmTitle');
    const messageEl = document.getElementById('confirmMessage');
    const actionBtn = document.getElementById('confirmActionBtn');
    const cancelBtn = document.getElementById('confirmCancelBtn');
    const iconWrap = document.getElementById('confirmIconWrap');

    if (!modal) {
      resolve(false);
      return;
    }

    if (titleEl) titleEl.textContent = title;
    if (messageEl) messageEl.textContent = message;

    if (actionBtn) {
      actionBtn.textContent = confirmText;
      actionBtn.className = isDanger ? 'btn-confirm-action' : 'btn-confirm-action primary';
    }

    if (cancelBtn) {
      cancelBtn.textContent = cancelText;
    }

    if (iconWrap) {
      iconWrap.className = isDanger ? 'confirm-icon-wrap' : 'confirm-icon-wrap info';
      if (icon === 'trash') {
        iconWrap.innerHTML = `
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        `;
      } else {
        iconWrap.innerHTML = `
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
        `;
      }
    }

    const cleanup = (result) => {
      modal.classList.remove('open');
      modal.setAttribute('aria-hidden', 'true');
      updateBodyScrollLock();
      actionBtn?.removeEventListener('click', onConfirm);
      cancelBtn?.removeEventListener('click', onCancel);
      modal.removeEventListener('click', onBackdrop);
      window.removeEventListener('keydown', onKey);
      resolve(result);
    };

    const onConfirm = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onBackdrop = (e) => {
      if (e.target === modal) cleanup(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') cleanup(false);
    };

    actionBtn?.addEventListener('click', onConfirm);
    cancelBtn?.addEventListener('click', onCancel);
    modal.addEventListener('click', onBackdrop);
    window.addEventListener('keydown', onKey);

    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    updateBodyScrollLock();
  });
}

// Add Memory Modal handling
function openAddModal() {
  const modal = document.getElementById('addMemoryModal');
  const dateInput = document.getElementById('inputDate');

  if (modal) {
    if (dateInput && !dateInput.value) {
      dateInput.value = new Date().toISOString().split('T')[0];
    }
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    updateBodyScrollLock();
  }
}

function closeAddModal() {
  const modal = document.getElementById('addMemoryModal');
  const form = document.getElementById('memoryForm');
  if (modal) {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    updateBodyScrollLock();
  }
  if (form) form.reset();
  currentPhotoDataUrl = '';
  const preview = document.getElementById('formPhotoPreview');
  const previewWrap = document.getElementById('photoPreviewWrap');
  const instructions = document.getElementById('photoUploadInstructions');
  const fileInput = document.getElementById('photoFileInput');

  if (preview) preview.src = '';
  if (previewWrap) previewWrap.style.display = 'none';
  if (instructions) instructions.style.display = 'flex';
  if (fileInput) fileInput.value = '';

  const storyCharCount = document.getElementById('storyCharCount');
  if (storyCharCount) storyCharCount.textContent = '0 / 5000';

  // Reset category pills to Dia a Dia
  document.querySelectorAll('#formCategoryChips .form-cat-pill').forEach(pill => {
    pill.classList.toggle('active', pill.getAttribute('data-category') === 'Dia a Dia');
  });
  const catSelect = document.getElementById('inputCategory');
  if (catSelect) catSelect.value = 'Dia a Dia';
}

// Profile Modal handling
function openProfileModal() {
  const modal = document.getElementById('editProfileModal');
  const nameInput = document.getElementById('inputPetName');
  const yearsInput = document.getElementById('inputPetYears');
  const subtitleInput = document.getElementById('inputPetSubtitle');
  const epitaphInput = document.getElementById('inputPetEpitaph');
  const preview = document.getElementById('profileFormPhotoPreview');
  const previewWrap = document.getElementById('profilePhotoPreviewWrap');
  const instructions = document.getElementById('profilePhotoUploadInstructions');
  const epitaphCharCount = document.getElementById('epitaphCharCount');

  if (capsuleProfile) {
    if (nameInput) nameInput.value = capsuleProfile.name || '';
    if (yearsInput) yearsInput.value = capsuleProfile.years || '';
    if (subtitleInput) subtitleInput.value = capsuleProfile.subtitle || '';
    if (epitaphInput) epitaphInput.value = capsuleProfile.epitaph || '';
    currentProfilePhotoDataUrl = capsuleProfile.photo || '';
    if (preview && previewWrap && instructions) {
      if (currentProfilePhotoDataUrl) {
        preview.src = currentProfilePhotoDataUrl;
        previewWrap.style.display = 'flex';
        instructions.style.display = 'none';
      } else {
        preview.src = '';
        previewWrap.style.display = 'none';
        instructions.style.display = 'flex';
      }
    }
  } else {
    currentProfilePhotoDataUrl = '';
    if (preview) preview.src = '';
    if (previewWrap) previewWrap.style.display = 'none';
    if (instructions) instructions.style.display = 'flex';
  }

  if (epitaphCharCount) {
    const len = epitaphInput && epitaphInput.value ? epitaphInput.value.length : 0;
    epitaphCharCount.textContent = `${len} / 500`;
  }

  if (modal) {
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    updateBodyScrollLock();
  }
}

function closeProfileModal() {
  const modal = document.getElementById('editProfileModal');
  const fileInput = document.getElementById('profilePhotoFileInput');
  if (fileInput) fileInput.value = '';
  if (modal) {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    updateBodyScrollLock();
  }
}

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  // Never show browser native alert dialogs
  window.alert = (msg) => {
    if (msg) showToast(String(msg));
  };

  // Universal observer to keep body scroll lock strictly in sync with any modal state
  const modalObserver = new MutationObserver(() => {
    updateBodyScrollLock();
  });
  document.querySelectorAll('.modal-backdrop, .lightbox').forEach(el => {
    modalObserver.observe(el, { attributes: true, attributeFilter: ['class', 'style'] });
  });

  renderCapsuleProfile();
  renderAll();

  try {
    await ensureAuthenticated();

    // Subscribe to capsule profile
    subscribeToCapsuleProfile(
      (profileData) => {
        capsuleProfile = profileData;
        isLoadingProfile = false;
        renderCapsuleProfile();
      },
      (err) => {
        console.error('Erro ao carregar perfil:', err);
        isLoadingProfile = false;
        renderCapsuleProfile();
      }
    );

    // Subscribe to memories collection
    subscribeToMemories(
      (items) => {
        memories = items;
        isLoadingMemories = false;
        renderAll();
      },
      (err) => {
        isLoadingMemories = false;
        renderAll();
        showToast('Erro ao carregar lembranças.');
        console.error(err);
      }
    );
  } catch (err) {
    isLoadingProfile = false;
    isLoadingMemories = false;
    renderCapsuleProfile();
    renderAll();
    showToast('Não foi possível conectar. Tente novamente mais tarde.');
    console.error('Erro de conexão:', err);
  }

  // Tab switching
  const tabButtons = document.querySelectorAll('.tab-item');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const targetTab = btn.getAttribute('data-tab');
      document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.remove('active');
      });

      const paneId = `pane${targetTab.charAt(0).toUpperCase() + targetTab.slice(1)}`;
      const activePane = document.getElementById(paneId);
      if (activePane) activePane.classList.add('active');
    });
  });

  // Sync Category Filter Pills (Desktop and Mobile)
  function setActiveCategory(cat) {
    currentCategory = cat;

    document.querySelectorAll('.cat-pill').forEach(pill => {
      pill.classList.toggle('active', pill.getAttribute('data-category') === cat);
    });

    document.querySelectorAll('.mobile-cat-pill').forEach(pill => {
      pill.classList.toggle('active', pill.getAttribute('data-category') === cat);
    });

    renderFeed();
  }

  document.querySelectorAll('.cat-pill').forEach(chip => {
    chip.addEventListener('click', () => {
      setActiveCategory(chip.getAttribute('data-category'));
    });
  });

  document.querySelectorAll('.mobile-cat-pill').forEach(chip => {
    chip.addEventListener('click', () => {
      setActiveCategory(chip.getAttribute('data-category'));
    });
  });

  // Search Inputs (Desktop and Mobile synchronized)
  const searchInput = document.getElementById('searchInput');
  const clearSearchBtn = document.getElementById('clearSearchBtn');
  const mobileSearchInput = document.getElementById('mobileSearchInput');
  const clearMobileSearchBtn = document.getElementById('clearMobileSearchBtn');

  function handleSearch(val) {
    searchQuery = val;
    if (searchInput && searchInput.value !== val) searchInput.value = val;
    if (mobileSearchInput && mobileSearchInput.value !== val) mobileSearchInput.value = val;

    if (clearSearchBtn) clearSearchBtn.style.display = val ? 'flex' : 'none';
    if (clearMobileSearchBtn) clearMobileSearchBtn.style.display = val ? 'flex' : 'none';

    renderFeed();
  }

  if (searchInput) searchInput.addEventListener('input', (e) => handleSearch(e.target.value));
  if (mobileSearchInput) mobileSearchInput.addEventListener('input', (e) => handleSearch(e.target.value));
  if (clearSearchBtn) clearSearchBtn.addEventListener('click', () => handleSearch(''));
  if (clearMobileSearchBtn) clearMobileSearchBtn.addEventListener('click', () => handleSearch(''));

  // Delegated events for feed (Favorites & Deletion & Zoom)
  const feed = document.getElementById('memoriesFeed');
  if (feed) {
    feed.addEventListener('click', async (e) => {
      // Favorite Button
      const favBtn = e.target.closest('.btn-fav');
      if (favBtn) {
        const id = favBtn.getAttribute('data-id');
        const mem = memories.find(m => m.id === id);
        if (mem) {
          const nextState = !mem.isFavorite;
          try {
            await toggleMemoryFavorite(id, nextState);
            showToast(nextState ? 'Salva nos favoritos ❤️' : 'Removida dos favoritos');
          } catch (err) {
            console.error('Erro ao atualizar favorito:', err);
            showToast('Erro ao atualizar favorito.');
          }
        }
        return;
      }

      // Delete Button
      const delBtn = e.target.closest('.btn-remove-mem');
      if (delBtn) {
        const id = delBtn.getAttribute('data-id');
        const confirmed = await showConfirmModal({
          title: 'Excluir Memória?',
          message: 'Esta lembrança será removida permanentemente da cápsula.',
          confirmText: 'Excluir',
          cancelText: 'Cancelar',
          isDanger: true,
          icon: 'trash'
        });

        if (confirmed) {
          try {
            await deleteMemoryById(id);
            showToast('Memória removida.');
          } catch (err) {
            console.error('Erro ao excluir memória:', err);
            showToast('Não foi possível remover a memória.');
          }
        }
        return;
      }

      // Zoom photo
      const zoomContainer = e.target.closest('[data-action="zoom"]');
      if (zoomContainer) {
        const id = zoomContainer.getAttribute('data-id');
        if (!galleryPhotosList || galleryPhotosList.length === 0) {
          galleryPhotosList = memories.filter(m => !!m.photo);
        }
        const idx = galleryPhotosList.findIndex(m => m.id === id);
        if (idx !== -1) {
          openLightboxByIndex(idx);
        }
        return;
      }
    });
  }

  // Gallery click zoom
  const gallery = document.getElementById('galleryGrid');
  if (gallery) {
    gallery.addEventListener('click', (e) => {
      const card = e.target.closest('.gallery-card');
      if (card) {
        const idx = parseInt(card.getAttribute('data-index'), 10);
        if (!isNaN(idx)) openLightboxByIndex(idx);
      }
    });
  }

  // Lightbox Carousel Interaction (Touch Swipe & Mouse Drag)
  const closeLightBtn = document.getElementById('lightboxCloseBtn');
  const lightModal = document.getElementById('lightboxModal');
  const lightboxTrack = document.getElementById('lightboxTrack');
  const dotsContainer = document.getElementById('carouselDots');

  if (closeLightBtn) closeLightBtn.addEventListener('click', closeLightbox);

  if (lightModal) {
    lightModal.addEventListener('click', (e) => {
      if (e.target === lightModal) closeLightbox();
    });
  }

  if (lightboxTrack) {
    let scrollTimeout;
    lightboxTrack.addEventListener('scroll', () => {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(() => {
        const slideWidth = lightboxTrack.clientWidth;
        if (!slideWidth) return;
        const newIndex = Math.round(lightboxTrack.scrollLeft / slideWidth);
        if (newIndex >= 0 && newIndex < galleryPhotosList.length && newIndex !== currentLightboxIndex) {
          currentLightboxIndex = newIndex;
          updateLightboxMeta(newIndex);
        }
      }, 50);
    }, { passive: true });

    // Desktop mouse drag to swipe
    let isMouseDown = false;
    let startX = 0;
    let initialScroll = 0;

    lightboxTrack.addEventListener('mousedown', (e) => {
      isMouseDown = true;
      startX = e.pageX;
      initialScroll = lightboxTrack.scrollLeft;
      lightboxTrack.classList.add('is-dragging');
    });

    window.addEventListener('mousemove', (e) => {
      if (!isMouseDown) return;
      e.preventDefault();
      const deltaX = e.pageX - startX;
      lightboxTrack.scrollLeft = initialScroll - deltaX;
    });

    window.addEventListener('mouseup', () => {
      if (!isMouseDown) return;
      isMouseDown = false;
      lightboxTrack.classList.remove('is-dragging');
      const slideWidth = lightboxTrack.clientWidth;
      if (slideWidth) {
        const targetIndex = Math.round(lightboxTrack.scrollLeft / slideWidth);
        scrollToSlide(targetIndex, 'smooth');
      }
    });
  }

  // Dots navigation
  if (dotsContainer) {
    dotsContainer.addEventListener('click', (e) => {
      const dot = e.target.closest('.carousel-dot');
      if (dot) {
        const idx = parseInt(dot.getAttribute('data-index'), 10);
        if (!isNaN(idx)) scrollToSlide(idx, 'smooth');
      }
    });
  }

  // Keyboard navigation
  document.addEventListener('keydown', (e) => {
    if (lightModal && lightModal.classList.contains('open')) {
      if (e.key === 'ArrowLeft') scrollToSlide(currentLightboxIndex - 1, 'smooth');
      if (e.key === 'ArrowRight') scrollToSlide(currentLightboxIndex + 1, 'smooth');
      if (e.key === 'Escape') closeLightbox();
    } else if (e.key === 'Escape') {
      closeAddModal();
      closeProfileModal();
    }
  });

  // Add Memory Modal open/close triggers
  const btnSidebar = document.getElementById('btnOpenModalSidebar');
  const btnFab = document.getElementById('btnFabCreate');
  const btnEmpty = document.getElementById('btnEmptyCreate');

  if (btnSidebar) btnSidebar.addEventListener('click', openAddModal);
  if (btnFab) btnFab.addEventListener('click', openAddModal);
  if (btnEmpty) btnEmpty.addEventListener('click', openAddModal);

  // Suggestion chips in empty state
  document.querySelectorAll('.sugg-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const prompt = chip.getAttribute('data-prompt') || chip.textContent.trim();
      openAddModal();
      const inputTitle = document.getElementById('inputTitle');
      if (inputTitle) {
        inputTitle.value = prompt;
        inputTitle.focus();
      }
    });
  });

  const closeModalBtn = document.getElementById('closeModalBtn');
  const cancelFormBtn = document.getElementById('cancelFormBtn');
  const modalBackdrop = document.getElementById('addMemoryModal');

  if (closeModalBtn) closeModalBtn.addEventListener('click', closeAddModal);
  if (cancelFormBtn) cancelFormBtn.addEventListener('click', closeAddModal);
  if (modalBackdrop) {
    modalBackdrop.addEventListener('click', (e) => {
      if (e.target === modalBackdrop) closeAddModal();
    });
  }

  // Profile Modal open/close triggers
  const btnEditProfile = document.getElementById('btnEditProfile');
  const profilePhotoWrap = document.getElementById('profilePhotoWrap');
  const closeProfileModalBtn = document.getElementById('closeProfileModalBtn');
  const cancelProfileFormBtn = document.getElementById('cancelProfileFormBtn');
  const profileModalBackdrop = document.getElementById('editProfileModal');

  if (btnEditProfile) btnEditProfile.addEventListener('click', openProfileModal);
  if (profilePhotoWrap) profilePhotoWrap.addEventListener('click', openProfileModal);
  if (closeProfileModalBtn) closeProfileModalBtn.addEventListener('click', closeProfileModal);
  if (cancelProfileFormBtn) cancelProfileFormBtn.addEventListener('click', closeProfileModal);
  if (profileModalBackdrop) {
    profileModalBackdrop.addEventListener('click', (e) => {
      if (e.target === profileModalBackdrop) closeProfileModal();
    });
  }

  // Photo upload input for Add Memory (Single click dropzone triggering native OS chooser)
  const photoUploadArea = document.getElementById('photoUploadArea');
  const photoFileInput = document.getElementById('photoFileInput');
  const formPreviewImg = document.getElementById('formPhotoPreview');
  const photoPreviewWrap = document.getElementById('photoPreviewWrap');
  const photoInstructions = document.getElementById('photoUploadInstructions');
  const btnChangePhoto = document.getElementById('btnChangePhoto');
  const btnRemovePhoto = document.getElementById('btnRemovePhoto');

  if (photoUploadArea && photoFileInput) {
    const triggerPhotoPick = () => {
      photoFileInput.click();
    };

    photoUploadArea.addEventListener('click', (e) => {
      if (e.target.closest('#btnRemovePhoto, #btnChangePhoto')) return;
      triggerPhotoPick();
    });

    photoUploadArea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (e.target.closest('#btnRemovePhoto, #btnChangePhoto')) return;
        e.preventDefault();
        triggerPhotoPick();
      }
    });

    if (btnChangePhoto) {
      btnChangePhoto.addEventListener('click', (e) => {
        e.stopPropagation();
        triggerPhotoPick();
      });
    }

    if (btnRemovePhoto) {
      btnRemovePhoto.addEventListener('click', (e) => {
        e.stopPropagation();
        currentPhotoDataUrl = '';
        photoFileInput.value = '';
        if (formPreviewImg) formPreviewImg.src = '';
        if (photoPreviewWrap) photoPreviewWrap.style.display = 'none';
        if (photoInstructions) photoInstructions.style.display = 'flex';
      });
    }

    photoFileInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      // Ensure selected file is an image
      if (!file.type.startsWith('image/')) {
        showToast('Por favor, selecione uma imagem válida (JPG, PNG ou WebP).');
        photoFileInput.value = '';
        return;
      }

      try {
        currentPhotoDataUrl = await compressImageToDataUrl(file, 1080, 0.8);
        if (formPreviewImg) {
          formPreviewImg.src = currentPhotoDataUrl;
          if (photoPreviewWrap) photoPreviewWrap.style.display = 'flex';
          if (photoInstructions) photoInstructions.style.display = 'none';
        }
      } catch (err) {
        console.error('Erro ao processar imagem:', err);
        showToast('Não foi possível carregar a imagem selecionada.');
      }
    });
  }

  // Photo upload input for Profile (Single click dropzone triggering native OS chooser)
  const profilePhotoUploadArea = document.getElementById('profilePhotoUploadArea');
  const profilePhotoFileInput = document.getElementById('profilePhotoFileInput');
  const profileFormPhotoPreview = document.getElementById('profileFormPhotoPreview');
  const profilePhotoPreviewWrap = document.getElementById('profilePhotoPreviewWrap');
  const profilePhotoInstructions = document.getElementById('profilePhotoUploadInstructions');
  const btnChangeProfilePhoto = document.getElementById('btnChangeProfilePhoto');
  const btnRemoveProfilePhoto = document.getElementById('btnRemoveProfilePhoto');

  if (profilePhotoUploadArea && profilePhotoFileInput) {
    const triggerProfilePhotoPick = () => {
      profilePhotoFileInput.click();
    };

    profilePhotoUploadArea.addEventListener('click', (e) => {
      if (e.target.closest('#btnRemoveProfilePhoto, #btnChangeProfilePhoto')) return;
      triggerProfilePhotoPick();
    });

    profilePhotoUploadArea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        if (e.target.closest('#btnRemoveProfilePhoto, #btnChangeProfilePhoto')) return;
        e.preventDefault();
        triggerProfilePhotoPick();
      }
    });

    if (btnChangeProfilePhoto) {
      btnChangeProfilePhoto.addEventListener('click', (e) => {
        e.stopPropagation();
        triggerProfilePhotoPick();
      });
    }

    if (btnRemoveProfilePhoto) {
      btnRemoveProfilePhoto.addEventListener('click', (e) => {
        e.stopPropagation();
        currentProfilePhotoDataUrl = '';
        profilePhotoFileInput.value = '';
        if (profileFormPhotoPreview) profileFormPhotoPreview.src = '';
        if (profilePhotoPreviewWrap) profilePhotoPreviewWrap.style.display = 'none';
        if (profilePhotoInstructions) profilePhotoInstructions.style.display = 'flex';
      });
    }

    profilePhotoFileInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      // Ensure selected file is an image
      if (!file.type.startsWith('image/')) {
        showToast('Por favor, selecione uma imagem válida (JPG, PNG ou WebP).');
        profilePhotoFileInput.value = '';
        return;
      }

      try {
        currentProfilePhotoDataUrl = await compressImageToDataUrl(file, 720, 0.82);
        if (profileFormPhotoPreview) {
          profileFormPhotoPreview.src = currentProfilePhotoDataUrl;
          if (profilePhotoPreviewWrap) profilePhotoPreviewWrap.style.display = 'flex';
          if (profilePhotoInstructions) profilePhotoInstructions.style.display = 'none';
        }
      } catch (err) {
        console.error('Erro ao processar foto de perfil:', err);
        showToast('Não foi possível carregar a foto de perfil.');
      }
    });
  }

  // Real-time character counters
  const storyInput = document.getElementById('inputStory');
  const storyCharCount = document.getElementById('storyCharCount');
  if (storyInput && storyCharCount) {
    storyInput.addEventListener('input', () => {
      storyCharCount.textContent = `${storyInput.value.length} / 5000`;
    });
  }

  const epitaphInput = document.getElementById('inputPetEpitaph');
  const epitaphCharCount = document.getElementById('epitaphCharCount');
  if (epitaphInput && epitaphCharCount) {
    epitaphInput.addEventListener('input', () => {
      epitaphCharCount.textContent = `${epitaphInput.value.length} / 500`;
    });
  }

  // Category Quick-Pills selection
  const categoryHiddenInput = document.getElementById('inputCategory');
  const formCatPills = document.querySelectorAll('#formCategoryChips .form-cat-pill');
  if (categoryHiddenInput && formCatPills.length > 0) {
    formCatPills.forEach(pill => {
      pill.addEventListener('click', () => {
        const cat = pill.getAttribute('data-category');
        categoryHiddenInput.value = cat;
        formCatPills.forEach(p => p.classList.toggle('active', p === pill));
      });
    });
  }

  // Memory Form Submit -> Cloud Firestore
  const form = document.getElementById('memoryForm');
  const submitBtn = document.getElementById('btnSubmitMemory');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const titleInput = document.getElementById('inputTitle');
      const dateInput = document.getElementById('inputDate');
      const categoryInput = document.getElementById('inputCategory');
      const storyInput = document.getElementById('inputStory');
      const favoriteInput = document.getElementById('inputFavorite');
      const btnSpinner = submitBtn ? submitBtn.querySelector('.btn-spinner') : null;
      const btnLabel = submitBtn ? submitBtn.querySelector('.btn-label-text') : null;

      if (submitBtn) {
        submitBtn.disabled = true;
        if (btnSpinner) btnSpinner.style.display = 'inline-block';
        if (btnLabel) btnLabel.textContent = 'Eternizando...';
      }

      try {
        await createMemory({
          title: titleInput ? titleInput.value.trim() : '',
          date: dateInput ? dateInput.value : '',
          category: categoryInput ? categoryInput.value : 'Dia a Dia',
          story: storyInput ? storyInput.value.trim() : '',
          photo: currentPhotoDataUrl || null,
          isFavorite: favoriteInput ? favoriteInput.checked : false
        });

        closeAddModal();
        showToast('Memória guardada na cápsula com sucesso! 🐾');
      } catch (err) {
        console.error('Erro ao salvar memória:', err);
        showToast('Erro ao salvar memória. Verifique sua conexão.');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          if (btnSpinner) btnSpinner.style.display = 'none';
          if (btnLabel) btnLabel.textContent = 'Eternizar na Cápsula';
        }
      }
    });
  }

  // Profile Form Submit
  const profileForm = document.getElementById('profileForm');
  const submitProfileBtn = document.getElementById('btnSubmitProfile');
  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const nameInput = document.getElementById('inputPetName');
      const yearsInput = document.getElementById('inputPetYears');
      const subtitleInput = document.getElementById('inputPetSubtitle');
      const epitaphInput = document.getElementById('inputPetEpitaph');
      const btnSpinner = submitProfileBtn ? submitProfileBtn.querySelector('.btn-spinner') : null;
      const btnLabel = submitProfileBtn ? submitProfileBtn.querySelector('.btn-label-text') : null;

      if (submitProfileBtn) {
        submitProfileBtn.disabled = true;
        if (btnSpinner) btnSpinner.style.display = 'inline-block';
        if (btnLabel) btnLabel.textContent = 'Salvando perfil...';
      }

      try {
        await saveCapsuleProfile({
          name: nameInput ? nameInput.value.trim() : '',
          years: yearsInput ? yearsInput.value.trim() : '',
          subtitle: subtitleInput ? subtitleInput.value.trim() : '',
          epitaph: epitaphInput ? epitaphInput.value.trim() : '',
          photo: currentProfilePhotoDataUrl || ''
        });
        closeProfileModal();
        showToast('Perfil da cápsula atualizado com sucesso! 🐾');
      } catch (err) {
        console.error('Erro ao salvar perfil:', err);
        showToast('Erro ao salvar perfil. Tente novamente.');
      } finally {
        if (submitProfileBtn) {
          submitProfileBtn.disabled = false;
          if (btnSpinner) btnSpinner.style.display = 'none';
          if (btnLabel) btnLabel.textContent = 'Salvar Perfil';
        }
      }
    });
  }
});
