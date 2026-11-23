# ClaroCuenta

App web progresiva para llevar finanzas personales en pesos mexicanos. Registra ingresos y gastos manualmente, edita movimientos, consulta el saldo mensual, revisa gastos por categoría y fija un presupuesto por mes.

## Categorías

Abre **Categorías**, elige **Gasto** o **Ingreso**, escribe el nombre y pulsa **Crear categoría**. La lista de categorías empieza vacía. Las que crees aparecen al registrar o editar un movimiento de ese tipo. Al editar un movimiento anterior, puedes conservar la categoría que ya tenía. Con Drive conectado, las categorías forman parte de la sincronización. En la barra superior, **Actualizar** sincroniza Drive y **Recargar** vuelve a abrir la página cuando usas los datos locales.

## Reportes e instalación

Abre **Reportes** en la barra superior. Marca o desmarca los años y meses con movimientos para filtrar las gráficas y tablas. El ahorro de cada mes es el ingreso menos el gasto y puede ser negativo. **Mostrar todos** restablece los filtros.

Usa **Instalar app** en la barra superior. En iPhone o iPad, abre ClaroCuenta en Safari y usa **Compartir → Agregar a pantalla de inicio**. La PWA puede abrir después de una visita inicial con conexión. Google Drive necesita internet para conectarse y sincronizar.

## Probar en tu computadora

Desde esta carpeta, ejecuta:

```sh
python3 -m http.server 8000
```

Abre [http://localhost:8000](http://localhost:8000). Usa HTTPS o localhost para que el navegador pueda instalar la app y habilitar la caché sin conexión. Visita la página en línea antes de usarla sin conexión. Para instalarla, usa la opción del navegador si está disponible. En iPhone, abre la página en Safari y usa **Compartir → Agregar a pantalla de inicio**.

La app usa el almacenamiento local del navegador. Los datos pertenecen al sitio y al perfil que usaste. Cambiar de navegador o de URL inicia otro conjunto de datos. Borrar los datos del sitio elimina los movimientos y presupuestos guardados. Sin conexión a Google Drive, los movimientos se guardan solo en el navegador. Los movimientos se capturan manualmente.

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

## Conectar Google Drive

1. Abre la [consola de Google Cloud](https://console.cloud.google.com/), crea un proyecto **ClaroCuenta** y [habilita Google Drive API](https://console.cloud.google.com/apis/library/drive.googleapis.com).
2. En **Google Auth Platform → Branding**, configura el nombre **ClaroCuenta**, el correo de asistencia y el contacto del desarrollador. Para una cuenta personal de Google, usa **Audience → External** y agrega tu correo en **Test users** mientras el proyecto esté en **Testing**.
3. En **Data Access**, agrega el permiso `https://www.googleapis.com/auth/drive.file`.
4. En **Clients → Create client**, selecciona **Web application**. En **Authorized JavaScript origins** agrega `https://samuel2596.github.io`, sin ruta. Para una prueba local, puedes agregar también `http://localhost` y `http://localhost:8000`. El flujo de ventana emergente no necesita configurar una URI de redirección.
5. Copia solo el **Client ID**, que termina en `.apps.googleusercontent.com`, al campo `clientId` de `cloud-config.js`. Sube la actualización a la raíz del repositorio de GitHub y espera el nuevo despliegue de Pages.
6. Abre ClaroCuenta en el navegador donde tienes los datos locales. Pulsa **Conectar Google Drive**, elige tu cuenta y autoriza el acceso. Usa **Importar datos de este navegador** para copiar tus movimientos y presupuestos. La carpeta `ClaroCuenta` y el archivo `movimientos-y-presupuestos.json` se crean al guardar por primera vez.
7. En tu otro dispositivo, entra a la misma página y conecta la misma cuenta de Google. Con la app abierta y Drive conectado, cada cinco minutos se guardan los cambios pendientes o se consulta Drive si no queda nada por guardar. También puedes usar **Guardar ahora** y **Actualizar datos**. Los borradores pendientes se conservan en el navegador donde se editaron y se recuperan al conectar la misma cuenta.

El archivo pertenece a tu cuenta y usa el espacio disponible en Mi unidad. Evita compartirlo o editarlo manualmente si quieres conservarlo privado. La app guarda los tokens temporales de Google en memoria y puede pedir que vuelvas a conectar al recargar o al expirar el permiso. ClaroCuenta comprueba la versión del archivo antes de escribir. Usa un dispositivo a la vez al editar, ya que la comprobación y la escritura son solicitudes separadas.

Consulta la [guía de OAuth web](https://developers.google.com/identity/oauth2/web/guides/get-google-api-clientid) y los [permisos de Drive](https://developers.google.com/workspace/drive/api/guides/api-specific-auth).
