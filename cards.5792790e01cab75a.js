(() => {
  const cardForm = byId("card-form");
  const abonoForm = byId("card-payment-form");
  const targetCard = byId("card-payment-card");
  const abonoDate = byId("card-payment-date");
  const abonoAccount = byId("card-payment-account");
  const abonoReserve = byId("card-payment-reserve");
  let selectedCardId;
  let editingCardId;
  let editingAbonoId;
  let storageAccount = driveAppearanceAccount;

  function setCardEditor(card) {
    editingCardId = card?.id;
    byId("card-name").value = card?.name ?? "";
    byId("card-opening").value = card ? (card.opening / 100).toFixed(2) : "0";
    byId("card-form-title").textContent = card ? "Editar tarjeta" : "Nueva tarjeta";
    byId("save-card").textContent = card ? "Guardar tarjeta" : "Crear tarjeta";
    byId("cancel-card").hidden = !card;
  }

  function setAbonoEditor(cardId, abono) {
    editingAbonoId = abono?.id;
    targetCard.value = cardId ?? "";
    abonoDate.value = abono?.date ?? localDate();
    abonoAccount.value = abono?.accountId ?? "";
    abonoReserve.value = abono?.reserveId ?? "";
    byId("card-payment-amount").value = abono ? (abono.amount / 100).toFixed(2) : "";
    byId("card-payment-note").value = abono?.note ?? "";
    byId("card-payment-title").textContent = abono ? "Editar abono" : "Registrar abono";
    byId("save-card-payment").textContent = abono ? "Guardar abono" : "Registrar abono";
    byId("cancel-card-payment").hidden = !abono;
  }

  function showDetail(id, focus = false) {
    selectedCardId = id;
    renderCards();
    if (!focus) return;
    if (window.location.hash !== "#tarjetas") {
      window.addEventListener("hashchange", () => byId("card-detail-title").focus(), { once: true });
      window.location.hash = "tarjetas";
      return;
    }
    byId("card-detail-title").focus();
  }

  function debtLabel(balance) {
    return balance < 0 ? format(-balance) + " a favor" : format(balance) + " adeudados";
  }

  function renderCards() {
    const cards = data.cards ?? [];
    const ids = new Set(cards.map(({ id }) => id));
    if (storageAccount !== driveAppearanceAccount) {
      storageAccount = driveAppearanceAccount;
      selectedCardId = undefined;
      setCardEditor();
      setAbonoEditor();
    }
    if (editingCardId && !ids.has(editingCardId)) setCardEditor();
    if (editingAbonoId && !data.cardPayments?.some(({ id }) => id === editingAbonoId)) {
      setAbonoEditor(selectedCardId);
    }

    const activity = new Map(cards.map(({ id }) => [id, []]));
    for (const purchase of data.movements) {
      if (purchase.type === "expense") activity.get(purchase.cardId)?.push({ item: purchase, purchase: true });
    }
    for (const abono of data.cardPayments ?? []) {
      activity.get(abono.cardId)?.push({ item: abono, purchase: false });
    }
    const balances = new Map(cards.map(({ id, opening }) => [id,
      activity.get(id).reduce((balance, { item, purchase }) => balance + (purchase ? item.amount : -item.amount), opening),
    ]));
    byId("card-summary").hidden = !cards.length;
    const debt = [...balances.values()].reduce((sum, balance) => sum + Math.max(balance, 0), 0);
    byId("card-total").textContent = format(debt);
    byId("summary-cards").replaceChildren(...cards.map(({ id, name }) => financeRow(name, debtLabel(balances.get(id)),
      action("Ver detalle", () => showDetail(id, true)))));
    byId("card-list").replaceChildren(...cards.map((card) => financeRow(card.name, debtLabel(balances.get(card.id)),
      action("Ver historial", () => showDetail(card.id, true)),
      action("Editar tarjeta", () => {
        setCardEditor(card);
        byId("card-name").focus();
      }),
      action("Registrar abono", () => {
        setAbonoEditor(card.id);
        byId("card-payment-title").focus();
      }))));
    if (!cards.length) byId("card-list").append(node("p", "Todavía no has registrado tarjetas."));

    const selected = cards.find(({ id }) => id === selectedCardId) ?? cards[0];
    byId("card-payments").hidden = !cards.length;
    fillSelect(abonoAccount, (data.accounts ?? []).map(({ id, name }) => [id, name]), "Efectivo o débito sin asignar");
    const reserves = reserveBalances(data);
    fillSelect(abonoReserve, (data.reserves ?? []).map(({ id, name }) =>
      [id, name + " · " + format(reserves.get(id))]), "Sin apartado");
    fillSelect(targetCard, cardOptions(), "Selecciona una tarjeta",
      ids.has(targetCard.value) ? targetCard.value : selected?.id);
    byId("card-detail").hidden = !selected;
    if (!selected) {
      byId("card-history").replaceChildren();
      return;
    }
    byId("card-detail-title").textContent = selected.name;
    byId("card-detail-balance").textContent = debtLabel(balances.get(selected.id));
    byId("card-detail-opening").textContent = "Deuda inicial: " + format(selected.opening);
    const history = byId("card-history");
    const entries = activity.get(selected.id).sort((a, b) => b.item.date.localeCompare(a.item.date));
    history.replaceChildren(...entries.map(({ item, purchase }) => {
      const concept = purchase ? item.description : item.note || "Abono";
      const reserve = data.reserves?.find(({ id }) => id === item.reserveId);
      const source = purchase ? "" : " · " + (item.accountId ? accountLabel(item.accountId) : "Efectivo o débito sin asignar") +
        (reserve ? " · Apartado: " + reserve.name : "");
      const detail = item.date + " · " + (purchase ? "Compra · " + (item.category || "Sin categoría") : "Abono") +
        " · " + (purchase ? "+" : "−") + format(item.amount) + source;
      return financeRow(concept, detail,
        action(purchase ? "Editar compra" : "Editar abono", () => {
          if (purchase) openEditor(item);
          else {
            setAbonoEditor(item.cardId, item);
            byId("card-payment-title").focus();
          }
        }),
        action(purchase ? "Eliminar compra" : "Eliminar abono", async () => {
          if (purchase) {
            if (await deleteMovement(item)) showUpdateNotice("Compra eliminada.");
          } else if (confirm("¿Eliminar este abono?")) {
            const cardPayments = data.cardPayments.filter(({ id }) => id !== item.id);
            if (await persist({ ...data, cardPayments })) showUpdateNotice("Abono eliminado.");
          }
        }));
    }));
    if (!entries.length) history.append(node("p", "Todavía no hay compras ni abonos en esta tarjeta."));
  }

  cardForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = byId("card-name").value.trim();
    const opening = Math.round(Number(byId("card-opening").value) * 100);
    if (!name || !Number.isSafeInteger(opening) || opening < 0) return;
    const current = data.cards ?? [];
    if (current.some((card) => card.id !== editingCardId && categoryKey(card.name) === categoryKey(name))) {
      showUpdateNotice("Ya hay una tarjeta con ese nombre.");
      return;
    }
    const card = { id: editingCardId ?? crypto.randomUUID(), name, opening };
    const cards = editingCardId ? current.map((item) => item.id === card.id ? card : item) : [...current, card];
    if (await persist({ ...data, cards })) {
      setCardEditor();
      showDetail(card.id);
      showUpdateNotice("Tarjeta guardada.");
    }
  });
  byId("cancel-card").addEventListener("click", () => setCardEditor());

  abonoForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const cardId = targetCard.value;
    const date = abonoDate.value;
    const amount = Math.round(Number(byId("card-payment-amount").value) * 100);
    const note = byId("card-payment-note").value.trim();
    if (!data.cards?.some(({ id }) => id === cardId) || !date || !Number.isSafeInteger(amount) || amount <= 0) return;
    const abono = { id: editingAbonoId ?? crypto.randomUUID(), cardId, date, amount, note };
    const current = data.cardPayments ?? [];
    const previous = current.find(({ id }) => id === editingAbonoId);
    if (abonoAccount.value) abono.accountId = abonoAccount.value;
    if (abonoReserve.value) {
      const reserveId = abonoReserve.value;
      const balance = reserveBalances(data).get(reserveId);
      const restored = previous?.reserveId === reserveId ? previous.amount : 0;
      if (balance === undefined || amount > balance + restored) {
        showUpdateNotice("El apartado no tiene suficiente dinero para este abono.");
        return;
      }
      abono.reserveId = reserveId;
    }
    const cardPayments = editingAbonoId ? current.map((item) => item.id === abono.id ? abono : item) : [...current, abono];
    if (await persist({ ...data, cardPayments })) {
      setAbonoEditor(cardId);
      showDetail(cardId);
      showUpdateNotice("Abono guardado.");
    }
  });
  byId("cancel-card-payment").addEventListener("click", () => setAbonoEditor(targetCard.value));
  setAbonoEditor();
  window.addEventListener("clarocuenta:render", renderCards);
  renderCards();
})();
