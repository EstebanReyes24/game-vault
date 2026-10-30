/**
 * Acceso de jugadores: iniciar sesión, registro, recuperar contraseña
 * y elegir una contraseña nueva desde el enlace del correo.
 */
const MODES = {
  login: {
    title: "Iniciar Sesión",
    subtitle: "Conecta tu cuenta para sincronizar tus juegos en la nube",
    headerIcon: "fa-solid fa-user-astronaut",
    button: "ENTRAR A MI ESTANTE",
    buttonIcon: "fa-solid fa-arrow-right-to-bracket",
    toggle: "¿No tienes cuenta? Regístrate aquí"
  },
  register: {
    title: "Crear Cuenta",
    subtitle: "Únete a la estación para guardar tus juegos",
    headerIcon: "fa-solid fa-user-plus",
    button: "CREAR MI CUENTA",
    buttonIcon: "fa-solid fa-user-plus",
    toggle: "¿Ya tienes cuenta? Inicia sesión aquí"
  },
  forgot: {
    title: "Recuperar Contraseña",
    subtitle: "Te enviaremos un enlace para crear una contraseña nueva",
    headerIcon: "fa-solid fa-key",
    button: "ENVIAR ENLACE",
    buttonIcon: "fa-solid fa-paper-plane",
    toggle: "Volver a iniciar sesión"
  },
  reset: {
    title: "Nueva Contraseña",
    subtitle: "Escribe la contraseña nueva para tu cuenta",
    headerIcon: "fa-solid fa-key",
    button: "GUARDAR CONTRASEÑA",
    buttonIcon: "fa-solid fa-check",
    toggle: "Cancelar"
  }
};

const USERNAME_RE = /^[a-z0-9_]{3,20}$/;
let mode = "login";

const $ = (id) => document.getElementById(id);
const authForm = $("authForm");
const authAlert = $("authAlert");
const authSubmitBtn = $("authSubmitBtn");
const btnText = $("btnText");
const btnIcon = $("btnIcon");
const toggleAuthBtn = $("toggleAuthBtn");
const forgotBtn = $("forgotBtn");

const authUsername = $("authUsername");
const authEmail = $("authEmail");
const authPassword = $("authPassword");
const authConfirmPassword = $("authConfirmPassword");
const authPlatform = $("authPlatform");
const authTerms = $("authTerms");

function showAlert(message, isError = true) {
  authAlert.className = isError
    ? "p-3 rounded-xl text-xs font-semibold border flex items-center gap-2 bg-rose-950/40 border-rose-500/40 text-rose-300"
    : "p-3 rounded-xl text-xs font-semibold border flex items-center gap-2 bg-emerald-950/40 border-emerald-500/40 text-emerald-300";
  authAlert.innerHTML = "";
  const icon = document.createElement("i");
  icon.className = `fa-solid ${isError ? "fa-triangle-exclamation" : "fa-circle-check"} text-sm shrink-0`;
  const text = document.createElement("span");
  text.textContent = message; // nunca innerHTML con mensajes externos
  authAlert.append(icon, text);
  authAlert.classList.remove("hidden");
}

function hideAlert() {
  authAlert.classList.add("hidden");
}

function show(id, visible) {
  $(id).classList.toggle("hidden", !visible);
}

function setMode(newMode) {
  mode = newMode;
  const m = MODES[mode];
  hideAlert();

  $("authTitle").innerText = m.title;
  $("authSubtitle").innerText = m.subtitle;
  $("headerIcon").className = m.headerIcon;
  btnText.innerText = m.button;
  btnIcon.className = m.buttonIcon;
  toggleAuthBtn.innerText = m.toggle;

  const isRegister = mode === "register";
  show("usernameField", isRegister);
  show("platformField", isRegister);
  show("termsField", isRegister);
  show("confirmPasswordField", isRegister || mode === "reset");
  show("emailField", mode !== "reset");
  show("passwordField", mode !== "forgot");
  show("forgotRow", mode === "login");

  authUsername.required = isRegister;
  authConfirmPassword.required = isRegister || mode === "reset";
  authEmail.required = mode !== "reset";
  authPassword.required = mode !== "forgot";
  authPassword.autocomplete = mode === "login" ? "current-password" : "new-password";
}

function setBusy(busy, label) {
  authSubmitBtn.disabled = busy;
  if (busy) {
    btnIcon.className = "fa-solid fa-spinner fa-spin";
    btnText.innerText = label;
  } else {
    btnIcon.className = MODES[mode].buttonIcon;
    btnText.innerText = MODES[mode].button;
  }
}

