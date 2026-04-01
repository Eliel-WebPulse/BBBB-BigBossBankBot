const { createClient } = window.supabase;

const STORAGE_KEY = 'finn_wealth_os_config';
const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const YEAR_COUNT = 10;

const state = {
  client: null,
  session: null,
  user: null,
  data: {
    transactions: [],
    bills: [],
    assetsLiabilities: [],
    goals: [],
    telegramLink: null
  },
  selectedYear: new Date().getFullYear(),
  selectedCalendarDate: null,
  charts: {}
};

const els = {
  authStatus: document.getElementById('authStatus'),
  sessionPill: document.getElementById('sessionPill'),
  supabaseUrl: document.getElementById('supabaseUrl'),
  supabaseAnonKey: document.getElementById('supabaseAnonKey'),
  telegramBotUsername: document.getElementById('telegramBotUsername'),
  emailInput: document.getElementById('emailInput'),
  passwordInput: document.getElementById('passwordInput'),
  saveConfigBtn: document.getElementById('saveConfigBtn'),
  signInBtn: document.getElementById('signInBtn'),
  signUpBtn: document.getElementById('signUpBtn'),
  logoutBtn: document.getElementById('logoutBtn'),
  generateLinkBtn: document.getElementById('generateLinkBtn'),
  openTelegramLinkBtn: document.getElementById('openTelegramLinkBtn'),
  linkCode: document.getElementById('linkCode'),
  currentBalance: document.getElementById('currentBalance'),
  totalIncome: document.getElementById('totalIncome'),
  totalExpense: document.getElementById('totalExpense'),
  transactionCount: document.getElementById('transactionCount'),
  yearSelect: document.getElementById('yearSelect'),
  yearNetWorth: document.getElementById('yearNetWorth'),
  yearGoal: document.getElementById('yearGoal'),
  goalGap: document.getElementById('goalGap'),
  yearGrowth: document.getElementById('yearGrowth'),
  multiNetWorth: document.getElementById('multiNetWorth'),
  multiGoal: document.getElementById('multiGoal'),
  multiGrowth: document.getElementById('multiGrowth'),
  goalProgressLabel: document.getElementById('goalProgressLabel'),
  assetsTableBody: document.getElementById('assetsTableBody'),
  liabilitiesTableBody: document.getElementById('liabilitiesTableBody'),
  transactionsTableBody: document.getElementById('transactionsTableBody'),
  billsTableBody: document.getElementById('billsTableBody'),
  monthlyBillsTotal: document.getElementById('monthlyBillsTotal'),
  yearlyBillsTotal: document.getElementById('yearlyBillsTotal'),
  calendarGrid: document.getElementById('calendarGrid'),
  calendarMonthLabel: document.getElementById('calendarMonthLabel'),
  selectedDateLabel: document.getElementById('selectedDateLabel'),
  calendarEventsList: document.getElementById('calendarEventsList')
};

function formatCurrency(value) {
  return Number(value || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  });
}

function formatDate(value) {
  return toDateParts(value).date.toLocaleDateString('pt-BR');
}

function toDateParts(value) {
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);

    if (match) {
      const year = Number(match[1]);
      const monthIndex = Number(match[2]) - 1;
      const day = Number(match[3]);

      return {
        year,
        monthIndex,
        day,
        date: new Date(year, monthIndex, day)
      };
    }
  }

  const date = new Date(value);

  return {
    year: date.getFullYear(),
    monthIndex: date.getMonth(),
    day: date.getDate(),
    date
  };
}

function loadConfig() {
  try {
    const config = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    els.supabaseUrl.value = config.url || '';
    els.supabaseAnonKey.value = config.anonKey || '';
    els.telegramBotUsername.value = config.telegramBotUsername || '';
    return config;
  } catch (error) {
    console.error(error);
    return {};
  }
}

