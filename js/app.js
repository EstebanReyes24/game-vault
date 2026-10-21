/**
 * Controlador Principal - Game Vault Console Edition
 * Soporte para Perfiles Públicos, Crossfade, Barra de Herramientas Mobile y Sincronización Steam Real
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

// Detección de Modo Espectador (?u=gamertag)
const urlParams = new URLSearchParams(window.location.search);
const publicProfileTarget = urlParams.get("u");
const isSpectatorMode = !!publicProfileTarget;
let spectatorGames = [];

// ==========================================
// SANITIZACIÓN DE ENTRADAS (Anti-XSS / Exploit)
// ==========================================
function sanitizeInput(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/<[^>]*>?/gm, '')
    .replace(/[<>]/g, '')
    .trim();
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

// Elementos DOM
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
const toggleFormIcon = document.getElementById("toggleFormIcon");
const toggleFormText = document.getElementById("toggleFormText");

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
    const user = await DB.getUser();
    const alias = user?.user_metadata?.username || user?.email?.split('@')[0] || "player";
    const shareUrl = `${window.location.origin}${window.location.pathname}?u=${encodeURIComponent(alias)}`;

    if (navigator.clipboard) {
      await navigator.clipboard.writeText(shareUrl);
      alert(`¡Enlace copiado al portapapeles!\n\n${shareUrl}\n\nCompártelo para que cualquiera pueda ver tu estante.`);
    } else {
      prompt("Copia tu enlace público:", shareUrl);
    }
  });
}

function toggleForm(open = null) {
  if (isSpectatorMode) return;
  const shouldOpen = open !== null ? open : formSection.classList.contains("hidden");
  SoundFX.playWhoosh();
  if (shouldOpen) {
    formSection.classList.remove("hidden");
    toggleFormIcon.className = "fa-solid fa-chevron-up text-sm";
    toggleFormText.innerText = "CERRAR PANEL";
    formSection.scrollIntoView({ behavior: 'smooth' });
  } else {
    formSection.classList.add("hidden");
    toggleFormIcon.className = "fa-solid fa-plus-circle text-sm";
    toggleFormText.innerText = "REGISTRAR";
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
      btn.className = "status-btn p-2 rounded-xl border border-white/10 bg-[#121623] text-slate-400 text-center font-bold text-xs hover:border-slate-500 transition cursor-pointer";
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
        btn.className = "plat-btn px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-white/10 bg-[#121623] text-slate-300 hover:border-slate-500 transition flex items-center gap-1.5 cursor-pointer";
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
      btn.className = "plat-btn px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-white/10 bg-[#121623] text-slate-300 hover:border-slate-500 transition flex items-center gap-1.5 cursor-pointer";
    }
  });
}

favoriteToggleBtn.addEventListener("click", () => {
  SoundFX.playClick();
  isFavorite = !isFavorite;
  updateFavoriteUI();
});

function updateFavoriteUI() {
  if (isFavorite) {
    favoriteToggleBtn.className = "w-full sm:w-auto px-4 py-2 rounded-xl border border-amber-500 bg-amber-500/20 text-amber-300 shadow-lg shadow-amber-500/20 transition flex items-center justify-center gap-2 text-xs font-bold cursor-pointer";
    favText.innerText = "¡Es Favorito!";
  } else {
    favoriteToggleBtn.className = "w-full sm:w-auto px-4 py-2 rounded-xl border border-white/10 bg-[#121623] text-slate-400 hover:border-amber-500/50 hover:text-amber-400 transition flex items-center justify-center gap-2 text-xs font-bold cursor-pointer";
    favText.innerText = "Marcar Favorito";
  }
}

scoreRange.addEventListener("input", (e) => {
  scoreDisplay.innerText = parseFloat(e.target.value).toFixed(1);
});

manualCoverBtn.addEventListener("click", () => {
  const url = prompt("Pega aquí el enlace de la imagen:");
  if (url && url.trim().startsWith("http")) {
    currentSelectedCover = url.trim();
    coverPreview.src = currentSelectedCover;
    coverPreview.classList.remove("hidden");
    posterIcon.classList.add("hidden");
    coverStatusText.innerText = "Portada manual lista";
  }
});

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
  directLi.innerHTML = `<i class="fa-solid fa-check-circle"></i> Usar "${originalQuery}" directamente`;
  directLi.addEventListener("click", () => {
    SoundFX.playClick();
    gameSearch.value = originalQuery;
    currentSelectedCover = CanvasPoster.generateSmartPoster(originalQuery);
    coverPreview.src = currentSelectedCover;
    coverPreview.classList.remove("hidden");
    posterIcon.classList.add("hidden");
    coverStatusText.innerText = originalQuery;
    searchResults.classList.add("hidden");
  });
  searchResults.appendChild(directLi);

  items.forEach(item => {
    const li = document.createElement("li");
    li.className = "flex items-center gap-3 p-2.5 hover:bg-white/10 cursor-pointer transition";
    const thumb = item.image || CanvasPoster.generateSmartPoster(item.title);
    li.innerHTML = `
      <img src="${thumb}" class="w-10 h-14 object-cover rounded-lg shadow shrink-0 bg-slate-950">
      <div class="overflow-hidden">
        <p class="text-xs font-bold text-white truncate">${item.title}</p>
        <p class="text-[11px] text-slate-400 mt-0.5 truncate">${item.desc}</p>
      </div>
    `;
    li.addEventListener("click", () => {
      SoundFX.playClick();
      gameSearch.value = item.title;
      currentSelectedCover = item.image || CanvasPoster.generateSmartPoster(item.title);
      coverPreview.src = currentSelectedCover;
      coverPreview.classList.remove("hidden");
      posterIcon.classList.add("hidden");
      coverStatusText.innerText = item.title;
      searchResults.classList.add("hidden");
    });
    searchResults.appendChild(li);
  });

  searchResults.classList.remove("hidden");
}

searchBtn.addEventListener("click", onSearchTrigger);
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

document.addEventListener("click", (e) => {
  if (!gameSearch.contains(e.target) && !searchResults.contains(e.target) && !searchBtn.contains(e.target)) {
    searchResults.classList.add("hidden");
  }
});

function resetForm() {
  editingGameId = null;
  formTitle.innerText = "Añadir Título";
  formSubtitle.innerText = "Registra un juego completado, en proceso o en pausa";
  formIconBox.className = "w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30 text-lg";
  formIcon.className = "fa-solid fa-plus";
  saveBtnText.innerText = "Guardar en mi estante";

  gameSearch.value = "";
  currentSelectedCover = "";
  coverPreview.classList.add("hidden");
  posterIcon.classList.remove("hidden");
  coverStatusText.innerText = "Sin carátula (se genera al guardar)";
  setStatus("completed");
  setPlatformBadges(["PC"]);
  isFavorite = false;
  updateFavoriteUI();
  scoreRange.value = 9;
  scoreDisplay.innerText = "9.0";
  gameHours.value = "";
  gameTargetHours.value = "";
  if (gameCompletedYear) gameCompletedYear.value = new Date().getFullYear();
  gameTags.value = "";
  gameNotes.value = "";
}

cancelEditBtn.addEventListener("click", () => toggleForm(false));

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
  currentSelectedCover = game.coverUrl;
  coverPreview.src = game.coverUrl;
  coverPreview.classList.remove("hidden");
  posterIcon.classList.add("hidden");
  coverStatusText.innerText = game.title;

  setStatus(game.status || "completed");
  setPlatformBadges(game.platforms || ["PC"]);
  isFavorite = !!game.favorite;
  updateFavoriteUI();

  scoreRange.value = game.rating || 8;
  scoreDisplay.innerText = (game.rating || 8).toFixed(1);
  gameHours.value = game.hours || "";
  gameTargetHours.value = game.targetHours || "";
  if (gameCompletedYear) gameCompletedYear.value = game.completedYear || new Date().getFullYear();
  gameTags.value = (game.tags || []).join(", ");
  gameNotes.value = game.notes || "";

  toggleForm(true);
}

saveGameBtn.addEventListener("click", () => {
  if (isSpectatorMode) return;
  const title = sanitizeInput(gameSearch.value);
  if (!title) {
    alert("Por favor escribe el nombre del videojuego.");
    gameSearch.focus();
    return;
  }

  const finalCover = currentSelectedCover || CanvasPoster.generateSmartPoster(title);
  const parsedTags = gameTags.value
    .split(",")
    .map(t => sanitizeInput(t))
    .filter(t => t.length > 0)
    .map(t => t.startsWith("#") ? t : "#" + t);

  const parsedYear = gameCompletedYear && gameCompletedYear.value 
    ? parseInt(gameCompletedYear.value, 10) 
    : new Date().getFullYear();

  const gameData = {
    title: title,
    coverUrl: finalCover,
    status: activeStatus,
    platforms: [...activePlatforms],
    rating: parseFloat(scoreRange.value),
    hours: parseInt(gameHours.value, 10) || 0,
    targetHours: parseInt(gameTargetHours.value, 10) || 0,
    completedYear: parsedYear,
    favorite: isFavorite,
    tags: parsedTags,
    notes: sanitizeInput(gameNotes.value)
  };

  if (activeStatus === "platinum") SoundFX.playTrophy();
  else SoundFX.playClick();

  if (editingGameId) {
    StorageManager.updateGame(editingGameId, gameData);
  } else {
    StorageManager.addGame({ id: Date.now(), ...gameData });
  }

  if (window.DB) {
    DB.syncLocalToCloud(StorageManager.getGames());
  }

  renderLibrary();
  resetForm();
  toggleForm(false);
});

function renderTagChips(tags = []) {
  if (!tags || tags.length === 0) return "";
  return tags.map(tag => {
    const t = tag.toLowerCase();
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
    return `<span class="text-[9px] font-extrabold px-2 py-0.5 rounded-md border ${colorClass}">${tag}</span>`;
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
  const matches = query ? lib.filter(g => g.title.toLowerCase().includes(query)) : lib.slice(0, 6);

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
        <img src="${game.coverUrl}" class="w-8 h-10 object-cover rounded bg-slate-900" onerror="this.src='${CanvasPoster.generateSmartPoster(game.title)}'">
        <div>
          <p class="text-xs font-bold text-white console-font">${game.title}</p>
          <p class="text-[10px] text-slate-400">${(game.platforms || []).join(", ")} • ${game.hours || 0}h</p>
        </div>
      </div>
      <span class="text-xs font-black text-amber-400 console-font"><i class="fa-solid fa-star text-[10px]"></i> ${game.rating.toFixed(1)}</span>
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

filterInput.addEventListener("input", () => renderLibrary());
sortBySelect.addEventListener("change", () => {
  SoundFX.playClick();
  renderLibrary();
});

// ==========================================
// CARRUSEL CROSSFADE SUAVE
// ==========================================
function setupNowPlayingCarousel(playingGames) {
  if (nowPlayingInterval) {
    clearInterval(nowPlayingInterval);
    nowPlayingInterval = null;
  }

  if (!playingGames || playingGames.length === 0) {
    npCover.removeAttribute("src");
    npCover.classList.add("hidden");
    if (npPlaceholderIcon) npPlaceholderIcon.classList.remove("hidden");
    if (npCoverBg) npCoverBg.style.backgroundImage = "none";
    npTitle.innerText = "Comienza tu colección";
    npMeta.innerText = "Haz clic en 'Registrar' para comenzar";
    npProgressContainer.classList.add("hidden");
    npActionBtn.onclick = () => toggleForm(true);
    return;
  }

  if (currentPlayingIndex >= playingGames.length) {
    currentPlayingIndex = 0;
  }

  function renderCurrentSlide(index) {
    const game = playingGames[index];
    if (!game) return;

    npCover.style.opacity = "0.2";
    npCover.style.transform = "scale(0.96)";
    npTitle.style.opacity = "0.2";
    npMeta.style.opacity = "0.2";
    if (npCoverBg) npCoverBg.style.opacity = "0.15";

    setTimeout(() => {
      npCover.src = game.coverUrl;
      npCover.classList.remove("hidden");
      if (npPlaceholderIcon) npPlaceholderIcon.classList.add("hidden");

      if (npCoverBg) {
        npCoverBg.style.backgroundImage = `url('${game.coverUrl}')`;
      }

      npTitle.innerText = game.title;
      const countLabel = playingGames.length > 1 ? ` • (${index + 1}/${playingGames.length})` : "";
      npMeta.innerText = `${(game.platforms || []).join(", ")} • ${game.hours || 0} hrs dedicadas${countLabel}`;

      if (isSpectatorMode) {
        npActionBtn.classList.add("hidden");
      } else {
        npActionBtn.classList.remove("hidden");
        npActionBtn.onclick = () => startEditGame(game);
      }

      if (game.targetHours && game.targetHours > 0) {
        const pct = Math.min(100, Math.round((game.hours / game.targetHours) * 100));
        npProgressText.innerText = `${pct}% (${game.hours}h / ${game.targetHours}h)`;
        npProgressBar.style.width = `${pct}%`;
        npProgressContainer.classList.remove("hidden");
      } else {
        npProgressContainer.classList.add("hidden");
      }

      npCover.style.opacity = "1";
      npCover.style.transform = "scale(1)";
      npTitle.style.opacity = "1";
      npMeta.style.opacity = "1";
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

function renderLibrary() {
  const lib = getCurrentDataset();
  const term = filterInput.value.toLowerCase().trim();
  const sortBy = sortBySelect.value;

  const playingGames = lib.filter(g => g.status === 'playing');
  const completedCount = lib.filter(g => g.status === 'completed' || g.status === 'extras' || g.status === 'platinum').length;
  const platinumCount = lib.filter(g => g.status === 'platinum').length;
  const totalHours = lib.reduce((acc, g) => acc + (g.hours || 0), 0);

  document.getElementById("statPlaying").innerText = playingGames.length;
  document.getElementById("statCompleted").innerText = completedCount;
  document.getElementById("statPlatinum").innerText = platinumCount;
  document.getElementById("statHours").innerText = totalHours > 0 ? `${totalHours}h` : "0h";

  if (lib.length > 0) {
    const avg = lib.reduce((acc, g) => acc + g.rating, 0) / lib.length;
    document.getElementById("statAvg").innerText = avg.toFixed(1);
  } else {
    document.getElementById("statAvg").innerText = "0.0";
  }

  setupNowPlayingCarousel(playingGames);

  let filtered = [...lib];

  if (currentFilter !== "all") {
    if (currentFilter === "favorite") {
      filtered = filtered.filter(g => g.favorite);
    } else if (currentFilter === "completed") {
      filtered = filtered.filter(g => g.status === 'completed' || g.status === 'extras' || g.status === 'platinum');
    } else if (currentFilter === "tier-masterpiece") {
      filtered = filtered.filter(g => g.rating >= 9.0);
    } else {
      filtered = filtered.filter(g => g.status === currentFilter);
    }
  }

  if (currentPlatformFilter !== "all") {
    filtered = filtered.filter(g => (g.platforms || []).includes(currentPlatformFilter));
  }

  if (term) {
    filtered = filtered.filter(g => 
      g.title.toLowerCase().includes(term) || 
      (g.platforms && g.platforms.some(p => p.toLowerCase().includes(term))) ||
      (g.tags && g.tags.some(t => t.toLowerCase().includes(term)))
    );
  }

  if (sortBy === 'rating-desc') {
    filtered.sort((a, b) => b.rating - a.rating);
  } else if (sortBy === 'rating-asc') {
    filtered.sort((a, b) => a.rating - b.rating);
  } else if (sortBy === 'hours-desc') {
    filtered.sort((a, b) => (b.hours || 0) - (a.hours || 0));
  } else if (sortBy === 'title-asc') {
    filtered.sort((a, b) => a.title.localeCompare(b.title));
  } else {
    filtered.sort((a, b) => b.id - a.id);
  }

  gamesGrid.innerHTML = "";

  if (filtered.length === 0) {
    gamesGrid.className = "block";
    gamesGrid.innerHTML = `
      <div class="py-20 text-center glass-panel rounded-3xl border border-white/10">
        <i class="fa-solid fa-gamepad text-5xl text-slate-600 mb-3 block"></i>
        <p class="text-sm font-bold text-slate-400 console-font">No se encontraron títulos en esta categoría.</p>
      </div>
    `;
    return;
  }

  if (currentViewMode === "grid") {
    gamesGrid.className = "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-6 perspective-container";
    
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

      const hoursDisplay = game.hours ? `<span class="text-[10px] text-slate-300 font-bold bg-black/70 px-1.5 py-0.5 rounded border border-white/10"><i class="fa-regular fa-clock mr-1 text-slate-400"></i>${game.hours}h</span>` : '';

      let progressMini = "";
      if (game.targetHours && game.targetHours > 0) {
        const p = Math.min(100, Math.round((game.hours / game.targetHours) * 100));
        progressMini = `
          <div class="w-full bg-black/50 h-1 rounded-full overflow-hidden mt-1 border border-white/5">
            <div class="bg-gradient-to-r from-orange-400 to-amber-300 h-full" style="width: ${p}%"></div>
          </div>
        `;
      }

      const notesBlock = game.notes ? `
        <p class="text-[11px] text-slate-300 line-clamp-2 italic console-input p-2 rounded-lg border border-white/5 leading-snug">"${game.notes}"</p>
      ` : '';

      card.innerHTML = `
        <div class="relative aspect-[3/4] overflow-hidden bg-slate-950 poster-sheen">
          <img src="${game.coverUrl}" alt="${game.title}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" onerror="this.src='${CanvasPoster.generateSmartPoster(game.title)}'">
          
          <div class="absolute top-2.5 left-2.5 z-10 flex items-center gap-1.5">
            ${badgeHtml}
            ${favBadge}
          </div>

          <div class="absolute top-2.5 right-2.5 z-10 bg-black/85 backdrop-blur-md px-2 py-0.5 rounded-lg border border-white/15 text-amber-400 font-black text-xs flex items-center gap-1 shadow-lg console-font">
            <i class="fa-solid fa-star text-[10px]"></i> ${game.rating.toFixed(1)}
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
            <h3 class="font-bold text-xs sm:text-sm text-slate-100 line-clamp-1 group-hover:text-indigo-400 transition console-font" title="${game.title}">${game.title}</h3>
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
          <img src="${game.coverUrl}" class="w-12 h-16 object-cover rounded-xl bg-slate-950 shrink-0 border border-white/10" onerror="this.src='${CanvasPoster.generateSmartPoster(game.title)}'">
          <div class="overflow-hidden">
            <div class="flex items-center gap-2">
              <h3 class="font-black text-sm text-white console-font truncate">${game.title}</h3>
              ${game.favorite ? '<i class="fa-solid fa-crown text-amber-400 text-xs"></i>' : ''}
            </div>
            <div class="flex items-center gap-2 mt-1 text-xs text-slate-400">
              <span>${platformIcons}</span>
              <span>•</span>
              <span>${game.hours || 0} hrs</span>
              ${game.targetHours ? `<span>• Meta: ${game.targetHours}h</span>` : ''}
            </div>
          </div>
        </div>

        <div class="flex items-center gap-4 shrink-0">
          <span class="text-sm font-black text-amber-400 console-font flex items-center gap-1">
            <i class="fa-solid fa-star text-xs"></i> ${game.rating.toFixed(1)}
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
  modalCover.src = game.coverUrl;
  modalCoverThumb.src = game.coverUrl;
  modalTitle.innerText = game.title;
  modalRating.innerText = game.rating.toFixed(1);
  modalReview.innerText = game.notes || "Sin reseña escrita.";

  let statusBadge = game.status === 'playing' ? '🔥 Jugando actualmente' : 
                    (game.status === 'platinum' ? '🏆 Platinado / 100%' : 
                    (game.status === 'extras' ? '⭐ Campaña + Extras' : 
                    (game.status === 'onhold' ? '⏸️ En Pausa' : '✅ Historia Principal')));

  modalBadges.innerHTML = `
    <span class="px-2 py-0.5 bg-indigo-500/20 text-indigo-300 rounded text-[11px] border border-indigo-500/30">${statusBadge}</span>
    <span class="px-2 py-0.5 bg-slate-800 text-slate-300 rounded text-[11px]">${(game.platforms || []).join(", ")}</span>
    ${game.hours ? `<span class="px-2 py-0.5 bg-slate-800 text-slate-300 rounded text-[11px]"><i class="fa-regular fa-clock mr-1"></i>${game.hours}h</span>` : ''}
    ${game.completedYear ? `<span class="px-2 py-0.5 bg-slate-800 text-slate-300 rounded text-[11px]"><i class="fa-regular fa-calendar mr-1"></i>${game.completedYear}</span>` : ''}
    ${game.targetHours ? `<span class="px-2 py-0.5 bg-orange-500/20 text-orange-300 rounded text-[11px]">Meta: ${game.targetHours}h</span>` : ''}
  `;

  modalTagsContainer.innerHTML = renderTagChips(game.tags || []);

  if (isSpectatorMode) {
    modalEditBtn.classList.add("hidden");
    modalDeleteBtn.classList.add("hidden");
  } else {
    modalEditBtn.classList.remove("hidden");
    modalDeleteBtn.classList.remove("hidden");
  }

  detailModal.classList.remove("hidden");
}

if (closeModalBtn) closeModalBtn.addEventListener("click", () => detailModal.classList.add("hidden"));
if (detailModal) {
  detailModal.addEventListener("click", (e) => {
    if (e.target === detailModal) detailModal.classList.add("hidden");
  });
}

if (modalEditBtn) {
  modalEditBtn.addEventListener("click", () => {
    const lib = getCurrentDataset();
    const target = lib.find(g => g.id === activeModalGameId);
    if (target) {
      detailModal.classList.add("hidden");
      startEditGame(target);
    }
  });
}

if (modalDeleteBtn) {
  modalDeleteBtn.addEventListener("click", () => {
    if (confirm("¿Seguro que deseas eliminar este juego de tu colección?")) {
      StorageManager.deleteGame(activeModalGameId);
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
    const link = document.createElement("a");
    link.download = `game_card_${activeModalGameId}.png`;
    link.href = shareCardCanvas.toDataURL("image/png");
    link.click();
  });
}

// Player Wrapped
const wrappedModal = document.getElementById("wrappedModal");
const openWrappedBtn = document.getElementById("openWrappedBtn");
const closeWrappedBtn = document.getElementById("closeWrappedBtn");
const wrappedYearSelect = document.getElementById("wrappedYearSelect");
const wrappedPeriodLabel = document.getElementById("wrappedPeriodLabel");

function updateWrappedUI(selectedYear) {
  const lib = getCurrentDataset();
  if (lib.length === 0) return;

  let games = [...lib];
  if (selectedYear !== "all") {
    const y = parseInt(selectedYear, 10);
    games = lib.filter(g => (g.completedYear || new Date(g.id).getFullYear()) === y);
    wrappedPeriodLabel.innerText = `Tiempo Jugado en ${selectedYear}`;
  } else {
    wrappedPeriodLabel.innerText = "Tiempo Jugado Histórico";
  }

  if (games.length === 0) {
    document.getElementById("wrappedHours").innerText = "0 Horas";
    document.getElementById("wrappedTopGame").innerText = "Sin registros";
    document.getElementById("wrappedTopGameScore").innerText = "★ 0.0";
    document.getElementById("wrappedMostPlayed").innerText = "Sin registros";
    document.getElementById("wrappedMostPlayedHours").innerText = "0 hrs";
    document.getElementById("wrappedTopTags").innerHTML = "";
    return;
  }

  const totalHours = games.reduce((acc, g) => acc + (g.hours || 0), 0);
  document.getElementById("wrappedHours").innerText = `${totalHours} Horas`;

  const topRated = [...games].sort((a, b) => b.rating - a.rating)[0];
  document.getElementById("wrappedTopGame").innerText = topRated.title;
  document.getElementById("wrappedTopGameScore").innerText = `★ ${topRated.rating.toFixed(1)} / 10`;

  const mostPlayed = [...games].sort((a, b) => (b.hours || 0) - (a.hours || 0))[0];
  document.getElementById("wrappedMostPlayed").innerText = mostPlayed.title;
  document.getElementById("wrappedMostPlayedHours").innerText = `${mostPlayed.hours || 0} hrs dedicadas`;

  const tagCounts = {};
  games.forEach(g => {
    (g.tags || []).forEach(t => {
      tagCounts[t] = (tagCounts[t] || 0) + 1;
    });
  });
  const sortedTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(i => i[0]);
  document.getElementById("wrappedTopTags").innerHTML = renderTagChips(sortedTags);
}

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
  const topList = [...lib].sort((a, b) => b.rating - a.rating).slice(0, count);
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
    const link = document.createElement("a");
    link.download = `my_top_${count}_games.png`;
    link.href = top5Canvas.toDataURL("image/png");
    link.click();
  });
}

// Estadísticas Modal
const statsModal = document.getElementById("statsModal");
const openStatsBtn = document.getElementById("openStatsBtn");
const closeStatsModalBtn = document.getElementById("closeStatsModalBtn");

if (openStatsBtn) {
  openStatsBtn.addEventListener("click", () => {
    SoundFX.playWhoosh();
    const lib = getCurrentDataset();
    if (lib.length === 0) {
      alert("No hay registros en la biblioteca.");
      return;
    }

    const completed = lib.filter(g => ['completed', 'extras', 'platinum'].includes(g.status)).length;
    const rate = Math.round((completed / lib.length) * 100);
    document.getElementById("statCompletionRate").innerText = `${rate}%`;

    const gamesWithHours = lib.filter(g => g.hours && g.hours > 0);
    const avgHours = gamesWithHours.length ? Math.round(gamesWithHours.reduce((acc, g) => acc + g.hours, 0) / gamesWithHours.length) : 0;
    document.getElementById("statAvgHours").innerText = `${avgHours}h`;

    const masters = lib.filter(g => g.rating >= 9).length;
    document.getElementById("statMasterpieces").innerText = masters;

    const platCounts = {};
    lib.forEach(g => {
      (g.platforms || []).forEach(p => {
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
    document.getElementById("statTopPlatform").innerText = topPlat;

    const playing = lib.filter(g => g.status === 'playing').length;
    const onhold = lib.filter(g => g.status === 'onhold').length;

    const pPlaying = (playing / lib.length) * 100;
    const pCompleted = (completed / lib.length) * 100;
    const pOnhold = (onhold / lib.length) * 100;

    const statusBar = document.getElementById("statusBarBreakdown");
    statusBar.innerHTML = `
      <div style="width: ${pCompleted}%" class="bg-emerald-500 h-full" title="Completados"></div>
      <div style="width: ${pPlaying}%" class="bg-orange-500 h-full" title="Jugando"></div>
      <div style="width: ${pOnhold}%" class="bg-yellow-500 h-full" title="En Pausa"></div>
    `;

    document.getElementById("statusBarLegend").innerHTML = `
      <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> ${completed} Pasados</span>
      <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-orange-500"></span> ${playing} Jugando</span>
      <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-yellow-500"></span> ${onhold} En Pausa</span>
    `;

    const platList = document.getElementById("platformBreakdownList");
    platList.innerHTML = Object.entries(platCounts).map(([plat, count]) => {
      const perc = Math.round((count / lib.length) * 100);
      return `
        <div class="flex items-center justify-between text-xs">
          <span class="text-slate-300 font-semibold">${plat}</span>
          <div class="flex items-center gap-2">
            <div class="w-28 bg-slate-800 h-2 rounded-full overflow-hidden">
              <div class="bg-indigo-500 h-full" style="width: ${perc}%"></div>
            </div>
            <span class="text-slate-400 font-bold w-6 text-right">${count}</span>
          </div>
        </div>
      `;
    }).join("");

    statsModal.classList.remove("hidden");
  });
}

if (closeStatsModalBtn) closeStatsModalBtn.addEventListener("click", () => statsModal.classList.add("hidden"));

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
  if (isSpectatorMode) return;
  document.getElementById("fileInput").click();
});

document.getElementById("fileInput")?.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const parsed = JSON.parse(event.target.result);
      if (Array.isArray(parsed)) {
        StorageManager.saveGames(parsed);
        renderLibrary();
        SoundFX.playTrophy();
        alert("¡Colección restaurada con éxito!");
      }
    } catch(err) {
      alert("El archivo subido no es válido.");
    }
  };
  reader.readAsText(file);
});

// ==========================================
// INTEGRACIÓN & SINCRONIZACIÓN STEAM
// ==========================================
const openSteamSyncBtn = document.getElementById("openSteamSyncBtn");
const steamModal = document.getElementById("steamModal");
const closeSteamModalBtn = document.getElementById("closeSteamModalBtn");
const fetchSteamBtn = document.getElementById("fetchSteamBtn");
const fetchSteamIcon = document.getElementById("fetchSteamIcon");
const fetchSteamText = document.getElementById("fetchSteamText");
const steamIdInput = document.getElementById("steamIdInput");
const steamPreviewContainer = document.getElementById("steamPreviewContainer");
const steamFoundCount = document.getElementById("steamFoundCount");
const steamGamesList = document.getElementById("steamGamesList");
const confirmImportSteamBtn = document.getElementById("confirmImportSteamBtn");
const selectAllSteamBtn = document.getElementById("selectAllSteamBtn");

let fetchedSteamGames = [];

if (openSteamSyncBtn) openSteamSyncBtn.addEventListener("click", () => steamModal.classList.remove("hidden"));
if (closeSteamModalBtn) closeSteamModalBtn.addEventListener("click", () => steamModal.classList.add("hidden"));

if (selectAllSteamBtn) {
  selectAllSteamBtn.addEventListener("click", () => {
    const checkboxes = steamGamesList.querySelectorAll("input[type='checkbox']");
    const anyUnchecked = Array.from(checkboxes).some(c => !c.checked);
    checkboxes.forEach(c => c.checked = anyUnchecked);
    selectAllSteamBtn.innerText = anyUnchecked ? "Desmarcar todos" : "Marcar todos";
  });
}

if (fetchSteamBtn) {
  fetchSteamBtn.addEventListener("click", async () => {
    const rawInput = steamIdInput.value.trim();
    if (!rawInput) {
      alert("Por favor introduce tu Steam ID (ej: 76561198389070811).");
      steamIdInput.focus();
      return;
    }

    fetchSteamBtn.disabled = true;
    fetchSteamIcon.className = "fa-solid fa-spinner fa-spin";
    fetchSteamText.innerText = "Consultando...";

    try {
      let steamId = rawInput;
      if (steamId.includes("/profiles/")) {
        steamId = steamId.split("/profiles/")[1].replace(/\//g, "");
      } else if (steamId.includes("/id/")) {
        steamId = steamId.split("/id/")[1].replace(/\//g, "");
      }

      // Validar que sean 17 dígitos numéricos
      if (!/^\d{17}$/.test(steamId)) {
        throw new Error("Por favor usa tu SteamID64 numérico de 17 dígitos (ej: 76561198389070811). Puedes verificarlo en steamid.io");
      }

      let parsedData = null;

      // 1. Intento principal: Serverless Function de Vercel (/api/steam)
      try {
        const response = await fetch(`/api/steam?steamid=${steamId}`);
        if (response.ok) {
          parsedData = await response.json();
        }
      } catch (errLocal) {
        console.warn("Fallo en endpoint /api/steam, probando fallback...");
      }

      // 2. Fallback en caso de entorno local sin función serverless
      if (!parsedData || !parsedData.response) {
        const targetSteamUrl = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=D47B3E25DE187514E2976D49BC94E782&steamid=${steamId}&include_appinfo=true&include_played_free_games=true&format=json`;
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetSteamUrl)}`;
        const res = await fetch(proxyUrl);
        const json = await res.json();
        
        if (json && json.contents) {
          // Si devuelve HTML es porque Steam o el proxy bloquearon
          if (json.contents.trim().startsWith("<")) {
            throw new Error("Steam bloqueó la petición temporalmente. Asegúrate de haber subido la carpeta /api a Vercel.");
          }
          parsedData = JSON.parse(json.contents);
        }
      }

      if (!parsedData || !parsedData.response || !parsedData.response.games) {
        throw new Error("Steam no devolvió juegos. Confirma en Privacidad de Steam que 'Detalles de los juegos' esté en 'Público' y desmarca 'Ocultar tiempo total de juego'.");
      }

      const rawGames = parsedData.response.games;
      fetchedSteamGames = rawGames
        .filter(g => (g.playtime_forever || 0) >= 30) // Juegos con más de 30 min
        .sort((a, b) => b.playtime_forever - a.playtime_forever)
        .map(g => {
          const hours = Math.round(g.playtime_forever / 60);
          return {
            appId: g.appid,
            title: g.name,
            hours: hours,
            coverUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/library_600x900.jpg`,
            status: hours > 40 ? 'completed' : 'playing'
          };
        });

      if (fetchedSteamGames.length === 0) {
        alert("Tu perfil es público, pero no se encontraron juegos con tiempo acumulado.");
        return;
      }

      steamFoundCount.innerText = `${fetchedSteamGames.length} juegos listos para importar`;
      steamGamesList.innerHTML = fetchedSteamGames.map((g, idx) => `
        <label class="flex items-center justify-between p-2 rounded-xl hover:bg-white/10 cursor-pointer transition">
          <div class="flex items-center gap-3">
            <input type="checkbox" data-index="${idx}" checked class="rounded border-white/20 accent-blue-500 h-4 w-4">
            <img src="${g.coverUrl}" class="w-8 h-11 object-cover rounded bg-slate-950 shrink-0" onerror="this.src='https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appId}/header.jpg'">
            <div>
              <p class="text-xs font-bold text-white line-clamp-1">${g.title}</p>
              <p class="text-[10px] text-slate-400">${g.hours} horas registradas en Steam</p>
            </div>
          </div>
        </label>
      `).join("");

      steamPreviewContainer.classList.remove("hidden");
    } catch (err) {
      alert("Error al conectar con Steam: " + err.message);
    } finally {
      fetchSteamBtn.disabled = false;
      fetchSteamIcon.className = "fa-solid fa-cloud-arrow-down";
      fetchSteamText.innerText = "Consultar";
    }
  });
}

if (confirmImportSteamBtn) {
  confirmImportSteamBtn.addEventListener("click", () => {
    const checkboxes = steamGamesList.querySelectorAll("input[type='checkbox']:checked");
    if (checkboxes.length === 0) {
      alert("Selecciona al menos un juego para importar.");
      return;
    }

    const currentGames = StorageManager.getGames();
    const existingTitles = new Set(currentGames.map(g => g.title.toLowerCase().trim()));
    const toImport = [];

    checkboxes.forEach(cb => {
      const idx = parseInt(cb.dataset.index, 10);
      const g = fetchedSteamGames[idx];
      if (g && !existingTitles.has(g.title.toLowerCase().trim())) {
        toImport.push({
          id: Date.now() + Math.floor(Math.random() * 100000),
          title: g.title,
          coverUrl: g.coverUrl,
          status: g.status,
          platforms: ["PC"],
          rating: 8.5,
          hours: g.hours,
          targetHours: 0,
          completedYear: new Date().getFullYear(),
          favorite: false,
          tags: ["#Steam"],
          notes: "Importado automáticamente desde Steam."
        });
      }
    });

    if (toImport.length === 0) {
      alert("Los juegos seleccionados ya estaban previamente en tu estante.");
      steamModal.classList.add("hidden");
      return;
    }

    StorageManager.saveGames([...currentGames, ...toImport]);
    if (window.DB) {
      DB.syncLocalToCloud(StorageManager.getGames());
    }

    renderLibrary();
    SoundFX.playTrophy();
    steamModal.classList.add("hidden");
    alert(`¡Se han importado ${toImport.length} títulos desde Steam con éxito!`);
  });
}

// Demo & Clear
document.getElementById("loadDemoBtn")?.addEventListener("click", () => {
  if (isSpectatorMode) return;
  SoundFX.playTrophy();
  const currentYear = new Date().getFullYear();
  const demoGames = [
    {
      id: Date.now() - 10000,
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
      id: Date.now() - 20000,
      title: "Cyberpunk 2077",
      coverUrl: "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=400&q=80",
      status: "playing",
      platforms: ["PC"],
      rating: 9.5,
      hours: 68,
      targetHours: 90,
      completedYear: currentYear,
      favorite: true,
      tags: ["#RPG", "#SciFi", "#Shooter"],
      notes: "Night City tiene una de las ambientaciones más densas de la industria."
    }
  ];

  StorageManager.saveGames(demoGames);
  renderLibrary();
});

document.getElementById("clearAllBtn")?.addEventListener("click", () => {
  if (isSpectatorMode) return;
  if (confirm("¿Seguro que deseas vaciar tu estante?")) {
    StorageManager.clearAll();
    renderLibrary();
    resetForm();
  }
});

// Theme
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

// Sesión & Arranque
const appAuthBtn = document.getElementById("appAuthBtn");
const appUserLabel = document.getElementById("appUserLabel");
const appUserIcon = document.getElementById("appUserIcon");

async function initDashboard() {
  if (isSpectatorMode) {
    spectatorBanner.classList.remove("hidden");
    spectatorTargetUser.innerText = `@${publicProfileTarget}`;
    toggleFormBtn?.classList.add("hidden");
    ownerFooterControls?.classList.add("hidden");
    if (shareProfileBtn) shareProfileBtn.classList.add("hidden");

    try {
      const cloudGames = await DB.getGamesByUsername(publicProfileTarget);
      spectatorGames = (cloudGames || []).map(cg => ({
        id: cg.id,
        title: cg.title,
        coverUrl: cg.cover_url,
        status: cg.status,
        platforms: cg.platforms || ["PC"],
        rating: parseFloat(cg.rating),
        hours: cg.hours || 0,
        targetHours: cg.target_hours || 0,
        completedYear: cg.completed_year || new Date().getFullYear(),
        favorite: !!cg.favorite,
        tags: cg.tags || [],
        notes: cg.notes || ""
      }));
    } catch (e) {
      console.warn("Fallo cargando perfil público:", e);
    }

    renderLibrary();
    return;
  }

  renderLibrary();

  if (!window.supabaseClient) return;

  async function syncUserSession(user) {
    if (user) {
      const alias = user.user_metadata?.username || user.email.split('@')[0];
      if (appUserLabel) appUserLabel.innerText = alias;
      if (appUserIcon) appUserIcon.className = "fa-solid fa-cloud-check text-emerald-400";
      
      if (appAuthBtn) {
        appAuthBtn.href = "javascript:void(0)";
        appAuthBtn.onclick = async () => {
          if (confirm(`Sesión activa como ${user.email}.\n¿Deseas cerrar sesión?`)) {
            await DB.signOut();
            window.location.reload();
          }
        };
      }

      try {
        const cloudGames = await DB.getCloudGames();
        if (cloudGames && cloudGames.length > 0) {
          const local = StorageManager.getGames();
          const localIds = new Set(local.map(g => g.id));
          
          const mappedCloud = cloudGames.map(cg => ({
            id: cg.id,
            title: cg.title,
            coverUrl: cg.cover_url,
            status: cg.status,
            platforms: cg.platforms || ["PC"],
            rating: parseFloat(cg.rating),
            hours: cg.hours || 0,
            targetHours: cg.target_hours || 0,
            completedYear: cg.completed_year || new Date().getFullYear(),
            favorite: !!cg.favorite,
            tags: cg.tags || [],
            notes: cg.notes || ""
          }));

          const missing = mappedCloud.filter(g => !localIds.has(g.id));
          if (missing.length > 0) {
            StorageManager.saveGames([...local, ...missing]);
            renderLibrary();
          }
        }
      } catch (e) {
        console.warn("Error sincronizando catálogo:", e);
      }
    } else {
      if (appUserLabel) appUserLabel.innerText = "Invitado";
      if (appUserIcon) appUserIcon.className = "fa-solid fa-user text-indigo-400";
      if (appAuthBtn) {
        appAuthBtn.href = "login.html";
        appAuthBtn.onclick = null;
      }
    }
  }

  const { data: { session } } = await supabaseClient.auth.getSession();
  syncUserSession(session?.user || null);

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    syncUserSession(session?.user || null);
  });
}
// ==========================================
// FUNCIÓN GLOBAL DIRECTA PARA STEAM (A PRUEBA DE FALLOS)
// ==========================================
window.ejecutarConsultaSteam = async function() {
  const inputEl = document.getElementById("steamIdInput");
  const btnEl = document.getElementById("fetchSteamBtn");
  const iconEl = document.getElementById("fetchSteamIcon");
  const textEl = document.getElementById("fetchSteamText");
  const previewContainer = document.getElementById("steamPreviewContainer");
  const countEl = document.getElementById("steamFoundCount");
  const listEl = document.getElementById("steamGamesList");

  const rawInput = inputEl ? inputEl.value.trim() : "";
  if (!rawInput) {
    alert("Por favor escribe tu SteamID64 (ej: 76561198389070811).");
    if (inputEl) inputEl.focus();
    return;
  }

  // Extraer ID si pegan URL completa
  let steamId = rawInput;
  if (steamId.includes("/profiles/")) {
    steamId = steamId.split("/profiles/")[1].replace(/\//g, "");
  } else if (steamId.includes("/id/")) {
    steamId = steamId.split("/id/")[1].replace(/\//g, "");
  }

  if (btnEl) btnEl.disabled = true;
  if (iconEl) iconEl.className = "fa-solid fa-spinner fa-spin";
  if (textEl) textEl.innerText = "Consultando...";

  try {
    let rawGames = null;

    // Intento 1: Servidor propio en Vercel
    try {
      const resVercel = await fetch(`/api/steam?steamid=${steamId}`);
      if (resVercel.ok) {
        const dataVercel = await resVercel.json();
        if (dataVercel?.response?.games) {
          rawGames = dataVercel.response.games;
        }
      }
    } catch (e1) {
      console.warn("No respondió /api/steam, probando proxy directo...", e1);
    }

    // Intento 2: Proxy alternativo directo si falla Vercel
    if (!rawGames) {
      const steamUrl = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=D47B3E25DE187514E2976D49BC94E782&steamid=${steamId}&include_appinfo=true&include_played_free_games=true&format=json`;
      const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(steamUrl)}`;
      
      const resProxy = await fetch(proxyUrl);
      const resText = await resProxy.text();

      if (resText.trim().startsWith("<")) {
        throw new Error("Steam bloqueó la petición temporal. Asegúrate de que la carpeta /api esté subida a Vercel.");
      }

      const parsed = JSON.parse(resText);
      if (parsed?.response?.games) {
        rawGames = parsed.response.games;
      }
    }

    if (!rawGames || rawGames.length === 0) {
      throw new Error("Steam respondió pero no devolvió juegos. Verifica que en Steam > Privacidad: 'Detalles de los juegos' esté en PÚBLICO y desmarques 'Ocultar tiempo de juego'.");
    }

    // Procesar lista de juegos
    window.fetchedSteamGames = rawGames
      .filter(g => (g.playtime_forever || 0) >= 30) // más de 30 mins
      .sort((a, b) => b.playtime_forever - a.playtime_forever)
      .map(g => {
        const hours = Math.round(g.playtime_forever / 60);
        return {
          appId: g.appid,
          title: g.name,
          hours: hours,
          coverUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appid}/library_600x900.jpg`,
          status: hours > 40 ? 'completed' : 'playing'
        };
      });

    if (window.fetchedSteamGames.length === 0) {
      alert("Tu perfil es público pero no se detectaron juegos con más de media hora jugada.");
      return;
    }

    if (countEl) countEl.innerText = `${window.fetchedSteamGames.length} juegos listos para importar`;
    if (listEl) {
      listEl.innerHTML = window.fetchedSteamGames.map((g, idx) => `
        <label class="flex items-center justify-between p-2 rounded-xl hover:bg-white/10 cursor-pointer transition">
          <div class="flex items-center gap-3">
            <input type="checkbox" data-index="${idx}" checked class="rounded border-white/20 accent-blue-500 h-4 w-4">
            <img src="${g.coverUrl}" class="w-8 h-11 object-cover rounded bg-slate-950 shrink-0" onerror="this.src='https://cdn.cloudflare.steamstatic.com/steam/apps/${g.appId}/header.jpg'">
            <div>
              <p class="text-xs font-bold text-white line-clamp-1">${g.title}</p>
              <p class="text-[10px] text-slate-400">${g.hours} horas registradas en Steam</p>
            </div>
          </div>
        </label>
      `).join("");
    }

    if (previewContainer) previewContainer.classList.remove("hidden");

  } catch (err) {
    alert("Resultado de la consulta:\n" + err.message);
  } finally {
    if (btnEl) btnEl.disabled = false;
    if (iconEl) iconEl.className = "fa-solid fa-cloud-arrow-down";
    if (textEl) textEl.innerText = "Consultar";
  }
};

initDashboard();
