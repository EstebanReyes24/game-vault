/**
 * Lógica del Portal Oficial Paindex (Game Vault)
 * Métricas de Comunidad + Comentarios + Hall of Fame + Likes + Buscador en Vivo + PWA
 * Blindado contra XSS y datos nulos
 */

// ==========================================
// FUNCIÓN SANITIZADORA ANTI-XSS
// ==========================================
function escapeHTML(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const authBtn = document.getElementById("authBtn");
const authBtnText = document.getElementById("authBtnText");
const authIcon = document.getElementById("authIcon");
const authorBar = document.getElementById("authorBar");
const openNewPostBtn = document.getElementById("openNewPostBtn");
const postModal = document.getElementById("postModal");
const postModalTitle = document.getElementById("postModalTitle");
const closePostModalBtn = document.getElementById("closePostModalBtn");
const newPostForm = document.getElementById("newPostForm");
const savePostBtn = document.getElementById("savePostBtn");
const newsFeed = document.getElementById("newsFeed");
const postCounter = document.getElementById("postCounter");

const commStatHours = document.getElementById("commStatHours");
const commStatGames = document.getElementById("commStatGames");
const commStatPlatinums = document.getElementById("commStatPlatinums");
const commStatTopGame = document.getElementById("commStatTopGame");

const readPostModal = document.getElementById("readPostModal");
const closeReadPostBtn = document.getElementById("closeReadPostBtn");
const readPostCover = document.getElementById("readPostCover");
const readPostCategory = document.getElementById("readPostCategory");
const readPostTitle = document.getElementById("readPostTitle");
const readPostDate = document.getElementById("readPostDate");
const readPostContent = document.getElementById("readPostContent");
const modalLikeBtn = document.getElementById("modalLikeBtn");
const modalLikeIcon = document.getElementById("modalLikeIcon");
const modalLikeCount = document.getElementById("modalLikeCount");

const commentForm = document.getElementById("commentForm");
const commentInput = document.getElementById("commentInput");
const submitCommentBtn = document.getElementById("submitCommentBtn");
const commentsList = document.getElementById("commentsList");
const commentsCount = document.getElementById("commentsCount");
const commentAuthNotice = document.getElementById("commentAuthNotice");

const hofGrid = document.getElementById("hofGrid");
const openHofModalBtn = document.getElementById("openHofModalBtn");
const hofModal = document.getElementById("hofModal");
const closeHofModalBtn = document.getElementById("closeHofModalBtn");
const hofForm = document.getElementById("hofForm");
const hofSelectSlot = document.getElementById("hofSelectSlot");
const hofTitleInput = document.getElementById("hofTitleInput");
const hofRatingInput = document.getElementById("hofRatingInput");
const hofTagInput = document.getElementById("hofTagInput");
const hofProgressInput = document.getElementById("hofProgressInput");
const hofCoverInput = document.getElementById("hofCoverInput");
const saveHofBtn = document.getElementById("saveHofBtn");

const openSearchBtn = document.getElementById("openSearchBtn");
const searchModal = document.getElementById("searchModal");
const liveSearchInput = document.getElementById("liveSearchInput");
const liveSearchResults = document.getElementById("liveSearchResults");
const pwaInstallBtn = document.getElementById("pwaInstallBtn");

const filterPills = document.querySelectorAll(".filter-pill");
let activeCategoryFilter = "all";
let cachedPosts = [];
let cachedHof = [];
let activeViewingPostId = null;
let editingPostId = null;
let deferredPrompt = null;

// ==========================================
// REGISTRO DE SERVICE WORKER & PWA
// ==========================================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => console.warn('SW error:', err));
  });
}

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (pwaInstallBtn) pwaInstallBtn.classList.remove('hidden');
});

if (pwaInstallBtn) {
  pwaInstallBtn.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      pwaInstallBtn.classList.add('hidden');
    }
    deferredPrompt = null;
  });
}

