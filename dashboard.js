document.addEventListener('DOMContentLoaded', () => {
  const yearSpan = document.getElementById('year');
  if (yearSpan) yearSpan.textContent = new Date().getFullYear();

  // Define the backend API base and bearer token. The frontend is served from a static server
  // (typically port 5500), so relative API paths would point back at the static server. By
  // prefixing all backend requests with API_BASE we ensure they hit the FastAPI backend on
  // port 8000. We also extract the JWT token from the current session for authenticated calls.
  const API_BASE = (window.API_BASE || window.location.origin);


  const toast = document.getElementById('toast');
  function showToast(msg, timeout = 2200, action = null) {
    if (!toast) return;
    if (action && action.label && typeof action.onClick === 'function') {
      toast.innerHTML = '';
      const span = document.createElement('span');
      span.textContent = msg;
      const btn = document.createElement('button');
      btn.className = 'btn btn-sm btn-inline';
      btn.textContent = action.label;
      btn.addEventListener('click', () => action.onClick());
      toast.appendChild(span);
      toast.appendChild(btn);
    } else {
      toast.textContent = msg;
    }
    toast.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { toast.hidden = true; }, timeout);
  }

  function loadUsers() { try { return JSON.parse(localStorage.getItem('mpa_users')) || {}; } catch { return {}; } }
  function readSession() {
    const l = localStorage.getItem('mpa_session'); if (l) return JSON.parse(l);
    const s = sessionStorage.getItem('mpa_session'); return s ? JSON.parse(s) : null;
  }
  function clearSession() {
    localStorage.removeItem('mpa_session');
    sessionStorage.removeItem('mpa_session');
  }
  function getUserBySession(session) {
    const users = loadUsers();
    const byEmail = session && session.email ? users[session.email] : null;
    if (byEmail) return byEmail;
    try { const raw = localStorage.getItem('mpa_user'); return raw ? JSON.parse(raw) : null; } catch { return null; }
  }
  function daysUntil(dateStr) {
    if (!dateStr) return null;
    const now = new Date(); const exp = new Date(dateStr);
    return Math.ceil((exp.getTime() - now.getTime()) / 86400000);
  }
  function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
  function readJSON(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } }
  function writeJSON(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

  const session = readSession();
  if (!session) { showToast('Please sign in to view your dashboard.'); window.location.href = 'index.html'; return; }
  // Extract JWT token from the session. This is used for authenticated API calls.
  const token = session && session.token ? session.token : '';
  const currentUser = getUserBySession(session) || {};
  const email = session.email || currentUser.email || 'Student';

  // Immediately attempt to sync any locally stored offers with the backend. This runs asynchronously
  // and does not block page rendering. If no local offers exist or the user is not authenticated,
  // the function will simply resolve without changes.
  syncLocalOffers();

  const welcomeSub = document.getElementById('welcomeSub');
  const profileName = document.getElementById('profileName');
  if (profileName) profileName.textContent = email.split('@')[0] || 'Profile';
  if (welcomeSub) welcomeSub.textContent = `Signed in as ${email}${currentUser.university ? ' — ' + currentUser.university : ''}`;

  document.getElementById('signOut')?.addEventListener('click', () => {
    clearSession();
    if (welcomeSub) {
      const uniDot = currentUser.university ? ` • ${currentUser.university}` : '';
    welcomeSub.textContent = `Welcome, ${email.split('@')[0]}${uniDot}`;
    }

    showToast('Signed out.');
    setTimeout(() => { window.location.href = 'index.html'; }, 600);
  });


  const totalMeals = Number(currentUser.totalMeals || 0);
  const dLeft = daysUntil(currentUser.expiration);
  const mealDistribution = currentUser.mealDistribution || 'semester';
  const weeklyMeals = Number(currentUser.weeklyMeals || 0);
  const termDays = 112;

  // Map of meal type to base price for the current university. Populated asynchronously via loadMealPrices().
  const mealPriceMap = {};

  /**
   * Synchronize any locally stored meal or item offers to the backend.
   *
   * Prior versions of the application stored offers only in localStorage. Those records never
   * appeared in the admin dashboard because they were never persisted server-side. This helper
   * scans the local lists of meal and item offers and posts any entries lacking a `remoteId`
   * to the appropriate API endpoint. When the POST succeeds, the entry is marked with the
   * returned `id` and its status is updated from the server response. This operation is
   * idempotent: once an entry has a `remoteId` it will not be re-posted.
   *
   * The function silently ignores network or authentication errors to avoid blocking page load.
   */
  async function syncLocalOffers() {
    // Determine keys based on the current user's university. If no university is set, use GLOBAL.
    const uniKey = currentUser.university || 'GLOBAL';
    const mealKey = `mpa_meal_offers_${uniKey}`;
    const itemKey = `mpa_item_offers_${uniKey}`;
    let mealList = readJSON(mealKey, []);
    let itemList = readJSON(itemKey, []);
    let mealsChanged = false;
    let itemsChanged = false;
    // Sync meal offers
    for (const offer of mealList) {
      if (!offer.remoteId) {
        try {
          const resp = await fetch(`${API_BASE}/offers/meals`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: token ? ('Bearer ' + token) : '' },
            body: JSON.stringify({
              meals: offer.meals,
              location: offer.location,
              price: offer.price,
              meal_type: offer.meal_type || 'lunch'
            })
          });
          if (resp.ok) {
            const data = await resp.json();
            offer.remoteId = data.id;
            // Normalize local status to match remote (in case it differs)
            offer.status = data.status;
            mealsChanged = true;
          }
        } catch (err) {
          // ignore errors (network, auth) and continue
        }
      }
    }
    // Sync item offers
    for (const it of itemList) {
      if (!it.remoteId) {
        try {
          const resp = await fetch(`${API_BASE}/offers/items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: token ? ('Bearer ' + token) : '' },
            body: JSON.stringify({
              name: it.name,
              category: it.category,
              price: it.price,
              img_data_url: it.img || null,
              baseline: it.baseline || 0
            })
          });
          if (resp.ok) {
            const data = await resp.json();
            it.remoteId = data.id;
            it.status = data.status;
            itemsChanged = true;
          }
        } catch (err) {
          // ignore errors
        }
      }
    }
    if (mealsChanged) {
      writeJSON(mealKey, mealList);
    }
    if (itemsChanged) {
      writeJSON(itemKey, itemList);
    }
  }

  async function loadMealPrices() {
    if (!currentUser.university) return;
    try {
      // Use the API_BASE so this call goes to the backend service instead of the static server
      const resp = await fetch(`${API_BASE}/mealprices?university=${encodeURIComponent(currentUser.university)}`);
      if (resp.ok) {
        const arr = await resp.json();
        arr.forEach(mp => { mealPriceMap[mp.meal_type] = mp.price; });
        // Once prices are loaded, recompute average recovered to update UI
        computeAvgRecovered();
      }
    } catch (e) {
      console.error('Failed loading meal prices', e);
    }
  }

  function computeAvgRecovered() {
    // Compute average savings per meal across all local meal offers using base price definitions
    const uniKey = currentUser.university || 'GLOBAL';
    const mKey = `mpa_meal_offers_${uniKey}`;
    const list = JSON.parse(localStorage.getItem(mKey) || '[]');
    let totalDiff = 0;
    let totalMealsCount = 0;
    list.forEach(o => {
      const base = mealPriceMap[o.meal_type];
      if (!base) return;
      const diff = base - o.price;
      if (diff > 0) {
        totalDiff += diff * (o.meals || 1);
        totalMealsCount += (o.meals || 1);
      }
    });
    const avg = totalMealsCount > 0 ? (totalDiff / totalMealsCount) : 0;
    const wasteSummaryEl = document.getElementById('wasteSummary');
    if (wasteSummaryEl) {
      // The wasteSummary text may already include the waste percentage. We'll append savings separated by " | ".
      const baseTxt = wasteSummaryEl.dataset.base || wasteSummaryEl.textContent || '';
      // If dataset.base not set, store the original waste text (without any appended savings)
      if (!wasteSummaryEl.dataset.base) {
        wasteSummaryEl.dataset.base = baseTxt;
      }
      const basePart = wasteSummaryEl.dataset.base;
      wasteSummaryEl.textContent = `${basePart} | Avg. savings: $${avg.toFixed(2)}/meal`;
    }
  }
  let remaining = totalMeals, usedTotal = 0;
  // Load usage logs and adjust used/remaining based on plan
  const usageKey = `mpa_usage_${email}`;
  function loadUsage() { return readJSON(usageKey, []); }
  function saveUsage(arr) { writeJSON(usageKey, arr); }
  const usageLogs = loadUsage();
  const nowDate = new Date();
  // Compute usage for this week
  function weekStart(d) {
    const dt = new Date(d);
    const day = dt.getDay();
    // Sunday=0 -> Monday start (1), we convert
    const diff = (day === 0 ? -6 : 1) - day;
    const ms = dt.getTime() + diff * 86400000;
    const start = new Date(ms);
    start.setHours(0,0,0,0);
    return start;
  }
  const curWeekStart = weekStart(nowDate);
  const nextWeekStart = new Date(curWeekStart.getTime() + 7 * 86400000);
  let usedLogsTotal = 0;
  let usedLogsThisWeek = 0;
  let usedLogsLastWeek = 0;
  usageLogs.forEach(u => {
    const ts = new Date(u.ts);
    const meals = Number(u.meals || 0);
    usedLogsTotal += meals;
    if (ts >= curWeekStart && ts < nextWeekStart) usedLogsThisWeek += meals;
    else if (ts >= new Date(curWeekStart.getTime() - 7 * 86400000) && ts < curWeekStart) usedLogsLastWeek += meals;
  });
  if (mealDistribution === 'weekly' && weeklyMeals > 0) {
    // Weekly plan: remaining is weeklyMeals - used logs this week
    remaining = Math.max(0, weeklyMeals - usedLogsThisWeek);
    usedTotal = usedLogsThisWeek;
  } else {
    // Semester plan: base off time progress, then subtract logs
    if (totalMeals > 0 && dLeft !== null && dLeft > 0) {
      const elapsed = (termDays - dLeft) / termDays;
      usedTotal = Math.round(totalMeals * elapsed);
      remaining = Math.max(0, totalMeals - usedTotal);
    }
    // Logs reduce remaining and increase used total
    usedTotal += usedLogsTotal;
    remaining = Math.max(0, remaining - usedLogsTotal);
  }
  const avgPerDay = totalMeals > 0 ? totalMeals / termDays : 0;
  // Determine this and last week usage for trend. Use logged values if available, otherwise estimate.
  let thisWeekUsed = usedLogsThisWeek;
  let lastWeekUsed = usedLogsLastWeek;
  if (mealDistribution !== 'weekly') {
    // For semester plan, estimate weekly usage based on avgPerDay and logs
    if (thisWeekUsed === 0) thisWeekUsed = Math.max(0, Math.round(avgPerDay * 7 + (Math.random() * 3 - 1)));
    if (lastWeekUsed === 0) lastWeekUsed = Math.max(0, thisWeekUsed + Math.round(Math.random() * 4 - 2));
  }
  const trendPct = lastWeekUsed > 0 ? Math.round(((thisWeekUsed - lastWeekUsed) / lastWeekUsed) * 100) : 0;
  const kpiMealsLeft = document.getElementById('kpiMealsLeft');
  const kpiAtRisk = document.getElementById('kpiAtRisk');
  const kpiUsedWeek = document.getElementById('kpiUsedWeek');
  const kpiUsedWeekSub = document.getElementById('kpiUsedWeekSub');
  const kpiTrend = document.getElementById('kpiTrend');
  const kpiPredict = document.getElementById('kpiPredict');
  const kpiPredictSub = document.getElementById('kpiPredictSub');
  if (kpiMealsLeft) kpiMealsLeft.textContent = String(remaining);
  if (kpiAtRisk) kpiAtRisk.textContent = dLeft !== null && dLeft <= 7 ? `Predicted ${Math.max(0, Math.ceil(remaining * 0.4))} may expire in ${dLeft}d` : 'No near-term expiry risk';
  if (kpiUsedWeek) kpiUsedWeek.textContent = String(thisWeekUsed);
  if (kpiUsedWeekSub) kpiUsedWeekSub.textContent = `Last week: ${lastWeekUsed}`;
  if (kpiTrend) kpiTrend.textContent = (trendPct >= 0 ? '+' : '') + trendPct + '%';
  if (kpiPredict) kpiPredict.textContent = dLeft !== null ? `${Math.max(0, Math.round((remaining / Math.max(1, dLeft)) * 7))}/7` : '—';
  if (kpiPredictSub) kpiPredictSub.textContent = dLeft !== null ? `At current pace, ${remaining} left over ${dLeft}d` : 'Set plan details to project risk';

  function drawBarCompare(ctx, labels, values) {
    if (!ctx) return;
    const w = ctx.canvas.width, h = ctx.canvas.height;
    ctx.clearRect(0,0,w,h);
    const maxVal = Math.max(...values, 1);
    const pad = 40;
    const barW = (w - pad * 2) / (values.length * 2);
    ctx.font = "14px Inter, Arial";
    ctx.fillStyle = "#cfd6e3";
    labels.forEach((lab, i) => {
      const val = values[i];
      const x = pad + i * (barW * 2.2) + barW * 0.5;
      const bh = (h - pad * 2) * (val / maxVal);
      const y = h - pad - bh;
      ctx.fillStyle = "#60a5fa";
      ctx.fillRect(x, y, barW, bh);
      ctx.fillStyle = "#6ee7b7";
      ctx.fillRect(x + barW * 1.1, y + (barW * 0.05), barW * 0.2, Math.max(2, bh * 0.9));
      ctx.fillStyle = "#cfd6e3";
      ctx.fillText(String(val), x, y - 6);
      ctx.fillText(lab, x, h - pad + 18);
    });
    ctx.strokeStyle = "#1f2430";
    ctx.beginPath();
    ctx.moveTo(pad, h - pad);
    ctx.lineTo(w - pad, h - pad);
    ctx.stroke();
  }
  function drawLineTrend(ctx, points, wastePct) {
    if (!ctx) return;
    const w = ctx.canvas.width, h = ctx.canvas.height;
    ctx.clearRect(0,0,w,h);
    const pad = 40;
    const maxVal = Math.max(...points.map(p => p.y), 1);
    const minVal = 0;
    ctx.strokeStyle = "#1f2430";
    ctx.beginPath();
    ctx.moveTo(pad, h - pad);
    ctx.lineTo(w - pad, h - pad);
    ctx.stroke();
    ctx.strokeStyle = "#60a5fa";
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach((p, i) => {
      const x = pad + (i * (w - pad * 2) / Math.max(1, points.length - 1));
      const y = h - pad - ((p.y - minVal) / (maxVal - minVal)) * (h - pad * 2);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.fillStyle = "#cfd6e3";
    ctx.font = "14px Inter, Arial";
    points.forEach((p, i) => {
      const x = pad + (i * (w - pad * 2) / Math.max(1, points.length - 1));
      const y = h - pad - ((p.y - minVal) / (maxVal - minVal)) * (h - pad * 2);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = "#f59e0b";
    ctx.fillRect(w - pad - 120, pad, 12, 12);
    ctx.fillStyle = "#cfd6e3";
    ctx.fillText(`Waste Forecast: ${wastePct}%`, w - pad - 100, pad + 11);
  }
  const weekCtx = document.getElementById('chartWeekCompare')?.getContext('2d');
  drawBarCompare(weekCtx, ['Last Week', 'This Week'], [lastWeekUsed, thisWeekUsed]);
  function buildCampusPoints() {
    const base = Math.max(5, Math.round(avgPerDay * 7));
    const pts = [];
    for (let i = 6; i >= 0; i--) {
      const jitter = Math.round((Math.random() - 0.5) * 4);
      pts.push({ x: i, y: Math.max(0, base + jitter) });
    }
    return pts.reverse();
  }
  const campusPoints = buildCampusPoints();
  const wastePct = remaining > 0 && dLeft !== null && dLeft > 0 ? Math.max(0, Math.min(100, Math.round((remaining / Math.max(1, dLeft)) * 8))) : 0;
  const campusCtx = document.getElementById('chartCampusTrend')?.getContext('2d');
  drawLineTrend(campusCtx, campusPoints, wastePct);
  const wasteSummary = document.getElementById('wasteSummary');
  if (wasteSummary) wasteSummary.textContent = `Predicted campus-wide waste within next 2 weeks: ~${wastePct}%`;

  const uniKey = currentUser.university || 'GLOBAL';
  const mealsKey = `mpa_meal_offers_${uniKey}`;
  const itemsKey = `mpa_item_offers_${uniKey}`;
  const messagesKey = `mpa_messages_${uniKey}`;

  const mealSearch = document.getElementById('mealSearch');
  const itemSearch = document.getElementById('itemSearch');
  const myListingsEl = document.getElementById('myListings');
  const bestMealDealsEl = document.getElementById('bestMealDeals');
  const mealOffersTableBody = document.getElementById('mealOffersTable')?.querySelector('tbody');
  const bestItemDealsEl = document.getElementById('bestItemDeals');
  const itemsTableBody = document.getElementById('itemsTable')?.querySelector('tbody');

  const offerMealsForm = document.getElementById('offerMealsForm');
  if (offerMealsForm) {
    offerMealsForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const meals = Number(document.getElementById('mealsOffered').value || 0);
      const loc = String(document.getElementById('offerLocations').value || '').trim();
      const price = Number(document.getElementById('pricePerMeal').value || 0);
      const mtype = String(document.getElementById('mealType').value || '').trim();
      if (meals <= 0 || !loc || price <= 0 || !mtype) {
        showToast('Please complete all fields with valid values.');
        return;
      }
      // Persist the meal offer to the backend so that it appears in the admin dashboard.
      let remoteResp = null;
      try {
        const resp = await fetch(`${API_BASE}/offers/meals`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: token ? ('Bearer ' + token) : '' },
          body: JSON.stringify({ meals: meals, location: loc, price: price, meal_type: mtype })
        });
        if (resp.ok) {
          remoteResp = await resp.json();
        }
      } catch (err) {
        console.warn('Failed to persist meal offer to backend', err);
      }
      // Persist locally for UI display and offline demo. Store remote ID if available so future actions (accept/cancel) can call backend with correct identifier.
      const list = readJSON(mealsKey, []);
      // Include university property so that listings can be filtered by campus
      list.push({ id: uid(), remoteId: remoteResp && remoteResp.id ? remoteResp.id : null, status: (remoteResp && remoteResp.status) || 'active', seller: email, meals, location: loc, price, meal_type: mtype, ts: Date.now(), university: currentUser.university || null });
      writeJSON(mealsKey, list);
      showToast('Meal offer posted.');
      offerMealsForm.reset();
      refreshAllViews();
    });
  }
  const baselineMap = { "Books": 60, "Furniture": 120, "Electronics": 200, "Other": 40 };
  const offerItemForm = document.getElementById('offerItemForm');
  if (offerItemForm) {
    offerItemForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const file = document.getElementById('itemImageFile').files[0] || null;
      const name = String(document.getElementById('itemName').value || '').trim();
      const cat = String(document.getElementById('itemCategory').value || '').trim();
      const price = Number(document.getElementById('itemPrice').value || 0);
      const note = String(document.getElementById('itemNote').value || '').trim();
      if (!name || !cat || price <= 0) { showToast('Please fill name, category, and a valid price.'); return; }
      let img = '';
      if (file) {
        img = await new Promise((res) => {
          const fr = new FileReader();
          fr.onload = () => res(fr.result || '');
          fr.readAsDataURL(file);
        });
      }
      // Persist the item offer to the backend so that it appears in the admin dashboard.
      let remoteResp = null;
      try {
        const resp = await fetch(`${API_BASE}/offers/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: token ? ('Bearer ' + token) : '' },
          body: JSON.stringify({ name: name, category: cat, price: price, img_data_url: img, baseline: baselineMap[cat] || baselineMap.Other })
        });
        if (resp.ok) remoteResp = await resp.json();
      } catch (err) {
        console.warn('Failed to persist item offer to backend', err);
      }
      // Store locally for UI and offline demo. Include remoteId if returned by backend.
      const list = readJSON(itemsKey, []);
      // Include university property so that item listings can be filtered by campus
      list.push({ id: uid(), remoteId: remoteResp && remoteResp.id ? remoteResp.id : null, status: (remoteResp && remoteResp.status) || 'active', seller: email, img, name, category: cat, price, note, baseline: baselineMap[cat] || baselineMap.Other, ts: Date.now(), university: currentUser.university || null });
      writeJSON(itemsKey, list);
      showToast('Item listed.');
      offerItemForm.reset();
      refreshAllViews();
    });
  }

  function discountPct(price, baseline) {
    if (!baseline) return 0;
    return Math.round(Math.max(0, (1 - price / baseline) * 100));
  }

  function renderBestMeals(list) {
    if (!bestMealDealsEl) return;
    // Only show active listings from the current campus or the user's own listings
    const active = list.filter(o => o.status === 'active' && (o.seller === email || (o.university ? o.university === (currentUser.university || null) : true)));
    const sorted = [...active].sort((a, b) => a.price - b.price).slice(0, 5);
    bestMealDealsEl.innerHTML = '';
    if (sorted.length === 0) {
      const li = document.createElement('li'); li.innerHTML = `<span>No deals yet</span><span>—</span>`; bestMealDealsEl.appendChild(li); return;
    }
    sorted.forEach(o => {
      const li = document.createElement('li');
      const left = document.createElement('span');
      const typeLabel = o.meal_type ? ` (${o.meal_type})` : '';
      left.textContent = `${o.location}${typeLabel} — $${o.price.toFixed(2)}/meal`;
      const right = document.createElement('span');
      if (o.seller !== email) {
        const btn = document.createElement('button'); btn.className = 'btn btn-sm'; btn.textContent = 'Accept';
        btn.addEventListener('click', () => openAcceptDialog('meal', o.id));
        right.appendChild(btn);
      } else {
        const del = document.createElement('button'); del.className = 'btn btn-sm btn-outline'; del.textContent = 'Delete';
        del.addEventListener('click', () => deleteListing('meal', o.id));
        right.appendChild(del);
      }
      li.appendChild(left);
      li.appendChild(right);
      bestMealDealsEl.appendChild(li);
    });
  }

  function renderBestItems(list) {
    if (!bestItemDealsEl) return;
    // Only include active listings from current campus or user's own listings when computing best deals
    const scored = list.filter(i => i.status === 'active' && (i.seller === email || (i.university ? i.university === (currentUser.university || null) : true))).map(i => ({ ...i, discount: discountPct(i.price, i.baseline) }));
    const best = scored.sort((a, b) => b.discount - a.discount).slice(0, 5);
    bestItemDealsEl.innerHTML = '';
    if (best.length === 0) {
      const li = document.createElement('li'); li.innerHTML = `<span>No items yet</span><span>—</span>`; bestItemDealsEl.appendChild(li); return;
    }
    best.forEach(i => {
      const li = document.createElement('li');
      const left = document.createElement('span');
      left.textContent = `${i.name} (${i.category}) — $${i.price.toFixed(2)}`;
      const right = document.createElement('span');
      if (i.seller !== email) {
        const btn = document.createElement('button'); btn.className = 'btn btn-sm'; btn.textContent = 'Accept';
        btn.addEventListener('click', () => openAcceptDialog('item', i.id));
        right.appendChild(btn);
      } else {
        const del = document.createElement('button'); del.className = 'btn btn-sm btn-outline'; del.textContent = 'Delete';
        del.addEventListener('click', () => deleteListing('item', i.id));
        right.appendChild(del);
      }
      li.appendChild(left); li.appendChild(right); bestItemDealsEl.appendChild(li);
    });
  }

  function renderMealTable(list) {
    if (!mealOffersTableBody) return;
    const q = (mealSearch?.value || '').toLowerCase();
    // Only show listings from current user's campus or own listings
    const filtered = list.filter(o => o.status === 'active' && (o.seller === email || (o.university ? o.university === (currentUser.university || null) : true)) && (!q || o.location.toLowerCase().includes(q)));
    mealOffersTableBody.innerHTML = '';
    filtered.sort((a, b) => b.ts - a.ts).forEach(o => {
      const tr = document.createElement('tr');
      const date = new Date(o.ts).toLocaleString();
      const act = document.createElement('td');
      if (o.seller === email) {
        const del = document.createElement('button'); del.className = 'btn btn-sm btn-outline'; del.textContent = 'Delete';
        del.addEventListener('click', () => deleteListing('meal', o.id));
        act.appendChild(del);
      } else {
        const acc = document.createElement('button'); acc.className = 'btn btn-sm'; acc.textContent = 'Accept';
        acc.addEventListener('click', () => openAcceptDialog('meal', o.id));
        act.appendChild(acc);
      }
      tr.innerHTML = `<td>${o.seller}</td><td>${o.meals}</td><td>${o.location}</td><td>${o.meal_type || ''}</td><td>$${o.price.toFixed(2)}</td><td>${date}</td>`;
      tr.appendChild(act);
      mealOffersTableBody.appendChild(tr);
    });
  }

  function renderItemsTable(list) {
    if (!itemsTableBody) return;
    const q = (itemSearch?.value || '').toLowerCase();
    // Only include active items from current user's campus or own listings
    const scored = list.filter(i => i.status === 'active' && (i.seller === email || (i.university ? i.university === (currentUser.university || null) : true))).map(i => ({ ...i, discount: discountPct(i.price, i.baseline) }));
    const filtered = scored.filter(i => !q || i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q));
    itemsTableBody.innerHTML = '';
    filtered.sort((a, b) => b.ts - a.ts).forEach(i => {
      const tr = document.createElement('tr');
      const date = new Date(i.ts).toLocaleString();
      const act = document.createElement('td');
      if (i.seller === email) {
        const del = document.createElement('button'); del.className = 'btn btn-sm btn-outline'; del.textContent = 'Delete';
        del.addEventListener('click', () => deleteListing('item', i.id));
        act.appendChild(del);
      } else {
        const acc = document.createElement('button'); acc.className = 'btn btn-sm'; acc.textContent = 'Accept';
        acc.addEventListener('click', () => openAcceptDialog('item', i.id));
        act.appendChild(acc);
      }
      tr.innerHTML = `<td>${i.img ? `<img src="${i.img}" class="item-thumb" alt="">` : '—'}</td><td>${i.name}</td><td>${i.category}</td><td>$${i.price.toFixed(2)}</td><td>${i.discount}%</td><td>${date}</td>`;
      tr.appendChild(act);
      itemsTableBody.appendChild(tr);
    });
  }

  // Daily usage recording
  const dailyUsageForm = document.getElementById('dailyUsageForm');
  const dailyMealsInput = document.getElementById('dailyMealsUsed');
  const dailyUsageList = document.getElementById('dailyUsageList');
  if (dailyUsageForm) {
    dailyUsageForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const n = Number(dailyMealsInput.value || 0);
      if (!n || n <= 0) { showToast('Enter a valid number of meals.'); return; }
      const logs = readJSON(usageKey, []);
      logs.push({ ts: Date.now(), meals: n });
      writeJSON(usageKey, logs);
      // Attempt to send to backend; ignore errors if not authenticated
      (async () => {
        try {
          // Send the adjustment to the backend so it is persisted. Use the API base and
          // include the bearer token if available. The local log is still kept for UI.
          await fetch(`${API_BASE}/usage/adjust`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: token ? ('Bearer ' + token) : '' },
            body: JSON.stringify({ meals_used_delta: -n, note: 'Recorded via dashboard' })
          });
        } catch (err) {
          // silently ignore network or auth errors
        }
      })();
      dailyMealsInput.value = '';
      // We no longer show the usage history within the KPI card, so skip rendering
      showToast('Meal usage recorded.');
      // Refresh KPIs by reloading page
      setTimeout(() => { window.location.reload(); }, 500);
    });
  }
  function renderDailyUsage() {
    if (!dailyUsageList) return;
    const logs = readJSON(usageKey, []).slice().sort((a, b) => b.ts - a.ts).slice(0, 10);
    dailyUsageList.innerHTML = '';
    logs.forEach(l => {
      const li = document.createElement('li');
      const dt = new Date(l.ts);
      li.textContent = `${l.meals} meal${l.meals > 1 ? 's' : ''} on ${dt.toLocaleDateString()} ${dt.toLocaleTimeString()}`;
      dailyUsageList.appendChild(li);
    });
  }
  // Do not render usage history in KPI card; history is accessed via profile menu
  // renderDailyUsage();

  // Clear all listings button
  const clearListingsBtn = document.getElementById('clearListingsBtn');
  if (clearListingsBtn) {
    clearListingsBtn.addEventListener('click', () => {
      if (!confirm('Clear all active listings?')) return;
      // Cancel all active meal offers and item offers owned by user both locally and on the backend
      const meals = readJSON(mealsKey, []);
      const items = readJSON(itemsKey, []);
      // Helper to cancel remote listing
      const cancelRemote = async (remoteId, typePath) => {
        if (!remoteId) return;
        try {
          await fetch(`${API_BASE}/offers/${typePath}/${remoteId}`, {
            method: 'DELETE',
            headers: { Authorization: token ? ('Bearer ' + token) : '' }
          });
        } catch (err) {
          console.warn('Failed to cancel remote listing', err);
        }
      };
      let any = false;
      meals.forEach(o => {
        if (o.seller === email && o.status === 'active') {
          cancelRemote(o.remoteId || o.id, 'meals');
          o.status = 'cancelled';
          any = true;
        }
      });
      if (any) writeJSON(mealsKey, meals);
      any = false;
      items.forEach(o => {
        if (o.seller === email && o.status === 'active') {
          cancelRemote(o.remoteId || o.id, 'items');
          o.status = 'cancelled';
          any = true;
        }
      });
      if (any) writeJSON(itemsKey, items);
      refreshAllViews();
      showToast('Listings cleared.');
    });
  }

  // Comments functionality
  const commentForm = document.getElementById('commentForm');
  const commentBodyEl = document.getElementById('commentBody');
  const userCommentsList = document.getElementById('userCommentsList');
  function loadComments() {
    if (!userCommentsList) return;
    fetch(`${API_BASE}/comments` + (currentUser.university ? `?university=${encodeURIComponent(currentUser.university)}` : ''))
      .then(r => r.ok ? r.json() : [])
      .then(arr => {
        userCommentsList.innerHTML = '';
        if (!arr || arr.length === 0) {
          const li = document.createElement('li'); li.textContent = 'No comments yet.'; userCommentsList.appendChild(li); return;
        }
        // Display only one random comment at a time for a cleaner look
        const idx = Math.floor(Math.random() * arr.length);
        const c = arr[idx];
        const dt = new Date(c.created_at);
        const ustr = c.university || '';
        const li = document.createElement('li');
        li.innerHTML = `<div>${c.body}</div><div class="sub" style="font-size:12px;">${ustr} • ${dt.toLocaleDateString()}</div>`;
        userCommentsList.appendChild(li);
      }).catch(() => {});
  }
  if (commentForm) {
    commentForm.addEventListener('submit', e => {
      e.preventDefault();
      const body = String(commentBodyEl && commentBodyEl.value || '').trim();
      if (!body) { showToast('Please enter a comment.'); return; }
      commentBodyEl.value = '';
      // Submit to backend
      (async () => {
        try {
          // Send comment to the backend. Use API_BASE and include Authorization header.
          const res = await fetch(`${API_BASE}/comments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: token ? ('Bearer ' + token) : '' },
            body: JSON.stringify({ body: body, university: currentUser.university || null })
          });
          if (!res.ok) throw new Error(await res.text());
        } catch (err) {
          // silently ignore errors
        }
        // Also store comment locally for offline demo
        const localKey = `mpa_comments_${currentUser.university || 'GLOBAL'}`;
        const list = readJSON(localKey, []);
        list.unshift({ body, created_at: new Date().toISOString(), university: currentUser.university });
        writeJSON(localKey, list);
        loadComments();
        showToast('Comment posted.');
      })();
    });
  }
  loadComments();

  function renderMyListings(mealList, itemList) {
    if (!myListingsEl) return;
    myListingsEl.innerHTML = '';
    const mineMeals = mealList.filter(o => o.seller === email).sort((a, b) => b.ts - a.ts);
    const mineItems = itemList.filter(i => i.seller === email).sort((a, b) => b.ts - a.ts);
    const all = [
      ...mineMeals.map(o => ({ t: 'meal', id: o.id, label: `${o.meals}× @ ${o.location} — $${o.price.toFixed(2)}/meal`, status: o.status })),
      ...mineItems.map(i => ({ t: 'item', id: i.id, label: `${i.name} (${i.category}) — $${i.price.toFixed(2)}`, status: i.status }))
    ];
    if (all.length === 0) {
      const li = document.createElement('li'); li.innerHTML = `<span>No listings yet</span><span>—</span>`; myListingsEl.appendChild(li); return;
    }
    all.forEach(row => {
      const li = document.createElement('li');
      const left = document.createElement('span');
      const badge = document.createElement('span');
      badge.style.padding = '2px 8px';
      badge.style.borderRadius = '999px';
      badge.style.fontSize = '12px';
      if (row.status === 'active') { badge.textContent = 'Active'; badge.style.background = '#1c2433'; }
      if (row.status === 'accepted') { badge.textContent = 'Taken'; badge.style.background = '#12331c'; }
      if (row.status === 'cancelled') { badge.textContent = 'Cancelled'; badge.style.background = '#331c1c'; }
      left.textContent = row.label + ' ';
      left.appendChild(badge);
      const right = document.createElement('span');
      if (row.status === 'active') {
        const del = document.createElement('button'); del.className = 'btn btn-sm btn-outline'; del.textContent = 'Delete';
        del.addEventListener('click', () => deleteListing(row.t, row.id));
        right.appendChild(del);
      } else {
        // For accepted or cancelled listings, allow clearing from local view
        const clr = document.createElement('button'); clr.className = 'btn btn-sm btn-outline'; clr.textContent = 'Clear';
        clr.addEventListener('click', () => removeListing(row.t, row.id));
        right.appendChild(clr);
      }
      li.appendChild(left); li.appendChild(right); myListingsEl.appendChild(li);
    });
  }

  function openPanel({ title, sub, bodyHTML }) {
    const panelModal = document.getElementById('panelModal');
    const panelTitle = document.getElementById('panelTitle');
    const panelSub = document.getElementById('panelSub');
    const panelBody = document.getElementById('panelBody');
    if (!panelModal) return;
    panelTitle.textContent = title;
    panelSub.textContent = sub || '';
    panelBody.innerHTML = bodyHTML || '';
    panelModal.removeAttribute('hidden');
    panelModal.setAttribute('aria-hidden', 'false');
  }
  function closePanel() {
    const panelModal = document.getElementById('panelModal');
    if (!panelModal) return;
    panelModal.setAttribute('hidden', 'true');
    panelModal.setAttribute('aria-hidden', 'true');
  }
  document.getElementById('panelModal')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) closePanel();
  });
  document.querySelectorAll('#panelModal [data-close]').forEach(el => el.addEventListener('click', closePanel));

  function getThreads() { return readJSON(messagesKey, []); }
  function setThreads(arr) { writeJSON(messagesKey, arr); }
  function makeThreadId(kind, listingId) { return `t_${kind}_${listingId}`; }
  function ensureInboxBadge() {
    const badge = document.getElementById('inboxBadge');
    if (!badge) return;
    const threads = getThreads();
    let unread = 0;
    threads.forEach(t => {
      const meIsSeller = t.seller === email;
      const meIsBuyer = t.buyer === email;
      if (!meIsSeller && !meIsBuyer) return;
      t.messages.forEach(m => {
        const seen = meIsSeller ? (m.readBy && m.readBy.seller) : (m.readBy && m.readBy.buyer);
        if (!seen) unread += 1;
      });
    });
    if (unread > 0) { badge.style.display = 'inline-block'; badge.textContent = String(unread); }
    else { badge.style.display = 'none'; badge.textContent = ''; }
  }
  function ensureThread(kind, listing, buyerEmail) {
    const threads = getThreads();
    const tid = makeThreadId(kind, listing.id);
    let t = threads.find(x => x.id === tid);
    if (!t) {
      t = { id: tid, kind, listingId: listing.id, seller: listing.seller, buyer: buyerEmail, status: 'open', messages: [] };
      threads.unshift(t);
      setThreads(threads);
    }
    return t;
  }
  function addMessage(tid, fromEmail, body) {
    const threads = getThreads();
    const idx = threads.findIndex(x => x.id === tid);
    if (idx < 0) return;
    const t = threads[idx];
    // Persist message to backend if remoteThreadId is known
    (async () => {
      try {
        if (t.remoteThreadId) {
          await fetch(`${API_BASE}/inbox/threads/${t.remoteThreadId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: token ? ('Bearer ' + token) : '' },
            body: JSON.stringify({ body: body })
          });
        }
      } catch (err) {
        console.warn('Failed to persist message to backend', err);
      }
    })();
    const msg = { from: fromEmail, body, ts: Date.now(), readBy: { seller: fromEmail === t.seller, buyer: fromEmail === t.buyer } };
    t.messages.push(msg);
    setThreads(threads);
  }

  function openAcceptDialog(kind, id) {
    const meals = readJSON(mealsKey, []);
    const items = readJSON(itemsKey, []);
    const offer = kind === 'meal' ? meals.find(x => x.id === id) : items.find(x => x.id === id);
    if (!offer || offer.status !== 'active') { showToast('This offer is no longer available.'); refreshAllViews(); return; }
    const title = kind === 'meal' ? 'Accept Meal Offer' : 'Accept Marketplace Item';
    const sub = kind === 'meal' ? `${offer.meals}× at ${offer.location} — $${offer.price.toFixed(2)}/meal` : `${offer.name} (${offer.category}) — $${offer.price.toFixed(2)}`;
    openPanel({
      title,
      sub,
      bodyHTML: `
        <form id="acceptForm" class="form">
          <div class="field">
            <label>Your Message</label>
            <input id="acceptMsg" type="text" placeholder="I'll meet at the library at 5pm." />
          </div>
          <button type="submit" class="btn btn-primary">Confirm Accept</button>
        </form>
      `
    });
    document.getElementById('acceptForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const message = String(document.getElementById('acceptMsg').value || '').trim();
      // Persist acceptance to the backend. Use the appropriate endpoint based on offer type.
      (async () => {
        try {
          // Determine remote offer ID (fall back to local id if remoteId missing)
          let remoteId = id;
          if (kind === 'meal') {
            const l = readJSON(mealsKey, []);
            const found = l.find(x => x.id === id);
            if (found && found.remoteId) remoteId = found.remoteId;
          } else {
            const l = readJSON(itemsKey, []);
            const found = l.find(x => x.id === id);
            if (found && found.remoteId) remoteId = found.remoteId;
          }
          const url = `${API_BASE}/offers/${kind === 'meal' ? 'meals' : 'items'}/${remoteId}/accept`;
          await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: token ? ('Bearer ' + token) : '' },
            body: JSON.stringify({ message: message || '' })
          });
          // After acceptance, fetch remote threads to discover the thread id for this listing. Update local thread with remoteThreadId.
          try {
            const resp = await fetch(`${API_BASE}/inbox/threads`, {
              headers: { Authorization: token ? ('Bearer ' + token) : '' }
            });
            if (resp.ok) {
              const ths = await resp.json();
              // remote listing id is remoteId
              const foundThread = ths.find(t => t.kind === kind && t.listing_id === remoteId);
              if (foundThread) {
                const threads = getThreads();
                // find local thread by listing id and kind
                const localId = makeThreadId(kind, id);
                const idx = threads.findIndex(x => x.id === localId);
                if (idx >= 0) {
                  threads[idx].remoteThreadId = foundThread.id;
                  setThreads(threads);
                }
              }
            }
          } catch (err) {
            console.warn('Failed to sync remote thread id', err);
          }
        } catch (err) {
          console.warn('Failed to persist acceptance', err);
        }
      })();
      if (kind === 'meal') {
        const list = readJSON(mealsKey, []);
        const idx = list.findIndex(x => x.id === id);
        if (idx >= 0 && list[idx].status === 'active') {
          list[idx].status = 'accepted';
          list[idx].acceptedBy = email;
          list[idx].buyerMessage = message;
          writeJSON(mealsKey, list);
          const t = ensureThread('meal', list[idx], email);
          addMessage(t.id, email, message || 'Accepted');
        }
      } else {
        const list = readJSON(itemsKey, []);
        const idx = list.findIndex(x => x.id === id);
        if (idx >= 0 && list[idx].status === 'active') {
          list[idx].status = 'accepted';
          list[idx].acceptedBy = email;
          list[idx].buyerMessage = message;
          writeJSON(itemsKey, list);
          const t = ensureThread('item', list[idx], email);
          addMessage(t.id, email, message || 'Accepted');
        }
      }
      closePanel();
      showToast('Offer accepted. Conversation started.');
      refreshAllViews();
      ensureInboxBadge();
    });
  }

  let lastDeleted = null;
  let undoTimer = null;
  function deleteListing(kind, id) {
    const performCancel = async (remoteId, typePath) => {
      if (!remoteId) return;
      try {
        await fetch(`${API_BASE}/offers/${typePath}/${remoteId}`, {
          method: 'DELETE',
          headers: { Authorization: token ? ('Bearer ' + token) : '' }
        });
      } catch (err) {
        console.warn('Failed to cancel remote listing', err);
      }
    };
    if (kind === 'meal') {
      const list = readJSON(mealsKey, []);
      const idx = list.findIndex(x => x.id === id && x.seller === email && x.status === 'active');
      if (idx >= 0) {
        const entry = list[idx];
        // Call backend cancellation using remoteId if available
        performCancel(entry.remoteId || id, 'meals');
        lastDeleted = { kind, entry: { ...entry } };
        list[idx].status = 'cancelled';
        writeJSON(mealsKey, list);
        if (undoTimer) clearTimeout(undoTimer);
        showToast('Listing deleted.', 5000, { label: 'Undo', onClick: restoreLastDeleted });
        undoTimer = setTimeout(() => { lastDeleted = null; }, 5000);
      }
    } else {
      const list = readJSON(itemsKey, []);
      const idx = list.findIndex(x => x.id === id && x.seller === email && x.status === 'active');
      if (idx >= 0) {
        const entry = list[idx];
        // Call backend cancellation using remoteId if available
        performCancel(entry.remoteId || id, 'items');
        lastDeleted = { kind, entry: { ...entry } };
        list[idx].status = 'cancelled';
        writeJSON(itemsKey, list);
        if (undoTimer) clearTimeout(undoTimer);
        showToast('Listing deleted.', 5000, { label: 'Undo', onClick: restoreLastDeleted });
        undoTimer = setTimeout(() => { lastDeleted = null; }, 5000);
      }
    }
    refreshAllViews();
  }

  // Completely remove a listing from storage and UI
  function removeListing(kind, id) {
    if (kind === 'meal') {
      let list = readJSON(mealsKey, []);
      list = list.filter(x => x.id !== id);
      writeJSON(mealsKey, list);
    } else {
      let list = readJSON(itemsKey, []);
      list = list.filter(x => x.id !== id);
      writeJSON(itemsKey, list);
    }
    refreshAllViews();
  }
  function restoreLastDeleted() {
    if (!lastDeleted) return;
    if (undoTimer) { clearTimeout(undoTimer); undoTimer = null; }
    const { kind, entry } = lastDeleted;
    if (kind === 'meal') {
      const list = readJSON(mealsKey, []);
      const idx = list.findIndex(x => x.id === entry.id);
      if (idx >= 0) { list[idx].status = 'active'; writeJSON(mealsKey, list); }
    } else {
      const list = readJSON(itemsKey, []);
      const idx = list.findIndex(x => x.id === entry.id);
      if (idx >= 0) { list[idx].status = 'active'; writeJSON(itemsKey, list); }
    }
    lastDeleted = null;
    showToast('Restored.');
    refreshAllViews();
  }

  function renderInbox() {
    const threads = getThreads();
    const mine = threads.filter(t => t.seller === email || t.buyer === email);
    const listHTML = mine.map(t => {
      const last = t.messages[t.messages.length - 1];
      const other = t.seller === email ? t.buyer : t.seller;
      const title = t.kind === 'meal' ? 'Meal Offer' : 'Marketplace Item';
      const unread = t.messages.some(m => {
        if (t.seller === email) return !(m.readBy && m.readBy.seller);
        return !(m.readBy && m.readBy.buyer);
      });
      const dot = unread ? ' • New' : '';
      return `<div class="thread" data-thread="${t.id}"><div class="inbox-meta">${title} — ${other}${dot}</div><div class="sub">${last ? last.body : ''}</div></div>`;
    }).join('') || `<div class="thread"><div class="sub">No conversations yet</div></div>`;
    const bodyHTML = `
      <div class="inbox-layout">
        <div class="inbox-threads" id="inboxThreads">${listHTML}</div>
        <div class="inbox-view">
      <div class="inbox-meta" id="inboxHeader">Select a thread</div>
          <div class="inbox-actions"><button id="deleteThreadBtn" class="btn btn-sm btn-outline" style="display:none;">Delete Thread</button></div>
          <div class="inbox-messages" id="inboxMsgs"></div>
          <form id="inboxCompose" class="inbox-compose">
            <input id="inboxInput" type="text" placeholder="Type a message…" />
            <button class="btn btn-primary" type="submit">Send</button>
          </form>
        </div>
      </div>
    `;
    openPanel({ title: 'Inbox', sub: 'Conversations', bodyHTML });
    const threadsEl = document.getElementById('inboxThreads');
    const msgsEl = document.getElementById('inboxMsgs');
    const headEl = document.getElementById('inboxHeader');
    const formEl = document.getElementById('inboxCompose');
    const inputEl = document.getElementById('inboxInput');
    let activeId = null;

    function renderMessages(tid) {
      const all = getThreads();
      const t = all.find(x => x.id === tid);
      if (!t) return;
      headEl.textContent = `${t.kind === 'meal' ? 'Meal Offer' : 'Marketplace Item'} • ${t.seller === email ? t.buyer : t.seller}`;
      const delBtn = document.getElementById('deleteThreadBtn');
      if (delBtn) delBtn.style.display = 'inline-block';
      msgsEl.innerHTML = t.messages.map((m, mi) => {
        const me = m.from === email;
        const when = new Date(m.ts).toLocaleString();
        return `<div class="inbox-msg ${me ? 'me' : ''}" data-msg-index="${mi}"><div>${m.body || ''}</div><div class="sub" style="margin-top:6px;">${when}</div><button class="btn btn-sm btn-outline delete-msg-btn" data-msg-index="${mi}" style="margin-left:8px;">Delete</button></div>`;
      }).join('');
      msgsEl.scrollTop = msgsEl.scrollHeight;
      const updated = getThreads();
      const idx = updated.findIndex(x => x.id === tid);
      if (idx >= 0) {
        updated[idx].messages = updated[idx].messages.map(m => {
          const rb = m.readBy || { seller: false, buyer: false };
          if (updated[idx].seller === email) rb.seller = true; else rb.buyer = true;
          return { ...m, readBy: rb };
        });
        setThreads(updated);
        ensureInboxBadge();
        const listNodes = Array.from(threadsEl.querySelectorAll('.thread'));
        listNodes.forEach(n => {
          const id = n.getAttribute('data-thread');
          const tt = updated.find(x => x.id === id);
          if (!tt) return;
          const hasUnread = tt.messages.some(mm => {
            if (tt.seller === email) return !(mm.readBy && mm.readBy.seller);
            return !(mm.readBy && mm.readBy.buyer);
          });
          if (!hasUnread) n.querySelector('.inbox-meta').innerHTML = n.querySelector('.inbox-meta').textContent.replace(' • New','');
        });
      }
    }

    threadsEl.addEventListener('click', (e) => {
      const node = e.target.closest('.thread');
      if (!node) return;
      const tid = node.getAttribute('data-thread');
      activeId = tid;
      Array.from(threadsEl.children).forEach(n => n.classList.remove('active'));
      node.classList.add('active');
      renderMessages(tid);
    });

    formEl.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!activeId) return;
      const body = String(inputEl.value || '').trim();
      if (!body) return;
      addMessage(activeId, email, body);
      inputEl.value = '';
      renderMessages(activeId);
    });

    // Delete message within a thread
    msgsEl.addEventListener('click', (ev) => {
      const btn = ev.target.closest('.delete-msg-btn');
      if (!btn) return;
      const idx = parseInt(btn.getAttribute('data-msg-index'), 10);
      if (isNaN(idx) || activeId == null) return;
      const threads = getThreads();
      const tIndex = threads.findIndex(x => x.id === activeId);
      if (tIndex >= 0) {
        threads[tIndex].messages.splice(idx, 1);
        setThreads(threads);
        renderMessages(activeId);
      }
    });

    // Delete entire thread
    const delThreadBtn = document.getElementById('deleteThreadBtn');
    if (delThreadBtn) {
      delThreadBtn.addEventListener('click', () => {
        if (!activeId) return;
        const threads = getThreads();
        const idx = threads.findIndex(x => x.id === activeId);
        if (idx >= 0) {
          threads.splice(idx, 1);
          setThreads(threads);
          // Re-open inbox to refresh
          closePanel();
          renderInbox();
        }
      });
    }
  }

  const profileMenu = document.getElementById('profileMenu');
  profileMenu?.querySelectorAll('[data-panel]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = btn.getAttribute('data-panel');
      if (p === 'inbox') {
        renderInbox();
      }
      if (p === 'userProfile') {
        const u = getUserBySession(session) || {};
        openPanel({
          title: 'User Profile',
          sub: 'Manage your information',
          bodyHTML: `
            <form id="userProfileForm" class="form">
              <div class="field"><label>Email</label><input id="pfEmail" type="email" value="${u.email || ''}" /></div>
              <div class="field"><label>University</label><input id="pfUni" type="text" value="${u.university || ''}" /></div>
              <div class="field-inline">
                <div class="field"><label>Total Meals</label><input id="pfMeals" type="number" min="0" step="1" value="${u.totalMeals || 0}" /></div>
                <div class="field"><label>Plan Expiration</label><input id="pfExp" type="date" value="${u.expiration || ''}" /></div>
              </div>
              <button type="submit" class="btn btn-primary">Save</button>
            </form>
          `
        });
        document.getElementById('userProfileForm').addEventListener('submit', (e) => {
          e.preventDefault();
          const updatedEmail = String(document.getElementById('pfEmail').value || '').trim();
          const updated = {
            email: updatedEmail,
            university: String(document.getElementById('pfUni').value || '').trim(),
            totalMeals: Number(document.getElementById('pfMeals').value || 0),
            expiration: String(document.getElementById('pfExp').value || '')
          };
          const users = loadUsers();
          const prevEmail = email;
          if (updatedEmail !== prevEmail) {
            delete users[prevEmail];
            const existing = JSON.parse(localStorage.getItem('mpa_session') || sessionStorage.getItem('mpa_session') || '{}');
            const s = JSON.stringify({ email: updatedEmail, ts: Date.now() });
            if (existing && localStorage.getItem('mpa_session')) localStorage.setItem('mpa_session', s);
            else sessionStorage.setItem('mpa_session', s);
          }
          users[updatedEmail] = { ...(users[updatedEmail] || {}), ...updated, password: (users[updatedEmail]?.password || users[prevEmail]?.password || '') };
          localStorage.setItem('mpa_users', JSON.stringify(users));
          localStorage.setItem('mpa_user', JSON.stringify({ ...updated, ts: Date.now() }));
          showToast('Profile saved.');
          closePanel();
          window.location.reload();
        });
      }
      if (p === 'changeAccount') {
        openPanel({
          title: 'Change Account',
          sub: 'Switch between saved sign-ins',
          bodyHTML: `
            <div class="sub">Use your browser credential manager or sign out and sign back in with a different email.</div>
            <button id="quickSignOut" class="btn btn-outline">Sign Out Now</button>
          `
        });
        document.getElementById('quickSignOut').addEventListener('click', () => {
          clearSession();
          showToast('Signed out.');
          setTimeout(() => { window.location.href = 'index.html'; }, 600);
        });
      }
      if (p === 'generateReport') {
        const totalMealsR = Number(currentUser.totalMeals || 0);
        const dLeftR = daysUntil(currentUser.expiration);
        const termDaysR = 112;
        let usedTotalR = 0;
        let remainingR = 0;
        if (totalMealsR > 0 && dLeftR !== null && dLeftR > 0) {
          const elapsedRatioR = Math.min(1, Math.max(0, (termDaysR - dLeftR) / termDaysR));
          usedTotalR = Math.round(totalMealsR * elapsedRatioR);
          remainingR = Math.max(0, totalMealsR - usedTotalR);
        }
        const avgPerDayR = totalMealsR > 0 ? totalMealsR / termDaysR : 0;
        const thisWeekUsedR = Math.max(0, Math.round(avgPerDayR * 7 + (Math.random() * 3 - 1)));
        const lastWeekUsedR = Math.max(0, thisWeekUsedR + Math.round(Math.random() * 4 - 2));
        const trendPctR = lastWeekUsedR > 0 ? Math.round(((thisWeekUsedR - lastWeekUsedR) / lastWeekUsedR) * 100) : 0;
        const wastePctR = remainingR > 0 && dLeftR !== null && dLeftR > 0 ? Math.max(0, Math.min(100, Math.round((remainingR / Math.max(1, dLeftR)) * 8))) : 0;
        const listMeals = JSON.parse(localStorage.getItem(`mpa_meal_offers_${currentUser.university || 'GLOBAL'}`) || '[]');
        const listItems = JSON.parse(localStorage.getItem(`mpa_item_offers_${currentUser.university || 'GLOBAL'}`) || '[]');
        const report = {
          email,
          university: currentUser.university || '',
          snapshotAt: new Date().toISOString(),
          totals: { remaining: remainingR, usedTotal: usedTotalR, thisWeekUsed: thisWeekUsedR, lastWeekUsed: lastWeekUsedR, trendPct: trendPctR, wastePct: wastePctR },
          marketplace: { mealOffers: listMeals.length, itemOffers: listItems.length }
        };
        openPanel({
          title: 'Generate Report',
          sub: 'Download a JSON snapshot of your current stats',
          bodyHTML: `
            <pre style="white-space:pre-wrap;background:#0f141f;border:1px solid #1c2433;border-radius:12px;padding:12px;">${JSON.stringify(report, null, 2)}</pre>
            <button id="downloadReport" class="btn btn-primary">Download JSON</button>
          `
        });
        document.getElementById('downloadReport').addEventListener('click', () => {
          const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = 'meal-dashboard-report.json';
          a.click();
          URL.revokeObjectURL(url);
        });
      }

      // Open meal usage history panel
      if (p === 'usageHistory') {
        // Read usage logs from local storage for current user
        const usageKeyForProfile = `mpa_usage_${email}`;
        const logs = readJSON(usageKeyForProfile, []);
        // Build list items sorted by most recent
        let body = '';
        if (!logs || logs.length === 0) {
          body = '<div class="sub">No meal usage recorded yet.</div>';
        } else {
          const sorted = logs.slice().sort((a, b) => b.ts - a.ts);
          body = '<ul class="list small-list">';
          sorted.forEach(l => {
            const dt = new Date(l.ts);
            const label = `${l.meals} meal${l.meals > 1 ? 's' : ''} on ${dt.toLocaleDateString()} ${dt.toLocaleTimeString()}`;
            body += `<li>${label}</li>`;
          });
          body += '</ul>';
        }
        openPanel({ title: 'Meal Usage History', sub: 'Your past meal deductions', bodyHTML: body });
      }
    });
  });

  function refreshAllViews() {
    const listMeals = readJSON(mealsKey, []);
    const listItems = readJSON(itemsKey, []);
    renderBestMeals(listMeals);
    renderBestItems(listItems);
    renderMealTable(listMeals);
    renderItemsTable(listItems);
    renderMyListings(listMeals, listItems);
    ensureInboxBadge();

    // After updating lists, recompute average recovered savings. This uses mealPriceMap loaded from backend.
    computeAvgRecovered();
  }

  mealSearch?.addEventListener('input', refreshAllViews);
  itemSearch?.addEventListener('input', refreshAllViews);

  refreshAllViews();

  // Load meal price definitions for the current user's campus to compute savings. This will update the waste summary with average savings.
  loadMealPrices();
});


(function(){
  try {
    const email = (localStorage.getItem('mpa_user') ? JSON.parse(localStorage.getItem('mpa_user')).email : null) 
                  || (JSON.parse(localStorage.getItem('mpa_session')||'{}').email) || '';
    const avatarEl = document.getElementById('avatarInitials');
    if (avatarEl) {
      const parts = (email || '').split('@')[0].split(/[._-]+/).filter(Boolean);
      let initials = '';
      if (parts.length >= 2) initials = (parts[0][0] + parts[1][0]).toUpperCase();
      else if (parts.length === 1) initials = parts[0].slice(0,2).toUpperCase();
      else initials = (email ? email[0] : 'U').toUpperCase();
      avatarEl.textContent = initials;
    }
  } catch(e){}
})();
