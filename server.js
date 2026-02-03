const express = require('express');
const session = require('express-session');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// In-memory stores (for demo; reset when server restarts)
const users = new Map(); // username -> { username, password }
const games = new Map(); // gameId -> gameState

app.use(express.json());
app.use(
  session({
    secret: 'mafia-secret-key',
    resave: false,
    saveUninitialized: false,
  })
);

app.use(express.static(path.join(__dirname, 'public')));

function requireAuth(req, res, next) {
  if (!req.session || !req.session.username) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

// AUTH
app.post('/api/signup', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  if (users.has(username)) {
    return res.status(400).json({ error: 'Username already exists' });
  }
  users.set(username, { username, password });
  req.session.username = username;
  res.json({ username });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.get(username);
  if (!user || user.password !== password) {
    return res.status(400).json({ error: 'Invalid credentials' });
  }
  req.session.username = username;
  res.json({ username });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get('/api/me', (req, res) => {
  if (!req.session || !req.session.username) {
    return res.json({ user: null });
  }
  res.json({ user: { username: req.session.username } });
});

// GAME HELPERS
function createGame(hostUsername) {
  const id = uuidv4().slice(0, 8);
  const game = {
    id,
    host: hostUsername,
    players: [], // { username, role, alive: true }
    phase: 'lobby', // lobby | night | day | ended
    mafiaTargets: {}, // username -> targetUsername (night)
    doctorTarget: null,
    dayVotes: {}, // username -> targetUsername
    createdAt: Date.now(),
    lastPhaseChange: Date.now(),
    winner: null,
  };
  games.set(id, game);
  return game;
}

function assignRoles(game) {
  const playerCount = game.players.length;
  if (playerCount < 4 || playerCount > 15) return false;

  let mafiaCount = 1;
  let doctorCount = 1;
  if (playerCount > 12) {
    mafiaCount = 3;
  }

  const shuffled = [...game.players].sort(() => Math.random() - 0.5);

  shuffled.forEach((p) => {
    p.role = 'villager';
  });

  for (let i = 0; i < mafiaCount; i++) {
    shuffled[i].role = 'mafia';
  }

  shuffled[mafiaCount].role = 'doctor';

  game.players = shuffled;
  return true;
}

function getVisibleStateForUser(game, username) {
  const me = game.players.find((p) => p.username === username);
  return {
    id: game.id,
    host: game.host,
    phase: game.phase,
    me: me
      ? {
          username: me.username,
          role: me.role, // would be hidden in real game; kept here so client can act correctly
          alive: me.alive,
        }
      : null,
    players: game.players.map((p) => ({
      username: p.username,
      alive: p.alive,
    })),
    winner: game.winner,
  };
}

function checkWin(game) {
  const alive = game.players.filter((p) => p.alive);
  const mafiaAlive = alive.filter((p) => p.role === 'mafia').length;
  const nonMafiaAlive = alive.length - mafiaAlive;

  if (mafiaAlive === 0) {
    game.phase = 'ended';
    game.winner = 'villagers';
  } else if (mafiaAlive >= nonMafiaAlive) {
    game.phase = 'ended';
    game.winner = 'mafia';
  }
}

// GAME ROUTES
app.post('/api/games', requireAuth, (req, res) => {
  const game = createGame(req.session.username);
  // Host auto-joins
  game.players.push({
    username: req.session.username,
    role: null,
    alive: true,
    selfHealUsed: false,
  });
  res.json({ gameId: game.id, joinLink: `/game.html?gameId=${game.id}` });
});

app.post('/api/games/:id/join', requireAuth, (req, res) => {
  const game = games.get(req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.phase !== 'lobby') {
    return res.status(400).json({ error: 'Game already started' });
  }
  const username = req.session.username;
  if (!game.players.find((p) => p.username === username)) {
    if (game.players.length >= 15) {
      return res.status(400).json({ error: 'Game is full (max 15)' });
    }
    game.players.push({
      username,
      role: null,
      alive: true,
      selfHealUsed: false,
    });
  }
  res.json(getVisibleStateForUser(game, username));
});

app.post('/api/games/:id/start', requireAuth, (req, res) => {
  const game = games.get(req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.host !== req.session.username) {
    return res.status(403).json({ error: 'Only host can start the game' });
  }
  if (game.phase !== 'lobby') {
    return res.status(400).json({ error: 'Game already started' });
  }
  if (!assignRoles(game)) {
    return res
      .status(400)
      .json({ error: 'Players must be between 4 and 15 to start' });
  }
  game.phase = 'night';
  game.lastPhaseChange = Date.now();
  game.mafiaTargets = {};
  game.doctorTarget = null;
  game.dayVotes = {};
  res.json(getVisibleStateForUser(game, req.session.username));
});

app.get('/api/games/:id', requireAuth, (req, res) => {
  const game = games.get(req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  res.json(getVisibleStateForUser(game, req.session.username));
});

// NIGHT ACTIONS
app.post('/api/games/:id/night/mafia', requireAuth, (req, res) => {
  const { target } = req.body;
  const game = games.get(req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.phase !== 'night') {
    return res.status(400).json({ error: 'Not night phase' });
  }
  const me = game.players.find((p) => p.username === req.session.username);
  if (!me || !me.alive || me.role !== 'mafia') {
    return res.status(403).json({ error: 'Not mafia or dead' });
  }
  const targetPlayer = game.players.find(
    (p) => p.username === target && p.alive
  );
  if (!targetPlayer) {
    return res.status(400).json({ error: 'Invalid target' });
  }
  game.mafiaTargets[me.username] = targetPlayer.username;
  res.json({ ok: true });
});

app.post('/api/games/:id/night/doctor', requireAuth, (req, res) => {
  const { target } = req.body;
  const game = games.get(req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.phase !== 'night') {
    return res.status(400).json({ error: 'Not night phase' });
  }
  const me = game.players.find((p) => p.username === req.session.username);
  if (!me || !me.alive || me.role !== 'doctor') {
    return res.status(403).json({ error: 'Not doctor or dead' });
  }
  if (me.selfHealUsed && target === me.username) {
    return res.status(400).json({ error: 'Self-heal already used' });
  }
  const targetPlayer = game.players.find(
    (p) => p.username === target && p.alive
  );
  if (!targetPlayer) {
    return res.status(400).json({ error: 'Invalid target' });
  }
  game.doctorTarget = targetPlayer.username;
  if (target === me.username) {
    me.selfHealUsed = true;
  }
  res.json({ ok: true });
});

// Resolve night when host triggers or after both mafia+doctor acted (simplified: manual)
app.post('/api/games/:id/night/resolve', requireAuth, (req, res) => {
  const game = games.get(req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.host !== req.session.username) {
    return res.status(403).json({ error: 'Only host can resolve night' });
  }
  if (game.phase !== 'night') {
    return res.status(400).json({ error: 'Not night phase' });
  }

  const votes = Object.values(game.mafiaTargets);
  if (votes.length === 0) {
    // No kill
  } else {
    const counts = {};
    for (const v of votes) {
      counts[v] = (counts[v] || 0) + 1;
    }
    let chosen = null;
    let max = 0;
    for (const [name, count] of Object.entries(counts)) {
      if (count > max) {
        max = count;
        chosen = name;
      }
    }
    if (chosen && chosen !== game.doctorTarget) {
      const victim = game.players.find((p) => p.username === chosen);
      if (victim) victim.alive = false;
    }
  }

  checkWin(game);
  if (game.phase !== 'ended') {
    game.phase = 'day';
    game.dayVotes = {};
    game.mafiaTargets = {};
    game.doctorTarget = null;
    game.lastPhaseChange = Date.now();
  }
  res.json(getVisibleStateForUser(game, req.session.username));
});

// DAY VOTING
app.post('/api/games/:id/day/vote', requireAuth, (req, res) => {
  const { target } = req.body;
  const game = games.get(req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.phase !== 'day') {
    return res.status(400).json({ error: 'Not day phase' });
  }
  const me = game.players.find((p) => p.username === req.session.username);
  if (!me || !me.alive) {
    return res.status(403).json({ error: 'Dead or not in game' });
  }
  if (target) {
    const targetPlayer = game.players.find(
      (p) => p.username === target && p.alive
    );
    if (!targetPlayer) {
      return res.status(400).json({ error: 'Invalid target' });
    }
    game.dayVotes[me.username] = targetPlayer.username;
  } else {
    delete game.dayVotes[me.username];
  }
  res.json({ ok: true });
});

// Resolve day (host triggers after ~10s voting window)
app.post('/api/games/:id/day/resolve', requireAuth, (req, res) => {
  const game = games.get(req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  if (game.host !== req.session.username) {
    return res.status(403).json({ error: 'Only host can resolve day' });
  }
  if (game.phase !== 'day') {
    return res.status(400).json({ error: 'Not day phase' });
  }

  const votes = Object.values(game.dayVotes);
  if (votes.length > 0) {
    const counts = {};
    for (const v of votes) {
      counts[v] = (counts[v] || 0) + 1;
    }
    let chosen = null;
    let max = 0;
    for (const [name, count] of Object.entries(counts)) {
      if (count > max) {
        max = count;
        chosen = name;
      }
    }
    if (chosen) {
      const victim = game.players.find((p) => p.username === chosen);
      if (victim) victim.alive = false;
    }
  }

  checkWin(game);
  if (game.phase !== 'ended') {
    game.phase = 'night';
    game.mafiaTargets = {};
    game.doctorTarget = null;
    game.dayVotes = {};
    game.lastPhaseChange = Date.now();
  }
  res.json(getVisibleStateForUser(game, req.session.username));
});

app.listen(PORT, () => {
  console.log(`Mafia game server listening on port ${PORT}`);
});

