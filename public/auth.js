async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Xatolik yuz berdi');
  return data;
}

const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const tabLogin = document.getElementById('tab-login');
const tabSignup = document.getElementById('tab-signup');
const errorBox = document.getElementById('auth-error');

function showError(msg) {
  errorBox.textContent = msg;
  errorBox.classList.remove('hidden');
}

function clearError() {
  errorBox.classList.add('hidden');
}

function switchTab(which) {
  if (which === 'login') {
    tabLogin.classList.add('active');
    tabSignup.classList.remove('active');
    loginForm.classList.add('active');
    signupForm.classList.remove('active');
  } else {
    tabSignup.classList.add('active');
    tabLogin.classList.remove('active');
    signupForm.classList.add('active');
    loginForm.classList.remove('active');
  }
  clearError();
}

tabLogin.addEventListener('click', () => switchTab('login'));
tabSignup.addEventListener('click', () => switchTab('signup'));

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();
  const formData = new FormData(loginForm);
  const username = formData.get('username').trim();
  const password = formData.get('password');
  if (!username || !password) return;
  try {
    await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    window.location.href = '/lobby.html';
  } catch (err) {
    showError(err.message);
  }
});

signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  clearError();
  const formData = new FormData(signupForm);
  const username = formData.get('username').trim();
  const password = formData.get('password');
  if (!username || !password) return;
  try {
    await api('/api/signup', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    window.location.href = '/lobby.html';
  } catch (err) {
    showError(err.message);
  }
});

// If already logged in, skip to lobby
(async () => {
  try {
    const me = await api('/api/me');
    if (me.user) {
      window.location.href = '/lobby.html';
    }
  } catch {
    // ignore
  }
})();