// ==========================================
// SESIÓN DE USUARIO
// ==========================================
async function checkUserSession() {
  try {
    const user = await DB.getUser();
    const isAdmin = await DB.isAdmin();

    if (user) {
      const profile = await DB.getMyProfile();
      const alias = profile?.username || user.email.split("@")[0];
      if (authBtnText) authBtnText.innerText = alias;
      if (authIcon) authIcon.className = "fa-solid fa-cloud-check text-emerald-400";
      if (authBtn) {
        authBtn.href = "javascript:void(0)";
        authBtn.onclick = async () => {
          if (confirm(`Sesión iniciada como ${user.email}.\n¿Deseas cerrar sesión?`)) {
            await DB.signOut();
            window.location.reload();
          }
        };
      }

      if (commentAuthNotice) {
        commentAuthNotice.innerText = `Comentando como @${alias}`;
        commentAuthNotice.className = "text-[11px] text-emerald-400 font-semibold";
      }

      if (authorBar) {
        if (isAdmin) authorBar.classList.remove("hidden");
        else authorBar.classList.add("hidden");
      }

      if (openHofModalBtn) {
        if (isAdmin) openHofModalBtn.classList.remove("hidden");
        else openHofModalBtn.classList.add("hidden");
      }
    } else {
      if (authBtnText) authBtnText.innerText = "Iniciar Sesión";
      if (authIcon) authIcon.className = "fa-solid fa-user text-indigo-400";
      if (authBtn) {
        authBtn.href = "login.html";
        authBtn.onclick = null;
      }
      if (authorBar) authorBar.classList.add("hidden");
      if (openHofModalBtn) openHofModalBtn.classList.add("hidden");
      if (commentAuthNotice) {
        commentAuthNotice.innerHTML = `<a href="login.html" class="underline text-indigo-400">Inicia sesión</a> para comentar`;
      }
    }
  } catch (err) {
    console.warn("Fallo verificando sesión:", err);
  }
}

// ==========================================
// BUSCADOR EN VIVO (Ctrl + K)
// ==========================================
function openSearchPalette() {
  if (!searchModal) return;
  searchModal.classList.remove("hidden");
  liveSearchInput.value = "";
  renderSearchResults("");
  setTimeout(() => liveSearchInput.focus(), 50);
}

function closeSearchPalette() {
  if (searchModal) searchModal.classList.add("hidden");
}

if (openSearchBtn) openSearchBtn.addEventListener("click", openSearchPalette);

window.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    if (searchModal && !searchModal.classList.contains("hidden")) closeSearchPalette();
    else openSearchPalette();
  }
  if (e.key === "Escape") {
    closeSearchPalette();
    if (readPostModal && !readPostModal.classList.contains("hidden")) cerrarArticulo();
    if (postModal) postModal.classList.add("hidden");
    if (hofModal) hofModal.classList.add("hidden");
  }
});

if (searchModal) {
  searchModal.addEventListener("click", (e) => {
    if (e.target === searchModal) closeSearchPalette();
  });
}

function renderSearchResults(query) {
  if (!liveSearchResults) return;
  const q = query.toLowerCase().trim();
  const matches = q 
    ? cachedPosts.filter(p => p.title.toLowerCase().includes(q) || (p.game_tag && p.game_tag.toLowerCase().includes(q)) || p.content.toLowerCase().includes(q))
    : cachedPosts.slice(0, 5);

  liveSearchResults.innerHTML = "";
  if (matches.length === 0) {
    liveSearchResults.innerHTML = `<p class="text-xs text-slate-500 py-3 text-center">No se encontraron artículos con ese término.</p>`;
    return;
  }

  matches.forEach(post => {
    const item = document.createElement("div");
    item.className = "flex items-center justify-between p-2.5 rounded-xl hover:bg-white/10 cursor-pointer transition";
    item.innerHTML = `
      <div class="flex items-center gap-3 overflow-hidden">
        <img src="${escapeHTML(String(post.cover_url || ''))}" class="w-10 h-10 object-cover rounded-lg bg-slate-900 shrink-0" alt="Miniatura">
        <div class="overflow-hidden">
          <p class="text-xs font-bold text-white truncate console-font">${escapeHTML(String(post.title || ''))}</p>
          <p class="text-[10px] text-slate-400 truncate">${escapeHTML(String(post.category || ''))} ${escapeHTML(String(post.game_tag || ''))}</p>
        </div>
      </div>
      <i class="fa-solid fa-chevron-right text-xs text-slate-500"></i>
    `;
    item.onclick = () => {
      closeSearchPalette();
      openReadModal(post);
    };
    liveSearchResults.appendChild(item);
  });
}

