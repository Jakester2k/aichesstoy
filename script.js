const PIECE_IMAGES = {
    'w': {
        'p': 'https://upload.wikimedia.org/wikipedia/commons/4/45/Chess_plt45.svg',
        'n': 'https://upload.wikimedia.org/wikipedia/commons/7/70/Chess_nlt45.svg',
        'b': 'https://upload.wikimedia.org/wikipedia/commons/b/b1/Chess_blt45.svg',
        'r': 'https://upload.wikimedia.org/wikipedia/commons/7/72/Chess_rlt45.svg',
        'q': 'https://upload.wikimedia.org/wikipedia/commons/1/15/Chess_qlt45.svg',
        'k': 'https://upload.wikimedia.org/wikipedia/commons/4/42/Chess_klt45.svg'
    },
    'b': {
        'p': 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Chess_pdt45.svg',
        'n': 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Chess_ndt45.svg',
        'b': 'https://upload.wikimedia.org/wikipedia/commons/9/98/Chess_bdt45.svg',
        'r': 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Chess_rdt45.svg',
        'q': 'https://upload.wikimedia.org/wikipedia/commons/4/47/Chess_qdt45.svg',
        'k': 'https://upload.wikimedia.org/wikipedia/commons/f/f0/Chess_kdt45.svg'
    }
};

const PIECE_VALUES = { 'p': 10, 'n': 30, 'b': 30, 'r': 50, 'q': 90, 'k': 900 };

const game = new Chess();
let boardEl = document.getElementById('chessboard');
let selectedSquare = null;
let validMoves = [];

const speedSlider = document.getElementById('speed-slider');
const speedDisplay = document.getElementById('speed-display');
const depthSelect = document.getElementById('depth-select');
const whitePlayerSelect = document.getElementById('white-player');
const blackPlayerSelect = document.getElementById('black-player');

// Force reset on load to bypass aggressive browser input caching
whitePlayerSelect.value = 'human';
blackPlayerSelect.value = 'ai';
depthSelect.value = '3';
speedSlider.value = '50';

let whitePlayerType = whitePlayerSelect.value;
let blackPlayerType = blackPlayerSelect.value;
let aiPendingMove = null;

let currentAITurn = 0; 
let aiSearchDepth = parseInt(depthSelect.value);
let simDelay = 100;
let isPaused = false;
let moveHistory = [];
let currentMoveIndex = -1;

const TT = new Map();

let USE_AB = true;
let USE_MO = true;
let USE_TT = true;
let USE_ID = true;
let USE_QS = true;

document.getElementById('toggle-ab').addEventListener('change', e => USE_AB = e.target.checked);
document.getElementById('toggle-mo').addEventListener('change', e => USE_MO = e.target.checked);
document.getElementById('toggle-tt').addEventListener('change', e => { USE_TT = e.target.checked; TT.clear(); });
document.getElementById('toggle-id').addEventListener('change', e => USE_ID = e.target.checked);
document.getElementById('toggle-qs').addEventListener('change', e => USE_QS = e.target.checked);

let USE_HEATMAP = false;
document.getElementById('toggle-heatmap').addEventListener('change', e => {
    USE_HEATMAP = e.target.checked;
    drawHeatmap(game);
});

let USE_COMPRESS_GRAPH = false;
document.getElementById('toggle-compress').addEventListener('change', e => {
    USE_COMPRESS_GRAPH = e.target.checked;
    if (!USE_COMPRESS_GRAPH && efficiencyHistory.length > 50) {
        efficiencyHistory = efficiencyHistory.slice(efficiencyHistory.length - 50);
    }
    drawChart();
});

let nodesEvaluated = 0;
let cacheHits = 0;
let branchesPruned = 0;
let efficiencyHistory = [];

const metricNodesEl = document.getElementById('metric-nodes');
const metricCacheEl = document.getElementById('metric-cache');
const metricPrunedEl = document.getElementById('metric-pruned');
const metricEfficiencyEl = document.getElementById('metric-efficiency');
const metricsChart = document.getElementById('metrics-chart');
const metricsCtx = metricsChart ? metricsChart.getContext('2d') : null;

const evalFillEl = document.getElementById('eval-fill');
const evalTextEl = document.getElementById('eval-text');

function updateEvalBar(g) {
    if(!evalFillEl) return;
    let evalScore = evaluateBoard(g);
    nodesEvaluated--; // Don't count UI updates in metrics
    let percent = 50 + (evalScore / 100) * 50;
    percent = Math.max(0, Math.min(100, percent));
    evalFillEl.style.height = `${percent}%`;
    
    let displayScore = (evalScore / 10).toFixed(1);
    if (evalScore > 0) displayScore = "+" + displayScore;
    evalTextEl.innerText = displayScore;
}

