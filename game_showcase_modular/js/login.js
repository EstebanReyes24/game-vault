/**
 * Lógica de la página independiente de Autenticación con campos extendidos
 */
let isSignUpMode = false;

const authTitle = document.getElementById("authTitle");
const authSubtitle = document.getElementById("authSubtitle");
const authForm = document.getElementById("authForm");

const usernameField = document.getElementById("usernameField");
const authUsername = document.getElementById("authUsername");

const authEmail = document.getElementById("authEmail");
const authPassword = document.getElementById("authPassword");

const confirmPasswordField = document.getElementById("confirmPasswordField");
const authConfirmPassword = document.getElementById("authConfirmPassword");

const platformField = document.getElementById("platformField");
const authPlatform = document.getElementById("authPlatform");

const termsField = document.getElementById("termsField");
const authTerms = document.getElementById("authTerms");

const authSubmitBtn = document.getElementById("authSubmitBtn");
const btnText = document.getElementById("btnText");
const btnIcon = document.getElementById("btnIcon");
const toggleAuthBtn = document.getElementById("toggleAuthBtn");
const authAlert = document.getElementById("authAlert");

function showAlert(message, isError = true) {
  authAlert.className = isError
    ? "p-3 rounded-xl text-xs font-semibold border flex items-center gap-2 bg-rose-950/40 border-rose-500/40 text-rose-300"
    : "p-3 rounded-xl text-xs font-semibold border flex items-center gap-2 bg-emerald-950/40 border-emerald-500/40 text-emerald-300";
  authAlert.innerHTML = `
    <i class="fa-solid ${isError ? 'fa-triangle-exclamation' : 'fa-circle-check'} text-sm shrink-0"></i>
    <span>${message}</span>
  `;
  authAlert.classList.remove("hidden");
}

function hideAlert() {
  authAlert.classList.add("hidden");
}

// Alternar entre Inicio de Sesión y Registro
toggleAuthBtn.addEventListener("click", () => {
  hideAlert();
  isSignUpMode = !isSignUpMode;

  if (isSignUpMode) {
    authTitle.innerText = "Crear Cuenta de Jugador";
    authSubtitle.innerText = "Registra tu gamertag y respalda tu colección en la nube";
    btnText.innerText = "CREAR MI CUENTA";
    btnIcon.className = "fa-solid fa-user-plus";
    toggleAuthBtn.innerText = "¿Ya tienes cuenta? Inicia sesión aquí";

    // Mostrar campos extendidos
    usernameField.classList.remove("hidden");
    confirmPasswordField.classList.remove("hidden");
    platformField.classList.remove("hidden");
    termsField.classList.remove("hidden");

    authUsername.required = true;
    authConfirmPassword.required = true;
  } else {
    authTitle.innerText = "Iniciar Sesión";
    authSubtitle.innerText = "Conecta tu cuenta para sincronizar tus juegos en la nube";
    btnText.innerText = "ENTRAR A MI ESTANTE";
    btnIcon.className = "fa-solid fa-arrow-right-to-bracket";
    toggleAuthBtn.innerText = "¿No tienes cuenta? Regístrate aquí";

    // Ocultar campos extendidos
    usernameField.classList.add("hidden");
    confirmPasswordField.classList.add("hidden");
    platformField.classList.add("hidden");
    termsField.classList.add("hidden");

    authUsername.required = false;
    authConfirmPassword.required = false;
  }
});

// Enviar formulario
authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideAlert();

  const email = authEmail.value.trim();
  const pass = authPassword.value;

  if (isSignUpMode) {
    const username = authUsername.value.trim();
    const confirmPass = authConfirmPassword.value;
    const platform = authPlatform.value;

    if (username.length < 3) {
      showAlert("El nombre de usuario debe tener al menos 3 caracteres.");
      authUsername.focus();
      return;
    }

    if (pass !== confirmPass) {
      showAlert("Las contraseñas no coinciden. Verifícalas.");
      authConfirmPassword.focus();
      return;
    }

    if (!authTerms.checked) {
      showAlert("Debes aceptar los Términos y Normas de Autoría para continuar.");
      return;
    }

    authSubmitBtn.disabled = true;
    btnIcon.className = "fa-solid fa-spinner fa-spin";
    btnText.innerText = "CREANDO CUENTA...";

    try {
      // Guardar metadata en el perfil de Auth de Supabase
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password: pass,
        options: {
          data: {
            username: username,
            preferred_platform: platform
          }
        }
      });

      if (error) throw error;

      showAlert("¡Cuenta creada exitosamente! Conectando...", false);

      // Auto-login tras el registro
      setTimeout(async () => {
        try {
          await DB.signIn(email, pass);
          window.location.href = "app.html";
        } catch (loginErr) {
          showAlert("Cuenta registrada. Ingresa tus datos para iniciar sesión.", false);
          toggleAuthBtn.click();
        }
      }, 800);

    } catch (err) {
      let msg = err.message || "Error al registrarse.";
      if (msg.includes("User already registered")) {
        msg = "Ese correo ya está registrado. Pulsa 'Inicia sesión aquí'.";
      }
      showAlert(msg, true);
    } finally {
      authSubmitBtn.disabled = false;
      btnIcon.className = "fa-solid fa-user-plus";
      btnText.innerText = "CREAR MI CUENTA";
    }

  } else {
    // Modo Inicio de Sesión
    authSubmitBtn.disabled = true;
    btnIcon.className = "fa-solid fa-spinner fa-spin";
    btnText.innerText = "ENTRANDO...";

    try {
      await DB.signIn(email, pass);
      showAlert("¡Acceso concedido! Entrando a tu estante...", false);
      setTimeout(() => {
        window.location.href = "app.html";
      }, 500);
    } catch (err) {
      let msg = err.message || "Error al iniciar sesión.";
      if (msg.includes("Invalid login credentials")) {
        msg = "Credenciales incorrectas. Verifica tu correo y contraseña.";
      } else if (msg.includes("Email not confirmed")) {
        msg = "Tu correo no ha sido confirmado. Revisa tu bandeja de entrada o desmarca 'Confirm email' en tu panel de Supabase.";
      }
      showAlert(msg, true);
    } finally {
      authSubmitBtn.disabled = false;
      btnIcon.className = "fa-solid fa-arrow-right-to-bracket";
      btnText.innerText = "ENTRAR A MI ESTANTE";
    }
  }
});

// Redirección si ya hay sesión activa
(async () => {
  try {
    const user = await DB.getUser();
    if (user) {
      window.location.href = "app.html";
    }
  } catch (e) {}
})();