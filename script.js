// Update this once the live-ops service is actually deployed. Until then
// (or if it's asleep on a free tier) the game just runs on DEFAULT_CONFIG.
const CONFIG_BASE_URL = "https://hollowmere-liveops.onrender.com";
const LEVEL_ID = "1";

const DEFAULT_CONFIG = {
  boardSize: 7,
  moveLimit: 20,
  wardTarget: 8,
  difficultyMultiplier: 1.0,
};

const CREATURES = [
  { id: "moth", name: "Grave Moth", color: "#b47cff", icon: "icon-moth" },
  { id: "bone", name: "Bonewretch", color: "#e7e2d6", icon: "icon-bone" },
  { id: "serpent", name: "Fen Serpent", color: "#5fbf7a", icon: "icon-serpent" },
  { id: "ashling", name: "Ashling", color: "#ff8a4c", icon: "icon-ashling" },
  { id: "drowspawn", name: "Drowspawn", color: "#4b3f6b", icon: "icon-drowspawn" },
];

const state = {
  boardSize: 7,
  moveLimit: 20,
  wardTarget: 8,
  difficultyMultiplier: 1.0,
  movesLeft: 0,
  board: [],
  sealed: new Set(),
  sealAnimated: new Set(),
  wardProgress: {},
  selected: null,
  gameOver: false,
  lastConfig: null,
  animating: false,
  clearingCells: new Set(),
  newCells: new Set(),
};

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadConfig(levelId) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const res = await fetch(`${CONFIG_BASE_URL}/api/configs/${levelId}`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error("bad status " + res.status);
    const data = await res.json();
    return {
      boardSize: data.boardSize,
      moveLimit: data.moveLimit,
      wardTarget: data.wardTarget,
      difficultyMultiplier: data.difficultyMultiplier,
    };
  } catch (err) {
    console.warn("live-ops config unreachable, using defaults:", err.message);
    return DEFAULT_CONFIG;
  }
}

function randomUnsealedType() {
  const available = CREATURES.filter((c) => !state.sealed.has(c.id));
  if (available.length === 0) return null;
  // Drowspawn gets weighted up by the difficulty knob, everything else
  // is even. Makes the "harder" levels actually feel different instead
  // of just being a number nobody sees.
  const weights = available.map((c) =>
    c.id === "drowspawn" ? state.difficultyMultiplier : 1
  );
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < available.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return available[i].id;
  }
  return available[available.length - 1].id;
}

function findMatches(board) {
  const n = state.boardSize;
  const matched = new Set();

  for (let r = 0; r < n; r++) {
    let count = 1;
    for (let c = 1; c <= n; c++) {
      const cur = c < n ? board[r][c] : undefined;
      const prev = board[r][c - 1];
      if (cur !== null && cur === prev) {
        count++;
      } else {
        if (count >= 3) {
          for (let k = c - count; k < c; k++) matched.add(r + "," + k);
        }
        count = 1;
      }
    }
  }

  for (let c = 0; c < n; c++) {
    let count = 1;
    for (let r = 1; r <= n; r++) {
      const cur = r < n ? board[r][c] : undefined;
      const prev = board[r - 1][c];
      if (cur !== null && cur === prev) {
        count++;
      } else {
        if (count >= 3) {
          for (let k = r - count; k < r; k++) matched.add(k + "," + c);
        }
        count = 1;
      }
    }
  }

  return matched;
}

function tallyWard(matchSet) {
  for (const key of matchSet) {
    const [r, c] = key.split(",").map(Number);
    const id = state.board[r][c];
    if (id) state.wardProgress[id] = (state.wardProgress[id] || 0) + 1;
  }
}

function clearCells(matchSet) {
  for (const key of matchSet) {
    const [r, c] = key.split(",").map(Number);
    state.board[r][c] = null;
  }
}

function applyGravityAndRefill() {
  const n = state.boardSize;
  const newCells = new Set();
  for (let c = 0; c < n; c++) {
    const survivors = [];
    for (let r = 0; r < n; r++) {
      if (state.board[r][c] !== null) survivors.push(state.board[r][c]);
    }
    const missing = n - survivors.length;
    const newColumn = [];
    for (let i = 0; i < missing; i++) newColumn.push(randomUnsealedType());
    for (const v of survivors) newColumn.push(v);
    for (let r = 0; r < n; r++) {
      state.board[r][c] = newColumn[r];
      if (r < missing) newCells.add(r + "," + c);
    }
  }
  state.newCells = newCells;
}

async function resolveMatchesLoop(matches) {
  let current = matches;
  while (current.size > 0) {
    tallyWard(current);
    state.clearingCells = current;
    render();
    await wait(200);

    state.clearingCells = new Set();
    clearCells(current);
    applyGravityAndRefill();
    render();

    checkSeals();
    render();

    current = findMatches(state.board);
  }
}

function checkSeals() {
  for (const creature of CREATURES) {
    if (state.sealed.has(creature.id)) continue;
    if ((state.wardProgress[creature.id] || 0) < state.wardTarget) continue;

    state.sealed.add(creature.id);
    let purgedAny = false;
    for (let r = 0; r < state.boardSize; r++) {
      for (let c = 0; c < state.boardSize; c++) {
        if (state.board[r][c] === creature.id) {
          state.board[r][c] = null;
          purgedAny = true;
        }
      }
    }
    if (purgedAny) applyGravityAndRefill();
  }
}