function saveConfig() {
  const config = {
    url: els.supabaseUrl.value.trim(),
    anonKey: els.supabaseAnonKey.value.trim(),
    telegramBotUsername: els.telegramBotUsername.value.trim().replace(/^@+/, '')
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  return config;
}

function buildTelegramDeepLink(code) {
  const username = els.telegramBotUsername.value.trim().replace(/^@+/, '');

  if (!username || !code || code === '----') {
    return null;
  }

  return `https://t.me/${username}?start=${encodeURIComponent(code)}`;
}

function updateTelegramLinkButton(code = els.linkCode.textContent.trim()) {
  const deepLink = buildTelegramDeepLink(code);

  if (!deepLink) {
    els.openTelegramLinkBtn.href = '#';
    els.openTelegramLinkBtn.classList.add('disabled');
    els.openTelegramLinkBtn.setAttribute('aria-disabled', 'true');
    return;
  }

  els.openTelegramLinkBtn.href = deepLink;
  els.openTelegramLinkBtn.classList.remove('disabled');
  els.openTelegramLinkBtn.removeAttribute('aria-disabled');
}

function notify(message) {
  window.alert(message);
}

function setAuthMessage(error, fallback = 'Nao consegui concluir esta acao agora.') {
  const rawMessage = String(error && error.message ? error.message : '').toLowerCase();

  if (rawMessage.includes('invalid login credentials')) {
    notify('Email ou senha incorretos. Se ainda nao tiver cadastro, use "Criar conta".');
    return;
  }

  if (rawMessage.includes('email not confirmed')) {
    notify('Confirme seu email antes de entrar no dashboard.');
    return;
  }

  notify(error && error.message ? error.message : fallback);
}

function makeYearOptions() {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: YEAR_COUNT }, (_, index) => currentYear - index);
  els.yearSelect.innerHTML = years
    .map((year) => `<option value="${year}">${year}</option>`)
    .join('');
  els.yearSelect.value = String(state.selectedYear);
}

function initClient() {
  const config = saveConfig();
  const anonKey = config.anonKey;

  if (!config.url || !anonKey) {
    els.authStatus.textContent = 'Informe URL e anon key do Supabase';
    return null;
  }

  state.client = createClient(config.url, anonKey);
  els.authStatus.textContent = 'Cliente Supabase configurado';
  return state.client;
}

function updateAuthUI() {
  const isAuthenticated = Boolean(state.user);

  els.logoutBtn.disabled = !isAuthenticated;
  els.generateLinkBtn.disabled = !isAuthenticated;

  if (isAuthenticated) {
    els.sessionPill.textContent = `Sessao ativa em ${state.user.email}`;
    els.sessionPill.classList.add('is-authenticated');
    return;
  }

  els.sessionPill.textContent = 'Sessão não iniciada';
  els.sessionPill.classList.remove('is-authenticated');
  els.linkCode.textContent = '----';
  updateTelegramLinkButton('----');
}

function resetDashboardData() {
  state.data.transactions = [];
  state.data.bills = [];
  state.data.assetsLiabilities = [];
  state.data.goals = [];
  state.data.telegramLink = null;
  state.selectedYear = new Date().getFullYear();
  els.linkCode.textContent = '----';
  renderFinanceSection();
  renderYearlySection();
  renderMultiYearSection();
  renderBillsSection();
  renderCalendar();
}

function emptyArrayMessage(colspan, text) {
  return `<tr><td colspan="${colspan}" class="muted">${text}</td></tr>`;
}

function entriesByYear(entries, year) {
  return entries.filter((item) => toDateParts(item.date).year === year);
}

function getAvailableYears() {
  const years = [
    ...state.data.assetsLiabilities.map((item) => toDateParts(item.date).year),
    ...state.data.transactions.map((item) => toDateParts(item.date).year)
  ];

  return Array.from(new Set(years)).sort((a, b) => a - b);
}

function summarizeTransactions(entries) {
  const receitas = entries
    .filter((item) => item.type === 'income')
    .reduce((acc, item) => acc + Number(item.amount || 0), 0);
  const gastos = entries
    .filter((item) => item.type === 'expense')
    .reduce((acc, item) => acc + Number(item.amount || 0), 0);

  return {
    receitas,
    gastos,
    saldo: receitas - gastos
  };
}

function buildMonthlyTransactionSeries(entries, year) {
  const yearlyEntries = entriesByYear(entries, year);
  let saldoAcumulado = 0;

  return MONTHS.map((label, monthIndex) => {
    const monthEntries = yearlyEntries.filter((item) => toDateParts(item.date).monthIndex === monthIndex);
    const resumo = summarizeTransactions(monthEntries);
    saldoAcumulado += resumo.saldo;

    return {
      label,
      receitas: resumo.receitas,
      gastos: resumo.gastos,
      saldo: saldoAcumulado
    };
  });
}

