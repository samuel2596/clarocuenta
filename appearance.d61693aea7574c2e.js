(() => {
  const root = document.documentElement;
  const choices = [...document.querySelectorAll('input[name="appearance"]')];
  const hero = byId("theme-hero");
  const custom = byId("appearance-custom");
  const accent = byId("custom-accent");
  const status = byId("appearance-status");
  const key = "clarocuenta-appearance";
  const syncKey = "clarocuenta-appearance-sync";
  const sync = byId("sync-appearance");
  const syncStatus = byId("appearance-sync-status");
  let localPrefs;
  let localMode = selectedTheme;
  let lastRemote;
  let cloudModeActive = false;
  useLocalThemePreference = () => !(sync.checked && saveToCloud && data.appearance);
  const supported = ["image/png", "image/jpeg", "image/webp"];
  let imageUrl = "";
  let logoUrl = "";
  const defaultTheme = choices.some((choice) => choice.value === "saldo") ? "saldo" : "traditional";
  let theme = defaultTheme;

  function show(next) {
    theme = next;
    root.dataset.appearance = next;
    root.dataset.customLogo = String(Boolean(logoUrl));
    hero.hidden = next === "saldo" || next === "traditional" || (next === "custom" && !imageUrl && !logoUrl);
    custom.hidden = next !== "custom";
    for (const choice of choices) choice.checked = choice.value === next;
    root.style.setProperty("--custom-accent", accent.value);
    root.style.setProperty("--uploaded-image", imageUrl ? 'url("' + imageUrl + '")' : "none");
    root.style.setProperty("--uploaded-logo", logoUrl ? 'url("' + logoUrl + '")' : "none");
  }

  function validImage(value) {
    return typeof value === "string" && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(value);
  }

  try {
    const saved = JSON.parse(localStorage.getItem(key));
    localPrefs = saved;
    sync.checked = localStorage.getItem(syncKey) === "1";
    if (saved && choices.some((choice) => choice.value === saved.theme)) {
      if (/^#[0-9a-f]{6}$/i.test(saved.color)) accent.value = saved.color;
      if (validImage(saved.image)) imageUrl = saved.image;
      if (validImage(saved.logo)) logoUrl = saved.logo;
      show(saved.theme);
    }
  } catch {
    // The demo remains usable when browser storage is unavailable.
  }

  for (const choice of choices) {
    choice.addEventListener("change", () => {
      show(choice.value);
      status.textContent = "Vista previa del tema.";
    });
  }
  accent.addEventListener("input", () => show("custom"));

  function readImage(input, assign) {
    input.addEventListener("change", () => {
      const [file] = input.files;
      if (!file) return;
      if (!supported.includes(file.type) || file.size > 1024 * 1024) {
        status.textContent = "Elige una imagen PNG, JPEG o WebP de hasta 1 MB.";
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (!validImage(reader.result)) return;
        assign(reader.result);
        show(theme);
        status.textContent = "Vista previa de la imagen. Pulsa Aplicar tema para guardarla.";
      };
      reader.onerror = () => { status.textContent = "No se pudo abrir la imagen."; };
      reader.readAsDataURL(file);
    });
  }
  readImage(byId("custom-image"), (value) => { imageUrl = value; });
  readImage(byId("custom-logo"), (value) => { logoUrl = value; });

  function preferences() {
    return { theme, color: accent.value, image: imageUrl, logo: logoUrl,
      mode: document.documentElement.dataset.theme };
  }

  function usePreferences(saved) {
    if (!saved || !choices.some((choice) => choice.value === saved.theme)) return false;
    accent.value = /^#[0-9a-f]{6}$/i.test(saved.color) ? saved.color : "#7b56ca";
    imageUrl = validImage(saved.image) ? saved.image : "";
    logoUrl = validImage(saved.logo) ? saved.logo : "";
    show(saved.theme);
    return true;
  }

  function pullAppearance() {
    const connected = Boolean(saveToCloud);
    const remote = sync.checked && connected ? data.appearance : undefined;
    if (remote) {
      const signature = JSON.stringify(remote);
      if (signature !== lastRemote && usePreferences(remote)) {
        lastRemote = signature;
        cloudModeActive = true;
        if (["light", "dark"].includes(remote.mode)) selectedTheme = remote.mode;
        applyTheme();
      }
    } else if (cloudModeActive) {
      cloudModeActive = false;
      lastRemote = undefined;
      usePreferences(localPrefs ?? { theme: defaultTheme });
      selectedTheme = localMode;
      applyTheme();
    }
    syncStatus.textContent = !sync.checked ? ""
      : !connected ? "Conecta Google Drive para sincronizar la apariencia."
      : remote ? "La apariencia de Drive está activa en este dispositivo."
      : "Pulsa Aplicar tema para guardar por primera vez en Drive.";
  }

  async function compact(value, maximum) {
    if (!value || value.length <= maximum) return value;
    const bitmap = new Image();
    bitmap.src = value;
    await bitmap.decode();
    const canvas = document.createElement("canvas");
    for (const size of [960, 640, 360, 180]) {
      const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const result = canvas.toDataURL("image/webp", .76);
      if (validImage(result) && result.length <= maximum) return result;
    }
    throw new Error("No se pudo reducir la imagen.");
  }

  async function save() {
    const next = preferences();
    if (sync.checked && saveToCloud) {
      const saveTarget = saveToCloud;
      const accountKey = driveAppearanceAccount;
      try {
        [next.image, next.logo] = await Promise.all([compact(next.image, 320000), compact(next.logo, 140000)]);
      } catch {
        status.textContent = "No se pudo preparar una imagen para Drive. Prueba con una imagen más pequeña.";
        return;
      }
      if (saveTarget !== saveToCloud || accountKey !== driveAppearanceAccount || !sync.checked) return;
      if (await persist({ ...data, appearance: next })) {
        status.textContent = "Apariencia lista para sincronizar. Revisa el estado de Drive arriba.";
        if (flushCategory) void flushCategory();
      } else {
        status.textContent = "Drive está ocupado. Pulsa Aplicar tema de nuevo en unos segundos.";
      }
      return;
    }
    localPrefs = next;
    try {
      localStorage.setItem(key, JSON.stringify(next));
      status.textContent = "Tema guardado en este navegador.";
    } catch {
      status.textContent = "El navegador no pudo guardar el tema. Sigue aplicado durante esta visita.";
    }
  }

  sync.addEventListener("change", () => {
    try { localStorage.setItem(syncKey, sync.checked ? "1" : "0"); } catch {}
    pullAppearance();
    status.textContent = "";
  });
  window.addEventListener("clarocuenta:render", pullAppearance);
  window.addEventListener("clarocuenta:connection", pullAppearance);
  window.addEventListener("clarocuenta:theme-mode", () => {
    if (sync.checked && saveToCloud && data.appearance) {
      const remote = { ...data.appearance, mode: document.documentElement.dataset.theme };
      void persist({ ...data, appearance: remote }).then((saved) => {
        if (saved && flushCategory) void flushCategory();
      });
    } else {
      localMode = selectedTheme;
    }
  });
  byId("apply-appearance").addEventListener("click", save);
  byId("reset-appearance").addEventListener("click", () => {
    show("traditional");
    void save();
  });
  show(theme);
  pullAppearance();
})();
