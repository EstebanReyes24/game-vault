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
const ADMIN_EMAIL = "estebanreyes2402@gmail.com";
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
    notes: row.notes || ""
  };
}

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
    notes: String(game.notes || "").slice(0, 2000)
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
        emailRedirectTo: `${window.location.origin}/app.html`
      }
    });
    if (error) throw error;
    return data;
  },

  async sendPasswordReset(email) {
    if (!supabaseClient) throw new Error("Cliente de base de datos no disponible");
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/login.html?reset=1`
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
    return user.app_metadata?.role === "admin" || user.email === ADMIN_EMAIL;
  },

  async deleteMyAccount() {
    if (!supabaseClient) throw new Error("Cliente de base de datos no disponible");
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
    const { data, error } = await supabaseClient
      .from("profiles")
      .select("id, username, is_public")
      .eq("id", user.id)
      .maybeSingle();
    if (error) {
      console.error("Error al obtener el perfil:", error.message);
      return null;
    }
    return data;
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
    const rows = games.map(g => gameToCloudRow(g, user.id));
    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await supabaseClient
        .from("games")
        .upsert(rows.slice(i, i + 200), { onConflict: "user_id,id" });
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
  // MODERACIÓN (migración 005)
  // ==========================================
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
