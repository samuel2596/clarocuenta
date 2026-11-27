(() => {
  const years = byId("report-years");
  const months = byId("report-months");
  const hiddenYears = new Set();
  const hiddenMonths = new Set();
  const monthFormat = new Intl.DateTimeFormat("es-MX", { month: "short", year: "numeric", timeZone: "UTC" });
  const label = (period) => monthFormat.format(new Date(period + "-01T12:00:00Z"));
  const series = [
    ["income", "Ingresos"],
    ["expense", "Gastos"],
    ["savings", "Saldo neto"],
  ];

  function renderOptions(container, periods, checked, labelFor, hidden) {
    if (Array.from(container.children, (item) => item.dataset.period).join() === periods.join()) {
      for (const input of container.querySelectorAll("input")) input.checked = !hidden.has(input.value);
      return;
    }
    container.replaceChildren(...periods.map((period) => {
      const item = node("label", "", "filter-choice");
      item.dataset.period = period;
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = period;
      input.checked = checked(period);
      input.addEventListener("change", () => {
        if (input.checked) hidden.delete(period);
        else hidden.add(period);
        render();
      });
      item.append(input, document.createTextNode(labelFor(period)));
      return item;
    }));
  }

  function appendRow(section, values, header = false, rowHeader = false, numericFrom = 1) {
    const row = document.createElement("tr");
    for (const [index, value] of values.entries()) {
      const useHeader = header || (rowHeader && index === 0);
      const cell = node(useHeader ? "th" : "td", "", index >= numericFrom ? "report-value" : "");
      cell.append(value);
      if (useHeader) cell.scope = header ? "col" : "row";
      row.append(cell);
    }
    section.append(row);
  }

  function table(container, title, headers, numericFrom = 1) {
    const scroller = node("div", "", "report-scroll");
    scroller.tabIndex = 0;
    scroller.setAttribute("role", "region");
    scroller.setAttribute("aria-label", title);
    const element = node("table", "", "data-table");
    const head = document.createElement("thead");
    appendRow(head, headers, true, false, numericFrom);
    const body = document.createElement("tbody");
    const foot = document.createElement("tfoot");
    element.append(head, body, foot);
    scroller.append(element);
    container.replaceChildren(scroller);
    return { body, foot };
  }

  function chart(container, totals, metrics) {
    let maximum = 0;
    let minimum = 0;
    for (const row of totals) {
      for (const [key] of metrics) {
        maximum = Math.max(maximum, row[key]);
        minimum = Math.min(minimum, row[key]);
      }
    }
    const span = maximum - minimum || 1;
    const zero = span === 1 && !maximum && !minimum ? 100 : maximum / span * 100;
    const legend = node("div", "", "report-legend");
    for (const [key, name] of metrics) {
      const item = node("span", "", "series-key");
      item.append(node("i", "", "series-" + key), document.createTextNode(name));
      legend.append(item);
    }
    const scroller = node("div", "", "report-scroll");
    scroller.tabIndex = 0;
    scroller.setAttribute("role", "region");
    scroller.setAttribute("aria-label", metrics.length === 1 ? "Gráfica de saldo neto por mes" : "Gráfica de evolución mensual");
    const groups = node("div", "", "chart-groups");
    for (const row of totals) {
      const group = node("div", "", "chart-group");
      const plot = node("div", "", "chart-plot");
      plot.style.setProperty("--zero", zero + "%");
      for (const [key, name] of metrics) {
        const amount = row[key];
        const column = node("div", "", "chart-column");
        const bar = node("span", "", "report-bar series-" + key);
        bar.style.top = (zero - Math.max(amount, 0) / span * 100) + "%";
        bar.style.height = (Math.abs(amount) / span * 100) + "%";
        bar.title = name + ": " + format(amount);
        column.append(bar);
        plot.append(column);
      }
      const exact = node("ul", "", "chart-values");
      for (const [key, name] of metrics) {
        const item = node("li", "", "series-key");
        item.append(node("i", "", "series-" + key), node("span", format(row[key])));
        item.setAttribute("aria-label", name + ": " + format(row[key]));
        exact.append(item);
      }
      group.append(plot, node("strong", label(row.period), "chart-period"), exact);
      groups.append(group);
    }
    scroller.append(groups);
    container.replaceChildren(legend, scroller);
  }

  function render() {
    const entries = data.movements.filter((item) => /^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(item.date));
    const available = [...new Set(entries.map(({ date }) => date.slice(0, 7)))].sort();
    const availableYears = [...new Set(available.map((period) => period.slice(0, 4)))];
    const visibleMonths = available.filter((period) => !hiddenYears.has(period.slice(0, 4)));
    const selected = visibleMonths.filter((period) => !hiddenMonths.has(period));
    renderOptions(years, availableYears, (period) => !hiddenYears.has(period), String, hiddenYears);
    renderOptions(months, visibleMonths, (period) => !hiddenMonths.has(period), label, hiddenMonths);
    byId("report-filters").hidden = !available.length;
    byId("report-results").hidden = !selected.length;
    byId("report-empty").textContent = !available.length ? "Registra un movimiento para ver tus reportes."
      : selected.length ? "" : "Selecciona al menos un año y un mes con movimientos.";
    const categoryBars = byId("report-category-bars");
    if (!selected.length) {
      categoryBars?.replaceChildren();
      for (const id of ["report-series", "report-savings", "report-pivot", "report-movements"]) byId(id).replaceChildren();
      return;
    }

    const byPeriod = new Map(selected.map((period) => [period, { period, income: 0, expense: 0, savings: 0 }]));
    const categories = new Map();
    const rows = [];
    for (const item of entries) {
      const period = item.date.slice(0, 7);
      const total = byPeriod.get(period);
      if (!total) continue;
      rows.push(item);
      total[item.type] += item.amount;
      if (item.type === "expense") {
        if (!categories.has(item.category)) categories.set(item.category, new Map());
        const totals = categories.get(item.category);
        totals.set(period, (totals.get(period) ?? 0) + item.amount);
      }
    }
    const totals = [...byPeriod.values()];
    for (const total of totals) total.savings = total.income - total.expense;
    chart(byId("report-series"), totals, series);
    chart(byId("report-savings"), totals, [series[2]]);

    const totalExpense = totals.reduce((sum, { expense }) => sum + expense, 0);
    const categoryTotals = [...categories].map(([category, amounts]) => {
      const values = selected.map((period) => amounts.get(period) ?? 0);
      return { category, values, total: values.reduce((sum, amount) => sum + amount, 0) };
    });
    if (categoryBars) {
      const ranked = [...categoryTotals].sort((a, b) => b.total - a.total || a.category.localeCompare(b.category, "es"));
      categoryBars.replaceChildren(...ranked.map(({ category, total }) => bar(category, total, totalExpense, "expense")));
      if (!ranked.length) categoryBars.append(node("p", "No hay gastos en el periodo seleccionado."));
    }

    const pivot = table(byId("report-pivot"), "Gastos por categoría y mes", ["Categoría", ...selected.map(label), "Total"]);
    for (const { category, values, total } of categoryTotals.sort((a, b) => a.category.localeCompare(b.category, "es"))) {
      appendRow(pivot.body, [categoryLabel(category, "expense"), ...values.map(format), format(total)], false, true);
    }
    appendRow(pivot.foot, ["Total de gastos", ...totals.map(({ expense }) => format(expense)),
      format(totalExpense)], false, true);

    const movements = table(byId("report-movements"), "Movimientos registrados", ["Fecha", "Concepto", "Categoría", "Tipo", "Cuenta o tarjeta", "Monto"], 5);
    for (const item of rows.reverse().sort(newestMovementFirst)) {
      const income = item.type === "income";
      appendRow(movements.body, [movementDateLabel(item), item.description, categoryLabel(item.category, item.type), income ? "Ingreso" : "Gasto", paymentSourceLabel(item),
        (income ? "+" : "−") + format(item.amount)], false, false, 5);
    }
  }

  byId("report-reset").addEventListener("click", () => {
    hiddenYears.clear();
    hiddenMonths.clear();
    render();
  });
  window.addEventListener("clarocuenta:render", render);
  render();
})();
