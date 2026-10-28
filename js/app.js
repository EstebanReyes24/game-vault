/**
 * Controlador Principal - Game Vault Console Edition
 * Soporte para Perfiles Aislados, Modo Espectador Read-Only y Sincronización Steam
 */
let currentSelectedCover = "";
let activeStatus = "completed";
let activePlatforms = ["PC"];
let isFavorite = false;
let editingGameId = null;
let currentFilter = "all";
let currentPlatformFilter = "all";
let activeModalGameId = null;
let currentViewMode = "grid";
let isAudioEnabled = localStorage.getItem("gv_sound") !== "false";

let nowPlayingInterval = null;
let currentPlayingIndex = 0;

// Detección estricta de Modo Espectador (?u=gamertag)
const urlParams = new URLSearchParams(window.location.search);
// Perfil público: /u/nombre (enlace bonito) o app.html?u=nombre (enlaces antiguos)
const rutaPerfil = window.location.pathname.match(/^\/u\/([A-Za-z0-9_]{3,20})\/?$/);
const publicProfileTarget = rutaPerfil ? rutaPerfil[1] : urlParams.get("u");
const isSpectatorMode = Boolean(publicProfileTarget && publicProfileTarget.trim().length > 0);
let spectatorGames = [];

const COMPLETED_STATUSES = ["completed", "extras", "platinum"];
const VALID_STATUSES = ["playing", "completed", "extras", "platinum", "onhold", "backlog"];

// ==========================================
// SANITIZACIÓN Y SALIDA SEGURA
// Regla: todo dato que va dentro de innerHTML pasa por escapeHTML,
// y toda URL de imagen pasa por safeUrl. Los datos de otros usuarios
// (modo espectador) pueden venir manipulados.
// ==========================================
function sanitizeInput(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/<[^>]*>?/gm, '')
    .replace(/[<>]/g, '')
    .trim();
}

function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Devuelve la URL solo si es https:// (o una imagen data: generada aquí); si no, "". */
function safeUrl(url) {
  if (typeof url !== "string") return "";
  const value = url.trim();
  if (value.startsWith("data:image/png;base64,")) return value;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.href : "";
  } catch (e) {
    return "";
  }
}

// Las portadas automáticas se generan al mostrarlas (y se cachean en memoria);
// ya no se guardan como base64 en localStorage ni en Supabase.
const posterCache = new Map();
function posterFor(title) {
  const key = String(title || "?");
  if (!posterCache.has(key)) posterCache.set(key, CanvasPoster.generateSmartPoster(key));
  return posterCache.get(key);
}

function coverSrc(game) {
  return safeUrl(game.coverUrl) || posterFor(game.title);
}

/** <img> con portada segura y respaldo automático si la imagen falla. */
function coverImg(game, className, extraAttrs = "") {
  return `<img src="${escapeHTML(coverSrc(game))}" data-fallback-title="${escapeHTML(game.title)}" alt="${escapeHTML(game.title)}" class="${className}" loading="lazy" ${extraAttrs}>`;
}

// Un solo manejador para todas las portadas rotas (sin onerror inline).
document.addEventListener("error", (e) => {
  const img = e.target;
  if (img && img.tagName === "IMG" && img.dataset.fallbackTitle !== undefined && !img.dataset.fallbackApplied) {
    img.dataset.fallbackApplied = "1";
    img.src = posterFor(img.dataset.fallbackTitle);
  }
}, true);

function hasRating(game) {
  return game && game.rating !== null && game.rating !== undefined && Number.isFinite(Number(game.rating));
}

function fmtRating(game) {
  return hasRating(game) ? Number(game.rating).toFixed(1) : "—";
}

function ratedGames(list) {
  return list.filter(hasRating);
}

/**
 * Normaliza un juego venido de localStorage, la nube o una copia JSON.
 * No borra texto (la protección XSS está en escapeHTML al mostrar), solo
 * corrige tipos, límites y valores imposibles. Devuelve null si no es un objeto.
 */
function normalizeGame(raw) {
  if (!raw || typeof raw !== "object") return null;
  const title = String(raw.title ?? "").trim().slice(0, 150) || "Sin título";
  const id = Number(raw.id);
  const status = VALID_STATUSES.includes(raw.status) ? raw.status : "backlog";
  const rating = raw.rating === null || raw.rating === undefined || raw.rating === "" ? null : Number(raw.rating);
  const cover = safeUrl(raw.coverUrl);
  const platforms = Array.isArray(raw.platforms)
    ? raw.platforms.map(p => String(p).trim().slice(0, 30)).filter(Boolean)
    : [];
  return {
    id: Number.isSafeInteger(id) && id > 0 ? id : newGameId(),
    title,
    coverUrl: cover.startsWith("https://") ? cover : "",
    status,
    platforms: platforms.length ? platforms : ["PC"],
    rating: Number.isFinite(rating) ? Math.min(10, Math.max(0, rating)) : null,
    hours: Math.max(0, parseInt(raw.hours, 10) || 0),
    targetHours: Math.max(0, parseInt(raw.targetHours, 10) || 0),
    completedYear: COMPLETED_STATUSES.includes(status) ? (parseInt(raw.completedYear, 10) || null) : null,
    favorite: Boolean(raw.favorite),
    tags: Array.isArray(raw.tags) ? raw.tags.map(t => String(t).trim().slice(0, 40)).filter(Boolean).slice(0, 15) : [],
    notes: String(raw.notes ?? "").slice(0, 2000)
  };
}

let lastGeneratedId = 0;
function newGameId() {
  lastGeneratedId = Math.max(Date.now(), lastGeneratedId + 1);
  return lastGeneratedId;
}

// ==========================================
// AVISOS (toast) y nube
// ==========================================
function showToast(message, isError = false) {
  let box = document.getElementById("gvToast");
  if (!box) {
    box = document.createElement("div");
    box.id = "gvToast";
    box.setAttribute("role", "status");
    box.className = "fixed bottom-5 left-1/2 -translate-x-1/2 z-[100] px-4 py-2.5 rounded-xl text-xs font-bold shadow-2xl transition-opacity duration-300";
    document.body.appendChild(box);
  }
  box.textContent = message;
  box.style.background = isError ? "#7f1d1d" : "#064e3b";
  box.style.color = "#fff";
  box.style.opacity = "1";
  clearTimeout(box._timer);
  box._timer = setTimeout(() => { box.style.opacity = "0"; }, isError ? 6000 : 2500);
}

let cloudUserId = null; // id del usuario con sesión activa (null = invitado)

async function cloudRun(action, errorMessage) {
  if (!cloudUserId || !window.DB) return true;
  try {
    await action();
    return true;
  } catch (err) {
    console.error(errorMessage, err);
    showToast(`${errorMessage} Tus cambios quedaron guardados en este navegador.`, true);
    return false;
  }
}

// ==========================================
// MÓDULO DE AUDIO SINTÉTICO (Web Audio API)
// ==========================================
const SoundFX = {
  ctx: null,
  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
  },
  playClick() {
    if (!isAudioEnabled) return;
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(440, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, this.ctx.currentTime + 0.05);
    gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.05);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.05);
  },
  playWhoosh() {
    if (!isAudioEnabled) return;
    this.init();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(180, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, this.ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.06, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
  },
  playTrophy() {
    if (!isAudioEnabled) return;
    this.init();
    if (!this.ctx) return;
    [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime + (i * 0.08));
      gain.gain.setValueAtTime(0.09, this.ctx.currentTime + (i * 0.08));
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + (i * 0.08) + 0.25);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(this.ctx.currentTime + (i * 0.08));
      osc.stop(this.ctx.currentTime + (i * 0.08) + 0.25);
    });
  }
};

// Referencias del DOM
const gameSearch = document.getElementById("gameSearch");
const searchBtn = document.getElementById("searchBtn");
const searchBtnText = document.getElementById("searchBtnText");
const searchIcon = document.getElementById("searchIcon");
const searchResults = document.getElementById("searchResults");
const coverPreview = document.getElementById("coverPreview");
const posterIcon = document.getElementById("posterIcon");
const coverStatusText = document.getElementById("coverStatusText");
const manualCoverBtn = document.getElementById("manualCoverBtn");
const scoreRange = document.getElementById("scoreRange");
const scoreDisplay = document.getElementById("scoreDisplay");
const gameHours = document.getElementById("gameHours");
const gameTargetHours = document.getElementById("gameTargetHours");
const gameCompletedYear = document.getElementById("gameCompletedYear");
const gameTags = document.getElementById("gameTags");
const gameNotes = document.getElementById("gameNotes");
const favoriteToggleBtn = document.getElementById("favoriteToggleBtn");
const favText = document.getElementById("favText");
const saveGameBtn = document.getElementById("saveGameBtn");
const saveBtnText = document.getElementById("saveBtnText");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const formTitle = document.getElementById("formTitle");
const formSubtitle = document.getElementById("formSubtitle");
const formIconBox = document.getElementById("formIconBox");
const formIcon = document.getElementById("formIcon");
const gamesGrid = document.getElementById("gamesGrid");
const filterInput = document.getElementById("filterInput");
const sortBySelect = document.getElementById("sortBySelect");
const filterStatusSelect = document.getElementById("filterStatusSelect");
const filterPlatformSelect = document.getElementById("filterPlatformSelect");
const viewGridBtn = document.getElementById("viewGridBtn");
const viewListBtn = document.getElementById("viewListBtn");

const shareProfileBtn = document.getElementById("shareProfileBtn");
const spectatorBanner = document.getElementById("spectatorBanner");
const spectatorTargetUser = document.getElementById("spectatorTargetUser");
const ownerFooterControls = document.getElementById("ownerFooterControls");

const soundToggleBtn = document.getElementById("soundToggleBtn");
const soundIcon = document.getElementById("soundIcon");

function updateSoundUI() {
  if (soundIcon) {
    soundIcon.className = isAudioEnabled ? "fa-solid fa-volume-high text-indigo-400" : "fa-solid fa-volume-xmark text-slate-500";
  }
}
updateSoundUI();

if (soundToggleBtn) {
  soundToggleBtn.addEventListener("click", () => {
    isAudioEnabled = !isAudioEnabled;
    localStorage.setItem("gv_sound", isAudioEnabled);
    updateSoundUI();
    if (isAudioEnabled) SoundFX.playClick();
  });
}

const openCommandBtn = document.getElementById("openCommandBtn");
const commandPaletteModal = document.getElementById("commandPaletteModal");
const commandInput = document.getElementById("commandInput");
const commandResults = document.getElementById("commandResults");

const formSection = document.getElementById("formSection");
const toggleFormBtn = document.getElementById("toggleFormBtn");

