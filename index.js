// Base URL for the backend API. When serving the frontend from a static server
// (for example with `python -m http.server` on port 5500), using relative
// paths like `/auth/signup` will incorrectly send requests back to the
// frontend server. Define an explicit API base so all requests go to the
// FastAPI backend (typically running on port 8000).
const API_BASE = (window.API_BASE || window.location.origin);

const mobileToggle = document.querySelector('.hamburger');
const mobileMenu = document.getElementById('mobileMenu');
const yearSpan = document.getElementById('year');
const toast = document.getElementById('toast');
const authModal = document.getElementById('authModal');
const authForm = document.getElementById('authForm');
const authTitle = document.getElementById('authTitle');
const authSubtitle = document.getElementById('authSubtitle');
const authSubmit = document.getElementById('authSubmit');
const authModeInput = document.getElementById('authMode');
const rememberMe = document.getElementById('rememberMe');

// Elements for meal distribution selection (signup only)
const mealDistributionEl = document.getElementById('authMealDistribution');
const weeklyMealsField = document.getElementById('weeklyMealsField');
if (mealDistributionEl && weeklyMealsField) {
  mealDistributionEl.addEventListener('change', () => {
    const v = mealDistributionEl.value || 'semester';
    if (v === 'weekly') weeklyMealsField.style.display = '';
    else weeklyMealsField.style.display = 'none';
  });
}

yearSpan.textContent = new Date().getFullYear();

  // Deprecated: local user storage is no longer used. All user data is persisted on the backend.
  function loadUsers() { return {}; }
  function saveUsers(map) { /* no‑op */ }
function writeSession(session, persist) {
  const s = JSON.stringify(session);
  if (persist) localStorage.setItem('mpa_session', s);
  else sessionStorage.setItem('mpa_session', s);
}
function readSession() {
  const l = localStorage.getItem('mpa_session');
  if (l) return JSON.parse(l);
  const s = sessionStorage.getItem('mpa_session');
  return s ? JSON.parse(s) : null;
}
function clearSession() {
  localStorage.removeItem('mpa_session');
  sessionStorage.removeItem('mpa_session');
}
function setCurrentUserProfile(profile) {
  localStorage.setItem('mpa_user', JSON.stringify({ ...profile, ts: Date.now() }));
}

function showMobileMenu(show) {
  if (show) {
    mobileMenu.hidden = false;
    mobileToggle.setAttribute('aria-expanded', 'true');
  } else {
    mobileMenu.hidden = true;
    mobileToggle.setAttribute('aria-expanded', 'false');
  }
}
if (mobileToggle) {
  mobileToggle.addEventListener('click', () => {
    const expanded = mobileToggle.getAttribute('aria-expanded') === 'true';
    showMobileMenu(!expanded);
  });
}
document.querySelectorAll('.mobile-link').forEach(a => {
  a.addEventListener('click', () => showMobileMenu(false));
});

function openAuth(mode) {
  const m = mode === 'login' ? 'login' : 'signup';
  authModeInput.value = m;
  if (m === 'login') {
    authTitle.textContent = 'Welcome back';
    authSubtitle.textContent = 'Sign in to continue';
    authSubmit.textContent = 'Sign In';
    document.querySelectorAll('.signup-only').forEach(el => el.classList.add('hidden'));
  } else {
    authTitle.textContent = 'Create your account';
    authSubtitle.textContent = 'Join your campus and start saving today.';
    authSubmit.textContent = 'Create Account';
    document.querySelectorAll('.signup-only').forEach(el => el.classList.remove('hidden'));
  }
  authModal.removeAttribute('hidden');
  authModal.setAttribute('aria-hidden', 'false');
  document.getElementById('authEmail').focus();
}
function closeAuth() {
  authModal.setAttribute('hidden', 'true');
  authModal.setAttribute('aria-hidden', 'true');
}
document.querySelectorAll('[data-open-auth]').forEach(btn => {
  btn.addEventListener('click', e => openAuth(e.currentTarget.getAttribute('data-open-auth')));
});
document.querySelectorAll('#authModal [data-close]').forEach(el => {
  el.addEventListener('click', closeAuth);
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && authModal && !authModal.hasAttribute('hidden')) closeAuth();
});
authModal.addEventListener('click', e => {
  if (e.target.classList.contains('modal-backdrop')) closeAuth();
});
document.querySelectorAll('[data-switch-auth]').forEach(btn => {
  btn.addEventListener('click', e => openAuth(e.currentTarget.getAttribute('data-switch-auth')));
});

