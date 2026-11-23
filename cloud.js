(() => {
  const clientId = window.claroCuentaCloud?.clientId;
  if (!clientId) return;

  const scope = "https://www.googleapis.com/auth/drive.file";
  const api = "https://www.googleapis.com/drive/v3/";
  const uploadApi = "https://www.googleapis.com/upload/drive/v3/";
  const folderMime = "application/vnd.google-apps.folder";
  const account = byId("account");
  const status = byId("account-status");
  const connectButton = byId("connect-drive");
  const saveButton = byId("save-cloud");
  const refreshButton = byId("refresh-cloud");
  const importButton = byId("import-local");
  const signOutButton = byId("sign-out");
  const financePanel = byId("finance-panel");
  const imported = new Set();
  const drafts = new Map();
  let tokenClient;
  let token;
  let user;
  let record;
  let ready = false;
  let busy = false;
  let authorizing = false;
  let conflict = false;

  account.hidden = false;
  status.textContent = "Cargando conexión con Google…";

  function updateControls() {
    connectButton.hidden = Boolean(token);
    connectButton.disabled = !tokenClient || busy || authorizing;
    byId("account-session").hidden = !token;
    byId("account-email").textContent = user?.emailAddress ?? "";
    byId("storage-label").textContent = token ? "Datos de Google Drive" : "Datos en este dispositivo";
    const canEdit = !busy && (!token || ready);
    financePanel.inert = !canEdit;
    form.querySelector('button[type="submit"]').disabled = !canEdit;
    refreshButton.disabled = signOutButton.disabled = busy;
    const pending = Boolean(user && drafts.has(user.permissionId));
    saveButton.disabled = busy || !pending;
    byId("sync-pending").hidden = !pending;
    importButton.disabled = !ready || busy;
    importButton.hidden = !user || imported.has(user.permissionId) ||
      (!localData.movements.length && !Object.keys(localData.budgets).length);
  }

  function storeDraft(userId, draft) {
    const key = "clarocuenta-drive-draft:" + userId;
    if (draft) drafts.set(userId, draft);
    else drafts.delete(userId);
    try {
      if (draft) localStorage.setItem(key, JSON.stringify(draft));
      else localStorage.removeItem(key);
      return true;
    } catch {
      return false;
    }
  }

  function disconnect() {
    conflict = false;
    token = user = record = undefined;
    ready = false;
    saveToCloud = null;
    if (editor.open) editor.close();
    data = localData;
    render();
  }

  async function run(task, failure) {
    if (busy) return false;
    busy = true;
    updateControls();
    try {
      return await task();
    } catch (error) {
      if (error.status === 401) {
        disconnect();
        status.textContent = "La sesión de Google terminó. Conecta Drive de nuevo.";
      } else {
        status.textContent = error.message === "duplicate"
          ? "Hay varias copias en Drive. Conserva una sola copia activa de ClaroCuenta y vuelve a actualizar."
          : failure;
      }
      return false;
    } finally {
      busy = false;
      updateControls();
    }
  }

  async function request(base, path, params = {}, options = {}) {
    const url = new URL(path, base);
    url.search = new URLSearchParams(params);
    const response = await fetch(url, {
      ...options,
      headers: { Authorization: "Bearer " + token, ...options.headers },
      cache: "no-store",
    });
    if (!response.ok) {
      const error = new Error("Drive request failed");
      error.status = response.status;
      throw error;
    }
    return response;
  }

  async function listUnique(query) {
    const matches = [];
    let pageToken;
    do {
      const params = { q: "trashed = false and 'me' in owners and " + query, fields: "nextPageToken,files(id,version)", spaces: "drive" };
      if (pageToken) params.pageToken = pageToken;
      const response = await request(api, "files", params);
      const page = await response.json();
      matches.push(...page.files);
      if (matches.length > 1) throw new Error("duplicate");
      pageToken = page.nextPageToken;
    } while (pageToken);
    return matches[0];
  }

  function findRecord() {
    return listUnique("appProperties has { key='clarocuenta' and value='data-v1' }");
  }

  async function findOrCreateFolder() {
    const existing = await listUnique("mimeType = '" + folderMime + "' and appProperties has { key='clarocuenta' and value='folder-v1' }");
    if (existing) return existing.id;
    const response = await request(api, "files", { fields: "id" }, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "ClaroCuenta",
        mimeType: folderMime,
        appProperties: { clarocuenta: "folder-v1" },
      }),
    });
    return (await response.json()).id;
  }

  function validPayload(value) {
    return value && Array.isArray(value.movements) && value.movements.every((item) =>
      item && typeof item.id === "string" && typeof item.description === "string" &&
      typeof item.date === "string" && ["income", "expense"].includes(item.type) &&
      typeof item.category === "string" && Number.isSafeInteger(item.amount) && item.amount > 0) &&
      value.budgets && typeof value.budgets === "object" && !Array.isArray(value.budgets) &&
      Object.entries(value.budgets).every(([key, amount]) =>
        /^\d{4}-(0[1-9]|1[0-2])$/.test(key) && Number.isSafeInteger(amount) && amount >= 0);
  }

  async function readCloud() {
    const latest = await findRecord();
    if (ready && latest?.id === record?.id && latest?.version === record?.version) return;
    let next = emptyData();
    if (latest) {
      const response = await request(api, "files/" + latest.id, { alt: "media" });
      next = await response.json();
      if (!validPayload(next)) throw new Error("invalid-data");
    }
    record = latest;
    data = next;
    ready = true;
    render();
  }

  async function synchronize() {
    if (!token || busy || editor.open) return;
    const draft = drafts.get(user?.permissionId);
    if (draft) return writeCloud(draft);
    return refresh();
  }

  function refresh() {
    if (!token || busy || drafts.has(user?.permissionId)) return;
    return run(async () => {
      await readCloud();
      status.textContent = "Datos actualizados desde Drive.";
    }, "No se pudieron cargar los datos. Revisa la conexión y vuelve a actualizar.");
  }

  function queueSave(next) {
    if (!ready || busy) return false;
    const existing = drafts.get(user.permissionId);
    const stored = storeDraft(user.permissionId, { next, base: existing ? existing.base : record });
    data = next;
    render();
    updateControls();
    status.textContent = stored ? "Guardado automático cada cinco minutos."
      : "El navegador no pudo conservar el borrador. Usa Guardar ahora antes de cerrar.";
    return true;
  }

  async function writeCloud({ next, base }) {
    if (!ready) return false;
    const userId = user.permissionId;
    conflict = false;
    return run(async () => {
      const latest = await findRecord();
      if (latest?.id !== base?.id || latest?.version !== base?.version) {
        conflict = true;
        status.textContent = "Otro dispositivo cambió los datos en Drive. Tus cambios siguen pendientes. Usa Actualizar datos si quieres descartarlos y cargar la versión de Drive.";
        return false;
      }
      const parent = latest ? null : await findOrCreateFolder();

      const payload = JSON.stringify(next);
      let response;
      if (record) {
        response = await request(uploadApi, "files/" + record.id, { uploadType: "media", fields: "id,version" }, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: payload,
        });
      } else {
        const boundary = crypto.randomUUID();
        const metadata = { name: "movimientos-y-presupuestos.json", parents: [parent],
          mimeType: "application/json", appProperties: { clarocuenta: "data-v1" } };
        const parts = [
          "--" + boundary, "Content-Type: application/json; charset=UTF-8", "", JSON.stringify(metadata),
          "--" + boundary, "Content-Type: application/json; charset=UTF-8", "", payload,
          "--" + boundary + "--", "",
        ];
        response = await request(uploadApi, "files", { uploadType: "multipart", fields: "id,version" }, {
          method: "POST",
          headers: { "Content-Type": "multipart/related; boundary=" + boundary },
          body: parts.join("\r\n"),
        });
      }
      record = await response.json();
      storeDraft(userId);
      data = next;
      render();
      status.textContent = "Guardado en tu Google Drive.";
      return true;
    }, "No pudimos confirmar el guardado. Actualiza los datos desde Drive antes de reintentar.");
  }

  async function connect(result) {
    authorizing = false;
    updateControls();
    if (result.error || !result.access_token ||
        !google.accounts.oauth2.hasGrantedAllScopes(result, scope)) {
      status.textContent = "Google Drive necesita tu autorización para conectar la carpeta.";
      return;
    }
    token = result.access_token;
    saveToCloud = queueSave;
    data = emptyData();
    if (editor.open) editor.close();
    render();
    const connected = await run(async () => {
      const response = await request(api, "about", { fields: "user(emailAddress,permissionId)" });
      user = (await response.json()).user;
      try {
        if (localStorage.getItem("clarocuenta-drive-import:" + user.permissionId)) imported.add(user.permissionId);
      } catch {
        // The original local data remains available.
      }
      await readCloud();
      let pending = drafts.get(user.permissionId);
      if (!pending) {
        try {
          const saved = JSON.parse(localStorage.getItem("clarocuenta-drive-draft:" + user.permissionId));
          if (validPayload(saved?.next)) {
            drafts.set(user.permissionId, saved);
            pending = saved;
          }
        } catch {
          // Invalid or unavailable browser storage must not block access to Drive.
        }
      }
      if (pending) {
        data = pending.next;
        render();
      }
      status.textContent = "Google Drive conectado.";
      return true;
    }, "No se pudo abrir ClaroCuenta en Drive. Revisa la conexión y vuelve a intentarlo.");
    if (!connected && !user) {
      disconnect();
      updateControls();
    }
  }

  connectButton.addEventListener("click", () => {
    status.textContent = "Selecciona tu cuenta de Google.";
    authorizing = true;
    updateControls();
    try {
      tokenClient.requestAccessToken({ prompt: "select_account" });
    } catch {
      onPopupError();
    }
  });
  saveButton.addEventListener("click", synchronize);
  refreshButton.addEventListener("click", async () => {
    const userId = user?.permissionId;
    const draft = drafts.get(userId);
    if (!draft) return refresh();
    if (await writeCloud(draft)) return refresh();
    if (!conflict || !token || !confirm("¿Descartar los cambios pendientes y cargar la versión de Google Drive?")) return;
    return run(async () => {
      ready = false;
      try {
        await readCloud();
      } catch (error) {
        ready = true;
        throw error;
      }
      storeDraft(userId);
      status.textContent = "Datos actualizados desde Drive.";
    }, "No se pudo cargar la versión de Drive. Conservamos tus cambios pendientes.");
  });
  window.setInterval(synchronize, 5 * 60 * 1000);
  window.addEventListener("beforeunload", (event) => {
    if (!drafts.size) return;
    event.preventDefault();
    event.returnValue = "";
  });
  signOutButton.addEventListener("click", () => {
    if (drafts.has(user?.permissionId)) {
      status.textContent = "Guarda los cambios pendientes antes de desconectar.";
      return;
    }
    disconnect();
    updateControls();
    status.textContent = "Google Drive desconectado.";
  });
  window.addEventListener("focus", () => {
    if (token && ready && !busy && !editor.open) void refresh();
  });
  window.addEventListener("storage", updateControls);
  importButton.addEventListener("click", async () => {
    if (!user || !ready || busy || !confirm("¿Copiar los datos de este navegador a tu Google Drive?")) return;
    const userId = user.permissionId;
    const existing = new Set(data.movements.map((item) => item.id));
    const next = {
      movements: [...data.movements, ...localData.movements.filter((item) => !existing.has(item.id))],
      budgets: { ...localData.budgets, ...data.budgets },
    };
    if (!queueSave(next) || !await synchronize()) return;
    imported.add(userId);
    try {
      localStorage.setItem("clarocuenta-drive-import:" + userId, "1");
    } catch {
      // This marker only hides the import action on this browser.
    }
    updateControls();
    status.textContent = "Datos locales copiados a tu Google Drive.";
  });

  function onPopupError() {
    authorizing = false;
    updateControls();
    status.textContent = "La ventana de Google se cerró o fue bloqueada. Vuelve a intentar.";
  }

  const script = document.createElement("script");
  script.src = "https://accounts.google.com/gsi/client";
  script.addEventListener("load", () => {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope,
      include_granted_scopes: false,
      callback: connect,
      error_callback: onPopupError,
    });
    status.textContent = "";
    updateControls();
  });
  script.addEventListener("error", () => {
    status.textContent = "No se pudo cargar la conexión con Google. Revisa tu conexión y recarga.";
  });
  document.head.append(script);
})();