if (liveSearchInput) {
  liveSearchInput.addEventListener("input", (e) => renderSearchResults(e.target.value));
}

// ==========================================
// MÉTRICAS DE LA COMUNIDAD
// ==========================================
async function loadCommunityMetrics() {
  try {
    const stats = await DB.getCommunityStats();
    if (!stats) return;

    if (commStatHours && stats.totalHours !== undefined) {
      commStatHours.innerText = `${stats.totalHours}h`;
    }
    if (commStatGames && stats.totalGames !== undefined) {
      commStatGames.innerText = stats.totalGames;
    }
    if (commStatPlatinums && stats.totalPlatinums !== undefined) {
      commStatPlatinums.innerText = stats.totalPlatinums;
    }
    if (commStatTopGame) {
      const top = stats.mostPopular || stats.topGame || stats.popular;
      commStatTopGame.innerText = (top && top !== "undefined" && String(top).trim().length > 0) 
        ? top 
        : "-";
    }
  } catch (err) {
    console.error("Error cargando métricas comunitarias:", err);
  }
}

// ==========================================
// HALL OF FAME DINÁMICO (BLINDADO CON FALLBACK)
// ==========================================
// Portada: las tapas del Hall of Fame en abanico, rotando una cada pocos segundos.
let portadaTimer = null;
function pintarPortada(items) {
  const estante = document.getElementById("portadaEstante");
  const tapas = document.getElementById("portadaTapas");
  if (!estante || !tapas) return;
  const validas = (items || []).filter(i => /^https:\/\//i.test(String(i.cover_url || ""))).slice(0, 8);
  if (validas.length < 3) return; // sin tapas suficientes queda la P sola

  tapas.innerHTML = validas.map((item, i) => `
    <button type="button" class="tapa" data-i="${i}" tabindex="-1" aria-label="Ver ${escapeHTML(String(item.title || ""))}">
      <img src="${escapeHTML(String(item.cover_url))}" alt="" loading="${i < 3 ? "eager" : "lazy"}">
    </button>`).join("") + `
    <div class="tapa-ficha" aria-live="polite"><span></span><b></b></div>`;
  estante.classList.add("con-tapas");
  estante.removeAttribute("aria-hidden");

  const botones = [...tapas.querySelectorAll(".tapa")];
  const ficha = tapas.querySelector(".tapa-ficha");
  let orden = botones.map((_, i) => i); // orden[0] = la de enfrente
  const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function colocar(primeraVez) {
    const pos = {};
    pos[orden[0]] = "frente";
    pos[orden[1]] = "der";
    pos[orden[orden.length - 1]] = "izq";
    botones.forEach((b, i) => {
      b.dataset.pos = pos[i] || "";
      b.tabIndex = pos[i] === "der" || pos[i] === "izq" ? 0 : -1;
    });
    const item = validas[orden[0]];
    const escribir = () => {
      ficha.querySelector("span").textContent = item.title || "";
      ficha.querySelector("b").textContent = item.rating ? parseFloat(item.rating).toFixed(1) : "";
      ficha.classList.remove("cambiando");
    };
    if (primeraVez || quieto) { escribir(); return; }
    ficha.classList.add("cambiando");
    setTimeout(escribir, 350);
  }

  function avanzar(pasos = 1) {
    for (let k = 0; k < pasos; k++) orden.push(orden.shift());
    colocar(false);
  }

  // Entrada: todas empiezan escondidas y se abren en abanico.
  requestAnimationFrame(() => requestAnimationFrame(() => colocar(true)));

  // Clic en una de las de atrás: pasa al frente.
  botones.forEach((b, i) => b.addEventListener("click", () => {
    const pasos = orden.indexOf(i);
    if (pasos <= 0) return;
    avanzar(pasos);
    reiniciar();
  }));

  function reiniciar() {
    clearInterval(portadaTimer);
    if (quieto) return;
    portadaTimer = setInterval(() => {
      if (document.hidden || estante.matches(":hover")) return; // pausa al pasar el ratón o con la pestaña oculta
      avanzar(1);
    }, 4500);
  }
  reiniciar();
}

// Esenciales de la semana: los fijados a mano + los mejor puntuados del estante,
// escogidos con la semana del año como semilla (todos ven lo mismo y cambia cada lunes).
const ESTADOS_ESENCIALES = {
  platinum: "Platinado", extras: "Campaña + extras", completed: "Pasado",
  playing: "Jugando", onhold: "En pausa", backlog: "Pendiente"
};

function semanaDelAnio(fecha = new Date()) {
  const d = new Date(Date.UTC(fecha.getFullYear(), fecha.getMonth(), fecha.getDate()));
  const dia = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dia);
  const inicio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return d.getUTCFullYear() * 100 + Math.ceil(((d - inicio) / 86400000 + 1) / 7);
}

