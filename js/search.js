/**
 * Motor de búsqueda 100% videojuegos utilizando la API de RAWG.
 */
const SearchEngine = {
  apiKey: "c542e67aec3a4340908f9de9e86038af",

  async search(term, callback) {
    if (!term || term.trim().length < 2) {
      callback([]);
      return;
    }

    const cleanTerm = encodeURIComponent(term.trim());
    const url = `https://api.rawg.io/api/games?key=${this.apiKey}&search=${cleanTerm}&page_size=6&search_precise=true`;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("Fallo en RAWG");
      
      const data = await response.json();
      
      if (data && data.results && data.results.length > 0) {
        const games = data.results
          .filter(game => game.background_image)
          .map(game => ({
            title: game.name,
            image: game.background_image,
            desc: game.released ? `Lanzamiento: ${game.released.slice(0, 4)}` : "Videojuego"
          }));

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