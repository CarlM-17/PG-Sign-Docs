const { createClient } = supabase;
const sb = createClient(window.PGDS_CONFIG.SUPABASE_URL, window.PGDS_CONFIG.SUPABASE_ANON_KEY);

let mode = 'login';

const form = document.getElementById('authForm');
const msg = document.getElementById('msg');
const submitBtn = document.getElementById('submitBtn');
const switchLink = document.getElementById('switchLink');
const switchText = document.getElementById('switchText');
const formTitle = document.getElementById('formTitle');
const formSubtitle = document.getElementById('formSubtitle');
const nameGroup = document.getElementById('nameGroup');
const storeGroup = document.getElementById('storeGroup');
const storeNameGroup = document.getElementById('storeNameGroup');

function showMsg(text, type = 'info') {
  msg.innerHTML = `<div class="msg ${type}">${text}</div>`;
}
function clearMsg() { msg.innerHTML = ''; }

function setMode(newMode) {
  mode = newMode;
  clearMsg();
  if (mode === 'signup') {
    formTitle.textContent = 'Create your account';
    formSubtitle.textContent = 'After signup you must be approved by the admin.';
    submitBtn.textContent = 'Sign up';
    switchText.textContent = 'Already have an account?';
    switchLink.textContent = 'Sign in';
    nameGroup.style.display = 'block';
    storeGroup.style.display = 'block';
    storeNameGroup.style.display = 'block';
  } else {
    formTitle.textContent = 'Sign in to PG Docs Sign';
    formSubtitle.textContent = 'Enter your credentials to continue.';
    submitBtn.textContent = 'Sign in';
    switchText.textContent = 'New here?';
    switchLink.textContent = 'Create an account';
    nameGroup.style.display = 'none';
    storeGroup.style.display = 'none';
    storeNameGroup.style.display = 'none';
  }
}

switchLink.addEventListener('click', (e) => {
  e.preventDefault();
  setMode(mode === 'login' ? 'signup' : 'login');
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearMsg();
  submitBtn.disabled = true;
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  try {
    if (mode === 'signup') {
      const fullName = document.getElementById('fullName').value.trim();
      const storeNumber = document.getElementById('storeNumber').value.trim();
      const storeName = document.getElementById('storeName').value.trim();
      const { data, error } = await sb.auth.signUp({
        email, password,
        options: { data: { full_name: fullName } }
      });
      if (error) throw error;
      if (data.user) {
        await sb.from('pgds_profiles').update({
          store_number: storeNumber,
          store_name: storeName,
          full_name: fullName
        }).eq('id', data.user.id);
      }
      showMsg('Account created! Waiting for admin approval. You will be able to log in once approved.', 'success');
      submitBtn.disabled = false;
      return;
    }

    // login
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;

    // check profile status
    const { data: profile, error: perr } = await sb.from('pgds_profiles').select('*').eq('id', data.user.id).single();
    if (perr) throw perr;

    if (profile.status === 'pending') {
      await sb.auth.signOut();
      showMsg('Your account is still awaiting admin approval. Please wait.', 'info');
      submitBtn.disabled = false;
      return;
    }
    if (profile.status === 'rejected') {
      await sb.auth.signOut();
      showMsg('Your account was not approved. Reason: ' + (profile.reject_reason || 'not specified'), 'error');
      submitBtn.disabled = false;
      return;
    }

    // approved -> route based on role
    if (profile.role === 'admin') {
      window.location.href = '/admin.html';
    } else {
      window.location.href = '/dashboard.html';
    }
  } catch (err) {
    console.error(err);
    showMsg(err.message || 'Something went wrong.', 'error');
    submitBtn.disabled = false;
  }
});

// If already logged in and approved, redirect
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return;
  const { data: profile } = await sb.from('pgds_profiles').select('*').eq('id', session.user.id).single();
  if (profile && profile.status === 'approved') {
    window.location.href = profile.role === 'admin' ? '/admin.html' : '/dashboard.html';
  }
})();