function barajarConSemilla(lista, semilla) {
  const a = [...lista];
  let x = semilla >>> 0;
  const azar = () => { x = (x + 0x6D2B79F5) >>> 0; let t = Math.imul(x ^ (x >>> 15), 1 | x); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(azar() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function armarEsenciales(fijados, automaticos, total = 8) {
  const clave = (t) => String(t || "").toLowerCase().trim();
  const vistos = new Set(fijados.map(f => clave(f.title)));
  const candidatos = automaticos
    .filter(g => !vistos.has(clave(g.title)))
    .map(g => ({
      title: g.title,
      cover_url: g.cover_url,
      rating: g.rating,
      tag: (Array.isArray(g.tags) && g.tags[0]) ? (String(g.tags[0]).startsWith("#") ? g.tags[0] : "#" + g.tags[0]) : (Array.isArray(g.platforms) && g.platforms[0] ? "#" + g.platforms[0] : "#Paindex"),
      progress: [ESTADOS_ESENCIALES[g.status] || "Jugado", g.hours ? `${g.hours}h` : ""].filter(Boolean).join(" • "),
      automatico: true
    }));
  const semana = semanaDelAnio();
  const elegidos = barajarConSemilla(candidatos, semana).slice(0, Math.max(0, total - fijados.length));
  // El orden también cambia cada semana para que la portada no abra siempre con el mismo
  return barajarConSemilla([...fijados, ...elegidos], semana + 7);
}

async function loadHallOfFame() {
  if (!hofGrid) return;

  let automaticos = [];
  try {
    const [data, auto] = await Promise.all([DB.getHallOfFame(), DB.getEsencialesAuto()]);
    cachedHof = (Array.isArray(data) && data.length > 0) ? data : [];
    automaticos = Array.isArray(auto) ? auto : [];
  } catch (err) {
    console.warn("Fallo al traer Hall of Fame de Supabase:", err);
    cachedHof = [];
  }
  const esenciales = armarEsenciales(cachedHof, automaticos);

  // Sin datos no se inventan juegos: se muestra un aviso honesto.
  if (esenciales.length === 0) {
    hofGrid.innerHTML = `
      <div class="col-span-full py-10 text-center glass-panel rounded-2xl border border-white/10">
        <p class="text-xs font-bold text-slate-400">No se pudo cargar el Hall of Fame en este momento.</p>
      </div>
    `;
    return;
  }

  pintarPortada(esenciales);

  hofGrid.innerHTML = esenciales.map(item => {
    const title = escapeHTML(String(item.title || "Sin título"));
    const cover = escapeHTML(String(item.cover_url || ""));
    const tag = escapeHTML(String(item.tag || "#Juego"));
    const progress = escapeHTML(String(item.progress || "Completado"));
    const rating = item.rating ? parseFloat(item.rating).toFixed(1) : "10.0";

    return `
      <div class="glass-panel glow-card rounded-2xl overflow-hidden border border-white/10 p-3 flex flex-col justify-between group">
        <div class="relative aspect-[3/4] rounded-xl overflow-hidden bg-slate-950 mb-2.5">
          <img src="${cover}" class="w-full h-full object-cover group-hover:scale-110 transition duration-500" alt="${title}" onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=400&q=80'">
          <div class="absolute top-2 right-2 bg-black/80 px-2 py-0.5 rounded-md text-amber-400 font-black text-[11px] console-font border border-white/10">★ ${rating}</div>
          <div class="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/70 text-[9px] font-bold text-slate-300">${tag}</div>
        </div>
        <div>
          <h3 class="text-xs font-black text-white console-font truncate group-hover:text-indigo-400 transition">${title}</h3>
          <span class="text-[10px] text-slate-400 font-medium">${progress}</span>
        </div>
      </div>
    `;
  }).join("");
}

function fillHofFormSlot(slotId) {
  const item = cachedHof.find(h => h.id === parseInt(slotId, 10));
  if (item) {
    if (hofTitleInput) hofTitleInput.value = item.title || "";
    if (hofRatingInput) hofRatingInput.value = item.rating || 10;
    if (hofTagInput) hofTagInput.value = item.tag || "";
    if (hofProgressInput) hofProgressInput.value = item.progress || "";
    if (hofCoverInput) hofCoverInput.value = item.cover_url || "";
  }
}

if (hofSelectSlot) {
  hofSelectSlot.addEventListener("change", (e) => fillHofFormSlot(e.target.value));
}

if (openHofModalBtn) {
  openHofModalBtn.addEventListener("click", () => {
    hofModal.classList.remove("hidden");
    fillHofFormSlot(hofSelectSlot.value);
  });
}

if (closeHofModalBtn) {
  closeHofModalBtn.addEventListener("click", () => hofModal.classList.add("hidden"));
}

if (hofModal) {
  hofModal.addEventListener("click", (e) => {
    if (e.target === hofModal) hofModal.classList.add("hidden");
  });
}

if (hofForm) {
  hofForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const slotId = parseInt(hofSelectSlot.value, 10);
    saveHofBtn.disabled = true;
    saveHofBtn.innerText = "Guardando...";

    try {
      await DB.updateHallOfFameItem(slotId, {
        title: hofTitleInput.value.trim(),
        rating: parseFloat(hofRatingInput.value),
        tag: hofTagInput.value.trim(),
        progress: hofProgressInput.value.trim(),
        cover_url: hofCoverInput.value.trim()
      });

      alert("¡Hall of Fame actualizado exitosamente!");
      hofModal.classList.add("hidden");
      await loadHallOfFame();
    } catch (err) {
      alert("Error actualizando: " + err.message);
    } finally {
      saveHofBtn.disabled = false;
      saveHofBtn.innerText = "Guardar Cambios";
    }
  });
}

// Filtros por píldora
filterPills.forEach(pill => {
  pill.addEventListener("click", () => {
    filterPills.forEach(p => p.classList.remove("active"));
    pill.classList.add("active");
    activeCategoryFilter = pill.dataset.cat;
    renderArticles();
  });
});

function openCreatePostModal() {
  editingPostId = null;
  newPostForm.reset();
  if (postModalTitle) postModalTitle.innerText = "Publicar Entrada en el Feed";
  if (savePostBtn) savePostBtn.innerText = "Lanzar a la Comunidad";
  postModal.classList.remove("hidden");
}

function openEditPostModal(post) {
  editingPostId = post.id;
  document.getElementById("postTitle").value = post.title || "";
  document.getElementById("postCategory").value = post.category || "Recomendación";
  document.getElementById("postGameTag").value = post.game_tag || "";
  document.getElementById("postCoverUrl").value = post.cover_url || "";
  document.getElementById("postContent").value = post.content || "";

  if (postModalTitle) postModalTitle.innerText = `Editando: ${post.title}`;
  if (savePostBtn) savePostBtn.innerText = "Guardar Cambios";
  postModal.classList.remove("hidden");
}

if (openNewPostBtn) openNewPostBtn.addEventListener("click", openCreatePostModal);
if (closePostModalBtn) {
  closePostModalBtn.addEventListener("click", () => {
    postModal.classList.add("hidden");
    editingPostId = null;
  });
}

if (postModal) {
  postModal.addEventListener("click", (e) => {
    if (e.target === postModal) {
      postModal.classList.add("hidden");
      editingPostId = null;
    }
  });
}

if (newPostForm) {
  newPostForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const title = document.getElementById("postTitle").value.trim();
    const category = document.getElementById("postCategory").value;
    const game_tag = document.getElementById("postGameTag").value.trim();
    const cover_url = document.getElementById("postCoverUrl").value.trim();
    const content = document.getElementById("postContent").value.trim();

    savePostBtn.disabled = true;
    savePostBtn.innerText = editingPostId ? "Guardando..." : "Publicando...";

    try {
      const payload = {
        title,
        category,
        game_tag: game_tag ? (game_tag.startsWith("#") ? game_tag : "#" + game_tag) : null,
        cover_url: cover_url || "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80",
        content
      };

      if (editingPostId) {
        await DB.updatePost(editingPostId, payload);
        alert("¡Artículo actualizado!");
      } else {
        await DB.createPost(payload);
        alert("¡Artículo publicado!");
      }

      postModal.classList.add("hidden");
      editingPostId = null;
      newPostForm.reset();
      await loadPublicFeed();
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      savePostBtn.disabled = false;
      savePostBtn.innerText = editingPostId ? "Guardar Cambios" : "Lanzar a la Comunidad";
    }
  });
}

