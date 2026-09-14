const { createClient } = supabase;
const sb = createClient(window.PGDS_CONFIG.SUPABASE_URL, window.PGDS_CONFIG.SUPABASE_ANON_KEY);

let currentUser = null;
let currentView = 'pending-users';
let docsFilter = 'pending';

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
  updateCounts();
}

async function updateCounts() {
  const { count: pu } = await sb.from('pgds_profiles').select('*', { count: 'exact', head: true }).eq('status', 'pending');
  document.getElementById('pendingCount').textContent = pu ? `(${pu})` : '';
  const { count: pd } = await sb.from('pgds_documents').select('*', { count: 'exact', head: true }).eq('status', 'pending');
  const el = document.getElementById('docsCount');
  if (el) el.textContent = pd ? `(${pd})` : '';
}

async function render() {
  const content = document.getElementById('content');
  document.getElementById('msg').innerHTML = '';
  if (currentView === 'pending-users') return renderPendingUsers(content);
  if (currentView === 'users') return renderAllUsers(content);
  if (currentView === 'documents') return renderDocuments(content);
  if (currentView === 'signatures') return content.innerHTML = '<p class="empty">Signature manager coming in Phase 3.</p>';
}

async function renderPendingUsers(el) {
  el.innerHTML = '<p class="empty">Loading...</p>';
  const { data, error } = await sb.from('pgds_profiles').select('*').eq('status', 'pending').order('created_at', { ascending: false });
  if (error) return el.innerHTML = `<div class="msg error">${error.message}</div>`;
  if (!data.length) return el.innerHTML = '<p class="empty">No pending approvals.</p>';
  el.innerHTML = `
    <table><thead><tr>
      <th>Email</th><th>Full Name</th><th>Store #</th><th>Store Name</th><th>Signed up</th><th>Actions</th>
    </tr></thead><tbody>
      ${data.map(u => `
        <tr id="row-${u.id}">
          <td>${escapeHtml(u.email)}</td>
          <td>${escapeHtml(u.full_name || '-')}</td>
          <td><input type="text" style="width:80px" id="store-${u.id}" value="${escapeHtml(u.store_number || '')}" placeholder="#"></td>
          <td><input type="text" style="width:180px" id="storename-${u.id}" value="${escapeHtml(u.store_name || '')}" placeholder="Store name"></td>
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
  const { data, error } = await sb.from('pgds_profiles')
    .select('*, approver:pgds_profiles!pgds_profiles_approved_by_fkey(full_name, email)')
    .order('created_at', { ascending: false });
  if (error) return el.innerHTML = `<div class="msg error">${error.message}</div>`;
  el.innerHTML = `
    <table><thead><tr>
      <th>Email</th><th>Full Name</th><th>Store #</th><th>Store Name</th><th>Role</th><th>Status</th><th>Approved By</th><th>Actions</th>
    </tr></thead><tbody>
      ${data.map(u => `
        <tr>
          <td>${escapeHtml(u.email)}</td>
          <td>${escapeHtml(u.full_name || '-')}</td>
          <td>${escapeHtml(u.store_number || '-')}</td>
          <td>${escapeHtml(u.store_name || '-')}</td>
          <td><span class="badge ${u.role === 'admin' ? 'urgent' : 'normal'}">${u.role}</span></td>
          <td><span class="badge ${u.status}">${u.status}</span></td>
          <td>${u.approver ? escapeHtml(u.approver.full_name || u.approver.email) : '-'}${u.approved_at ? `<div style="font-size:11px;color:#64748b;">${new Date(u.approved_at).toLocaleDateString()}</div>` : ''}</td>
          <td class="actions">
            ${u.status !== 'approved' ? `<button class="success" onclick="approveUser('${u.id}', true)">Approve</button>` : ''}
            ${u.status !== 'rejected' && u.id !== currentUser.id ? `<button class="danger" onclick="rejectUser('${u.id}', true)">Reject</button>` : ''}
          </td>
        </tr>
      `).join('')}
    </tbody></table>
  `;
}

