const themeKey = "clarocuenta-theme";
const themeToggle = document.getElementById("theme-toggle");
const themeColor = document.querySelector('meta[name="theme-color"]');
const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
let selectedTheme;
let useLocalThemePreference = () => true;
try {
  selectedTheme = localStorage.getItem(themeKey);
} catch {
  selectedTheme = null;
}

function applyTheme() {
  const dark = selectedTheme ? selectedTheme === "dark" : systemTheme.matches;
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  themeToggle.setAttribute("aria-pressed", String(dark));
  themeColor.content = dark ? "#161429" : "#242048";
}

themeToggle.addEventListener("click", () => {
  selectedTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  try {
    if (useLocalThemePreference()) localStorage.setItem(themeKey, selectedTheme);
  } catch (error) {
    console.warn("No se pudo guardar el tema.", error);
  }
  applyTheme();
  window.dispatchEvent(new Event("clarocuenta:theme-mode"));
});
systemTheme.addEventListener("change", applyTheme);
applyTheme();

const byId = (id) => document.getElementById(id);
const storageKey = "clarocuenta-v1";
const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const format = (cents) => money.format(cents / 100);
function localDate() {
  const date = new Date();
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()]
    .map((part) => String(part).padStart(2, "0")).join("-");
}
function localTime() {
  const now = new Date();
  return [now.getHours(), now.getMinutes()].map((part) => String(part).padStart(2, "0")).join(":");
}

function movementDateLabel({ date, time }) {
  return date + " · " + (time || "Sin hora");
}

function newestMovementFirst(a, b) {
  return b.date.localeCompare(a.date) || (b.time ?? "").localeCompare(a.time ?? "");
}

function periodMovements() {
  return data.movements.filter(({ date }) => date.startsWith(month.value + "-"))
    .reverse().sort(newestMovementFirst);
}

const today = localDate();
const month = byId("month");
const editor = byId("editor");
const form = byId("movement-form");
const fields = form.elements;
let editingId;
const emptyData = () => ({ movements: [], budgets: {} });
let data = emptyData();
let localData = data;
let saveToCloud = null;
let driveAppearanceAccount;
let flushCategory = null;
const reloadMarker = "clarocuenta:manual-reload";
let noticeTimer;
function showUpdateNotice(message, running = false) {
  const notice = byId("update-notice");
  window.clearTimeout(noticeTimer);
  notice.textContent = message;
  if (!running) noticeTimer = window.setTimeout(() => { notice.textContent = ""; }, 6500);
}

function reloadPage() {
  byId("reload-system").disabled = true;
  showUpdateNotice("Recargando la aplicación…", true);
  try { sessionStorage.setItem(reloadMarker, "1"); } catch {}
  window.setTimeout(() => window.location.reload(), 250);
}
let reloadSystem = reloadPage;
month.value = today.slice(0, 7);
try {
  const saved = localStorage.getItem(storageKey);
  if (saved) localData = data = JSON.parse(saved);
} catch {
  byId("notice").textContent = "No se pudieron leer los datos de este navegador.";
}

async function persist(next) {
  if (saveToCloud) return saveToCloud(next);
  try {
    localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    byId("notice").textContent = "No se pudo guardar. Revisa el almacenamiento de tu navegador.";
    return false;
  }
  localData = data = next;
  byId("notice").textContent = "";
  render();
  return true;
}

function node(tag, value, className) {
  const element = document.createElement(tag);
  element.textContent = value;
  if (className) element.className = className;
  return element;
}

function action(label, handler) {
  const button = node("button", label, "secondary");
  button.type = "button";
  button.addEventListener("click", handler);
  return button;
}

function financeRow(title, detail, ...buttons) {
  const entry = node("div", "", "finance-row");
  const description = node("div", "");
  description.append(node("strong", title), node("p", detail));
  entry.append(description, ...buttons);
  return entry;
}