function formatTransactionType(type) {
  return type === 'income' ? 'Receita' : 'Gasto';
}

function formatSignedCurrency(type, amount) {
  const prefix = type === 'income' ? '+' : '-';
  return `${prefix}${formatCurrency(amount)}`;
}

function computeFallbackWealthMetricsFromTransactions(year, goal) {
  const transactionRows = entriesByYear(state.data.transactions, year);
  const resumo = summarizeTransactions(transactionRows);
  const netWorthByMonth = buildMonthlyTransactionSeries(state.data.transactions, year)
    .map((item) => ({ label: item.label, total: item.saldo }));
  const assetsByMonth = netWorthByMonth
    .map((item) => ({ label: item.label, total: item.total > 0 ? item.total : 0 }));
  const referenceDate = transactionRows[0] ? transactionRows[0].date : `${year}-01-01`;
  const assets = resumo.saldo > 0
    ? [{
      category: 'Caixa',
      name: 'Saldo do bot',
      value: resumo.saldo,
      date: referenceDate
    }]
    : [];
  const liabilities = resumo.saldo < 0
    ? [{
      category: 'Saldo',
      name: 'Saldo negativo do bot',
      value: Math.abs(resumo.saldo),
      date: referenceDate
    }]
    : [];
  const firstMonth = netWorthByMonth.find((item) => item.total !== 0)?.total || 0;
  const lastMonth = netWorthByMonth[netWorthByMonth.length - 1]?.total || 0;
  const growth = firstMonth === 0 ? 0 : ((lastMonth - firstMonth) / Math.abs(firstMonth)) * 100;

  return {
    goalValue: goal ? Number(goal.net_worth_goal) : 0,
    goalGap: Math.max((goal ? Number(goal.net_worth_goal) : 0) - resumo.saldo, 0),
    growth,
    netWorth: resumo.saldo,
    assetTotal: assets.reduce((acc, item) => acc + Number(item.value), 0),
    liabilityTotal: liabilities.reduce((acc, item) => acc + Number(item.value), 0),
    assets,
    liabilities,
    assetsByMonth,
    netWorthByMonth
  };
}

function groupMonthlySnapshots(entries, year, type) {
  return MONTHS.map((label, monthIndex) => {
    const monthEntries = entries.filter((item) => {
      const dateParts = toDateParts(item.date);
      return dateParts.year === year && dateParts.monthIndex === monthIndex && item.type === type;
    });

    return {
      label,
      total: monthEntries.reduce((acc, item) => acc + Number(item.value), 0)
    };
  });
}

function computeWealthMetrics(year) {
  const wealthRows = entriesByYear(state.data.assetsLiabilities, year);
  const assets = wealthRows.filter((row) => row.type === 'asset');
  const liabilities = wealthRows.filter((row) => row.type === 'liability');
  const goal = state.data.goals.find((item) => toDateParts(item.end_date).year === year) || state.data.goals[0] || null;

  if (!wealthRows.length) {
    return computeFallbackWealthMetricsFromTransactions(year, goal);
  }

  const assetTotal = assets.reduce((acc, item) => acc + Number(item.value), 0);
  const liabilityTotal = liabilities.reduce((acc, item) => acc + Number(item.value), 0);
  const netWorth = assetTotal - liabilityTotal;
  const assetsByMonth = groupMonthlySnapshots(wealthRows, year, 'asset');
  const liabilitiesByMonth = groupMonthlySnapshots(wealthRows, year, 'liability');
  const netWorthByMonth = assetsByMonth.map((item, index) => ({
    label: item.label,
    total: item.total - liabilitiesByMonth[index].total
  }));
  const firstMonth = netWorthByMonth.find((item) => item.total !== 0)?.total || 0;
  const lastMonth = netWorthByMonth[netWorthByMonth.length - 1]?.total || 0;
  const growth = firstMonth === 0 ? 0 : ((lastMonth - firstMonth) / Math.abs(firstMonth)) * 100;

  return {
    goalValue: goal ? Number(goal.net_worth_goal) : 0,
    goalGap: Math.max((goal ? Number(goal.net_worth_goal) : 0) - netWorth, 0),
    growth,
    netWorth,
    assetTotal,
    liabilityTotal,
    assets,
    liabilities,
    assetsByMonth,
    netWorthByMonth
  };
}

