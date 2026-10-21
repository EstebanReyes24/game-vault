/**
 * Conexión y cliente de Supabase - Game Vault / Paindex
 */
const SUPABASE_URL = "https://epouactrnuhdbzzvzxor.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_i2sc-SaHk8H6e3c-Dwf0IQ_hhdBlx_I";

const ADMIN_EMAIL = "estebanreyes2402@gmail.com";

const supabaseClient = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const DB = {
  // Autenticación requerida por login.html
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

  // Obtener ÚNICAMENTE los juegos del usuario con sesión activa
  async getCloudGames() {
    if (!supabaseClient) return [];
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return [];

    const { data, error } = await supabaseClient
      .from('games')
      .select('*')
      .eq('user_id', user.id);

    if (error) {
      console.error("Error al obtener juegos propios de Supabase:", error);
      return [];
    }
    return data || [];
  },

  // Obtener juegos de un perfil público por su nombre de usuario/alias
  async getGamesByUsername(username) {
    if (!supabaseClient || !username) return [];

    const cleanUsername = username.trim().toLowerCase();

    const { data, error } = await supabaseClient
      .from('games')
      .select('*')
      .ilike('username', cleanUsername);

    if (error) {
      console.warn("No se encontraron juegos para el perfil público:", error);
      return [];
    }
    return data || [];
  },

  // Sincronizar catálogo asignando siempre el user_id del dueño
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
      console.error("Error al sincronizar juegos con Supabase:", error);
    }
  }
};

window.DB = DB;
window.supabaseClient = supabaseClient;

window.DB = DB;