function bar(label, value, total, type) {
  const item = document.createElement("div");
  const caption = node("div", "", "bar-label");
  caption.append(type ? categoryLabel(label, type) : node("span", label), node("strong", format(value)));
  const progress = document.createElement("progress");
  progress.max = Math.max(1, total);
  progress.value = Math.min(value, progress.max);
  progress.setAttribute("aria-label", label || "Sin categoría");
  item.append(caption, progress);
  return item;
}

let periodTotals = { income: 0, expense: 0 };

function render() {
  const entries = periodMovements();
  let income = 0;
  let expense = 0;
  const totals = new Map();
  for (const item of entries) {
    const credit = item.type === "income";
    if (credit) {
      income += item.amount;
    } else {
      expense += item.amount;
      totals.set(item.category, (totals.get(item.category) ?? 0) + item.amount);
    }
  }
  renderMovementList(entries);
  byId("balance").textContent = format(income - expense);
  byId("income").textContent = format(income);
  byId("expense").textContent = format(expense);
  periodTotals = { income, expense };
  const categories = byId("categories");
  if (categories) {
    categories.replaceChildren();
    for (const [category, value] of [...totals].sort((a, b) => b[1] - a[1])) {
      categories.append(bar(category, value, expense, "expense"));
    }
    if (!totals.size) categories.append(node("p", "Tus categorías aparecerán cuando registres un gasto."));
  }
  const budget = data.budgets[month.value];
  byId("budget").value = budget === undefined ? "" : (budget / 100).toFixed(2);
  const status = byId("budget-status");
  status.replaceChildren();
  if (budget === undefined) {
    status.append(node("p", "Fija un límite para comparar tus gastos del mes."));
  } else {
    status.append(bar("Gasto acumulado", expense, budget));
    const difference = budget - expense;
    status.append(node("p", difference >= 0
      ? format(difference) + " disponibles de " + format(budget)
      : "Superaste tu presupuesto de " + format(budget) + " por " + format(-difference),
    difference < 0 ? "debit" : ""));
  }
  renderCustomCategories();
  renderRecentMovements();
  window.dispatchEvent(new Event("clarocuenta:render"));
}

const movementQuery = byId("movement-search");
const movementType = byId("movement-type-filter");
const movementCategory = byId("movement-category-filter");

function searchKey(value) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("es-MX").trim();
}

function accountLabel(id) {
  return data.accounts?.find((account) => account.id === id)?.name ?? "Sin cuenta";
}

function cashTotal(snapshot) {
  const opening = (snapshot.accounts ?? []).reduce((sum, account) => sum + account.opening, 0);
  const net = snapshot.movements.reduce((sum, item) => item.cardId ? sum
    : sum + (item.type === "income" ? item.amount : -item.amount), 0);
  return (snapshot.cardPayments ?? []).reduce((total, payment) => total - payment.amount, opening + net);
}

function reserveBalances(snapshot) {
  const balances = new Map((snapshot.reserves ?? []).map(({ id }) => [id, 0]));
  for (const { reserveId, amount } of snapshot.reserveMovements ?? []) {
    if (balances.has(reserveId)) balances.set(reserveId, balances.get(reserveId) + amount);
  }
  for (const { reserveId, amount } of snapshot.cardPayments ?? []) {
    if (balances.has(reserveId)) balances.set(reserveId, balances.get(reserveId) - amount);
  }
  return balances;
}

function paymentSourceLabel(item) {
  if (item.cardId) return data.cards?.find(({ id }) => id === item.cardId)?.name ?? "Tarjeta";
  return accountLabel(item.accountId);
}

function deleteMovement(item) {
  if (!confirm("¿Eliminar este movimiento?")) return false;
  return persist({ ...data, movements: data.movements.filter(({ id }) => id !== item.id) });
}

function fillSelect(select, options, placeholder, preferred = select.value) {
  select.replaceChildren(new Option(placeholder, ""), ...options.map(([id, label]) => new Option(label, id)));
  select.value = options.some(([id]) => id === preferred) ? preferred : "";
}