function showToast(msg, timeout = 2400) {
  toast.textContent = msg;
  toast.hidden = false;
  window.clearTimeout(showToast._t);
  showToast._t = window.setTimeout(() => { toast.hidden = true; }, timeout);
}

authForm.addEventListener('submit', e => {
  e.preventDefault();
  const fd = new FormData(authForm);
  const mode = String(fd.get('mode') || 'signup');
  const email = String(fd.get('email') || '').trim();
  const password = String(fd.get('password') || '');
  const university = String(fd.get('university') || '').trim();
  const totalMeals = Number(fd.get('totalMeals') || 0);
  const expiration = String(fd.get('expiration') || '');
  const mealDistribution = String(fd.get('mealDistribution') || 'semester');
  const weeklyMeals = Number(fd.get('weeklyMeals') || 0);
  const persist = !!(rememberMe && rememberMe.checked);
  if (!email || !password) {
    showToast('Please enter your email and password.');
    return;
  }
  // Do not load or persist users locally; signup always goes through the backend.
  const users = {};
    if (mode === 'signup') {
    if (!university || !totalMeals || !expiration) {
      showToast('Please complete all sign-up fields.');
      return;
    }
    // Send signup to backend and then log the user in. Use API_BASE so the request
    // targets the FastAPI server. We do not persist users locally during signup to ensure
    // all data is saved remotely. A minimal profile is stored after fetching /me.
    (async () => {
      try {
        const signupResp = await fetch(`${API_BASE}/auth/signup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: email,
            password: password,
            university: university,
            total_meals: totalMeals,
            expires_on: expiration,
            meal_distribution: mealDistribution,
            weekly_meals: mealDistribution === 'weekly' ? weeklyMeals : null
          })
        });
        if (!signupResp.ok) {
          const err = await signupResp.text();
          showToast('Signup failed: ' + err);
          return;
        }
      } catch (err) {
        showToast('Signup failed. Please try again.');
        return;
      }
      try {
        // Log in to obtain a JWT token
        const resp = await fetch(`${API_BASE}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, password: password, remember: persist })
        });
        if (resp.ok) {
          const data = await resp.json();
          writeSession({ email, token: data.token, ts: Date.now() }, persist);
          try {
            const meResp = await fetch(`${API_BASE}/me`, {
              headers: { Authorization: 'Bearer ' + data.token }
            });
            if (meResp.ok) {
              const me = await meResp.json();
              setCurrentUserProfile({
                email: me.email,
                university: me.university,
                totalMeals: me.total_meals,
                expiration: me.expires_on,
                mealDistribution: me.meal_distribution,
                weeklyMeals: me.weekly_meals
              });
            }
          } catch (err) {
            // Ignore profile fetch errors
          }
        } else {
          showToast('Login after signup failed.');
          return;
        }
      } catch (err) {
        showToast('Login after signup failed.');
        return;
      }
      window.location.href = 'dashboard.html';
    })();
    return;
  }
  // Login flow: authenticate only via the backend. Local fallback has been removed
  (async () => {
    try {
      const resp = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email, password: password, remember: persist })
      });
      if (resp.ok) {
        const data = await resp.json();
        writeSession({ email, token: data.token, ts: Date.now() }, persist);
        try {
          const meResp = await fetch(`${API_BASE}/me`, {
            headers: { Authorization: 'Bearer ' + data.token }
          });
          if (meResp.ok) {
            const me = await meResp.json();
            setCurrentUserProfile({
              email: me.email,
              university: me.university,
              totalMeals: me.total_meals,
              expiration: me.expires_on,
              mealDistribution: me.meal_distribution,
              weeklyMeals: me.weekly_meals
            });
          }
        } catch (err) {
          // ignore profile fetch errors
        }
        window.location.href = 'dashboard.html';
        return;
      }
    } catch (err) {
      // network or other errors
    }
    showToast('Invalid email or password.');
  })();
});

