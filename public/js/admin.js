const { createClient } = supabase;
const sb = createClient(window.PGDS_CONFIG.SUPABASE_URL, window.PGDS_CONFIG.SUPABASE_ANON_KEY);

let currentUser = null;
let currentView = 'pending-users';

async function init() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return (window.location.href = '/');
  const { data: profile } = await sb.from('pgds_profiles').select('*').eq('id', session.user.id).single();
  if (!profile || profile.role !== 'admin' || profile.status !== 'approved') {
    await sb.auth.signOut();
    return (window.location.href = '/');
  }
  currentUser = { ...session.user, profile };
  document.getElementById('userEmail').textContent = `${profile.full_name || profile.email} (admin)`;
  render();
  updatePendingCount();
}

async function updatePendingCount() {
  const { count } = await sb.from('pgds_profiles').select('*', { count: 'exact', head: true }).eq('status', 'pending');
  const el = document.getElementById('pendingCount');
  el.textContent = count ? `(${count})` : '';
}

async function render() {
  const content = document.getElementById('content');
  document.getElementById('msg').innerHTML = '';
  if (currentView === 'pending-users') return renderPendingUsers(content);
  if (currentView === 'users') return renderAllUsers(content);
  if (currentView === 'documents') return content.innerHTML = '<p class="empty">Documents queue coming in Phase 2 (upload + signing engine).</p>';
  if (currentView === 'signatures') return content.innerHTML = '<p class="empty">Signature manager coming in Phase 3.</p>';
}

async function renderPendingUsers(el) {
  el.innerHTML = '<p class="empty">Loading...</p>';
  const { data, error } = await sb.from('pgds_profiles').select('*').eq('status', 'pending').order('created_at', { ascending: false });
  if (error) return el.innerHTML = `<div class="msg error">${error.message}</div>`;
  if (!data.length) return el.innerHTML = '<p class="empty">No pending approvals.</p>';
  el.innerHTML = `
    <table><thead><tr>
      <th>Email</th><th>Full Name</th><th>Store #</th><th>Signed up</th><th>Actions</th>
    </tr></thead><tbody>
      ${data.map(u => `
        <tr id="row-${u.id}">
          <td>${escapeHtml(u.email)}</td>
          <td>${escapeHtml(u.full_name || '-')}</td>
          <td><input type="text" style="width:100px" id="store-${u.id}" value="${escapeHtml(u.store_number || '')}" placeholder="Store #"></td>
          <td>${new Date(u.created_at).toLocaleString()}</td>
          <td class="actions">
            <button class="success" onclick="approveUser('${u.id}')">Approve</button>
            <button class="danger" onclick="rejectUser('${u.id}')">Reject</button>
          </td>
        </tr>
      `).join('')}
    </tbody></table>
  `;
}

async function renderAllUsers(el) {
  el.innerHTML = '<p class="empty">Loading...</p>';
  const { data, error } = await sb.from('pgds_profiles').select('*').order('created_at', { ascending: false });
  if (error) return el.innerHTML = `<div class="msg error">${error.message}</div>`;
  el.innerHTML = `
    <table><thead><tr>
      <th>Email</th><th>Full Name</th><th>Store #</th><th>Role</th><th>Status</th><th>Actions</th>
    </tr></thead><tbody>
      ${data.map(u => `
        <tr>
          <td>${escapeHtml(u.email)}</td>
          <td>${escapeHtml(u.full_name || '-')}</td>
          <td>${escapeHtml(u.store_number || '-')}</td>
          <td><span class="badge ${u.role === 'admin' ? 'urgent' : 'normal'}">${u.role}</span></td>
          <td><span class="badge ${u.status}">${u.status}</span></td>
          <td class="actions">
            ${u.status !== 'approved' ? `<button class="success" onclick="approveUser('${u.id}', true)">Approve</button>` : ''}
            ${u.status !== 'rejected' && u.id !== currentUser.id ? `<button class="danger" onclick="rejectUser('${u.id}', true)">Reject</button>` : ''}
          </td>
        </tr>
      `).join('')}
    </tbody></table>
  `;
}

async function approveUser(id, fromAllView = false) {
  const storeInput = document.getElementById(`store-${id}`);
  const storeNumber = storeInput ? storeInput.value.trim() : null;
  const patch = { status: 'approved', approved_at: new Date().toISOString(), approved_by: currentUser.id };
  if (storeNumber) patch.store_number = storeNumber;
  const { error } = await sb.from('pgds_profiles').update(patch).eq('id', id);
  if (error) return showMsg(error.message, 'error');
  showMsg('User approved.', 'success');
  render();
  updatePendingCount();
}

async function rejectUser(id, fromAllView = false) {
  const reason = prompt('Reason for rejection (optional):') || '';
  const { error } = await sb.from('pgds_profiles').update({ status: 'rejected', reject_reason: reason }).eq('id', id);
  if (error) return showMsg(error.message, 'error');
  showMsg('User rejected.', 'success');
  render();
  updatePendingCount();
}

function showMsg(text, type = 'info') {
  document.getElementById('msg').innerHTML = `<div class="msg ${type}">${text}</div>`;
  setTimeout(() => { document.getElementById('msg').innerHTML = ''; }, 4000);
}
function escapeHtml(s) { return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentView = tab.dataset.view;
    render();
  });
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await sb.auth.signOut();
  window.location.href = '/';
});

init();