function renderMovementList(entries) {
  const movements = byId("movements");
  movements.replaceChildren();
  const type = movementType.value;
  const periodEntries = type ? entries.filter((item) => item.type === type) : entries;
  const categories = [...new Set(periodEntries.map((item) => item.category))].sort((a, b) => a.localeCompare(b, "es-MX"));
  fillSelect(movementCategory, categories.map((label) => ["category:" + label, label || "Sin categoría"]), "Todas");
  const query = searchKey(movementQuery.value);
  const selected = periodEntries.filter((item) =>
    (!movementCategory.value || "category:" + item.category === movementCategory.value) && searchKey(item.description).includes(query));
  for (const item of selected) {
    const credit = item.type === "income";
    const row = node("div", "", "transaction");
    const details = document.createElement("div");
    const metadata = node("p", "");
    metadata.append(categoryLabel(item.category, item.type), " · " + movementDateLabel(item) +
      (item.cardId || item.accountId ? " · " + paymentSourceLabel(item) : ""));
    details.append(node("strong", item.description), metadata);
    const amount = node("strong", (credit ? "+" : "−") + format(item.amount), credit ? "credit" : "debit");
    const actions = node("div", "", "tools");
    actions.append(action("Editar", () => openEditor(item)), action("Eliminar", () => deleteMovement(item)));
    row.append(details, amount, actions);
    movements.append(row);
  }
  if (!selected.length) movements.append(node("p", entries.length
    ? "No hay movimientos que coincidan con los filtros."
    : "Todavía no hay movimientos en este periodo.", "empty"));
}

function updateMovementFilters() {
  const entries = periodMovements();
  renderMovementList(entries);
}

movementQuery.addEventListener("input", updateMovementFilters);
movementType.addEventListener("change", updateMovementFilters);
movementCategory.addEventListener("change", updateMovementFilters);

function renderRecentMovements() {
  const recent = [...data.movements].reverse().sort(newestMovementFirst).slice(0, 4);
  byId("recent-empty").hidden = recent.length > 0;
  byId("recent-table").hidden = recent.length === 0;
  byId("recent-rows").replaceChildren(...recent.map((item) => {
    const credit = item.type === "income";
    const row = document.createElement("tr");
    const title = node("th", item.description, "recent-concept");
    title.scope = "row";
    row.append(
      title,
      categoryCell(item.category, item.type),
      node("td", movementDateLabel(item)),
      node("td", (credit ? "+" : "−") + format(item.amount), "report-value " + (credit ? "credit" : "debit")),
    );
    return row;
  }));
}

function categoryKey(label) {
  return label.normalize("NFKC").trim().toLocaleLowerCase("es-MX");
}

function mergeCustomCategories(preferred, extra) {
  return Object.fromEntries(["expense", "income"].map((type) => {
    const used = new Set();
    const custom = [];
    for (const label of [...(preferred?.[type] ?? []), ...(extra?.[type] ?? [])]) {
      const key = categoryKey(label);
      if (!key || used.has(key)) continue;
      used.add(key);
      custom.push(label);
    }
    return [type, custom];
  }));
}

const categoryIconChoices = [
  ["expense", "🏷️", "Gasto"], ["income", "💰", "Ingreso"], ["food", "🍴", "Comida"],
  ["groceries", "🛒", "Supermercado"], ["transport", "🚗", "Transporte"],
  ["fuel", "⛽", "Gasolina"], ["home", "🏠", "Hogar"], ["health", "💊", "Salud"],
  ["shopping", "🛍️", "Compras"], ["leisure", "🎬", "Entretenimiento"],
  ["work", "💼", "Trabajo"], ["transfer", "🔁", "Transferencia"],
];

function categoryIconId(label, type) {
  return type + ":" + categoryKey(label);
}