const nowPlayingSection = document.getElementById("nowPlayingSection");
const npCover = document.getElementById("npCover");
const npPlaceholderIcon = document.getElementById("npPlaceholderIcon");
const npCoverBg = document.getElementById("npCoverBg");
const npTitle = document.getElementById("npTitle");
const npMeta = document.getElementById("npMeta");
const npActionBtn = document.getElementById("npActionBtn");
const npProgressContainer = document.getElementById("npProgressContainer");
const npProgressText = document.getElementById("npProgressText");
const npProgressBar = document.getElementById("npProgressBar");

if (shareProfileBtn) {
  shareProfileBtn.addEventListener("click", async () => {
    SoundFX.playClick();
    const profile = window.DB ? await DB.getMyProfile() : null;
    if (!profile) {
      alert("Para compartir tu estante necesitas iniciar sesión.");
      return;
    }

    if (!profile.is_public) {
      const ok = confirm("Tu estante es privado.\n\nPara compartirlo hay que hacerlo público: cualquiera con el enlace verá tus juegos, notas y horas.\n\n¿Hacerlo público?");
      if (!ok) return;
      try {
        await DB.setProfilePublic(true);
        updateVisibilityUI(true);
      } catch (err) {
        showToast("No se pudo cambiar la privacidad: " + err.message, true);
        return;
      }
    }

    const shareUrl = `${window.location.origin}/u/${encodeURIComponent(profile.username)}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      alert(`¡Enlace copiado al portapapeles!\n\n${shareUrl}\n\nCompártelo para que vean tu colección.`);
    } catch (e) {
      prompt("Copia tu enlace público:", shareUrl);
    }
  });
}

// TOGGLE FORMULARIOS FLOTANTES
function toggleForm(open = null) {
  if (isSpectatorMode || !formSection) return;
  const shouldOpen = open !== null ? open : formSection.classList.contains("hidden");
  SoundFX.playWhoosh();
  if (shouldOpen) {
    formSection.classList.remove("hidden");
  } else {
    formSection.classList.add("hidden");
    resetForm();
  }
}

if (toggleFormBtn) toggleFormBtn.addEventListener("click", () => toggleForm());

const statusBtns = document.querySelectorAll(".status-btn");
function setStatus(val) {
  activeStatus = val;
  statusBtns.forEach(btn => {
    if (btn.dataset.val === val) {
      btn.className = "status-btn p-2 rounded-xl border border-indigo-500 bg-indigo-500/20 text-white text-center font-bold text-xs shadow-lg transition cursor-pointer";
    } else {
      btn.className = "status-btn p-2 rounded-xl border border-white/10 bg-[#221d29] text-slate-400 text-center font-bold text-xs hover:border-slate-500 transition cursor-pointer";
    }
  });
}
statusBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    SoundFX.playClick();
    setStatus(btn.dataset.val);
  });
});

const platBtns = document.querySelectorAll(".plat-btn");
platBtns.forEach(btn => {
  btn.addEventListener("click", () => {
    SoundFX.playClick();
    const plat = btn.dataset.platform;
    if (activePlatforms.includes(plat)) {
      if (activePlatforms.length > 1) {
        activePlatforms = activePlatforms.filter(p => p !== plat);
        btn.className = "plat-btn px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-white/10 bg-[#221d29] text-slate-300 hover:border-slate-500 transition flex items-center gap-1.5 cursor-pointer";
      }
    } else {
      activePlatforms.push(plat);
      btn.className = "plat-btn px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-indigo-500 bg-indigo-500/20 text-white transition flex items-center gap-1.5 cursor-pointer";
    }
  });
});

function setPlatformBadges(plats) {
  activePlatforms = plats && plats.length ? plats : ["PC"];
  platBtns.forEach(btn => {
    if (activePlatforms.includes(btn.dataset.platform)) {
      btn.className = "plat-btn px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-indigo-500 bg-indigo-500/20 text-white transition flex items-center gap-1.5 cursor-pointer";
    } else {
      btn.className = "plat-btn px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-white/10 bg-[#221d29] text-slate-300 hover:border-slate-500 transition flex items-center gap-1.5 cursor-pointer";
    }
  });
}

if (favoriteToggleBtn) {
  favoriteToggleBtn.addEventListener("click", () => {
    SoundFX.playClick();
    isFavorite = !isFavorite;
    updateFavoriteUI();
  });
}

function updateFavoriteUI() {
  if (!favoriteToggleBtn || !favText) return;
  if (isFavorite) {
    favoriteToggleBtn.className = "px-2.5 py-1 rounded-lg border border-amber-500 bg-amber-500/20 text-amber-300 shadow-lg shadow-amber-500/20 transition flex items-center gap-1 text-[11px] font-bold cursor-pointer";
    favText.innerText = "Favorito";
  } else {
    favoriteToggleBtn.className = "px-2.5 py-1 rounded-lg border border-white/10 bg-[#221d29] text-slate-400 hover:text-amber-400 transition flex items-center gap-1 text-[11px] font-bold cursor-pointer";
    favText.innerText = "Favorito";
  }
}

// La nota puede quedar "sin calificar" (null), por ejemplo en juegos importados.
let isRated = true;
const clearScoreBtn = document.getElementById("clearScoreBtn");

function setScoreUI(rating) {
  isRated = rating !== null && rating !== undefined;
  if (scoreRange && isRated) scoreRange.value = rating;
  if (scoreDisplay) scoreDisplay.innerText = isRated ? Number(rating).toFixed(1) : "—";
  if (clearScoreBtn) clearScoreBtn.classList.toggle("hidden", !isRated);
}

if (scoreRange) {
  scoreRange.addEventListener("input", (e) => setScoreUI(parseFloat(e.target.value)));
}
if (clearScoreBtn) {
  clearScoreBtn.addEventListener("click", () => setScoreUI(null));
}

if (manualCoverBtn) {
  manualCoverBtn.addEventListener("click", () => {
    const url = prompt("Pega aquí el enlace directo de la imagen (debe empezar por https://):");
    if (!url) return;
    const clean = safeUrl(url);
    if (!clean.startsWith("https://")) {
      alert("El enlace debe empezar por https://");
      return;
    }
    currentSelectedCover = clean;
    coverPreview.src = currentSelectedCover;
    coverPreview.classList.remove("hidden");
    posterIcon.classList.add("hidden");
    coverStatusText.innerText = "Portada manual lista";
  });
}

function onSearchTrigger() {
  const term = sanitizeInput(gameSearch.value);
  if (term.length < 2) return;

  searchIcon.className = "fa-solid fa-spinner fa-spin";
  searchBtnText.innerText = "...";

  SearchEngine.search(term, (items) => {
    searchIcon.className = "fa-solid fa-magnifying-glass";
    searchBtnText.innerText = "Buscar";
    renderSearchResults(items, term);
  });
}

function renderSearchResults(items, originalQuery) {
  searchResults.innerHTML = "";

  const directLi = document.createElement("li");
  directLi.className = "flex items-center gap-3 p-3 bg-indigo-950/60 hover:bg-indigo-900/80 cursor-pointer transition text-indigo-300 font-semibold text-xs";
  directLi.innerHTML = `<i class="fa-solid fa-check-circle"></i> Usar "${escapeHTML(originalQuery)}" directamente`;
  directLi.addEventListener("click", () => {
    SoundFX.playClick();
    gameSearch.value = originalQuery;
    currentSelectedCover = "";
    coverPreview.src = posterFor(originalQuery);
    coverPreview.classList.remove("hidden");
    posterIcon.classList.add("hidden");
    coverStatusText.innerText = originalQuery;
    searchResults.classList.add("hidden");
  });
  searchResults.appendChild(directLi);

  items.forEach(item => {
    const li = document.createElement("li");
    li.className = "flex items-center gap-3 p-2.5 hover:bg-white/10 cursor-pointer transition";
    const image = safeUrl(item.image).startsWith("https://") ? safeUrl(item.image) : "";
    li.innerHTML = `
      ${coverImg({ title: item.title, coverUrl: image }, "w-10 h-14 object-cover rounded-lg shadow shrink-0 bg-slate-950")}
      <div class="overflow-hidden">
        <p class="text-xs font-bold text-white truncate">${escapeHTML(item.title)}</p>
        <p class="text-[11px] text-slate-400 mt-0.5 truncate">${escapeHTML(item.desc)}</p>
      </div>
    `;
    li.addEventListener("click", () => {
      SoundFX.playClick();
      gameSearch.value = item.title;
      currentSelectedCover = image;
      coverPreview.src = image || posterFor(item.title);
      coverPreview.classList.remove("hidden");
      posterIcon.classList.add("hidden");
      coverStatusText.innerText = item.title;
      searchResults.classList.add("hidden");
    });
    searchResults.appendChild(li);
  });

  searchResults.classList.remove("hidden");
}

if (searchBtn) searchBtn.addEventListener("click", onSearchTrigger);
if (gameSearch) {
  gameSearch.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onSearchTrigger();
    }
  });

  let debounceTimer;
  gameSearch.addEventListener("input", (e) => {
    clearTimeout(debounceTimer);
    const val = e.target.value.trim();
    if (val.length >= 2) {
      debounceTimer = setTimeout(onSearchTrigger, 400);
    } else {
      searchResults.classList.add("hidden");
    }
  });
}

document.addEventListener("click", (e) => {
  if (gameSearch && !gameSearch.contains(e.target) && searchResults && !searchResults.contains(e.target) && searchBtn && !searchBtn.contains(e.target)) {
    searchResults.classList.add("hidden");
  }
});

function resetForm() {
  editingGameId = null;
  formTitle.innerText = "Añadir Título";
  formSubtitle.innerText = "Registra tu juego en segundos con carátula oficial";
  formIconBox.className = "w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30 text-lg";
  formIcon.className = "fa-solid fa-plus";
  saveBtnText.innerText = "Guardar en mi estante";

  gameSearch.value = "";
  currentSelectedCover = "";
  coverPreview.classList.add("hidden");
  posterIcon.classList.remove("hidden");
  coverStatusText.innerText = "Sin carátula (automática)";
  setStatus("completed");
  setPlatformBadges(["PC"]);
  isFavorite = false;
  updateFavoriteUI();
  setScoreUI(9);
  gameHours.value = "";
  gameTargetHours.value = "";
  if (gameCompletedYear) gameCompletedYear.value = new Date().getFullYear();
  gameTags.value = "";
  gameNotes.value = "";
}

if (cancelEditBtn) cancelEditBtn.addEventListener("click", () => toggleForm(false));

function startEditGame(game) {
  if (isSpectatorMode) return;
  SoundFX.playWhoosh();
  editingGameId = game.id;
  formTitle.innerText = `Editando: ${game.title}`;
  formSubtitle.innerText = "Modifica los datos y pulsa Actualizar registro";
  formIconBox.className = "w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30 text-lg";
  formIcon.className = "fa-solid fa-pen";
  saveBtnText.innerText = "Actualizar registro";

  gameSearch.value = game.title;
  currentSelectedCover = safeUrl(game.coverUrl).startsWith("https://") ? safeUrl(game.coverUrl) : "";
  coverPreview.src = coverSrc(game);
  coverPreview.classList.remove("hidden");
  posterIcon.classList.add("hidden");
  coverStatusText.innerText = game.title;

  setStatus(game.status || "completed");
  setPlatformBadges(game.platforms || ["PC"]);
  isFavorite = Boolean(game.favorite);
  updateFavoriteUI();

  setScoreUI(hasRating(game) ? Number(game.rating) : null);
  gameHours.value = game.hours || "";
  gameTargetHours.value = game.targetHours || "";
  if (gameCompletedYear) gameCompletedYear.value = game.completedYear || new Date().getFullYear();
  gameTags.value = (game.tags || []).join(", ");
  gameNotes.value = game.notes || "";

  toggleForm(true);
}

if (saveGameBtn) {
  saveGameBtn.addEventListener("click", async () => {
    if (isSpectatorMode) {
      alert("Estás en modo espectador. No tienes permisos para alterar este estante.");
      return;
    }
    const title = sanitizeInput(gameSearch.value).slice(0, 150);
    if (!title) {
      alert("Por favor escribe el nombre del videojuego.");
      gameSearch.focus();
      return;
    }

    const parsedTags = gameTags.value
      .split(",")
      .map(t => sanitizeInput(t).slice(0, 40))
      .filter(t => t.length > 0)
      .map(t => t.startsWith("#") ? t : "#" + t)
      .slice(0, 15);

    // El año solo tiene sentido si el juego está terminado.
    const parsedYear = COMPLETED_STATUSES.includes(activeStatus)
      ? (parseInt(gameCompletedYear?.value, 10) || new Date().getFullYear())
      : null;

    const gameData = {
      title: title,
      coverUrl: currentSelectedCover.startsWith("https://") ? currentSelectedCover : "",
      status: activeStatus,
      platforms: [...activePlatforms],
      rating: isRated ? parseFloat(scoreRange.value) : null,
      hours: Math.max(0, parseInt(gameHours.value, 10) || 0),
      targetHours: Math.max(0, parseInt(gameTargetHours.value, 10) || 0),
      completedYear: parsedYear,
      favorite: isFavorite,
      tags: parsedTags,
      notes: sanitizeInput(gameNotes.value).slice(0, 2000)
    };

    if (activeStatus === "platinum") SoundFX.playTrophy();
    else SoundFX.playClick();

    let savedGame;
    if (editingGameId) {
      StorageManager.updateGame(editingGameId, gameData);
      savedGame = { id: editingGameId, ...gameData };
    } else {
      savedGame = { id: newGameId(), ...gameData };
      StorageManager.addGame(savedGame);
    }

    // Solo se sube el juego que cambió
    await cloudRun(() => DB.upsertGame(savedGame), "No se pudo guardar en la nube.");

    renderLibrary();
    resetForm();
    toggleForm(false);
  });
}

function renderTagChips(tags = []) {
  if (!tags || tags.length === 0) return "";
  return tags.map(tag => {
    const t = String(tag).toLowerCase();
    let colorClass = "bg-indigo-950/60 border-indigo-500/40 text-indigo-300";
    if (t.includes("souls") || t.includes("rpg")) {
      colorClass = "bg-rose-950/60 border-rose-500/50 text-rose-300";
    } else if (t.includes("indie") || t.includes("metroid")) {
      colorClass = "bg-emerald-950/60 border-emerald-500/50 text-emerald-300";
    } else if (t.includes("goty") || t.includes("top")) {
      colorClass = "bg-amber-950/60 border-amber-500/50 text-amber-300";
    } else if (t.includes("action") || t.includes("shooter")) {
      colorClass = "bg-cyan-950/60 border-cyan-500/50 text-cyan-300";
    }
    return `<span class="text-[9px] font-extrabold px-2 py-0.5 rounded-md border ${colorClass}">${escapeHTML(tag)}</span>`;
  }).join(" ");
}

if (viewGridBtn && viewListBtn) {
  viewGridBtn.addEventListener("click", () => {
    SoundFX.playClick();
    currentViewMode = "grid";
    viewGridBtn.className = "px-2.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white transition cursor-pointer";
    viewListBtn.className = "px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-white transition cursor-pointer";
    renderLibrary();
  });

  viewListBtn.addEventListener("click", () => {
    SoundFX.playClick();
    currentViewMode = "list";
    viewListBtn.className = "px-2.5 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white transition cursor-pointer";
    viewGridBtn.className = "px-2.5 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-white transition cursor-pointer";
    renderLibrary();
  });
}

function openCommandPalette() {
  if (!commandPaletteModal) return;
  SoundFX.playWhoosh();
  commandPaletteModal.classList.remove("hidden");
  commandInput.value = "";
  renderCommandResults("");
  setTimeout(() => commandInput.focus(), 50);
}

function closeCommandPalette() {
  if (commandPaletteModal) commandPaletteModal.classList.add("hidden");
}

if (openCommandBtn) openCommandBtn.addEventListener("click", openCommandPalette);

window.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    if (commandPaletteModal && !commandPaletteModal.classList.contains("hidden")) {
      closeCommandPalette();
    } else {
      openCommandPalette();
    }
    return;
  }
  
  if (e.key === "Escape") {
    closeCommandPalette();
    if (detailModal && !detailModal.classList.contains("hidden")) detailModal.classList.add("hidden");
    if (steamModal && !steamModal.classList.contains("hidden")) steamModal.classList.add("hidden");
    if (shareCardModal && !shareCardModal.classList.contains("hidden")) shareCardModal.classList.add("hidden");
    if (formSection && !formSection.classList.contains("hidden")) toggleForm(false);
    if (statsModal && !statsModal.classList.contains("hidden")) statsModal.classList.add("hidden");
    if (wrappedModal && !wrappedModal.classList.contains("hidden")) wrappedModal.classList.add("hidden");
    return;
  }
});

if (commandPaletteModal) {
  commandPaletteModal.addEventListener("click", (e) => {
    if (e.target === commandPaletteModal) closeCommandPalette();
  });
}

if (commandInput) {
  commandInput.addEventListener("input", (e) => {
    renderCommandResults(e.target.value.toLowerCase().trim());
  });
}

function getCurrentDataset() {
  return isSpectatorMode ? spectatorGames : StorageManager.getGames();
}

function renderCommandResults(query) {
  const lib = getCurrentDataset();
  const matches = query ? lib.filter(g => String(g.title).toLowerCase().includes(query)) : lib.slice(0, 6);

  commandResults.innerHTML = "";
  if (matches.length === 0) {
    commandResults.innerHTML = `<p class="text-xs text-slate-500 py-3 text-center">No se encontraron juegos con ese nombre.</p>`;
    return;
  }

  matches.forEach(game => {
    const item = document.createElement("div");
    item.className = "flex items-center justify-between p-2 rounded-xl hover:bg-white/10 cursor-pointer transition";
    item.innerHTML = `
      <div class="flex items-center gap-3">
        ${coverImg(game, "w-8 h-10 object-cover rounded bg-slate-900")}
        <div>
          <p class="text-xs font-bold text-white console-font">${escapeHTML(game.title)}</p>
          <p class="text-[10px] text-slate-400">${escapeHTML((game.platforms || []).join(", "))} • ${Number(game.hours) || 0}h</p>
        </div>
      </div>
      <span class="text-xs font-black text-amber-400 console-font"><i class="fa-solid fa-star text-[10px]"></i> ${fmtRating(game)}</span>
    `;
    item.onclick = () => {
      closeCommandPalette();
      openDetailModal(game);
    };
    commandResults.appendChild(item);
  });
}

if (filterStatusSelect) {
  filterStatusSelect.addEventListener("change", (e) => {
    SoundFX.playClick();
    currentFilter = e.target.value;
    renderLibrary();
  });
}

if (filterPlatformSelect) {
  filterPlatformSelect.addEventListener("change", (e) => {
    SoundFX.playClick();
    currentPlatformFilter = e.target.value;
    renderLibrary();
  });
}

if (filterInput) filterInput.addEventListener("input", () => renderLibrary());
if (sortBySelect) {
  sortBySelect.addEventListener("change", () => {
    SoundFX.playClick();
    renderLibrary();
  });
}

// Carrusel Now Playing
function setupNowPlayingCarousel(playingGames) {
  if (nowPlayingInterval) {
    clearInterval(nowPlayingInterval);
    nowPlayingInterval = null;
  }

  if (!playingGames || playingGames.length === 0) {
    if (npCover) {
      npCover.removeAttribute("src");
      npCover.classList.add("hidden");
    }
    if (npPlaceholderIcon) npPlaceholderIcon.classList.remove("hidden");
    if (npCoverBg) npCoverBg.style.backgroundImage = "none";
    
    if (npTitle) npTitle.innerText = isSpectatorMode ? "Sin actividad activa" : "Comienza tu colección";
    if (npMeta) npMeta.innerText = isSpectatorMode ? "El jugador no tiene títulos marcados en curso." : "Haz clic en 'Registrar' para comenzar";
    
    if (npProgressContainer) npProgressContainer.classList.add("hidden");
    if (npActionBtn) {
      if (isSpectatorMode) npActionBtn.classList.add("hidden");
      else {
        npActionBtn.classList.remove("hidden");
        npActionBtn.onclick = () => toggleForm(true);
      }
    }
    return;
  }

  if (currentPlayingIndex >= playingGames.length) {
    currentPlayingIndex = 0;
  }

  function renderCurrentSlide(index) {
    const game = playingGames[index];
    if (!game) return;

    if (npCover) {
      npCover.style.opacity = "0.2";
      npCover.style.transform = "scale(0.96)";
    }
    if (npTitle) npTitle.style.opacity = "0.2";
    if (npMeta) npMeta.style.opacity = "0.2";
    if (npCoverBg) npCoverBg.style.opacity = "0.15";

    setTimeout(() => {
      const src = coverSrc(game);
      if (npCover) {
        npCover.dataset.fallbackTitle = game.title;
        delete npCover.dataset.fallbackApplied;
        npCover.src = src;
        npCover.classList.remove("hidden");
      }
      if (npPlaceholderIcon) npPlaceholderIcon.classList.add("hidden");

      if (npCoverBg) {
        npCoverBg.style.backgroundImage = `url(${JSON.stringify(src)})`;
      }

      if (npTitle) npTitle.innerText = game.title;
      const countLabel = playingGames.length > 1 ? ` • (${index + 1}/${playingGames.length})` : "";
      if (npMeta) npMeta.innerText = `${(game.platforms || []).join(", ")} • ${game.hours || 0} hrs dedicadas${countLabel}`;

      if (isSpectatorMode) {
        if (npActionBtn) npActionBtn.classList.add("hidden");
      } else {
        if (npActionBtn) {
          npActionBtn.classList.remove("hidden");
          npActionBtn.onclick = () => startEditGame(game);
        }
      }

      if (game.targetHours && game.targetHours > 0) {
        const pct = Math.min(100, Math.round(((game.hours || 0) / game.targetHours) * 100));
        if (npProgressText) npProgressText.innerText = `${pct}% (${game.hours || 0}h / ${game.targetHours}h)`;
        if (npProgressBar) npProgressBar.style.width = `${pct}%`;
        if (npProgressContainer) npProgressContainer.classList.remove("hidden");
      } else {
        if (npProgressContainer) npProgressContainer.classList.add("hidden");
      }

      if (npCover) {
        npCover.style.opacity = "1";
        npCover.style.transform = "scale(1)";
      }
      if (npTitle) npTitle.style.opacity = "1";
      if (npMeta) npMeta.style.opacity = "1";
      if (npCoverBg) npCoverBg.style.opacity = "0.8";
    }, 250);
  }

  renderCurrentSlide(currentPlayingIndex);

  if (playingGames.length > 1) {
    nowPlayingInterval = setInterval(() => {
      currentPlayingIndex = (currentPlayingIndex + 1) % playingGames.length;
      renderCurrentSlide(currentPlayingIndex);
    }, 5500);
  }
}

/** Primer paso para un estante vacío: importar de Steam o añadir a mano. */
function bienvenidaHTML() {
  const invitado = !cloudUserId;
  return `
    <section class="bienvenida">
      <h2>Arma tu estante en un minuto.</h2>
      <p class="bienvenida-bajada">Trae tu biblioteca de Steam de una vez o empieza con el juego que tienes entre manos. Después le pones nota y estado a cada uno.</p>
      <div class="bienvenida-opciones">
        <button type="button" class="bienvenida-opcion principal" data-bienvenida="steam">
          <i class="fa-brands fa-steam" aria-hidden="true"></i>
          <span><b>Importar desde Steam</b><small>Tus juegos con más de 30 minutos, con horas y portada.</small></span>
        </button>
        <button type="button" class="bienvenida-opcion" data-bienvenida="manual">
          <i class="fa-solid fa-plus" aria-hidden="true"></i>
          <span><b>Añadir un juego</b><small>Lo buscas por nombre y la portada sale sola.</small></span>
        </button>
      </div>
      ${invitado ? `<p class="bienvenida-nota">Estás como invitado: lo que añadas se guarda solo en este navegador. <a href="login.html">Crea una cuenta</a> para tenerlo en cualquier dispositivo y poder compartirlo.</p>` : ""}
      <button type="button" class="bienvenida-demo" data-bienvenida="demo">Ver cómo se ve con juegos de ejemplo</button>
    </section>`;
}

function renderLibrary() {
  const lib = getCurrentDataset();
  const term = filterInput ? filterInput.value.toLowerCase().trim() : "";
  const sortBy = sortBySelect ? sortBySelect.value : "recent";

  const playingGames = lib.filter(g => g.status === 'playing');
  const completedCount = lib.filter(g => COMPLETED_STATUSES.includes(g.status)).length;
  const platinumCount = lib.filter(g => g.status === 'platinum').length;
  const totalHours = lib.reduce((acc, g) => acc + (Number(g.hours) || 0), 0);

  const elPlaying = document.getElementById("statPlaying");
  const elCompleted = document.getElementById("statCompleted");
  const elPlatinum = document.getElementById("statPlatinum");
  const elHours = document.getElementById("statHours");
  const elAvg = document.getElementById("statAvg");

  if (elPlaying) elPlaying.innerText = playingGames.length;
  if (elCompleted) elCompleted.innerText = completedCount;
  if (elPlatinum) elPlatinum.innerText = platinumCount;
  if (elHours) elHours.innerText = totalHours > 0 ? `${totalHours}h` : "0h";

  if (elAvg) {
    // El promedio ignora los juegos sin calificar
    const rated = ratedGames(lib);
    elAvg.innerText = rated.length > 0
      ? (rated.reduce((acc, g) => acc + Number(g.rating), 0) / rated.length).toFixed(1)
      : "—";
  }

  setupNowPlayingCarousel(playingGames);

  let filtered = [...lib];

  if (currentFilter !== "all") {
    if (currentFilter === "favorite") {
      filtered = filtered.filter(g => g.favorite);
    } else if (currentFilter === "completed") {
      filtered = filtered.filter(g => COMPLETED_STATUSES.includes(g.status));
    } else if (currentFilter === "tier-masterpiece") {
      filtered = filtered.filter(g => hasRating(g) && Number(g.rating) >= 9.0);
    } else {
      filtered = filtered.filter(g => g.status === currentFilter);
    }
  }

  if (currentPlatformFilter !== "all") {
    filtered = filtered.filter(g => (g.platforms || []).includes(currentPlatformFilter));
  }

  if (term) {
    filtered = filtered.filter(g =>
      String(g.title).toLowerCase().includes(term) ||
      (g.platforms && g.platforms.some(p => String(p).toLowerCase().includes(term))) ||
      (g.tags && g.tags.some(t => String(t).toLowerCase().includes(term)))
    );
  }

  // Los juegos sin calificar van siempre al final al ordenar por nota
  const byRating = (dir) => (a, b) => {
    if (!hasRating(a) && !hasRating(b)) return 0;
    if (!hasRating(a)) return 1;
    if (!hasRating(b)) return -1;
    return dir * (Number(a.rating) - Number(b.rating));
  };

  if (sortBy === 'rating-desc') {
    filtered.sort(byRating(-1));
  } else if (sortBy === 'rating-asc') {
    filtered.sort(byRating(1));
  } else if (sortBy === 'hours-desc') {
    filtered.sort((a, b) => (b.hours || 0) - (a.hours || 0));
  } else if (sortBy === 'title-asc') {
    filtered.sort((a, b) => String(a.title).localeCompare(String(b.title)));
  } else {
    filtered.sort((a, b) => b.id - a.id);
  }

  gamesGrid.innerHTML = "";

  // Estante totalmente vacío: bienvenida en vez de un "no hay resultados"
  const estanteVacio = !isSpectatorMode && StorageManager.getGames().length === 0;
  document.body.classList.toggle("estante-vacio", estanteVacio);
  if (estanteVacio) {
    gamesGrid.className = "block";
    gamesGrid.innerHTML = bienvenidaHTML();
    return;
  }

  if (filtered.length === 0) {
    gamesGrid.className = "block";
    const emptyMsg = isSpectatorMode 
      ? `El usuario <span class="text-indigo-400 font-black">@${escapeHTML(publicProfileTarget)}</span> no existe, tiene su estante privado o no ha registrado títulos.`
      : `No se encontraron títulos en esta categoría.`;

    gamesGrid.innerHTML = `
      <div class="py-20 text-center glass-panel rounded-3xl border border-white/10 p-6">
        <i class="fa-solid fa-ghost text-5xl text-slate-600 mb-3 block"></i>
        <p class="text-sm font-bold text-slate-300 console-font">${emptyMsg}</p>
        ${isSpectatorMode ? `
          <a href="app.html" class="inline-flex items-center gap-2 mt-5 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black console-font transition shadow-lg">
            <i class="fa-solid fa-house"></i> Volver a mi estante
          </a>
        ` : ''}
      </div>
    `;
    return;
  }

  if (currentViewMode === "grid") {
    gamesGrid.className = "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5 sm:gap-6";
    
    filtered.forEach(game => {
      const card = document.createElement("div");
      card.className = "game-console-card rounded-2xl overflow-hidden flex flex-col group cursor-pointer relative shadow-xl";

      let badgeHtml = '';
      if (game.status === 'playing') {
        badgeHtml = `<span class="badge-playing text-[10px] font-black px-2 py-0.5 rounded-md flex items-center gap-1"><i class="fa-solid fa-fire text-orange-400"></i> Jugando</span>`;
      } else if (game.status === 'platinum') {
        badgeHtml = `<span class="badge-platinum text-[10px] font-black px-2 py-0.5 rounded-md flex items-center gap-1"><i class="fa-solid fa-trophy text-amber-400"></i> 100%</span>`;
      } else if (game.status === 'extras') {
        badgeHtml = `<span class="badge-extras text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1"><i class="fa-solid fa-star-half-stroke"></i> Extras</span>`;
      } else if (game.status === 'onhold') {
        badgeHtml = `<span class="badge-onhold text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1"><i class="fa-solid fa-pause"></i> Pausa</span>`;
      } else if (game.status === 'backlog') {
        badgeHtml = `<span class="text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1 bg-slate-800/90 text-slate-300 border border-white/15"><i class="fa-solid fa-inbox"></i> Pendiente</span>`;
      } else {
        badgeHtml = `<span class="badge-completed text-[10px] font-bold px-2 py-0.5 rounded-md flex items-center gap-1"><i class="fa-solid fa-check"></i> Pasado</span>`;
      }

      const favBadge = game.favorite ? `
        <div class="bg-amber-500/25 text-amber-300 border border-amber-500/50 px-1.5 py-0.5 rounded-md text-[10px] font-black flex items-center gap-1 shadow-md">
          <i class="fa-solid fa-crown text-[9px]"></i>
        </div>` : '';

      const platformIcons = (game.platforms || []).map(p => {
        if (p === 'PC') return '<i class="fa-brands fa-windows text-blue-400"></i>';
        if (p === 'PlayStation') return '<i class="fa-brands fa-playstation text-blue-500"></i>';
        if (p === 'Xbox') return '<i class="fa-brands fa-xbox text-emerald-500"></i>';
        if (p === 'Nintendo') return '<i class="fa-solid fa-gamepad text-red-500"></i>';
        return '<i class="fa-solid fa-ghost text-purple-400"></i>';
      }).join(" ");

      const hoursDisplay = game.hours ? `<span class="text-[10px] text-slate-300 font-bold bg-black/70 px-1.5 py-0.5 rounded border border-white/10"><i class="fa-regular fa-clock mr-1 text-slate-400"></i>${Number(game.hours) || 0}h</span>` : '';

      let progressMini = "";
      if (game.targetHours && game.targetHours > 0) {
        const p = Math.min(100, Math.round(((Number(game.hours) || 0) / Number(game.targetHours)) * 100));
        progressMini = `
          <div class="w-full bg-black/50 h-1 rounded-full overflow-hidden mt-1 border border-white/5">
            <div class="bg-gradient-to-r from-orange-400 to-amber-300 h-full" style="width: ${p}%"></div>
          </div>
        `;
      }

      const notesBlock = game.notes ? `
        <p class="text-[11px] text-slate-300 line-clamp-2 italic p-2 rounded-lg bg-black/30 border border-white/5 leading-snug">"${escapeHTML(game.notes)}"</p>
      ` : '';

      card.innerHTML = `
        <div class="relative aspect-[3/4] overflow-hidden bg-slate-950">
          ${coverImg(game, "w-full h-full object-cover transition")}

          <div class="absolute top-2.5 left-2.5 z-10 flex items-center gap-1.5">
            ${badgeHtml}
            ${favBadge}
          </div>

          <div class="absolute top-2.5 right-2.5 z-10 bg-black/85 backdrop-blur-md px-2 py-0.5 rounded-lg border border-white/15 text-amber-400 font-black text-xs flex items-center gap-1 shadow-lg console-font">
            <i class="fa-solid fa-star text-[10px]"></i> ${fmtRating(game)}
          </div>

          <div class="absolute bottom-2.5 left-2.5 right-2.5 z-10 flex flex-col gap-1 drop-shadow-md">
            <div class="flex justify-between items-center text-xs">
              <div class="flex gap-2">${platformIcons}</div>
              ${hoursDisplay}
            </div>
            ${progressMini}
          </div>
        </div>

        <div class="p-3 sm:p-3.5 flex flex-col justify-between flex-1 gap-2.5">
          <div>
            <h3 class="font-bold text-xs sm:text-sm text-slate-100 line-clamp-1 group-hover:text-indigo-400 transition console-font" title="${escapeHTML(game.title)}">${escapeHTML(game.title)}</h3>
            <div class="flex flex-wrap gap-1 mt-1.5">
              ${renderTagChips(game.tags ? game.tags.slice(0, 2) : [])}
            </div>
          </div>
          ${notesBlock}
        </div>
      `;

      card.addEventListener("click", () => openDetailModal(game));
      gamesGrid.appendChild(card);
    });
  } else {
    gamesGrid.className = "flex flex-col gap-2.5";

    filtered.forEach(game => {
      const row = document.createElement("div");
      row.className = "glass-panel p-3 rounded-2xl flex items-center justify-between gap-4 hover:border-indigo-500/50 transition cursor-pointer";
      
      const platformIcons = (game.platforms || []).map(p => {
        if (p === 'PC') return '<i class="fa-brands fa-windows text-blue-400"></i>';
        if (p === 'PlayStation') return '<i class="fa-brands fa-playstation text-blue-500"></i>';
        if (p === 'Xbox') return '<i class="fa-brands fa-xbox text-emerald-500"></i>';
        if (p === 'Nintendo') return '<i class="fa-solid fa-gamepad text-red-500"></i>';
        return '<i class="fa-solid fa-ghost text-purple-400"></i>';
      }).join(" ");

      row.innerHTML = `
        <div class="flex items-center gap-3.5 overflow-hidden">
          ${coverImg(game, "w-12 h-16 object-cover rounded-xl bg-slate-950 shrink-0 border border-white/10")}
          <div class="overflow-hidden">
            <div class="flex items-center gap-2">
              <h3 class="font-black text-sm text-white console-font truncate">${escapeHTML(game.title)}</h3>
              ${game.favorite ? '<i class="fa-solid fa-crown text-amber-400 text-xs"></i>' : ''}
            </div>
            <div class="flex items-center gap-2 mt-1 text-xs text-slate-400">
              <span>${platformIcons}</span>
              <span>•</span>
              <span>${Number(game.hours) || 0} hrs</span>
              ${game.targetHours ? `<span>• Meta: ${Number(game.targetHours) || 0}h</span>` : ''}
            </div>
          </div>
        </div>

        <div class="flex items-center gap-4 shrink-0">
          <span class="text-sm font-black text-amber-400 console-font flex items-center gap-1">
            <i class="fa-solid fa-star text-xs"></i> ${fmtRating(game)}
          </span>
          <i class="fa-solid fa-chevron-right text-xs text-slate-600"></i>
        </div>
      `;

      row.addEventListener("click", () => openDetailModal(game));
      gamesGrid.appendChild(row);
    });
  }
}

// Modal Detalle
const detailModal = document.getElementById("detailModal");
const closeModalBtn = document.getElementById("closeModalBtn");
const modalCover = document.getElementById("modalCover");
const modalCoverThumb = document.getElementById("modalCoverThumb");
const modalTitle = document.getElementById("modalTitle");
const modalBadges = document.getElementById("modalBadges");
const modalReview = document.getElementById("modalReview");
const modalRating = document.getElementById("modalRating");
const modalTagsContainer = document.getElementById("modalTagsContainer");
const modalEditBtn = document.getElementById("modalEditBtn");
const modalDeleteBtn = document.getElementById("modalDeleteBtn");
const modalShareBtn = document.getElementById("modalShareBtn");

const shareCardModal = document.getElementById("shareCardModal");
const closeShareCardBtn = document.getElementById("closeShareCardBtn");
const downloadShareCardBtn = document.getElementById("downloadShareCardBtn");
const shareCardCanvas = document.getElementById("shareCardCanvas");

function openDetailModal(game) {
  SoundFX.playWhoosh();
  activeModalGameId = game.id;
  [modalCover, modalCoverThumb].forEach(img => {
    if (!img) return;
    img.dataset.fallbackTitle = game.title;
    delete img.dataset.fallbackApplied;
    img.src = coverSrc(game);
  });
  if (modalTitle) modalTitle.innerText = game.title;
  if (modalRating) modalRating.innerText = fmtRating(game);
  if (modalReview) modalReview.innerText = game.notes || "Sin reseña escrita.";

  const statusLabels = {
    playing: '🔥 Jugando actualmente',
    platinum: '🏆 Platinado / 100%',
    extras: '⭐ Campaña + Extras',
    onhold: '⏸️ En Pausa',
    backlog: '📥 Pendiente',
    completed: '✅ Historia Principal'
  };
  const statusBadge = statusLabels[game.status] || statusLabels.completed;
  const completedYear = parseInt(game.completedYear, 10);

  if (modalBadges) {
    modalBadges.innerHTML = `
      <span class="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded text-[11px] border border-indigo-500/30">${statusBadge}</span>
      <span class="px-2 py-0.5 bg-slate-800 text-slate-300 rounded text-[11px]">${escapeHTML((game.platforms || []).join(", "))}</span>
      ${game.hours ? `<span class="px-2 py-0.5 bg-slate-800 text-slate-300 rounded text-[11px]"><i class="fa-regular fa-clock mr-1"></i>${Number(game.hours) || 0}h</span>` : ''}
      ${completedYear && COMPLETED_STATUSES.includes(game.status) ? `<span class="px-2 py-0.5 bg-slate-800 text-slate-300 rounded text-[11px]"><i class="fa-regular fa-calendar mr-1"></i>${completedYear}</span>` : ''}
      ${game.targetHours ? `<span class="px-2 py-0.5 bg-orange-500/20 text-orange-300 rounded text-[11px]">Meta: ${Number(game.targetHours) || 0}h</span>` : ''}
    `;
  }

  if (modalTagsContainer) {
    modalTagsContainer.innerHTML = renderTagChips(game.tags || []);
  }

  if (isSpectatorMode) {
    if (modalEditBtn) modalEditBtn.classList.add("hidden");
    if (modalDeleteBtn) modalDeleteBtn.classList.add("hidden");
  } else {
    if (modalEditBtn) modalEditBtn.classList.remove("hidden");
    if (modalDeleteBtn) modalDeleteBtn.classList.remove("hidden");
  }

  if (detailModal) detailModal.classList.remove("hidden");
}

if (closeModalBtn) closeModalBtn.addEventListener("click", () => detailModal.classList.add("hidden"));
if (detailModal) {
  detailModal.addEventListener("click", (e) => {
    if (e.target === detailModal) detailModal.classList.add("hidden");
  });
}

if (modalEditBtn) {
  modalEditBtn.addEventListener("click", () => {
    if (isSpectatorMode) return;
    const lib = getCurrentDataset();
    const target = lib.find(g => g.id === activeModalGameId);
    if (target) {
      detailModal.classList.add("hidden");
      startEditGame(target);
    }
  });
}

if (modalDeleteBtn) {
  modalDeleteBtn.addEventListener("click", async () => {
    if (isSpectatorMode) return;
    if (confirm("¿Seguro que deseas eliminar este juego de tu colección?")) {
      const gameId = activeModalGameId;
      StorageManager.deleteGame(gameId);
      await cloudRun(() => DB.deleteGame(gameId), "No se pudo borrar de la nube.");
      renderLibrary();
      detailModal.classList.add("hidden");
    }
  });
}

if (modalShareBtn) {
  modalShareBtn.addEventListener("click", async () => {
    const lib = getCurrentDataset();
    const target = lib.find(g => g.id === activeModalGameId);
    if (!target) return;

    SoundFX.playWhoosh();
    detailModal.classList.add("hidden");
    shareCardModal.classList.remove("hidden");
    await CanvasPoster.drawSingleGameCard(shareCardCanvas, target);
  });
}

if (closeShareCardBtn) closeShareCardBtn.addEventListener("click", () => shareCardModal.classList.add("hidden"));
if (downloadShareCardBtn) {
  downloadShareCardBtn.addEventListener("click", () => {
    SoundFX.playClick();
    compartirCanvas(shareCardCanvas, `paindex_juego_${activeModalGameId}`, "Desde mi estante en Paindex Vault");
  });
}

// Player Wrapped
const wrappedModal = document.getElementById("wrappedModal");
const openWrappedBtn = document.getElementById("openWrappedBtn");
const closeWrappedBtn = document.getElementById("closeWrappedBtn");
const wrappedYearSelect = document.getElementById("wrappedYearSelect");
const wrappedPeriodLabel = document.getElementById("wrappedPeriodLabel");

/** Datos del Wrapped para un año (o "all" para todo el historial). */
function datosWrapped(selectedYear) {
  const lib = getCurrentDataset();
  let games = [...lib];
  if (selectedYear !== "all") {
    const y = parseInt(selectedYear, 10);
    games = lib.filter(g => (g.completedYear || new Date(g.id).getFullYear()) === y);
  }
  const tagCounts = {};
  games.forEach(g => (g.tags || []).forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
  return {
    periodo: selectedYear,
    horas: games.reduce((acc, g) => acc + (g.hours || 0), 0),
    juegos: games.length,
    pasados: games.filter(g => COMPLETED_STATUSES.includes(g.status)).length,
    platinos: games.filter(g => g.status === "platinum").length,
    mejor: ratedGames(games).sort((a, b) => Number(b.rating) - Number(a.rating))[0] || null,
    masJugado: [...games].sort((a, b) => (b.hours || 0) - (a.hours || 0))[0] || null,
    tags: Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(i => i[0])
  };
}

async function updateWrappedUI(selectedYear) {
  const canvas = document.getElementById("wrappedCanvas");
  if (!canvas || getCurrentDataset().length === 0) return;
  await CanvasPoster.drawWrapped(canvas, datosWrapped(selectedYear));
}

const shareWrappedBtn = document.getElementById("shareWrappedBtn");
if (shareWrappedBtn) shareWrappedBtn.addEventListener("click", () => {
  SoundFX.playClick();
  const periodo = wrappedYearSelect ? wrappedYearSelect.value : "all";
  compartirCanvas(document.getElementById("wrappedCanvas"), `paindex_wrapped_${periodo}`, "Mi Wrapped en Paindex Vault");
});

function populateWrappedYears() {
  if (!wrappedYearSelect) return;
  const lib = getCurrentDataset();
  const currentYear = new Date().getFullYear();
  const years = new Set([currentYear]);

  lib.forEach(g => {
    const y = g.completedYear || new Date(g.id).getFullYear();
    if (y) years.add(y);
  });

  const sortedYears = Array.from(years).sort((a, b) => b - a);
  wrappedYearSelect.innerHTML = sortedYears.map(y => `<option value="${y}">${y}</option>`).join("") + `<option value="all">Histórico Global</option>`;
}

if (openWrappedBtn) {
  openWrappedBtn.addEventListener("click", () => {
    const lib = getCurrentDataset();
    if (lib.length === 0) {
      alert("No hay títulos suficientes para generar el Wrapped.");
      return;
    }
    SoundFX.playTrophy();
    populateWrappedYears();
    updateWrappedUI(wrappedYearSelect.value);
    wrappedModal.classList.remove("hidden");
  });
}

if (wrappedYearSelect) {
  wrappedYearSelect.addEventListener("change", (e) => {
    SoundFX.playClick();
    updateWrappedUI(e.target.value);
  });
}

if (closeWrappedBtn) closeWrappedBtn.addEventListener("click", () => wrappedModal.classList.add("hidden"));

// Top Poster
const top5Modal = document.getElementById("top5Modal");
const openTop5Btn = document.getElementById("openTop5Btn");
const closeTop5ModalBtn = document.getElementById("closeTop5ModalBtn");
const downloadTop5Btn = document.getElementById("downloadTop5Btn");
const top5Canvas = document.getElementById("top5Canvas");
const topCountSelect = document.getElementById("topCountSelect");

async function renderTopPoster() {
  const lib = getCurrentDataset();
  if (lib.length === 0) return;
  const count = topCountSelect ? parseInt(topCountSelect.value, 10) : 5;
  const topList = ratedGames(lib).sort((a, b) => Number(b.rating) - Number(a.rating)).slice(0, count);
  if (topList.length === 0) {
    alert("Califica al menos un juego para generar tu Top.");
    top5Modal.classList.add("hidden");
    return;
  }
  await CanvasPoster.drawTopPoster(top5Canvas, topList, count);
}

if (openTop5Btn) {
  openTop5Btn.addEventListener("click", async () => {
    SoundFX.playWhoosh();
    const lib = getCurrentDataset();
    if (lib.length === 0) {
      alert("Agrega juegos al estante primero.");
      return;
    }
    top5Modal.classList.remove("hidden");
    await renderTopPoster();
  });
}

if (topCountSelect) {
  topCountSelect.addEventListener("change", async () => {
    SoundFX.playClick();
    await renderTopPoster();
  });
}

if (closeTop5ModalBtn) closeTop5ModalBtn.addEventListener("click", () => top5Modal.classList.add("hidden"));
if (downloadTop5Btn) {
  downloadTop5Btn.addEventListener("click", () => {
    SoundFX.playClick();
    const count = topCountSelect ? topCountSelect.value : "5";
    compartirCanvas(top5Canvas, `paindex_top_${count}`, `Mi top ${count} en Paindex Vault`);
  });
}

// ==========================================
// MODAL DE ESTADÍSTICAS BLINDADO (SIN ERRORES NULL)
// ==========================================
const statsModal = document.getElementById("statsModal");
const openStatsBtn = document.getElementById("openStatsBtn");
const closeStatsModalBtn = document.getElementById("closeStatsModalBtn");

if (openStatsBtn && statsModal) {
  openStatsBtn.addEventListener("click", () => {
    SoundFX.playWhoosh();
    const lib = getCurrentDataset();

    if (!lib || lib.length === 0) {
      alert("No hay registros en la biblioteca.");
      return;
    }

    const completed = lib.filter(g => COMPLETED_STATUSES.includes(g.status)).length;
    const rate = Math.round((completed / lib.length) * 100);
    const elRate = document.getElementById("statCompletionRate");
    if (elRate) elRate.innerText = `${rate}%`;

    const gamesWithHours = lib.filter(g => g.hours && g.hours > 0);
    const avgHours = gamesWithHours.length ? Math.round(gamesWithHours.reduce((acc, g) => acc + g.hours, 0) / gamesWithHours.length) : 0;
    const elAvgHours = document.getElementById("statAvgHours");
    if (elAvgHours) elAvgHours.innerText = `${avgHours}h`;

    const masters = lib.filter(g => hasRating(g) && Number(g.rating) >= 9).length;
    const elMasters = document.getElementById("statMasterpieces");
    if (elMasters) elMasters.innerText = masters;

    const platCounts = {};
    lib.forEach(g => {
      (g.platforms || ["PC"]).forEach(p => {
        platCounts[p] = (platCounts[p] || 0) + 1;
      });
    });

    let topPlat = "-";
    let topCount = 0;
    for (const [p, count] of Object.entries(platCounts)) {
      if (count > topCount) {
        topCount = count;
        topPlat = p;
      }
    }
    const elTopPlat = document.getElementById("statTopPlatform");
    if (elTopPlat) elTopPlat.textContent = topPlat;

    const playing = lib.filter(g => g.status === 'playing').length;
    const onhold = lib.filter(g => g.status === 'onhold').length;
    const backlog = lib.filter(g => g.status === 'backlog').length;

    const pPlaying = Math.round((playing / lib.length) * 100);
    const pCompleted = Math.round((completed / lib.length) * 100);
    const pOnhold = Math.round((onhold / lib.length) * 100);
    const pBacklog = Math.round((backlog / lib.length) * 100);

    const statusBar = document.getElementById("statusBarBreakdown");
    if (statusBar) {
      statusBar.innerHTML = `
        <div style="width: ${pCompleted}%" class="bg-emerald-500 h-full" title="Completados"></div>
        <div style="width: ${pPlaying}%" class="bg-orange-500 h-full" title="Jugando"></div>
        <div style="width: ${pOnhold}%" class="bg-yellow-500 h-full" title="En Pausa"></div>
        <div style="width: ${pBacklog}%" class="bg-slate-500 h-full" title="Pendientes"></div>
      `;
    }

    const statusLegend = document.getElementById("statusBarLegend");
    if (statusLegend) {
      statusLegend.innerHTML = `
        <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> ${completed} Pasados</span>
        <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-orange-500"></span> ${playing} Jugando</span>
        <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-yellow-500"></span> ${onhold} En Pausa</span>
        <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-slate-500"></span> ${backlog} Pendientes</span>
      `;
    }

    const platList = document.getElementById("platformBreakdownList");
    if (platList) {
      platList.innerHTML = Object.entries(platCounts).map(([plat, count]) => {
        const perc = Math.round((count / lib.length) * 100);
        return `
          <div class="flex items-center justify-between text-xs">
            <span class="text-slate-300 font-semibold">${escapeHTML(plat)}</span>
            <div class="flex items-center gap-2">
              <div class="w-28 bg-slate-800 h-2 rounded-full overflow-hidden">
                <div class="bg-indigo-500 h-full" style="width: ${perc}%"></div>
              </div>
              <span class="text-slate-400 font-bold w-6 text-right">${count}</span>
            </div>
          </div>
        `;
      }).join("");
    }

    statsModal.classList.remove("hidden");
  });
}

if (closeStatsModalBtn && statsModal) {
  closeStatsModalBtn.addEventListener("click", () => statsModal.classList.add("hidden"));
}

if (statsModal) {
  statsModal.addEventListener("click", (e) => {
    if (e.target === statsModal) statsModal.classList.add("hidden");
  });
}

// JSON Backup
document.getElementById("exportBtn")?.addEventListener("click", () => {
  SoundFX.playClick();
  const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(getCurrentDataset(), null, 2));
  const dlAnchor = document.createElement('a');
  dlAnchor.setAttribute("href", dataStr);
  dlAnchor.setAttribute("download", `estante_backup_${new Date().toISOString().slice(0,10)}.json`);
  dlAnchor.click();
});

document.getElementById("importBtn")?.addEventListener("click", () => {
  if (isSpectatorMode) {
    alert("No puedes importar copias de seguridad en el estante de otro usuario.");
    return;
  }
  document.getElementById("fileInput").click();
});

document.getElementById("fileInput")?.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (event) => {
    let games;
    try {
      const parsed = JSON.parse(event.target.result);
      if (!Array.isArray(parsed)) throw new Error("formato");
      const seen = new Set();
      games = parsed.map(normalizeGame).filter(g => {
        if (!g || seen.has(g.id)) return false;
        seen.add(g.id);
        return true;
      });
    } catch (err) {
      alert("El archivo subido no es una copia de seguridad válida.");
      return;
    } finally {
      e.target.value = "";
    }

    if (games.length === 0) {
      alert("La copia de seguridad no contiene juegos válidos.");
      return;
    }
    if (!confirm(`Esta copia tiene ${games.length} juegos y REEMPLAZARÁ tu estante actual.\n\n¿Continuar?`)) return;

    StorageManager.saveGames(games);
    await cloudRun(() => DB.replaceAllGames(games), "No se pudo restaurar la copia en la nube.");
    renderLibrary();
    SoundFX.playTrophy();
    showToast(`¡Colección restaurada! ${games.length} juegos.`);
  };
  reader.readAsText(file);
});

// Steam Modal Controls
const openSteamSyncBtn = document.getElementById("openSteamSyncBtn");
const steamModal = document.getElementById("steamModal");
const closeSteamModalBtn = document.getElementById("closeSteamModalBtn");
const confirmImportSteamBtn = document.getElementById("confirmImportSteamBtn");
const selectAllSteamBtn = document.getElementById("selectAllSteamBtn");
const steamGamesList = document.getElementById("steamGamesList");

window.fetchedSteamGames = [];

if (openSteamSyncBtn) {
  openSteamSyncBtn.addEventListener("click", () => {
    if (isSpectatorMode) {
      alert("Estás viendo el estante de otro jugador. Para sincronizar tu propia cuenta de Steam entra a tu propio estante.");
      return;
    }
    steamModal.classList.remove("hidden");
  });
}

if (closeSteamModalBtn) closeSteamModalBtn.addEventListener("click", () => steamModal.classList.add("hidden"));

if (selectAllSteamBtn) {
  selectAllSteamBtn.addEventListener("click", () => {
    const checkboxes = steamGamesList.querySelectorAll("input[type='checkbox']");
    const anyUnchecked = Array.from(checkboxes).some(c => !c.checked);
    checkboxes.forEach(c => c.checked = anyUnchecked);
    selectAllSteamBtn.innerText = anyUnchecked ? "Desmarcar todos" : "Marcar todos";
  });
}

// ==========================================
// FUNCIÓN CONSULTA STEAM DIRECTA
// ==========================================
window.ejecutarConsultaSteam = async function() {
  if (isSpectatorMode) {
    alert("No puedes importar títulos en el perfil de otra persona.");
    return;
  }

  const inputEl = document.getElementById("steamIdInput");
  const btnEl = document.getElementById("fetchSteamBtn");
  const iconEl = document.getElementById("fetchSteamIcon");
  const textEl = document.getElementById("fetchSteamText");
  const previewContainer = document.getElementById("steamPreviewContainer");
  const countEl = document.getElementById("steamFoundCount");
  const listEl = document.getElementById("steamGamesList");

  const rawInput = inputEl ? inputEl.value.trim() : "";
  if (!rawInput) {
    alert("Introduce tu SteamID64 (17 dígitos) o el enlace de tu perfil de Steam.");
    if (inputEl) inputEl.focus();
    return;
  }

  if (btnEl) btnEl.disabled = true;
  if (iconEl) iconEl.className = "fa-solid fa-spinner fa-spin";
  if (textEl) textEl.innerText = "Consultando...";

  try {
    // El servidor valida el valor y resuelve las URLs personalizadas (/id/nombre)
    const res = await fetch(`/api/steam?steamid=${encodeURIComponent(rawInput)}`);
    
    if (!res.ok) {
      const errData = await res.json().catch(() => null);
      throw new Error(errData?.error || `Error ${res.status}: no se pudo conectar con Steam.`);
    }

    const data = await res.json();
    const rawGames = data?.response?.games;

    if (!rawGames || rawGames.length === 0) {
      throw new Error("Steam no devolvió títulos. Verifica que tu perfil y la lista de juegos estén en PÚBLICO y desmarques 'Ocultar tiempo total de juego'.");
    }

    window.fetchedSteamGames = rawGames
      .filter(g => (g.playtime_forever || 0) >= 30)
      .sort((a, b) => b.playtime_forever - a.playtime_forever)
      .filter(g => Number.isInteger(g.appid) && typeof g.name === "string")
      .map(g => ({
        appId: g.appid,
        title: sanitizeInput(g.name).slice(0, 150),
        hours: Math.round(g.playtime_forever / 60),
        coverUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/library_600x900.jpg`
      }));

    if (window.fetchedSteamGames.length === 0) {
      alert("Steam no devolvió juegos con más de 30 minutos jugados.\n\nSi sabes que tienes juegos, lo más probable es que tu perfil sea privado: en Steam ve a tu perfil → Editar perfil → Configuración de privacidad y pon \"Detalles del juego\" en Público. Luego vuelve a intentarlo.");
      return;
    }

    if (countEl) countEl.innerText = `${window.fetchedSteamGames.length} juegos listos para importar`;
    if (listEl) {
      listEl.innerHTML = window.fetchedSteamGames.map((g, idx) => `
        <label class="flex items-center justify-between p-2 rounded-xl hover:bg-white/10 cursor-pointer transition">
          <div class="flex items-center gap-3">
            <input type="checkbox" data-index="${idx}" checked class="rounded border-white/20 accent-blue-500 h-4 w-4">
            ${coverImg(g, "w-8 h-11 object-cover rounded bg-slate-950 shrink-0")}
            <div>
              <p class="text-xs font-bold text-white line-clamp-1">${escapeHTML(g.title)}</p>
              <p class="text-[10px] text-slate-400">${Number(g.hours) || 0} horas registradas en Steam</p>
            </div>
          </div>
        </label>
      `).join("");
    }

    if (previewContainer) previewContainer.classList.remove("hidden");

  } catch (err) {
    alert("Error al conectar con Steam: " + err.message);
  } finally {
    if (btnEl) btnEl.disabled = false;
    if (iconEl) iconEl.className = "fa-solid fa-cloud-arrow-down";
    if (textEl) textEl.innerText = "Consultar";
  }
};

