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

const currentUserEl = document.getElementById('current-user');
const logoutBtn = document.getElementById('logout-btn');
const createGameBtn = document.getElementById('create-game-btn');
const linkSection = document.getElementById('game-link-section');
const linkInput = document.getElementById('game-link-input');
const copyBtn = document.getElementById('copy-link-btn');

async function init() {
  try {
    const me = await api('/api/me');
    if (!me.user) {
      window.location.href = '/';
      return;
    }
    currentUserEl.textContent = me.user.username;
  } catch {
    window.location.href = '/';
  }
}

logoutBtn.addEventListener('click', async () => {
  await api('/api/logout', { method: 'POST' });
  window.location.href = '/';
});

createGameBtn.addEventListener('click', async () => {
  try {
    const { gameId } = await api('/api/games', { method: 'POST' });
    const link = `${window.location.origin}/game.html?gameId=${gameId}`;
    linkInput.value = link;
    linkSection.classList.remove('hidden');
    // Auto join host in game page
    window.location.href = `/game.html?gameId=${gameId}`;
  } catch (err) {
    alert(err.message);
  }
});

copyBtn.addEventListener('click', async () => {
  if (!linkInput.value) return;
  try {
    await navigator.clipboard.writeText(linkInput.value);
    copyBtn.textContent = 'Copied';
    setTimeout(() => (copyBtn.textContent = 'Copy'), 1500);
  } catch {
    linkInput.select();
    document.execCommand('copy');
  }
});

init();

