/**
 * Conexión y cliente de Supabase - Game Vault / Paindex
 * Manejo de cuentas, perfiles, estante en la nube y comunidad.
 *
 * La clave "publishable" de Supabase puede ir en el navegador: la seguridad
 * real la ponen las políticas RLS de la base de datos
 * (ver supabase/migrations/001_fase0.sql).
 */
const SUPABASE_URL = "https://epouactrnuhdbzzvzxor.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_i2sc-SaHk8H6e3c-Dwf0IQ_hhdBlx_I";

// Solo decide qué botones ve la interfaz. Quién puede escribir lo deciden las RLS.
let adminCache = null; // respuesta de es_admin() para no preguntar en cada pantalla
const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const CLOUD_COMPLETED_STATUSES = ["completed", "extras", "platinum"];

function cloudRowToGame(row) {
  const rating = row.rating === null || row.rating === undefined ? null : parseFloat(row.rating);
  return {
    id: Number(row.id),
    title: row.title,
    coverUrl: row.cover_url || "",
    status: row.status,
    platforms: row.platforms && row.platforms.length ? row.platforms : ["PC"],
    rating: Number.isFinite(rating) ? rating : null,
    hours: row.hours || 0,
    targetHours: row.target_hours || 0,
    completedYear: row.completed_year || null,
    favorite: Boolean(row.favorite),
    tags: row.tags || [],
    notes: row.notes || "",
    // Vínculos y datos automáticos (migración 012)
    steamAppId: row.steam_appid || null,
    xboxTitleId: row.xbox_title_id || null,
    firstPlayed: row.first_played || null,
    lastPlayed: row.last_played || null,
    achUnlocked: row.ach_unlocked ?? null,
    achTotal: row.ach_total ?? null,
    releaseYear: row.release_year || null,
    developer: row.developer || null,
    // PlayStation (migración 013)
    psnNpId: row.psn_np_id || null,
    psnService: row.psn_service || null
  };
}

// Columnas de la migración 012: si aún no existen en la base, se envían sin ellas
const COLUMNAS_012 = ["steam_appid", "xbox_title_id", "first_played", "last_played", "ach_unlocked", "ach_total", "release_year", "developer"];
const COLUMNAS_013 = ["psn_np_id", "psn_service"];
const columnasFaltantes = new Set();
const fechaISO = (f) => { const t = Date.parse(f); return Number.isFinite(t) ? new Date(t).toISOString() : null; };
const enteroONulo = (n) => (Number.isFinite(Number(n)) && n !== null && n !== "" ? Math.max(0, parseInt(n, 10)) : null);

function gameToCloudRow(game, userId) {
  const cover = typeof game.coverUrl === "string" && game.coverUrl.startsWith("https://") ? game.coverUrl : null;
  return {
    id: game.id,
    user_id: userId,
    title: String(game.title || "").slice(0, 150),
    cover_url: cover,
    status: game.status,
    platforms: game.platforms && game.platforms.length ? game.platforms : ["PC"],
    rating: Number.isFinite(game.rating) ? game.rating : null,
    hours: Math.max(0, parseInt(game.hours, 10) || 0),
    target_hours: Math.max(0, parseInt(game.targetHours, 10) || 0),
    completed_year: CLOUD_COMPLETED_STATUSES.includes(game.status) ? (game.completedYear || null) : null,
    favorite: Boolean(game.favorite),
    tags: game.tags || [],
    notes: String(game.notes || "").slice(0, 2000),
    steam_appid: enteroONulo(game.steamAppId),
    xbox_title_id: /^[0-9]{1,12}$/.test(String(game.xboxTitleId || "")) ? String(game.xboxTitleId) : null,
    first_played: fechaISO(game.firstPlayed),
    last_played: fechaISO(game.lastPlayed),
    ach_unlocked: enteroONulo(game.achUnlocked),
    ach_total: enteroONulo(game.achTotal),
    release_year: enteroONulo(game.releaseYear),
    developer: game.developer ? String(game.developer).slice(0, 120) : null,
    psn_np_id: /^NPWR[0-9]{5}_[0-9]{2}$/.test(String(game.psnNpId || "")) ? String(game.psnNpId) : null,
    psn_service: ["trophy", "trophy2"].includes(game.psnService) ? game.psnService : null
  };
}

async function currentUser() {
  if (!supabaseClient) return null;
  try {
    const { data } = await supabaseClient.auth.getUser();
    return data?.user || null;
  } catch (e) {
    return null;
  }
}

