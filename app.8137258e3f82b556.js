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

function bar(label, value, total) {
  const item = document.createElement("div");
  const caption = node("div", "", "bar-label");
  caption.append(node("span", label), node("strong", format(value)));
  const progress = document.createElement("progress");
  progress.max = Math.max(1, total);
  progress.value = Math.min(value, progress.max);
  progress.setAttribute("aria-label", label);
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
  categories.replaceChildren();
  for (const [category, value] of [...totals].sort((a, b) => b[1] - a[1])) {
    categories.append(bar(category, value, expense));
  }
  if (!totals.size) categories.append(node("p", "Tus categorías aparecerán cuando registres un gasto."));
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
  const previous = movementCategory.value;
  movementCategory.replaceChildren(new Option("Todas", ""), ...categories.map((label) => new Option(label, label)));
  movementCategory.value = categories.includes(previous) ? previous : "";
  const query = searchKey(movementQuery.value);
  const selected = periodEntries.filter((item) =>
    (!movementCategory.value || item.category === movementCategory.value) && searchKey(item.description).includes(query));
  for (const item of selected) {
    const credit = item.type === "income";
    const row = node("div", "", "transaction");
    const details = document.createElement("div");
    details.append(node("strong", item.description), node("p", item.category + " · " + movementDateLabel(item) + (item.cardId || item.accountId ? " · " + paymentSourceLabel(item) : "")));
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
      node("td", item.category),
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

function renderCustomCategories() {
  const custom = data.customCategories;
  const list = byId("custom-categories");
  list.replaceChildren();
  for (const [type, name] of [["expense", "Gastos"], ["income", "Ingresos"]]) {
    const categories = custom?.[type] ?? [];
    if (!categories.length) continue;
    const group = node("div", "", "category-group");
    group.append(node("h3", name, ""));
    const tags = node("ul", "", "category-tags");
    for (const label of categories) tags.append(node("li", label, ""));
    group.append(tags);
    list.append(group);
  }
}

function setCategories(current) {
  const type = fields.type.value;
  const labels = [...(data.customCategories?.[type] ?? [])];
  if (typeof current === "string" && !labels.includes(current)) labels.push(current);
  const placeholder = new Option(labels.length ? "Selecciona una categoría" : "Sin categorías para este tipo", "");
  placeholder.disabled = true;
  fields.category.replaceChildren(placeholder, ...labels.map((label) => new Option(label, label)));
  fields.category.value = "";
  byId("editor-category-help").hidden = Boolean(labels.length);
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
  if (customCategories[type].length === (data.customCategories?.[type]?.length ?? 0)) {
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
