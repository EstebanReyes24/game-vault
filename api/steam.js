export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  res.setHeader('Content-Type', 'application/json');

  const { steamid } = req.query;

  if (!steamid) {
    return res.status(400).json({ error: 'Falta el parámetro steamid' });
  }

  const STEAM_KEY = 'AD5DEC86882BAA4DFD0AFEC622DB1A4E';
  const url = `https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/?key=${STEAM_KEY}&steamid=${steamid}&include_appinfo=true&include_played_free_games=true&format=json`;

  try {
    const steamRes = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!steamRes.ok) {
      return res.status(steamRes.status).json({
        error: `Steam respondió con estado ${steamRes.status}. Revisa que el perfil y los juegos sean públicos.`
      });
    }

    const textData = await steamRes.text();
    
    try {
      const data = JSON.parse(textData);
      return res.status(200).json(data);
    } catch {
      return res.status(502).json({
        error: 'Steam no devolvió un JSON válido. Probablemente hay saturación temporal en sus servidores.'
      });
    }

  } catch (err) {
    return res.status(500).json({ error: 'Error interno en Vercel: ' + err.message });
  }
}
