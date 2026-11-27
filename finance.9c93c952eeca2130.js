(() => {
  const value = (id) => byId(id).value;
  const cents = (id) => Math.round(Number(value(id)) * 100);
  const accountOptions = () => (data.accounts ?? []).map(({ id, name }) => [id, name]);
  const categoryOptions = () => [...new Set([
    ...(data.customCategories?.expense ?? []),
    ...(data.categoryBudgets ?? []).map(({ category }) => category),
    ...data.movements.filter(({ type }) => type === "expense").map(({ category }) => category),
  ])].filter(Boolean).sort((a, b) => a.localeCompare(b, "es-MX")).map((label) => [label, label]);

  function save(event, handler) {
    event.preventDefault();
    void handler(event.currentTarget);
  }

  function remove(field, item, question) {
    if (confirm(question)) void persist({ ...data, [field]: data[field].filter(({ id }) => id !== item.id) });
  }

  function renderBudgets() {
    const budgets = (data.categoryBudgets ?? []).filter(({ period }) => period === month.value);
    const select = byId("budget-category");
    fillSelect(select, categoryOptions(), "Selecciona una categoría");
    const list = byId("category-budgets");
    const totals = new Map();
    for (const item of data.movements) {
      if (item.type !== "expense" || item.date.slice(0, 7) !== month.value) continue;
      const key = categoryKey(item.category);
      totals.set(key, (totals.get(key) ?? 0) + item.amount);
    }
    list.replaceChildren(...budgets.map((item) => {
      const spent = totals.get(categoryKey(item.category)) ?? 0;
      const difference = item.amount - spent;
      const detail = format(spent) + " de " + format(item.amount) + " · " +
        (difference < 0 ? "Excedido por " : "Disponible ") + format(Math.abs(difference));
      const entry = financeRow(item.category, detail, action("Editar", () => {
        select.value = item.category;
        byId("category-limit").value = (item.amount / 100).toFixed(2);
        byId("category-limit").focus();
      }), action("Quitar", () => remove("categoryBudgets", item, "¿Quitar este límite del periodo?")));
      if (difference < 0) entry.classList.add("debit");
      return entry;
    }));
    if (!budgets.length) list.append(node("p", "Todavía no hay límites por categoría para este periodo."));
  }

  byId("category-budget-form").addEventListener("submit", (event) => save(event, async () => {
    const category = value("budget-category");
    const period = month.value;
    const id = period + ":" + categoryKey(category);
    const amount = cents("category-limit");
    if (!category || !Number.isSafeInteger(amount) || amount < 0) return;
    const entries = (data.categoryBudgets ?? []).filter((item) => item.id !== id);
    if (await persist({ ...data, categoryBudgets: [...entries, { id, category, period, amount }] })) {
      byId("category-limit").value = "";
      showUpdateNotice("Límite por categoría guardado.");
    }
  }));

  function daysUntil(date, reference) {
    return (Date.parse(date) - Date.parse(reference)) / 86400000;
  }

  async function markPaid(payment) {
    if (!data.payments?.some(({ id }) => id === payment.id)) return;
    if (!confirm("¿Registrar este pago como gasto con la fecha de hoy?")) return;
    const date = localDate();
    const { id, description, amount, category, accountId } = payment;
    const movements = [...data.movements, { id, description, amount, category, accountId, date, time: localTime(), type: "expense" }];
    if (await persist({ ...data, movements, payments: data.payments.filter((item) => item.id !== id) })) {
      showUpdateNotice("Pago registrado como gasto.");
    }
  }

  function renderPayments() {
    fillSelect(byId("payment-category"), categoryOptions(), "Selecciona una categoría");
    fillSelect(byId("payment-account"), accountOptions(), "Sin cuenta");
    const reference = localDate();
    const payments = [...(data.payments ?? [])].sort((a, b) => a.date.localeCompare(b.date));
    const list = byId("scheduled-payments");
    const alert = byId("payment-alert");
    const near = payments.filter(({ date }) => daysUntil(date, reference) <= 7).length;
    alert.hidden = !near;
    alert.replaceChildren();
    if (near) {
      const link = node("a", "Ver pagos pendientes");
      link.href = "#pagos";
      alert.append(node("span", near === 1 ? "Tienes un pago vencido o por vencer en los próximos 7 días. " :
        "Tienes " + near + " pagos vencidos o por vencer en los próximos 7 días. "), link);
    }
    list.replaceChildren(...payments.map((item) => {
      const days = daysUntil(item.date, reference);
      const due = days < 0 ? "Vencido" : days === 0 ? "Vence hoy" : days <= 7 ? "Vence en " + days + (days === 1 ? " día" : " días") : "Programado";
      return financeRow(item.description + " · " + format(item.amount),
        due + " · " + item.date + " · " + (item.category || "Sin categoría") + " · " + accountLabel(item.accountId),
        action("Registrar pago", () => markPaid(item)),
        action("Quitar", () => remove("payments", item, "¿Quitar este pago pendiente?")));
    }));
    if (!payments.length) list.append(node("p", "No hay pagos pendientes."));
  }

  byId("payment-form").addEventListener("submit", (event) => save(event, async (form) => {
    const description = value("payment-description").trim();
    const date = value("payment-date");
    const category = value("payment-category");
    const accountId = value("payment-account");
    const amount = cents("payment-amount");
    if (!description || !date || !category || !Number.isSafeInteger(amount) || amount <= 0) return;
    const payment = { id: crypto.randomUUID(), description, date, category, accountId, amount };
    if (await persist({ ...data, payments: [...(data.payments ?? []), payment] })) {
      form.reset();
      showUpdateNotice("Pago programado.");
    }
  }));

  function renderAccounts() {
    const options = accountOptions();
    fillSelect(byId("transfer-from"), options, "Selecciona el origen");
    fillSelect(byId("transfer-to"), options, "Selecciona el destino");
    byId("transfer-form").querySelector("button").disabled = options.length < 2;
    const accounts = data.accounts ?? [];
    const balances = new Map(accounts.map(({ id, opening }) => [id, opening]));
    const transfers = [...(data.transfers ?? [])].sort((a, b) => b.date.localeCompare(a.date));
    for (const item of data.movements) {
      if (item.cardId || !balances.has(item.accountId)) continue;
      balances.set(item.accountId, balances.get(item.accountId) + (item.type === "income" ? item.amount : -item.amount));
    }
    for (const { accountId, amount } of data.cardPayments ?? []) {
      if (balances.has(accountId)) balances.set(accountId, balances.get(accountId) - amount);
    }
    for (const { from, to, amount } of transfers) {
      balances.set(from, balances.get(from) - amount);
      balances.set(to, balances.get(to) + amount);
    }
    const list = byId("finance-accounts");
    list.replaceChildren(...accounts.map(({ id, name, opening }) =>
      financeRow(name + " · " + format(balances.get(id)), "Saldo inicial: " + format(opening))));
    if (!accounts.length) list.append(node("p", "Crea tu primera cuenta para llevar su saldo."));
    renderTransfers(byId("account-transfers"), transfers, true);
    renderTransfers(byId("period-transfers"), transfers.filter(({ date }) => date.slice(0, 7) === month.value));
  }

  function renderTransfers(container, transfers, editable = false) {
    container.hidden = !transfers.length;
    container.replaceChildren(node("h3", "Transferencias"), ...transfers.map((item) => financeRow(
      accountLabel(item.from) + " → " + accountLabel(item.to),
      item.date + " · " + format(item.amount),
      ...(editable ? [action("Eliminar", () => remove("transfers", item, "¿Eliminar esta transferencia?"))] : []),
    )));
  }

  byId("account-form").addEventListener("submit", (event) => save(event, async (form) => {
    const name = value("account-name").trim();
    const opening = cents("opening-balance");
    const accounts = data.accounts ?? [];
    if (!name || !Number.isSafeInteger(opening)) return;
    if (accounts.some((account) => categoryKey(account.name) === categoryKey(name))) {
      showUpdateNotice("Ya existe una cuenta con ese nombre.");
      return;
    }
    if (await persist({ ...data, accounts: [...accounts, { id: crypto.randomUUID(), name, opening }] })) {
      form.reset();
      showUpdateNotice("Cuenta creada.");
    }
  }));

  byId("transfer-form").addEventListener("submit", (event) => save(event, async (form) => {
    const from = value("transfer-from");
    const to = value("transfer-to");
    const date = value("transfer-date");
    const amount = cents("transfer-amount");
    const accounts = new Set(accountOptions().map(([id]) => id));
    if (!accounts.has(from) || !accounts.has(to) || !date || !Number.isSafeInteger(amount) || amount <= 0) return;
    if (from === to) {
      showUpdateNotice("Selecciona dos cuentas distintas.");
      return;
    }
    const transfer = { id: crypto.randomUUID(), from, to, date, amount };
    if (await persist({ ...data, transfers: [...(data.transfers ?? []), transfer] })) {
      form.reset();
      byId("transfer-date").value = localDate();
      showUpdateNotice("Transferencia registrada.");
    }
  }));

  function renderFinance() {
    renderBudgets();
    renderPayments();
    renderAccounts();
  }

  byId("transfer-date").value = localDate();
  window.addEventListener("clarocuenta:render", renderFinance);
  window.addEventListener("focus", renderPayments);
  renderFinance();
})();
