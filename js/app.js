/**
 * Controlador Principal - Game Vault Console Edition
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
const isSpectatorMode = Boolean(publicProfileTarget && publicProfileTarget.trim().length > 0);
let spectatorGames = [];

function sanitizeInput(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/<[^>]*>?/gm, '').replace(/[<>]/g, '').trim();
}

// Audio Sintético
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

// Referencias UI
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

const formSection = document.getElementById("formSection");
const toggleFormBtn = document.getElementById("toggleFormBtn");
const toggleFormIcon = document.getElementById("toggleFormIcon");
const toggleFormText = document.getElementById("toggleFormText");

const npCover = document.getElementById("npCover");
const npPlaceholderIcon = document.getElementById("npPlaceholderIcon");
const npCoverBg = document.getElementById("npCoverBg");
const npTitle = document.getElementById("npTitle");
const npMeta = document.getElementById("npMeta");
const npActionBtn = document.getElementById("npActionBtn");
const npProgressContainer = document.getElementById("npProgressContainer");
const npProgressText = document.getElementById("npProgressText");
const npProgressBar = document.getElementById("npProgressBar");

function toggleForm(open = null) {
  if (isSpectatorMode || !formSection) return;
  const shouldOpen = open !== null ? open : formSection.classList.contains("hidden");
  SoundFX.playWhoosh();
  if (shouldOpen) {
    formSection.classList.remove("hidden");
    if (toggleFormIcon) toggleFormIcon.className = "fa-solid fa-chevron-up text-sm";
    if (toggleFormText) toggleFormText.innerText = "CERRAR PANEL";
    formSection.scrollIntoView({ behavior: 'smooth' });
  } else {
    formSection.classList.add("hidden");
    if (toggleFormIcon) toggleFormIcon.className = "fa-solid fa-plus-circle text-sm";
    if (toggleFormText) toggleFormText.innerText = "REGISTRAR";
  }
}

if (toggleFormBtn) toggleFormBtn.addEventListener("click", () => toggleForm());

// Estados y Plataformas
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

if (scoreRange) {
  scoreRange.addEventListener("input", (e) => {
    if (scoreDisplay) scoreDisplay.innerText = parseFloat(e.target.value).toFixed(1);
  });
}

function getCurrentDataset() {
  return isSpectatorMode ? spectatorGames : (window.StorageManager ? StorageManager.getGames() : []);
}

// Now Playing
function setupNowPlaying(playingGames) {
  if (nowPlayingInterval) clearInterval(nowPlayingInterval);

  if (!playingGames || playingGames.length === 0) {
    if (npCover) {
      npCover.removeAttribute("src");
      npCover.classList.add("hidden");
    }
    if (npPlaceholderIcon) npPlaceholderIcon.classList.remove("hidden");
    if (npCoverBg) npCoverBg.style.backgroundImage = "none";
    if (npTitle) npTitle.innerText = "Comienza tu colección";
    if (npMeta) npMeta.innerText = "Haz clic en 'Registrar' para comenzar";
    if (npProgressContainer) npProgressContainer.classList.add("hidden");
    return;
  }

  const game = playingGames[0];
  if (npCover) {
    npCover.src = game.coverUrl;
    npCover.classList.remove("hidden");
  }
  if (npPlaceholderIcon) npPlaceholderIcon.classList.add("hidden");
  if (npCoverBg) npCoverBg.style.backgroundImage = `url('${game.coverUrl}')`;
  if (npTitle) npTitle.innerText = game.title;
  if (npMeta) npMeta.innerText = `${(game.platforms || []).join(", ")} • ${game.hours || 0} hrs`;
}

// Render Biblioteca
function renderLibrary() {
  const lib = getCurrentDataset();
  const playingGames = lib.filter(g => g.status === 'playing');
  const completedCount = lib.filter(g => ['completed', 'extras', 'platinum'].includes(g.status)).length;
  const platinumCount = lib.filter(g => g.status === 'platinum').length;
  const totalHours = lib.reduce((acc, g) => acc + (g.hours || 0), 0);

  const elPlaying = document.getElementById("statPlaying");
  const elCompleted = document.getElementById("statCompleted");
  const elPlatinum = document.getElementById("statPlatinum");
  const elHours = document.getElementById("statHours");
  const elAvg = document.getElementById("statAvg");

  if (elPlaying) elPlaying.innerText = playingGames.length;
  if (elCompleted) elCompleted.innerText = completedCount;
  if (elPlatinum) elPlatinum.innerText = platinumCount;
  if (elHours) elHours.innerText = `${totalHours}h`;
  if (elAvg) {
    elAvg.innerText = lib.length > 0 ? (lib.reduce((acc, g) => acc + g.rating, 0) / lib.length).toFixed(1) : "0.0";
  }

  setupNowPlaying(playingGames);

  if (!gamesGrid) return;
  gamesGrid.innerHTML = "";

  if (lib.length === 0) {
    gamesGrid.className = "block";
    gamesGrid.innerHTML = `
      <div class="py-16 text-center border border-white/5 rounded-3xl p-6">
        <i class="fa-solid fa-ghost text-4xl text-slate-600 mb-3 block"></i>
        <p class="text-xs font-bold text-slate-400 console-font">Tu estante está vacío. Agrega un juego arriba o sincroniza con Steam.</p>
      </div>
    `;
    return;
  }

  gamesGrid.className = "grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5 sm:gap-6";
  lib.forEach(game => {
    const card = document.createElement("div");
    card.className = "game-console-card rounded-2xl overflow-hidden flex flex-col group cursor-pointer relative shadow-xl";
    card.innerHTML = `
      <div class="relative aspect-[3/4] overflow-hidden bg-slate-950">
        <img src="${game.coverUrl}" class="w-full h-full object-cover group-hover:scale-105 transition" onerror="this.src='https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=400&q=80'">
        <div class="absolute top-2 right-2 bg-black/80 px-2 py-0.5 rounded text-amber-400 font-bold text-xs">
          ★ ${game.rating.toFixed(1)}
        </div>
      </div>
      <div class="p-3">
        <h3 class="font-bold text-xs text-white truncate">${game.title}</h3>
        <p class="text-[10px] text-slate-400 mt-1">${game.hours || 0} hrs • ${(game.platforms || []).join(", ")}</p>
      </div>
    `;
    gamesGrid.appendChild(card);
  });
}

// Modal Steam
const openSteamSyncBtn = document.getElementById("openSteamSyncBtn");
const steamModal = document.getElementById("steamModal");
const closeSteamModalBtn = document.getElementById("closeSteamModalBtn");

if (openSteamSyncBtn && steamModal) {
  openSteamSyncBtn.addEventListener("click", () => {
    SoundFX.playWhoosh();
    steamModal.classList.remove("hidden");
  });
}
if (closeSteamModalBtn && steamModal) {
  closeSteamModalBtn.addEventListener("click", () => steamModal.classList.add("hidden"));
}

// Modal Wrapped
const openWrappedBtn = document.getElementById("openWrappedBtn");
const wrappedModal = document.getElementById("wrappedModal");
const closeWrappedBtn = document.getElementById("closeWrappedBtn");

if (openWrappedBtn && wrappedModal) {
  openWrappedBtn.addEventListener("click", () => {
    SoundFX.playTrophy();
    wrappedModal.classList.remove("hidden");
  });
}
if (closeWrappedBtn && wrappedModal) {
  closeWrappedBtn.addEventListener("click", () => wrappedModal.classList.add("hidden"));
}

// Autenticación y Sincronización Inicial
const appAuthBtn = document.getElementById("appAuthBtn");
const appUserLabel = document.getElementById("appUserLabel");
const appUserIcon = document.getElementById("appUserIcon");

async function initSession() {
  renderLibrary();

  if (!window.supabaseClient) return;

  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    const user = session?.user || (window.DB ? await DB.getUser() : null);

    if (user) {
      const alias = user.user_metadata?.username || user.email.split('@')[0];
      if (appUserLabel) appUserLabel.innerText = alias;
      if (appUserIcon) appUserIcon.className = "fa-solid fa-cloud-check text-emerald-400";

      if (appAuthBtn) {
        appAuthBtn.href = "javascript:void(0)";
        appAuthBtn.onclick = async () => {
          if (confirm("¿Deseas cerrar sesión?")) {
            await DB.signOut();
            window.location.reload();
          }
        };
      }

      // Cargar juegos desde Supabase
      if (window.DB) {
        const cloudGames = await DB.getCloudGames();
        if (cloudGames && cloudGames.length > 0) {
          const mapped = cloudGames.map(cg => ({
            id: cg.id,
            title: cg.title,
            coverUrl: cg.cover_url,
            status: cg.status,
            platforms: cg.platforms || ["PC"],
            rating: parseFloat(cg.rating),
            hours: cg.hours || 0,
            targetHours: cg.target_hours || 0,
            completedYear: cg.completed_year || new Date().getFullYear(),
            favorite: Boolean(cg.favorite),
            tags: cg.tags || [],
            notes: cg.notes || ""
          }));
          if (window.StorageManager) StorageManager.saveGames(mapped);
          renderLibrary();
        }
      }
    }
  } catch (err) {
    console.error("Error al sincronizar sesión:", err);
  }
}

initSession();
