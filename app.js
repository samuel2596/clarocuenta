const themeKey = "clarocuenta-theme";
const themeToggle = document.getElementById("theme-toggle");
const themeColor = document.querySelector('meta[name="theme-color"]');
const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
let selectedTheme;
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
    localStorage.setItem(themeKey, selectedTheme);
  } catch (error) {
    console.warn("No se pudo guardar el tema.", error);
  }
  applyTheme();
});
systemTheme.addEventListener("change", applyTheme);
applyTheme();

const byId = (id) => document.getElementById(id);
const storageKey = "clarocuenta-v1";
const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const format = (cents) => money.format(cents / 100);
const options = {
  expense: ["Vivienda", "Comida", "Transporte", "Servicios", "Ocio", "Salud", "Otros"],
  income: ["Sueldo", "Freelance", "Otros"],
};
const now = new Date();
const today = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
  .map((part) => String(part).padStart(2, "0")).join("-");
const month = byId("month");
const editor = byId("editor");
const form = byId("movement-form");
const fields = form.elements;
let editingId;
const emptyData = () => ({ movements: [], budgets: {} });
let data = emptyData();
let localData = data;
let saveToCloud = null;
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

function render() {
  const entries = data.movements.filter((item) => item.date.startsWith(month.value + "-"))
    .sort((a, b) => b.date.localeCompare(a.date));
  let income = 0;
  let expense = 0;
  const totals = new Map();
  const movements = byId("movements");
  movements.replaceChildren();
  for (const item of entries) {
    const credit = item.type === "income";
    if (credit) {
      income += item.amount;
    } else {
      expense += item.amount;
      totals.set(item.category, (totals.get(item.category) ?? 0) + item.amount);
    }
    const row = node("div", "", "transaction");
    const details = document.createElement("div");
    details.append(node("strong", item.description), node("p", item.category + " · " + item.date));
    const amount = node("strong", (credit ? "+" : "−") + format(item.amount), credit ? "credit" : "debit");
    const actions = node("div", "", "tools");
    actions.append(action("Editar", () => openEditor(item)), action("Eliminar", () => {
      if (confirm("¿Eliminar este movimiento?")) {
        persist({ ...data, movements: data.movements.filter((entry) => entry.id !== item.id) });
      }
    }));
    row.append(details, amount, actions);
    movements.append(row);
  }
  if (!entries.length) movements.append(node("p", "Todavía no hay movimientos en este periodo.", "empty"));
  byId("demo").hidden = entries.length > 0;
  byId("balance").textContent = format(income - expense);
  byId("income").textContent = format(income);
  byId("expense").textContent = format(expense);
  const chart = byId("balance-chart");
  const total = income + expense;
  const incomeShare = total ? income / total : 0;
  const percent = new Intl.NumberFormat("es-MX", { style: "percent", maximumFractionDigits: 1 });
  chart.style.setProperty("--income-share", (incomeShare * 100) + "%");
  chart.setAttribute("data-empty", String(!total));
  byId("chart-empty").hidden = Boolean(total);
  byId("chart-income").textContent = format(income) + (total ? " · " + percent.format(incomeShare) : "");
  byId("chart-expense").textContent = format(expense) + (total ? " · " + percent.format(expense / total) : "");
  byId("chart-balance").textContent = format(income - expense);
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
  window.dispatchEvent(new Event("clarocuenta:render"));
}

function setCategories() {
  fields.category.replaceChildren(...options[fields.type.value].map((label) => new Option(label, label)));
}

function openEditor(item) {
  editingId = item?.id;
  byId("editor-title").textContent = item ? "Editar movimiento" : "Nuevo movimiento";
  fields.description.value = item?.description ?? "";
  fields.description.setCustomValidity("");
  fields.type.value = item?.type ?? "expense";
  fields.amount.value = item ? (item.amount / 100).toFixed(2) : "";
  fields.date.value = item?.date ?? (today.startsWith(month.value) ? today : month.value + "-01");
  setCategories();
  if (item) fields.category.value = item.category;
  editor.showModal();
}

byId("add").addEventListener("click", () => openEditor());
byId("cancel").addEventListener("click", () => editor.close());
month.addEventListener("change", () => {
  if (!month.value) month.value = today.slice(0, 7);
  render();
});
fields.type.addEventListener("change", setCategories);
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
  const previousMonth = month.value;
  month.value = item.date.slice(0, 7);
  const movements = [...data.movements.filter((entry) => entry.id !== editingId), item];
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
byId("demo").addEventListener("click", () => {
  const examples = [
    ["Nómina", "income", "Sueldo", 22000, "01"],
    ["Renta", "expense", "Vivienda", 6000, "03"],
    ["Supermercado", "expense", "Comida", 1230.5, "08"],
    ["Gasolina", "expense", "Transporte", 750, "11"],
  ].map(([description, type, category, amount, day]) => ({
    id: crypto.randomUUID(), description, type, category,
    amount: Math.round(amount * 100), date: month.value + "-" + day,
  }));
  const budgets = { [month.value]: 1100000, ...data.budgets };
  persist({ movements: [...data.movements, ...examples], budgets });
});
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