function categoryLabel(label, type) {
  const result = node("span", "", "category-label");
  const saved = data.categoryIcons?.find(({ id }) => id === categoryIconId(label, type))?.icon;
  const symbol = categoryIconChoices.find(([key]) => key === saved)?.[1];
  let icon;
  if (typeof saved === "string" && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(saved)) {
    icon = node("img", "", "category-icon");
    icon.src = saved;
    icon.alt = "";
    icon.width = icon.height = 44;
  } else {
    icon = node("span", symbol ?? (type === "income" ? "💰" : "🏷️"), "category-icon");
  }
  icon.setAttribute("aria-hidden", "true");
  result.append(icon, node("span", label || "Sin categoría"));
  return result;
}

function categoryCell(label, type) {
  const cell = node("td", "");
  cell.append(categoryLabel(label, type));
  return cell;
}

const categoryIconDialog = byId("category-icon-dialog");
let editingCategoryIcon;
if (categoryIconDialog?.tagName === "DIALOG") {
  const choice = byId("category-icon-choice");
  choice.append(new Option("Automático", ""), ...categoryIconChoices.map(([key, symbol, name]) =>
    new Option(symbol + " " + name, key)));
  byId("category-icon-cancel").addEventListener("click", () => categoryIconDialog.close());
  byId("category-icon-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = editingCategoryIcon;
    const submit = event.submitter;
    const status = byId("category-icon-status");
    const file = byId("category-icon-file").files[0];
    let icon = choice.value === "uploaded" ? event.currentTarget.dataset.currentImage : choice.value;
    submit.disabled = true;
    try {
      const snapshot = data;
      if (file) icon = await prepareCategoryIcon(file);
      if (!categoryIconDialog.open || editingCategoryIcon !== id) return;
      if (data !== snapshot) {
        status.textContent = "Los datos se actualizaron. Pulsa Guardar ícono de nuevo.";
        return;
      }
      const categoryIcons = (data.categoryIcons ?? []).filter((entry) => entry.id !== id);
      if (icon) categoryIcons.push({ id, icon });
      if (await persist({ ...data, categoryIcons })) {
        categoryIconDialog.close();
        byId("category-status").textContent = "Ícono guardado.";
        if (flushCategory) void flushCategory();
      }
    } catch {
      status.textContent = "Elige una imagen PNG, JPEG o WebP válida de hasta 2 MB.";
    } finally {
      submit.disabled = false;
    }
  });
}

async function prepareCategoryIcon(file) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024) {
    throw new Error("Imagen no admitida");
  }
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const scale = 64 / Math.max(bitmap.width, bitmap.height);
    const width = bitmap.width * scale;
    const height = bitmap.height * scale;
    canvas.getContext("2d").drawImage(bitmap, (64 - width) / 2, (64 - height) / 2, width, height);
    return canvas.toDataURL("image/png");
  } finally {
    bitmap.close();
  }
}

function editCategoryIcon(label, type) {
  editingCategoryIcon = categoryIconId(label, type);
  const saved = data.categoryIcons?.find(({ id }) => id === editingCategoryIcon)?.icon;
  const choice = byId("category-icon-choice");
  choice.querySelector('option[value="uploaded"]')?.remove();
  if (saved?.startsWith("data:")) {
    choice.append(new Option("Conservar imagen subida", "uploaded"));
    choice.value = "uploaded";
  } else {
    choice.value = saved ?? "";
  }
  byId("category-icon-form").dataset.currentImage = saved?.startsWith("data:") ? saved : "";
  byId("category-icon-file").value = "";
  byId("category-icon-title").textContent = "Ícono de " + label;
  byId("category-icon-status").textContent = "";
  categoryIconDialog.showModal();
}

function categoryNames(snapshot, type) {
  const linked = snapshot.movements.filter((item) => item.type === type).map((item) => item.category);
  if (type === "expense") {
    linked.push(...(snapshot.payments ?? []).map(({ category }) => category),
      ...(snapshot.categoryBudgets ?? []).map(({ category }) => category));
  }
  return mergeCustomCategories(snapshot.customCategories, { [type]: linked })[type];
}