// ==========================================
// LECTURA, LIKES Y COMENTARIOS SANEADOS
// ==========================================
async function openReadModal(post) {
  activeViewingPostId = post.id;
  readPostCover.src = post.cover_url || "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=800&q=80";
  readPostTitle.innerText = post.title || "";
  readPostCategory.innerText = post.category || "";
  readPostContent.innerText = post.content || "";
  readPostDate.innerText = post.created_at ? new Date(post.created_at).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }) : "";

  // Cada artículo tiene su propio enlace (/a/id) con vista previa al compartirlo
  if (window.location.pathname !== `/a/${post.id}`) history.replaceState(null, "", `/a/${post.id}`);
  document.title = `${post.title} · Paindex Vault`;

  await updateModalLikes(post.id);
  readPostModal.classList.remove("hidden");
  await loadPostComments(post.id);
}

async function updateModalLikes(postId) {
  if (!modalLikeCount) return;
  const likes = await DB.getPostLikes(postId);
  const user = await DB.getUser();
  const hasLiked = user && likes.some(l => l.user_id === user.id);

  modalLikeCount.innerText = likes.length;
  if (hasLiked) {
    modalLikeBtn.className = "px-3 py-1.5 rounded-xl bg-rose-600/20 border border-rose-500/40 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer text-rose-400";
  } else {
    modalLikeBtn.className = "px-3 py-1.5 rounded-xl glass-panel border border-white/20 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer text-slate-300 hover:text-rose-400";
  }
}

