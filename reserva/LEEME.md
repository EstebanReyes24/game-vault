# Reserva

Funciones que todavía no se usan y que se sacaron de `api/` porque el plan Hobby de Vercel
permite como máximo 12 funciones por despliegue.

- `xbox-login.js` y `xbox-callback.js`: «Iniciar sesión con Xbox» por OpenXBL. Necesitan
  `OPENXBL_PUBLIC_KEY` y `OPENXBL_APP_KEY` (registro de una app en Azure). Para activarlas,
  vuelve a ponerlas en `api/` y cambia la página de vuelta para que no use `<script>` en línea
  (la CSP lo bloquea).