function changeCategory(snapshot, type, label, replacement, deleting) {
  const key = categoryKey(label);
  const matches = (item) => categoryKey(item.category) === key;
  const changeLabels = (items, applies = matches) => items.map((item) =>
    applies(item) ? { ...item, category: replacement } : item);
  const customCategories = mergeCustomCategories(snapshot.customCategories);
  customCategories[type] = customCategories[type].filter((name) => categoryKey(name) !== key);
  if (!deleting) customCategories[type].push(replacement);
  const id = categoryIconId(label, type);
  const next = {
    ...snapshot, customCategories,
    movements: changeLabels(snapshot.movements, (item) => item.type === type && matches(item)),
  };
  if (snapshot.categoryIcons) {
    const icon = snapshot.categoryIcons.find((entry) => entry.id === id);
    next.categoryIcons = snapshot.categoryIcons.filter((entry) => entry.id !== id);
    if (!deleting && icon) {
      const newId = categoryIconId(replacement, type);
      next.categoryIcons = next.categoryIcons.filter((entry) => entry.id !== newId);
      next.categoryIcons.push({ ...icon, id: newId });
    }
  }
  if (type === "expense") {
    if (snapshot.payments) next.payments = changeLabels(snapshot.payments);
    if (snapshot.categoryBudgets) {
      next.categoryBudgets = deleting ? snapshot.categoryBudgets.filter((item) => !matches(item))
        : snapshot.categoryBudgets.map((item) => matches(item)
          ? { ...item, category: replacement, id: item.period + ":" + categoryKey(replacement) } : item);
    }
  }
  return next;
}

const manageCategoryDialog = byId("manage-category-dialog");
let categoryEdit;
function manageCategory(label, type, deleting) {
  const key = categoryKey(label);
  categoryEdit = { label, type, deleting, source: saveToCloud };
  const linked = data.movements.filter((item) => item.type === type && categoryKey(item.category) === key).length;
  const payments = type === "expense" && (data.payments ?? []).some((item) => categoryKey(item.category) === key);
  const limits = type === "expense" && (data.categoryBudgets ?? []).some((item) => categoryKey(item.category) === key);
  byId("manage-category-title").textContent = deleting ? "Eliminar «" + label + "»" : "Editar categoría";
  byId("rename-category-fields").hidden = deleting;
  byId("delete-category-fields").hidden = !deleting;
  const name = byId("rename-category");
  name.value = label;
  name.required = !deleting;
  const replace = byId("replace-category");
  byId("replace-category-fields").hidden = !linked && !payments;
  const impact = [linked === 1 ? "Hay 1 movimiento vinculado." : linked ? "Hay " + linked + " movimientos vinculados." : "",
    payments ? "La misma opción se aplicará a los pagos programados vinculados." : "",
    limits ? "También se quitarán los límites de presupuesto de esta categoría." : ""];
  byId("delete-category-impact").textContent = impact.filter(Boolean).join(" ") || "¿Quieres eliminar esta categoría?";
  fillSelect(replace, [
    ["unassigned", "Dejar sin categoría"],
    ...categoryNames(data, type).filter((entry) => categoryKey(entry) !== key).map((entry) => ["category:" + entry, entry]),
  ], "Elige qué hacer", "");
  replace.required = deleting && Boolean(linked || payments);
  byId("manage-category-status").textContent = "";
  byId("manage-category-submit").textContent = deleting ? "Eliminar categoría" : "Guardar cambios";
  manageCategoryDialog.showModal();
}