const fetchSteamBtn = document.getElementById("fetchSteamBtn");
if (fetchSteamBtn) {
  fetchSteamBtn.addEventListener("click", window.ejecutarConsultaSteam);
}

if (confirmImportSteamBtn) {
  confirmImportSteamBtn.addEventListener("click", async () => {
    if (isSpectatorMode) {
      alert("Acción no permitida en modo espectador.");
      return;
    }

    const checkboxes = steamGamesList.querySelectorAll("input[type='checkbox']:checked");
    if (checkboxes.length === 0) {
      alert("Selecciona al menos un juego para importar.");
      return;
    }

    const currentGames = StorageManager.getGames();
    const existingTitles = new Set(currentGames.map(g => String(g.title).toLowerCase().trim()));
    const toImport = [];

    // Steam no dice si terminaste un juego ni qué nota le das: se importan
    // como "Pendiente" y sin calificar, para que no distorsionen tus estadísticas.
    checkboxes.forEach(cb => {
      const idx = parseInt(cb.dataset.index, 10);
      const g = window.fetchedSteamGames[idx];
      if (g && !existingTitles.has(g.title.toLowerCase().trim())) {
        existingTitles.add(g.title.toLowerCase().trim());
        toImport.push({
          id: newGameId(),
          title: g.title,
          coverUrl: g.coverUrl,
          status: "backlog",
          platforms: ["PC"],
          rating: null,
          hours: g.hours,
          targetHours: 0,
          completedYear: null,
          favorite: false,
          tags: ["#Steam"],
          notes: ""
        });
      }
    });

    if (toImport.length === 0) {
      alert("Los títulos seleccionados ya estaban en tu estante.");
      steamModal.classList.add("hidden");
      return;
    }

    StorageManager.saveGames([...currentGames, ...toImport]);
    await cloudRun(() => DB.upsertGames(toImport), "No se pudieron subir los juegos importados a la nube.");

    renderLibrary();
    SoundFX.playTrophy();
    steamModal.classList.add("hidden");
    alert(`¡Se importaron ${toImport.length} títulos desde Steam!\n\nQuedaron como "Pendiente" y sin nota: edítalos para marcar los que ya terminaste.`);
  });
}

