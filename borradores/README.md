# Borradores de noticias

Una tarea programada de Claude investiga dos veces al día (6:44 y 18:44, hora de La Paz) las noticias de videojuegos
y escribe aquí los borradores en `noticias.json`. El admin los revisa en la
portada con el botón **Noticias por revisar** (solo lo ve el admin) y pulsa
**Publicar** o **Descartar**. Lo revisado se guarda en la tabla
`news_drafts_done` (migración `003_borradores.sql`) y no vuelve a salir.

## Formato

```json
{
  "actualizado": "2026-10-29T11:40:00Z",
  "borradores": [
    {
      "id": "2026-10-29-silksong-fecha-lanzamiento",
      "fecha": "2026-10-29",
      "titulo": "Título de la noticia",
      "juego": "Nombre exacto del juego en RAWG",
      "etiqueta": "#Silksong",
      "imagen": "",
      "contenido": "Párrafo 1.\n\nPárrafo 2.\n\nPárrafo 3.",
      "fuentes": [
        { "nombre": "Medio 1", "url": "https://..." },
        { "nombre": "Medio 2", "url": "https://..." }
      ]
    }
  ]
}
```

- `id`: único y estable (fecha + slug). Si cambia, el borrador vuelve a aparecer.
- `juego`: se usa para buscar el arte oficial en RAWG; el admin escoge entre 4 opciones.
- `imagen`: opcional; solo un enlace `https` a arte oficial (nunca fotos de otros medios).
- `contenido`: texto plano, párrafos separados por una línea en blanco. Al publicar
  se añaden solas la línea de fuentes y la nota de que el resumen se preparó con IA.
- Se conservan solo los borradores de los últimos 10 días.

Este archivo es público (se sirve con la web), así que no debe contener nada privado.
