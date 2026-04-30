# FAFutsala Team App

Aplicacion estatica en espanol para presentar la informacion relevante de un equipo: resumen, plantilla, estadisticas de jugadores, partidos y clasificacion.

## Estructura

- `index.html`: carcasa principal de la aplicacion.
- `assets/styles.css`: estilos y diseno responsive.
- `assets/app.js`: carga de datos, renderizado y navegacion por hash.
- `data/*.json`: datos normalizados del equipo, jugadores y partidos.
- `tools/import-team-data.js`: importador asistido por navegador para refrescar datos.

## Scripts

- `npm run dev`: levanta un servidor estatico en `http://localhost:4173`.
- `npm run import`: ejecuta el importador y actualiza los JSON locales.
- `npm run check`: valida la sintaxis del importador.

## Estado inicial

El proyecto ya incluye un importador real para el equipo `https://fafutsala.com/es/team/15680295`. Ejecuta `npm run import` para regenerar los JSON locales con plantilla, resultados, próximos partidos y clasificación oficiales.

## Despliegue en GitHub Pages

El proyecto puede publicarse directamente con GitHub Pages usando el workflow [`pages-refresh.yml`](./.github/workflows/pages-refresh.yml).

### Que hace el workflow

- Ejecuta `npm run import` cada hora.
- Actualiza `data/team.json`, `data/players.json` y `data/matches.json`.
- Hace commit automatico si detecta cambios en esos JSON.
- Publica el sitio estatico en GitHub Pages.

### Lo que necesitas en GitHub

1. Subir este proyecto a un repositorio de GitHub.
2. En `Settings -> Pages`, seleccionar `GitHub Actions` como fuente de despliegue.
3. En `Settings -> Actions -> General`, permitir permisos de lectura y escritura para `GITHUB_TOKEN`.
4. Mantener la rama principal como `main` o `master`.

### Notas

- No necesitas Python en produccion.
- GitHub Pages sirve solo los archivos estaticos generados.
- El importador se ejecuta dentro de GitHub Actions con Node.js y Playwright.
- Si el origen externo bloquea temporalmente el scraping, el sitio seguira mostrando el ultimo JSON publicado correctamente.
