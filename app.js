(() => {
  'use strict';

  const STORAGE_KEY = 'catatan-keuangan.v1';
  const BUDGET_KEY = 'catatan-keuangan.budgets.v1';
  const CUSTOM_CAT_KEY = 'catatan-keuangan.cats.v1';
  const GOALS_KEY = 'catatan-keuangan.goals.v1';
  const CYCLE_KEY = 'catatan-keuangan.cycle.v1';
  const LICENSE_KEY = 'catatan-keuangan.license.v1';

  const CUSTOM_COLORS = ['#EA580C', '#2563EB', '#DB2777', '#7C3AED', '#059669', '#D97706', '#0891B2', '#E11D48'];

  // id kategori dipertahankan supaya data lama tetap terbaca
  const BASE_EXPENSE_CATS = [
    { id: 'makan', name: 'Makan', icon: 'c-food', color: '#EA580C' },
    { id: 'transport', name: 'Transport', icon: 'c-car', color: '#2563EB' },
    { id: 'belanja', name: 'Belanja', icon: 'c-bag', color: '#DB2777' },
    { id: 'tagihan', name: 'Tagihan', icon: 'c-receipt', color: '#7C3AED' },
    { id: 'hiburan', name: 'Hiburan', icon: 'c-film', color: '#D97706' },
    { id: 'kesehatan', name: 'Kesehatan', icon: 'c-health', color: '#E11D48' },
    { id: 'pendidikan', name: 'Pendidikan', icon: 'c-book', color: '#0891B2' },
    { id: 'lainnya', name: 'Lainnya', icon: 'c-grid', color: '#64748B' },
  ];

  const INCOME_CATS = [
    { id: 'gaji', name: 'Gaji', icon: 'c-briefcase', color: '#059669' },
    { id: 'bonus', name: 'Bonus', icon: 'c-gift', color: '#0D9488' },
    { id: 'usaha', name: 'Usaha', icon: 'c-store', color: '#0284C7' },
    { id: 'investasi', name: 'Investasi', icon: 'c-trend', color: '#4F46E5' },
    { id: 'lainnya', name: 'Lainnya', icon: 'c-wallet', color: '#64748B' },
  ];

  const $ = (s) => document.querySelector(s);
  const numFmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
  const fmt = (n) => 'Rp' + numFmt.format(Math.round(Math.abs(n)));

  let txs = load();
  let budgets = loadBudgets();
  let customCats = loadCustomCats();
  let goals = loadGoals();
  let cycleDay = loadCycleDay();
  let cursor = getCursorForDate(new Date(), cycleDay);

  const form = { type: 'expense', category: null, editId: null };
  const budgetFormState = { category: 'makan', newColor: CUSTOM_COLORS[0] };
  const goalFormState = { editId: null, action: 'deposit', color: CUSTOM_COLORS[4] };
  let tempCycleDay = cycleDay;
  const txFilter = { query: '', chip: 'all' };

  const shownValues = { balance: 0, in: 0, out: 0 };
  let activeCat = null;
  let lastEntries = [];
  let lastTotalOut = 0;

  function getCategories(type) {
    if (type === 'income') return INCOME_CATS;
    return [...BASE_EXPENSE_CATS, ...customCats];
  }

  // ---------- Storage ----------
  function load() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }
  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(txs));
  }
  function loadBudgets() {
    try {
      const data = JSON.parse(localStorage.getItem(BUDGET_KEY));
      return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    } catch {
      return {};
    }
  }
  function saveBudgets() {
    localStorage.setItem(BUDGET_KEY, JSON.stringify(budgets));
  }
  function loadCustomCats() {
    try {
      const data = JSON.parse(localStorage.getItem(CUSTOM_CAT_KEY));
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }
  function saveCustomCats() {
    localStorage.setItem(CUSTOM_CAT_KEY, JSON.stringify(customCats));
  }
  function loadGoals() {
    try {
      const data = JSON.parse(localStorage.getItem(GOALS_KEY));
      return Array.isArray(data) ? data : [];
    } catch {
      return [];
    }
  }
  function saveGoals() {
    localStorage.setItem(GOALS_KEY, JSON.stringify(goals));
  }
  function loadCycleDay() {
    const n = Number(localStorage.getItem(CYCLE_KEY));
    return Number.isInteger(n) && n >= 1 && n <= 31 ? n : 1;
  }
  function saveCycleDay() {
    localStorage.setItem(CYCLE_KEY, String(cycleDay));
  }

  // ---------- Helpers ----------
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function daysInMonth(y, m) {
    return new Date(y, m + 1, 0).getDate();
  }
  function ymd(d) {
    const z = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  }
  // Tentukan cursor bulan siklus yang menaungi suatu tanggal (mis. jika gajian tgl 20, maka tgl 10 Okt masuk siklus Sep)
  function getCursorForDate(d, day = cycleDay) {
    const y = d.getFullYear();
    const m = d.getMonth();
    if (day <= 1) return new Date(y, m, 1);
    const startDayThisMonth = Math.min(day, daysInMonth(y, m));
    if (d.getDate() < startDayThisMonth) {
      return new Date(y, m - 1, 1);
    }
    return new Date(y, m, 1);
  }
  function getCursorForDateString(dateStr, day = cycleDay) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return getCursorForDate(new Date(y, m - 1, d), day);
  }
  // Hitung rentang tanggal awal s/d akhir periode berdasarkan cursor & tanggal gajian
  function getPeriodRange(cursorDate, day = cycleDay) {
    const y = cursorDate.getFullYear();
    const m = cursorDate.getMonth();
    let start;
    let end;
    if (day <= 1) {
      start = new Date(y, m, 1);
      end = new Date(y, m + 1, 0);
    } else {
      const sDay = Math.min(day, daysInMonth(y, m));
      start = new Date(y, m, sDay);
      const nextY = m === 11 ? y + 1 : y;
      const nextM = (m + 1) % 12;
      const nextSDay = Math.min(day, daysInMonth(nextY, nextM));
      const nextStart = new Date(nextY, nextM, nextSDay);
      end = new Date(nextStart.getFullYear(), nextStart.getMonth(), nextStart.getDate() - 1);
    }

    const startYmd = ymd(start);
    const endYmd = ymd(end);
    const totalDays = Math.max(1, Math.round((end - start) / 86400000) + 1);

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let daysLeft = 0;
    let isPast = false;
    let isCurrent = false;

    if (today >= start && today <= end) {
      isCurrent = true;
      daysLeft = Math.max(1, Math.round((end - today) / 86400000) + 1);
    } else if (today < start) {
      daysLeft = totalDays;
    } else {
      isPast = true;
      daysLeft = 0;
    }

    const fmtShort = (dt) => dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    const rangeLabel = `${fmtShort(start)} – ${fmtShort(end)}`;

    return { start, end, startYmd, endYmd, totalDays, daysLeft, isPast, isCurrent, rangeLabel };
  }

  function getPeriodTransactions(cursorDate = cursor) {
    const { startYmd, endYmd } = getPeriodRange(cursorDate);
    return txs
      .filter((t) => t.date >= startYmd && t.date <= endYmd)
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  }

  function catInfo(type, id) {
    const list = getCategories(type);
    return list.find((c) => c.id === id) || list.find((c) => c.id === 'lainnya') || list[0];
  }
  function tint(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }
  function tile(c) {
    return `<span class="tile" style="--c:${c.color};--t:${tint(c.color, 0.13)}">${icon(c.icon)}</span>`;
  }
  function icon(id) {
    return `<svg class="i" aria-hidden="true"><use href="#${id}"/></svg>`;
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function dayLabel(dateStr) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (dateStr === ymd(new Date())) return 'Hari ini';
    if (dateStr === ymd(yesterday)) return 'Kemarin';
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short' });
  }
  function toast(msg) {
    document.querySelectorAll('.toast').forEach((t) => t.remove());
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2300);
  }

  // Hitung pengeluaran periode tertentu untuk suatu kategori
  function getCategorySpentInPeriod(catId, cursorDate, excludeTxId = null) {
    const { startYmd, endYmd } = getPeriodRange(cursorDate);
    let sum = 0;
    for (const t of txs) {
      if (t.type === 'expense' && t.category === catId && t.date >= startYmd && t.date <= endYmd && t.id !== excludeTxId) {
        sum += t.amount;
      }
    }
    return sum;
  }

  // Animasi angka halus (easeOutQuart)
  function animateValue(el, key, target, signed = false) {
    const start = shownValues[key] ?? target;
    shownValues[key] = target;
    const format = (v) => (signed && v < 0 ? '−' : '') + fmt(v);
    if (start === target || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.textContent = format(target);
      return;
    }
    const dur = 380;
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const ease = 1 - Math.pow(1 - p, 4);
      const cur = start + (target - start) * ease;
      el.textContent = format(cur);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function renderDonut(entries, totalOut) {
    lastEntries = entries;
    lastTotalOut = totalOut;
    const svg = $('#donutSvg');
    const r = 72;
    const circ = 2 * Math.PI * r;

    if (!entries.length || !totalOut) {
      svg.innerHTML = `<circle class="donut-track" cx="90" cy="90" r="${r}"/>`;
      svg.classList.remove('has-active');
      updateDonutCenter();
      return;
    }

    const gap = entries.length > 1 ? 3.5 : 0;
    let acc = 0;

    const segs = entries.map(([id, v], idx) => {
      const c = catInfo('expense', id);
      const frac = v / totalOut;
      const rawLen = frac * circ;
      const len = Math.max(2, rawLen - gap);
      const offset = -acc;
      acc += rawLen;
      const isAct = activeCat === id;
      return `<circle class="donut-seg${isAct ? ' active' : ''}" data-cat="${id}"
        cx="90" cy="90" r="${r}"
        stroke="${c.color}"
        stroke-dasharray="${len.toFixed(2)} ${(circ - len).toFixed(2)}"
        style="--circ:${circ.toFixed(2)};--offset:${offset.toFixed(2)};stroke-dashoffset:${offset.toFixed(2)};animation-delay:${(idx * 0.04).toFixed(2)}s"/>`;
    });

    svg.innerHTML = `<circle class="donut-track" cx="90" cy="90" r="${r}"/>` + segs.join('');
    svg.classList.toggle('has-active', Boolean(activeCat));
    updateDonutCenter();
  }

  function updateDonutCenter() {
    const labelEl = $('#donutLabel');
    const valEl = $('#donutValue');
    const pctEl = $('#donutPct');
    const found = activeCat && lastEntries.find(([id]) => id === activeCat);
    if (found && lastTotalOut > 0) {
      const [id, v] = found;
      const c = catInfo('expense', id);
      const pct = (v / lastTotalOut) * 100;
      labelEl.textContent = c.name;
      valEl.textContent = fmt(v);
      pctEl.textContent = `${pct < 1 ? '<1' : Math.round(pct)}%`;
      pctEl.style.color = c.color;
    } else {
      labelEl.textContent = 'Total keluar';
      valEl.textContent = fmt(lastTotalOut);
      pctEl.textContent = lastEntries.length ? `${lastEntries.length} kategori` : 'Belum ada data';
      pctEl.style.color = '';
    }
  }

  function toggleActiveCat(id) {
    activeCat = activeCat === id ? null : id;
    const svg = $('#donutSvg');
    svg.classList.toggle('has-active', Boolean(activeCat));
    svg.querySelectorAll('.donut-seg').forEach((el) => {
      el.classList.toggle('active', el.dataset.cat === activeCat);
    });
    const leg = $('#legend');
    leg.classList.toggle('has-active', Boolean(activeCat));
    leg.querySelectorAll('li').forEach((el) => {
      el.classList.toggle('active', el.dataset.cat === activeCat);
    });
    updateDonutCenter();
  }

  // ---------- Render Jatah Bulanan + Batas Aman Harian ----------
  function renderBudgets(byCat, period) {
    const budgetEntries = Object.entries(budgets).filter(([, limit]) => Number(limit) > 0);
    const listEl = $('#budgetList');
    const hintEl = $('#budgetHint');

    if (!budgetEntries.length) {
      hintEl.textContent = 'Pilih kategori & atur batas saldo bulanan';
      listEl.innerHTML = `<div class="budget-empty">
        Belum ada jatah bulanan yang diatur.<br>Tap <b>+ Atur jatah</b> untuk menentukan jatah saldo per kategori (mis. Makan Rp600.000).
      </div>`;
      return;
    }

    const { totalDays, daysLeft, isPast } = period;
    let totalLimit = 0;
    let totalSpentInBudgeted = 0;
    for (const [id, limit] of budgetEntries) {
      totalLimit += limit;
      totalSpentInBudgeted += byCat[id] || 0;
    }
    const totalRem = totalLimit - totalSpentInBudgeted;
    hintEl.textContent = totalRem >= 0
      ? `Sisa ${fmt(totalRem)} dari total jatah ${fmt(totalLimit)}`
      : `Lewat ${fmt(Math.abs(totalRem))} dari total jatah ${fmt(totalLimit)}`;

    listEl.innerHTML = budgetEntries
      .map(([id, limit]) => {
        const c = catInfo('expense', id);
        const spent = byCat[id] || 0;
        const rem = limit - spent;
        const remPct = Math.max(0, Math.min(100, (rem / limit) * 100));
        const isOver = rem < 0;
        const isWarn = !isOver && remPct <= 20;
        const barColor = isOver ? 'var(--neg)' : isWarn ? '#D97706' : c.color;
        const statusCls = isOver ? ' over' : isWarn ? ' warn' : '';
        const remText = isOver ? `Lewat −${fmt(Math.abs(rem))}` : `Sisa ${fmt(rem)}`;

        let dailyHtml = '';
        if (isPast) {
          const avg = Math.round(spent / totalDays);
          dailyHtml = `<div class="safe-daily num">Rata-rata terpakai <b>${fmt(avg)} / hari</b></div>`;
        } else if (rem > 0) {
          const safeDaily = Math.floor(rem / daysLeft);
          dailyHtml = `<div class="safe-daily num">Aman dipakai <b>${fmt(safeDaily)} / hari</b> · ${daysLeft} hari tersisa</div>`;
        } else {
          dailyHtml = `<div class="safe-daily over">Jatah periode ini sudah habis</div>`;
        }

        return `<button type="button" class="budget-item" data-cat="${id}">
          <div class="budget-top">
            ${tile(c)}
            <div class="budget-head">
              <span class="budget-name">${esc(c.name)}</span>
              <span class="budget-rem num${statusCls}">${remText}</span>
            </div>
          </div>
          <div class="budget-bar">
            <i class="budget-fill" style="width:${isOver ? 100 : remPct.toFixed(1)}%;background:${barColor}"></i>
          </div>
          <div class="budget-meta num">
            <span>Terpakai ${fmt(spent)}</span>
            <span>Jatah ${fmt(limit)}</span>
          </div>
          ${dailyHtml}
        </button>`;
      })
      .join('');
  }

  // ---------- Render Target Tabungan (Goals / Sinking Fund) ----------
  function renderGoals() {
    const listEl = $('#goalsList');
    const hintEl = $('#goalsHint');

    if (!goals.length) {
      hintEl.textContent = 'Sisihkan dana untuk impianmu';
      listEl.innerHTML = `<div class="budget-empty">
        Belum ada target tabungan.<br>Tap <b>+ Target baru</b> untuk mulai menabung (mis. Dana Darurat, Beli Gadget, Liburan).
      </div>`;
      return;
    }

    let totalTarget = 0;
    let totalSaved = 0;
    for (const g of goals) {
      totalTarget += g.targetAmount;
      totalSaved += g.savedAmount;
    }
    const overallPct = totalTarget > 0 ? Math.min(100, Math.round((totalSaved / totalTarget) * 100)) : 0;
    hintEl.textContent = `Terkumpul ${fmt(totalSaved)} dari ${fmt(totalTarget)} (${overallPct}%)`;

    listEl.innerHTML = goals
      .map((g) => {
        const pct = g.targetAmount > 0 ? Math.min(100, (g.savedAmount / g.targetAmount) * 100) : 0;
        const needed = Math.max(0, g.targetAmount - g.savedAmount);
        const done = needed === 0 && g.targetAmount > 0;
        const c = { icon: done ? 'i-check' : 'i-target', color: g.color || CUSTOM_COLORS[4] };

        return `<button type="button" class="budget-item goal-item" data-goal="${g.id}">
          <div class="budget-top">
            ${tile(c)}
            <div class="budget-head">
              <span class="budget-name">${esc(g.name)}</span>
              <span class="budget-rem num" style="color:${done ? 'var(--pos)' : c.color}">${Math.round(pct)}%</span>
            </div>
          </div>
          <div class="budget-bar">
            <i class="budget-fill" style="width:${pct.toFixed(1)}%;background:${done ? 'var(--pos)' : c.color}"></i>
          </div>
          <div class="budget-meta num">
            <span>Terkumpul ${fmt(g.savedAmount)}</span>
            <span>${done ? 'Target tercapai!' : `Kurang ${fmt(needed)} dari ${fmt(g.targetAmount)}`}</span>
          </div>
        </button>`;
      })
      .join('');
  }

  // ---------- Render Filter Chips Transaksi ----------
  function renderFilterChips(monthList) {
    const usedCats = [];
    const seen = new Set();
    for (const t of monthList) {
      if (!seen.has(t.category)) {
        seen.add(t.category);
        usedCats.push({ id: t.category, type: t.type });
      }
    }

    if (txFilter.chip !== 'all' && txFilter.chip !== 'expense' && txFilter.chip !== 'income' && !seen.has(txFilter.chip)) {
      txFilter.chip = 'all';
    }

    const chips = [
      { id: 'all', label: 'Semua' },
      { id: 'expense', label: 'Pengeluaran' },
      { id: 'income', label: 'Pemasukan' },
      ...usedCats.map((u) => {
        const c = catInfo(u.type, u.id);
        return { id: u.id, label: c.name, color: c.color };
      }),
    ];

    $('#txFilterChips').innerHTML = chips
      .map((ch) => `<button type="button" class="filter-chip${txFilter.chip === ch.id ? ' active' : ''}" data-chip="${ch.id}">
        ${ch.color ? `<span class="dot" style="background:${ch.color}"></span>` : ''}${esc(ch.label)}
      </button>`)
      .join('');
  }

  // ---------- Render ----------
  function render(fade) {
    const period = getPeriodRange(cursor);
    $('#monthLabel').textContent = cursor.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    $('#chartMonth').textContent = cursor.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' });
    $('#cycleBadge').textContent = `${period.rangeLabel} · ${period.daysLeft ? `${period.daysLeft} hr tersisa` : 'Selesai'}`;
    $('#cycleMenuSub').textContent = cycleDay === 1
      ? 'Mulai setiap tanggal 1 (awal bulan)'
      : `Mulai setiap tanggal ${cycleDay} (${period.rangeLabel})`;

    if (fade) {
      for (const sel of ['#monthLabel', '#chartMonth', '#cycleBadge', '#donutBody', '#legend', '#budgetList', '#txList']) {
        const el = $(sel);
        if (!el) continue;
        el.classList.remove('month-fade');
        void el.offsetWidth;
        el.classList.add('month-fade');
      }
    }

    const list = getPeriodTransactions(cursor);

    let totalIn = 0;
    let totalOut = 0;
    const byCat = {};
    for (const t of list) {
      if (t.type === 'income') totalIn += t.amount;
      else {
        totalOut += t.amount;
        byCat[t.category] = (byCat[t.category] || 0) + t.amount;
      }
    }

    const bal = totalIn - totalOut;
    const balEl = $('#balance');
    balEl.classList.toggle('neg', bal < 0);
    animateValue(balEl, 'balance', bal, true);
    animateValue($('#totalIn'), 'in', totalIn, false);
    animateValue($('#totalOut'), 'out', totalOut, false);

    // Komposisi pengeluaran per kategori (Donut chart per periode)
    const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    if (activeCat && !byCat[activeCat]) activeCat = null;
    $('#chartHint').textContent = entries.length ? `Periode ${period.rangeLabel}` : `Belum ada pengeluaran (${period.rangeLabel})`;
    renderDonut(entries, totalOut);

    $('#legend').innerHTML = entries
      .map(([id, v]) => {
        const c = catInfo('expense', id);
        const pct = (v / totalOut) * 100;
        const isAct = activeCat === id;
        return `<li data-cat="${id}" class="${isAct ? 'active' : ''}">
          <span class="dot" style="background:${c.color}"></span>
          <span class="lg-name">${esc(c.name)}</span>
          <span class="lg-pct num">${pct < 1 ? '<1' : Math.round(pct)}%</span>
          <span class="lg-amt num">${fmt(v)}</span>
        </li>`;
      })
      .join('');
    $('#legend').classList.toggle('has-active', Boolean(activeCat));

    // Render Jatah Bulanan (+ Batas Aman Harian sesuai siklus) & Target Tabungan
    renderBudgets(byCat, period);
    renderGoals();

    // Toolbar pencarian & filter transaksi
    $('#txToolbar').hidden = list.length === 0;
    if (!list.length) {
      $('#txCount').textContent = '';
      $('#txList').innerHTML = `<div class="empty">
        <div class="empty-icon">${icon('i-doc')}</div>
        <h3>Belum ada transaksi</h3>
        <p>Transaksi pada periode ${period.rangeLabel} akan tampil di sini.</p>
      </div>`;
      return;
    }

    renderFilterChips(list);
    renderFilteredTxList(list);
  }

  function renderFilteredTxList(monthList) {
    const q = txFilter.query.trim().toLowerCase();
    const chip = txFilter.chip;

    const filtered = monthList.filter((t) => {
      if (chip === 'expense' && t.type !== 'expense') return false;
      if (chip === 'income' && t.type !== 'income') return false;
      if (chip !== 'all' && chip !== 'expense' && chip !== 'income' && t.category !== chip) return false;
      if (q) {
        const c = catInfo(t.type, t.category);
        const hay = `${c.name} ${t.note || ''} ${t.amount}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const isFiltering = Boolean(q) || chip !== 'all';
    if (isFiltering) {
      const net = filtered.reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0);
      const sign = net > 0 ? '+' : net < 0 ? '−' : '';
      $('#txCount').textContent = `${filtered.length} hasil · ${sign}${fmt(net)}`;
    } else {
      $('#txCount').textContent = `${monthList.length} transaksi`;
    }

    if (!filtered.length) {
      $('#txList').innerHTML = `<div class="empty">
        <div class="empty-icon">${icon('i-search')}</div>
        <h3>Tidak ditemukan</h3>
        <p>Tidak ada transaksi yang cocok dengan pencarian atau filter ini.</p>
      </div>`;
      return;
    }

    const groups = new Map();
    for (const t of filtered) {
      if (!groups.has(t.date)) groups.set(t.date, []);
      groups.get(t.date).push(t);
    }

    let html = '';
    for (const [date, items] of groups) {
      const net = items.reduce((s, t) => s + (t.type === 'income' ? t.amount : -t.amount), 0);
      html += `<section class="day">
        <div class="day-head"><span>${dayLabel(date)}</span>
          <span class="num${net > 0 ? ' pos' : ''}">${net > 0 ? '+' : net < 0 ? '−' : ''}${fmt(net)}</span></div>
        <div class="list">`;
      for (const t of items) {
        const c = catInfo(t.type, t.category);
        html += `<button class="row" data-id="${t.id}">
          ${tile(c)}
          <span class="row-main"><span class="row-title">${esc(c.name)}</span>${t.note ? `<span class="row-sub">${esc(t.note)}</span>` : ''}</span>
          <span class="row-amt num ${t.type}">${t.type === 'income' ? '+' : '−'}${fmt(t.amount)}</span>
        </button>`;
      }
      html += '</div></section>';
    }
    $('#txList').innerHTML = html;
  }

  // ---------- Sheet / dialog ----------
  function show(sel) {
    const el = $(sel);
    const sheet = el.querySelector('.sheet');
    if (sheet) sheet.style.transform = '';
    el.hidden = false;
    document.body.classList.add('locked');
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('open')));
  }
  function hide(sel) {
    const el = $(sel);
    const sheet = el.querySelector('.sheet');
    if (sheet) sheet.style.transform = '';
    el.classList.remove('open');
    setTimeout(() => {
      el.hidden = true;
      if (!document.querySelector('.sheet-backdrop.open, .dialog-backdrop.open')) document.body.classList.remove('locked');
    }, 340);
  }

  function confirmDialog({ title, message, ok = 'Lanjutkan', danger = false }) {
    return new Promise((resolve) => {
      const okBtn = $('#dialogOk');
      const cancelBtn = $('#dialogCancel');
      $('#dialogTitle').textContent = title;
      $('#dialogMsg').textContent = message;
      okBtn.textContent = ok;
      okBtn.className = 'btn ' + (danger ? 'danger' : 'primary');
      const done = (value) => {
        okBtn.onclick = cancelBtn.onclick = null;
        hide('#dialog');
        resolve(value);
      };
      okBtn.onclick = () => done(true);
      cancelBtn.onclick = () => done(false);
      show('#dialog');
    });
  }

  // ---------- Form Tanggal Gajian / Siklus Bulanan ----------
  function renderCycleDays() {
    let html = '';
    for (let d = 1; d <= 31; d++) {
      html += `<button type="button" class="day-btn num${d === tempCycleDay ? ' active' : ''}" data-day="${d}">${d}</button>`;
    }
    $('#cycleDayGrid').innerHTML = html;
    const sampleCursor = getCursorForDate(new Date(), tempCycleDay);
    const p = getPeriodRange(sampleCursor, tempCycleDay);
    $('#cyclePreview').innerHTML = `<span>Siklus aktif saat ini</span><span class="num ok">${p.rangeLabel} (${p.daysLeft} hari tersisa)</span>`;
  }

  function openCycleSheet() {
    tempCycleDay = cycleDay;
    renderCycleDays();
    hide('#menu');
    show('#cycleSheet');
  }

  // ---------- Form Transaksi ----------
  function setType(type, category, animateCats = true) {
    const typeChanged = form.type !== type;
    form.type = type;
    const cats = getCategories(type);
    form.category = category || cats[0].id;
    const seg = $('#txForm .seg');
    seg.dataset.type = type;
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.type === type));
    renderCats(typeChanged && animateCats);
    updateTxBudgetInfo();
  }

  function renderCats(reanimate = false) {
    const grid = $('#catGrid');
    const cats = getCategories(form.type);
    if (!reanimate && grid.children.length === cats.length) {
      grid.querySelectorAll('.cat').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.cat === form.category);
      });
      return;
    }
    grid.innerHTML = cats
      .map((c) => {
        const hasBudget = form.type === 'expense' && budgets[c.id] > 0;
        return `<button type="button" class="cat${c.id === form.category ? ' active' : ''}" data-cat="${c.id}">
          ${hasBudget ? '<span class="cat-dot" title="Punya jatah bulanan"></span>' : ''}
          ${tile(c)}<span>${esc(c.name)}</span></button>`;
      })
      .join('');
  }

  // Info sisa jatah otomatis saat mengetik pengeluaran
  function updateTxBudgetInfo() {
    const infoEl = $('#txBudgetInfo');
    if (form.type !== 'expense' || !budgets[form.category]) {
      infoEl.hidden = true;
      return;
    }
    const limit = budgets[form.category];
    const c = catInfo('expense', form.category);
    const dateVal = $('#date').value || defaultDate();
    const targetCursor = getCursorForDateString(dateVal);
    const spentBefore = getCategorySpentInPeriod(form.category, targetCursor, form.editId);
    const remBefore = limit - spentBefore;
    const typed = Number($('#amount').value.replace(/\D/g, '')) || 0;
    const remAfter = remBefore - typed;

    infoEl.hidden = false;
    if (typed > 0) {
      const cls = remAfter < 0 ? 'over' : 'ok';
      const afterLabel = remAfter < 0 ? `Lewat −${fmt(Math.abs(remAfter))}` : fmt(remAfter);
      infoEl.innerHTML = `<span>Sisa jatah <b>${esc(c.name)}</b></span><span class="num">${fmt(remBefore)} → <span class="${cls}">${afterLabel}</span></span>`;
    } else {
      const cls = remBefore < 0 ? 'over' : 'ok';
      const beforeLabel = remBefore < 0 ? `Lewat −${fmt(Math.abs(remBefore))}` : fmt(remBefore);
      infoEl.innerHTML = `<span>Sisa jatah <b>${esc(c.name)}</b></span><span class="num ${cls}">${beforeLabel}</span>`;
    }
  }

  function defaultDate() {
    const today = new Date();
    const p = getPeriodRange(cursor);
    return p.isCurrent ? ymd(today) : p.startYmd;
  }

  function openForm(tx) {
    form.editId = tx ? tx.id : null;
    $('#catGrid').innerHTML = '';
    $('#amount').value = tx ? numFmt.format(tx.amount) : '';
    $('#note').value = tx ? tx.note || '' : '';
    $('#date').value = tx ? tx.date : defaultDate();
    setType(tx ? tx.type : 'expense', tx ? tx.category : null, true);
    $('#sheetTitle').textContent = tx ? 'Edit transaksi' : 'Tambah transaksi';
    $('#deleteBtn').hidden = !tx;
    show('#sheet');
    if (!tx) setTimeout(() => $('#amount').focus(), 220);
  }

  // ---------- Form Jatah Bulanan (Budget per Kategori) ----------
  function renderBudgetCats() {
    const cats = getCategories('expense');
    const grid = $('#budgetCatGrid');
    grid.innerHTML = cats
      .map((c) => {
        const hasBudget = budgets[c.id] > 0;
        const active = budgetFormState.category === c.id;
        return `<button type="button" class="cat${active ? ' active' : ''}" data-cat="${c.id}">
          ${hasBudget ? '<span class="cat-dot"></span>' : ''}
          ${tile(c)}<span>${esc(c.name)}</span></button>`;
      })
      .join('') +
      `<button type="button" class="cat add-cat${budgetFormState.category === '__new__' ? ' active' : ''}" data-cat="__new__">
        <span class="tile">${icon('i-plus')}</span><span>+ Kategori</span>
      </button>`;
  }

  function renderNewCatColors() {
    $('#newCatColors').innerHTML = CUSTOM_COLORS
      .map((col) => `<button type="button" class="color-dot${col === budgetFormState.newColor ? ' active' : ''}" data-color="${col}" style="background:${col}" aria-label="Pilih warna"></button>`)
      .join('');
  }

  function selectBudgetCategory(catId) {
    budgetFormState.category = catId;
    renderBudgetCats();
    const isNew = catId === '__new__';
    $('#newCatBox').hidden = !isNew;
    if (isNew) {
      renderNewCatColors();
      $('#newCatName').focus();
      $('#deleteBudgetBtn').hidden = true;
      updateBudgetPreview();
      return;
    }
    const existing = budgets[catId] || 0;
    $('#budgetAmount').value = existing ? numFmt.format(existing) : '';
    $('#deleteBudgetBtn').hidden = !existing;
    updateBudgetPreview();
  }

  function updateBudgetPreview() {
    const previewEl = $('#budgetPreview');
    if (budgetFormState.category === '__new__') {
      previewEl.innerHTML = `<span>Buat kategori baru lalu tentukan jatah bulanannya</span>`;
      return;
    }
    const c = catInfo('expense', budgetFormState.category);
    const period = getPeriodRange(cursor);
    const spent = getCategorySpentInPeriod(budgetFormState.category, cursor);
    const limit = Number($('#budgetAmount').value.replace(/\D/g, '')) || 0;
    if (!limit) {
      previewEl.innerHTML = `<span>Terpakai <b>${esc(c.name)}</b> periode ini</span><span class="num">${fmt(spent)}</span>`;
      return;
    }
    const rem = limit - spent;
    const cls = rem < 0 ? 'over' : 'ok';
    const remText = rem < 0 ? `Lewat −${fmt(Math.abs(rem))}` : fmt(rem);
    const dailyInfo = !period.isPast && rem > 0 ? ` · Aman ${fmt(Math.floor(rem / period.daysLeft))}/hr` : '';
    previewEl.innerHTML = `<span>Sisa periode ini</span><span class="num"><span class="${cls}">${remText}</span>${dailyInfo}</span>`;
  }

  function openBudgetSheet(catId) {
    const cats = getCategories('expense');
    const initialCat = catId || cats[0].id;
    $('#budgetSheetTitle').textContent = catId && budgets[catId] ? `Edit jatah ${catInfo('expense', catId).name}` : 'Atur jatah bulanan';
    selectBudgetCategory(initialCat);
    show('#budgetSheet');
    if (initialCat !== '__new__') setTimeout(() => $('#budgetAmount').focus(), 220);
  }

  // ---------- Form Target Tabungan (Goals) ----------
  function renderGoalColors() {
    $('#goalColors').innerHTML = CUSTOM_COLORS
      .map((col) => `<button type="button" class="color-dot${col === goalFormState.color ? ' active' : ''}" data-color="${col}" style="background:${col}" aria-label="Pilih warna"></button>`)
      .join('');
  }

  function setGoalAction(action) {
    goalFormState.action = action;
    const seg = $('#goalActionSeg');
    seg.dataset.type = action;
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.action === action));

    const isEdit = action === 'edit';
    $('#goalDeltaWrap').hidden = isEdit;
    $('#goalDetailFields').hidden = !isEdit;
    $('#goalDeltaAmount').value = '';

    if (action === 'deposit') {
      $('#goalDeltaLabel').textContent = 'Nominal yang ditabung';
      $('#goalSubmitBtn').textContent = 'Tambah ke tabungan';
      updateGoalQuickPreview();
    } else if (action === 'withdraw') {
      $('#goalDeltaLabel').textContent = 'Nominal yang ditarik';
      $('#goalSubmitBtn').textContent = 'Tarik dari tabungan';
      updateGoalQuickPreview();
    } else {
      $('#goalSubmitBtn').textContent = 'Simpan perubahan';
    }
  }

  function updateGoalQuickPreview() {
    const g = goals.find((item) => item.id === goalFormState.editId);
    if (!g) return;
    const delta = Number($('#goalDeltaAmount').value.replace(/\D/g, '')) || 0;
    const after = goalFormState.action === 'deposit'
      ? g.savedAmount + delta
      : Math.max(0, g.savedAmount - delta);
    const pct = g.targetAmount > 0 ? Math.min(100, Math.round((after / g.targetAmount) * 100)) : 0;
    const previewEl = $('#goalQuickPreview');
    if (delta > 0) {
      previewEl.innerHTML = `<span>Saldo tabungan</span><span class="num">${fmt(g.savedAmount)} → <span class="ok">${fmt(after)} (${pct}%)</span></span>`;
    } else {
      const needed = Math.max(0, g.targetAmount - g.savedAmount);
      previewEl.innerHTML = `<span>Terkumpul <b>${fmt(g.savedAmount)}</b></span><span class="num">${needed > 0 ? `Kurang ${fmt(needed)}` : 'Target tercapai!'}</span>`;
    }
  }

  function openGoalSheet(goalId) {
    const g = goalId ? goals.find((item) => item.id === goalId) : null;
    goalFormState.editId = g ? g.id : null;
    goalFormState.color = g ? g.color : CUSTOM_COLORS[4];
    renderGoalColors();

    $('#goalName').value = g ? g.name : '';
    $('#goalTargetAmount').value = g ? numFmt.format(g.targetAmount) : '';
    $('#goalSavedAmount').value = g && g.savedAmount ? numFmt.format(g.savedAmount) : '';
    $('#deleteGoalBtn').hidden = !g;

    if (g) {
      $('#goalSheetTitle').textContent = g.name;
      $('#goalQuickBox').hidden = false;
      setGoalAction('deposit');
      show('#goalSheet');
      setTimeout(() => $('#goalDeltaAmount').focus(), 220);
    } else {
      $('#goalSheetTitle').textContent = 'Target tabungan baru';
      $('#goalQuickBox').hidden = true;
      $('#goalDetailFields').hidden = false;
      $('#goalSubmitBtn').textContent = 'Simpan target';
      show('#goalSheet');
      setTimeout(() => $('#goalName').focus(), 220);
    }
  }

  // ---------- Events ----------
  function stepMonth(delta) {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1);
    render(delta < 0 ? 'prev' : 'next');
  }
  $('#chartPrev').addEventListener('click', () => stepMonth(-1));
  $('#chartNext').addEventListener('click', () => stepMonth(1));

  $('#addBtn').addEventListener('click', () => openForm(null));
  $('#openBudgetBtn').addEventListener('click', () => openBudgetSheet(null));
  $('#openGoalBtn').addEventListener('click', () => openGoalSheet(null));

  // Tanggal Gajian / Siklus Bulanan events
  $('#cycleBadge').addEventListener('click', () => openCycleSheet());
  $('#cycleMenuBtn').addEventListener('click', () => openCycleSheet());

  $('#cycleDayGrid').addEventListener('click', (e) => {
    const btn = e.target.closest('.day-btn');
    if (!btn) return;
    tempCycleDay = Number(btn.dataset.day);
    renderCycleDays();
  });

  $('#cycleForm').addEventListener('submit', (e) => {
    e.preventDefault();
    cycleDay = tempCycleDay;
    saveCycleDay();
    cursor = getCursorForDate(new Date(), cycleDay);
    hide('#cycleSheet');
    render(true);
    toast(cycleDay === 1 ? 'Siklus diatur ke tanggal 1' : `Siklus diatur setiap tanggal ${cycleDay}`);
  });

  // Search & Filter Transaksi
  $('#txSearch').addEventListener('input', (e) => {
    txFilter.query = e.target.value;
    $('#clearSearchBtn').hidden = !txFilter.query;
    renderFilteredTxList(getPeriodTransactions(cursor));
  });

  $('#clearSearchBtn').addEventListener('click', () => {
    txFilter.query = '';
    $('#txSearch').value = '';
    $('#clearSearchBtn').hidden = true;
    renderFilteredTxList(getPeriodTransactions(cursor));
  });

  $('#txFilterChips').addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-chip');
    if (!btn) return;
    txFilter.chip = btn.dataset.chip;
    const list = getPeriodTransactions(cursor);
    renderFilterChips(list);
    renderFilteredTxList(list);
  });

  // Jatah Bulanan events
  $('#budgetList').addEventListener('click', (e) => {
    const item = e.target.closest('.budget-item');
    if (item) openBudgetSheet(item.dataset.cat);
  });

  $('#budgetCatGrid').addEventListener('click', (e) => {
    const btn = e.target.closest('.cat');
    if (btn) selectBudgetCategory(btn.dataset.cat);
  });

  $('#newCatColors').addEventListener('click', (e) => {
    const dot = e.target.closest('.color-dot');
    if (!dot) return;
    budgetFormState.newColor = dot.dataset.color;
    renderNewCatColors();
  });

  $('#saveNewCatBtn').addEventListener('click', () => {
    const name = $('#newCatName').value.trim();
    if (!name) {
      toast('Masukkan nama kategori baru');
      $('#newCatName').focus();
      return;
    }
    const id = 'cat-' + uid();
    customCats.push({ id, name, icon: 'c-tag', color: budgetFormState.newColor });
    saveCustomCats();
    $('#newCatName').value = '';
    selectBudgetCategory(id);
    toast(`Kategori "${name}" ditambahkan`);
    $('#budgetAmount').focus();
  });

  $('#budgetAmount').addEventListener('input', (e) => {
    const digits = e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 13);
    e.target.value = digits ? numFmt.format(Number(digits)) : '';
    updateBudgetPreview();
  });

  $('#budgetForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (budgetFormState.category === '__new__') {
      toast('Simpan kategori baru terlebih dahulu');
      $('#newCatName').focus();
      return;
    }
    const amount = Number($('#budgetAmount').value.replace(/\D/g, ''));
    if (!amount) {
      toast('Masukkan nominal jatah bulanan');
      $('#budgetAmount').focus();
      return;
    }
    const c = catInfo('expense', budgetFormState.category);
    budgets[budgetFormState.category] = amount;
    saveBudgets();
    hide('#budgetSheet');
    render();
    toast(`Jatah ${c.name} diatur ${fmt(amount)}`);
  });

  $('#deleteBudgetBtn').addEventListener('click', async () => {
    const catId = budgetFormState.category;
    if (!catId || !budgets[catId]) return;
    const c = catInfo('expense', catId);
    const ok = await confirmDialog({
      title: `Hapus jatah ${c.name}?`,
      message: 'Batas jatah bulanan untuk kategori ini akan dihapus. Riwayat transaksi tidak ikut terhapus.',
      ok: 'Hapus',
      danger: true,
    });
    if (!ok) return;
    delete budgets[catId];
    saveBudgets();
    hide('#budgetSheet');
    render();
    toast(`Jatah ${c.name} dihapus`);
  });

  // Target Tabungan (Goals) events
  $('#goalsList').addEventListener('click', (e) => {
    const item = e.target.closest('.goal-item');
    if (item) openGoalSheet(item.dataset.goal);
  });

  $('#goalActionSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b && b.dataset.action !== goalFormState.action) setGoalAction(b.dataset.action);
  });

  $('#goalColors').addEventListener('click', (e) => {
    const dot = e.target.closest('.color-dot');
    if (!dot) return;
    goalFormState.color = dot.dataset.color;
    renderGoalColors();
  });

  ['#goalDeltaAmount', '#goalTargetAmount', '#goalSavedAmount'].forEach((sel) => {
    $(sel).addEventListener('input', (e) => {
      const digits = e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 13);
      e.target.value = digits ? numFmt.format(Number(digits)) : '';
      if (sel === '#goalDeltaAmount') updateGoalQuickPreview();
    });
  });

  $('#goalForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const editingGoal = goalFormState.editId ? goals.find((g) => g.id === goalFormState.editId) : null;

    if (editingGoal && (goalFormState.action === 'deposit' || goalFormState.action === 'withdraw')) {
      const delta = Number($('#goalDeltaAmount').value.replace(/\D/g, ''));
      if (!delta) {
        toast('Masukkan nominal terlebih dahulu');
        $('#goalDeltaAmount').focus();
        return;
      }
      if (goalFormState.action === 'deposit') {
        editingGoal.savedAmount += delta;
        toast(`+${fmt(delta)} ditambahkan ke ${editingGoal.name}`);
      } else {
        editingGoal.savedAmount = Math.max(0, editingGoal.savedAmount - delta);
        toast(`${fmt(delta)} ditarik dari ${editingGoal.name}`);
      }
      saveGoals();
      hide('#goalSheet');
      render();
      return;
    }

    const name = $('#goalName').value.trim();
    const targetAmount = Number($('#goalTargetAmount').value.replace(/\D/g, ''));
    const savedAmount = Number($('#goalSavedAmount').value.replace(/\D/g, '')) || 0;

    if (!name) {
      toast('Masukkan nama target tabungan');
      $('#goalName').focus();
      return;
    }
    if (!targetAmount) {
      toast('Masukkan target nominal');
      $('#goalTargetAmount').focus();
      return;
    }

    if (editingGoal) {
      Object.assign(editingGoal, { name, targetAmount, savedAmount, color: goalFormState.color });
      toast('Target tabungan diperbarui');
    } else {
      goals.push({
        id: 'goal-' + uid(),
        name,
        targetAmount,
        savedAmount,
        color: goalFormState.color,
        createdAt: Date.now(),
      });
      toast('Target tabungan ditambahkan');
    }
    saveGoals();
    hide('#goalSheet');
    render();
  });

  $('#deleteGoalBtn').addEventListener('click', async () => {
    const g = goals.find((item) => item.id === goalFormState.editId);
    if (!g) return;
    const ok = await confirmDialog({
      title: `Hapus target "${g.name}"?`,
      message: 'Target tabungan ini akan dihapus secara permanen.',
      ok: 'Hapus',
      danger: true,
    });
    if (!ok) return;
    goals = goals.filter((item) => item.id !== g.id);
    saveGoals();
    hide('#goalSheet');
    render();
    toast('Target tabungan dihapus');
  });

  // Transaksi events
  $('#txList').addEventListener('click', (e) => {
    const btn = e.target.closest('.row');
    if (!btn) return;
    const tx = txs.find((t) => t.id === btn.dataset.id);
    if (tx) openForm(tx);
  });

  $('#txForm .seg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b && b.dataset.type !== form.type) setType(b.dataset.type);
  });

  $('#catGrid').addEventListener('click', (e) => {
    const cat = e.target.closest('.cat');
    if (!cat) return;
    form.category = cat.dataset.cat;
    renderCats(false);
    updateTxBudgetInfo();
  });

  // Format angka otomatis: 150000 -> 150.000
  $('#amount').addEventListener('input', (e) => {
    const digits = e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 13);
    e.target.value = digits ? numFmt.format(Number(digits)) : '';
    updateTxBudgetInfo();
  });

  $('#date').addEventListener('change', () => updateTxBudgetInfo());

  $('#txForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const amount = Number($('#amount').value.replace(/\D/g, ''));
    if (!amount) {
      toast('Masukkan jumlah terlebih dahulu');
      $('#amount').focus();
      return;
    }
    const data = {
      type: form.type,
      category: form.category,
      amount,
      note: $('#note').value.trim(),
      date: $('#date').value || ymd(new Date()),
    };
    const editing = Boolean(form.editId);
    if (editing) {
      Object.assign(txs.find((t) => t.id === form.editId), data);
    } else {
      txs.push({ id: uid(), createdAt: Date.now(), ...data });
    }
    save();
    cursor = getCursorForDateString(data.date);
    hide('#sheet');
    render();
    toast(editing ? 'Transaksi diperbarui' : 'Transaksi disimpan');
  });

  $('#deleteBtn').addEventListener('click', async () => {
    if (!form.editId) return;
    const ok = await confirmDialog({
      title: 'Hapus transaksi?',
      message: 'Transaksi ini akan dihapus secara permanen.',
      ok: 'Hapus',
      danger: true,
    });
    if (!ok) return;
    txs = txs.filter((t) => t.id !== form.editId);
    save();
    hide('#sheet');
    render();
    toast('Transaksi dihapus');
  });

  // Tombol tutup & tap di luar sheet
  document.querySelectorAll('[data-close]').forEach((b) =>
    b.addEventListener('click', () => hide('#' + b.dataset.close)));
  document.querySelectorAll('.sheet-backdrop').forEach((bd) =>
    bd.addEventListener('click', (e) => { if (e.target === bd) hide('#' + bd.id); }));

  // Interaksi Donut Chart & Legend
  $('#donutSvg').addEventListener('click', (e) => {
    const seg = e.target.closest('.donut-seg');
    if (seg) toggleActiveCat(seg.dataset.cat);
  });
  $('#donutCenter').addEventListener('click', () => {
    if (activeCat) toggleActiveCat(activeCat);
  });
  $('#legend').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-cat]');
    if (li) toggleActiveCat(li.dataset.cat);
  });

  // ---------- Touch press feedback & Swipe-to-dismiss ----------
  const pressSel = '.icon-btn, .fab, .row, .cat, .btn, .menu-row, .donut-center, .legend li, .pill-btn, .budget-item, .filter-chip, .cycle-badge, .day-btn';
  document.addEventListener('pointerdown', (e) => {
    const el = e.target.closest(pressSel);
    if (el) el.classList.add('pressed');
  }, { passive: true });
  const clearPress = () => document.querySelectorAll('.pressed').forEach((el) => el.classList.remove('pressed'));
  document.addEventListener('pointerup', clearPress, { passive: true });
  document.addEventListener('pointercancel', clearPress, { passive: true });

  // Swipe ke bawah pada bottom sheet untuk menutup
  document.querySelectorAll('.sheet-backdrop').forEach((bd) => {
    const sheet = bd.querySelector('.sheet');
    let startY = 0;
    let deltaY = 0;
    let active = false;

    sheet.addEventListener('touchstart', (e) => {
      if (sheet.scrollTop > 0) return;
      startY = e.touches[0].clientY;
      deltaY = 0;
      active = true;
    }, { passive: true });

    sheet.addEventListener('touchmove', (e) => {
      if (!active) return;
      deltaY = e.touches[0].clientY - startY;
      if (deltaY > 0) {
        sheet.classList.add('dragging');
        sheet.style.transform = `translateY(${deltaY * 0.85}px)`;
      } else {
        sheet.classList.remove('dragging');
        sheet.style.transform = '';
      }
    }, { passive: true });

    const endDrag = () => {
      if (!active) return;
      active = false;
      sheet.classList.remove('dragging');
      if (deltaY > 110) {
        hide('#' + bd.id);
      } else {
        sheet.style.transform = '';
      }
      deltaY = 0;
    };
    sheet.addEventListener('touchend', endDrag, { passive: true });
    sheet.addEventListener('touchcancel', endDrag, { passive: true });
  });

  // ---------- Menu: backup / restore ----------
  $('#menuBtn').addEventListener('click', () => show('#menu'));

  $('#exportBtn').addEventListener('click', async () => {
    if (!txs.length && !Object.keys(budgets).length && !goals.length) return toast('Belum ada data untuk di-backup');
    const json = JSON.stringify({
      app: 'catatan-keuangan',
      version: 4,
      exportedAt: new Date().toISOString(),
      cycleDay,
      transactions: txs,
      budgets,
      customCategories: customCats,
      goals,
    }, null, 2);
    const name = `keuangan-${ymd(new Date())}.json`;
    const file = new File([json], name, { type: 'application/json' });

    // iPhone: gunakan Share Sheet (simpan ke Files, kirim lewat aplikasi lain, dll)
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: name });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  $('#importFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    let incoming;
    let incomingBudgets = {};
    let incomingCats = [];
    let incomingGoals = [];
    let incomingCycle = null;
    try {
      const parsed = JSON.parse(await file.text());
      incoming = (Array.isArray(parsed) ? parsed : parsed.transactions || []).filter(
        (t) => t && t.id && ['income', 'expense'].includes(t.type) && Number(t.amount) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(t.date));
      if (parsed && parsed.budgets && typeof parsed.budgets === 'object') incomingBudgets = parsed.budgets;
      if (parsed && Array.isArray(parsed.customCategories)) incomingCats = parsed.customCategories;
      if (parsed && Array.isArray(parsed.goals)) incomingGoals = parsed.goals;
      if (parsed && Number.isInteger(parsed.cycleDay) && parsed.cycleDay >= 1 && parsed.cycleDay <= 31) incomingCycle = parsed.cycleDay;
    } catch {
      incoming = [];
    }
    if (!incoming.length && !Object.keys(incomingBudgets).length && !incomingGoals.length) return toast('File backup tidak valid');

    const ok = await confirmDialog({
      title: 'Pulihkan data?',
      message: `${incoming.length} transaksi akan ditambahkan. Data yang sudah ada tetap tersimpan.`,
      ok: 'Pulihkan',
    });
    if (!ok) return;
    const map = new Map(txs.map((t) => [t.id, t]));
    for (const t of incoming) map.set(t.id, { ...t, amount: Number(t.amount) });
    txs = [...map.values()];
    budgets = { ...budgets, ...incomingBudgets };
    const catMap = new Map(customCats.map((c) => [c.id, c]));
    for (const c of incomingCats) if (c && c.id && c.name) catMap.set(c.id, c);
    customCats = [...catMap.values()];
    const goalMap = new Map(goals.map((g) => [g.id, g]));
    for (const g of incomingGoals) if (g && g.id && g.name) goalMap.set(g.id, g);
    goals = [...goalMap.values()];
    if (incomingCycle) {
      cycleDay = incomingCycle;
      saveCycleDay();
      cursor = getCursorForDate(new Date(), cycleDay);
    }
    save();
    saveBudgets();
    saveCustomCats();
    saveGoals();
    hide('#menu');
    render();
    toast('Data berhasil dipulihkan');
  });

  $('#clearBtn').addEventListener('click', async () => {
    if (!txs.length && !Object.keys(budgets).length && !goals.length) return toast('Belum ada data');
    const ok = await confirmDialog({
      title: 'Hapus semua data?',
      message: 'Seluruh transaksi, jatah bulanan, dan target tabungan akan dihapus permanen. Disarankan membuat backup terlebih dahulu.',
      ok: 'Hapus semua',
      danger: true,
    });
    if (!ok) return;
    txs = [];
    budgets = {};
    customCats = [];
    goals = [];
    save();
    saveBudgets();
    saveCustomCats();
    saveGoals();
    hide('#menu');
    render();
    toast('Semua data dihapus');
  });

  // ---------- Lisensi & Admin Key Generator (Hangus 6 Jam / 360 Menit) ----------
  const ADMIN_PIN = '202688';
  const B32 = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const LICENSE_EPOCH_MS = 1735689600000; // 2025-01-01T00:00:00Z
  const EXPIRY_MINUTES = 360; // 6 jam

  function hash32(str, seed = 0x811c9dc5) {
    let h = seed >>> 0;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35) >>> 0;
    h ^= h >>> 16;
    return h >>> 0;
  }

  function toB32_4(num20) {
    let s = '';
    for (let i = 3; i >= 0; i--) {
      s += B32[(num20 >>> (i * 5)) & 31];
    }
    return s;
  }

  function fromB32_4(str4) {
    if (!str4 || str4.length !== 4) return -1;
    let val = 0;
    for (let i = 0; i < 4; i++) {
      const idx = B32.indexOf(str4[i]);
      if (idx < 0) return -1;
      val = (val << 5) | idx;
    }
    return val;
  }

  function generateLicenseCode(rawEmail, nowMs = Date.now()) {
    const email = String(rawEmail || '').trim().toLowerCase();
    const slot20 = Math.floor((nowMs - LICENSE_EPOCH_MS) / 60000) & 0xFFFFF;
    const mask20 = hash32('CF_MASK_2026:' + email, 0x9E3779B9) & 0xFFFFF;
    const mac20 = hash32('CF_SIGN_2026:' + email + ':' + slot20, 0x7F4A7C15) & 0xFFFFF;
    const partA = (slot20 ^ mask20 ^ mac20) & 0xFFFFF;
    return `CF-${toB32_4(partA)}-${toB32_4(mac20)}`;
  }

  function verifyLicenseCode(rawEmail, rawCode, nowMs = Date.now()) {
    const email = String(rawEmail || '').trim().toLowerCase();
    if (!email || !email.includes('@')) return { ok: false, reason: 'email' };

    const clean = String(rawCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const body = clean.startsWith('CF') && clean.length === 10 ? clean.slice(2) : clean;
    if (body.length !== 8) return { ok: false, reason: 'format' };

    const partA = fromB32_4(body.slice(0, 4));
    const mac20 = fromB32_4(body.slice(4, 8));
    if (partA < 0 || mac20 < 0) return { ok: false, reason: 'format' };

    const mask20 = hash32('CF_MASK_2026:' + email, 0x9E3779B9) & 0xFFFFF;
    const slot20 = (partA ^ mask20 ^ mac20) & 0xFFFFF;
    const expectedMac20 = hash32('CF_SIGN_2026:' + email + ':' + slot20, 0x7F4A7C15) & 0xFFFFF;
    if (mac20 !== expectedMac20) {
      return { ok: false, reason: 'invalid' };
    }

    const nowSlot20 = Math.floor((nowMs - LICENSE_EPOCH_MS) / 60000) & 0xFFFFF;
    let diffMinutes = (nowSlot20 - slot20) & 0xFFFFF;
    if (diffMinutes > 0x7FFFF) diffMinutes -= 0x100000;

    if (diffMinutes < -30) return { ok: false, reason: 'invalid' };
    if (diffMinutes > EXPIRY_MINUTES) return { ok: false, reason: 'expired' };
    return { ok: true, email };
  }

  function loadLicense() {
    try {
      const data = JSON.parse(localStorage.getItem(LICENSE_KEY));
      return data && data.active && data.email ? data : null;
    } catch {
      return null;
    }
  }

  function saveLicense(email) {
    const payload = { active: true, email: String(email).trim().toLowerCase(), activatedAt: new Date().toISOString() };
    localStorage.setItem(LICENSE_KEY, JSON.stringify(payload));
    return payload;
  }

  function checkAndRenderAuth() {
    const lic = loadLicense();
    const authScreen = $('#authScreen');
    const emailSub = $('#licenseEmailSub');
    if (lic) {
      authScreen.hidden = true;
      if (emailSub) emailSub.textContent = lic.email;
    } else {
      authScreen.hidden = false;
    }
  }

  // Format input kode otomatis huruf besar
  $('#authCode').addEventListener('input', (e) => {
    const clean = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const body = clean.startsWith('CF') ? clean.slice(2, 10) : clean.slice(0, 8);
    if (!clean) {
      e.target.value = '';
    } else if (body.length <= 4) {
      e.target.value = 'CF-' + body;
    } else {
      e.target.value = 'CF-' + body.slice(0, 4) + '-' + body.slice(4, 8);
    }
    $('#authError').hidden = true;
  });

  $('#authEmail').addEventListener('input', () => {
    $('#authError').hidden = true;
  });

  $('#authForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = $('#authEmail').value.trim();
    const code = $('#authCode').value.trim();
    const errEl = $('#authError');

    const res = verifyLicenseCode(email, code);
    if (!res.ok) {
      errEl.hidden = false;
      if (res.reason === 'email') {
        errEl.textContent = 'Masukkan alamat email pembelian yang valid.';
      } else if (res.reason === 'expired') {
        errEl.textContent = 'Kode aktivasi sudah kadaluarsa (melebihi batas waktu 6 jam). Hubungi penjual untuk kode baru.';
      } else {
        errEl.textContent = 'Email atau kode aktivasi tidak sesuai. Pastikan menggunakan email saat membeli.';
      }
      return;
    }

    saveLicense(res.email);
    errEl.hidden = true;
    checkAndRenderAuth();
    toast('Akses berhasil diaktifkan selamanya');
  });

  // Trigger Rahasia Admin Key Generator: hanya via ?admin di URL
  let adminUnlocked = false;

  function openAdminSheet() {
    $('#adminPinForm').hidden = adminUnlocked;
    $('#keygenPanel').hidden = !adminUnlocked;
    $('#adminPinInput').value = '';
    show('#keygenSheet');
    setTimeout(() => {
      if (!adminUnlocked) $('#adminPinInput').focus();
      else $('#kgEmail').focus();
    }, 220);
  }

  const urlParams = new URLSearchParams(location.search);
  if (urlParams.has('admin') || location.hash === '#admin') {
    setTimeout(openAdminSheet, 250);
  }

  $('#adminPinForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const pin = $('#adminPinInput').value.trim();
    if (pin !== ADMIN_PIN) return toast('PIN Admin salah');
    adminUnlocked = true;
    $('#adminPinForm').hidden = true;
    $('#keygenPanel').hidden = false;
    setTimeout(() => $('#kgEmail').focus(), 100);
  });

  let lastGenerated = { email: '', code: '', expText: '' };

  $('#keygenForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = $('#kgEmail').value.trim().toLowerCase();
    if (!email || !email.includes('@')) return toast('Masukkan email pembeli yang valid');

    const now = Date.now();
    const code = generateLicenseCode(email, now);
    const expDate = new Date(now + EXPIRY_MINUTES * 60000);
    const expTime = expDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    const expDay = expDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    const expText = `Hangus otomatis: ${expDay}, pukul ${expTime} (6 jam)`;

    lastGenerated = { email, code, expText };
    $('#kgOutEmail').textContent = email;
    $('#kgOutCode').textContent = code;
    $('#kgOutExp').textContent = expText;
    $('#kgResult').hidden = false;
  });

  async function copyText(text, successMsg) {
    try {
      await navigator.clipboard.writeText(text);
      toast(successMsg);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      toast(successMsg);
    }
  }

  $('#kgCopyCodeBtn').addEventListener('click', () => {
    if (!lastGenerated.code) return;
    copyText(lastGenerated.code, 'Kode disalin');
  });

  $('#kgCopyMsgBtn').addEventListener('click', () => {
    if (!lastGenerated.code) return;
    const appUrl = 'https://cashflow-zjtra.vercel.app/';
    const msg = [
      'Terima kasih sudah membeli aplikasi Cashflow!',
      'Berikut data aktivasi akses Anda:',
      '',
      `Link Aplikasi: ${appUrl}`,
      `Email: ${lastGenerated.email}`,
      `Kode Aktivasi: ${lastGenerated.code}`,
      '',
      'Catatan: Kode aktivasi ini hanya berlaku selama 6 jam dan khusus untuk email Anda. Setelah diaktifkan, aplikasi akan terbuka selamanya di perangkat Anda.',
    ].join('\n');
    copyText(msg, 'Format chat pembeli disalin');
  });

  $('#kgUnlockDeviceBtn').addEventListener('click', () => {
    saveLicense('admin@cashflow.pro');
    checkAndRenderAuth();
    hide('#keygenSheet');
    toast('Perangkat ini diaktifkan (Mode Admin)');
  });

  $('#kgLockDeviceBtn').addEventListener('click', () => {
    localStorage.removeItem(LICENSE_KEY);
    checkAndRenderAuth();
    hide('#keygenSheet');
    toast('Perangkat dikunci ulang');
  });

  // ---------- Offline support ----------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  checkAndRenderAuth();
  render();
})();
