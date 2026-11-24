(() => {
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
    const total = cashTotal(data);
    const reserved = [...balances.values()].reduce((sum, amount) => sum + amount, 0);
    const excluded = reserves.reduce((sum, item) => item.included ? sum : sum + balances.get(item.id), 0);
    byId("cash-total").textContent = format(total);
    byId("cash-reserved").textContent = format(reserved);
    byId("cash-available").textContent = format(total - excluded);

    byId("chart-reserved-amount").textContent = format(reserved);
    const share = total > 0 ? reserved / total : reserved > 0 ? 1 : 0;
    byId("reserve-ring").style.setProperty("--reserved-share", Math.min(1, Math.max(0, share)) * 100 + "%");
    byId("chart-reserved-context").textContent = total > 0
      ? "De " + format(total) + " en efectivo y débito"
      : "";

    const list = byId("reserve-list");
    list.replaceChildren(...reserves.map((item) => {
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