function categoryTotals(entries) {
  const map = new Map();

  entries.forEach((entry) => {
    const key = entry.category || 'Outros';
    map.set(key, (map.get(key) || 0) + Number(entry.value));
  });

  const labels = Array.from(map.keys());
  const values = Array.from(map.values());
  return { labels, values };
}

function buildChart(name, config) {
  if (state.charts[name]) {
    state.charts[name].destroy();
  }

  state.charts[name] = new Chart(document.getElementById(name), config);
}

function renderFinanceSection() {
  const resumo = summarizeTransactions(state.data.transactions);
  const series = buildMonthlyTransactionSeries(state.data.transactions, state.selectedYear);

  els.currentBalance.textContent = formatCurrency(resumo.saldo);
  els.totalIncome.textContent = formatCurrency(resumo.receitas);
  els.totalExpense.textContent = formatCurrency(resumo.gastos);
  els.transactionCount.textContent = String(state.data.transactions.length);

  buildChart('cashflowChart', {
    type: 'line',
    data: {
      labels: series.map((item) => item.label),
      datasets: [{
        label: 'Saldo acumulado',
        data: series.map((item) => item.saldo),
        borderColor: '#39d98a',
        backgroundColor: 'rgba(57, 217, 138, 0.16)',
        fill: true,
        tension: 0.35
      }]
    }
  });

  els.transactionsTableBody.innerHTML = state.data.transactions.length
    ? state.data.transactions.slice(0, 10).map((item) => `
      <tr>
        <td>${formatTransactionType(item.type)}</td>
        <td>${item.category || 'Outros'}</td>
        <td>${item.description || 'Sem descricao'}</td>
        <td>${formatSignedCurrency(item.type, item.amount)}</td>
        <td>${formatDate(item.date)}</td>
      </tr>
    `).join('')
    : emptyArrayMessage(5, 'Sem transações registradas pelo bot.');
}

function renderYearlySection() {
  const summary = computeWealthMetrics(state.selectedYear);
  els.yearNetWorth.textContent = formatCurrency(summary.netWorth);
  els.yearGoal.textContent = formatCurrency(summary.goalValue);
  els.goalGap.textContent = formatCurrency(summary.goalGap);
  els.yearGrowth.textContent = `${summary.growth.toFixed(2)}%`;

  const assetCategories = categoryTotals(summary.assets);
  const liabilityCategories = categoryTotals(summary.liabilities);

  buildChart('netWorthLineChart', {
    type: 'line',
    data: {
      labels: summary.netWorthByMonth.map((item) => item.label),
      datasets: [{
        label: 'Patrimônio líquido',
        data: summary.netWorthByMonth.map((item) => item.total),
        borderColor: '#62e0ff',
        backgroundColor: 'rgba(98, 224, 255, 0.18)',
        fill: true,
        tension: 0.35
      }]
    }
  });

  buildChart('assetsDonutChart', {
    type: 'doughnut',
    data: {
      labels: assetCategories.labels,
      datasets: [{
        data: assetCategories.values,
        backgroundColor: ['#62e0ff', '#39d98a', '#9f7aea', '#f5b14d', '#ff6d7a']
      }]
    }
  });

  buildChart('liabilitiesDonutChart', {
    type: 'doughnut',
    data: {
      labels: liabilityCategories.labels,
      datasets: [{
        data: liabilityCategories.values,
        backgroundColor: ['#ff6d7a', '#f58a54', '#f5b14d', '#9f7aea']
      }]
    }
  });

  buildChart('netWorthBarChart', {
    type: 'bar',
    data: {
      labels: summary.netWorthByMonth.map((item) => item.label),
      datasets: [{
        label: 'Net worth',
        data: summary.netWorthByMonth.map((item) => item.total),
        backgroundColor: '#31b1ff'
      }]
    }
  });

  buildChart('assetsByMonthChart', {
    type: 'bar',
    data: {
      labels: summary.assetsByMonth.map((item) => item.label),
      datasets: [{
        label: 'Assets',
        data: summary.assetsByMonth.map((item) => item.total),
        backgroundColor: '#39d98a'
      }]
    }
  });

  els.assetsTableBody.innerHTML = summary.assets.length
    ? summary.assets.map((item) => `<tr><td>${item.category}</td><td>${item.name}</td><td>${formatCurrency(item.value)}</td><td>${formatDate(item.date)}</td></tr>`).join('')
    : emptyArrayMessage(4, 'Sem ativos cadastrados para este ano.');

  els.liabilitiesTableBody.innerHTML = summary.liabilities.length
    ? summary.liabilities.map((item) => `<tr><td>${item.category}</td><td>${item.name}</td><td>${formatCurrency(item.value)}</td><td>${formatDate(item.date)}</td></tr>`).join('')
    : emptyArrayMessage(4, 'Sem passivos cadastrados para este ano.');
}

