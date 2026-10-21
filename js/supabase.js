/**
 * Conexión y cliente de Supabase - Game Vault / Paindex
 * Manejo de cuentas, estante en la nube, perfiles públicos y comunidad.
 */
const SUPABASE_URL = "https://epouactrnuhdbzzvzxor.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_i2sc-SaHk8H6e3c-Dwf0IQ_hhdBlx_I";

const ADMIN_EMAIL = "estebanreyes2402@gmail.com";

const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const DB = {
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

  async isAdmin() {
    if (!supabaseClient) return false;
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return false;
    const userRole = user.user_metadata?.role || user.app_metadata?.role;
    return userRole === "admin" || user.email === ADMIN_EMAIL;
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
      console.error("Error al obtener juegos de Supabase:", error);
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
      console.error("Error al obtener perfil público:", error);
      return [];
    }
    return data || [];
  },

  async syncLocalToCloud(localGames) {
    if (!supabaseClient) return;

    let user = null;
    try {
      const { data } = await supabaseClient.auth.getUser();
      user = data?.user || null;
    } catch (e) {
      user = null;
    }

    if (!user) {
      console.warn("No hay sesión activa para sincronizar en la nube.");
      return;
    }

    const username = (user.user_metadata?.username || user.email.split('@')[0]).trim().toLowerCase();

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
      console.error("Error sincronizando catálogo con Supabase:", error.message);
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
  // POSTS / CRÓNICAS (TABLA: posts)
  // ==========================================
  async getPublicPosts() {
    if (!supabaseClient) return [];
    const { data, error } = await supabaseClient
      .from('posts')
      .select('*')
      .order('id', { ascending: false });

    if (error) {
      console.error("Error al obtener publicaciones:", error);
      return [];
    }
    return data || [];
  },

  // ==========================================
  // MÉTRICAS DE COMUNIDAD
  // ==========================================
  async getCommunityStats() {
    if (!supabaseClient) {
      return { totalHours: 0, totalGames: 0, totalPlatinums: 0, mostPopular: "-" };
    }

    try {
      const { data: allGames, error } = await supabaseClient
        .from('games')
        .select('title, hours, status');

      if (error || !allGames || allGames.length === 0) {
        return { totalHours: 0, totalGames: 0, totalPlatinums: 0, mostPopular: "-" };
      }

      const totalHours = allGames.reduce((acc, g) => acc + (Number(g.hours) || 0), 0);
      const totalGames = allGames.length;
      const totalPlatinums = allGames.filter(g => g.status === 'platinum').length;

      const frequency = {};
      allGames.forEach(g => {
        if (g.title) frequency[g.title] = (frequency[g.title] || 0) + 1;
      });

      let mostPopular = "-";
      let maxCount = 0;
      for (const [title, count] of Object.entries(frequency)) {
        if (count > maxCount) {
          maxCount = count;
          mostPopular = title;
        }
      }

      return { totalHours, totalGames, totalPlatinums, mostPopular };
    } catch (e) {
      console.error("Error calculando estadísticas:", e);
      return { totalHours: 0, totalGames: 0, totalPlatinums: 0, mostPopular: "-" };
    }
  },

  // ==========================================
  // COMUNIDAD (TABLAS: post_comments, post_likes)
  // ==========================================
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

    const username = (user.user_metadata?.username || user.email.split('@')[0]).trim().toLowerCase();

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
      return false;
    } else {
      await supabaseClient
        .from('post_likes')
        .insert([{ post_id: postId, user_id: user.id }]);
      return true;
    }
  }
};

// Aliases requeridos por páginas legacy
DB.getPosts = DB.getPublicPosts;
DB.getPublicFeed = DB.getPublicPosts;

window.DB = DB;
window.supabaseClient = supabaseClient;
