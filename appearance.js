(() => {
  const root = document.documentElement;
  const choices = [...document.querySelectorAll('input[name="appearance"]')];
  const hero = byId("theme-hero");
  const custom = byId("appearance-custom");
  const accent = byId("custom-accent");
  const status = byId("appearance-status");
  const key = "clarocuenta-appearance";
  const supported = ["image/png", "image/jpeg", "image/webp"];
  let imageUrl = "";
  let logoUrl = "";
  let theme = "traditional";

  function show(next) {
    theme = next;
    root.dataset.appearance = next;
    root.dataset.customLogo = String(Boolean(logoUrl));
    hero.hidden = next === "traditional" || (next === "custom" && !imageUrl && !logoUrl);
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

  function save() {
    try {
      localStorage.setItem(key, JSON.stringify({ theme, color: accent.value, image: imageUrl, logo: logoUrl }));
      status.textContent = "Tema guardado en este navegador.";
    } catch {
      status.textContent = "El navegador no pudo guardar el tema. Sigue aplicado durante esta visita.";
    }
  }

  byId("apply-appearance").addEventListener("click", save);
  byId("reset-appearance").addEventListener("click", () => {
    show("traditional");
    save();
  });
  show(theme);
})();
