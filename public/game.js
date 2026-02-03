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

const params = new URLSearchParams(window.location.search);
const gameId = params.get('gameId');

if (!gameId) {
  window.location.href = '/lobby.html';
}

const userEl = document.getElementById('game-user');
const leaveBtn = document.getElementById('game-leave-btn');
const titleEl = document.getElementById('game-title');
const subtitleEl = document.getElementById('game-subtitle');
const playersEl = document.getElementById('players-list');
const hostControlsEl = document.getElementById('host-controls');
const startBtn = document.getElementById('start-game-btn');
const resolveBtn = document.getElementById('resolve-phase-btn');
const actionsEl = document.getElementById('actions-section');
const timerEl = document.getElementById('timer');
const statusEl = document.getElementById('status');
const bodyEl = document.getElementById('game-body');

let me = null;
let game = null;
let isHost = false;
let phaseTimer = null;

async function joinGame() {
  try {
    const meRes = await api('/api/me');
    if (!meRes.user) {
      window.location.href = '/';
      return;
    }
    userEl.textContent = meRes.user.username;
    await api(`/api/games/${gameId}/join`, { method: 'POST' });
    await refreshGame();
    startPolling();
  } catch (err) {
    alert(err.message);
    window.location.href = '/lobby.html';
  }
}

async function refreshGame() {
  const state = await api(`/api/games/${gameId}`);
  game = state;
  me = state.me;
  isHost = state.host === me?.username;
  render();
}

function startPolling() {
  setInterval(() => {
    refreshGame().catch(() => {});
  }, 3000);
}

function setPhaseTimer(seconds) {
  clearInterval(phaseTimer);
  if (!seconds) {
    timerEl.classList.add('hidden');
    return;
  }
  let remaining = seconds;
  timerEl.classList.remove('hidden');
  timerEl.textContent = `Ovoz berish vaqti: ${remaining}s`;
  phaseTimer = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(phaseTimer);
      timerEl.textContent = 'Vaqt tugadi';
    } else {
      timerEl.textContent = `Ovoz berish vaqti: ${remaining}s`;
    }
  }, 1000);
}

function renderPlayers() {
  playersEl.innerHTML = '';
  game.players.forEach((p) => {
    const chip = document.createElement('div');
    chip.className = 'player-chip' + (p.alive ? '' : ' dead');
    chip.textContent = p.username;
    playersEl.appendChild(chip);
  });
}

