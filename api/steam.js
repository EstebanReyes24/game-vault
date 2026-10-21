export default async function handler(req, res) {
  // Permitir peticiones desde tu propia web
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');

  const { steamid } = req.query;

  if (!steamid) {
    return res.status(400).json({ error: 'Falta el parámetro steamid.' });
  }

  // Clave de API de Steam para tu backend
  const STEAM_API_KEY = 'D47B3E25DE187514E2976D49BC94E782';
  const steamUrl = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${STEAM_API_KEY}&steamid=${steamid}&include_appinfo=true&include_played_free_games=true&format=json`;

  try {
    const response = await fetch(steamUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Steam respondió con estado ${response.status}. Verifica que el SteamID64 sea válido y tu perfil sea público.`
      });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Error interno conectando con Steam: ' + err.message });
  }
}