function drawHeatmap(g) {
    document.querySelectorAll('.square').forEach(sq => {
        sq.classList.remove('heatmap-w1', 'heatmap-w2', 'heatmap-w3', 'heatmap-b1', 'heatmap-b2', 'heatmap-b3');
    });
    clearPrincipalVariation();
    if (!USE_HEATMAP) return;
    
    let control = {};
    const cols = 'abcdefgh';
    for(let r=1; r<=8; r++) {
        for(let c=0; c<8; c++) control[cols[c]+r] = 0;
    }
    
    let fen = g.fen();
    let parts = fen.split(' ');
    
    parts[1] = 'w';
    parts[3] = '-'; // clear en-passant to prevent invalid FEN error
    let tempW = new Chess(parts.join(' '));
    tempW.moves({verbose:true}).forEach(m => control[m.to] += 1);
    
    parts[1] = 'b';
    parts[3] = '-';
    let tempB = new Chess(parts.join(' '));
    tempB.moves({verbose:true}).forEach(m => control[m.to] -= 1);
    
    for(let sq in control) {
        let el = document.querySelector(`.square-${sq}`);
        if(!el) continue;
        let score = control[sq];
        if (score >= 3) el.classList.add('heatmap-w3');
        else if (score === 2) el.classList.add('heatmap-w2');
        else if (score === 1) el.classList.add('heatmap-w1');
        else if (score <= -3) el.classList.add('heatmap-b3');
        else if (score === -2) el.classList.add('heatmap-b2');
        else if (score === -1) el.classList.add('heatmap-b1');
    }
}

function drawPrincipalVariation(g, depth, firstMoveSan) {
    clearPrincipalVariation();
    let tempGame = new Chess(g.fen());
    
    if (firstMoveSan) {
        let m = tempGame.move(firstMoveSan);
        if (m) {
            let toEl = document.querySelector(`.square-${m.to}`);
            if (toEl) toEl.classList.add('pv-highlight');
        }
    }
    
    for (let i = (firstMoveSan ? 1 : 0); i < depth; i++) {
        let entry = TT.get(tempGame.fen());
        if (entry && entry.bestMove) {
            let m = tempGame.move(entry.bestMove);
            if (m) {
                let toEl = document.querySelector(`.square-${m.to}`);
                if (toEl) toEl.classList.add('pv-highlight');
            } else { break; }
        } else { break; }
    }
}

function clearPrincipalVariation() {
    document.querySelectorAll('.pv-highlight').forEach(el => el.classList.remove('pv-highlight'));
}

function drawChart() {
    if (!metricsCtx) return;
    const w = metricsChart.width;
    const h = metricsChart.height;
    metricsCtx.clearRect(0, 0, w, h);
    
    let len = efficiencyHistory.length;
    if (len === 0) return;
    
    metricsCtx.beginPath();
    metricsCtx.strokeStyle = '#10b981';
    metricsCtx.lineWidth = 2;
    
    let maxPoints = USE_COMPRESS_GRAPH ? Math.max(len - 1, 1) : 49;
    let step = w / maxPoints; 
    
    // Auto-scale Y axis to show micro-fluctuations
    let minEff = Math.min(...efficiencyHistory);
    let maxEff = Math.max(...efficiencyHistory);
    minEff = Math.max(0, minEff - 2); // 2% padding
    maxEff = Math.min(100, maxEff + 2);
    if (maxEff - minEff < 0.1) {
        minEff -= 1;
        maxEff += 1;
    }
    let range = maxEff - minEff;

    for (let i = 0; i < len; i++) {
        let x = i * step;
        let normalized = (efficiencyHistory[i] - minEff) / range;
        let y = h - (normalized * h);
        if (i === 0) metricsCtx.moveTo(x, y);
        else metricsCtx.lineTo(x, y);
    }
    metricsCtx.stroke();
    
    metricsCtx.lineTo((len - 1) * step, h);
    metricsCtx.lineTo(0, h);
    metricsCtx.fillStyle = 'rgba(16, 185, 129, 0.1)';
    metricsCtx.fill();
}

function updateMetricsDisplay() {
    if (!metricNodesEl) return;
    metricNodesEl.innerText = nodesEvaluated.toLocaleString();
    metricCacheEl.innerText = cacheHits.toLocaleString();
    metricPrunedEl.innerText = branchesPruned.toLocaleString();
    
    let totalWork = nodesEvaluated + (cacheHits * 10) + (branchesPruned * 20);
    let eff = totalWork === 0 ? 0 : ((totalWork - nodesEvaluated) / totalWork) * 100;
    
    if (!USE_AB && !USE_TT) eff = 0;
    metricEfficiencyEl.innerText = eff.toFixed(1) + "%";
    
    efficiencyHistory.push(eff);
    if (!USE_COMPRESS_GRAPH && efficiencyHistory.length > 50) {
        efficiencyHistory.shift();
    }
    
    drawChart();
}

