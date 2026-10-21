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
    const steamRes = await fetch(url);
    if (!steamRes.ok) {
      return res.status(steamRes.status).json({ 
        error: `Steam respondió con estado ${steamRes.status}. Revisa que el perfil y los juegos sean públicos.` 
      });
    }

    const data = await steamRes.json();
    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Error interno en Vercel: ' + err.message });
  }
}