function checkWinLose() {
  const allSealed = CREATURES.every((c) => state.sealed.has(c.id));
  if (allSealed) {
    state.gameOver = true;
    showOverlay("Hollowmere holds.", "Every ward is sealed. For now.");
  } else if (state.movesLeft <= 0) {
    state.gameOver = true;
    showOverlay(
      "Hollowmere falls.",
      "You ran out of moves before the last ward held."
    );
  }
}

function swapCells(r1, c1, r2, c2) {
  const tmp = state.board[r1][c1];
  state.board[r1][c1] = state.board[r2][c2];
  state.board[r2][c2] = tmp;
}

async function trySwap(r1, c1, r2, c2) {
  swapCells(r1, c1, r2, c2);
  const matches = findMatches(state.board);
  if (matches.size === 0) {
    swapCells(r1, c1, r2, c2);
    render();
    return;
  }

  state.animating = true;
  state.movesLeft -= 1;
  render();

  await resolveMatchesLoop(matches);
  checkWinLose();

  state.animating = false;
  render();
}

function onTileClick(r, c) {
  if (state.gameOver || state.animating) return;

  if (!state.selected) {
    state.selected = { r, c };
    render();
    return;
  }

  const { r: r1, c: c1 } = state.selected;
  state.selected = null;

  if (r1 === r && c1 === c) {
    render();
    return;
  }

  const adjacent = Math.abs(r1 - r) + Math.abs(c1 - c) === 1;
  if (!adjacent) {
    render();
    return;
  }

  trySwap(r1, c1, r, c);
}

function render() {
  document.getElementById("moves-count").textContent = state.movesLeft;
  renderWards();
  renderBoard();
  state.newCells = new Set();
}

function renderWards() {
  const wardsEl = document.getElementById("wards");
  wardsEl.innerHTML = "";
  for (const creature of CREATURES) {
    const sealed = state.sealed.has(creature.id);
    const progress = Math.min(
      state.wardProgress[creature.id] || 0,
      state.wardTarget
    );
    const pct = sealed ? 100 : Math.round((progress / state.wardTarget) * 100);

    const div = document.createElement("div");
    div.className = "ward" + (sealed ? " sealed" : "");
    if (!sealed && pct >= 80) div.classList.add("ward-near");
    if (sealed && !state.sealAnimated.has(creature.id)) {
      div.classList.add("seal-flash");
      state.sealAnimated.add(creature.id);
    }
    div.title = creature.name + (sealed ? " (sealed)" : "");
    div.innerHTML = `
      <svg style="color:${creature.color}"><use href="#${creature.icon}"></use></svg>
      <div class="ward-bar-track">
        <div class="ward-bar-fill" style="width:${pct}%;background:${creature.color}"></div>
      </div>
    `;
    wardsEl.appendChild(div);
  }
}

function renderBoard() {
  const boardEl = document.getElementById("board");
  boardEl.style.gridTemplateColumns = `repeat(${state.boardSize}, 40px)`;
  boardEl.classList.toggle("busy", state.animating);
  boardEl.innerHTML = "";

  for (let r = 0; r < state.boardSize; r++) {
    for (let c = 0; c < state.boardSize; c++) {
      const key = r + "," + c;
      const typeId = state.board[r][c];
      const creature = CREATURES.find((x) => x.id === typeId);

      const tile = document.createElement("div");
      tile.className = "tile";
      if (state.selected && state.selected.r === r && state.selected.c === c) {
        tile.classList.add("selected");
      }
      if (state.clearingCells.has(key)) {
        tile.classList.add("clearing");
      } else if (state.newCells.has(key)) {
        tile.classList.add("tile-pop");
      }
      if (creature) {
        tile.style.background = creature.color;
        tile.innerHTML = `<svg><use href="#${creature.icon}"></use></svg>`;
      }
      tile.addEventListener("click", () => onTileClick(r, c));
      boardEl.appendChild(tile);
    }
  }
}

function showOverlay(title, text) {
  document.getElementById("overlay-title").textContent = title;
  document.getElementById("overlay-text").textContent = text;
  document.getElementById("overlay").hidden = false;
}

function hideOverlay() {
  document.getElementById("overlay").hidden = true;
}

function initGame(config) {
  state.lastConfig = config;
  state.boardSize = config.boardSize;
  state.moveLimit = config.moveLimit;
  state.wardTarget = config.wardTarget;
  state.difficultyMultiplier = config.difficultyMultiplier;
  state.movesLeft = config.moveLimit;
  state.sealed = new Set();
  state.sealAnimated = new Set();
  state.wardProgress = {};
  state.selected = null;
  state.gameOver = false;
  state.animating = false;
  state.clearingCells = new Set();

  state.board = [];
  for (let r = 0; r < state.boardSize; r++) {
    const row = [];
    for (let c = 0; c < state.boardSize; c++) row.push(randomUnsealedType());
    state.board.push(row);
  }

  // A fresh board can accidentally start with a match already sitting on
  // it. Clear those quietly, they shouldn't count toward the player.
  let starting = findMatches(state.board);
  let safety = 0;
  while (starting.size > 0 && safety < 20) {
    clearCells(starting);
    applyGravityAndRefill();
    starting = findMatches(state.board);
    safety++;
  }

  state.newCells = new Set();
  for (let r = 0; r < state.boardSize; r++) {
    for (let c = 0; c < state.boardSize; c++) state.newCells.add(r + "," + c);
  }

  hideOverlay();
  render();
}

const retryBtn = document.getElementById("overlay-button");
retryBtn.addEventListener("click", () => initGame(state.lastConfig || DEFAULT_CONFIG));

(async function boot() {
  const config = await loadConfig(LEVEL_ID);
  initGame(config);
})();
