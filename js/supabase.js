/**
 * Conexión y cliente de Supabase - Game Vault / Paindex
 */
const SUPABASE_URL = "https://epouactrnuhdbzzvzxor.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_i2sc-SaHk8H6e3c-Dwf0IQ_hhdBlx_I";

const ADMIN_EMAIL = "estebanreyes2402@gmail.com";

const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const DB = {
  // ==========================================
  // AUTENTICACIÓN
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

  async signUp(email, password, username) {
    if (!supabaseClient) throw new Error("Cliente de base de datos no disponible");
    const { data, error } = await supabaseClient.auth.signUp({
      email: email.trim(),
      password: password,
      options: {
        data: { username: username.trim().toLowerCase() }
      }
    });
    if (error) throw error;
    return data;
  },

  async getUser() {
    if (!supabaseClient) return null;
    const { data: { user } } = await supabaseClient.auth.getUser();
    return user;
  },

  async signOut() {
    if (!supabaseClient) return;
    await supabaseClient.auth.signOut();
  },

  // ==========================================
  // ESTANTE PERSONAL (TABLA: games)
  // ==========================================
  async getCloudGames() {
    if (!supabaseClient) return [];
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabaseClient
      .from('games')
      .select('*')
      .eq('user_id', user.id);

    if (error) {
      console.error("Error al obtener juegos propios:", error);
      return [];
    }
    return data || [];
  },

  async getGamesByUsername(username) {
    if (!supabaseClient || !username) return [];
    const cleanUsername = username.trim().toLowerCase();

    const { data, error } = await supabaseClient
      .from('games')
      .select('*')
      .ilike('username', cleanUsername);

    if (error) {
      console.warn("Error al cargar perfil de usuario:", error);
      return [];
    }
    return data || [];
  },

  async syncLocalToCloud(localGames) {
    if (!supabaseClient) return;
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    const username = user.user_metadata?.username || user.email.split('@')[0];

    const payload = localGames.map(g => ({
      id: g.id,
      user_id: user.id,
      username: username,
      title: g.title,
      cover_url: g.coverUrl,
      status: g.status,
      platforms: g.platforms || ["PC"],
      rating: g.rating,
      hours: g.hours || 0,
      target_hours: g.targetHours || 0,
      completed_year: g.completedYear || new Date().getFullYear(),
      favorite: Boolean(g.favorite),
      tags: g.tags || [],
      notes: g.notes || ""
    }));

    if (payload.length === 0) return;

    const { error } = await supabaseClient
      .from('games')
      .upsert(payload, { onConflict: 'id' });

    if (error) {
      console.error("Error sincronizando catálogo:", error);
    }
  },

  // ==========================================
  // HALL OF FAME (TABLA: hall_of_fame)
  // ==========================================
  async getHallOfFame() {
    if (!supabaseClient) return [];
    const { data, error } = await supabaseClient
      .from('hall_of_fame')
      .select('*')
      .order('rating', { ascending: false });

    if (error) {
      console.error("Error al obtener Hall of Fame:", error);
      return [];
    }
    return data || [];
  },

  // ==========================================
  // COMUNIDAD (TABLAS: posts, post_comments, post_likes)
  // ==========================================
  async getPosts() {
    if (!supabaseClient) return [];
    const { data, error } = await supabaseClient
      .from('posts')
      .select('*')
      .order('id', { ascending: false });

    if (error) {
      console.error("Error al obtener posts:", error);
      return [];
    }
    return data || [];
  },

  async getComments(postId) {
    if (!supabaseClient || !postId) return [];
    const { data, error } = await supabaseClient
      .from('post_comments')
      .select('*')
      .eq('post_id', postId)
      .order('id', { ascending: true });

    if (error) {
      console.error("Error al obtener comentarios:", error);
      return [];
    }
    return data || [];
  },

  async addComment(postId, commentText) {
    if (!supabaseClient) return null;
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error("Debes iniciar sesión para comentar");

    const username = user.user_metadata?.username || user.email.split('@')[0];

    const { data, error } = await supabaseClient
      .from('post_comments')
      .insert([{
        post_id: postId,
        user_id: user.id,
        username: username,
        content: commentText.trim()
      }])
      .select();

    if (error) throw error;
    return data?.[0] || null;
  },

  async toggleLike(postId) {
    if (!supabaseClient) return false;
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) throw new Error("Debes iniciar sesión para dar like");

    // Verificar si ya dio like
    const { data: existingLike } = await supabaseClient
      .from('post_likes')
      .select('*')
      .eq('post_id', postId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingLike) {
      await supabaseClient
        .from('post_likes')
        .delete()
        .eq('post_id', postId)
        .eq('user_id', user.id);
      return false; // Like retirado
    } else {
      await supabaseClient
        .from('post_likes')
        .insert([{ post_id: postId, user_id: user.id }]);
      return true; // Like añadido
    }
  }
};

// Aliases de compatibilidad
DB.getPublicFeed = DB.getPosts;

window.DB = DB;
window.supabaseClient = supabaseClient;
