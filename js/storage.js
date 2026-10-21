/**
 * Manejador centralizado de localStorage
 */
const StorageManager = {
  STORAGE_KEY: "game_vault_records",

  getGames() {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error("Error al leer localStorage:", e);
      return [];
    }
  },

  saveGames(games) {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(games));
    } catch (e) {
      console.error("Error al guardar en localStorage:", e);
    }
  },

  addGame(game) {
    const games = this.getGames();
    games.unshift(game);
    this.saveGames(games);
  },

  updateGame(id, updatedData) {
    let games = this.getGames();
    games = games.map(g => (g.id === id ? { ...g, ...updatedData } : g));
    this.saveGames(games);
  },

  deleteGame(id) {
    let games = this.getGames();
    games = games.filter(g => g.id !== id);
    this.saveGames(games);
  },

  clearAll() {
    localStorage.removeItem(this.STORAGE_KEY);
  }
};