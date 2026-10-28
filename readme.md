# Paindex Vault

Estante de juegos y portal de la comunidad del canal [Paindex](https://youtube.com/@paindexhq).

> Plataforma web interactiva para catalogar partidas, registrar estadísticas de juego y publicar crónicas, análisis y reflexiones de la comunidad gamer. Desarrollada con un diseño de interfaz estilo consola (*Glassmorphism* y modo oscuro cinemático), backend serverless sobre Supabase y soporte nativo como PWA.

---

## 🌟 Características Principales

### 1. Portal Oficial (`index.html`)
- **Branding Paindex:** Integración de enlaces oficiales al canal y estética personalizada.
- **Ticker Neón Animado (Marquee):** Cinta de novedades y lemas con desplazamiento fluido infinito.
- **Métricas Globales de la Comunidad:** Indicadores en vivo de horas jugadas, títulos catalogados, platinos y juegos en tendencia.
- **Hall of Fame Dinámico:** 4 obras maestras destacadas editables en caliente desde la interfaz para el usuario administrador.
- **Feed de Crónicas & Artículos:** Sistema de publicaciones categorizadas (`⭐ Recomendaciones`, `💡 Reflexiones`, `🔍 Análisis`, `📢 Noticias`) con filtros interactivos reactivos.
- **Interacción Social:** Likes por usuario en tiempo real y sistema de comentarios/debate debajo de cada artículo.
- **Buscador Rápido (`Ctrl + K`):** Modal de búsqueda en vivo entre artículos, títulos y etiquetas.

### 2. Estante Personal & Dashboard (`app.html`)
- **Spotlight "Jugando Ahora":** Banner con carrusel cinemático de fundido cruzado (*crossfade*) para alternar títulos en curso.
- **Métricas Personales:** Conteo de juegos completados, platinos (100%), horas totales dedicadas y promedio de puntuación.
- **Buscador Asistido de Carátulas:** Integración con motor de búsqueda y generador inteligente de portadas en Canvas cuando no hay imagen disponible.
- **Vistas Personalizables:** Alternancia entre cuadrícula de pósters con efecto 3D y vista de lista compacta.
- **Perfiles Públicos Compartibles:** Modo espectador accesible mediante parámetro de URL (`app.html?u=usuario`) para compartir estantes en modo solo lectura.
- **Herramientas de Exportación:** Descarga/restauración de copias de seguridad en JSON, generación de tarjetas compartibles en PNG y resumen tipo *Player Wrapped*.

### 3. Autenticación & Soporte Offline (PWA)
- **Cuentas en la Nube:** Inicio de sesión y registro mediante Supabase Auth con sincronización automática bidireccional (Local/Nube).
- **Progressive Web App (PWA):** Instalable en Android, iOS, Windows y macOS con funcionamiento independiente a pantalla completa mediante `manifest.json` y `sw.js`.

---

## 🛠️ Tecnologías Utilizadas

- **Frontend:** HTML5 semántico, Vanilla JavaScript (ES6+), Web Audio API (efectos de sonido sintéticos).
- **Estilos & Diseño:** Tailwind CSS 3 compilado (Vercel ejecuta `npm run build` y genera `css/tw.css`; la configuración y la paleta están en `tailwind.config.js`), Font Awesome 6, Google Fonts (*Big Shoulders Display* para títulos y *Archivo* para texto). La identidad visual vive en `css/paindex.css` (paleta y componentes) y `tailwind.config.js` (remapea las escalas de color de Tailwind a la paleta Paindex). Para trabajar en local: `npm install` y `npx tailwindcss -i css/tw-input.css -o css/tw.css --watch`.
- **Renderizado Gráfico:** HTML5 Canvas API para generación de pósters y tarjetas de juego.
- **Backend & Almacenamiento:** [Supabase](https://supabase.com/) (PostgreSQL, Row Level Security, Auth y REST API en tiempo real).
- **Variables de entorno en Vercel:** `STEAM_API_KEY` (importar de Steam) y `RAWG_API_KEY` (portadas). Opcional: `CRON_SECRET` para el latido.
- **Mantenimiento:** `/api/latido` (cron de Vercel, lunes y jueves) evita que Supabase pause el proyecto; `.github/workflows/respaldo.yml` hace un respaldo cifrado cada domingo.
- **PWA:** Web App Manifest y Service Worker nativo para caché de recursos estáticos.

---

## 🗄️ Esquema de Base de Datos (Supabase SQL)

El proyecto utiliza las siguientes tablas base. **Después de crearlas, aplica la migración [`supabase/migrations/001_fase0.sql`](supabase/migrations/001_fase0.sql)**, que añade la tabla `profiles` (usuarios únicos y estante público/privado), cambia la clave de `games` a `(user_id, id)`, reemplaza las políticas RLS de `games`, protege los comentarios y crea las funciones `community_stats`, `username_available` y `delete_my_account`. Luego aplica [`002_borrado_en_cascada.sql`](supabase/migrations/002_borrado_en_cascada.sql), que asegura que borrar una cuenta borre también todos sus datos. Después [`003_borradores.sql`](supabase/migrations/003_borradores.sql) (borradores de noticias) y [`004_esenciales_semana.sql`](supabase/migrations/004_esenciales_semana.sql) (Esenciales automáticos: cada lunes la portada combina los fijados en `hall_of_fame` con los juegos de Paindex de nota 9 o más) y [`005_moderacion.sql`](supabase/migrations/005_moderacion.sql) (reportes de comentarios, ocultación automática con 3 reportes y bloqueo de usuarios) y [`006_social.sql`](supabase/migrations/006_social.sql) (seguir jugadores y actividad automática de los estantes públicos) [`007_listas.sql`](supabase/migrations/007_listas.sql) (listas de juegos) [`008_resenas.sql`](supabase/migrations/008_resenas.sql) (reseñas de usuarios, destacadas y reportes) y [`009_admin_por_rol.sql`](supabase/migrations/009_admin_por_rol.sql) (el admin se identifica por el rol `admin` de su cuenta, no por su correo) [`010_errores.sql`](supabase/migrations/010_errores.sql) (registro de errores del navegador, visible en Moderación) y [`011_videos.sql`](supabase/migrations/011_videos.sql) ("Para mis videos", banco de ideas privado del admin).

```sql
-- 1. Tabla de Catálogo de Juegos
create table if not exists public.games (
  id bigint primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  cover_url text,
  status text not null,
  platforms text[] default array['PC']::text[],
  rating numeric(3,1) default 0,
  hours integer default 0,
  target_hours integer default 0,
  completed_year integer,
  favorite boolean default false,
  tags text[] default array[]::text[],
  notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.games enable row level security;
create policy "Juegos visibles públicamente" on public.games for select using (true);
create policy "Usuarios gestionan sus propios juegos" on public.games
  for all using (auth.uid() = user_id);

-- 2. Tabla de Crónicas y Artículos
create table if not exists public.posts (
  id bigint generated by default as identity primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  category text not null,
  game_tag text,
  cover_url text,
  content text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.posts enable row level security;
create policy "Posts públicos" on public.posts for select using (true);
create policy "Solo admin edita y crea posts" on public.posts
  for all using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- 3. Tabla de Comentarios
create table if not exists public.post_comments (
  id bigint generated by default as identity primary key,
  post_id bigint references public.posts(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  username text not null,
  comment text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.post_comments enable row level security;
create policy "Comentarios públicos" on public.post_comments for select using (true);
create policy "Usuarios comentan" on public.post_comments for insert with check (auth.uid() = user_id);
create policy "Borrar comentarios" on public.post_comments for delete using (
  auth.uid() = user_id or (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
);

-- 4. Tabla de Reacciones (Likes)
create table if not exists public.post_likes (
  id bigint generated by default as identity primary key,
  post_id bigint references public.posts(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(post_id, user_id)
);

alter table public.post_likes enable row level security;
create policy "Likes públicos" on public.post_likes for select using (true);
create policy "Usuarios dan like" on public.post_likes for insert with check (auth.uid() = user_id);
create policy "Usuarios quitan like" on public.post_likes for delete using (auth.uid() = user_id);

-- 5. Tabla de Hall of Fame
create table if not exists public.hall_of_fame (
  id int primary key,
  title text not null,
  cover_url text not null,
  rating numeric(3,1) not null default 10.0,
  tag text not null default '#Destacado',
  progress text not null default 'Platino • 100h',
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.hall_of_fame enable row level security;
create policy "Hall of fame público" on public.hall_of_fame for select using (true);
create policy "Solo admin edita hall of fame" on public.hall_of_fame
  for update using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
```

---

## 📁 Estructura del Proyecto

```text
├── css/
│   └── styles.css          # Reglas personalizadas, animaciones neón y temas
├── api/
│   └── steam.js            # Función serverless: importación desde Steam (usa STEAM_API_KEY)
├── supabase/
│   └── migrations/         # SQL a ejecutar en Supabase (en orden)
├── js/
│   ├── app.js              # Controlador principal del estante de juegos
│   ├── canvas-poster.js    # Generador gráfico Canvas para portadas y tarjetas
│   ├── landing.js          # Lógica del portal, crónicas, likes y comentarios
│   ├── login.js            # Login, registro y recuperación de contraseña
│   ├── search.js           # Búsqueda en catálogos externos de portadas
│   ├── storage.js          # Abstracción de LocalStorage
│   └── supabase.js         # Cliente y API methods para Supabase
├── app.html                # Interfaz del estante de videojuegos
├── index.html              # Portada oficial del canal Paindex
├── legal.html              # Términos, condiciones y licencia
├── login.html              # Pantalla de acceso y registro de cuentas
├── manifest.json           # Configuración PWA
├── sw.js                   # Service Worker para caché offline
└── README.md               # Documentación del proyecto
```

---

## 🚀 Despliegue en Producción

### En Vercel
1. Conecta tu repositorio de GitHub en [vercel.com](https://vercel.com).
2. Deja la configuración de compilación por defecto (proyecto estático sin build step).
3. En **Settings → Environment Variables** crea `STEAM_API_KEY` con tu clave de [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey). **Nunca** escribas la clave en el código: el repositorio es público.
4. Haz clic en **Deploy**.

### En Netlify
1. Arrastra la carpeta raíz de tu proyecto sobre [app.netlify.com/drop](https://app.netlify.com/drop).
2. Tu sitio estará disponible de inmediato bajo un subdominio `.netlify.app`.

### Configuración requerida en Supabase tras el despliegue
En tu consola de Supabase:
1. Navega a **Authentication** -> **URL Configuration**.
2. Asigna tu dominio de producción en **Site URL** (ej: `https://tu-sitio.vercel.app`).
3. Agrega la regla comodín en **Redirect URLs**: `https://tu-sitio.vercel.app/**`.

---

## 📄 Licencia

Este proyecto está bajo los términos de uso libre y personal desarrollados para la comunidad del canal **Paindex** © 2026.