const DB = {
  fromCloud: cloudRowToGame,

  // ==========================================
  // AUTENTICACIÓN Y ROLES
  // ==========================================
  async signIn(email, password) {
    if (!supabaseClient) throw new Error("Cliente de base de datos no disponible");
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email: email.trim(),
      password: password
    });
    if (error) throw error;
    return data;
  },

  async signUp(email, password, username, extraMetadata = {}) {
    if (!supabaseClient) throw new Error("Cliente de base de datos no disponible");
    const { data, error } = await supabaseClient.auth.signUp({
      email: email.trim(),
      password: password,
      options: {
        data: { ...extraMetadata, username: username.trim().toLowerCase() },
        emailRedirectTo: `${window.location.origin}/estante?verificado=1`
      }
    });
    if (error) throw error;
    return data;
  },

  async sendPasswordReset(email) {
    if (!supabaseClient) throw new Error("Cliente de base de datos no disponible");
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/login?reset=1`
    });
    if (error) throw error;
  },

  async updatePassword(newPassword) {
    if (!supabaseClient) throw new Error("Cliente de base de datos no disponible");
    const { error } = await supabaseClient.auth.updateUser({ password: newPassword });
    if (error) throw error;
  },

  async usernameAvailable(username) {
    if (!supabaseClient) return true;
    const { data, error } = await supabaseClient.rpc("username_available", { name: username });
    if (error) {
      console.warn("No se pudo comprobar el nombre de usuario:", error.message);
      return true; // el servidor igual garantiza que sea único
    }
    return Boolean(data);
  },

  getUser: currentUser,

  async signOut() {
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut();
  },

  async isAdmin() {
    const user = await currentUser();
    if (!user) return false;
    // Solo app_metadata: user_metadata la puede editar cualquier usuario.
    if (user.app_metadata?.role === "admin") return true;
    // Si el rol se asignó después de iniciar sesión, el token aún no lo trae: se pregunta a la base
    if (adminCache === null) {
      const { data } = await supabaseClient.rpc("es_admin");
      adminCache = data === true;
    }
    return adminCache;
  },

  async deleteMyAccount() {
    if (!supabaseClient) throw new Error("Cliente de base de datos no disponible");
    // La foto de perfil vive en Storage: se borra antes que la cuenta
    try { const u = await currentUser(); if (u) await supabaseClient.storage.from("avatares").remove([`${u.id}/avatar.webp`]); } catch (e) { /* sin foto */ }
    const { error } = await supabaseClient.rpc("delete_my_account");
    if (error) throw error;
    await supabaseClient.auth.signOut();
  },

  // ==========================================
  // PERFILES (TABLA: profiles)
  // ==========================================
  async getMyProfile() {
    const user = await currentUser();
    if (!user) return null;
    // avatar_url (migración 015) y bio (016): si aún no existen, se piden sin ellas
    let columnas = ["id", "username", "is_public", "avatar_url", "bio", "nombre_elegido"];
    let data = null, error = null;
    for (let intento = 0; intento < 4; intento++) {
      ({ data, error } = await supabaseClient.from("profiles").select(columnas.join(", ")).eq("id", user.id).maybeSingle());
      const falta = error && columnas.find(c => ["avatar_url", "bio", "nombre_elegido"].includes(c) && error.message.includes(c));
      if (!falta) break;
      columnas = columnas.filter(c => c !== falta);
    }
    if (error) {
      console.error("Error al obtener el perfil:", error.message);
      return null;
    }
    return data;
  },

  // ==========================================
  // FOTO DE PERFIL (migración 015, bucket "avatares")
  // ==========================================
  async getAvatar(username) {
    if (!supabaseClient || !username) return null;
    const { data, error } = await supabaseClient.from("profiles").select("avatar_url").eq("username", String(username).toLowerCase()).maybeSingle();
    return error ? null : (data?.avatar_url || null);
  },

  async subirAvatar(blob) {
    const user = await currentUser();
    if (!user) throw new Error("Inicia sesión para poner una foto.");
    const ruta = `${user.id}/avatar.webp`;
    const { error } = await supabaseClient.storage.from("avatares").upload(ruta, blob, { upsert: true, contentType: "image/webp", cacheControl: "3600" });
    if (error) throw new Error(/bucket/i.test(error.message) ? "Falta activar las fotos de perfil (migración 015)." : error.message);
    const url = `${supabaseClient.storage.from("avatares").getPublicUrl(ruta).data.publicUrl}?v=${Date.now()}`;
    const { error: e2 } = await supabaseClient.from("profiles").update({ avatar_url: url }).eq("id", user.id);
    if (e2) throw e2;
    return url;
  },

  async quitarMiAvatar() {
    const user = await currentUser();
    if (!user) return;
    await supabaseClient.storage.from("avatares").remove([`${user.id}/avatar.webp`]);
    const { error } = await supabaseClient.from("profiles").update({ avatar_url: null }).eq("id", user.id);
    if (error) throw error;
  },

  /** Cambia el nombre de usuario (solo una vez, migración 019). */
  async elegirNombre(nuevo) {
    const { data, error } = await supabaseClient.rpc("elegir_nombre", { p_nuevo: String(nuevo || "").trim().toLowerCase() });
    if (error) throw new Error(error.message.replace(/^.*?:\s*/, "") || "No se pudo cambiar el nombre.");
    return data;
  },

  async guardarBio(texto) {
    const user = await currentUser();
    if (!user) throw new Error("Inicia sesión.");
    const bio = String(texto || "").replace(/\s+/g, " ").trim().slice(0, 160) || null;
    const { error } = await supabaseClient.from("profiles").update({ bio }).eq("id", user.id);
    if (error) throw new Error(/bio/.test(error.message) ? "Falta activar la descripción (migración 016)." : error.message);
    return bio;
  },

  async getPerfilPublico(username) {
    if (!supabaseClient || !username) return null;
    let { data, error } = await supabaseClient.from("profiles").select("avatar_url, bio").eq("username", String(username).toLowerCase()).maybeSingle();
    if (error) ({ data } = await supabaseClient.from("profiles").select("avatar_url").eq("username", String(username).toLowerCase()).maybeSingle());
    return data || null;
  },

  /** Desvincula Steam, Xbox o PlayStation (pone a null sus campos en platform_links). */
  async desvincularCuenta(campos) {
    const user = await currentUser();
    if (!user) return;
    const cambios = Object.fromEntries(campos.map(c => [c, null]));
    const { error } = await supabaseClient.from("platform_links").update(cambios).eq("user_id", user.id);
    if (error) throw error;
  },

  async quitarAvatarDe(username) {
    const { error } = await supabaseClient.rpc("quitar_avatar", { p_usuario: String(username).toLowerCase() });
    if (error) throw error;
  },

  async setProfilePublic(isPublic) {
    const user = await currentUser();
    if (!user) throw new Error("Debes iniciar sesión");
    const { error } = await supabaseClient
      .from("profiles")
      .update({ is_public: Boolean(isPublic) })
      .eq("id", user.id);
    if (error) throw error;
  },

  /** Devuelve los juegos de un perfil público, o null si no existe o es privado. */
  async getGamesByUsername(username) {
    if (!supabaseClient || !username) return null;
    const clean = String(username).trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(clean)) return null;

    const { data: profile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("id, username")
      .eq("username", clean)
      .maybeSingle();
    if (profileError || !profile) return null;

    const { data, error } = await supabaseClient
      .from("games")
      .select("*")
      .eq("user_id", profile.id);
    if (error) {
      console.error("Error al obtener perfil público:", error.message);
      return null;
    }
    return (data || []).map(cloudRowToGame);
  },

  // ==========================================
  // ESTANTE PERSONAL (TABLA: games)
  // Cada cambio sube o borra SOLO el juego afectado, así dos pestañas o
  // dispositivos abiertos no se pisan entre sí.
  // ==========================================
  async getCloudGames() {
    const user = await currentUser();
    if (!user) return [];
    const { data, error } = await supabaseClient
      .from("games")
      .select("*")
      .eq("user_id", user.id);
    if (error) {
      console.error("Error al obtener juegos de Supabase:", error.message);
      throw error;
    }
    return (data || []).map(cloudRowToGame);
  },

  async upsertGames(games) {
    const user = await currentUser();
    if (!user || !games || games.length === 0) return;
    const limpiar = (r) => { columnasFaltantes.forEach(c => delete r[c]); return r; };
    const rows = games.map(g => limpiar(gameToCloudRow(g, user.id)));
    for (let i = 0; i < rows.length; i += 200) {
      let { error } = await supabaseClient
        .from("games")
        .upsert(rows.slice(i, i + 200), { onConflict: "user_id,id" });
      // Si falta una migración (012 o 013), se guarda sin esas columnas en vez de fallar
      for (let intento = 0; error && intento < 2; intento++) {
        const msg = String(error.message);
        const grupo = COLUMNAS_012.some(c => msg.includes(c)) ? [...COLUMNAS_012, ...COLUMNAS_013]
          : (COLUMNAS_013.some(c => msg.includes(c)) ? COLUMNAS_013 : null);
        if (!grupo) break;
        console.warn("Falta una migración: se guardan los juegos sin", grupo.join(", "));
        grupo.forEach(c => columnasFaltantes.add(c));
        rows.forEach(limpiar);
        ({ error } = await supabaseClient.from("games").upsert(rows.slice(i, i + 200), { onConflict: "user_id,id" }));
      }
      if (error) throw error;
    }
  },

  async upsertGame(game) {
    return this.upsertGames([game]);
  },

  async deleteGame(gameId) {
    const user = await currentUser();
    if (!user) return;
    const { error } = await supabaseClient
      .from("games")
      .delete()
      .eq("user_id", user.id)
      .eq("id", gameId);
    if (error) throw error;
  },

  /** Reemplaza el estante completo en la nube (importar copia, vaciar). */
  async replaceAllGames(games) {
    const user = await currentUser();
    if (!user) return;
    const { error } = await supabaseClient.from("games").delete().eq("user_id", user.id);
    if (error) throw error;
    await this.upsertGames(games);
  },

  // ==========================================
  // HALL OF FAME (TABLA: hall_of_fame)
  // ==========================================
  // Juegos mejor puntuados de Paindex para los Esenciales automáticos (migración 004)
  async getEsencialesAuto() {
    if (!supabaseClient) return [];
    const { data, error } = await supabaseClient.rpc("paindex_esenciales");
    if (error) {
      console.warn("Esenciales automáticos no disponibles (¿falta la migración 004?):", error.message);
      return [];
    }
    return data || [];
  },

  async getHallOfFame() {
    if (!supabaseClient) return [];
    const { data, error } = await supabaseClient
      .from("hall_of_fame")
      .select("*")
      .order("id", { ascending: true });

    if (error) {
      console.error("Error al obtener Hall of Fame:", error);
      return [];
    }
    return data || [];
  },

  async updateHallOfFameItem(slotId, payload) {
    if (!supabaseClient) throw new Error("Cliente de base de datos no disponible");
    const { data, error } = await supabaseClient
      .from("hall_of_fame")
      .update(payload)
      .eq("id", slotId);

    if (error) throw error;
    return data;
  },

  // ==========================================
  // PUBLICACIONES / CRÓNICAS (TABLA: posts)
  // ==========================================
  async getPublicPosts() {
    if (!supabaseClient) return [];
    const { data, error } = await supabaseClient
      .from("posts")
      .select("*")
      .order("id", { ascending: false });

    if (error) {
      console.error("Error al obtener publicaciones:", error);
      return [];
    }
    return data || [];
  },

  // BORRADORES DE NOTICIAS (tabla news_drafts_done, solo admin)
  async getReviewedDraftIds() {
    if (!supabaseClient) return [];
    const { data, error } = await supabaseClient.from("news_drafts_done").select("draft_id");
    if (error) throw error;
    return (data || []).map(r => r.draft_id);
  },

  async markDraft(draftId, action, postId = null) {
    if (!supabaseClient) throw new Error("Cliente de base de datos no disponible");
    const { error } = await supabaseClient
      .from("news_drafts_done")
      .upsert([{ draft_id: draftId, action, post_id: postId }]);
    if (error) throw error;
  },

  async createPost(payload) {
    if (!supabaseClient) throw new Error("Cliente de base de datos no disponible");
    const user = await currentUser();
    if (!user) throw new Error("Debes iniciar sesión para publicar");

    const { data, error } = await supabaseClient
      .from("posts")
      .insert([{
        user_id: user.id,
        title: payload.title,
        category: payload.category,
        game_tag: payload.game_tag,
        cover_url: payload.cover_url,
        content: payload.content
      }])
      .select();

    if (error) throw error;
    return data?.[0] || null;
  },

  async updatePost(postId, payload) {
    if (!supabaseClient) throw new Error("Cliente de base de datos no disponible");
    const { data, error } = await supabaseClient
      .from("posts")
      .update({
        title: payload.title,
        category: payload.category,
        game_tag: payload.game_tag,
        cover_url: payload.cover_url,
        content: payload.content
      })
      .eq("id", postId);

    if (error) throw error;
    return data;
  },

  async deletePost(postId) {
    if (!supabaseClient) throw new Error("Cliente de base de datos no disponible");
    const { data, error } = await supabaseClient
      .from("posts")
      .delete()
      .eq("id", postId);

    if (error) throw error;
    return data;
  },

  // ==========================================
  // LIKES (TABLA: post_likes)
  // ==========================================
  async getPostLikes(postId) {
    if (!supabaseClient || !postId) return [];
    const { data, error } = await supabaseClient
      .from("post_likes")
      .select("user_id")
      .eq("post_id", postId);

    if (error) {
      console.error("Error al obtener likes:", error);
      return [];
    }
    return data || [];
  },

  async toggleLike(postId) {
    if (!supabaseClient) return false;
    const user = await currentUser();
    if (!user) throw new Error("Debes iniciar sesión para dar like");

    const { data: existingLike, error: readError } = await supabaseClient
      .from("post_likes")
      .select("id")
      .eq("post_id", postId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (readError) throw readError;

    if (existingLike) {
      const { error } = await supabaseClient
        .from("post_likes")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", user.id);
      if (error) throw error;
      return false;
    }

    const { error } = await supabaseClient
      .from("post_likes")
      .insert([{ post_id: postId, user_id: user.id }]);
    if (error) throw error;
    return true;
  },

  // ==========================================
  // COMENTARIOS (TABLA: post_comments)
  // ==========================================
  async getComments(postId) {
    if (!supabaseClient || !postId) return [];
    const { data, error } = await supabaseClient
      .from("post_comments")
      .select("*")
      .eq("post_id", postId)
      .order("id", { ascending: true });

    if (error) {
      console.error("Error al obtener comentarios:", error);
      return [];
    }
    return data || [];
  },

  async addComment(postId, commentText) {
    if (!supabaseClient) return null;
    const user = await currentUser();
    if (!user) throw new Error("Debes iniciar sesión para comentar");

    const text = String(commentText || "").trim();
    if (!text) throw new Error("El comentario está vacío.");
    if (text.length > 1000) throw new Error("El comentario no puede pasar de 1000 caracteres.");

    // El nombre lo pone la base de datos a partir del perfil (no se puede falsificar).
    const { data, error } = await supabaseClient
      .from("post_comments")
      .insert([{
        post_id: postId,
        user_id: user.id,
        username: "-",
        comment: text
      }])
      .select();

    if (error) {
      if (/row-level security/i.test(error.message || "")) throw new Error("Tu cuenta no puede comentar por ahora. Si crees que es un error, escríbenos por el canal.");
      throw error;
    }
    return data?.[0] || null;
  },

  // ==========================================
  // SOCIAL: seguir y actividad (migración 006)
  // ==========================================
  async getActividad(soloSeguidos = false, limite = 20) {
    if (!supabaseClient) return [];
    const { data, error } = await supabaseClient.rpc("actividad_reciente", { solo_seguidos: soloSeguidos, limite });
    if (error) { console.warn("Actividad no disponible (¿falta la migración 006?):", error.message); return []; }
    return data || [];
  },

  async getResumenSocial(usuario) {
    if (!supabaseClient) return null;
    const { data, error } = await supabaseClient.rpc("resumen_social", { usuario });
    if (error) return null;
    return (data && data[0]) || null;
  },

  async seguir(usuario, activar) {
    if (!supabaseClient) throw new Error("Cliente de base de datos no disponible");
    const user = await currentUser();
    if (!user) throw new Error("Inicia sesión para seguir jugadores.");
    const { data: perfil } = await supabaseClient.from("profiles").select("id").eq("username", String(usuario).toLowerCase()).maybeSingle();
    if (!perfil) throw new Error("Ese estante no existe o es privado.");
    const { error } = activar
      ? await supabaseClient.from("follows").insert([{ follower_id: user.id, followed_id: perfil.id }])
      : await supabaseClient.from("follows").delete().eq("follower_id", user.id).eq("followed_id", perfil.id);
    if (error && error.code !== "23505") throw new Error(error.message);
  },

  // ==========================================
  // LISTAS (migración 007)
  // ==========================================
  async getListas(userId) {
    if (!supabaseClient || !userId) return [];
    const { data, error } = await supabaseClient
      .from("lists")
      .select("id, title, description, updated_at, list_items(position, game_title, cover_url, rating, note)")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false });
    if (error) { console.warn("Listas no disponibles (¿falta la migración 007?):", error.message); return []; }
    return (data || []).map(l => ({ ...l, items: (l.list_items || []).sort((a, b) => a.position - b.position) }));
  },

  async getMisListas() {
    const user = await currentUser();
    return user ? this.getListas(user.id) : [];
  },

  async getListasDe(usuario) {
    if (!supabaseClient) return [];
    const { data: perfil } = await supabaseClient.from("profiles").select("id").eq("username", String(usuario).toLowerCase()).maybeSingle();
    return perfil ? this.getListas(perfil.id) : [];
  },

  async guardarLista({ id, title, description, items }) {
    const user = await currentUser();
    if (!user) throw new Error("Inicia sesión para guardar listas.");
    const datos = { title: String(title || "").trim(), description: String(description || "").trim() || null };
    if (!datos.title) throw new Error("Ponle un nombre a la lista.");
    let listaId = id;
    if (listaId) {
      const { error } = await supabaseClient.from("lists").update(datos).eq("id", listaId);
      if (error) throw new Error(error.message);
      const { error: e2 } = await supabaseClient.from("list_items").delete().eq("list_id", listaId);
      if (e2) throw new Error(e2.message);
    } else {
      const { data, error } = await supabaseClient.from("lists").insert([{ ...datos, user_id: user.id }]).select("id").single();
      if (error) throw new Error(error.message);
      listaId = data.id;
    }
    const filas = (items || []).slice(0, 50).map((g, i) => ({
      list_id: listaId,
      position: i,
      game_title: String(g.game_title).slice(0, 200),
      cover_url: /^https:\/\/[^\s"'<>]+$/.test(g.cover_url || "") ? g.cover_url : null,
      rating: Number(g.rating) > 0 ? Number(g.rating) : null,
      note: g.note ? String(g.note).slice(0, 200) : null
    }));
    if (filas.length) {
      const { error } = await supabaseClient.from("list_items").insert(filas);
      if (error) throw new Error(error.message);
    }
    return listaId;
  },

  async borrarLista(id) {
    const { error } = await supabaseClient.from("lists").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },

  // ==========================================
  // RESEÑAS (migración 008)
  // ==========================================
  async getResenasDe(usuario) {
    if (!supabaseClient) return [];
    const { data: perfil } = await supabaseClient.from("profiles").select("id").eq("username", String(usuario).toLowerCase()).maybeSingle();
    if (!perfil) return [];
    const { data, error } = await supabaseClient.from("reviews")
      .select("id, user_id, game_title, cover_url, rating, body, spoilers, featured, hidden, created_at, updated_at")
      .eq("user_id", perfil.id).order("created_at", { ascending: false });
    if (error) { console.warn("Reseñas no disponibles (¿falta la migración 008?):", error.message); return []; }
    return data || [];
  },

  async getMiResena(gameTitle) {
    const user = await currentUser();
    if (!user || !supabaseClient) return null;
    const { data } = await supabaseClient.from("reviews").select("*").eq("user_id", user.id).eq("game_title", gameTitle).maybeSingle();
    return data || null;
  },

  async guardarResena({ id, game_title, cover_url, rating, body, spoilers }) {
    const user = await currentUser();
    if (!user) throw new Error("Inicia sesión para escribir reseñas.");
    const texto = String(body || "").trim();
    if (texto.length < 50) throw new Error("La reseña necesita al menos 50 caracteres.");
    if (texto.length > 5000) throw new Error("La reseña no puede pasar de 5000 caracteres.");
    const fila = {
      game_title: String(game_title).trim(),
      cover_url: /^https:\/\/[^\s"'<>]+$/.test(cover_url || "") ? cover_url : null,
      rating: Number(rating) > 0 ? Number(rating) : null,
      body: texto,
      spoilers: Boolean(spoilers)
    };
    const { data, error } = id
      ? await supabaseClient.from("reviews").update(fila).eq("id", id).select("id").single()
      : await supabaseClient.from("reviews").insert([{ ...fila, user_id: user.id }]).select("id").single();
    if (error) {
      if (/row-level security/i.test(error.message)) throw new Error("Tu cuenta no puede publicar por ahora.");
      throw new Error(error.message);
    }
    return data.id;
  },

  async borrarResena(id) {
    const { error } = await supabaseClient.from("reviews").delete().eq("id", id);
    if (error) throw new Error(error.message);
  },

  async getResenasDestacadas(limite = 3) {
    if (!supabaseClient) return [];
    const { data, error } = await supabaseClient.rpc("resenas_destacadas", { limite });
    if (error) return [];
    return data || [];
  },

  async reportarResena(reviewId, reason) {
    const user = await currentUser();
    if (!user) throw new Error("Inicia sesión para reportar.");
    const { error } = await supabaseClient.from("review_reports").insert([{ review_id: reviewId, reporter_id: user.id, reason: reason || null }]);
    if (error) {
      if (error.code === "23505") throw new Error("Ya reportaste esta reseña.");
      throw new Error(error.message);
    }
  },

  async getModeracionResenas() {
    if (!supabaseClient) return [];
    const { data, error } = await supabaseClient.rpc("moderacion_resenas");
    if (error) return [];
    return data || [];
  },

  async marcarResena(id, cambios) {
    const { error } = await supabaseClient.from("reviews").update(cambios).eq("id", id);
    if (error) throw new Error(error.message);
  },

  async descartarReportesResena(id) {
    const { error } = await supabaseClient.from("review_reports").delete().eq("review_id", id);
    if (error) throw new Error(error.message);
  },

  // ==========================================
  // CUENTAS VINCULADAS Y LOGROS (migración 012)
  // ==========================================
  async getCuentas() {
    const user = await currentUser();
    if (!user || !supabaseClient) return null;
    const { data, error } = await supabaseClient.from("platform_links").select("*").eq("user_id", user.id).maybeSingle();
    if (error) return null;
    return data || null;
  },

  async guardarCuentas(cambios) {
    const user = await currentUser();
    if (!user || !supabaseClient) return;
    const fila = { user_id: user.id, updated_at: new Date().toISOString() };
    for (const [k, v] of Object.entries(cambios || {})) if (v) fila[k] = String(v);
    const { error } = await supabaseClient.from("platform_links").upsert([fila]);
    if (error) console.warn("No se guardó la cuenta vinculada (¿falta la migración 012?):", error.message);
  },

  async getLogros(gameId, userId) {
    if (!supabaseClient) return null;
    const uid = userId || (await currentUser())?.id;
    if (!uid) return null;
    const { data, error } = await supabaseClient.from("game_achievements").select("source, items, synced_at").eq("user_id", uid).eq("game_id", gameId).maybeSingle();
    if (error) return null;
    return data || null;
  },

  async guardarLogros(gameId, source, items) {
    const user = await currentUser();
    if (!user || !supabaseClient) return;
    const { error } = await supabaseClient.from("game_achievements").upsert([{ user_id: user.id, game_id: gameId, source, items, synced_at: new Date().toISOString() }]);
    if (error) console.warn("No se guardaron los logros:", error.message);
  },

  async getUserIdPorNombre(usuario) {
    if (!supabaseClient) return null;
    const { data } = await supabaseClient.from("profiles").select("id").eq("username", String(usuario).toLowerCase()).maybeSingle();
    return data?.id || null;
  },

  // ==========================================
  // MODERACIÓN (migración 005)
  // ==========================================
  // PARA MIS VIDEOS (migración 011, privado)
  async getPlanesVideo() {
    const user = await currentUser();
    if (!user || !supabaseClient) return [];
    const { data, error } = await supabaseClient.from("video_plans").select("*").eq("user_id", user.id).order("updated_at", { ascending: false });
    if (error) { console.warn("Planes de video no disponibles (¿falta la migración 011?):", error.message); return []; }
    return data || [];
  },

  async guardarPlanVideo({ game_title, estado, url, notas }) {
    const user = await currentUser();
    if (!user) throw new Error("Inicia sesión.");
    const fila = {
      user_id: user.id,
      game_title,
      estado,
      url: /^https:\/\/[^\s"'<>]+$/.test(url || "") ? url : null,
      notas: notas ? String(notas).slice(0, 1000) : null,
      updated_at: new Date().toISOString()
    };
    const { error } = await supabaseClient.from("video_plans").upsert([fila]);
    if (error) throw new Error(error.message);
  },

  async borrarPlanVideo(game_title) {
    const user = await currentUser();
    const { error } = await supabaseClient.from("video_plans").delete().eq("user_id", user.id).eq("game_title", game_title);
    if (error) throw new Error(error.message);
  },

  async getErrores() {
    if (!supabaseClient) return [];
    const { data, error } = await supabaseClient.rpc("errores_recientes");
    if (error) return [];
    return data || [];
  },

  async reportComment(commentId, reason) {
    if (!supabaseClient) throw new Error("Cliente de base de datos no disponible");
    const user = await currentUser();
    if (!user) throw new Error("Inicia sesión para reportar.");
    const { error } = await supabaseClient
      .from("comment_reports")
      .insert([{ comment_id: commentId, reporter_id: user.id, reason: reason || null }]);
    if (error) {
      if (error.code === "23505") throw new Error("Ya reportaste este comentario.");
      throw new Error(error.message);
    }
  },

  async getModeracion() {
    if (!supabaseClient) return [];
    const { data, error } = await supabaseClient.rpc("moderacion_pendiente");
    if (error) throw error;
    return data || [];
  },

  async setCommentHidden(commentId, hidden) {
    const { error } = await supabaseClient.from("post_comments").update({ hidden }).eq("id", commentId);
    if (error) throw error;
  },

  async dismissReports(commentId) {
    const { error } = await supabaseClient.from("comment_reports").delete().eq("comment_id", commentId);
    if (error) throw error;
  },

  async banUser(userId, reason) {
    const { error } = await supabaseClient.from("banned_users").upsert([{ user_id: userId, reason: reason || null }]);
    if (error) throw error;
  },

  async unbanUser(userId) {
    const { error } = await supabaseClient.from("banned_users").delete().eq("user_id", userId);
    if (error) throw error;
  },

  async deleteComment(commentId) {
    if (!supabaseClient || !commentId) return;
    const { data, error } = await supabaseClient
      .from("post_comments")
      .delete()
      .eq("id", commentId);

    if (error) throw error;
    return data;
  },

  // ==========================================
  // MÉTRICAS DE COMUNIDAD (calculadas en el servidor)
  // ==========================================
  async getCommunityStats() {
    const empty = { totalHours: 0, totalGames: 0, totalPlatinums: 0, mostPopular: "-" };
    if (!supabaseClient) return empty;

    const { data, error } = await supabaseClient.rpc("community_stats");
    if (error || !data) {
      console.error("Error calculando estadísticas:", error?.message);
      return empty;
    }
    return {
      totalHours: Number(data.total_hours) || 0,
      totalGames: Number(data.total_games) || 0,
      totalPlatinums: Number(data.total_platinums) || 0,
      mostPopular: data.top_game || "-"
    };
  }
};

DB.getPosts = DB.getPublicPosts;
DB.getPublicFeed = DB.getPublicPosts;

window.DB = DB;
window.supabaseClient = supabaseClient;

/**
 * Dirección de la página de un juego: "Marvel's Spider-Man™ 2" → "marvels-spider-man-2".
 * Sin guiones es la misma clave que usa la base (clave_juego, migración 014).
 */
window.slugJuego = function (titulo) {
  const de = "áàäâãåéèëêíìïîóòöôõúùüûñç", a = "aaaaaaeeeeiiiiooooouuuunc";
  return String(titulo || "").toLowerCase().split("").map(c => { const i = de.indexOf(c); return i >= 0 ? a[i] : c; }).join("")
    .replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120);
};
window.urlJuego = (titulo) => `/j/${window.slugJuego(titulo)}`;

/** fetch a la API de la web con la sesión de Supabase (Xbox y PlayStation la exigen). */
window.fetchConSesion = async function (url, opciones = {}) {
  let token = null;
  try { token = (await supabaseClient?.auth.getSession())?.data?.session?.access_token || null; } catch (e) { token = null; }
  const headers = { ...(opciones.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(url, { ...opciones, headers });
};

// Vuelta de un enlace del correo (verificar cuenta, cambiar contraseña) con error:
// Supabase lo manda en la dirección (#error=…). Se explica en lenguaje normal y se limpia la dirección.
(function () {
  const datos = new URLSearchParams(location.hash.replace(/^#/, ""));
  const verificado = new URLSearchParams(location.search).get("verificado") === "1";
  if (!datos.get("error") && !verificado) return;
  const codigo = datos.get("error_code") || "";
  const texto = datos.get("error")
    ? (codigo === "otp_expired"
      ? "Ese enlace ya se usó o venció. Si ya habías confirmado tu correo, tu cuenta está activa: inicia sesión normalmente."
      : "No se pudo completar el enlace del correo. Prueba a iniciar sesión; si no entra, pide un correo nuevo.")
    : "¡Correo confirmado! Tu cuenta ya está activa.";
  history.replaceState(null, "", location.pathname);
  const aviso = document.createElement("div");
  aviso.className = "aviso-correo" + (datos.get("error") ? " es-error" : "");
  aviso.setAttribute("role", "status");
  aviso.innerHTML = `<span></span><a href="/login">Iniciar sesión</a><button type="button" aria-label="Cerrar">×</button>`;
  aviso.querySelector("span").textContent = texto;
  if (!datos.get("error")) aviso.querySelector("a").remove();
  aviso.querySelector("button").addEventListener("click", () => aviso.remove());
  const poner = () => document.body.prepend(aviso);
  if (document.body) poner(); else document.addEventListener("DOMContentLoaded", poner);
  setTimeout(() => aviso.remove(), 15000);
})();

// ---------- Métricas (migración 020) ----------
// Solo cuentas con sesión: un "estuvo activo hoy" y qué funciones abrió (una vez por día y función).
// Nada de visitantes anónimos ni datos personales: solo días y nombres de funciones.
(function () {
  if (!window.supabaseClient) return;
  const hoy = () => new Date().toISOString().slice(0, 10);
  const leer = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const poner = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } };

  // De dónde llegó la primera vez (se guarda en el navegador y se manda al crear la cuenta)
  if (!leer("gv_origen")) {
    const q = new URLSearchParams(location.search);
    let origen = q.get("utm_source") || q.get("ref") || "";
    if (!origen) {
      let host = "";
      try { host = document.referrer ? new URL(document.referrer).hostname.replace(/^www\.|^m\./, "") : ""; } catch (e) { host = ""; }
      const propio = !host || host === location.hostname || /supabase\.co$|accounts\.google\./.test(host);
      const conocidos = [[/youtube\.com$|youtu\.be$/, "youtube"], [/^google\./, "google"], [/^(t\.co|x\.com|twitter\.com)$/, "x"],
        [/instagram\.com$/, "instagram"], [/facebook\.com$|fb\.com$/, "facebook"], [/tiktok\.com$/, "tiktok"], [/discord/, "discord"],
        [/reddit\.com$/, "reddit"], [/whatsapp/, "whatsapp"], [/bing\.com$|duckduckgo\.com$/, "buscador"]];
      if (!propio) origen = (conocidos.find(([re]) => re.test(host)) || [null, host])[1];
      else if (!document.referrer) origen = /^\/(u|j|a)\//.test(location.pathname) ? "enlace_" + { u: "perfil", j: "juego", a: "articulo" }[location.pathname[1]] : "directo";
    }
    if (origen) poner("gv_origen", String(origen).toLowerCase().replace(/[^a-z0-9._-]/g, "").slice(0, 40) || "directo");
  }

  async function registrar(funcion) {
    const clave = `gv_uso_${funcion || "dia"}`;
    if (leer(clave) === hoy()) return;
    const { data } = await supabaseClient.auth.getSession();
    if (!data?.session) return;
    poner(clave, hoy());
    supabaseClient.rpc("registrar_uso", { p_funcion: funcion || null }).then(() => {}, () => {});
    if (!funcion && leer("gv_origen") && leer("gv_origen_enviado") !== "1") {
      poner("gv_origen_enviado", "1");
      supabaseClient.rpc("poner_origen", { p_origen: leer("gv_origen") }).then(() => {}, () => {});
    }
  }
  window.marcarUso = registrar;

  // Botones del estante → nombre de la función
  const BOTONES = {
    openSteamSyncBtn: "importar_steam", openXboxBtn: "importar_xbox", openPsnBtn: "importar_psn", openPegarBtn: "pegar_lista",
    syncPlatformsBtn: "sincronizar", dupesBtn: "repetidos", autoDataBtn: "completar_datos", presumirBtn: "presumir",
    deseosBtn: "deseos", queJuegoBtn: "que_juego", openWrappedBtn: "wrapped", openStatsBtn: "stats", openTop5Btn: "top_cards",
    openListsBtn: "listas", openVideosBtn: "mis_videos", saveGameBtn: "registrar_juego", modalReviewBtn: "resena",
    shareProfileBtn: "compartir_perfil", exportBtn: "exportar", jDeseo: "lo_quiero", appAuthBtn: "perfil"
  };
  document.addEventListener("click", (e) => {
    const b = e.target.closest?.("[id]");
    if (b && BOTONES[b.id]) registrar(BOTONES[b.id]);
    if (e.target.closest?.('a[href^="https://discord.gg/"]')) registrar("discord");
  }, true);

  const PAGINAS = [[/^\/j\//, "pagina_juego"], [/^\/comparar|\/vs\//, "comparar"], [/^\/juegos\/?$/, "ranking"]];
  const deLaPagina = (PAGINAS.find(([re]) => re.test(location.pathname)) || [])[1];
  setTimeout(() => { registrar(null); if (deLaPagina) registrar(deLaPagina); }, 2500);
  supabaseClient.auth.onAuthStateChange((evento) => { if (evento === "SIGNED_IN") setTimeout(() => registrar(null), 1500); });
})();
