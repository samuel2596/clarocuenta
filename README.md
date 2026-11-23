# ClaroCuenta

App web progresiva para llevar finanzas personales en pesos mexicanos. Registra ingresos y gastos manualmente, edita movimientos, consulta el saldo mensual, revisa gastos por categoría y fija un presupuesto por mes. El botón **Cargar datos de ejemplo** crea movimientos ficticios en el periodo seleccionado.

## Probar en tu computadora

Desde esta carpeta, ejecuta:

```sh
python3 -m http.server 8000
```

Abre [http://localhost:8000](http://localhost:8000). Usa HTTPS o localhost para que el navegador pueda instalar la app y habilitar la caché sin conexión. Visita la página en línea antes de usarla sin conexión. Para instalarla, usa la opción del navegador si está disponible. En iPhone, abre la página en Safari y usa **Compartir → Agregar a pantalla de inicio**.

La app usa el almacenamiento local del navegador. Los datos pertenecen al sitio y al perfil que usaste. Cambiar de navegador o de URL inicia otro conjunto de datos. Borrar los datos del sitio elimina los movimientos y presupuestos guardados. Esta versión no incluye sincronización, cuentas de usuario ni conexión bancaria.

## Subir a GitHub

Crea un repositorio vacío llamado `clarocuenta`, sin README inicial. Desde esta carpeta, cambia `TU_USUARIO` por tu nombre de usuario y ejecuta:

```sh
git init -b main
git add .
git commit -m "Primera versión de ClaroCuenta"
git remote add origin https://github.com/TU_USUARIO/clarocuenta.git
git push -u origin main
```

Para publicar, abre **Settings → Pages → Deploy from a branch**, elige **main** y **/(root)**, y guarda. GitHub mostrará el enlace de la app cuando termine el despliegue. El sitio publicado sirve los archivos del repositorio y cada visitante guarda sus movimientos en su propio navegador. Consulta la [guía de GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

## Base de datos

Git versiona archivos. Puedes guardar migraciones SQL y datos ficticios en el repositorio. También puedes versionar técnicamente un archivo SQLite, pero GitHub Pages lo serviría como archivo estático, sin motor de base de datos ni escrituras. Mantén fuera del repositorio las credenciales, los respaldos y los movimientos reales.

Para sincronizar datos entre dispositivos, una ampliación posible es Supabase con PostgreSQL, Supabase Auth y políticas por usuario. Versiona las migraciones en GitHub, configura los permisos y guarda los datos reales en la base de datos. Consulta la [documentación sobre seguridad por fila](https://supabase.com/docs/guides/database/postgres/row-level-security).