if (modalLikeBtn) {
  modalLikeBtn.addEventListener("click", async () => {
    if (!activeViewingPostId) return;
    try {
      await DB.toggleLike(activeViewingPostId);
      await updateModalLikes(activeViewingPostId);
    } catch (err) {
      alert(err.message);
    }
  });
}

async function loadPostComments(postId) {
  if (!commentsList) return;
  commentsList.innerHTML = `<p class="text-[11px] text-slate-500 italic">Cargando comentarios...</p>`;

  const comments = await DB.getComments(postId);
  const user = await DB.getUser();
  const isAdmin = await DB.isAdmin();

  if (commentsCount) commentsCount.innerText = comments.length;

  if (comments.length === 0) {
    commentsList.innerHTML = `<p class="text-[11px] text-slate-500 italic py-2">Sé el primero en compartir tu opinión sobre este tema.</p>`;
    return;
  }

  commentsList.innerHTML = comments.map(c => {
    const isOwnerOrAdmin = (user && user.id === c.user_id) || isAdmin;
    const dateFormatted = c.created_at ? new Date(c.created_at).toLocaleDateString("es-ES", {
      day: "numeric",
      month: "short"
    }) : "";

    const deleteBtn = isOwnerOrAdmin ? `
      <button class="text-[10px] text-rose-400 hover:text-rose-300 delete-comment-btn cursor-pointer ml-auto" data-id="${c.id}">
        <i class="fa-solid fa-trash"></i>
      </button>
    ` : '';

    return `
      <div class="glass-panel p-2.5 rounded-xl border border-white/10 text-xs space-y-1">
        <div class="flex items-center justify-between text-[11px]">
          <span class="font-bold text-indigo-300">@${escapeHTML(String(c.username || 'usuario'))}</span>
          <div class="flex items-center gap-2">
            <span class="text-[10px] text-slate-500">${dateFormatted}</span>
            ${deleteBtn}
          </div>
        </div>
        <p class="text-slate-200 leading-relaxed">${escapeHTML(String(c.comment || c.content || ""))}</p>
      </div>
    `;
  }).join("");

  document.querySelectorAll(".delete-comment-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const cid = btn.dataset.id;
      if (confirm("¿Eliminar este comentario?")) {
        await DB.deleteComment(cid);
        loadPostComments(postId);
      }
    });
  });
}

