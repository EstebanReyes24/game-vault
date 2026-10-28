/**
 * Motor de búsqueda 100% videojuegos utilizando la API de RAWG.
 */
const SearchEngine = {
  // La clave de RAWG está en el servidor (/api/rawg), no en el navegador.
  async search(term, callback) {
    if (!term || term.trim().length < 2) {
      callback([]);
      return;
    }

    try {
      const response = await fetch(`/api/rawg?search=${encodeURIComponent(term.trim())}&n=6&precise=1`);
      if (!response.ok) throw new Error("Fallo en RAWG");
      const data = await response.json();
      const games = (data.results || [])
        .filter(game => game.background_image)
        .map(game => ({
          title: game.name,
          image: game.background_image,
          desc: game.released ? `Lanzamiento: ${game.released.slice(0, 4)}` : "Videojuego"
        }));
      if (games.length > 0) {
        callback(games);
        return;
      }
      this.searchFallback(term, callback);
    } catch (err) {
      console.warn("Fallo en API primaria, usando fallback:", err);
      this.searchFallback(term, callback);
    }
  },

  searchFallback(term, callback) {
    window.handleWikiBackup = function(data) {
      let items = [];
      if (data && data.query && data.query.pages) {
        items = Object.values(data.query.pages)
          .filter(p => p.thumbnail)
          .map(p => ({
            title: p.title.replace(/\s*\([^)]*game[^)]*\)\s*$/i, "").trim(),
            image: p.thumbnail.source,
            desc: p.description || "Videojuego"
          }));
      }
      callback(items);
    };

    const oldScript = document.getElementById("jsonp-backup");
    if (oldScript) oldScript.remove();

    const script = document.createElement("script");
    script.id = "jsonp-backup";
    const q = encodeURIComponent(`${term} video game`);
    script.src = `https://en.wikipedia.org/w/api.php?action=query&format=json&generator=search&gsrsearch=${q}&gsrlimit=6&prop=pageimages|description&piprop=thumbnail&pithumbsize=500&callback=handleWikiBackup`;
    
    script.onerror = () => callback([]);
    document.body.appendChild(script);
  }
};