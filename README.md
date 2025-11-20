# 🎲 Yahtzee Pro: The Optimal Strategy Trainer

[![React Badge](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Tailwind CSS Badge](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)

**Yahtzee Pro** is a modern, responsive web application built with React and Tailwind CSS that pits you against a powerful AI opponent. This isn't just a simple Yahtzee game; the core feature is the **Pro Strategy Advisor**, which calculates the highest Expected Value (EV) for every roll decision, helping you master optimal Yahtzee strategy.

The game supports both a "Standard" bot (using static heuristics) and a "Pro" bot (using dynamic, goal-aware weights).
## 🎲 [Play Here](https://drgzkr.github.io/yatze-react-app/) 🎲

## ✨ Features

  * **Pro Strategy Advisor**: Receives real-time recommendations on which dice to hold for the best possible score, calculated using a probabilistic Expected Value (EV) engine.
  * **Two Bot Modes**: Challenge the **Standard** bot (basic strategy) or the **Pro** bot (advanced, dynamic strategy that changes based on its current score deficit/surplus).
  * **Fully Responsive Design**: Play seamlessly on desktop, tablet, or mobile devices.
  * **System Dark Mode**: Includes a system-preference aware dark mode for comfortable late-night gaming.
  * **Turn-by-Turn Logging**: Easily track the Pro Bot's decisions and final score selection after each player turn.
  * **Real-Time Scoring**: Potential points are instantly calculated and displayed for open categories.

## 🧠 The Pro Strategy Advisor (AI Logic)

The Pro Strategy Advisor uses an AI model based on Expected Value (EV) calculation:

1.  **State Definition**: The model considers the current dice hand, the number of rolls remaining (1 or 2), and the categories still open on the scorecard.
2.  **Probability Mapping**: For every combination of dice the player could hold, the model calculates the probability distribution of all possible hands resulting from the subsequent roll(s).
3.  **Weighted Scoring**: The model uses a weighted score, calculating the difference between the raw potential score and a target "par" value for each open category. This ensures low-value categories are not selected prematurely.
4.  **Minimax Search (Simplified)**: The core engine uses recursion to determine the optimal dice configuration to keep by calculating the highest expected value (EV) achievable over all remaining rolls.

The **Pro Bot** uses a further enhancement called **Dynamic Weighting**, where category weights (the "par" score needed to make a category worthwhile) are adjusted based on the bot's progress toward the 63-point Upper Section bonus.

## 🚀 Getting Started

### Prerequisites

You need [Node.js](https://nodejs.org/) and [npm](https://www.npmjs.com/) installed on your machine.

### Installation

1.  **Clone the repository:**

    ```bash
    git clone [https://github.com/YOUR_USERNAME/yahtzee-pro.git](https://github.com/YOUR_USERNAME/yahtzee-pro.git)
    cd yahtzee-pro
    ```

2.  **Install dependencies:**

    ```bash
    npm install
    ```

3.  **Run the application locally:**

    ```bash
    npm start
    ```

    The app will typically open in your browser at `http://localhost:3000`.

## ⚙️ Deployment (GitHub Pages)

To deploy this application to GitHub Pages, follow these steps:

1.  **Install `gh-pages`:**

    ```bash
    npm install --save-dev gh-pages
    ```

2.  **Add `homepage` and scripts to `package.json`:**

    Open your `package.json` and add a `homepage` key pointing to your GitHub Pages URL, and update the `scripts` section:

    ```json
    "homepage": "https://[yourusername].github.io/yahtzee-pro",
    "scripts": {
      "start": "react-scripts start",
      "build": "react-scripts build",
      "test": "react-scripts test",
      "eject": "react-scripts eject",
      "predeploy": "npm run build", 
      "deploy": "gh-pages -d build" 
    },
    ```

3.  **Deploy the application:**

    ```bash
    npm run deploy
    ```

The `npm run deploy` command will build your application into the `build` folder and push it to the `gh-pages` branch of your repository. Your game will then be accessible at the `homepage` URL specified.

## 🛠 Technology Stack

* **Frontend Framework**: React
* **Styling**: Tailwind CSS
* **Icons**: Lucide React
* **Core Logic**: Vanilla JavaScript (for the probabilistic AI engine)