if (commentForm) {
  commentForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = commentInput.value.trim();
    if (!text || !activeViewingPostId) return;

    submitCommentBtn.disabled = true;
    submitCommentBtn.innerText = "...";

    try {
      await DB.addComment(activeViewingPostId, text);
      commentInput.value = "";
      await loadPostComments(activeViewingPostId);
    } catch (err) {
      alert(err.message);
    } finally {
      submitCommentBtn.disabled = false;
      submitCommentBtn.innerText = "Comentar";
    }
  });
}

if (closeReadPostBtn) closeReadPostBtn.addEventListener("click", () => cerrarArticulo());

if (readPostModal) {
  readPostModal.addEventListener("click", (e) => {
    if (e.target === readPostModal) cerrarArticulo();
  });
}

function renderArticles() {
  if (!newsFeed) return;

  let filtered = [...cachedPosts];
  if (activeCategoryFilter !== "all") {
    filtered = filtered.filter(p => p.category === activeCategoryFilter);
  }

  if (filtered.length === 0) {
    if (postCounter) postCounter.innerText = "0 entradas en esta categoría";
    newsFeed.innerHTML = `
      <div class="col-span-full py-14 text-center glass-panel rounded-3xl border border-white/10">
        <i class="fa-solid fa-filter text-4xl text-slate-600 mb-2 block"></i>
        <p class="text-xs font-bold text-slate-400 console-font">No hay entradas para la categoría "${escapeHTML(String(activeCategoryFilter))}".</p>
      </div>
    `;
    return;
  }

  if (postCounter) postCounter.innerText = `${filtered.length} entrada(s) mostrada(s)`;

  DB.isAdmin().then(isAdmin => {
    newsFeed.innerHTML = filtered.map((post) => {
      const originalIdx = cachedPosts.findIndex(p => p.id === post.id);
      const dateFormatted = post.created_at ? new Date(post.created_at).toLocaleDateString("es-ES", {
        day: "numeric",
        month: "short",
        year: "numeric"
      }) : "";

      let catColor = "bg-indigo-500/20 text-indigo-300 border-indigo-500/40";
      if (post.category === "Recomendación") catColor = "bg-amber-500/20 text-amber-300 border-amber-500/40";
      if (post.category === "Reflexión") catColor = "bg-purple-500/20 text-purple-300 border-purple-500/40";
      if (post.category === "Análisis") catColor = "bg-rose-500/20 text-rose-300 border-rose-500/40";
      if (post.category === "Noticia") catColor = "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";

      const adminControlsHtml = isAdmin ? `
        <div class="flex items-center gap-2 ml-auto">
          <button class="edit-post-btn text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1 cursor-pointer transition" data-id="${post.id}">
            <i class="fa-solid fa-pen-to-square"></i> Editar
          </button>
          <button class="delete-post-btn text-xs text-rose-400 hover:text-rose-300 font-semibold flex items-center gap-1 cursor-pointer transition" data-id="${post.id}">
            <i class="fa-solid fa-trash"></i> Eliminar
          </button>
        </div>
      ` : '';

      return `
        <article class="glass-panel glow-card rounded-3xl overflow-hidden border border-white/10 flex flex-col justify-between hover:border-purple-500/30 transition group shadow-xl">
          <div class="relative h-48 w-full overflow-hidden bg-slate-950 cursor-pointer" onclick="openPostByIndex(${originalIdx})">
            <img src="${escapeHTML(String(post.cover_url || ''))}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt="${escapeHTML(String(post.title || ''))}" onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=600&q=80'">
            <div class="absolute inset-0 bg-gradient-to-t from-[#0d1326] via-transparent"></div>
            <div class="absolute top-3 left-3 flex items-center gap-1.5">
              <span class="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${catColor} backdrop-blur-md">
                ${escapeHTML(String(post.category || ''))}
              </span>
              ${post.game_tag ? `<span class="px-2 py-0.5 rounded-md text-[10px] font-bold bg-black/60 text-slate-300 border border-white/10">${escapeHTML(String(post.game_tag))}</span>` : ''}
            </div>
          </div>

          <div class="p-5 flex flex-col justify-between flex-1 gap-3 text-left">
            <div class="space-y-1.5 cursor-pointer" onclick="openPostByIndex(${originalIdx})">
              <span class="text-[10px] text-slate-500 font-semibold block">${dateFormatted} • Por Paindex</span>
              <h3 class="text-base font-black text-white console-font leading-snug group-hover:text-purple-300 transition">${escapeHTML(String(post.title || ''))}</h3>
              <p class="text-xs text-slate-300 leading-relaxed line-clamp-3">${escapeHTML(String(post.content || ''))}</p>
            </div>

            <div class="flex items-center justify-between pt-2 border-t border-white/10 text-xs">
              <button onclick="openPostByIndex(${originalIdx})" class="text-indigo-400 hover:text-indigo-300 font-bold flex items-center gap-1 cursor-pointer">
                Leer y debatir <i class="fa-solid fa-arrow-right text-[10px]"></i>
              </button>
              ${adminControlsHtml}
            </div>
          </div>
        </article>
      `;
    }).join("");

    document.querySelectorAll(".edit-post-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const id = Number(btn.dataset.id);
        const post = cachedPosts.find(p => p.id === id);
        if (post) openEditPostModal(post);
      });
    });

    document.querySelectorAll(".delete-post-btn").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        if (confirm("¿Estás seguro de eliminar esta publicación del portal?")) {
          try {
            await DB.deletePost(id);
            await loadPublicFeed();
          } catch (err) {
            alert("Error: " + err.message);
          }
        }
      });
    });
  });
}