// Cargar Demo & Limpiar
document.getElementById("loadDemoBtn")?.addEventListener("click", async () => {
  if (isSpectatorMode) return;
  // La demo solo se carga en un estante vacío, para no borrar nada por accidente.
  if (StorageManager.getGames().length > 0) {
    alert("La demo solo se puede cargar con el estante vacío.");
    return;
  }
  SoundFX.playTrophy();
  const currentYear = new Date().getFullYear();
  const demoGames = [
    {
      id: newGameId(),
      title: "Elden Ring",
      coverUrl: "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=400&q=80",
      status: "platinum",
      platforms: ["PC"],
      rating: 10,
      hours: 145,
      targetHours: 150,
      completedYear: currentYear,
      favorite: true,
      tags: ["#Soulslike", "#GOTY", "#MundoAbierto"],
      notes: "De las experiencias más completas de exploración. Platinado tras recorrer cada rincón."
    },
    {
      id: newGameId(),
      title: "Cyberpunk 2077",
      coverUrl: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=400&q=80",
      status: "playing",
      platforms: ["PC"],
      rating: 9.5,
      hours: 68,
      targetHours: 90,
      completedYear: null,
      favorite: true,
      tags: ["#RPG", "#SciFi", "#Shooter"],
      notes: "Night City tiene una de las ambientaciones más densas de la industria."
    }
  ];

  StorageManager.saveGames(demoGames);
  await cloudRun(() => DB.upsertGames(demoGames), "No se pudo subir la demo a la nube.");
  renderLibrary();
});