function renderMultiYearSection() {
  const years = getAvailableYears();
  const points = years.map((year) => ({
    year,
    summary: computeWealthMetrics(year)
  }));

  const latestGoal = state.data.goals[0] ? Number(state.data.goals[0].net_worth_goal) : 0;
  const latestNetWorth = points.length ? points[points.length - 1].summary.netWorth : 0;
  const firstNetWorth = points.length ? points[0].summary.netWorth : 0;
  const growth = firstNetWorth === 0 ? 0 : ((latestNetWorth - firstNetWorth) / Math.abs(firstNetWorth)) * 100;
  const allAssets = state.data.assetsLiabilities.filter((item) => item.type === 'asset');
  const allLiabilities = state.data.assetsLiabilities.filter((item) => item.type === 'liability');
  const assetsTotals = categoryTotals(allAssets);
  const liabilitiesTotals = categoryTotals(allLiabilities);
  const progress = latestGoal ? Math.min((latestNetWorth / latestGoal) * 100, 100) : 0;

  els.multiNetWorth.textContent = formatCurrency(latestNetWorth);
  els.multiGoal.textContent = formatCurrency(latestGoal);
  els.multiGrowth.textContent = `${growth.toFixed(2)}%`;
  els.goalProgressLabel.textContent = `${progress.toFixed(1)}%`;

  buildChart('multiYearLineChart', {
    type: 'line',
    data: {
      labels: points.map((item) => item.year),
      datasets: [{
        label: 'Patrimônio líquido',
        data: points.map((item) => item.summary.netWorth),
        borderColor: '#9f7aea',
        backgroundColor: 'rgba(159, 122, 234, 0.16)',
        fill: true,
        tension: 0.35
      }]
    }
  });

  buildChart('multiAssetsDonutChart', {
    type: 'doughnut',
    data: {
      labels: assetsTotals.labels,
      datasets: [{
        data: assetsTotals.values,
        backgroundColor: ['#62e0ff', '#39d98a', '#9f7aea', '#f5b14d', '#ff6d7a']
      }]
    }
  });

  buildChart('multiLiabilitiesDonutChart', {
    type: 'doughnut',
    data: {
      labels: liabilitiesTotals.labels,
      datasets: [{
        data: liabilitiesTotals.values,
        backgroundColor: ['#ff6d7a', '#f58a54', '#f5b14d', '#9f7aea']
      }]
    }
  });

  buildChart('goalProgressChart', {
    type: 'doughnut',
    data: {
      labels: ['Concluído', 'Restante'],
      datasets: [{
        data: [progress, Math.max(100 - progress, 0)],
        backgroundColor: ['#39d98a', 'rgba(255,255,255,0.08)']
      }]
    }
  });
}

function renderBillsSection() {
  const bills = state.data.bills;
  const monthly = bills.filter((item) => item.frequency === 'monthly').reduce((acc, item) => acc + Number(item.amount), 0);
  const yearly = bills.reduce((acc, item) => {
    const value = Number(item.amount);
    if (item.frequency === 'monthly') return acc + value * 12;
    if (item.frequency === 'weekly') return acc + value * 52;
    return acc + value;
  }, 0);

  els.monthlyBillsTotal.textContent = formatCurrency(monthly);
  els.yearlyBillsTotal.textContent = formatCurrency(yearly);
  els.billsTableBody.innerHTML = bills.length
    ? bills.map((item) => `<tr><td>${item.name}</td><td>${formatCurrency(item.amount)}</td><td>${formatDate(item.due_date)}</td><td>${item.frequency}</td><td>${item.status}</td></tr>`).join('')
    : emptyArrayMessage(5, 'Sem contas ou assinaturas cadastradas.');
}

