/**
 * Notificaciones push sin dependencias (Web Push: RFC 8291 + VAPID, RFC 8292).
 * Las claves VAPID viven en Vercel: VAPID_PUBLIC_KEY y VAPID_PRIVATE_KEY (base64url, formato "raw").
 */
import crypto from "node:crypto";

const b64u = (buf) => Buffer.from(buf).toString("base64url");
const deB64u = (s) => Buffer.from(String(s), "base64url");

// Par de claves nuevo (solo para la configuración inicial)
export function generarClavesVapid() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const pub = publicKey.export({ format: "jwk" });
  const priv = privateKey.export({ format: "jwk" });
  return {
    publica: b64u(Buffer.concat([Buffer.from([4]), deB64u(pub.x), deB64u(pub.y)])),
    privada: priv.d
  };
}

function clavePrivada(publica, privada) {
  const raw = deB64u(publica);
  if (raw.length !== 65 || raw[0] !== 4) throw new Error("VAPID_PUBLIC_KEY no válida");
  return crypto.createPrivateKey({
    key: { kty: "EC", crv: "P-256", x: b64u(raw.subarray(1, 33)), y: b64u(raw.subarray(33)), d: privada },
    format: "jwk"
  });
}

function jwtVapid(endpoint, publica, privada, contacto) {
  const cabecera = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const datos = b64u(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: contacto }));
  const firma = crypto.sign("sha256", Buffer.from(`${cabecera}.${datos}`), { key: clavePrivada(publica, privada), dsaEncoding: "ieee-p1363" });
  return `${cabecera}.${datos}.${b64u(firma)}`;
}

// Cifrado aes128gcm del mensaje para un dispositivo
export function cifrar(texto, p256dh, auth) {
  const uaPublica = deB64u(p256dh);
  const secretoAuth = deB64u(auth);
  const efimera = crypto.createECDH("prime256v1");
  const asPublica = efimera.generateKeys();
  const compartido = efimera.computeSecret(uaPublica);
  const infoClave = Buffer.concat([Buffer.from("WebPush: info\0"), uaPublica, asPublica]);
  const ikm = Buffer.from(crypto.hkdfSync("sha256", compartido, secretoAuth, infoClave, 32));
  const sal = crypto.randomBytes(16);
  const cek = Buffer.from(crypto.hkdfSync("sha256", ikm, sal, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(crypto.hkdfSync("sha256", ikm, sal, Buffer.from("Content-Encoding: nonce\0"), 12));
  const cifrador = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const cuerpo = Buffer.concat([cifrador.update(Buffer.concat([Buffer.from(texto), Buffer.from([2])])), cifrador.final(), cifrador.getAuthTag()]);
  const tamRegistro = Buffer.alloc(4);
  tamRegistro.writeUInt32BE(4096);
  return Buffer.concat([sal, tamRegistro, Buffer.from([asPublica.length]), asPublica, cuerpo]);
}

// Solo servicios de notificaciones reales (Chrome/Android, Firefox, Safari/iPhone, Edge/Windows)
export const SERVICIO_PUSH = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)\//;

// Envía un mensaje; devuelve el estado HTTP (404/410 = el dispositivo ya no existe)
export async function enviarPush(sub, mensaje, { publica, privada, contacto }) {
  if (!SERVICIO_PUSH.test(String(sub.endpoint))) return 400;
  const r = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${jwtVapid(sub.endpoint, publica, privada, contacto)}, k=${publica}`,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: "86400",
      Urgency: "normal"
    },
    body: cifrar(JSON.stringify(mensaje), sub.p256dh, sub.auth),
    signal: AbortSignal.timeout(8000)
  });
  return r.status;
}