document.getElementById("clearAllBtn")?.addEventListener("click", async () => {
  if (isSpectatorMode) return;
  if (confirm("¿Seguro que deseas vaciar tu estante? Esto también lo borra de la nube y no se puede deshacer.\n\nConsejo: exporta una copia antes.")) {
    StorageManager.clearAll();
    await cloudRun(() => DB.replaceAllGames([]), "No se pudo vaciar el estante en la nube.");
    renderLibrary();
    resetForm();
  }
});

// Tema
const themeToggleBtn = document.getElementById("themeToggleBtn");
const themeIcon = document.getElementById("themeIcon");

function applyTheme(isLight) {
  if (isLight) {
    document.body.classList.add("light-mode");
    if (themeIcon) themeIcon.className = "fa-solid fa-moon text-indigo-500";
  } else {
    document.body.classList.remove("light-mode");
    if (themeIcon) themeIcon.className = "fa-solid fa-sun text-amber-400";
  }
}
applyTheme(localStorage.getItem("game_vault_theme") === "light");

if (themeToggleBtn) {
  themeToggleBtn.addEventListener("click", () => {
    SoundFX.playClick();
    const isLightNow = document.body.classList.toggle("light-mode");
    localStorage.setItem("game_vault_theme", isLightNow ? "light" : "dark");
    applyTheme(isLightNow);
  });
}

