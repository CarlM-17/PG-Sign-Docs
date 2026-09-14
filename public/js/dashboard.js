const { createClient } = supabase;
const sb = createClient(window.PGDS_CONFIG.SUPABASE_URL, window.PGDS_CONFIG.SUPABASE_ANON_KEY);

let currentStatus = 'pending';
let currentUser = null;

async function init() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return (window.location.href = '/');
  const { data: profile } = await sb.from('pgds_profiles').select('*').eq('id', session.user.id).single();
  if (!profile || profile.status !== 'approved') {
    await sb.auth.signOut();
    return (window.location.href = '/');
  }
  if (profile.role === 'admin') return (window.location.href = '/admin.html');
  currentUser = { ...session.user, profile };
  document.getElementById('userEmail').textContent = `${profile.full_name || profile.email} (${profile.store_number || 'no store'})`;
  loadDocs();
}

async function loadDocs() {
  const list = document.getElementById('docList');
  list.innerHTML = '<p class="empty">Loading...</p>';
  const { data, error } = await sb.from('pgds_documents')
    .select('*')
    .eq('uploader_id', currentUser.id)
    .eq('status', currentStatus)
    .order('created_at', { ascending: false });
  if (error) return list.innerHTML = `<div class="msg error">${error.message}</div>`;
  if (!data.length) return list.innerHTML = `<p class="empty">No ${currentStatus} documents.</p>`;
  list.innerHTML = `
    <table><thead><tr>
      <th>Title</th><th>Urgency</th><th>Uploaded</th><th>Status</th><th></th>
    </tr></thead><tbody>
      ${data.map(d => `
        <tr>
          <td>${escapeHtml(d.title)}</td>
          <td><span class="badge ${d.urgency}">${d.urgency}</span></td>
          <td>${new Date(d.created_at).toLocaleString()}</td>
          <td><span class="badge ${d.status}">${d.status}</span></td>
          <td>${d.status === 'approved' && d.signed_file_path ? `<button onclick="downloadFile('pgds-signed','${d.signed_file_path}')">Download</button>` : ''}</td>
        </tr>
      `).join('')}
    </tbody></table>
  `;
}

async function downloadFile(bucket, path) {
  const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 60);
  if (error) return alert(error.message);
  window.open(data.signedUrl, '_blank');
}

function escapeHtml(s) { return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentStatus = tab.dataset.status;
    loadDocs();
  });
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await sb.auth.signOut();
  window.location.href = '/';
});

init();
