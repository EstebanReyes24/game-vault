/**
 * "Iniciar sesión con Xbox": manda al usuario al inicio de sesión de Microsoft
 * a través de la app de Paindex Vault en OpenXBL. Al terminar, OpenXBL lo
 * devuelve a /api/xbox-callback con un código.
 * Necesita OPENXBL_PUBLIC_KEY en Vercel.
 */
export default function handler(req, res) {
  const publica = process.env.OPENXBL_PUBLIC_KEY;
  if (!publica) {
    res.setHeader("Location", "/app.html?xbox=error&motivo=config");
    return res.status(302).end();
  }
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Location", `https://api.xbl.io/app/auth/${encodeURIComponent(publica)}`);
  return res.status(302).end();
}
