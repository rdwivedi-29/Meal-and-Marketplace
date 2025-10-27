// Admin dashboard script
(function() {
  const API_BASE = (window.API_BASE || window.location.origin);
  
  function readAdminSession() {
    try {
      const raw = localStorage.getItem('mpa_admin_session');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
  
  function clearAdminSession() {
    localStorage.removeItem('mpa_admin_session');
  }

  function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 16px;
      border-radius: 8px;
      color: white;
      font-weight: 500;
      z-index: 10000;
      max-width: 400px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      transition: opacity 0.3s ease;
      opacity: 0;
    `;
    
    if (type === 'success') {
      notification.style.background = '#10b981';
    } else if (type === 'error') {
      notification.style.background = '#ef4444';
    } else {
      notification.style.background = '#3b82f6';
    }
    
    notification.textContent = message;
    document.body.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
      notification.style.opacity = '1';
    }, 10);
    
    // Remove after 4 seconds
    setTimeout(() => {
      notification.style.opacity = '0';
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300);
    }, 4000);
  }

  const session = readAdminSession() || {};
  const token = session.token || '';
  const email = session.email || '';
  const adminEmailEl = document.getElementById('adminEmail');
  const signOutBtn = document.getElementById('adminSignOut');
  const container = document.getElementById('adminContent');

  // Redirect to admin login if no token is present or not admin user
  if (!token || email !== "admin@dinemarketplace.com") {
    showNotification('Please sign in as admin to view this page.', 'error');
    setTimeout(() => {
      window.location.href = 'admin-login.html';
    }, 1000);
    return;
  }
  
  if (adminEmailEl) adminEmailEl.textContent = email || 'Admin';
  if (signOutBtn) {
    signOutBtn.addEventListener('click', () => {
      clearAdminSession();
      showNotification('Signed out successfully.', 'success');
      setTimeout(() => {
        window.location.href = 'admin-login.html';
      }, 500);
    });
  }

  // Utility to fetch data with the auth token
  async function fetchAuth(path) {
    const url = API_BASE + path;
    const res = await fetch(url, {
      headers: { 
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json'
      }
    });
    
    if (res.status === 401 || res.status === 403) {
      clearAdminSession();
      showNotification('Session expired. Please login again.', 'error');
      setTimeout(() => {
        window.location.href = 'admin-login.html';
      }, 1000);
      throw new Error('Authentication failed');
    }
    
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errorText}`);
    }
    
    return res.json();
  }

  async function loadData() {
    try {
      container.innerHTML = `
        <div style="text-align: center; padding: 40px; color: var(--muted);">
          <div style="font-size: 18px; margin-bottom: 10px;">Loading admin data...</div>
          <div style="font-size: 14px;">Please wait while we fetch all records</div>
        </div>
      `;
      
      // Fetch all admin data with error handling for each endpoint
      const [
        users, 
        meals, 
        items, 
        transactions, 
        messages, 
        comments, 
        mealprices, 
        usageAdjustments,
        activities
      ] = await Promise.all([
        fetchAuth('/admin/users').catch(e => { 
          console.error('Users error:', e); 
          showNotification('Failed to load users data', 'error');
          return []; 
        }),
        fetchAuth('/admin/offers/meals').catch(e => { 
          console.error('Meals error:', e); 
          showNotification('Failed to load meal offers', 'error');
          return []; 
        }),
        fetchAuth('/admin/offers/items').catch(e => { 
          console.error('Items error:', e); 
          showNotification('Failed to load item offers', 'error');
          return []; 
        }),
        fetchAuth('/admin/transactions').catch(e => { 
          console.error('Transactions error:', e); 
          showNotification('Failed to load transactions', 'error');
          return []; 
        }),
        fetchAuth('/admin/messages').catch(e => { 
          console.error('Messages error:', e); 
          showNotification('Failed to load messages', 'error');
          return []; 
        }),
        fetchAuth('/admin/comments').catch(e => { 
          console.error('Comments error:', e); 
          showNotification('Failed to load comments', 'error');
          return []; 
        }),
        fetchAuth('/admin/mealprices').catch(e => { 
          console.error('Meal prices error:', e); 
          showNotification('Failed to load meal prices', 'error');
          return []; 
        }),
        fetchAuth('/admin/usage-adjustments').catch(e => { 
          console.error('Usage adjustments error:', e); 
          showNotification('Failed to load usage adjustments', 'error');
          return []; 
        }),
        fetchAuth('/admin/activities').catch(e => { 
          console.error('Activities error:', e); 
          showNotification('Failed to load activities', 'error');
          return []; 
        })
      ]);

      renderTables({ 
        users, 
        meals, 
        items, 
        transactions, 
        messages, 
        comments, 
        mealprices, 
        usageAdjustments,
        activities 
      });
      
      showNotification(`Loaded ${users.length} users, ${meals.length} meal offers, ${items.length} item offers`, 'success');
      
    } catch (err) {
      console.error('Admin load error:', err);
      if (container) {
        container.innerHTML = `
          <div style="color:#ef4444; padding: 40px; text-align: center; background: var(--panel); border-radius: 12px; border: 1px solid var(--border);">
            <h3 style="margin-bottom: 16px;">Failed to load admin data</h3>
            <p style="margin-bottom: 20px; color: var(--muted);">${err.message}</p>
            <div style="display: flex; gap: 12px; justify-content: center;">
              <button onclick="location.reload()" class="btn btn-primary">Retry</button>
              <button onclick="clearAdminSession(); window.location.href='admin-login.html'" class="btn btn-outline">Re-login</button>
            </div>
          </div>
        `;
      }
    }
  }

  function renderTables(data) {
    const { 
      users, 
      meals, 
      items, 
      transactions, 
      messages, 
      comments, 
      mealprices, 
      usageAdjustments,
      activities 
    } = data;
    
    // Build a map of userId -> email for cross referencing
    const idToEmail = {};
    users.forEach(u => { idToEmail[u.id] = u.email; });

    // Helper to build table HTML
    function buildTable(title, headers, rows) {
      if (!rows || rows.length === 0) {
        return `
          <div class="card">
            <h4 class="h5">${title}</h4>
            <div style="padding: 20px; text-align: center; color: var(--muted);">
              No records found
            </div>
          </div>
        `;
      }
      
      let html = '<div class="card">';
      html += `<h4 class="h5">${title} <span style="color: var(--muted); font-size: 14px;">(${rows.length} records)</span></h4>`;
      html += '<div class="table-scroll"><table class="table"><thead><tr>';
      headers.forEach(h => { html += `<th>${h}</th>`; });
      html += '</tr></thead><tbody>';
      
      rows.forEach(r => {
        html += '<tr>';
        r.forEach(val => { 
          // Handle null/undefined values and escape HTML
          const displayVal = val === null || val === undefined ? '' : 
                            String(val).replace(/</g, '&lt;').replace(/>/g, '&gt;');
          html += `<td title="${displayVal}">${displayVal}</td>`; 
        });
        html += '</tr>';
      });
      
      html += '</tbody></table></div></div>';
      return html;
    }

    let html = '';
    
    // Users
    const userRows = users.map(u => [
      u.id,
      u.email,
      u.university || '-',
      u.total_meals,
      u.meal_distribution,
      u.weekly_meals,
      u.expires_on,
      new Date(u.created_at).toLocaleString()
    ]);
    html += buildTable('Users', ['ID','Email','University','Total Meals','Plan','Weekly Meals','Expires','Created'], userRows);

    // Meal offers
    const mealRows = meals.map(o => [
      o.id,
      idToEmail[o.seller_id] || o.seller_id,
      o.meals,
      o.location,
      o.meal_type || 'lunch',
      `$${o.price?.toFixed(2) || '0.00'}`,
      o.status,
      o.accepted_by_id ? (idToEmail[o.accepted_by_id] || o.accepted_by_id) : '-',
      new Date(o.created_at).toLocaleString()
    ]);
    html += buildTable('Meal Offers', ['ID','Seller','Meals','Location','Type','Price','Status','Accepted By','Posted'], mealRows);

    // Item offers
    const itemRows = items.map(it => [
      it.id,
      idToEmail[it.seller_id] || it.seller_id,
      it.name,
      it.category,
      `$${it.price?.toFixed(2) || '0.00'}`,
      `${it.discount || 0}%`,
      it.status,
      it.accepted_by_id ? (idToEmail[it.accepted_by_id] || it.accepted_by_id) : '-',
      new Date(it.created_at).toLocaleString()
    ]);
    html += buildTable('Item Offers', ['ID','Seller','Name','Category','Price','Discount','Status','Accepted By','Posted'], itemRows);

    // Transactions
    const txnRows = transactions.map(t => [
      t.id,
      t.kind,
      t.listing_id,
      idToEmail[t.seller_id] || t.seller_id,
      idToEmail[t.buyer_id] || t.buyer_id,
      new Date(t.created_at).toLocaleString()
    ]);
    html += buildTable('Transactions', ['ID','Kind','Listing','Seller','Buyer','Created'], txnRows);

    // Messages
    const msgRows = messages.map(m => [
      m.id,
      m.thread_id || '-',
      m.kind || '-',
      m.listing_id || '-',
      m.from_email || '-',
      m.body ? (m.body.length > 50 ? m.body.substring(0, 50) + '...' : m.body) : '-',
      new Date(m.created_at).toLocaleString()
    ]);
    html += buildTable('Messages', ['ID','Thread','Kind','Listing','From','Message','When'], msgRows);

    // Comments
    const commentRows = comments.map(c => [
      c.id,
      c.user_id ? (idToEmail[c.user_id] || c.user_id) : 'Anonymous',
      c.university || '-',
      c.body ? (c.body.length > 50 ? c.body.substring(0, 50) + '...' : c.body) : '-',
      new Date(c.created_at).toLocaleString()
    ]);
    html += buildTable('Comments', ['ID','User','University','Comment','When'], commentRows);

    // Meal prices
    const priceRows = mealprices.map(mp => [
      mp.id,
      mp.university,
      mp.meal_type,
      `$${mp.price?.toFixed(2) || '0.00'}`,
      new Date(mp.created_at).toLocaleString()
    ]);
    html += buildTable('Meal Prices', ['ID','University','Type','Price','Created'], priceRows);

    // Usage adjustments
    const usageRows = usageAdjustments.map(u => [
      u.id,
      idToEmail[u.user_id] || u.user_id,
      u.meals_used_delta,
      u.note || '-',
      new Date(u.created_at).toLocaleString()
    ]);
    html += buildTable('Usage Adjustments', ['ID','User','Delta','Note','When'], usageRows);

    // Activities
    const activityRows = activities.map(a => [
      a.id,
      idToEmail[a.user_id] || a.user_id || 'System',
      a.action,
      a.details ? (a.details.length > 50 ? a.details.substring(0, 50) + '...' : a.details) : '-',
      new Date(a.created_at).toLocaleString()
    ]);
    html += buildTable('Activities', ['ID','User','Action','Details','When'], activityRows);

    // Meal price form card
    html += `
      <div class="card">
        <h4 class="h5">Set Meal Price</h4>
        <p style="color: var(--muted); margin-bottom: 16px; font-size: 14px;">
          Set the base price for different meal types at universities
        </p>
        <form id="mealPriceForm" class="form" style="max-width:500px;">
          <div class="field">
            <label>University</label>
            <input id="mpUniversity" type="text" placeholder="e.g. IIT Chicago" required />
          </div>
          <div class="field">
            <label>Meal Type</label>
            <select id="mpMealType" required>
              <option value="">Select meal type</option>
              <option value="breakfast">Breakfast</option>
              <option value="lunch">Lunch</option>
              <option value="dinner">Dinner</option>
            </select>
          </div>
          <div class="field">
            <label>Price (USD)</label>
            <input id="mpPrice" type="number" step="0.01" min="0" placeholder="10.00" required />
          </div>
          <button type="submit" class="btn btn-primary">Save Meal Price</button>
        </form>
      </div>
    `;

    // Refresh button
    html += `
      <div class="card" style="text-align: center;">
        <button id="refreshData" class="btn btn-primary" style="margin-right: 12px;">Refresh All Data</button>
        <button id="exportData" class="btn btn-outline">Export Data</button>
      </div>
    `;

    if (container) container.innerHTML = html;

    // Attach submit handler for meal price form
    const form = document.getElementById('mealPriceForm');
    if (form) {
      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const uni = String(document.getElementById('mpUniversity').value || '').trim();
        const type = String(document.getElementById('mpMealType').value || '').trim();
        const price = Number(document.getElementById('mpPrice').value || 0);
        
        if (!uni || !type || price <= 0) {
          showNotification('Please provide university, type and valid price.', 'error');
          return;
        }
        
        try {
          const submitBtn = form.querySelector('button[type="submit"]');
          const originalText = submitBtn.textContent;
          submitBtn.textContent = 'Saving...';
          submitBtn.disabled = true;

          const resp = await fetch(API_BASE + '/admin/mealprices', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + token,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
              university: uni, 
              meal_type: type, 
              price: price 
            })
          });
          
          if (!resp.ok) {
            const errorText = await resp.text();
            throw new Error(errorText);
          }
          
          const result = await resp.json();
          showNotification(`Meal price for ${uni} ${type} saved successfully!`, 'success');
          form.reset();
          loadData(); // Reload data to show the new price
          
        } catch (err) {
          showNotification('Failed to save meal price: ' + err.message, 'error');
        } finally {
          const submitBtn = form.querySelector('button[type="submit"]');
          submitBtn.textContent = 'Save Meal Price';
          submitBtn.disabled = false;
        }
      });
    }

    // Refresh button handler
    const refreshBtn = document.getElementById('refreshData');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        refreshBtn.textContent = 'Refreshing...';
        refreshBtn.disabled = true;
        loadData();
        setTimeout(() => {
          refreshBtn.textContent = 'Refresh All Data';
          refreshBtn.disabled = false;
        }, 2000);
      });
    }

    // Export button handler
    const exportBtn = document.getElementById('exportData');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const exportData = {
          timestamp: new Date().toISOString(),
          users,
          meals,
          items,
          transactions,
          messages,
          comments,
          mealprices,
          usageAdjustments,
          activities
        };
        
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `admin-export-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showNotification('Data exported successfully!', 'success');
      });
    }
  }

  // Load data when page loads
  loadData();

  // Auto-refresh every 5 minutes
  setInterval(() => {
    if (document.visibilityState === 'visible') {
      loadData();
    }
  }, 300000);
})();