if (manageCategoryDialog?.tagName === "DIALOG") {
  byId("manage-category-cancel").addEventListener("click", () => manageCategoryDialog.close());
  byId("manage-category-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const { label, type, deleting, source } = categoryEdit;
    const key = categoryKey(label);
    const categories = categoryNames(data, type);
    const status = byId("manage-category-status");
    if (source !== saveToCloud || !categories.includes(label)) {
      status.textContent = "La categoría cambió. Cierra esta ventana y vuelve a intentarlo.";
      return;
    }
    const choice = byId("replace-category").value;
    const replacement = deleting ? (choice.startsWith("category:") ? choice.slice(9) : "")
      : byId("rename-category").value.trim().replace(/\s+/g, " ");
    if (!deleting && !replacement) {
      status.textContent = "Escribe un nombre para la categoría.";
      return;
    }
    if (deleting ? replacement && !categories.includes(replacement)
      : categories.some((entry) => categoryKey(entry) !== key && categoryKey(entry) === categoryKey(replacement))) {
      status.textContent = deleting ? "La categoría de destino cambió. Vuelve a abrir la ventana."
        : "Ya existe una categoría con ese nombre para este tipo.";
      return;
    }
    if (deleting && !choice && (data.movements.some((item) => item.type === type && categoryKey(item.category) === key)
      || (type === "expense" && (data.payments ?? []).some((item) => categoryKey(item.category) === key)))) {
      status.textContent = "Hay nuevos registros vinculados. Vuelve a abrir la ventana para elegir qué hacer.";
      return;
    }
    const submit = byId("manage-category-submit");
    submit.disabled = true;
    try {
      if (!await persist(changeCategory(data, type, label, replacement, deleting))) {
        status.textContent = "No se pudo guardar el cambio.";
        return;
      }
      manageCategoryDialog.close();
      byId("category-status").textContent = deleting ? "Categoría eliminada." : "Categoría actualizada.";
      if (flushCategory) void flushCategory();
    } finally {
      submit.disabled = false;
    }
  });
}

function renderCustomCategories() {
  const list = byId("custom-categories");
  list.replaceChildren();
  for (const [type, name] of [["expense", "Gastos"], ["income", "Ingresos"]]) {
    const categories = categoryNames(data, type);
    if (!categories.length) continue;
    const group = node("div", "", "category-group");
    group.append(node("h3", name, ""));
    const tags = node("ul", "", "category-tags");
    for (const label of categories) {
      const tag = node("li", "");
      tag.append(categoryLabel(label, type));
      if (categoryIconDialog?.tagName === "DIALOG") {
        const button = action("Cambiar ícono", () => editCategoryIcon(label, type));
        button.setAttribute("aria-label", "Cambiar ícono de " + label);
        tag.append(button);
      }
      if (manageCategoryDialog?.tagName === "DIALOG") {
        for (const [caption, deleting] of [["Editar", false], ["Eliminar", true]]) {
          const button = action(caption, () => manageCategory(label, type, deleting));
          button.setAttribute("aria-label", caption + " categoría " + label);
          tag.append(button);
        }
      }
      tags.append(tag);
    }
    group.append(tags);
    list.append(group);
  }
}

function setCategories(current) {
  const type = fields.type.value;
  const labels = [...(data.customCategories?.[type] ?? [])];
  if (current && !labels.includes(current)) labels.push(current);
  const unassigned = current === "";
  const prompt = labels.length ? "Selecciona una categoría" : "Sin categorías para este tipo";
  const placeholder = new Option(unassigned ? "Sin categoría" : prompt, "");
  placeholder.disabled = !unassigned;
  fields.category.required = !unassigned;
  fields.category.replaceChildren(placeholder, ...labels.map((label) => new Option(label, label)));
  fields.category.value = "";
  byId("editor-category-help").hidden = unassigned || Boolean(labels.length);
  if (typeof current === "string") fields.category.value = current;
}

function cardOptions() {
  return (data.cards ?? []).map(({ id, name }) => [id, name]);
}

function updateMovementPaymentSource() {
  const field = byId("movement-card-field");
  field.hidden = fields.type.value !== "expense" || !data.cards?.length;
  byId("movement-account").disabled = !field.hidden && Boolean(byId("movement-card").value);
}