// ==========================================
// SESIÓN, PRIVACIDAD Y ARRANQUE
// ==========================================
const appAuthBtn = document.getElementById("appAuthBtn");
const appUserLabel = document.getElementById("appUserLabel");
const appUserIcon = document.getElementById("appUserIcon");
const accountControls = document.getElementById("accountControls");
const profileVisibilityBtn = document.getElementById("profileVisibilityBtn");
const deleteAccountBtn = document.getElementById("deleteAccountBtn");

// A quién pertenece la copia local del estante (null = invitado)
const LOCAL_OWNER_KEY = "game_vault_owner";

function getLocalOwner() {
  try { return localStorage.getItem(LOCAL_OWNER_KEY); } catch (e) { return null; }
}
function setLocalOwner(userId) {
  try {
    if (userId) localStorage.setItem(LOCAL_OWNER_KEY, userId);
    else localStorage.removeItem(LOCAL_OWNER_KEY);
  } catch (e) { /* almacenamiento no disponible */ }
}

function updateVisibilityUI(isPublic) {
  if (!profileVisibilityBtn) return;
  profileVisibilityBtn.dataset.public = isPublic ? "1" : "0";
  profileVisibilityBtn.innerHTML = isPublic
    ? '<i class="fa-solid fa-globe"></i> Estante público'
    : '<i class="fa-solid fa-lock"></i> Estante privado';
  profileVisibilityBtn.title = isPublic
    ? "Cualquiera con tu enlace puede ver tus juegos. Pulsa para hacerlo privado."
    : "Solo tú ves tus juegos. Pulsa para hacerlo público.";
}

