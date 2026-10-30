// Página sin conexión: "Reintentar" recarga, y vuelve sola cuando regresa internet
document.getElementById("reintentar")?.addEventListener("click", (e) => { e.preventDefault(); location.reload(); });
window.addEventListener("online", () => location.reload());
