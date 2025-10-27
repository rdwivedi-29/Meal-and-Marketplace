// Admin login page script
const API_BASE = (window.API_BASE || window.location.origin);

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('adminLoginForm');
  const err = document.getElementById('loginError');

  function setError(msg) {
    if (err) {
      err.textContent = msg;
      err.hidden = false;
    }
  }

  function clearError() {
    if (err) {
      err.hidden = true;
    }
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    clearError();
    
    const email = (document.getElementById('adminEmail').value || '').trim();
    const password = (document.getElementById('adminPassword').value || '').trim();
    
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }
    
    try {
      // Show loading state
      const submitBtn = form.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.textContent = 'Signing in...';
      submitBtn.disabled = true;

      // Attempt to authenticate using the regular auth/login endpoint
      const resp = await fetch(API_URL + '/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, remember: true })
      });
      
      if (!resp.ok) {
        setError('Invalid email or password.');
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
        return;
      }
      
      const data = await resp.json();
      
      // Verify this is actually the admin user
      if (email !== "admin@dinemarketplace.com") {
        setError('Admin access required. Please use admin credentials.');
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
        return;
      }
      
      // Store the admin session with token
      const session = { 
        email, 
        token: data.token,
        timestamp: new Date().toISOString()
      };
      localStorage.setItem('mpa_admin_session', JSON.stringify(session));
      
      // Redirect to admin dashboard
      window.location.href = 'admin.html';
      
    } catch (e) {
      setError('Network error while signing in. Please check if the server is running.');
      const submitBtn = form.querySelector('button[type="submit"]');
      submitBtn.textContent = 'Sign In';
      submitBtn.disabled = false;
    }
  });

  // Clear error when user starts typing
  document.getElementById('adminEmail').addEventListener('input', clearError);
  document.getElementById('adminPassword').addEventListener('input', clearError);

  // Auto-focus on email field
  document.getElementById('adminEmail').focus();

  // Check if already logged in
  try {
    const existingSession = localStorage.getItem('mpa_admin_session');
    if (existingSession) {
      const session = JSON.parse(existingSession);
      if (session.email === "admin@dinemarketplace.com" && session.token) {
        // Verify the token is still valid
        fetch(API_URL + '/me', {
          headers: { 'Authorization': 'Bearer ' + session.token }
        })
        .then(res => {
          if (res.ok) {
            window.location.href = 'admin.html';
          }
        })
        .catch(() => {
          // Token invalid, stay on login page
        });
      }
    }
  } catch (e) {
    // Ignore errors
  }
});