(() => {
  const clientId = window.claroCuentaCloud?.clientId;
  const persistent = window.claroCuentaCloud?.persistentSession === true;
  if (!clientId && !persistent) return;

  const scope = "https://www.googleapis.com/auth/drive.file";
  const api = "https://www.googleapis.com/drive/v3/";
  const uploadApi = "https://www.googleapis.com/upload/drive/v3/";
  const folderMime = "application/vnd.google-apps.folder";
  const account = byId("account");
  const prompt = byId("drive-prompt");
  const promptButton = byId("drive-prompt-connect");
  const promptStatus = byId("drive-prompt-status");
  let startupChecked = false;
  const status = byId("account-status");
  const connectButton = byId("connect-drive");
  const reconnectButton = byId("reconnect-drive");
  const sessionKey = "clarocuenta-drive-session:" + clientId;
  const saveButton = byId("save-cloud");
  const refreshButton = byId("refresh-cloud");
  const importButton = byId("import-local");
  const signOutButton = byId("sign-out");
  const financePanel = byId("finance-panel");
  const collections = {
    categoryIcons: ["id", "icon"],
    categoryBudgets: ["id", "period", "category", "amount"],
    payments: ["id", "description", "date", "category", "accountId", "amount"],
    accounts: ["id", "name", "opening"],
    transfers: ["id", "from", "to", "date", "amount"],
    cards: ["id", "name", "opening"],
    cardPayments: ["id", "cardId", "date", "amount", "note", "accountId", "reserveId"],
    reserves: ["id", "name", "goal", "included", "description"],
    reserveMovements: ["id", "reserveId", "date", "amount"],
  };
  const imported = new Set();
  const drafts = new Map();
  const draftInstance = crypto.randomUUID();
  let serverSnapshot;
  let tokenClient;
  let token;
  let expiresAt = 0;
  let needsReconnect = false;
  let user;
  let record;
  let baseData;
  let ready = false;
  let busy = false;
  let authorizing = false;
  let conflict = false;
  let lastSaved;

  account.hidden = false;
  status.textContent = "Cargando conexión con Google…";

  function updateControls() {
    connectButton.hidden = Boolean(token);
    connectButton.disabled = (!persistent && !tokenClient) || busy || authorizing;
    connectButton.textContent = needsReconnect ? "Reconectar Google Drive" : "Conectar Google Drive";
    reconnectButton.hidden = !needsReconnect || Boolean(token);
    reconnectButton.disabled = connectButton.disabled;
    promptButton.disabled = connectButton.disabled;
    promptButton.textContent = connectButton.textContent;
    byId("account-session").hidden = !token;
    byId("account-email").textContent = user?.emailAddress ?? "";
    const reload = byId("reload-system");
    reload.textContent = token ? "Actualizar" : needsReconnect ? "Reconectar" : "Recargar";
    reload.disabled = busy || authorizing;
    window.dispatchEvent(new Event("clarocuenta:connection"));
    byId("storage-label").textContent = token ? "Datos de Google Drive"
      : needsReconnect && user ? "Google Drive en pausa" : "Datos en este dispositivo";
    const canEdit = !busy && (!token || ready);
    financePanel.inert = !canEdit;
    form.querySelector('button[type="submit"]').disabled = !canEdit;
    refreshButton.disabled = signOutButton.disabled = busy;
    const pending = Boolean(user && drafts.has(user.permissionId));
    byId("global-sync").textContent = pending ? "Cambios pendientes" : busy ? "Sincronizando…"
      : needsReconnect ? "Drive necesita reconexión" : token ? lastSaved ? "Guardado en Drive · " +
      new Intl.DateTimeFormat("es-MX", { hour: "numeric", minute: "2-digit" }).format(lastSaved)
      : "Drive conectado" : "";
    saveButton.disabled = busy || !pending;
    byId("sync-pending").hidden = !pending;
    importButton.disabled = !ready || busy;
    importButton.hidden = !user || imported.has(user.permissionId) ||
      (!localData.movements.length && !Object.keys(localData.budgets).length &&
        !Object.keys(collections).some((key) => localData[key]?.length) &&
        !Object.values(localData.customCategories ?? {}).some((items) => items.length));
  }

  function checkStartupConnection() {
    if (startupChecked) return;
    startupChecked = true;
    if (!token && !prompt.open) prompt.showModal();
  }

  function draftPrefix(userId) {
    return "clarocuenta-drive-draft:" + userId;
  }

  function storeDraft(userId, draft) {
    const previous = drafts.get(userId);
    if (draft) drafts.set(userId, draft);
    else drafts.delete(userId);
    try {
      const ownKey = draftPrefix(userId) + ":" + draftInstance;
      if (draft) {
        const source = previous?.source;
        draft.source = source?.key === ownKey ? source.previous : source;
        const raw = JSON.stringify(draft);
        localStorage.setItem(ownKey, raw);
        draft.source = { key: ownKey, raw, previous: draft.source };
      } else {
        let source = previous?.source;
        while (source) {
          if (localStorage.getItem(source.key) === source.raw) localStorage.removeItem(source.key);
          source = source.previous;
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  function recoverDraft(userId) {
    if (drafts.has(userId)) return drafts.get(userId);
    try {
      const prefix = draftPrefix(userId);
      const keys = [prefix];
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (key?.startsWith(prefix + ":")) keys.push(key);
      }
      for (const key of keys) {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        let saved;
        try { saved = JSON.parse(raw); } catch { continue; }
        if (validPayload(saved?.next) && (!saved.original || validPayload(saved.original))) {
          saved.source = { key, raw, previous: saved.source };
          drafts.set(userId, saved);
          return saved;
        }
      }
    } catch {
      // An unavailable browser store must not block access to Drive.
    }
  }

  async function serverRequest(path, options) {
    const response = await fetch(path, { cache: "no-store", ...options });
    if (!response.ok) {
      const error = new Error("Drive request failed");
      error.status = response.status;
      throw error;
    }
    return response;
  }

  function storeSession() {
    if (persistent) return;
    try {
      if (token && expiresAt > Date.now()) sessionStorage.setItem(sessionKey, JSON.stringify({ token, expiresAt }));
      else sessionStorage.removeItem(sessionKey);
    } catch {
      // Connection still works while the page is open.
    }
  }

  function expireSession() {
    token = undefined;
    expiresAt = 0;
    needsReconnect = true;
    reloadSystem = requestConnection;
    storeSession();
    status.textContent = "El acceso a Drive venció. Reconecta para continuar la sincronización.";
    updateControls();
  }

  function disconnect() {
    conflict = false;
    lastSaved = undefined;
    needsReconnect = false;
    expiresAt = 0;
    token = user = record = baseData = undefined;
    driveAppearanceAccount = undefined;
    storeSession();
    flushCategory = null;
    ready = false;
    saveToCloud = null;
    reloadSystem = reloadPage;
    byId("category-status").textContent = "";
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
        expireSession();
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

  async function findRecord() {
    if (persistent) {
      serverSnapshot = await (await serverRequest("/api/drive/snapshot")).json();
      return serverSnapshot.file ?? undefined;
    }
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

  function validFinance(value) {
    const text = (item) => typeof item === "string" && Boolean(item.trim());
    const validDate = (date) => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date) &&
      Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
    const positive = (amount) => Number.isSafeInteger(amount) && amount > 0;
    const validList = (key, check) => value[key] === undefined || (Array.isArray(value[key]) &&
      value[key].every((item) => item && text(item.id) && check(item)) &&
      new Set(value[key].map(({ id }) => id)).size === value[key].length);
    if (!validList("accounts", ({ name, opening }) => text(name) && Number.isSafeInteger(opening))) return false;
    if (!validList("cards", ({ name, opening }) => text(name) && name.length <= 48 &&
      Number.isSafeInteger(opening) && opening >= 0)) return false;
    if (!validList("reserves", ({ name, goal, included, description }) => text(name) && name.length <= 48 &&
      (description === undefined || (typeof description === "string" && description.length <= 120)) &&
      typeof included === "boolean" && (goal === undefined || positive(goal)))) return false;
    const reserves = new Set((value.reserves ?? []).map(({ id }) => id));
    const cards = new Set((value.cards ?? []).map(({ id }) => id));
    const accounts = new Set((value.accounts ?? []).map(({ id }) => id));
    const optionalAccount = (id) => id === undefined || id === "" || accounts.has(id);
    return value.movements.every(({ accountId, cardId, type }) => optionalAccount(accountId) &&
      (cardId === undefined || (type === "expense" && !accountId && cards.has(cardId)))) &&
      validList("cardPayments", ({ cardId, date, amount, note, accountId, reserveId }) => cards.has(cardId) && validDate(date) &&
        positive(amount) && optionalAccount(accountId) && (reserveId === undefined || reserves.has(reserveId)) &&
        (note === undefined || (typeof note === "string" && note.length <= 80))) &&
      validList("reserveMovements", ({ reserveId, date, amount }) =>
        reserves.has(reserveId) && validDate(date) && Number.isSafeInteger(amount) && amount !== 0) &&
      (!reserves.size || [...reserveBalances(value).values()].every((balance) => balance >= 0)) &&
      validList("categoryIcons", ({ id, icon }) => /^(expense|income):.+$/u.test(id) &&
        typeof icon === "string" && (/^[a-z]{1,16}$/.test(icon) ||
          (icon.length <= 25000 && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(icon)))) &&
      validList("categoryBudgets", ({ period, category, amount }) => typeof period === "string" &&
        /^\d{4}-(0[1-9]|1[0-2])$/.test(period) && text(category) && Number.isSafeInteger(amount) && amount >= 0) &&
      validList("payments", ({ description, date, category, accountId, amount }) =>
        text(description) && validDate(date) && text(category) && optionalAccount(accountId) && positive(amount)) &&
      validList("transfers", ({ from, to, date, amount }) =>
        from !== to && accounts.has(from) && accounts.has(to) && validDate(date) && positive(amount));
  }

  function validPayload(value) {
    const custom = value?.customCategories;
    const validCategories = custom === undefined || (custom && typeof custom === "object" &&
      !Array.isArray(custom) && Object.entries(custom).every(([type, labels]) =>
        ["expense", "income"].includes(type) && Array.isArray(labels) &&
        labels.every((label) => typeof label === "string" && label.trim() && label.length <= 48)));
    return validCategories && value && Array.isArray(value.movements) && value.movements.every((item) =>
      item && typeof item.id === "string" && typeof item.description === "string" &&
      typeof item.date === "string" && ["income", "expense"].includes(item.type) &&
      (item.time === undefined || (typeof item.time === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(item.time))) &&
      typeof item.category === "string" && Number.isSafeInteger(item.amount) && item.amount > 0) &&
      value.budgets && typeof value.budgets === "object" && !Array.isArray(value.budgets) &&
      Object.entries(value.budgets).every(([key, amount]) =>
        /^\d{4}-(0[1-9]|1[0-2])$/.test(key) && Number.isSafeInteger(amount) && amount >= 0) && validFinance(value);
  }

  async function readRecord(file) {
    if (!file) return emptyData();
    const payload = persistent ? serverSnapshot.snapshot :
      await (await request(api, "files/" + file.id, { alt: "media" })).json();
    if (!validPayload(payload)) throw new Error("invalid-data");
    return payload;
  }

  async function readCloud() {
    const latest = await findRecord();
    if (ready && latest?.id === record?.id && latest?.version === record?.version) return;
    baseData = data = await readRecord(latest);
    record = latest;
    ready = true;
    render();
  }

  const equalFields = (fields) => (a, b) => !a || !b ? a === b : fields.every((key) => a[key] === b[key]);
  const sameMovement = equalFields(["id", "description", "date", "time", "type", "category", "amount", "accountId", "cardId"]);
  const recordsById = (records) => new Map((records ?? []).map((item) => [item.id, item]));

  function mergeChanges(base, pending, remote, equal) {
    const values = new Map(remote);
    const keys = new Set([...base.keys(), ...pending.keys()]);
    for (const key of keys) {
      const original = base.get(key);
      const changed = pending.get(key);
      const current = remote.get(key);
      if (equal(changed, original)) continue;
      if (!equal(current, original) && !equal(current, changed)) return null;
      if (pending.has(key)) values.set(key, changed);
      else values.delete(key);
    }
    return values;
  }

  function mergeDraft(draft, remote) {
    const pending = draft.next;
    const customCategories = mergeCustomCategories(remote.customCategories, pending.customCategories);
    const preferences = { ...remote, customCategories };
    let appearanceConflict = false;
    if (draft.original) {
      const original = JSON.stringify(draft.original.appearance);
      const changed = JSON.stringify(pending.appearance);
      const current = JSON.stringify(remote.appearance);
      appearanceConflict = changed !== original && current !== original && current !== changed;
      if (changed !== original && !appearanceConflict && pending.appearance) preferences.appearance = pending.appearance;
    }
    const movements = (snapshot) => recordsById(snapshot.movements);
    const budgets = (snapshot) => new Map(Object.entries(snapshot.budgets));

    if (!draft.original) {
      // Old drafts contain a version but no original payload. Compare their financial data directly.
      const matches = (a, b, equal) => a.size === b.size && [...a].every(([key, value]) => equal(value, b.get(key)));
      const same = matches(movements(pending), movements(remote), sameMovement) &&
        matches(budgets(pending), budgets(remote), Object.is) &&
        Object.entries(collections).every(([key, fields]) =>
          matches(recordsById(pending[key]), recordsById(remote[key]), equalFields(fields)));
      return { next: preferences, remaining: !same };
    }

    const mergedMovements = mergeChanges(
      movements(draft.original), movements(pending), movements(remote), sameMovement);
    const mergedBudgets = mergeChanges(
      budgets(draft.original), budgets(pending), budgets(remote), Object.is);
    if (!mergedMovements || !mergedBudgets) {
      return { next: preferences, remaining: true };
    }
    const next = { ...preferences, movements: [...mergedMovements.values()],
      budgets: Object.fromEntries(mergedBudgets) };
    for (const [key, fields] of Object.entries(collections)) {
      const merged = mergeChanges(recordsById(draft.original[key]), recordsById(pending[key]),
        recordsById(remote[key]), equalFields(fields));
      if (!merged) return { next: preferences, remaining: true };
      if (merged.size || remote[key] || pending[key]) next[key] = [...merged.values()];
    }
    if (!validFinance(next)) return { next: preferences, remaining: true };
    return { next, remaining: appearanceConflict };
  }

  async function synchronize() {
    if (!token || busy || editor.open) return;
    if (expiresAt && expiresAt <= Date.now()) {
      expireSession();
      return;
    }
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
    const stored = storeDraft(user.permissionId, {
      next,
      base: existing ? existing.base : record,
      original: existing ? existing.original : baseData,
    });
    data = next;
    render();
    updateControls();
    status.textContent = stored ? "Guardado automático cada cinco minutos."
      : "El navegador no pudo conservar el borrador. Usa Guardar ahora antes de cerrar.";
    return true;
  }

  async function writeCloud(draft) {
    if (!ready) return false;
    const userId = user.permissionId;
    conflict = false;
    return run(async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          return await writeAttempt(draft, userId);
        } catch (error) {
          if (error.status !== 409 || attempt === 2) throw error;
        }
      }
    }, "No pudimos confirmar el guardado. Los cambios siguen pendientes.");
  }

  async function writeAttempt(draft, userId) {
    const latest = await findRecord();
    let { next } = draft;
    let remaining = false;
    let preferencesChanged = true;
    if (latest?.id !== draft.base?.id || latest?.version !== draft.base?.version) {
      // A missing or replaced record may have been deliberately removed in Drive.
      if (draft.base && latest?.id !== draft.base.id) {
        conflict = true;
        status.textContent = "El archivo de Drive se movió o se reemplazó. Tus cambios siguen pendientes.";
        return false;
      }
      const remote = await readRecord(latest);
      ({ next, remaining } = mergeDraft(draft, remote));
      preferencesChanged = JSON.stringify(mergeCustomCategories(remote.customCategories)) !==
        JSON.stringify(next.customCategories) || JSON.stringify(remote.appearance) !== JSON.stringify(next.appearance);
      if (remaining && !preferencesChanged) {
        conflict = true;
        status.textContent = "Hay cambios que Drive no pudo combinar. Actualizar datos permite cargar la versión de Drive.";
        return false;
      }
    }
    const parent = latest || persistent ? null : await findOrCreateFolder();

    const payload = JSON.stringify(next);
    let response;
    if (persistent) {
      response = await serverRequest("/api/drive/snapshot", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expected: latest ?? null, snapshot: next }),
      });
    } else if (latest) {
      response = await request(uploadApi, "files/" + latest.id, { uploadType: "media", fields: "id,version" }, {
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
    const result = await response.json();
    record = persistent ? result.file : result;
    lastSaved = new Date();
    baseData = next;
    if (remaining) {
      conflict = true;
      status.textContent = "Guardamos los cambios que se pudieron combinar. Aún queda un borrador pendiente.";
      return false;
    }
    storeDraft(userId);
    const another = recoverDraft(userId);
    data = another?.next ?? next;
    render();
    status.textContent = another ? "Primer borrador guardado. Quedan otros cambios pendientes."
      : "Guardado en tu Google Drive.";
    return true;
  }

  async function connect(result) {
    authorizing = false;
    updateControls();
    if (result.error || !result.access_token ||
        !google.accounts.oauth2.hasGrantedAllScopes(result, scope)) {
      status.textContent = "Google Drive necesita tu autorización para conectar la carpeta.";
      promptStatus.textContent = status.textContent;
      return;
    }
    const lifetime = Number(result.expires_in);
    await connectWithToken(result.access_token, Number.isFinite(lifetime) && lifetime > 0 ? Date.now() + lifetime * 1000 : 0);
  }

  async function connectWithToken(accessToken, expiry, verifiedUser) {
    token = accessToken;
    expiresAt = expiry;
    ready = false;
    saveToCloud = queueSave;
    flushCategory = synchronize;
    reloadSystem = () => notifyUpdate(synchronize);
    byId("category-status").textContent = "";
    if (!user) data = emptyData();
    if (editor.open) editor.close();
    render();
    const connected = await run(async () => {
      const connectedUser = verifiedUser ??
        (await (await request(api, "about", { fields: "user(emailAddress,permissionId)" })).json()).user;
      if (user?.permissionId !== connectedUser.permissionId) {
        record = baseData = undefined;
        data = emptyData();
        render();
      }
      user = connectedUser;
      driveAppearanceAccount = user.permissionId;
      try {
        if (localStorage.getItem("clarocuenta-drive-import:" + user.permissionId)) imported.add(user.permissionId);
      } catch {
        // The original local data remains available.
      }
      await readCloud();
      const pending = recoverDraft(user.permissionId);
      if (pending) {
        data = pending.next;
        render();
      }
      needsReconnect = false;
      storeSession();
      status.textContent = "Google Drive conectado.";
      if (prompt.open) prompt.close();
      promptStatus.textContent = "";
      return true;
    }, "No se pudo abrir ClaroCuenta en Drive. Revisa la conexión y vuelve a intentarlo.");
    if (!connected) promptStatus.textContent = status.textContent;
    if (!connected && !user) {
      const expired = needsReconnect;
      disconnect();
      if (expired) expireSession();
      updateControls();
    }
  }

  function requestConnection() {
    if (busy || authorizing) return;
    if (persistent) {
      window.location.assign("/api/auth/start");
      return;
    }
    if (!tokenClient) return;
    status.textContent = "Selecciona tu cuenta de Google.";
    promptStatus.textContent = status.textContent;
    authorizing = true;
    updateControls();
    try {
      tokenClient.requestAccessToken({ prompt: needsReconnect ? "" : "select_account" });
    } catch {
      onPopupError();
    }
  }
  connectButton.addEventListener("click", requestConnection);
  promptButton.addEventListener("click", requestConnection);
  reconnectButton.addEventListener("click", requestConnection);
  saveButton.addEventListener("click", synchronize);
  async function notifyUpdate(update) {
    if (busy || !token) return;
    if (editor.open) {
      showUpdateNotice("Cierra el editor de movimientos antes de actualizar.");
      return;
    }
    showUpdateNotice("Actualizando datos de Google Drive…", true);
    try {
      await update();
      showUpdateNotice(status.textContent);
    } catch {
      showUpdateNotice("No se pudo completar la actualización. Intenta de nuevo.");
    }
  }

  async function refreshFromButton() {
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
  }
  refreshButton.addEventListener("click", () => notifyUpdate(refreshFromButton));
  window.setInterval(synchronize, 5 * 60 * 1000);
  window.addEventListener("beforeunload", (event) => {
    if (!drafts.size) return;
    event.preventDefault();
    event.returnValue = "";
  });
  signOutButton.addEventListener("click", async () => {
    if (drafts.has(user?.permissionId)) {
      status.textContent = "Guarda los cambios pendientes antes de desconectar.";
      return;
    }
    if (persistent) {
      const closed = await run(async () => {
        await serverRequest("/api/auth/logout", { method: "POST" });
        return true;
      }, "No pudimos cerrar la conexión de Google Drive.");
      if (!closed) return;
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
      ...data,
      movements: [...data.movements, ...localData.movements.filter((item) => !existing.has(item.id))],
      budgets: { ...localData.budgets, ...data.budgets },
      customCategories: mergeCustomCategories(data.customCategories, localData.customCategories),
    };
    for (const key of Object.keys(collections)) {
      if (!localData[key]?.length) continue;
      const records = recordsById(localData[key]);
      for (const item of data[key] ?? []) records.set(item.id, item);
      next[key] = [...records.values()];
    }
    // A payment already recorded on either device stays paid when importing.
    if (next.payments) {
      const recorded = new Set(next.movements.map(({ id }) => id));
      next.payments = next.payments.filter(({ id }) => !recorded.has(id));
    }
    if (!validFinance(next)) {
      status.textContent = "Los datos locales no se pudieron combinar con los de Drive. Se conservaron en el dispositivo.";
      return;
    }
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
    promptStatus.textContent = status.textContent;
  }

  if (persistent) {
    updateControls();
    if (new URLSearchParams(window.location.search).get("drive") === "error") {
      status.textContent = "Google no pudo autorizar Drive. Intenta conectar de nuevo.";
      promptStatus.textContent = status.textContent;
      checkStartupConnection();
    } else {
      void (async () => {
        try {
          const { user: verified } = await (await serverRequest("/api/auth/session")).json();
          await connectWithToken("server-session", 0, verified);
        } catch (error) {
          status.textContent = error.status === 401 ? "" : "No pudimos comprobar la sesión. Vuelve a intentar.";
        } finally {
          checkStartupConnection();
        }
      })();
    }
    return;
  }

  const script = document.createElement("script");
  script.src = "https://accounts.google.com/gsi/client";
  script.addEventListener("load", async () => {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope,
      include_granted_scopes: false,
      callback: connect,
      error_callback: onPopupError,
    });
    status.textContent = "";
    updateControls();
    try {
      const saved = JSON.parse(sessionStorage.getItem(sessionKey));
      if (typeof saved?.token === "string" && Number.isFinite(saved.expiresAt)) {
        if (saved.expiresAt > Date.now()) await connectWithToken(saved.token, saved.expiresAt);
        else expireSession();
      }
    } catch {
      // A blocked or unavailable session store does not prevent manual connection.
    }
    checkStartupConnection();
  });
  script.addEventListener("error", () => {
    status.textContent = "No se pudo cargar la conexión con Google. Revisa tu conexión y recarga.";
    promptStatus.textContent = status.textContent;
    checkStartupConnection();
  });
  // Show the prompt while Google loads unless a session might still be restorable.
  let canRestore = false;
  try {
    const saved = JSON.parse(sessionStorage.getItem(sessionKey));
    canRestore = Boolean(saved?.token && saved.expiresAt > Date.now());
  } catch {}
  if (!canRestore) checkStartupConnection();
  document.head.append(script);
})();