async function renderDocuments(el) {
  el.innerHTML = `
    <div class="tabs" style="margin-bottom:16px">
      <div class="tab ${docsFilter==='pending'?'active':''}" data-df="pending">Pending</div>
      <div class="tab ${docsFilter==='approved'?'active':''}" data-df="approved">Approved</div>
      <div class="tab ${docsFilter==='rejected'?'active':''}" data-df="rejected">Rejected</div>
    </div>
    <div id="docsBody"><p class="empty">Loading...</p></div>
  `;
  el.querySelectorAll('.tab[data-df]').forEach(t => t.addEventListener('click', () => {
    docsFilter = t.dataset.df;
    renderDocuments(el);
  }));

  const body = el.querySelector('#docsBody');
  const { data, error } = await sb.from('pgds_documents')
    .select('*, uploader:pgds_profiles!pgds_documents_uploader_id_fkey(full_name, email, store_number, store_name)')
    .eq('status', docsFilter)
    .order('urgency', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) return body.innerHTML = `<div class="msg error">${error.message}</div>`;
  if (!data.length) return body.innerHTML = `<p class="empty">No ${docsFilter} documents.</p>`;
  body.innerHTML = `
    <table><thead><tr>
      <th>Title</th><th>Uploader</th><th>Store #</th><th>Store Name</th><th>Urgency</th><th>Uploaded</th><th>Actions</th>
    </tr></thead><tbody>
      ${data.map(d => `
        <tr>
          <td>${escapeHtml(d.title)}${d.notes ? `<div style="font-size:12px;color:#64748b;margin-top:4px;">${escapeHtml(d.notes)}</div>` : ''}</td>
          <td>${escapeHtml(d.uploader?.full_name || d.uploader?.email || '-')}</td>
          <td>${escapeHtml(d.store_number || d.uploader?.store_number || '-')}</td>
          <td>${escapeHtml(d.uploader?.store_name || '-')}</td>
          <td><span class="badge ${d.urgency}">${d.urgency}</span></td>
          <td>${new Date(d.created_at).toLocaleString()}</td>
          <td class="actions">
            <button class="secondary" onclick="viewDoc('${d.status === 'approved' && d.signed_file_path ? 'pgds-signed' : (d.status === 'rejected' ? 'pgds-rejected' : 'pgds-pending')}','${d.status === 'approved' && d.signed_file_path ? d.signed_file_path : d.original_file_path}')">View</button>
            ${d.status === 'pending' ? `<button class="success" onclick="signDoc('${d.id}')">Sign</button>` : ''}
            ${d.status === 'pending' ? `<button class="danger" onclick="rejectDoc('${d.id}')">Reject</button>` : ''}
          </td>
        </tr>
      `).join('')}
    </tbody></table>
  `;
}

async function viewDoc(bucket, path) {
  const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 300);
  if (error) return alert(error.message);
  window.open(data.signedUrl, '_blank');
}

async function signDoc(id) {
  window.location.href = `/sign.html?doc=${id}`;
}

async function rejectDoc(id) {
  const reason = prompt('Reason for rejection:') || '';
  if (!reason) return;
  const { error } = await sb.from('pgds_documents').update({
    status: 'rejected', reject_reason: reason, signed_by: currentUser.id, signed_at: new Date().toISOString()
  }).eq('id', id);
  if (error) return showMsg(error.message, 'error');
  showMsg('Document rejected.', 'success');
  render();
  updateCounts();
}

async function approveUser(id, fromAllView = false) {
  const storeInput = document.getElementById(`store-${id}`);
  const storeNameInput = document.getElementById(`storename-${id}`);
  const patch = { status: 'approved', approved_at: new Date().toISOString(), approved_by: currentUser.id };
  if (storeInput) patch.store_number = storeInput.value.trim();
  if (storeNameInput) patch.store_name = storeNameInput.value.trim();
  const { error } = await sb.from('pgds_profiles').update(patch).eq('id', id);
  if (error) return showMsg(error.message, 'error');
  showMsg('User approved.', 'success');
  render();
  updateCounts();
}

async function rejectUser(id, fromAllView = false) {
  const reason = prompt('Reason for rejection (optional):') || '';
  const { error } = await sb.from('pgds_profiles').update({ status: 'rejected', reject_reason: reason }).eq('id', id);
  if (error) return showMsg(error.message, 'error');
  showMsg('User rejected.', 'success');
  render();
  updateCounts();
}

function showMsg(text, type = 'info') {
  document.getElementById('msg').innerHTML = `<div class="msg ${type}">${text}</div>`;
  setTimeout(() => { document.getElementById('msg').innerHTML = ''; }, 4000);
}
function escapeHtml(s) { return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

document.querySelectorAll('.tab[data-view]').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab[data-view]').forEach(t => t.classList.remove('active'));
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