function friendlyError(err) {
  const msg = err?.message || "Ocurrió un error. Inténtalo de nuevo.";
  if (msg.includes("Invalid login credentials")) return "Correo o contraseña incorrectos.";
  if (msg.includes("Email not confirmed")) return "Tu correo aún no está confirmado. Revisa tu bandeja de entrada (y la carpeta de spam).";
  if (msg.includes("User already registered")) return "Ese correo ya está registrado. Inicia sesión o recupera tu contraseña.";
  if (msg.toLowerCase().includes("rate limit")) return "Demasiados intentos. Espera unos minutos y vuelve a probar.";
  if (msg.includes("Password should be")) return "La contraseña es muy débil. Usa al menos 8 caracteres.";
  return msg;
}

toggleAuthBtn.addEventListener("click", () => {
  if (mode === "login") setMode("register");
  else {
    if (mode === "reset") history.replaceState(null, "", "/login");
    setMode("login");
  }
});

forgotBtn.addEventListener("click", () => setMode("forgot"));

// Normaliza el username mientras se escribe
authUsername.addEventListener("input", () => {
  const clean = authUsername.value.toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (clean !== authUsername.value) authUsername.value = clean;
});

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideAlert();

  if (typeof DB === "undefined" || !window.supabaseClient) {
    showAlert("No se pudo conectar con el servidor. Recarga la página.");
    return;
  }

  const email = authEmail.value.trim();
  const password = authPassword.value;

  try {
    if (mode === "login") {
      setBusy(true, "ENTRANDO...");
      await DB.signIn(email, password);
      showAlert("Sesión iniciada. Entrando a tu estante...", false);
      setTimeout(() => { window.location.href = "/estante"; }, 500);
      return;
    }

    if (mode === "register") {
      const username = authUsername.value.trim().toLowerCase();
      if (!USERNAME_RE.test(username)) {
        throw new Error("El nombre de usuario debe tener de 3 a 20 caracteres: letras minúsculas, números y _.");
      }
      if (password.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres.");
      if (password !== authConfirmPassword.value) throw new Error("Las contraseñas no coinciden.");
      if (!authTerms.checked) throw new Error("Debes aceptar los términos y la política de privacidad.");

      setBusy(true, "CREANDO CUENTA...");
      if (!(await DB.usernameAvailable(username))) {
        throw new Error(`El nombre "${username}" ya está en uso. Prueba con otro.`);
      }

      const data = await DB.signUp(email, password, username, { preferred_platform: authPlatform.value });

      if (data.session) {
        showAlert("¡Cuenta creada! Entrando a tu estante...", false);
        setTimeout(() => { window.location.href = "/estante"; }, 800);
      } else {
        // Supabase exige confirmar el correo antes de entrar
        authForm.reset();
        setMode("login");
        showAlert(`¡Cuenta creada! Te enviamos un correo a ${email}. Confirma tu cuenta desde ese enlace y luego inicia sesión.`, false);
      }
      return;
    }

    if (mode === "forgot") {
      setBusy(true, "ENVIANDO...");
      await DB.sendPasswordReset(email);
      showAlert(`Si existe una cuenta con ${email}, te llegará un enlace para cambiar la contraseña.`, false);
      return;
    }

    if (mode === "reset") {
      if (password.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres.");
      if (password !== authConfirmPassword.value) throw new Error("Las contraseñas no coinciden.");
      setBusy(true, "GUARDANDO...");
      await DB.updatePassword(password);
      showAlert("Contraseña actualizada. Entrando a tu estante...", false);
      setTimeout(() => { window.location.href = "/estante"; }, 900);
    }
  } catch (err) {
    console.error(err);
    showAlert(friendlyError(err));
  } finally {
    setBusy(false);
  }
});

// Arranque: ¿viene del enlace de recuperación? ¿ya tiene sesión?
(async () => {
  const isRecovery = new URLSearchParams(window.location.search).has("reset");

  if (window.supabaseClient) {
    supabaseClient.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setMode("reset");
    });
  }

  if (isRecovery) {
    setMode("reset");
    return;
  }

  setMode("login");
  try {
    const user = await DB.getUser();
    if (user) window.location.href = "/estante";
  } catch (e) { /* sin sesión */ }
})();

// ---------- Entrar con Google ----------
// El botón solo aparece si Google está activado en Supabase (Authentication → Providers)
(async () => {
  const bloque = document.getElementById("googleBloque");
  const boton = document.getElementById("googleBtn");
  if (!bloque || !boton || !window.supabaseClient) return;
  try {
    const r = await fetch("https://epouactrnuhdbzzvzxor.supabase.co/auth/v1/settings", { headers: { apikey: "sb_publishable_i2sc-SaHk8H6e3c-Dwf0IQ_hhdBlx_I" } });
    const ajustes = await r.json();
    if (!ajustes?.external?.google) return;
  } catch (e) { return; }
  bloque.hidden = false;
  boton.addEventListener("click", async () => {
    boton.disabled = true;
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/estante`, queryParams: { prompt: "select_account" } }
    });
    if (error) { boton.disabled = false; showAlert("No se pudo abrir Google. Inténtalo de nuevo."); }
  });
})();