if (profileVisibilityBtn) {
  profileVisibilityBtn.addEventListener("click", async () => {
    const makePublic = profileVisibilityBtn.dataset.public !== "1";
    const message = makePublic
      ? "¿Hacer público tu estante?\n\nCualquiera con tu enlace verá tus juegos, notas y horas."
      : "¿Hacer privado tu estante?\n\nLos enlaces que compartiste dejarán de funcionar.";
    if (!confirm(message)) return;
    try {
      await DB.setProfilePublic(makePublic);
      updateVisibilityUI(makePublic);
      showToast(makePublic ? "Tu estante ahora es público." : "Tu estante ahora es privado.");
    } catch (err) {
      showToast("No se pudo cambiar la privacidad: " + err.message, true);
    }
  });
}

if (deleteAccountBtn) {
  deleteAccountBtn.addEventListener("click", async () => {
    const answer = prompt("Esto borra tu cuenta, tu estante, tus comentarios y likes PARA SIEMPRE.\n\nConsejo: exporta una copia antes.\n\nEscribe ELIMINAR para confirmar:");
    if (answer === null) return;
    if (answer.trim().toUpperCase() !== "ELIMINAR") {
      alert("No se eliminó nada.");
      return;
    }
    try {
      await DB.deleteMyAccount();
      StorageManager.clearAll();
      setLocalOwner(null);
      alert("Tu cuenta y todos tus datos fueron eliminados.");
      window.location.href = "index.html";
    } catch (err) {
      showToast("No se pudo eliminar la cuenta: " + err.message, true);
    }
  });
}