async function loadPublicFeed() {
  if (postCounter) postCounter.innerText = "Consultando entradas...";
  cachedPosts = await DB.getPublicPosts();
  renderArticles();
  abrirArticuloDeLaUrl();
}

// Si se entra por /a/123, abre ese artículo directamente
let articuloUrlAbierto = false;
function abrirArticuloDeLaUrl() {
  if (articuloUrlAbierto) return;
  const m = window.location.pathname.match(/^\/a\/(\d+)\/?$/);
  if (!m) return;
  articuloUrlAbierto = true;
  const post = cachedPosts.find(p => String(p.id) === m[1]);
  if (post) openReadModal(post);
  else history.replaceState(null, "", "/");
}

function cerrarArticulo() {
  readPostModal.classList.add("hidden");
  activeViewingPostId = null;
  if (window.location.pathname.startsWith("/a/")) history.replaceState(null, "", "/");
  document.title = "Paindex Vault · Tu estante de juegos";
}

const copyPostLinkBtn = document.getElementById("copyPostLinkBtn");
if (copyPostLinkBtn) copyPostLinkBtn.addEventListener("click", async () => {
  if (!activeViewingPostId) return;
  const url = `${window.location.origin}/a/${activeViewingPostId}`;
  try {
    await navigator.clipboard.writeText(url);
    copyPostLinkBtn.innerHTML = '<i class="fa-solid fa-check" aria-hidden="true"></i> Copiado';
    setTimeout(() => { copyPostLinkBtn.innerHTML = '<i class="fa-solid fa-link" aria-hidden="true"></i> Copiar enlace'; }, 1800);
  } catch (e) { prompt("Copia el enlace:", url); }
});

window.openPostByIndex = function(index) {
  if (cachedPosts[index]) openReadModal(cachedPosts[index]);
};

checkUserSession();
loadPublicFeed();
loadHallOfFame();
loadCommunityMetrics();