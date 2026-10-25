# Chiaven – Red privada de agencias

## Cómo ejecutar el proyecto localmente

Este repositorio contiene una aplicación web estática escrita en HTML, CSS y JavaScript. No hay dependencias de Node ni un proceso de compilación necesario, pero para que el enrutamiento y el Service Worker funcionen correctamente se recomienda servir los archivos mediante un servidor HTTP estático.

### Requisitos previos
- Tener **Node.js** instalado (para usar `npx` o `npm`).
- Opcionalmente, **Python** (para usar su servidor HTTP simple).

### Opción 1 – Abrir directamente en el navegador
1. Haz doble clic en `index.html` o ábrelo con tu navegador favorito.
2. Esta forma funciona para visualizar la UI, pero el **Service Worker (`sw.js`)** y las rutas de redirección no se activarán correctamente.

### Opción 2 – Servidor estático con `http-server` (Node)
```bash
# Ejecuta el servidor sin instalar paquetes globalmente
npx -y http-server ./ -p 8080
```
- Abre `http://localhost:8080` en tu navegador.
- El servidor servirá todos los archivos y el Service Worker podrá registrarse.

### Opción 3 – Servidor estático con `serve` (Node)
```bash
npx -y serve . -l 8080
```
- Visita `http://localhost:8080`.

### Opción 4 – Servidor HTTP con Python
```bash
python -m http.server 5500
```
- Accede a `http://localhost:5500`.

### Opción 5 – Usar Netlify CLI (si deseas emular el entorno de Netlify)
```bash
npm install -g netlify-cli   # o usar npx sin instalar globalmente
netlify dev
```
- Netlify CLI leerá `netlify.toml` y simulará el comportamiento de redirecciones y encabezados.

### Verifica que el proyecto funciona
- La página de inicio debería cargarse sin errores.
- Abre la consola del navegador (F12) y verifica que no aparezcan errores 404.
- Si ves el **loader** y la aplicación completa, todo está correcto.

---
**Consejo:** Si realizas cambios en los archivos JavaScript o CSS, simplemente recarga la página para ver el resultado.