function getCalendarEvents() {
  const current = new Date();
  return state.data.bills
    .filter((item) => {
      const due = toDateParts(item.due_date);
      return due.monthIndex === current.getMonth() && due.year === current.getFullYear();
    })
    .reduce((acc, item) => {
      const day = toDateParts(item.due_date).day;
      if (!acc[day]) {
        acc[day] = [];
      }
      acc[day].push(item);
      return acc;
    }, {});
}

function renderCalendar() {
  const current = new Date();
  const eventsByDay = getCalendarEvents();
  const daysInMonth = new Date(current.getFullYear(), current.getMonth() + 1, 0).getDate();

  els.calendarMonthLabel.textContent = current.toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric'
  });

  els.calendarGrid.innerHTML = Array.from({ length: daysInMonth }, (_, index) => {
    const day = index + 1;
    const events = eventsByDay[day] || [];
    const active = state.selectedCalendarDate === day ? 'active' : '';
    const hasEvents = events.length ? 'has-events' : '';

    return `
      <button class="calendar-day ${active} ${hasEvents}" data-day="${day}" type="button">
        <strong>${day}</strong>
        ${events.length ? `<span class="calendar-pill">${events.length} conta(s)</span>` : ''}
      </button>
    `;
  }).join('');

  document.querySelectorAll('.calendar-day').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedCalendarDate = Number(button.dataset.day);
      renderCalendar();
      renderCalendarEvents(eventsByDay[state.selectedCalendarDate] || []);
    });
  });

  renderCalendarEvents(eventsByDay[state.selectedCalendarDate] || []);
}

function renderCalendarEvents(events) {
  if (!state.selectedCalendarDate) {
    els.selectedDateLabel.textContent = 'Selecione um dia para ver os vencimentos.';
    els.calendarEventsList.innerHTML = '';
    return;
  }

  els.selectedDateLabel.textContent = `Vencimentos do dia ${state.selectedCalendarDate}`;
  els.calendarEventsList.innerHTML = events.length
    ? events.map((item) => `<div class="calendar-event-item"><strong>${item.name}</strong><div class="muted">${formatCurrency(item.amount)} • ${item.frequency} • ${item.status}</div></div>`).join('')
    : '<div class="muted">Nenhum vencimento nesta data.</div>';
}

