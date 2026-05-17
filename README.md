# AI Chess Diagnostics Engine ♟️

Welcome to **AIChess**, a highly interactive, educational web tool designed to demystify how modern chess engines "think." By combining a traditional chess-playing interface with rich, real-time diagnostic visualizations, AIChess makes complex algorithms like Minimax and Alpha-Beta Pruning easy to understand.

![AIChess Engine Interface](./screenshot.png) 
*(Note: Remember to save your screenshot as `screenshot.png` in the project root!)*

## 🌟 Overview

Standard chess engines operate like black boxes—they think for a few seconds and then spit out a move. AIChess opens that box up. Through a visual, step-by-step "narrative" and vivid board overlays, you can literally watch the AI as it explores the move tree, simulates future positions, and evaluates the board.

## ✨ Core Features

### 🧠 Engine Internals & Toggles
Experiment with the core optimizations that make modern chess engines fast. You can toggle each of these on or off in real-time to see their exact impact on performance:
* **Alpha-Beta Pruning:** Skips evaluating branches that are demonstrably worse than previously examined options.
* **Move Ordering:** Evaluates captures and high-impact moves first to trigger early Alpha-Beta cutoffs.
* **Transposition Table (Cache):** Memorizes previously seen board states to avoid redundant, expensive calculations.
* **Iterative Deepening:** Warms up the cache by searching at shallow depths before progressively diving deeper.
* **Quiescence Search:** Extends the search path beyond the target depth if there are pending captures, preventing the engine from blundering due to the "horizon effect."

### 📊 Real-Time Metrics & Analytics
* **Positions Examined, Cache Hits, & Pruning Cutoffs:** See exactly how much work the engine is doing (and how much it's successfully skipping).
* **Efficiency Score & Timeline:** A live line-chart that tracks how efficiently the engine prunes the search tree over time.

### 👁️ Visual Board Diagnostics
* **Vertical Evaluation Bar:** A dynamic bar beside the board that provides real-time feedback on who is winning (evaluated in centipawns), styled like professional chess broadcasts.
* **Positional Control Heatmap:** Toggle a vivid overlay that colors the board squares based on which side attacks or defends them.
* **Visual Search Paths:** As the engine thinks, the board lights up with different colors to represent its search tree:
  * 🟪 **Candidate Move**
  * 🟧 **Opponent Response**
  * 🟩 **Counter-Response**
  * 🟪 **Deeper Search**
  * 🟨 **Quiescence Search**
  * 🟦 **Expected Path (PV)**

### 📝 AI Narrative Log
The **AI Narrative** panel translates the engine's math into plain English. It explains exactly what the engine is considering (*"Considering Pawn d5 -> e4"*), what the resulting positional score is, and whether it decides to discard the line or keep it as the new best expected option.

### ⚙️ Interactive Controls
* **Human vs. AI Configuration:** Play against the engine, watch the engine play against itself, or use it as a sandbox analysis board.
* **Search Depth:** Adjust how many moves ahead the engine looks.
* **Visualization Speed (Hz):** Slow the AI's thought process down to a crawl to analyze it step-by-step, or speed it up for a faster game.
* **Pause / Step Actions:** Pause the AI mid-thought to inspect a specific branch in the search tree.

## 🚀 Getting Started

Running the project locally is incredibly simple. All you need is Python installed to serve the static files.

1. Clone the repository:
   ```bash
   git clone git@gitlab.com:jakester2k/aichesstoy.git
   cd aichesstoy
   ```

2. Start the local HTTP server:
   ```bash
   python3 -m http.server 8000
   ```

3. Open your browser and navigate to:
   [http://localhost:8000](http://localhost:8000)

## 🛠️ Built With
* **HTML / Vanilla CSS:** Designed with a sleek, modern, glassmorphic UI.
* **Vanilla JavaScript:** All engine logic, minimax algorithms, and UI state updates are written in pure JS without heavy frontend frameworks.
* **[chess.js](https://github.com/jhlywa/chess.js):** Utilized for fundamental move generation, legality validation, and FEN parsing.