// Initialize speed correctly from preserved slider value
let initialFreq = parseInt(speedSlider.value);
if (initialFreq === parseInt(speedSlider.max)) {
    simDelay = 0;
    speedDisplay.innerText = "MAX";
} else {
    simDelay = initialFreq === 0 ? 10000 : Math.floor(1000 / initialFreq);
    speedDisplay.innerText = initialFreq + " Hz";
}

const explanationLog = document.getElementById('explanation-log');
const actionBtn = document.getElementById('action-btn');
const pauseBtn = document.getElementById('pause-btn');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function checkPause() {
    while (isPaused) {
        await sleep(100);
    }
}

async function typeText(element, htmlString, typingSpeed = 4) {
    let currentHTML = element.innerHTML;
    let i = 0;
    while (i < htmlString.length) {
        await checkPause();
        if (htmlString[i] === '<') {
            let tag = '';
            while (htmlString[i] !== '>' && i < htmlString.length) {
                tag += htmlString[i];
                i++;
            }
            tag += '>';
            currentHTML += tag;
            element.innerHTML = currentHTML;
            i++;
        } else if (htmlString[i] === '&') {
            let entity = '';
            while (htmlString[i] !== ';' && i < htmlString.length) {
                entity += htmlString[i];
                i++;
            }
            entity += ';';
            currentHTML += entity;
            element.innerHTML = currentHTML;
            i++;
            await sleep(typingSpeed);
        } else {
            currentHTML += htmlString[i];
            element.innerHTML = currentHTML;
            i++;
            await sleep(typingSpeed);
        }
        explanationLog.scrollTop = explanationLog.scrollHeight;
    }
}

