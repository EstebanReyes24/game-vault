/**
 * Conexión y cliente de Supabase - Game Vault / Paindex
 */
const SUPABASE_URL = "https://epouactrnuhdbzzvzxor.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_i2sc-SaHk8H6e3c-Dwf0IQ_hhdBlx_I";

const ADMIN_EMAIL = "estebanreyes2402@gmail.com";

window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const DB = {
  // --- AUTENTICACIÓN ---
  async signUp(email, password, metadata = {}) {
    const { data, error } = await window.supabaseClient.auth.signUp({
      email,
      password,
      options: { data: metadata }
    });
    if (error) throw error;
    return data;
  },

  async signIn(email, password) {
    const { data, error } = await window.supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  },

  async signOut() {
    const { error } = await window.supabaseClient.auth.signOut();
    if (error) throw error;
  },

  async getUser() {
    const { data: { user } } = await window.supabaseClient.auth.getUser();
    return user;
  },

  async isAdmin() {
    const user = await this.getUser();
    return !!(user && user.email && user.email.toLowerCase() === ADMIN_EMAIL.toLowerCase());
  },

  // --- POSTS / FEED PÚBLICO ---
  async getPublicPosts() {
    const { data, error } = await window.supabaseClient
      .from('posts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn("Fallo al consultar posts:", error);
      return [];
    }
    return data || [];
  },

  async createPost(postData) {
    const isAdmin = await this.isAdmin();
    if (!isAdmin) throw new Error("Solo el autor verificado tiene permiso para publicar.");

    const user = await this.getUser();
    const { data, error } = await window.supabaseClient
      .from('posts')
      .insert([{ ...postData, user_id: user.id }])
      .select();

    if (error) throw error;
    return data[0];
  },

  async updatePost(postId, postData) {
    const isAdmin = await this.isAdmin();
    if (!isAdmin) throw new Error("No tienes permisos para editar posts.");

    const { data, error } = await window.supabaseClient
      .from('posts')
      .update(postData)
      .eq('id', postId)
      .select();

    if (error) throw error;
    return data[0];
  },

  async deletePost(postId) {
    const isAdmin = await this.isAdmin();
    if (!isAdmin) throw new Error("No tienes permisos para eliminar posts.");

    const { error } = await window.supabaseClient
      .from('posts')
      .delete()
      .eq('id', postId);

    if (error) throw error;
  },

  // --- LIKES ---
  async getPostLikes(postId) {
    const { data, error } = await window.supabaseClient
      .from('post_likes')
      .select('user_id')
      .eq('post_id', postId);

    if (error) {
      console.warn("Error leyendo likes:", error);
      return [];
    }
    return data || [];
  },

  async toggleLike(postId) {
    const user = await this.getUser();
    if (!user) throw new Error("Inicia sesión para dar me gusta.");

    const { data: existing } = await window.supabaseClient
      .from('post_likes')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existing) {
      const { error } = await window.supabaseClient
        .from('post_likes')
        .delete()
        .eq('id', existing.id);
      if (error) throw error;
      return false; // Like quitado
    } else {
      const { error } = await window.supabaseClient
        .from('post_likes')
        .insert([{ post_id: postId, user_id: user.id }]);
      if (error) throw error;
      return true; // Like añadido
    }
  },

  // --- COMENTARIOS DE ARTÍCULOS ---
  async getComments(postId) {
    const { data, error } = await window.supabaseClient
      .from('post_comments')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: true });

    if (error) {
      console.warn("Error cargando comentarios:", error);
      return [];
    }
    return data || [];
  },

  async addComment(postId, commentText) {
    const user = await this.getUser();
    if (!user) throw new Error("Debes iniciar sesión para comentar.");

    const username = user.user_metadata?.username || user.email.split('@')[0];

    const { data, error } = await window.supabaseClient
      .from('post_comments')
      .insert([{
        post_id: postId,
        user_id: user.id,
        username: username,
        comment: commentText
      }])
      .select();

    if (error) throw error;
    return data[0];
  },

  async deleteComment(commentId) {
    const { error } = await window.supabaseClient
      .from('post_comments')
      .delete()
      .eq('id', commentId);

    if (error) throw error;
  },

  // --- HALL OF FAME EDITABLE ---
  async getHallOfFame() {
    const { data, error } = await window.supabaseClient
      .from('hall_of_fame')
      .select('*')
      .order('id', { ascending: true });

    if (error) {
      console.warn("Fallo al consultar hall of fame:", error);
      return [];
    }
    return data || [];
  },

  async updateHallOfFameItem(id, itemData) {
    const isAdmin = await this.isAdmin();
    if (!isAdmin) throw new Error("No tienes permisos para modificar el Hall of Fame.");

    const { data, error } = await window.supabaseClient
      .from('hall_of_fame')
      .update({
        ...itemData,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select();

    if (error) throw error;
    return data[0];
  },
/**
 * Sanitiza texto para prevenir XSS y caracteres de escape peligrosos
 */
function sanitizeInput(str) {
  if (typeof str !== 'string') return '';
  return str
    // Remueve etiquetas HTML completas (<script>, <img ...>, etc.)
    .replace(/<[^>]*>?/gm, '')
    // Escapa caracteres especiales residuales
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .trim();
}
  // --- MÉTRICAS GLOBALES DE LA COMUNIDAD ---
  async getCommunityStats() {
    try {
      const { data, error } = await window.supabaseClient
        .from('games')
        .select('title, hours, status, rating');

      if (error || !data) return null;

      const totalHours = data.reduce((acc, g) => acc + (Number(g.hours) || 0), 0);
      const totalPlatinums = data.filter(g => g.status === 'platinum').length;
      const totalGames = data.length;

      const frequency = {};
      data.forEach(g => {
        if (g.title) {
          frequency[g.title] = (frequency[g.title] || 0) + 1;
        }
      });

      let topGame = "-";
      let maxCount = 0;
      for (const [title, count] of Object.entries(frequency)) {
        if (count > maxCount) {
          maxCount = count;
          topGame = title;
        }
      }

      return {
        totalHours,
        totalPlatinums,
        totalGames,
        topGame
      };
    } catch (e) {
      console.warn("Error calculando métricas globales:", e);
      return null;
    }
  },

  // --- CATÁLOGO EN LA NUBE ---
  async getCloudGames() {
    const user = await this.getUser();
    if (!user) return null;

    const { data, error } = await window.supabaseClient
      .from('games')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  async syncLocalToCloud(localGames) {
    const user = await this.getUser();
    if (!user || !localGames || localGames.length === 0) return;

    const formatted = localGames.map(g => ({
      id: g.id,
      user_id: user.id,
      title: g.title,
      cover_url: g.coverUrl,
      status: g.status,
      platforms: g.platforms || ["PC"],
      rating: g.rating,
      hours: g.hours || 0,
      target_hours: g.targetHours || 0,
      completed_year: g.completedYear || new Date().getFullYear(),
      favorite: !!g.favorite,
      tags: g.tags || [],
      notes: g.notes || ''
    }));

    const { error } = await window.supabaseClient
      .from('games')
      .upsert(formatted, { onConflict: 'id' });

    if (error) console.warn("Error sincronizando catálogo:", error);
  },

  async getGamesByUsername(username) {
    const { data, error } = await window.supabaseClient
      .from('games')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.warn("Fallo al obtener juegos públicos:", error);
      return [];
    }
    return data || [];
  }
};

window.DB = DB;