async function fetchTelegramLink() {
  const { data, error } = await state.client
    .from('telegram_links')
    .select('*')
    .eq('user_id', state.user.id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  state.data.telegramLink = data;
  els.linkCode.textContent = data && data.link_code ? data.link_code : '----';
  updateTelegramLinkButton();
}

async function fetchAllData() {
  if (!state.client || !state.user) {
    return;
  }

  const [
    { data: transactions, error: transactionsError },
    { data: bills, error: billsError },
    { data: assetsLiabilities, error: assetsLiabilitiesError },
    { data: goals, error: goalsError }
  ] = await Promise.all([
    state.client.from('transactions').select('*').order('date', { ascending: false }),
    state.client.from('bills_subscriptions').select('*').order('due_date', { ascending: true }),
    state.client.from('assets_liabilities').select('*').order('date', { ascending: false }),
    state.client.from('goals').select('*').order('end_date', { ascending: false })
  ]);

  const fetchError = transactionsError || billsError || assetsLiabilitiesError || goalsError;

  if (fetchError) {
    throw fetchError;
  }

  state.data.transactions = transactions || [];
  state.data.bills = bills || [];
  state.data.assetsLiabilities = assetsLiabilities || [];
  state.data.goals = goals || [];

  const years = getAvailableYears();
  if (years.length) {
    state.selectedYear = Math.max(...years);
    els.yearSelect.value = String(state.selectedYear);
  }

  renderFinanceSection();
  renderYearlySection();
  renderMultiYearSection();
  renderBillsSection();
  renderCalendar();
}

async function signIn() {
  const email = els.emailInput.value.trim();
  const password = els.passwordInput.value;
  const { data, error } = await state.client.auth.signInWithPassword({ email, password });

  if (error) {
    throw error;
  }

  state.session = data.session;
  state.user = data.user;
}

async function signUp() {
  const email = els.emailInput.value.trim();
  const password = els.passwordInput.value;
  const { error } = await state.client.auth.signUp({ email, password });

  if (error) {
    throw error;
  }
}

async function generateTelegramCode() {
  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  const payload = {
    user_id: state.user.id,
    link_code: code,
    chat_id: null,
    linked_at: null
  };

  const { error } = await state.client
    .from('telegram_links')
    .upsert([payload], { onConflict: 'user_id' });

  if (error) {
    throw error;
  }

  els.linkCode.textContent = code;
  updateTelegramLinkButton(code);

  const deepLink = buildTelegramDeepLink(code);

  if (deepLink) {
    notify(`Codigo gerado: ${code}. Agora clique em "Abrir no Telegram".`);
  } else {
    notify(`Codigo gerado: ${code}. Preencha o username do bot para abrir o Telegram direto, ou envie /link ${code} manualmente.`);
  }
}

function updateAuthStatus(text) {
  els.authStatus.textContent = text;
}

function bindSidebarNavigation() {
  document.querySelectorAll('.sidebar-link').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.sidebar-link').forEach((link) => link.classList.remove('active'));
      button.classList.add('active');
      document.getElementById(button.dataset.target)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

async function bootstrap() {
  loadConfig();
  makeYearOptions();
  bindSidebarNavigation();
  initClient();

  els.saveConfigBtn.addEventListener('click', () => {
    initClient();
    updateTelegramLinkButton();
    notify('Configuração salva no navegador.');
  });

  els.signInBtn.addEventListener('click', async () => {
    try {
      if (!state.client) {
        initClient();
      }

      await signIn();
      updateAuthStatus(`Logado como ${state.user.email}`);
      updateAuthUI();
      await fetchTelegramLink();
      await fetchAllData();
    } catch (error) {
      console.error(error);
      setAuthMessage(error, 'Nao consegui entrar no dashboard agora.');
    }
  });

  els.signUpBtn.addEventListener('click', async () => {
    try {
      if (!state.client) {
        initClient();
      }

      await signUp();
      notify('Conta criada. Confira seu email e faça login.');
    } catch (error) {
      console.error(error);
      setAuthMessage(error, 'Nao consegui criar sua conta agora.');
    }
  });

  els.logoutBtn.addEventListener('click', async () => {
    if (!state.client) {
      return;
    }

    await state.client.auth.signOut();
    state.user = null;
    state.session = null;
    updateAuthStatus('Sessão encerrada');
    updateAuthUI();
    resetDashboardData();
  });

  els.generateLinkBtn.addEventListener('click', async () => {
    if (!state.user) {
      notify('Entre com sua conta antes de gerar um código.');
      return;
    }

    try {
      await generateTelegramCode();
    } catch (error) {
      console.error(error);
      notify(error.message);
    }
  });

  els.telegramBotUsername.addEventListener('input', () => {
    updateTelegramLinkButton();
  });

  els.yearSelect.addEventListener('change', () => {
    state.selectedYear = Number(els.yearSelect.value);
    renderFinanceSection();
    renderYearlySection();
  });

  if (state.client) {
    state.client.auth.onAuthStateChange(async (_event, session) => {
      state.session = session || null;
      state.user = session ? session.user : null;

      if (!state.user) {
        updateAuthStatus('Sessão encerrada');
        updateAuthUI();
        resetDashboardData();
        return;
      }

      updateAuthStatus(`Logado como ${state.user.email}`);
      updateAuthUI();
      await fetchTelegramLink();
      await fetchAllData();
    });

    const { data } = await state.client.auth.getSession();

    if (data.session) {
      state.session = data.session;
      state.user = data.session.user;
      updateAuthStatus(`Logado como ${state.user.email}`);
      updateAuthUI();
      await fetchTelegramLink();
      await fetchAllData();
    }
  }

  updateAuthUI();
  updateTelegramLinkButton();
}

bootstrap();