async function typeLog(htmlString, className = '') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${className}`;
    explanationLog.appendChild(entry);
    await typeText(entry, htmlString);
    return entry;
}

function appendLog(html, className = '') {
    const entry = document.createElement('div');
    entry.className = `log-entry ${className}`;
    entry.innerHTML = html;
    explanationLog.appendChild(entry);
    explanationLog.scrollTop = explanationLog.scrollHeight;
    return entry;
}

function clearLog() {
    explanationLog.innerHTML = '';
}

speedSlider.addEventListener('input', (e) => {
    let freq = parseInt(e.target.value);
    if (freq === parseInt(speedSlider.max)) {
        simDelay = 0;
        speedDisplay.innerText = "MAX";
    } else {
        simDelay = freq === 0 ? 10000 : Math.floor(1000 / freq);
        speedDisplay.innerText = freq + " Hz";
    }
});

depthSelect.addEventListener('change', (e) => {
    aiSearchDepth = parseInt(e.target.value);
    // Abort current AI turn and re-evaluate at new depth immediately
    currentAITurn++; 
    isPaused = false;
    pauseBtn.innerText = 'Pause';
    pauseBtn.style.background = '#10b981';
    clearAllSims();
    clearLog();
    checkGameState();
});

pauseBtn.addEventListener('click', () => {
    isPaused = !isPaused;
    pauseBtn.innerText = isPaused ? 'Resume' : 'Pause';
    pauseBtn.style.background = isPaused ? '#f59e0b' : '#10b981';
});

whitePlayerSelect.addEventListener('change', (e) => {
    whitePlayerType = e.target.value;
    checkGameState();
});
blackPlayerSelect.addEventListener('change', (e) => {
    blackPlayerType = e.target.value;
    checkGameState();
});
document.getElementById('restart-btn').addEventListener('click', restartGame);

function updateUndoRedoButtons() {
    document.getElementById('undo-btn').disabled = currentMoveIndex < 0;
    document.getElementById('redo-btn').disabled = currentMoveIndex >= moveHistory.length - 1;
}

document.getElementById('undo-btn').addEventListener('click', () => {
    if (currentMoveIndex >= 0) {
        currentAITurn++; 
        isPaused = false;
        pauseBtn.innerText = 'Pause';
        pauseBtn.style.background = '#10b981';
        
        clearAllSims();
        clearLog();
        actionBtn.innerText = "Waiting...";
        actionBtn.disabled = true;
        
        game.undo();
        currentMoveIndex--;
        updateBoard();
        updateUndoRedoButtons();
        checkGameState();
    }
});

document.getElementById('redo-btn').addEventListener('click', () => {
    if (currentMoveIndex < moveHistory.length - 1) {
        currentAITurn++; 
        isPaused = false;
        pauseBtn.innerText = 'Pause';
        pauseBtn.style.background = '#10b981';
        
        clearAllSims();
        clearLog();
        actionBtn.innerText = "Waiting...";
        actionBtn.disabled = true;
        
        currentMoveIndex++;
        game.move(moveHistory[currentMoveIndex]);
        updateBoard();
        updateUndoRedoButtons();
        checkGameState();
    }
});

actionBtn.addEventListener('click', () => {
    if (aiPendingMove) {
        executeAIMove();
    }
});

function initBoard() {
    boardEl.innerHTML = '';
    const fragment = document.createDocumentFragment();
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const square = document.createElement('div');
            square.className = `square ${(r + c) % 2 === 0 ? 'light' : 'dark'}`;
            const file = String.fromCharCode(97 + c);
            const rank = 8 - r;
            square.dataset.square = `${file}${rank}`;
            square.classList.add(`square-${file}${rank}`);
            square.addEventListener('click', () => handleSquareClick(square.dataset.square));
            fragment.appendChild(square);
        }
    }
    boardEl.appendChild(fragment);
    updateBoard();
    updateUndoRedoButtons();
}

function updateBoard() {
    const squares = boardEl.querySelectorAll('.square');
    squares.forEach(sq => {
        const pieceEl = sq.querySelector('.piece');
        if (pieceEl) pieceEl.remove();
        
        sq.classList.remove('selected', 'valid-move', 'sim-level-0', 'sim-level-1', 'sim-level-2', 'sim-level-3', 'sim-level-4');
        
        if (selectedSquare === sq.dataset.square) {
            sq.classList.add('selected');
        }
        
        if (validMoves.some(m => m.to === sq.dataset.square)) {
            sq.classList.add('valid-move');
        }

        const piece = game.get(sq.dataset.square);
        if (piece) {
            const img = document.createElement('div');
            img.className = 'piece';
            img.style.backgroundImage = `url(${PIECE_IMAGES[piece.color][piece.type]})`;
            sq.appendChild(img);
        }
    });
    
    updateEvalBar(game);
    drawHeatmap(game);
}

function highlightSim(from, to, currentSearchDepth) {
    let level = currentSearchDepth === "Q" ? 5 : aiSearchDepth - currentSearchDepth;
    clearSim(level);
    const fromSq = boardEl.querySelector(`[data-square="${from}"]`);
    const toSq = boardEl.querySelector(`[data-square="${to}"]`);
    if (fromSq) fromSq.classList.add(`sim-level-${level}`);
    if (toSq) toSq.classList.add(`sim-level-${level}`);
}

function clearSim(level) {
    boardEl.querySelectorAll(`.sim-level-${level}`).forEach(el => el.classList.remove(`sim-level-${level}`));
}

function clearAllSims() {
    for (let i = 0; i <= 5; i++) {
        clearSim(i);
    }
}

function executeMoveOnBoard(san) {
    if (currentMoveIndex < moveHistory.length - 1) {
        moveHistory = moveHistory.slice(0, currentMoveIndex + 1);
    }
    moveHistory.push(san);
    currentMoveIndex++;
    
    game.move(san);
    updateBoard();
    updateUndoRedoButtons();
    checkGameState();
}

function handleSquareClick(squareId) {
    if (aiPendingMove || actionBtn.innerText === "AI is Thinking...") return; 
    const currentTurn = game.turn() === 'w' ? whitePlayerType : blackPlayerType;
    if (currentTurn === 'ai') return; 

    const move = validMoves.find(m => m.to === squareId);
    if (move) {
        if (move.flags.includes('p')) {
            move.san = move.san.replace('+', '').replace('#', '') + '=Q';
        }
        selectedSquare = null;
        validMoves = [];
        executeMoveOnBoard(move.san);
        return;
    }

    const piece = game.get(squareId);
    if (piece && piece.color === game.turn()) {
        selectedSquare = squareId;
        validMoves = game.moves({ square: squareId, verbose: true });
    } else {
        selectedSquare = null;
        validMoves = [];
    }
    updateBoard();
}

function restartGame() {
    currentAITurn++; 
    game.reset();
    selectedSquare = null;
    validMoves = [];
    aiPendingMove = null;
    moveHistory = [];
    currentMoveIndex = -1;
    isPaused = false;
    pauseBtn.innerText = 'Pause';
    pauseBtn.style.background = '#10b981';
    
    clearAllSims();
    clearLog();
    appendLog("Game restarted. Waiting for move...");
    actionBtn.disabled = true;
    actionBtn.innerText = "Waiting...";
    updateBoard();
    updateUndoRedoButtons();
    checkGameState();
}

function checkGameState() {
    if (game.game_over()) {
        if (game.in_checkmate()) {
            appendLog(`<strong>Checkmate! ${game.turn() === 'w' ? 'Black' : 'White'} wins.</strong>`, 'new-best');
        } else if (game.in_draw()) {
            appendLog("<strong>Game Over. It's a draw.</strong>");
        }
        actionBtn.disabled = true;
        actionBtn.innerText = "Game Over";
        return;
    }

    const currentTurn = game.turn() === 'w' ? whitePlayerType : blackPlayerType;
    if (currentTurn === 'ai') {
        prepareAIMove();
    } else {
        clearLog();
        appendLog(`Waiting for ${game.turn() === 'w' ? 'White' : 'Black'} (Human) to move...`);
        actionBtn.disabled = true;
        actionBtn.innerText = "Waiting for Human...";
    }
}

function prepareAIMove() {
    clearLog();
    actionBtn.disabled = true;
    actionBtn.innerText = "AI is Thinking...";
    runAIThoughtProcess(game);
}

async function runAIThoughtProcess(gameInstance) {
    const turnId = ++currentAITurn;
    const moves = gameInstance.moves({ verbose: true });
    
    let isMaximizing = gameInstance.turn() === 'w';
    const colorName = isMaximizing ? 'White' : 'Black';
    const logClass = isMaximizing ? 'white-ai-log' : 'black-ai-log';

    await typeLog(`<b>[${colorName} AI] Starting Turn Analysis</b>`, logClass);
    await typeLog(`Searching <b>${aiSearchDepth} moves deep</b> to evaluate ${moves.length} legal options...`, logClass);

    // Warm up cache using silent iterative deepening
    nodesEvaluated = 0;
    cacheHits = 0;
    branchesPruned = 0;
    updateMetricsDisplay();

    TT.clear(); 
    if (USE_ID && aiSearchDepth > 1) {
        await typeLog(`<i>Iterative Deepening: Warming up Transposition Table...</i>`, logClass);
        for (let d = 1; d < aiSearchDepth; d++) {
            silent_minimax(gameInstance, d, -Infinity, Infinity, isMaximizing);
        }
        await typeLog(`<i>Cache Warm! Transposition Table contains optimal pathing. Starting visual search...</i>`, logClass);
    }
    await typeLog(`<hr style="border-color: rgba(255,255,255,0.1); margin: 8px 0;">`, logClass);

    let fen = gameInstance.fen();
    let ttEntry = USE_TT ? TT.get(fen) : null;
    let ttBestMove = ttEntry ? ttEntry.bestMove : null;

    if (USE_MO) {
        moves.sort((a, b) => {
            if (ttBestMove && a.san === ttBestMove) return -10000;
            if (ttBestMove && b.san === ttBestMove) return 10000;
            let scoreA = (a.captured ? 10 : 0) + (a.flags.includes('p') ? 20 : 0);
            let scoreB = (b.captured ? 10 : 0) + (b.flags.includes('p') ? 20 : 0);
            return scoreB - scoreA;
        });
    }

    let bestMove = null;
    let bestValue = isMaximizing ? -Infinity : Infinity;

    for (let i = 0; i < moves.length; i++) {
        await checkPause();
        if (turnId !== currentAITurn) return; 
        
        const move = moves[i];
        const pieceName = getPieceName(move.piece);
        highlightSim(move.from, move.to, aiSearchDepth);
        
        let introText = `<b>[${i+1}/${moves.length}] Considering ${pieceName} ${move.from} &rarr; ${move.to}</b>`;
        if (move.captured) introText += ` <i>(Captures ${getPieceName(move.captured)})</i>`;
        
        const entry = document.createElement('div');
        entry.className = `log-entry ${logClass}`;
        explanationLog.appendChild(entry);
        
        await typeText(entry, introText);
        await typeText(entry, `<br>&nbsp;&nbsp;&bull; Simulating responses... `);
        
        if (simDelay > 0) {
            let delayMultiplier = Math.pow(1.5, aiSearchDepth - 1);
            await sleep(simDelay * delayMultiplier);
        }
        
        gameInstance.move(move.san);
        const boardValue = await minimax_async(gameInstance, aiSearchDepth - 1, -Infinity, Infinity, !isMaximizing, turnId);
        gameInstance.undo();
        
        await checkPause();
        if (turnId !== currentAITurn) return;
        
        let advantage = boardValue === 0 ? 'Exactly Even' : (boardValue > 0 ? `White +${boardValue}` : `Black +${-boardValue}`);
        await typeText(entry, `Resulting state score is <b>${boardValue}</b> (${advantage}). `);
        
        updateMetricsDisplay();

        let isNewBest = false;
        if (isMaximizing) {
            if (boardValue > bestValue) { bestValue = boardValue; bestMove = move; isNewBest = true; }
        } else {
            if (boardValue < bestValue) { bestValue = boardValue; bestMove = move; isNewBest = true; }
        }

        if (isNewBest) {
            entry.classList.add('new-best');
            await typeText(entry, `<br>&nbsp;&nbsp;&bull; <span style="color: #10b981; font-weight: bold;">This is the best sequence found so far!</span>`);
        } else {
            await typeText(entry, `<br>&nbsp;&nbsp;&bull; Discarding (score is worse than or equal to my current best option).`);
        }
        
        await sleep(40); 
    }

    if (turnId !== currentAITurn) return;
    
    clearAllSims();
    aiPendingMove = bestMove || moves[Math.floor(Math.random() * moves.length)];
    
    // Highlight the final chosen move so the user sees what they are approving
    highlightSim(aiPendingMove.from, aiPendingMove.to, aiSearchDepth);
    drawPrincipalVariation(gameInstance, aiSearchDepth, aiPendingMove.san);
    
    updateMetricsDisplay();

    const explanation = generateExplanation(aiPendingMove);
    await typeLog(`<b>[${colorName} AI] Analysis Complete!</b><br>After reviewing all possibilities, my decision is made.<br>${explanation}<br><br><i>Waiting for your approval to execute this move...</i>`, `${logClass} new-best`);
    
    actionBtn.disabled = false;
    actionBtn.innerText = "Approve Move";
}

function silent_quiescence(g, alpha, beta, isMaximizing, qDepth = 0) {
    let standPat = evaluateBoard(g);
    if (isMaximizing) {
        if (standPat >= beta) return beta;
        alpha = Math.max(alpha, standPat);
    } else {
        if (standPat <= alpha) return alpha;
        beta = Math.min(beta, standPat);
    }
    if (qDepth > 4) return standPat;

    const moves = g.moves({ verbose: true }).filter(m => m.captured);
    if (USE_MO) moves.sort((a, b) => PIECE_VALUES[b.captured] - PIECE_VALUES[a.captured]);

    if (isMaximizing) {
        let bestVal = standPat;
        for (let i = 0; i < moves.length; i++) {
            g.move(moves[i].san);
            let value = silent_quiescence(g, alpha, beta, !isMaximizing, qDepth + 1);
            g.undo();
            bestVal = Math.max(bestVal, value);
            if (USE_AB) {
                alpha = Math.max(alpha, bestVal);
                if (beta <= alpha) break;
            }
        }
        return bestVal;
    } else {
        let bestVal = standPat;
        for (let i = 0; i < moves.length; i++) {
            g.move(moves[i].san);
            let value = silent_quiescence(g, alpha, beta, !isMaximizing, qDepth + 1);
            g.undo();
            bestVal = Math.min(bestVal, value);
            if (USE_AB) {
                beta = Math.min(beta, bestVal);
                if (beta <= alpha) break;
            }
        }
        return bestVal;
    }
}

function silent_minimax(g, depth, alpha, beta, isMaximizing) {
    if (depth === 0) {
        if (USE_QS) return silent_quiescence(g, alpha, beta, isMaximizing);
        return evaluateBoard(g);
    }
    if (g.game_over()) return evaluateBoard(g);

    let fen = g.fen();
    if (USE_TT) {
        let ttEntry = TT.get(fen);
        if (ttEntry && ttEntry.depth >= depth) {
            if (ttEntry.flag === 'EXACT') return ttEntry.value;
            if (ttEntry.flag === 'LOWERBOUND' && ttEntry.value >= beta) return ttEntry.value;
            if (ttEntry.flag === 'UPPERBOUND' && ttEntry.value <= alpha) return ttEntry.value;
        }
    }

    const moves = g.moves({ verbose: true });
    let ttEntry = USE_TT ? TT.get(fen) : null;
    let ttBestMove = ttEntry ? ttEntry.bestMove : null;
    if (USE_MO) {
        moves.sort((a, b) => {
            if (ttBestMove && a.san === ttBestMove) return -10000;
            if (ttBestMove && b.san === ttBestMove) return 10000;
            let scoreA = (a.captured ? PIECE_VALUES[a.captured] * 10 : 0) + (a.flags.includes('p') ? 20 : 0);
            let scoreB = (b.captured ? PIECE_VALUES[b.captured] * 10 : 0) + (b.flags.includes('p') ? 20 : 0);
            return scoreB - scoreA;
        });
    }

    let bestMoveSan = null;
    if (isMaximizing) {
        let bestVal = -Infinity;
        let alphaOrig = alpha;
        for (let i = 0; i < moves.length; i++) {
            g.move(moves[i].san);
            let value = silent_minimax(g, depth - 1, alpha, beta, !isMaximizing);
            g.undo();
            if (value > bestVal) { bestVal = value; bestMoveSan = moves[i].san; }
            if (USE_AB) {
                alpha = Math.max(alpha, bestVal);
                if (beta <= alpha) break;
            }
        }
        if (USE_TT) {
            let flag = 'EXACT';
            if (USE_AB) {
                if (bestVal <= alphaOrig) flag = 'UPPERBOUND';
                else if (bestVal >= beta) flag = 'LOWERBOUND';
            }
            TT.set(fen, { depth, value: bestVal, flag, bestMove: bestMoveSan });
        }
        return bestVal;
    } else {
        let bestVal = Infinity;
        let betaOrig = beta;
        for (let i = 0; i < moves.length; i++) {
            g.move(moves[i].san);
            let value = silent_minimax(g, depth - 1, alpha, beta, !isMaximizing);
            g.undo();
            if (value < bestVal) { bestVal = value; bestMoveSan = moves[i].san; }
            if (USE_AB) {
                beta = Math.min(beta, bestVal);
                if (beta <= alpha) break;
            }
        }
        if (USE_TT) {
            let flag = 'EXACT';
            if (USE_AB) {
                if (bestVal >= betaOrig) flag = 'LOWERBOUND';
                else if (bestVal <= alpha) flag = 'UPPERBOUND';
            }
            TT.set(fen, { depth, value: bestVal, flag, bestMove: bestMoveSan });
        }
        return bestVal;
    }
}

async function quiescence_async(g, alpha, beta, isMaximizingPlayer, turnId, qDepth = 0) {
    if (turnId !== currentAITurn) return 0;
    let standPat = evaluateBoard(g);
    
    if (isMaximizingPlayer) {
        if (standPat >= beta) return beta;
        alpha = Math.max(alpha, standPat);
    } else {
        if (standPat <= alpha) return alpha;
        beta = Math.min(beta, standPat);
    }
    
    if (qDepth > 4) return standPat;

    const moves = g.moves({ verbose: true }).filter(m => m.captured);
    moves.sort((a, b) => PIECE_VALUES[b.captured] - PIECE_VALUES[a.captured]);

    if (isMaximizingPlayer) {
        let bestVal = standPat;
        for (let i = 0; i < moves.length; i++) {
            if (turnId !== currentAITurn) return 0;
            g.move(moves[i].san);
            
            highlightSim(moves[i].from, moves[i].to, "Q");
            if (simDelay > 0) await sleep(simDelay);
            
            if (turnId !== currentAITurn) { g.undo(); return 0; }
            let value = await quiescence_async(g, alpha, beta, !isMaximizingPlayer, turnId, qDepth + 1);
            g.undo();
            if (turnId !== currentAITurn) return 0;
            
            clearSim(5);
            updateMetricsDisplay();

            bestVal = Math.max(bestVal, value);
            if (USE_AB) {
                alpha = Math.max(alpha, bestVal);
                if (beta <= alpha) { branchesPruned++; break; }
            }
        }
        return bestVal;
    } else {
        let bestVal = standPat;
        for (let i = 0; i < moves.length; i++) {
            if (turnId !== currentAITurn) return 0;
            g.move(moves[i].san);
            
            highlightSim(moves[i].from, moves[i].to, "Q");
            if (simDelay > 0) await sleep(simDelay);
            
            if (turnId !== currentAITurn) { g.undo(); return 0; }
            let value = await quiescence_async(g, alpha, beta, !isMaximizingPlayer, turnId, qDepth + 1);
            g.undo();
            if (turnId !== currentAITurn) return 0;
            
            clearSim(5);
            updateMetricsDisplay();

            bestVal = Math.min(bestVal, value);
            if (USE_AB) {
                beta = Math.min(beta, bestVal);
                if (beta <= alpha) { branchesPruned++; break; }
            }
        }
        return bestVal;
    }
}

async function minimax_async(g, depth, alpha, beta, isMaximizingPlayer, turnId) {
    await checkPause();
    if (turnId !== currentAITurn) return 0; 
    if (depth === 0) {
        if (USE_QS) return quiescence_async(g, alpha, beta, isMaximizingPlayer, turnId);
        return evaluateBoard(g);
    }
    if (g.game_over()) return evaluateBoard(g);

    let fen = g.fen();
    if (USE_TT) {
        let ttEntry = TT.get(fen);
        if (ttEntry && ttEntry.depth >= depth) {
            if (ttEntry.flag === 'EXACT') { cacheHits++; return ttEntry.value; }
            if (ttEntry.flag === 'LOWERBOUND' && ttEntry.value >= beta) { cacheHits++; return ttEntry.value; }
            if (ttEntry.flag === 'UPPERBOUND' && ttEntry.value <= alpha) { cacheHits++; return ttEntry.value; }
        }
    }

    const moves = g.moves({ verbose: true });
    let ttEntry = USE_TT ? TT.get(fen) : null;
    let ttBestMove = ttEntry ? ttEntry.bestMove : null;
    if (USE_MO) {
        moves.sort((a, b) => {
            if (ttBestMove && a.san === ttBestMove) return -10000;
            if (ttBestMove && b.san === ttBestMove) return 10000;
            let scoreA = (a.captured ? PIECE_VALUES[a.captured] * 10 : 0) + (a.flags.includes('p') ? 20 : 0);
            let scoreB = (b.captured ? PIECE_VALUES[b.captured] * 10 : 0) + (b.flags.includes('p') ? 20 : 0);
            return scoreB - scoreA;
        });
    }

    let delayMultiplier = Math.pow(1.5, depth - 1); 
    let bestMoveSan = null;
    
    if (isMaximizingPlayer) {
        let bestVal = -Infinity;
        let alphaOrig = alpha;
        for (let i = 0; i < moves.length; i++) {
            if (turnId !== currentAITurn) return 0;
            g.move(moves[i].san);
            
            highlightSim(moves[i].from, moves[i].to, depth);
            if (simDelay > 0) {
                await sleep(simDelay * delayMultiplier);
            }
            
            if (turnId !== currentAITurn) { g.undo(); return 0; }
            let value = await minimax_async(g, depth - 1, alpha, beta, !isMaximizingPlayer, turnId);
            g.undo();
            if (turnId !== currentAITurn) return 0;
            
            let level = aiSearchDepth - depth;
            clearSim(level);
            updateMetricsDisplay();

            if (value > bestVal) { bestVal = value; bestMoveSan = moves[i].san; }
            if (USE_AB) {
                alpha = Math.max(alpha, bestVal);
                if (beta <= alpha) { branchesPruned++; break; }
            }
        }
        
        if (USE_TT) {
            let flag = 'EXACT';
            if (USE_AB) {
                if (bestVal <= alphaOrig) flag = 'UPPERBOUND';
                else if (bestVal >= beta) flag = 'LOWERBOUND';
            }
            TT.set(fen, { depth, value: bestVal, flag, bestMove: bestMoveSan });
        }
        return bestVal;
    } else {
        let bestVal = Infinity;
        let betaOrig = beta;
        for (let i = 0; i < moves.length; i++) {
            if (turnId !== currentAITurn) return 0;
            g.move(moves[i].san);
            
            highlightSim(moves[i].from, moves[i].to, depth);
            if (simDelay > 0) {
                await sleep(simDelay * delayMultiplier); 
            }

            if (turnId !== currentAITurn) { g.undo(); return 0; }
            let value = await minimax_async(g, depth - 1, alpha, beta, !isMaximizingPlayer, turnId);
            g.undo();
            if (turnId !== currentAITurn) return 0;
            
            let level = aiSearchDepth - depth;
            clearSim(level);
            updateMetricsDisplay();

            if (value < bestVal) { bestVal = value; bestMoveSan = moves[i].san; }
            if (USE_AB) {
                beta = Math.min(beta, bestVal);
                if (beta <= alpha) { branchesPruned++; break; }
            }
        }
        
        if (USE_TT) {
            let flag = 'EXACT';
            if (USE_AB) {
                if (bestVal >= betaOrig) flag = 'LOWERBOUND';
                else if (bestVal <= alpha) flag = 'UPPERBOUND';
            }
            TT.set(fen, { depth, value: bestVal, flag, bestMove: bestMoveSan });
        }
        return bestVal;
    }
}

function executeAIMove() {
    if (!aiPendingMove) return;
    
    if (aiPendingMove.flags.includes('p')) {
        aiPendingMove.san = aiPendingMove.san.replace('+', '').replace('#', '') + '=Q';
    }
    
    let san = aiPendingMove.san;
    aiPendingMove = null;
    clearAllSims();
    actionBtn.disabled = true;
    executeMoveOnBoard(san);
}

function getPieceName(pieceType) {
    const names = { 'p': 'Pawn', 'n': 'Knight', 'b': 'Bishop', 'r': 'Rook', 'q': 'Queen', 'k': 'King' };
    return names[pieceType];
}

function generateExplanation(moveObj) {
    const color = moveObj.color === 'w' ? 'White' : 'Black';
    const pieceName = getPieceName(moveObj.piece);
    let text = `The ${color} ${pieceName} moves from ${moveObj.from} to ${moveObj.to}.`;
    
    if (moveObj.flags.includes('c') || moveObj.flags.includes('e')) {
        text += ` It captures an opponent's piece.`;
    }
    if (moveObj.flags.includes('k')) {
        text = `The ${color} King castles kingside.`;
    }
    if (moveObj.flags.includes('q')) {
        text = `The ${color} King castles queenside.`;
    }
    if (moveObj.flags.includes('p')) {
        text += ` The pawn is promoted to a Queen!`;
    }
    
    game.move(moveObj.san);
    if (game.in_checkmate()) {
        text += " Checkmate!";
    } else if (game.in_check()) {
        text += " Check!";
    }
    game.undo();
    
    return text;
}

function evaluateBoard(g) {
    nodesEvaluated++;
    let score = 0;
    const board = g.board();
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
            const piece = board[r][c];
            if (piece) {
                const val = PIECE_VALUES[piece.type];
                const posBonus = (piece.type === 'p' || piece.type === 'n') && (r >= 3 && r <= 4 && c >= 3 && c <= 4) ? 2 : 0;
                score += piece.color === 'w' ? (val + posBonus) : -(val + posBonus);
            }
        }
    }
    return score;
}

initBoard();
checkGameState();