document.getElementById('googleAuth').addEventListener('click', () => {
  showToast('Google auth is not configured in this demo.');
});

document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const id = a.getAttribute('href').slice(1);
    if (!id) return;
    const el = document.getElementById(id);
    if (el) {
      e.preventDefault();
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

document.querySelectorAll('[data-open-request="campus"]').forEach(btn => {
  btn.addEventListener('click', () => {
    openAuth('signup');
    document.getElementById('authUniversity').focus();
  });
});

(function autoRestore() {
  const session = readSession();
  if (session && session.email) {
    window.location.href = 'dashboard.html';
  }
})();

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const now = new Date();
  const exp = new Date(dateStr);
  const ms = exp.getTime() - now.getTime();
  return Math.ceil(ms / 86400000);
}
function getSession() {
  const s = readSession();
  return s || null;
}
function toggleHeroBySession() {
  const session = getSession();
  const preview = document.getElementById('cardPreview');
  const balance = document.getElementById('cardBalance');
  if (!preview || !balance) return;
  if (!session) {
    preview.classList.remove('hidden');
    preview.removeAttribute('hidden');
    balance.classList.add('hidden');
    balance.setAttribute('hidden', 'true');
    return;
  }
  preview.classList.add('hidden');
  preview.setAttribute('hidden', 'true');
  balance.classList.remove('hidden');
  balance.removeAttribute('hidden');
  const users = loadUsers();
  const u = users[session.email] || JSON.parse(localStorage.getItem('mpa_user') || '{}');
  const total = Number(u.totalMeals || 0);
  const dLeft = daysUntil(u.expiration);
  let used = 0;
  let remaining = 0;
  if (total > 0 && dLeft !== null && dLeft > 0) {
    const termDays = 112;
    const elapsedRatio = Math.min(1, Math.max(0, (termDays - dLeft) / termDays));
    used = Math.round(total * elapsedRatio);
    remaining = Math.max(0, total - used);
  }
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  const atRisk = total > 0 && dLeft !== null && dLeft <= 7 ? Math.max(0, Math.min(remaining, Math.ceil(remaining * 0.4))) : 0;
  document.getElementById('balanceBar').style.width = pct + '%';
  document.getElementById('usedLabel').textContent = 'Used: ' + used;
  document.getElementById('remLabel').textContent = 'Remaining: ' + remaining;
  document.getElementById('riskSub').textContent = atRisk > 0 ? 'Predicted ' + atRisk + ' meals expiring in ' + dLeft + ' days' : 'No meals at risk this week';
  document.getElementById('topDeal').textContent = '$' + (7 + Math.round(Math.random() * 6) / 10).toFixed(2);
  document.getElementById('matchesVal').textContent = String(Math.floor(Math.random() * 4));
  document.getElementById('trendVal').textContent = (Math.random() > 0.5 ? '+' : '-') + Math.floor(Math.random() * 18) + '%';
}
toggleHeroBySession();

// Fetch and display public comments on home page
(function loadPublicComments(){
  const listEl = document.getElementById('publicComments');
  if (!listEl) return;
  fetch(`${API_BASE}/comments`)
    .then(r => r.ok ? r.json() : [])
    .then(arr => {
      listEl.innerHTML = '';
      if (!arr || arr.length === 0) {
        const li = document.createElement('li');
        li.textContent = 'No comments yet.';
        listEl.appendChild(li);
        return;
      }
      // Show a single random comment on the home page to avoid clutter and add variety
      const idx = Math.floor(Math.random() * arr.length);
      const c = arr[idx];
      const li = document.createElement('li');
      const dt = new Date(c.created_at);
      li.innerHTML = `<p>"${c.body}"</p><div class="sub">${c.university || ''} • ${dt.toLocaleDateString()}</div>`;
      listEl.appendChild(li);
    })
    .catch(() => {});
})();
