(() => {
  'use strict';

  const STORAGE_KEY = 'catatan-keuangan.v1';

  // id kategori dipertahankan supaya data lama tetap terbaca
  const CATEGORIES = {
    expense: [
      { id: 'makan', name: 'Makan', icon: 'c-food', color: '#EA580C' },
      { id: 'transport', name: 'Transport', icon: 'c-car', color: '#2563EB' },
      { id: 'belanja', name: 'Belanja', icon: 'c-bag', color: '#DB2777' },
      { id: 'tagihan', name: 'Tagihan', icon: 'c-receipt', color: '#7C3AED' },
      { id: 'hiburan', name: 'Hiburan', icon: 'c-film', color: '#D97706' },
      { id: 'kesehatan', name: 'Kesehatan', icon: 'c-health', color: '#E11D48' },
      { id: 'pendidikan', name: 'Pendidikan', icon: 'c-book', color: '#0891B2' },
      { id: 'lainnya', name: 'Lainnya', icon: 'c-grid', color: '#64748B' },
    ],
    income: [
      { id: 'gaji', name: 'Gaji', icon: 'c-briefcase', color: '#059669' },
      { id: 'bonus', name: 'Bonus', icon: 'c-gift', color: '#0D9488' },
      { id: 'usaha', name: 'Usaha', icon: 'c-store', color: '#0284C7' },
      { id: 'investasi', name: 'Investasi', icon: 'c-trend', color: '#4F46E5' },
      { id: 'lainnya', name: 'Lainnya', icon: 'c-wallet', color: '#64748B' },
    ],
  };

  const $ = (s) => document.querySelector(s);
  const numFmt = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
  const fmt = (n) => 'Rp' + numFmt.format(Math.round(Math.abs(n)));

  let txs = load();
  let cursor = firstOfMonth(new Date());
  const form = { type: 'expense', category: null, editId: null };
  const shownValues = { balance: 0, in: 0, out: 0 };
  let activeCat = null;
  let lastEntries = [];
  let lastTotalOut = 0;

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

  // ---------- Helpers ----------
  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function firstOfMonth(d) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }
  function ymd(d) {
    const z = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
  }
  function catInfo(type, id) {
    const list = CATEGORIES[type] || CATEGORIES.expense;
    return list.find((c) => c.id === id) || list[list.length - 1];
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

  // ---------- Render ----------
  function render(fade) {
    $('#monthLabel').textContent = cursor.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
    $('#chartMonth').textContent = cursor.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' });

    if (fade) {
      for (const sel of ['#monthLabel', '#chartMonth', '#donutBody', '#legend', '#txList']) {
        const el = $(sel);
        if (!el) continue;
        el.classList.remove('month-fade');
        void el.offsetWidth;
        el.classList.add('month-fade');
      }
    }

    const mk = ymd(cursor).slice(0, 7);
    const list = txs
      .filter((t) => t.date.startsWith(mk))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);

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

    // Komposisi pengeluaran per kategori (Donut chart per bulan)
    const entries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    if (activeCat && !byCat[activeCat]) activeCat = null;
    $('#chartHint').textContent = entries.length ? 'Tap grafik untuk detail' : 'Belum ada pengeluaran bulan ini';
    renderDonut(entries, totalOut);

    $('#legend').innerHTML = entries
      .map(([id, v]) => {
        const c = catInfo('expense', id);
        const pct = (v / totalOut) * 100;
        const isAct = activeCat === id;
        return `<li data-cat="${id}" class="${isAct ? 'active' : ''}">
          <span class="dot" style="background:${c.color}"></span>
          <span class="lg-name">${c.name}</span>
          <span class="lg-pct num">${pct < 1 ? '<1' : Math.round(pct)}%</span>
          <span class="lg-amt num">${fmt(v)}</span>
        </li>`;
      })
      .join('');
    $('#legend').classList.toggle('has-active', Boolean(activeCat));

    $('#txCount').textContent = list.length ? `${list.length} transaksi` : '';

    if (!list.length) {
      $('#txList').innerHTML = `<div class="empty">
        <div class="empty-icon">${icon('i-doc')}</div>
        <h3>Belum ada transaksi</h3>
        <p>Transaksi yang dicatat pada bulan ini akan tampil di sini.</p>
      </div>`;
      return;
    }

    // Kelompokkan per tanggal
    const groups = new Map();
    for (const t of list) {
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
          <span class="row-main"><span class="row-title">${c.name}</span>${t.note ? `<span class="row-sub">${esc(t.note)}</span>` : ''}</span>
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

  // ---------- Form ----------
  function setType(type, category, animateCats = true) {
    const typeChanged = form.type !== type;
    form.type = type;
    form.category = category || CATEGORIES[type][0].id;
    const seg = $('.seg');
    seg.dataset.type = type;
    seg.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.type === type));
    renderCats(typeChanged && animateCats);
  }

  function renderCats(reanimate = false) {
    const grid = $('#catGrid');
    if (!reanimate && grid.children.length === CATEGORIES[form.type].length) {
      grid.querySelectorAll('.cat').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.cat === form.category);
      });
      return;
    }
    grid.innerHTML = CATEGORIES[form.type]
      .map((c) => `<button type="button" class="cat${c.id === form.category ? ' active' : ''}" data-cat="${c.id}">
        ${tile(c)}<span>${c.name}</span></button>`)
      .join('');
  }

  function defaultDate() {
    const today = new Date();
    return firstOfMonth(today).getTime() === cursor.getTime() ? ymd(today) : ymd(cursor);
  }

  function openForm(tx) {
    form.editId = tx ? tx.id : null;
    $('#catGrid').innerHTML = '';
    setType(tx ? tx.type : 'expense', tx ? tx.category : null, true);
    $('#amount').value = tx ? numFmt.format(tx.amount) : '';
    $('#note').value = tx ? tx.note || '' : '';
    $('#date').value = tx ? tx.date : defaultDate();
    $('#sheetTitle').textContent = tx ? 'Edit transaksi' : 'Tambah transaksi';
    $('#deleteBtn').hidden = !tx;
    show('#sheet');
    if (!tx) setTimeout(() => $('#amount').focus(), 220);
  }

  // ---------- Events ----------
  function stepMonth(delta) {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1);
    render(delta < 0 ? 'prev' : 'next');
  }
  $('#chartPrev').addEventListener('click', () => stepMonth(-1));
  $('#chartNext').addEventListener('click', () => stepMonth(1));

  $('#addBtn').addEventListener('click', () => openForm(null));

  $('#txList').addEventListener('click', (e) => {
    const btn = e.target.closest('.row');
    if (!btn) return;
    const tx = txs.find((t) => t.id === btn.dataset.id);
    if (tx) openForm(tx);
  });

  $('.seg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b && b.dataset.type !== form.type) setType(b.dataset.type);
  });

  $('#catGrid').addEventListener('click', (e) => {
    const cat = e.target.closest('.cat');
    if (!cat) return;
    form.category = cat.dataset.cat;
    renderCats(false);
  });

  // Format angka otomatis: 150000 -> 150.000
  $('#amount').addEventListener('input', (e) => {
    const digits = e.target.value.replace(/\D/g, '').replace(/^0+/, '').slice(0, 13);
    e.target.value = digits ? numFmt.format(Number(digits)) : '';
  });

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
    const [y, m] = data.date.split('-').map(Number);
    cursor = new Date(y, m - 1, 1);
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
  const pressSel = '.icon-btn, .fab, .row, .cat, .btn, .menu-row, .donut-center, .legend li';
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
    if (!txs.length) return toast('Belum ada data untuk di-backup');
    const json = JSON.stringify({ app: 'catatan-keuangan', version: 1, exportedAt: new Date().toISOString(), transactions: txs }, null, 2);
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
    try {
      const parsed = JSON.parse(await file.text());
      incoming = (Array.isArray(parsed) ? parsed : parsed.transactions || []).filter(
        (t) => t && t.id && ['income', 'expense'].includes(t.type) && Number(t.amount) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(t.date));
    } catch {
      incoming = [];
    }
    if (!incoming.length) return toast('File backup tidak valid');

    const ok = await confirmDialog({
      title: 'Pulihkan data?',
      message: `${incoming.length} transaksi akan ditambahkan. Data yang sudah ada tetap tersimpan.`,
      ok: 'Pulihkan',
    });
    if (!ok) return;
    const map = new Map(txs.map((t) => [t.id, t]));
    for (const t of incoming) map.set(t.id, { ...t, amount: Number(t.amount) });
    txs = [...map.values()];
    save();
    hide('#menu');
    render();
    toast(`${incoming.length} transaksi dipulihkan`);
  });

  $('#clearBtn').addEventListener('click', async () => {
    if (!txs.length) return toast('Belum ada data');
    const ok = await confirmDialog({
      title: 'Hapus semua data?',
      message: `Seluruh ${txs.length} transaksi akan dihapus permanen. Disarankan membuat backup terlebih dahulu.`,
      ok: 'Hapus semua',
      danger: true,
    });
    if (!ok) return;
    txs = [];
    save();
    hide('#menu');
    render();
    toast('Semua data dihapus');
  });

  // ---------- Offline support ----------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  render();
})();
