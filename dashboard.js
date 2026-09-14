const { createClient } = supabase;
const sb = createClient(window.PGDS_CONFIG.SUPABASE_URL, window.PGDS_CONFIG.SUPABASE_ANON_KEY);

const MAX_FILE_MB = 5;
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
      <th>Title</th><th>Urgency</th><th>Uploaded</th><th>Status</th><th>Actions</th>
    </tr></thead><tbody>
      ${data.map(d => `
        <tr>
          <td>${escapeHtml(d.title)}${d.notes ? `<div style="font-size:12px;color:#64748b;margin-top:4px;">${escapeHtml(d.notes)}</div>` : ''}</td>
          <td><span class="badge ${d.urgency}">${d.urgency}</span></td>
          <td>${new Date(d.created_at).toLocaleString()}</td>
          <td><span class="badge ${d.status}">${d.status}</span>${d.status === 'rejected' && d.reject_reason ? `<div style="font-size:12px;color:#991b1b;margin-top:4px;">${escapeHtml(d.reject_reason)}</div>` : ''}</td>
          <td class="actions">
            ${d.status === 'approved' && d.signed_file_path ? `<button class="success" onclick="downloadFile('pgds-signed','${d.signed_file_path}')">Download signed</button>` : ''}
            ${d.status === 'pending' ? `<button class="secondary" onclick="downloadFile('pgds-pending','${d.original_file_path}')">View</button>` : ''}
            ${d.status === 'pending' ? `<button class="danger" onclick="cancelDoc('${d.id}','${d.original_file_path}')">Cancel</button>` : ''}
          </td>
        </tr>
      `).join('')}
    </tbody></table>
  `;
}

async function downloadFile(bucket, path) {
  const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, 300);
  if (error) return alert(error.message);
  window.open(data.signedUrl, '_blank');
}

async function cancelDoc(id, filePath) {
  if (!confirm('Cancel this pending document? This cannot be undone.')) return;
  await sb.storage.from('pgds-pending').remove([filePath]);
  const { error } = await sb.from('pgds_documents').delete().eq('id', id);
  if (error) return alert(error.message);
  loadDocs();
}

function escapeHtml(s) { return String(s || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

// Upload flow
const fileInput = document.getElementById('fileInput');
const fileDrop = document.getElementById('fileDrop');
const fileDropText = document.getElementById('fileDropText');
const uploadForm = document.getElementById('uploadForm');
const uploadBtn = document.getElementById('uploadBtn');
const uploadMsg = document.getElementById('uploadMsg');

fileInput.addEventListener('change', () => {
  const f = fileInput.files[0];
  if (!f) { fileDrop.classList.remove('has-file'); fileDropText.textContent = 'Click to choose a file'; return; }
  const mb = f.size / (1024 * 1024);
  if (mb > MAX_FILE_MB) {
    fileInput.value = '';
    fileDropText.textContent = `File too big (${mb.toFixed(1)}MB). Max is ${MAX_FILE_MB}MB.`;
    fileDrop.classList.remove('has-file');
    return;
  }
  fileDrop.classList.add('has-file');
  fileDropText.textContent = `${f.name} (${mb.toFixed(2)}MB)`;
});

uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  uploadMsg.innerHTML = '';
  const f = fileInput.files[0];
  const title = document.getElementById('docTitle').value.trim();
  const urgency = document.getElementById('docUrgency').value;
  const notes = document.getElementById('docNotes').value.trim();
  if (!f || !title) return;
  const mb = f.size / (1024 * 1024);
  if (mb > MAX_FILE_MB) {
    uploadMsg.innerHTML = `<div class="msg error">File too big (${mb.toFixed(1)}MB). Max ${MAX_FILE_MB}MB.</div>`;
    return;
  }
  uploadBtn.disabled = true; uploadBtn.textContent = 'Uploading...';
  try {
    const ext = f.name.split('.').pop().toLowerCase();
    const safeExt = ['pdf','jpg','jpeg','png'].includes(ext) ? ext : 'bin';
    const path = `${currentUser.id}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${safeExt}`;
    const { error: upErr } = await sb.storage.from('pgds-pending').upload(path, f, { contentType: f.type, upsert: false });
    if (upErr) throw upErr;
    const { error: insErr } = await sb.from('pgds_documents').insert({
      uploader_id: currentUser.id,
      store_number: currentUser.profile.store_number,
      title, notes, urgency,
      original_file_path: path,
      status: 'pending'
    });
    if (insErr) {
      await sb.storage.from('pgds-pending').remove([path]);
      throw insErr;
    }
    uploadMsg.innerHTML = `<div class="msg success">Uploaded! It is now in the signer's queue.</div>`;
    uploadForm.reset();
    fileDrop.classList.remove('has-file');
    fileDropText.textContent = 'Click to choose a file';
    currentStatus = 'pending';
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelector('.tab[data-status="pending"]').classList.add('active');
    loadDocs();
  } catch (err) {
    uploadMsg.innerHTML = `<div class="msg error">${err.message || err}</div>`;
  } finally {
    uploadBtn.disabled = false; uploadBtn.textContent = 'Upload for signature';
  }
});

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
