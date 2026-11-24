(() => {
  const percent = new Intl.NumberFormat("es-MX", { style: "percent", maximumFractionDigits: 1 });
  let selectedId;
  let editingId;
  let storageAccount = driveAppearanceAccount;

  function edit(reserve) {
    editingId = reserve?.id;
    byId("reserve-title").textContent = reserve ? "Editar apartado" : "Nuevo apartado";
    byId("reserve-save").textContent = reserve ? "Guardar apartado" : "Crear apartado";
    byId("reserve-name").value = reserve?.name ?? "";
    byId("reserve-description").value = reserve?.description ?? "";
    byId("reserve-goal").value = reserve?.goal ? (reserve.goal / 100).toFixed(2) : "";
    byId("reserve-cancel").hidden = !reserve;
  }

  function render() {
    const reserves = data.reserves ?? [];
    if (storageAccount !== driveAppearanceAccount) {
      storageAccount = driveAppearanceAccount;
      selectedId = undefined;
      edit();
      byId("reserve-amount").value = "";
    }
    if (editingId && !reserves.some(({ id }) => id === editingId)) edit();

    const balances = reserveBalances(data);
    const sorted = [...reserves].sort((a, b) => balances.get(b.id) - balances.get(a.id) ||
      a.name.localeCompare(b.name, "es-MX"));
    const total = cashTotal(data);
    const reserved = [...balances.values()].reduce((sum, amount) => sum + amount, 0);
    const excluded = reserves.reduce((sum, item) => item.included ? sum : sum + balances.get(item.id), 0);
    byId("cash-total").textContent = format(total);
    const reservedAmount = format(reserved);
    byId("cash-reserved").textContent = reservedAmount;
    byId("reserve-total").textContent = reservedAmount;
    const available = total - excluded;
    byId("cash-available").textContent = format(available);
    const unreserved = total - reserved;
    byId("chart-available-amount").textContent = format(available);
    const chartTotal = byId("chart-total-amount");
    const summaryChart = byId("summary-donut");
    if (chartTotal) {
      chartTotal.textContent = format(total);
      const { income, expense } = periodTotals;
      const values = [
        ["chart-flow-income", "--summary-income", "chart-percent-income", income],
        ["chart-flow-expense", "--summary-expense", "chart-percent-expense", expense],
        ["chart-total-reserved", "--summary-reserved", "chart-percent-reserved", reserved],
        ["chart-available-amount", "--summary-available", "chart-percent-available", available],
      ];
      const volume = values.reduce((sum, [, , , amount]) => sum + Math.max(0, amount), 0);
      const pieces = [];
      let drawn = 0;
      for (const [id, color, percentId, amount] of values) {
        byId(id).textContent = format(amount);
        byId(percentId).textContent = percent.format(volume ? Math.max(0, amount) / volume : 0);
        if (amount <= 0) continue;
        const start = drawn / volume * 100;
        drawn += amount;
        pieces.push("var(" + color + ") " + start + "% " + drawn / volume * 100 + "%");
      }
      summaryChart.setAttribute("data-empty", String(!pieces.length));
      summaryChart.style.backgroundImage = pieces.length ? "conic-gradient(" + pieces.join(", ") + ")" : "";
    } else {
      const unreserved = total - reserved;
      byId("chart-free-amount").textContent = format(unreserved);
      byId("chart-included-amount").textContent = format(reserved - excluded);
      byId("chart-excluded-amount").textContent = format(excluded);
      const showDistribution = total > 0 && unreserved >= 0;
      summaryChart.setAttribute("data-empty", String(!showDistribution));
      summaryChart.style.setProperty("--cash-free-stop", (showDistribution ? unreserved / total * 100 : 0) + "%");
      summaryChart.style.setProperty("--cash-available-stop", (showDistribution ? available / total * 100 : 0) + "%");
      const summaryNote = byId("summary-chart-note");
      summaryNote.hidden = showDistribution;
      summaryNote.textContent = unreserved < 0
        ? "El saldo de efectivo y débito no alcanza para cubrir todos los apartados."
        : "Aún no hay saldo de efectivo y débito para distribuir.";
    }

    const chart = byId("cash-donut");
    const chartItems = sorted.filter(({ id }) => balances.get(id) > 0);
    let accumulated = 0;
    const segments = [];
    const legend = chartItems.map(({ id, name }, index) => {
      const amount = balances.get(id);
      const color = "hsl(" + (index * 137.508 + 192) % 360 + " 62% 53%)";
      const start = accumulated / reserved * 100;
      accumulated += amount;
      segments.push(color + " " + start + "% " + accumulated / reserved * 100 + "%");
      const label = node("dt", "");
      const swatch = node("span", "", "chart-swatch");
      swatch.style.backgroundColor = color;
      label.append(swatch, node("span", name));
      const row = node("div", "");
      row.append(label, node("dd", format(amount)));
      return row;
    });
    chart.setAttribute("data-empty", String(!segments.length));
    chart.style.backgroundImage = segments.length ? "conic-gradient(" + segments.join(", ") + ")" : "";
    byId("reserve-chart-legend").replaceChildren(...legend);
    const note = byId("cash-chart-note");
    note.hidden = Boolean(segments.length);
    note.textContent = "Aún no hay dinero reservado en tus apartados.";

    const list = byId("reserve-list");
    list.replaceChildren(...sorted.map((item) => {
      const input = node("input", "");
      input.type = "checkbox";
      input.setAttribute("role", "switch");
      input.setAttribute("aria-label", "Incluir " + item.name + " en saldo disponible");
      input.checked = item.included;
      input.addEventListener("change", async () => {
        const reserves = data.reserves.map((entry) => entry.id === item.id
          ? { ...entry, included: input.checked } : entry);
        if (!await persist({ ...data, reserves })) input.checked = item.included;
        else {
          const replacement = [...list.querySelectorAll("input")].find((control) =>
            control.getAttribute("aria-label") === input.getAttribute("aria-label"));
          replacement?.focus({ preventScroll: true });
        }
      });
      const label = node("label", "", "reserve-switch");
      label.append(input, node("span", "Incluir en saldo disponible"));
      const detail = format(balances.get(item.id)) + " reservados";
      return financeRow(item.name, item.description ? detail + " · " + item.description : detail, label,
        action("Ver detalle", () => {
          selectedId = item.id;
          byId("reserve-amount").value = "";
          render();
          byId("reserve-detail-title").focus();
        }),
        action("Editar", () => {
          edit(item);
          byId("reserve-name").focus();
        }));
    }));
    if (!reserves.length) list.append(node("p", "Todavía no has creado apartados."));

    const selected = reserves.find(({ id }) => id === selectedId) ?? reserves[0];
    selectedId = selected?.id;
    byId("reserve-detail").hidden = !selected;
    if (!selected) return;
    const balance = balances.get(selected.id);
    byId("reserve-detail-title").textContent = selected.name;
    byId("reserve-balance").textContent = format(balance) + " reservados";
    const progress = byId("reserve-progress");
    progress.replaceChildren();
    if (selected.goal) {
      const indicator = node("progress", "");
      indicator.max = selected.goal;
      indicator.value = Math.min(balance, selected.goal);
      indicator.setAttribute("aria-label", "Avance de " + selected.name);
      const percentage = Math.round(balance / selected.goal * 100);
      progress.append(node("p", "Meta de " + format(selected.goal) + " · " + percentage + "% alcanzado"), indicator);
    }
    const history = [
      ...(data.reserveMovements ?? []).filter(({ reserveId }) => reserveId === selected.id)
        .map(({ amount, date }) => ({ amount, date, title: amount > 0 ? "Dinero agregado" : "Dinero retirado" })),
      ...(data.cardPayments ?? []).filter(({ reserveId }) => reserveId === selected.id)
        .map(({ amount, date, cardId }) => ({ amount: -amount, date,
          title: "Abono a " + (data.cards?.find(({ id }) => id === cardId)?.name ?? "tarjeta") })),
    ].sort((a, b) => b.date.localeCompare(a.date));
    const details = byId("reserve-history");
    details.replaceChildren(...history.map(({ title, amount, date }) =>
      financeRow(title, date + " · " + (amount < 0 ? "−" : "+") + format(Math.abs(amount)))));
    if (!history.length) details.append(node("p", "Todavía no hay cambios en este apartado."));
  }

  byId("reserve-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = byId("reserve-name").value.trim();
    const description = byId("reserve-description").value.trim();
    const goalValue = byId("reserve-goal").value;
    const goal = Math.round(Number(goalValue) * 100);
    if (!name || description.length > 120 || (goalValue && (!Number.isSafeInteger(goal) || goal <= 0))) return;
    const current = data.reserves ?? [];
    if (current.some((item) => item.id !== editingId && categoryKey(item.name) === categoryKey(name))) {
      showUpdateNotice("Ya existe un apartado con ese nombre.");
      return;
    }
    const previous = current.find(({ id }) => id === editingId);
    const reserve = { id: editingId ?? crypto.randomUUID(), name, included: previous?.included ?? false };
    if (goalValue) reserve.goal = goal;
    if (description) reserve.description = description;
    const reserves = previous ? current.map((item) => item.id === reserve.id ? reserve : item) : [...current, reserve];
    if (await persist({ ...data, reserves })) {
      selectedId = reserve.id;
      edit();
      render();
      showUpdateNotice("Apartado guardado.");
    }
  });
  byId("reserve-cancel").addEventListener("click", () => edit());

  byId("reserve-movement").addEventListener("submit", async (event) => {
    event.preventDefault();
    const field = byId("reserve-amount");
    const amount = Math.round(Number(field.value) * 100);
    if (!selectedId || !Number.isSafeInteger(amount) || amount <= 0) return;
    const balances = reserveBalances(data);
    const withdrawal = byId("reserve-direction").value === "take";
    const unreserved = cashTotal(data) - [...balances.values()].reduce((sum, balance) => sum + balance, 0);
    if (amount > (withdrawal ? balances.get(selectedId) : unreserved)) {
      showUpdateNotice(withdrawal ? "El importe supera lo reservado en este apartado." :
        "El importe supera el dinero que aún está sin apartar.");
      return;
    }
    const movement = { id: crypto.randomUUID(), reserveId: selectedId, date: localDate(),
      amount: withdrawal ? -amount : amount };
    if (await persist({ ...data, reserveMovements: [...(data.reserveMovements ?? []), movement] })) {
      field.value = "";
      showUpdateNotice(withdrawal ? "Dinero retirado del apartado." : "Dinero agregado al apartado.");
    }
  });

  window.addEventListener("clarocuenta:render", render);
  render();
})();