/** Limpia la copia local: portadas base64 antiguas, estados o notas inválidos. */
function migrateLocalData() {
  const raw = StorageManager.getGames();
  const cleaned = raw.map(normalizeGame).filter(Boolean);
  if (JSON.stringify(cleaned) !== JSON.stringify(raw)) StorageManager.saveGames(cleaned);
}

/**
 * Carga el estante de la nube.
 * - Si la copia local ya era de este usuario, manda la nube (evita revivir juegos borrados en otro dispositivo).
 * - Si la copia local era de invitado, sus juegos nuevos se suben a la cuenta en vez de perderse.
 */
async function loadCloudShelf(user) {
  let cloudGames;
  try {
    cloudGames = await DB.getCloudGames();
  } catch (err) {
    showToast("No se pudo cargar tu estante de la nube. Mostrando la copia de este navegador.", true);
    return;
  }

  lastCloudLoad = Date.now();
  const local = StorageManager.getGames();
  const localOwner = getLocalOwner();
  let merged = cloudGames;

  if (!localOwner && local.length > 0) {
    const cloudIds = new Set(cloudGames.map(g => g.id));
    const cloudTitles = new Set(cloudGames.map(g => String(g.title).toLowerCase().trim()));
    const guestOnly = local.filter(g => !cloudIds.has(g.id) && !cloudTitles.has(String(g.title).toLowerCase().trim()));

    if (guestOnly.length > 0) {
      const ok = await cloudRun(() => DB.upsertGames(guestOnly), "No se pudieron subir los juegos que añadiste como invitado.");
      if (ok) {
        merged = [...cloudGames, ...guestOnly];
        showToast(`Se añadieron a tu cuenta ${guestOnly.length} juego(s) que tenías como invitado.`);
      } else {
        return; // conservamos la copia local para no perder nada
      }
    }
  }

  StorageManager.saveGames(merged);
  setLocalOwner(user.id);
  renderLibrary();
}

// Al volver a la pestaña se recarga el estante de la nube, por si se editó en otro dispositivo.
let lastCloudLoad = 0;
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || isSpectatorMode || !cloudUserId) return;
  if (Date.now() - lastCloudLoad < 60000) return;
  if (document.querySelector("#formSection:not(.hidden)")) return; // no interrumpir una edición
  loadCloudShelf({ id: cloudUserId });
});

let handledUserId; // undefined = aún no procesado

async function handleSession(user) {
  const userId = user?.id || null;
  if (userId === handledUserId) return; // evita procesar dos veces el mismo evento
  handledUserId = userId;
  cloudUserId = userId;

  if (!user) {
    if (appUserLabel) appUserLabel.innerText = "Invitado";
    if (appUserIcon) appUserIcon.className = "fa-solid fa-user text-indigo-400";
    if (accountControls) accountControls.classList.add("hidden");
    if (appAuthBtn) {
      appAuthBtn.href = "login.html";
      appAuthBtn.onclick = null;
    }
    // Si la copia local era de una cuenta (sesión expirada), no se muestra como invitado
    if (getLocalOwner()) {
      StorageManager.clearAll();
      setLocalOwner(null);
      renderLibrary();
    }
    return;
  }

  const profile = await DB.getMyProfile();
  const alias = profile?.username || user.email.split("@")[0];
  CanvasPoster.usuario = profile?.username || null;
  if (appUserLabel) appUserLabel.innerText = alias;
  if (appUserIcon) appUserIcon.className = "fa-solid fa-cloud text-emerald-400";
  if (accountControls) accountControls.classList.remove("hidden");
  updateVisibilityUI(Boolean(profile?.is_public));

  if (appAuthBtn) {
    appAuthBtn.href = "#";
    appAuthBtn.onclick = async (e) => {
      e.preventDefault();
      if (confirm(`Sesión activa como ${user.email}.\n¿Deseas cerrar sesión?`)) {
        StorageManager.clearAll();
        setLocalOwner(null);
        await DB.signOut();
        window.location.reload();
      }
    };
  }

  await loadCloudShelf(user);
}

async function initDashboard() {
  migrateLocalData();

  // 1. MODO ESPECTADOR (solo lectura)
  if (isSpectatorMode) {
    if (spectatorBanner) spectatorBanner.classList.remove("hidden");
    if (spectatorTargetUser) spectatorTargetUser.innerText = `@${publicProfileTarget}`;
    document.title = `@${publicProfileTarget} · Paindex Vault`;
    CanvasPoster.usuario = String(publicProfileTarget).toLowerCase();
    if (toggleFormBtn) toggleFormBtn.classList.add("hidden");
    if (ownerFooterControls) ownerFooterControls.classList.add("hidden");
    if (shareProfileBtn) shareProfileBtn.classList.add("hidden");

    try {
      const games = window.DB ? await DB.getGamesByUsername(publicProfileTarget) : null;
      spectatorGames = (games || []).map(normalizeGame).filter(Boolean);
    } catch (e) {
      console.warn("Fallo cargando perfil público:", e);
      spectatorGames = [];
    }

    pintarPerfil(spectatorGames);
    renderLibrary();
    return;
  }

  // 2. MODO DUEÑO
  renderLibrary();
  if (!window.supabaseClient) return;

  const { data: { session } } = await supabaseClient.auth.getSession();
  await handleSession(session?.user || null);

  supabaseClient.auth.onAuthStateChange((_event, newSession) => {
    // Se difiere para no llamar a Supabase dentro del propio callback
    setTimeout(() => handleSession(newSession?.user || null), 0);
  });
}

initDashboard();

// Botones de la bienvenida (estante vacío)
if (gamesGrid) {
  gamesGrid.addEventListener("click", (e) => {
    const opcion = e.target.closest("[data-bienvenida]");
    if (!opcion) return;
    const accion = opcion.dataset.bienvenida;
    if (accion === "steam") document.getElementById("openSteamSyncBtn")?.click();
    if (accion === "manual") document.getElementById("toggleFormBtn")?.click();
    if (accion === "demo") document.getElementById("loadDemoBtn")?.click();
  });
}


/** Cabecera del perfil público: cifras, sus mejor puntuados y botones. */
function pintarPerfil(games) {
  const nombre = String(publicProfileTarget || "").trim();
  const avatar = document.getElementById("perfilAvatar");
  if (avatar) avatar.textContent = nombre.charAt(0).toUpperCase() || "?";

  const copiar = document.getElementById("perfilCopiarBtn");
  if (copiar) copiar.addEventListener("click", async () => {
    const url = `${window.location.origin}/u/${encodeURIComponent(nombre.toLowerCase())}`;
    try { await navigator.clipboard.writeText(url); showToast("Enlace copiado."); }
    catch (e) { prompt("Copia el enlace:", url); }
  });

  // Visitante con cuenta: el botón lleva a su propio estante
  if (window.DB) DB.getMyProfile().then(p => {
    const cta = document.getElementById("perfilCtaBtn");
    if (p && cta) cta.textContent = p.username === nombre.toLowerCase() ? "Editar mi estante" : "Ir a mi estante";
    pintarSocial(nombre, p);
  }).catch(() => pintarSocial(nombre, null));

  if (!games.length) return;
  const horas = games.reduce((t, g) => t + (Number(g.hours) || 0), 0);
  const platinos = games.filter(g => g.status === "platinum").length;
  const conNota = games.filter(g => Number(g.rating) > 0);
  const media = conNota.length ? conNota.reduce((t, g) => t + Number(g.rating), 0) / conNota.length : null;
  const fmt = (n) => Number(n).toLocaleString("es");
  document.getElementById("pfJuegos").textContent = fmt(games.length);
  document.getElementById("pfHoras").textContent = fmt(horas);
  document.getElementById("pfPlatinos").textContent = fmt(platinos);
  document.getElementById("pfNota").textContent = media === null ? "–" : media.toFixed(1);
  document.getElementById("perfilCifras").hidden = false;

  const top = [...conNota].sort((a, b) => Number(b.rating) - Number(a.rating) || (Number(b.hours) || 0) - (Number(a.hours) || 0)).slice(0, 5);
  if (top.length >= 3) {
    document.getElementById("perfilTopLista").innerHTML = top.map(g => `
      <li>
        ${coverImg(g, "perfil-top-tapa")}
        <span>${escapeHTML(g.title)}</span>
        <b>${Number(g.rating).toFixed(1)}</b>
      </li>`).join("");
    document.getElementById("perfilTop").hidden = false;
  }
}


/** Seguidores, siguiendo y botón Seguir en el perfil público (migración 006). */
async function pintarSocial(nombre, miPerfil) {
  const resumen = await DB.getResumenSocial(nombre);
  const texto = document.getElementById("perfilSocial");
  const boton = document.getElementById("perfilSeguirBtn");
  if (!resumen || !texto || !boton) return;

  let { seguidores, siguiendo, lo_sigo } = resumen;
  const pintar = () => {
    texto.innerHTML = `<b>${Number(seguidores).toLocaleString("es")}</b> ${Number(seguidores) === 1 ? "seguidor" : "seguidores"} · <b>${Number(siguiendo).toLocaleString("es")}</b> siguiendo`;
    texto.hidden = false;
    boton.textContent = lo_sigo ? "Siguiendo" : "Seguir";
    boton.className = lo_sigo ? "boton boton-siguiendo" : "boton boton-senal";
    boton.setAttribute("aria-pressed", String(Boolean(lo_sigo)));
  };
  pintar();

  const esMio = miPerfil && miPerfil.username === nombre.toLowerCase();
  if (esMio) return;
  boton.hidden = false;
  boton.addEventListener("click", async () => {
    if (!miPerfil) { window.location.href = "/login.html"; return; }
    boton.disabled = true;
    try {
      await DB.seguir(nombre, !lo_sigo);
      lo_sigo = !lo_sigo;
      seguidores = Number(seguidores) + (lo_sigo ? 1 : -1);
      pintar();
    } catch (err) {
      showToast(err.message, true);
    } finally {
      boton.disabled = false;
    }
  });
}