function openEditor(item) {
  editingId = item?.id;
  byId("editor-title").textContent = item ? "Editar movimiento" : "Nuevo movimiento";
  fields.description.value = item?.description ?? "";
  fields.description.setCustomValidity("");
  fields.type.value = item?.type ?? "expense";
  fields.amount.value = item ? (item.amount / 100).toFixed(2) : "";
  fields.date.value = item?.date ?? (today.startsWith(month.value) ? today : month.value + "-01");
  byId("movement-time").value = item ? item.time ?? "" : localTime();
  setCategories(item?.category);
  fillSelect(byId("movement-account"), (data.accounts ?? []).map(({ id, name }) => [id, name]), "Sin cuenta", item?.accountId ?? "");
  fillSelect(byId("movement-card"), cardOptions(), "Sin tarjeta", item?.cardId ?? "");
  updateMovementPaymentSource();
  editor.showModal();
}

byId("add").addEventListener("click", () => openEditor());
byId("add-recent").addEventListener("click", () => openEditor());
byId("cancel").addEventListener("click", () => editor.close());
byId("editor-create-category").addEventListener("click", () => {
  byId("category-type").value = fields.type.value;
  editor.close();
});
month.addEventListener("change", () => {
  if (!month.value) month.value = today.slice(0, 7);
  render();
});
fields.type.addEventListener("change", () => {
  setCategories();
  updateMovementPaymentSource();
});
byId("movement-card").addEventListener("change", updateMovementPaymentSource);
fields.description.addEventListener("input", () => fields.description.setCustomValidity(""));
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const description = fields.description.value.trim();
  if (!description) {
    fields.description.setCustomValidity("Escribe un concepto.");
    fields.description.reportValidity();
    return;
  }
  const item = {
    id: editingId ?? crypto.randomUUID(),
    description,
    type: fields.type.value,
    date: fields.date.value,
    category: fields.category.value,
    amount: Math.round(Number(fields.amount.value) * 100),
  };
  const time = byId("movement-time").value;
  if (time) item.time = time;
  const accountId = byId("movement-account").value;
  const cardId = byId("movement-card").value;
  if (item.type === "expense" && data.cards?.some(({ id }) => id === cardId)) item.cardId = cardId;
  else if (accountId) item.accountId = accountId;
  const previousMonth = month.value;
  month.value = item.date.slice(0, 7);
  const movements = editingId
    ? data.movements.map((entry) => entry.id === editingId ? item : entry)
    : [...data.movements, item];
  if (await persist({ ...data, movements })) {
    if (editor.open) editor.close();
  } else {
    month.value = previousMonth;
    render();
  }
});
byId("budget-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const limit = Math.round(Number(byId("budget").value) * 100);
  persist({ ...data, budgets: { ...data.budgets, [month.value]: limit } });
});
const categoryForm = byId("category-form");
categoryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const field = categoryForm.elements.label;
  const type = categoryForm.elements.type.value;
  const name = field.value.trim().replace(/\s+/g, " ");
  const status = byId("category-status");
  if (!name) {
    status.textContent = "Escribe un nombre para la categoría.";
    return;
  }
  const customCategories = mergeCustomCategories(data.customCategories, { [type]: [name] });
  if (categoryNames(data, type).some((label) => categoryKey(label) === categoryKey(name))) {
    status.textContent = "Ya existe una categoría con ese nombre para este tipo.";
    return;
  }
  if (!await persist({ ...data, customCategories })) return;
  field.value = "";
  status.textContent = "Categoría creada: " + name;
  if (flushCategory) void flushCategory();
});
byId("create-category").disabled = false;
byId("reload-system").addEventListener("click", () => reloadSystem());
try {
  if (sessionStorage.getItem(reloadMarker)) {
    sessionStorage.removeItem(reloadMarker);
    showUpdateNotice("Aplicación recargada.");
  }
} catch {}

window.addEventListener("storage", (event) => {
  if (event.key === storageKey) {
    localData = event.newValue ? JSON.parse(event.newValue) : emptyData();
    if (!saveToCloud) {
      data = localData;
      render();
    }
  }
});
render();
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(console.error);
}