function renderActions() {
  actionsEl.innerHTML = '';
  statusEl.textContent = '';

  if (!me || !me.alive || game.phase === 'ended') return;

  if (game.phase === 'night') {
    bodyEl.classList.remove('bg-day');
    bodyEl.classList.add('bg-night');
    titleEl.textContent = 'Tun bosqichi';
    subtitleEl.textContent =
      'Mafia yashirincha hujum qiladi, doktor esa kimnidir davolaydi.';

    if (me.role === 'mafia') {
      statusEl.textContent = 'Siz mafiasiz. Bir o\'yinchini chiqarib yuborish uchun tanlang.';
      game.players
        .filter((p) => p.alive && p.username !== me.username)
        .forEach((p) => {
          const btn = document.createElement('button');
          btn.className = 'vote-btn';
          btn.textContent = p.username;
          btn.onclick = async () => {
            try {
              await api(`/api/games/${gameId}/night/mafia`, {
                method: 'POST',
                body: JSON.stringify({ target: p.username }),
              });
              statusEl.textContent = `Siz ${p.username} ga ovoz berdingiz.`;
            } catch (err) {
              statusEl.textContent = err.message;
            }
          };
          actionsEl.appendChild(btn);
        });
    } else if (me.role === 'doctor') {
      statusEl.textContent =
        'Siz doktorsiz. Bitta o\'yinchini (shu jumladan o\'zingizni) davolashni tanlang.';
      game.players
        .filter((p) => p.alive)
        .forEach((p) => {
          const btn = document.createElement('button');
          btn.className = 'vote-btn';
          btn.textContent = p.username;
          btn.onclick = async () => {
            try {
              await api(`/api/games/${gameId}/night/doctor`, {
                method: 'POST',
                body: JSON.stringify({ target: p.username }),
              });
              statusEl.textContent = `Siz ${p.username} ni davolashni tanladingiz.`;
            } catch (err) {
              statusEl.textContent = err.message;
            }
          };
          actionsEl.appendChild(btn);
        });
    } else {
      statusEl.textContent = 'Siz oddiy aholisiz. Tunda hech narsa qilolmaysiz.';
    }

    if (isHost) {
      resolveBtn.classList.remove('hidden');
      resolveBtn.textContent = 'Tun natijasini chiqarish';
      setPhaseTimer(0);
    }
  } else if (game.phase === 'day') {
    bodyEl.classList.remove('bg-night');
    bodyEl.classList.add('bg-day');
    titleEl.textContent = 'Kunduzgi ovoz berish';
    subtitleEl.textContent =
      '10 soniya ichida kimni chiqarib yuborishni tanlang. Maqsad — mafiya.';

    game.players
      .filter((p) => p.alive && p.username !== me.username)
      .forEach((p) => {
        const btn = document.createElement('button');
        btn.className = 'vote-btn';
        btn.textContent = p.username;
        btn.onclick = async () => {
          try {
            await api(`/api/games/${gameId}/day/vote`, {
              method: 'POST',
              body: JSON.stringify({ target: p.username }),
            });
            statusEl.textContent = `Siz ${p.username} ga ovoz berdingiz.`;
          } catch (err) {
            statusEl.textContent = err.message;
          }
        };
        actionsEl.appendChild(btn);
      });

    if (isHost) {
      resolveBtn.classList.remove('hidden');
      resolveBtn.textContent = 'Kunduz natijasini chiqarish';
      setPhaseTimer(10);
    } else {
      setPhaseTimer(10);
    }
  } else if (game.phase === 'lobby') {
    bodyEl.classList.add('bg-night');
    bodyEl.classList.remove('bg-day');
    titleEl.textContent = 'Lobby';
    subtitleEl.textContent =
      'Kamida 4 ta, ko\'pi bilan 15 ta o\'yinchi bo\'lganda host o\'yinni boshlashi mumkin.';
    setPhaseTimer(0);
  } else if (game.phase === 'ended') {
    const winnerText =
      game.winner === 'mafia'
        ? 'O\'yinda Mafia g\'alaba qozondi.'
        : 'O\'yinda oddiy aholi va doktor g\'alaba qozondi.';
    statusEl.textContent = winnerText;
    subtitleEl.textContent = 'O\'yin tugadi. Yangi o\'yin yaratish uchun host lobbyga qaytsin.';
    setPhaseTimer(0);
  }
}

function render() {
  renderPlayers();

  if (isHost) {
    hostControlsEl.classList.remove('hidden');
  } else {
    hostControlsEl.classList.add('hidden');
  }

  if (game.phase === 'lobby') {
    startBtn.classList.remove('hidden');
    resolveBtn.classList.add('hidden');
  } else if (game.phase === 'ended') {
    startBtn.classList.add('hidden');
    resolveBtn.classList.add('hidden');
  } else {
    startBtn.classList.add('hidden');
  }

  renderActions();
}

startBtn.addEventListener('click', async () => {
  try {
    await api(`/api/games/${gameId}/start`, { method: 'POST' });
    await refreshGame();
  } catch (err) {
    alert(err.message);
  }
});

resolveBtn.addEventListener('click', async () => {
  try {
    if (game.phase === 'night') {
      await api(`/api/games/${gameId}/night/resolve`, { method: 'POST' });
    } else if (game.phase === 'day') {
      await api(`/api/games/${gameId}/day/resolve`, { method: 'POST' });
    }
    await refreshGame();
  } catch (err) {
    alert(err.message);
  }
});

leaveBtn.addEventListener('click', () => {
  window.location.href = '/lobby.html';
});

joinGame();

