(() => {
  const panels = [...document.querySelectorAll("[data-view]")];
  const links = [...document.querySelectorAll("[data-route]")];
  const routes = {
    resumen: ["Resumen", "Consulta tu saldo y revisa cómo se distribuyen tus gastos."],
    movimientos: ["Movimientos", "Registra y consulta los ingresos y gastos del periodo."],
    reports: ["Reportes", "Compara ingresos, gastos y ahorro entre meses y años."],
    "categories-panel": ["Categorías", "Organiza tus ingresos y gastos con tus propias categorías."],
    configuracion: ["Configuración", "Administra Google Drive, el tema y la instalación de ClaroCuenta."],
  };

  function showRoute(focus = false) {
    const hash = window.location.hash.slice(1);
    const route = Object.hasOwn(routes, hash) ? hash : "resumen";
    const [title, description] = routes[route];
    for (const panel of panels) panel.hidden = panel.dataset.view !== route;
    for (const link of links) {
      if (link.dataset.route === route) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    }
    byId("view-title").textContent = title;
    byId("view-description").textContent = description;
    byId("workspace-period").hidden = route !== "resumen" && route !== "movimientos";
    document.title = title + " | ClaroCuenta";
    if (focus) {
      byId("view-title").focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
  }

  window.addEventListener("hashchange", () => showRoute(true));
  showRoute();
})();
