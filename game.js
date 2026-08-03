(function startEvenOddGame() {
  "use strict";

  const Core = globalThis.EvenOddCore;
  if (!Core) {
    throw new Error("EvenOddCore did not load.");
  }

  const SESSION_KEY = "purple-house-even-odd-session-v2";
  const PREFERENCES_KEY = "purple-house-even-odd-preferences-v2";
  const SESSION_VERSION = 2;
  const COMPUTER_COLOR = "white";
  const localHostnames = new Set(["localhost", "127.0.0.1", "::1"]);
  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const reducedMotionOverride = localHostnames.has(window.location.hostname)
    && new URLSearchParams(window.location.search).get("motion") === "reduce";
  if (reducedMotionOverride) document.documentElement.classList.add("reduced-motion");

  const els = {
    appShell: document.querySelector("#appShell"),
    introDialog: document.querySelector("#introDialog"),
    boxButton: document.querySelector("#boxButton"),
    winnerDialog: document.querySelector("#winnerDialog"),
    winnerCharacter: document.querySelector("#winnerCharacter"),
    winnerBanner: document.querySelector("#winnerBanner"),
    winnerSummary: document.querySelector("#winnerSummary"),
    reviewLedger: document.querySelector("#reviewLedger"),
    playAgain: document.querySelector("#playAgain"),
    settingsDialog: document.querySelector("#settingsDialog"),
    openSettings: document.querySelector("#openSettings"),
    closeSettings: document.querySelector("#closeSettings"),
    presetFieldset: document.querySelector("#presetFieldset"),
    presetNote: document.querySelector("#presetNote"),
    presetButtons: Array.from(document.querySelectorAll("[data-preset]")),
    opponentButtons: Array.from(document.querySelectorAll("[data-opponent]")),
    difficultyFieldset: document.querySelector("#difficultyFieldset"),
    difficultyButtons: Array.from(document.querySelectorAll("[data-difficulty]")),
    fxToggle: document.querySelector("#fxToggle"),
    fxState: document.querySelector("#fxState"),
    musicVolume: document.querySelector("#musicVolume"),
    musicOutput: document.querySelector("#musicOutput"),
    history: document.querySelector("#history"),
    restartRound: document.querySelector("#restartRound"),
    newMatch: document.querySelector("#newMatch"),
    resumeSession: document.querySelector("#resumeSession"),
    clearSession: document.querySelector("#clearSession"),
    sessionNote: document.querySelector("#sessionNote"),
    blackMatch: document.querySelector("#blackMatch"),
    whiteMatch: document.querySelector("#whiteMatch"),
    goalLabel: document.querySelector("#goalLabel"),
    roundLabel: document.querySelector("#roundLabel"),
    gameCard: document.querySelector("#gameCard"),
    gameStage: document.querySelector("#gameStage"),
    turnDot: document.querySelector("#turnDot"),
    turnKicker: document.querySelector("#turnKicker"),
    turnStatus: document.querySelector("#turnStatus"),
    instruction: document.querySelector("#instruction"),
    coinPrompt: document.querySelector("#coinPrompt"),
    coinControl: document.querySelector("#coinControl"),
    coin: document.querySelector("#coin"),
    coinButtonLabel: document.querySelector("#coinButtonLabel"),
    coinCopy: document.querySelector("#coinCopy"),
    board: document.querySelector("#board"),
    cells: Array.from(document.querySelectorAll(".cell[data-cell]")),
    scoreToasts: document.querySelector("#scoreToasts"),
    blackZone: document.querySelector("#blackZone"),
    whiteZone: document.querySelector("#whiteZone"),
    blackTrayState: document.querySelector("#blackTrayState"),
    whiteTrayState: document.querySelector("#whiteTrayState"),
    blackCount: document.querySelector("#blackCount"),
    whiteCount: document.querySelector("#whiteCount"),
    blackSlots: Array.from(document.querySelectorAll('.die-slot[data-color="black"]')),
    whiteSlots: Array.from(document.querySelectorAll('.die-slot[data-color="white"]')),
    handoff: document.querySelector("#handoff"),
    handoffTitle: document.querySelector("#handoffTitle"),
    handoffCopy: document.querySelector("#handoffCopy"),
    primaryRow: document.querySelector("#primaryRow"),
    primaryAction: document.querySelector("#primaryAction"),
    starterPreview: document.querySelector("#starterPreview"),
    roundRecap: document.querySelector("#roundRecap"),
    recapTitle: document.querySelector("#recapTitle"),
    recapScore: document.querySelector("#recapScore"),
    recapResult: document.querySelector("#recapResult"),
    ledgerBody: document.querySelector("#ledgerBody"),
    gameLive: document.querySelector("#gameLive")
  };

  let transitionEpoch = 0;
  let attentionTimer = 0;
  let toastTimer = 0;
  let newMatchTimer = 0;
  let newMatchConfirming = false;
  let settingsReturnFocus = null;
  let settingsCloseFocusTarget = null;
  let announcementFrame = 0;
  let audioContext = null;
  let fxGain = null;
  let musicGain = null;
  let musicTimer = 0;
  let savedSession = readSavedSession();

  const preferences = readPreferences();
  let state = createInitialState(preferences);
  const gameplayRandom = createGameplayRandom();

  function createInitialState(options = {}) {
    const preset = presetFor(options.presetId || "standard");
    return {
      version: SESSION_VERSION,
      phase: "awaiting-toss",
      round: 1,
      starter: null,
      turn: null,
      selected: null,
      opponent: options.opponent === "computer" ? "computer" : "human",
      difficulty: options.difficulty === "hard" ? "hard" : "easy",
      fxEnabled: options.fxEnabled !== false,
      musicVolume: clamp(Number(options.musicVolume ?? 0.75), 0, 1),
      presetId: preset.id,
      targetScore: preset.goal,
      board: Array(9).fill(null),
      pools: { black: [], white: [] },
      scores: { blackRound: 0, whiteRound: 0, blackMatch: 0, whiteMatch: 0 },
      scoredLineNames: [],
      roundLedger: [],
      roundCommitted: false,
      matchWinner: null,
      history: [],
      status: "Waiting for coin toss.",
      instruction: "Flip the coin to choose the first player."
    };
  }

  function createGameplayRandom() {
    if (!localHostnames.has(window.location.hostname)) return () => Math.random();
    const fixture = new URLSearchParams(window.location.search).get("qa");
    const values = {
      reference: [
        0.9,
        0.01, 0.2, 0.7, 0.55, 0.9,
        0.7, 0.01, 0.2, 0.55, 0.55
      ],
      "hard-ai": [
        0.1,
        0.01, 0.2, 0.7, 0.55, 0.9,
        0.7, 0.01, 0.2, 0.55, 0.55
      ]
    }[fixture];
    if (!values) return () => Math.random();
    let index = 0;
    return () => values[index++] ?? 0.42;
  }

  function presetFor(id) {
    return Core.MATCH_PRESETS.find((preset) => preset.id === id) || Core.MATCH_PRESETS[1];
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
  }

  function playerName(color) {
    return color === "black" ? "Black" : "White";
  }

  function otherColor(color) {
    return color === "black" ? "white" : "black";
  }

  function isActivePhase() {
    return state.phase === "playing" || state.phase === "ai-thinking";
  }

  function isComputerTurn() {
    return state.opponent === "computer" && state.turn === COMPUTER_COLOR && isActivePhase();
  }

  function remainingDice(color) {
    return state.pools[color].filter((die) => !die.used);
  }

  function motionDelay(normal, reduced = 25) {
    return motionIsReduced() ? reduced : normal;
  }

  function motionIsReduced() {
    return reducedMotionQuery.matches || reducedMotionOverride;
  }

  function advanceEpoch() {
    transitionEpoch += 1;
    return transitionEpoch;
  }

  function clearGameAnnouncement() {
    window.cancelAnimationFrame(announcementFrame);
    announcementFrame = 0;
    els.gameLive.textContent = "";
  }

  function announceGameState(message) {
    clearGameAnnouncement();
    announcementFrame = window.requestAnimationFrame(() => {
      els.gameLive.textContent = message;
      announcementFrame = 0;
    });
  }

  function remainingDiceLabel(count, color = "") {
    const colorLabel = color ? `${color} ` : "";
    return `${count} ${colorLabel}${count === 1 ? "die" : "dice"} remaining`;
  }

  function focusSoon(element) {
    window.requestAnimationFrame(() => {
      if (!element || element.hidden || element.disabled || !element.isConnected) return;
      element.focus({ preventScroll: true });
    });
  }

  function focusFirstOpenCell() {
    const target = els.cells.find((cell) => cell.getAttribute("aria-disabled") === "false");
    focusSoon(target || els.turnStatus);
  }

  function firstActiveDieElement() {
    const slots = state.turn === "black" ? els.blackSlots : els.whiteSlots;
    return slots.find((slot) => !slot.disabled) || null;
  }

  function focusFirstActiveDie() {
    focusSoon(firstActiveDieElement() || els.turnStatus);
  }

  function dieMarkup(value, color) {
    return `
      <span class="die ${color}" data-value="${value}" aria-hidden="true">
        <span class="pip"></span><span class="pip"></span><span class="pip"></span>
        <span class="pip"></span><span class="pip"></span><span class="pip"></span>
        <span class="pip"></span><span class="pip"></span><span class="pip"></span>
      </span>
    `;
  }

  function render(options = {}) {
    document.body.dataset.phase = state.phase;
    renderScoreStrip();
    renderStatus();
    renderCoin();
    renderBoard();
    renderPools();
    renderHandoff();
    renderRecap();
    renderSettings();
    renderHistory();

    if (options.focus === "cell") focusFirstOpenCell();
    if (options.focus === "die") focusFirstActiveDie();
    if (options.focus === "status") focusSoon(els.turnStatus);
    if (options.focus === "primary") focusSoon(els.primaryAction);
    if (options.focus === "coin") focusSoon(els.coinControl);
  }

  function renderScoreStrip() {
    const preset = presetFor(state.presetId);
    els.blackMatch.textContent = String(state.scores.blackMatch);
    els.whiteMatch.textContent = String(state.scores.whiteMatch);
    els.goalLabel.textContent = `${preset.label} · ${state.targetScore}`;
    els.roundLabel.textContent = String(state.round);
  }

  function renderStatus() {
    const labels = {
      "awaiting-toss": "Ready to play",
      flipping: "Coin toss",
      rolling: `Round ${state.round}`,
      playing: state.turn ? `${playerName(state.turn)}'s turn` : "Your turn",
      "ai-thinking": "White computer",
      "round-complete": `Round ${state.round} complete`,
      "match-complete": "Match complete"
    };
    els.turnKicker.textContent = labels[state.phase] || "Even & Odd";
    els.turnStatus.textContent = state.status;
    els.instruction.textContent = state.instruction;
    els.turnDot.classList.toggle("black", state.turn === "black");
    els.turnDot.classList.toggle("white", state.turn === "white");
  }

  function renderCoin() {
    const visible = state.round === 1 && ["awaiting-toss", "flipping", "rolling"].includes(state.phase);
    els.coinPrompt.hidden = !visible;
    els.coinControl.disabled = state.phase !== "awaiting-toss";
    els.coin.classList.toggle("flipping", state.phase === "flipping");
    els.coin.classList.toggle("white-result", state.starter === "white");

    if (state.phase === "flipping") {
      els.coinButtonLabel.textContent = "Flipping…";
      els.coinCopy.textContent = "One toss only";
    } else if (state.phase === "rolling") {
      els.coinButtonLabel.textContent = "Rolling dice…";
      els.coinCopy.textContent = state.starter ? `${playerName(state.starter)} starts` : "Getting ready";
    } else {
      els.coinButtonLabel.textContent = "Flip Coin";
      els.coinCopy.textContent = "Black or White starts";
    }
  }

  function renderBoard() {
    const lines = Core.completedLines(state.board);
    const winningCells = new Set(lines.flatMap((line) => line.cells));
    const humanCanPlace = state.phase === "playing" && !isComputerTurn();
    els.board.setAttribute("aria-busy", String(state.phase === "ai-thinking"));
    els.gameCard.setAttribute("aria-busy", String(state.phase === "ai-thinking"));

    els.cells.forEach((cell, index) => {
      const die = state.board[index];
      const usable = Boolean(humanCanPlace && state.selected && !die);
      cell.classList.toggle("is-open", usable);
      cell.classList.toggle("drop-ready", usable);
      cell.classList.toggle("line-winner", winningCells.has(index));
      cell.setAttribute("aria-disabled", String(!usable));
      cell.tabIndex = usable ? 0 : -1;

      if (die) {
        cell.setAttribute("aria-label", `Square ${index + 1}, ${playerName(die.color)} die showing ${die.value}, occupied`);
        cell.innerHTML = dieMarkup(die.value, die.color);
      } else {
        const active = state.turn ? playerName(state.turn) : null;
        cell.setAttribute("aria-label", usable
          ? `Square ${index + 1}, open. Place the selected ${active} die`
          : active
            ? `Square ${index + 1}, open. Select a ${active} die first`
            : `Square ${index + 1}, open. Select a die after the toss`);
        cell.replaceChildren();
      }
    });
  }

  function renderPools() {
    const showZones = isActivePhase() && state.pools.black.length === 5 && state.pools.white.length === 5;
    els.blackZone.hidden = !showZones;
    els.whiteZone.hidden = !showZones;
    renderPool("black", els.blackSlots);
    renderPool("white", els.whiteSlots);

    if (!showZones) return;
    ["black", "white"].forEach((color) => {
      const zone = color === "black" ? els.blackZone : els.whiteZone;
      const active = state.turn === color;
      zone.classList.toggle("is-active", active);
      zone.classList.toggle("is-inactive", !active);
    });

    const blackRemaining = remainingDice("black").length;
    const whiteRemaining = remainingDice("white").length;
    els.blackCount.textContent = `${blackRemaining} ${blackRemaining === 1 ? "die" : "dice"}`;
    els.whiteCount.textContent = `${whiteRemaining} ${whiteRemaining === 1 ? "die" : "dice"}`;
    els.blackTrayState.textContent = state.turn === "black" ? "Active tray" : "Waiting";
    els.whiteTrayState.textContent = state.turn === "white"
      ? (state.phase === "ai-thinking" ? "Computer moving" : "Active tray")
      : "Waiting";
  }

  function renderPool(color, slots) {
    slots.forEach((slot, index) => {
      const die = state.pools[color][index];
      const selected = Boolean(die && state.selected?.id === die.id);
      const playable = Boolean(
        die && !die.used && state.phase === "playing" && state.turn === color && !isComputerTurn()
      );

      slot.classList.toggle("spent", Boolean(die?.used));
      slot.setAttribute("aria-pressed", String(selected));
      slot.disabled = !playable;
      slot.draggable = playable;
      slot.dataset.id = die?.id || "";

      if (!die) {
        slot.setAttribute("aria-label", `${playerName(color)} die slot ${index + 1}, not rolled`);
        slot.innerHTML = '<span class="unrolled-mark">Not rolled</span>';
      } else if (die.used) {
        slot.setAttribute("aria-label", `${playerName(color)} die showing ${die.value}, played`);
        slot.innerHTML = '<span class="spent-mark">Played</span>';
      } else {
        slot.setAttribute("aria-label", `${playerName(color)} die showing ${die.value}${selected ? ", selected" : ""}`);
        slot.innerHTML = dieMarkup(die.value, color);
      }
    });
  }

  function renderHandoff() {
    els.handoff.hidden = !isActivePhase();
    if (!isActivePhase()) return;

    if (state.phase === "ai-thinking") {
      els.handoffTitle.textContent = "White computer is moving";
      els.handoffCopy.textContent = "The board is locked until the move is complete.";
      return;
    }

    if (state.opponent === "human") {
      els.handoffTitle.textContent = `Pass to ${playerName(state.turn)}`;
      els.handoffCopy.textContent = `${playerName(state.turn)} has ${remainingDiceLabel(remainingDice(state.turn).length)}.`;
    } else {
      els.handoffTitle.textContent = "Your turn · Black";
      els.handoffCopy.textContent = `${remainingDiceLabel(remainingDice("black").length, "Black")}.`;
    }
  }

  function renderRecap() {
    const complete = state.phase === "round-complete" || state.phase === "match-complete";
    els.roundRecap.hidden = !complete;
    els.primaryRow.hidden = state.phase !== "round-complete";
    if (!complete) return;

    const nextStarter = otherColor(state.starter);
    els.recapTitle.textContent = `Round ${state.round} ledger`;
    els.recapScore.textContent = `Black ${state.scores.blackRound} · White ${state.scores.whiteRound}`;
    els.recapResult.textContent = recapResultText();
    els.ledgerBody.innerHTML = ledgerRows(state.roundLedger);

    if (state.phase === "round-complete") {
      els.primaryAction.textContent = `Start Round ${state.round + 1} and roll`;
      els.starterPreview.textContent = `${playerName(nextStarter)} starts`;
    }
  }

  function recapResultText() {
    if (state.matchWinner) {
      return `${playerName(state.matchWinner)} wins the match ${state.scores.blackMatch}–${state.scores.whiteMatch}.`;
    }
    if (state.scores.blackMatch === state.scores.whiteMatch && state.scores.blackMatch >= state.targetScore) {
      return `The match is tied at ${state.scores.blackMatch}. The next round is the tiebreaker.`;
    }
    if (state.scores.blackRound === state.scores.whiteRound) return "The round is tied.";
    return `${state.scores.blackRound > state.scores.whiteRound ? "Black" : "White"} wins the round.`;
  }

  function ledgerRows(lines) {
    return lines.map((line) => `
      <tr>
        <td><strong>${line.name}</strong><br><small>Squares ${line.cells.map((cell) => cell + 1).join(", ")}</small></td>
        <td>${line.values.join(" · ")}</td>
        <td>${line.equation}<br><small>${line.parity === "even" ? "Even" : "Odd"}</small></td>
        <td><span class="point-badge ${line.winner}">${playerName(line.winner)} +1</span></td>
      </tr>
    `).join("");
  }

  function renderSettings() {
    const matchLocked = state.phase !== "awaiting-toss";
    els.presetFieldset.disabled = matchLocked;
    els.presetNote.textContent = matchLocked
      ? "Match length is locked. Start a new match to choose another preset."
      : "Eight line points are available each round. Match length locks after the toss.";
    els.presetButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.preset === state.presetId));
      button.disabled = matchLocked;
    });
    els.opponentButtons.forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.opponent === state.opponent));
    });
    const difficultyAvailable = state.opponent === "computer";
    els.difficultyFieldset.hidden = !difficultyAvailable;
    els.difficultyFieldset.disabled = !difficultyAvailable;
    els.difficultyButtons.forEach((button) => {
      button.disabled = !difficultyAvailable;
      button.setAttribute("aria-pressed", String(button.dataset.difficulty === state.difficulty));
    });

    els.fxToggle.setAttribute("aria-pressed", String(state.fxEnabled));
    els.fxState.textContent = state.fxEnabled ? "On" : "Off";
    els.musicVolume.value = String(Math.round(state.musicVolume * 100));
    els.musicOutput.value = `${Math.round(state.musicVolume * 100)}%`;
    els.musicOutput.textContent = `${Math.round(state.musicVolume * 100)}%`;

    const canRestart = state.pools.black.length === 5 && !["awaiting-toss", "flipping", "rolling"].includes(state.phase);
    els.restartRound.disabled = !canRestart;
    els.resumeSession.disabled = !savedSession;
    els.clearSession.disabled = !savedSession;
    els.sessionNote.textContent = savedSession
      ? `A saved Round ${savedSession.round} session is available on this device.`
      : "The game saves locally after each round’s dice finish rolling and after every move.";
  }

  function renderHistory() {
    if (!state.history.length) {
      els.history.innerHTML = '<p class="empty-state">No completed rounds yet.</p>';
      return;
    }
    els.history.innerHTML = state.history.map((item) => `
      <details class="history-entry">
        <summary>
          <span class="round-pill">${item.round}</span>
          <span class="history-result">${item.result}</span>
          <strong class="history-score">${item.black}–${item.white}</strong>
        </summary>
        <div class="details-content">
          <table class="ledger">
            <caption class="sr-only">Round ${item.round} scoring ledger</caption>
            <thead><tr><th>Line</th><th>Dice</th><th>Sum</th><th>Point</th></tr></thead>
            <tbody>${ledgerRows(item.lines)}</tbody>
          </table>
        </div>
      </details>
    `).join("");
  }

  function flipCoin() {
    if (state.phase !== "awaiting-toss") return;
    const epoch = advanceEpoch();
    state.phase = "flipping";
    state.selected = null;
    state.status = "Coin toss in progress.";
    state.instruction = "Watch for the starting color.";
    playSound("coin");
    render({ focus: "coin" });
    announceGameState(`${state.status} ${state.instruction}`);

    window.setTimeout(() => {
      if (epoch !== transitionEpoch || state.phase !== "flipping") return;
      state.starter = gameplayRandom() < 0.5 ? "black" : "white";
      state.turn = state.starter;
      state.phase = "rolling";
      state.status = `${playerName(state.starter)} won the toss and will start the game.`;
      state.instruction = "Rolling both sets of dice once.";
      render({ focus: "status" });

      window.setTimeout(() => {
        if (epoch !== transitionEpoch || state.phase !== "rolling") return;
        rollRound();
      }, motionDelay(420, 35));
    }, motionDelay(760, 45));
  }

  function rollRound() {
    if (state.phase !== "rolling") return;
    state.board = Array(9).fill(null);
    state.selected = null;
    state.scoredLineNames = [];
    state.roundLedger = [];
    state.roundCommitted = false;
    state.matchWinner = null;
    state.scores.blackRound = 0;
    state.scores.whiteRound = 0;
    state.pools.black = createPool("black");
    state.pools.white = createPool("white");
    state.phase = "playing";
    state.turn = state.starter;
    state.status = `${playerName(state.turn)} starts Round ${state.round}.`;
    state.instruction = "Tap or drag a die, then choose an open square.";
    clearScoreEffects();
    playSound("roll");
    render({ focus: isComputerTurn() ? "status" : "die" });
    saveSession();
    const roundAnnouncement = `${state.status} ${state.instruction}`;
    if (isComputerTurn() && !els.settingsDialog.open) startComputerTurnIfNeeded(roundAnnouncement);
    else announceGameState(roundAnnouncement);
  }

  function createPool(color) {
    return Array.from({ length: 5 }, (_, index) => ({
      id: `${color}-${state.round}-${index}`,
      color,
      value: Math.floor(gameplayRandom() * 6) + 1,
      used: false
    }));
  }

  function selectDie(color, id, options = {}) {
    if (state.phase !== "playing" || isComputerTurn() || state.turn !== color) return false;
    const die = state.pools[color].find((item) => item.id === id && !item.used);
    if (!die) return false;
    state.selected = { color, id };
    state.status = `${playerName(color)} selected a ${die.value}.`;
    state.instruction = "Choose any open square.";
    render(options.drag ? {} : { focus: "cell" });
    return true;
  }

  function handleCellActivation(cell) {
    const index = Number(cell.dataset.cell);
    if (state.board[index]) {
      state.status = `Square ${index + 1} is occupied by ${playerName(state.board[index].color)} ${state.board[index].value}.`;
      state.instruction = state.selected ? "Choose a different open square." : "Tap or drag a die, then choose an open square.";
      render({ focus: "status" });
      announceGameState(`${state.status} ${state.instruction}`);
      return;
    }

    if (state.phase === "ai-thinking") {
      state.status = "White computer is still thinking.";
      state.instruction = "The board will unlock when White finishes.";
      render({ focus: "status" });
      announceGameState(`${state.status} ${state.instruction}`);
      return;
    }

    if (state.phase !== "playing") {
      state.status = state.phase === "awaiting-toss" ? "Waiting for coin toss." : state.status;
      state.instruction = state.phase === "awaiting-toss"
        ? "Use the Flip Coin control to begin."
        : "This square is not available right now.";
      render({ focus: state.phase === "awaiting-toss" ? "coin" : "status" });
      announceGameState(`${state.status} ${state.instruction}`);
      return;
    }

    if (!state.selected) {
      const color = state.turn;
      state.status = `${playerName(color)}: tap or drag a die first.`;
      state.instruction = `Choose a ${playerName(color)} die, then choose an open square.`;
      highlightTray(color);
      render({ focus: "status" });
      announceGameState(`${state.status} ${state.instruction}`);
      return;
    }

    placeSelected(index, { computer: false });
  }

  function highlightTray(color) {
    const zone = color === "black" ? els.blackZone : els.whiteZone;
    window.clearTimeout(attentionTimer);
    zone.classList.remove("needs-attention");
    window.requestAnimationFrame(() => zone.classList.add("needs-attention"));
    attentionTimer = window.setTimeout(() => zone.classList.remove("needs-attention"), motionDelay(1200, 90));
  }

  function placeSelected(index, options = {}) {
    if (!state.selected || state.board[index] || !isActivePhase()) return;
    const color = state.selected.color;
    const die = state.pools[color].find((item) => item.id === state.selected.id && !item.used);
    if (!die) return;

    const animation = captureMoveAnimation(die, index);
    die.used = true;
    state.board[index] = { color, value: die.value };
    state.selected = null;

    const lines = Core.completedLines(state.board);
    const newLines = lines.filter((line) => !state.scoredLineNames.includes(line.name));
    newLines.forEach((line) => state.scoredLineNames.push(line.name));
    const score = Core.scoreBoard(state.board);
    state.scores.blackRound = score.black;
    state.scores.whiteRound = score.white;

    if (state.board.every(Boolean)) {
      finishRound(lines, newLines, { ...options, die, index, animation });
      return;
    }

    state.turn = otherColor(color);
    if (!remainingDice(state.turn).length) state.turn = otherColor(state.turn);

    const placement = `${playerName(color)} placed a ${die.value} in square ${index + 1}.`;
    const scoreContext = newLines.length
      ? ` ${newLines.map((line) => line.outcome).join(". ")}.`
      : options.computer ? " No line completed." : "";
    const placementAnnouncement = `${placement}${scoreContext}`.trim();
    state.status = `${placement}${scoreContext} ${playerName(state.turn)}'s turn.`;
    state.instruction = "Tap or drag a die, then choose an open square.";
    state.phase = "playing";

    const nextIsComputer = state.opponent === "computer" && state.turn === COMPUTER_COLOR;
    render({ focus: nextIsComputer ? "status" : "die" });
    animateMove(animation);
    animateScoring(newLines);
    saveSession();
    if (nextIsComputer) startComputerTurnIfNeeded(placementAnnouncement);
    else announceGameState(state.status);
  }

  function finishRound(lines, newLines, context) {
    if (state.roundCommitted) return;
    state.roundCommitted = true;
    state.roundLedger = lines.map((line) => ({ ...line, cells: [...line.cells], values: [...line.values] }));
    state.scores.blackMatch += state.scores.blackRound;
    state.scores.whiteMatch += state.scores.whiteRound;

    const roundResult = state.scores.blackRound === state.scores.whiteRound
      ? "Round tied"
      : `${state.scores.blackRound > state.scores.whiteRound ? "Black" : "White"} wins the round`;

    state.history.unshift({
      round: state.round,
      black: state.scores.blackRound,
      white: state.scores.whiteRound,
      result: roundResult,
      lines: state.roundLedger.map((line) => ({ ...line, cells: [...line.cells], values: [...line.values] }))
    });
    state.history = state.history.slice(0, 12);

    const targetCrossed = state.scores.blackMatch >= state.targetScore || state.scores.whiteMatch >= state.targetScore;
    if (targetCrossed && state.scores.blackMatch !== state.scores.whiteMatch) {
      state.matchWinner = state.scores.blackMatch > state.scores.whiteMatch ? "black" : "white";
      state.phase = "match-complete";
      state.status = `${roundResult}. ${playerName(state.matchWinner)} wins the match.`;
      state.instruction = "The complete eight-line ledger is below.";
    } else {
      state.matchWinner = null;
      state.phase = "round-complete";
      const tieBreak = targetCrossed && state.scores.blackMatch === state.scores.whiteMatch;
      state.status = tieBreak
        ? `${roundResult}. The match is tied at ${state.scores.blackMatch}.`
        : `${roundResult}, ${state.scores.blackRound} to ${state.scores.whiteRound}.`;
      state.instruction = tieBreak
        ? "Review the ledger, then play one more round to break the tie."
        : "Review all eight lines, then start the next round when ready.";
    }

    render({ focus: state.matchWinner ? "status" : "primary" });
    animateMove(context.animation);
    animateScoring(newLines);
    const finalPlacement = `${playerName(context.die.color)} placed a ${context.die.value} in square ${context.index + 1}.`;
    const finalScoring = newLines.length ? `${newLines.map((line) => line.outcome).join(". ")}.` : "";
    announceGameState([
      finalPlacement,
      finalScoring,
      state.status,
      `Black scored ${state.scores.blackRound}; White scored ${state.scores.whiteRound}.`,
      "All eight scoring lines are available in the round ledger."
    ].filter(Boolean).join(" "));
    saveSession();

    if (state.matchWinner) {
      const epoch = transitionEpoch;
      window.setTimeout(() => {
        if (epoch !== transitionEpoch || state.phase !== "match-complete") return;
        showWinner(state.matchWinner);
      }, motionDelay(520, 35));
    }
  }

  function startNextRoundAndRoll() {
    if (state.phase !== "round-complete") return;
    const epoch = advanceEpoch();
    state.round += 1;
    state.starter = otherColor(state.starter);
    state.turn = state.starter;
    state.phase = "rolling";
    state.selected = null;
    state.board = Array(9).fill(null);
    state.pools = { black: [], white: [] };
    state.scoredLineNames = [];
    state.roundLedger = [];
    state.roundCommitted = false;
    state.scores.blackRound = 0;
    state.scores.whiteRound = 0;
    state.status = `Round ${state.round}: ${playerName(state.starter)} starts. Rolling dice.`;
    state.instruction = "Each color keeps this roll for the whole round.";
    clearScoreEffects();
    render({ focus: "status" });
    announceGameState(`${state.status} ${state.instruction}`);

    window.setTimeout(() => {
      if (epoch !== transitionEpoch || state.phase !== "rolling") return;
      rollRound();
    }, motionDelay(360, 30));
  }

  function restartCurrentRound() {
    if (!state.pools.black.length) return;
    advanceEpoch();
    if (state.roundCommitted) {
      state.scores.blackMatch = Math.max(0, state.scores.blackMatch - state.scores.blackRound);
      state.scores.whiteMatch = Math.max(0, state.scores.whiteMatch - state.scores.whiteRound);
      state.history = state.history.filter((item) => item.round !== state.round);
    }
    state.board = Array(9).fill(null);
    state.pools.black.forEach((die) => { die.used = false; });
    state.pools.white.forEach((die) => { die.used = false; });
    state.scores.blackRound = 0;
    state.scores.whiteRound = 0;
    state.scoredLineNames = [];
    state.roundLedger = [];
    state.roundCommitted = false;
    state.matchWinner = null;
    state.selected = null;
    state.turn = state.starter;
    state.phase = "playing";
    state.status = `${playerName(state.starter)} restarts Round ${state.round}.`;
    state.instruction = "The original dice are restored. Tap or drag a die, then choose an open square.";
    clearScoreEffects();
    render();
    closeSettings(isComputerTurn() ? els.turnStatus : firstActiveDieElement());
    saveSession();
    const restartAnnouncement = `${state.status} The same rolled dice are in play.`;
    if (isComputerTurn()) startComputerTurnIfNeeded(restartAnnouncement);
    else announceGameState(restartAnnouncement);
  }

  function requestNewMatch() {
    if (!newMatchConfirming) {
      newMatchConfirming = true;
      els.newMatch.textContent = "Confirm new match";
      els.newMatch.classList.add("confirming");
      els.sessionNote.textContent = "Press Confirm new match again. Your saved position remains available until the next round’s dice finish rolling.";
      announceGameState(els.sessionNote.textContent);
      window.clearTimeout(newMatchTimer);
      newMatchTimer = window.setTimeout(cancelNewMatchConfirmation, 6000);
      return;
    }
    performNewMatch();
  }

  function cancelNewMatchConfirmation() {
    const wasConfirming = newMatchConfirming;
    newMatchConfirming = false;
    els.newMatch.textContent = "New match";
    els.newMatch.classList.remove("confirming");
    renderSettings();
    if (wasConfirming) announceGameState(`${state.status} ${state.instruction}`);
  }

  function performNewMatch(options = {}) {
    advanceEpoch();
    const keep = {
      presetId: state.presetId,
      opponent: state.opponent,
      difficulty: state.difficulty,
      fxEnabled: state.fxEnabled,
      musicVolume: state.musicVolume
    };
    state = createInitialState(keep);
    cancelNewMatchConfirmation();
    clearScoreEffects();
    if (els.winnerDialog.open) els.winnerDialog.close();
    closeSettings(els.coinControl);
    render({ focus: els.settingsDialog.open ? undefined : "coin" });
    announceGameState("New match ready. Waiting for coin toss.");
    if (!options.keepSaved) updateSavedControls();
  }

  function startComputerTurnIfNeeded(contextMessage = "") {
    if (
      state.phase !== "playing" ||
      state.opponent !== "computer" ||
      state.turn !== COMPUTER_COLOR ||
      els.settingsDialog.open
    ) return;
    const epoch = transitionEpoch;
    state.phase = "ai-thinking";
    state.selected = null;
    state.status = "White computer is thinking.";
    state.instruction = "The board is locked until White completes its move.";
    render({ focus: "status" });
    announceGameState([
      contextMessage,
      "White computer is thinking. The board is locked until White completes its move."
    ].filter(Boolean).join(" "));

    window.setTimeout(() => {
      if (epoch !== transitionEpoch || state.phase !== "ai-thinking" || state.turn !== COMPUTER_COLOR) return;
      const move = chooseComputerMove();
      if (!move) {
        state.phase = "playing";
        state.status = "White computer had no legal move.";
        render({ focus: "status" });
        announceGameState(state.status);
        return;
      }
      state.selected = { color: COMPUTER_COLOR, id: move.die.id };
      placeSelected(move.cell, { computer: true });
    }, motionDelay(560, 45));
  }

  function chooseComputerMove() {
    const dice = remainingDice(COMPUTER_COLOR);
    const best = Core.chooseBestMove(state.board, dice, COMPUTER_COLOR);
    if (!best || state.difficulty === "hard" || gameplayRandom() < 0.7) return best;

    const moves = Core.legalMoves(state.board, dice);
    const evaluated = moves.map((move) => {
      const board = state.board.slice();
      board[move.cell] = { color: COMPUTER_COLOR, value: move.die.value };
      const score = Core.scoreBoard(board);
      return { ...move, score: score.white - score.black };
    });
    const alternatives = evaluated.filter((move) => move.score < best.score);
    const pool = alternatives.length ? alternatives : evaluated;
    return pool[Math.floor(gameplayRandom() * pool.length)] || best;
  }

  function captureMoveAnimation(die, cellIndex) {
    if (motionIsReduced()) return null;
    const slot = document.querySelector(`.die-slot[data-id="${die.id}"] .die`);
    const cell = els.cells[cellIndex];
    if (!slot || !cell) return null;
    return { color: die.color, value: die.value, source: slot.getBoundingClientRect(), target: cell.getBoundingClientRect() };
  }

  function animateMove(animation) {
    if (!animation || motionIsReduced()) return;
    const size = Math.min(animation.source.width, animation.source.height);
    const ghost = document.createElement("div");
    ghost.className = "move-ghost";
    ghost.innerHTML = dieMarkup(animation.value, animation.color);
    ghost.style.setProperty("--ghost-size", `${size}px`);
    ghost.style.setProperty("--from-left", `${animation.source.left + (animation.source.width - size) / 2}px`);
    ghost.style.setProperty("--from-top", `${animation.source.top + (animation.source.height - size) / 2}px`);
    ghost.style.setProperty("--to-left", `${animation.target.left + (animation.target.width - size) / 2}px`);
    ghost.style.setProperty("--to-top", `${animation.target.top + (animation.target.height - size) / 2}px`);
    document.body.appendChild(ghost);
    window.setTimeout(() => ghost.remove(), 340);
    playSound("move");
  }

  function animateScoring(lines) {
    if (!lines.length) return;
    window.clearTimeout(toastTimer);
    els.scoreToasts.replaceChildren();
    window.requestAnimationFrame(() => {
      lines.forEach((line) => {
        drawScoreLine(line);
        const toast = document.createElement("div");
        toast.className = `score-toast ${line.winner}`;
        toast.dataset.line = line.name;
        toast.textContent = `${line.name}: ${line.outcome}`;
        els.scoreToasts.appendChild(toast);
        playSound("score");
      });
    });
    toastTimer = window.setTimeout(() => els.scoreToasts.replaceChildren(), motionDelay(2250, 120));
  }

  function drawScoreLine(line) {
    const rects = line.cells.map((index) => els.cells[index].getBoundingClientRect());
    const boardRect = els.board.getBoundingClientRect();
    const start = rects[0];
    const end = rects[rects.length - 1];
    const x1 = start.left + start.width / 2 - boardRect.left;
    const y1 = start.top + start.height / 2 - boardRect.top;
    const x2 = end.left + end.width / 2 - boardRect.left;
    const y2 = end.top + end.height / 2 - boardRect.top;
    const marker = document.createElement("div");
    marker.className = `score-line ${line.winner}`;
    marker.dataset.line = line.name;
    marker.style.width = `${Math.hypot(x2 - x1, y2 - y1)}px`;
    marker.style.left = `${x1}px`;
    marker.style.top = `${y1 - 3.5}px`;
    marker.style.transform = `rotate(${Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI}deg)`;
    els.board.appendChild(marker);
    window.setTimeout(() => marker.remove(), motionDelay(2200, 130));
  }

  function clearScoreEffects() {
    window.clearTimeout(toastTimer);
    els.scoreToasts.replaceChildren();
    els.board.querySelectorAll(".score-line").forEach((line) => line.remove());
  }

  function showWinner(color) {
    const value = color === "black" ? 5 : 6;
    const glove = '<span class="winner-glove"><span class="glove-finger one"></span><span class="glove-finger two"></span><span class="glove-finger three"></span></span>';
    els.winnerCharacter.innerHTML = `
      <span class="winner-arm left">${glove}</span>
      <span class="winner-arm right">${glove}</span>
      ${dieMarkup(value, color)}
      <span class="winner-leg left"><span class="winner-shoe"></span></span>
      <span class="winner-leg right"><span class="winner-shoe"></span></span>
    `;
    els.winnerBanner.textContent = `${playerName(color)} wins!`;
    els.winnerSummary.textContent = `Final match score: Black ${state.scores.blackMatch}, White ${state.scores.whiteMatch}.`;
    if (els.settingsDialog.open) closeSettings(els.reviewLedger);
    if (!els.winnerDialog.open) els.winnerDialog.showModal();
    focusSoon(els.reviewLedger);
    playSound("score");
  }

  function reviewFinalLedger() {
    if (els.winnerDialog.open) els.winnerDialog.close();
    window.requestAnimationFrame(() => {
      els.roundRecap.focus({ preventScroll: true });
      els.roundRecap.scrollIntoView({
        block: "start",
        behavior: motionIsReduced() ? "auto" : "smooth"
      });
    });
    announceGameState(`Final Round ${state.round} ledger. All eight scoring lines are shown.`);
  }

  function openGame() {
    if (!els.introDialog.open || els.boxButton.disabled) return;
    els.boxButton.disabled = true;
    els.boxButton.classList.add("opening");
    startMusic();
    playSound("open");
    window.setTimeout(() => {
      if (els.introDialog.open) els.introDialog.close();
      els.appShell.inert = false;
      render({ focus: "coin" });
      announceGameState("Waiting for coin toss. Flip the coin to choose the first player.");
    }, motionDelay(620, 35));
  }

  function openSettings() {
    if (state.phase === "ai-thinking") {
      advanceEpoch();
      state.phase = "playing";
      state.status = "White computer is paused while the game menu is open.";
      state.instruction = "Close the menu when you are ready for White to move.";
      render();
      announceGameState(`${state.status} ${state.instruction}`);
    }
    settingsReturnFocus = document.activeElement;
    settingsCloseFocusTarget = null;
    if (!els.settingsDialog.open) els.settingsDialog.showModal();
    focusSoon(els.closeSettings);
  }

  function closeSettings(focusTarget = null) {
    settingsCloseFocusTarget = focusTarget instanceof HTMLElement ? focusTarget : null;
    if (els.settingsDialog.open) {
      els.settingsDialog.close();
    } else if (settingsCloseFocusTarget) {
      const target = settingsCloseFocusTarget;
      settingsCloseFocusTarget = null;
      focusSoon(target);
    }
  }

  function setPreset(id) {
    if (state.phase !== "awaiting-toss") return;
    const preset = presetFor(id);
    state.presetId = preset.id;
    state.targetScore = preset.goal;
    state.status = "Waiting for coin toss.";
    state.instruction = `${preset.label} match selected: first to ${preset.goal} points.`;
    savePreferences();
    render();
  }

  function setOpponent(opponent) {
    if (!['human', 'computer'].includes(opponent)) return;
    advanceEpoch();
    state.opponent = opponent;
    state.selected = null;
    if (state.phase === "ai-thinking") state.phase = "playing";
    if (isActivePhase()) {
      state.status = opponent === "computer"
        ? "Computer mode on. You are Black; White is the computer."
        : `Two-player mode on. ${playerName(state.turn)}'s turn.`;
      state.instruction = "Tap or drag a die, then choose an open square.";
    }
    savePreferences();
    render({ focus: isComputerTurn() ? "status" : undefined });
    saveSession();
    if (isComputerTurn() && !els.settingsDialog.open) startComputerTurnIfNeeded(state.status);
    else {
      if (isActivePhase()) announceGameState(state.status);
      startComputerTurnIfNeeded();
    }
  }

  function setDifficulty(difficulty) {
    if (state.opponent !== "computer" || !["easy", "hard"].includes(difficulty)) return;
    state.difficulty = difficulty;
    if (isActivePhase()) {
      state.status = `Computer difficulty set to ${difficulty}.`;
      state.instruction = state.turn === COMPUTER_COLOR
        ? "White will finish the current move."
        : "Tap or drag a die, then choose an open square.";
    }
    savePreferences();
    render();
    if (isActivePhase()) announceGameState(`${state.status} ${state.instruction}`);
    saveSession();
  }

  function updateAudioPreference() {
    updateAudioState();
    savePreferences();
    saveSession();
    renderSettings();
  }

  function ensureAudio() {
    try {
      if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === "suspended") audioContext.resume();
      if (!fxGain) {
        fxGain = audioContext.createGain();
        fxGain.connect(audioContext.destination);
      }
      if (!musicGain) {
        musicGain = audioContext.createGain();
        musicGain.connect(audioContext.destination);
      }
      updateAudioState();
      return true;
    } catch (error) {
      return false;
    }
  }

  function updateAudioState() {
    if (fxGain) fxGain.gain.value = state.fxEnabled ? 1 : 0;
    if (musicGain) musicGain.gain.value = state.musicVolume * 0.055;
    if (state.musicVolume <= 0 && musicTimer) {
      window.clearInterval(musicTimer);
      musicTimer = 0;
    }
  }

  function tone(frequency, duration, type = "sine", volume = 0.04, delay = 0, output = "fx") {
    try {
      if (output === "fx" && !state.fxEnabled) return;
      if (output === "music" && state.musicVolume <= 0) return;
      if (!ensureAudio()) return;
      const start = audioContext.currentTime + delay;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain).connect(output === "music" ? musicGain : fxGain);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.02);
    } catch (error) {}
  }

  function noiseHit(delay, duration, volume, cutoff) {
    try {
      if (!state.fxEnabled || !ensureAudio()) return;
      const sampleRate = audioContext.sampleRate;
      const buffer = audioContext.createBuffer(1, Math.ceil(sampleRate * duration), sampleRate);
      const data = buffer.getChannelData(0);
      for (let index = 0; index < data.length; index += 1) {
        data[index] = (Math.random() * 2 - 1) * (1 - index / data.length);
      }
      const source = audioContext.createBufferSource();
      const filter = audioContext.createBiquadFilter();
      const gain = audioContext.createGain();
      const start = audioContext.currentTime + delay;
      filter.type = "bandpass";
      filter.frequency.setValueAtTime(cutoff, start);
      filter.Q.value = 2;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      source.buffer = buffer;
      source.connect(filter).connect(gain).connect(fxGain);
      source.start(start);
      source.stop(start + duration + 0.02);
    } catch (error) {}
  }

  function playSound(name) {
    if (!state.fxEnabled) return;
    if (name === "open") {
      tone(180, 0.12, "triangle", 0.05);
      tone(330, 0.16, "triangle", 0.035, 0.08);
    }
    if (name === "coin") {
      tone(520, 0.05, "square", 0.03);
      tone(740, 0.05, "square", 0.028, 0.1);
      tone(420, 0.09, "triangle", 0.038, 0.22);
    }
    if (name === "roll") {
      for (let index = 0; index < 10; index += 1) {
        noiseHit(index * 0.042, 0.07, 0.07 - index * 0.004, 170 + Math.random() * 580);
      }
    }
    if (name === "move") tone(360, 0.07, "triangle", 0.035);
    if (name === "score") {
      tone(560, 0.07, "triangle", 0.04);
      tone(840, 0.1, "triangle", 0.038, 0.08);
    }
  }

  function scheduleMusic() {
    if (state.musicVolume <= 0 || !ensureAudio()) return;
    const bass = [130.81, 164.81, 196, 174.61];
    const melody = [523.25, 659.25, 783.99, 659.25, 587.33, 659.25, 523.25, 440];
    bass.forEach((note, index) => tone(note, 0.42, "sine", 0.04, index * 0.6, "music"));
    melody.forEach((note, index) => tone(note, 0.17, "triangle", 0.018, 0.15 + index * 0.3, "music"));
  }

  function startMusic() {
    if (state.musicVolume <= 0 || !ensureAudio() || musicTimer) return;
    scheduleMusic();
    musicTimer = window.setInterval(scheduleMusic, 2400);
  }

  function readPreferences() {
    try {
      const parsed = JSON.parse(localStorage.getItem(PREFERENCES_KEY) || "null");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function savePreferences() {
    try {
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify({
        presetId: state.presetId,
        opponent: state.opponent,
        difficulty: state.difficulty,
        fxEnabled: state.fxEnabled,
        musicVolume: state.musicVolume
      }));
    } catch (error) {}
  }

  function readSavedSession() {
    try {
      const parsed = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      return validateSession(parsed) ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  function validateSession(snapshot) {
    return Boolean(
      snapshot && snapshot.version === SESSION_VERSION &&
      Array.isArray(snapshot.board) && snapshot.board.length === 9 &&
      snapshot.pools && Array.isArray(snapshot.pools.black) && Array.isArray(snapshot.pools.white) &&
      snapshot.scores && Array.isArray(snapshot.history)
    );
  }

  function normalizedSnapshot() {
    const snapshot = JSON.parse(JSON.stringify(state));
    if (snapshot.phase === "ai-thinking") snapshot.phase = "playing";
    if (snapshot.phase === "flipping" || snapshot.phase === "rolling") snapshot.phase = "awaiting-toss";
    snapshot.selected = null;
    return snapshot;
  }

  function saveSession() {
    if (state.phase === "awaiting-toss" || state.phase === "flipping" || state.phase === "rolling") return;
    try {
      savedSession = normalizedSnapshot();
      localStorage.setItem(SESSION_KEY, JSON.stringify(savedSession));
      updateSavedControls();
    } catch (error) {}
  }

  function updateSavedControls() {
    renderSettings();
  }

  function resumeSavedSession() {
    const snapshot = readSavedSession();
    if (!snapshot) return;
    advanceEpoch();
    state = snapshot;
    state.selected = null;
    if (state.phase === "ai-thinking") state.phase = "playing";
    state.status = `Saved Round ${state.round} session restored.`;
    state.instruction = isActivePhase()
      ? "Tap or drag a die, then choose an open square."
      : state.instruction;
    render();
    const resumeFocusTarget = isComputerTurn()
      ? els.turnStatus
      : isActivePhase()
        ? firstActiveDieElement()
        : state.phase === "awaiting-toss"
          ? els.coinControl
          : els.roundRecap;
    const restoreAnnouncement = `${state.status} ${state.instruction}`;
    closeSettings(resumeFocusTarget);
    updateAudioState();
    if (state.musicVolume > 0) startMusic();
    if (state.matchWinner) {
      announceGameState(restoreAnnouncement);
      showWinner(state.matchWinner);
    } else if (isComputerTurn()) {
      startComputerTurnIfNeeded(restoreAnnouncement);
    } else {
      announceGameState(restoreAnnouncement);
    }
  }

  function clearSavedSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch (error) {}
    savedSession = null;
    renderSettings();
    announceGameState("Saved session cleared.");
  }

  function handleCellKeydown(event) {
    const directions = {
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0]
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();

    const current = Number(event.currentTarget.dataset.cell);
    let row = Math.floor(current / 3) + direction[0];
    let column = current % 3 + direction[1];

    while (row >= 0 && row < 3 && column >= 0 && column < 3) {
      const candidate = row * 3 + column;
      if (els.cells[candidate].getAttribute("aria-disabled") === "false") {
        focusSoon(els.cells[candidate]);
        return;
      }
      row += direction[0];
      column += direction[1];
    }
  }

  function bindEvents() {
    els.boxButton.addEventListener("click", openGame);
    els.introDialog.addEventListener("cancel", (event) => event.preventDefault());
    els.winnerDialog.addEventListener("cancel", (event) => event.preventDefault());
    els.reviewLedger.addEventListener("click", reviewFinalLedger);
    els.playAgain.addEventListener("click", () => performNewMatch({ keepSaved: true }));
    els.openSettings.addEventListener("click", openSettings);
    els.closeSettings.addEventListener("click", closeSettings);
    els.settingsDialog.addEventListener("close", () => {
      if (newMatchConfirming) cancelNewMatchConfirmation();
      const target = settingsCloseFocusTarget || settingsReturnFocus || els.openSettings;
      settingsCloseFocusTarget = null;
      settingsReturnFocus = null;
      focusSoon(target);
      window.requestAnimationFrame(() => startComputerTurnIfNeeded());
    });
    els.coinControl.addEventListener("click", flipCoin);
    els.primaryAction.addEventListener("click", startNextRoundAndRoll);
    els.restartRound.addEventListener("click", restartCurrentRound);
    els.newMatch.addEventListener("click", requestNewMatch);
    els.resumeSession.addEventListener("click", resumeSavedSession);
    els.clearSession.addEventListener("click", clearSavedSession);

    els.presetButtons.forEach((button) => {
      button.addEventListener("click", () => setPreset(button.dataset.preset));
    });
    els.opponentButtons.forEach((button) => {
      button.addEventListener("click", () => setOpponent(button.dataset.opponent));
    });
    els.difficultyButtons.forEach((button) => {
      button.addEventListener("click", () => setDifficulty(button.dataset.difficulty));
    });

    els.fxToggle.addEventListener("click", () => {
      state.fxEnabled = !state.fxEnabled;
      if (state.fxEnabled) ensureAudio();
      updateAudioPreference();
    });
    els.musicVolume.addEventListener("input", () => {
      state.musicVolume = clamp(Number(els.musicVolume.value) / 100, 0, 1);
      if (state.musicVolume > 0) startMusic();
      updateAudioPreference();
    });

    [...els.blackSlots, ...els.whiteSlots].forEach((slot) => {
      slot.addEventListener("click", () => selectDie(slot.dataset.color, slot.dataset.id));
      slot.addEventListener("keydown", (event) => {
        if (!["Enter", " ", "Spacebar"].includes(event.key)) return;
        event.preventDefault();
        selectDie(slot.dataset.color, slot.dataset.id);
      });
      slot.addEventListener("dragstart", (event) => {
        if (!selectDie(slot.dataset.color, slot.dataset.id, { drag: true })) {
          event.preventDefault();
          return;
        }
        slot.setAttribute("aria-pressed", "true");
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", slot.dataset.id);
      });
      slot.addEventListener("dragend", () => {
        els.cells.forEach((cell) => cell.classList.remove("drop-over"));
        if (state.selected) render({ focus: "cell" });
      });
    });

    els.cells.forEach((cell) => {
      cell.addEventListener("click", () => handleCellActivation(cell));
      cell.addEventListener("keydown", (event) => {
        if (["Enter", " ", "Spacebar"].includes(event.key)) {
          event.preventDefault();
          handleCellActivation(cell);
          return;
        }
        handleCellKeydown(event);
      });
      cell.addEventListener("dragover", (event) => {
        const index = Number(cell.dataset.cell);
        if (!state.selected || state.board[index] || state.phase !== "playing") return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        cell.classList.add("drop-over");
      });
      cell.addEventListener("dragleave", () => cell.classList.remove("drop-over"));
      cell.addEventListener("drop", (event) => {
        event.preventDefault();
        cell.classList.remove("drop-over");
        handleCellActivation(cell);
      });
    });

    window.addEventListener("pagehide", () => {
      if (musicTimer) window.clearInterval(musicTimer);
    });
  }

  function initialize() {
    bindEvents();
    render();
    els.appShell.inert = true;
    els.introDialog.showModal();
    focusSoon(els.boxButton);
  }

  initialize();
})();
