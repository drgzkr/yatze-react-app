import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Dices, RotateCcw, Brain, Trophy, AlertCircle, Bot, User, Zap, Moon, Sun } from 'lucide-react';

// --- 1. BASE CONSTANTS ---

const CATEGORIES = [
  'Ones', 'Twos', 'Threes', 'Fours', 'Fives', 'Sixes',
  'ThreeOfAKind', 'FourOfAKind', 'FullHouse',
  'SmallStraight', 'LargeStraight', 'Yahtzee', 'Chance'
];

// Heuristic "Par" values for the Standard Bot
const STATIC_WEIGHTS = {
  'Ones': 2.0, 'Twos': 5.0, 'Threes': 8.0, 'Fours': 11.0, 'Fives': 14.0, 'Sixes': 17.0,
  'ThreeOfAKind': 21.0, 'FourOfAKind': 16.0, 'FullHouse': 22.0,
  'SmallStraight': 27.0, 'LargeStraight': 35.0, 'Yahtzee': 50.0, 'Chance': 22.0
};

// --- 2. CORE UTILS ---

const getCounts = (hand) => {
  const counts = {};
  for (let d of hand) counts[d] = (counts[d] || 0) + 1;
  return counts;
};

const scoreHand = (hand, category) => {
  const counts = getCounts(hand);
  const s = hand.reduce((a, b) => a + b, 0);
  const vals = Object.values(counts);
  const unique = [...new Set(hand)].sort((a, b) => a - b);

  // Upper Section
  if (category === 'Ones') return (counts[1] || 0) * 1;
  if (category === 'Twos') return (counts[2] || 0) * 2;
  if (category === 'Threes') return (counts[3] || 0) * 3;
  if (category === 'Fours') return (counts[4] || 0) * 4;
  if (category === 'Fives') return (counts[5] || 0) * 5;
  if (category === 'Sixes') return (counts[6] || 0) * 6;

  // Lower Section
  if (category === 'ThreeOfAKind') return vals.some(c => c >= 3) ? s : 0;
  if (category === 'FourOfAKind') return vals.some(c => c >= 4) ? s : 0;
  if (category === 'FullHouse') {
    const has3 = vals.includes(3);
    const has2 = vals.includes(2);
    const has5 = vals.includes(5); 
    return (has3 && has2) || has5 ? 25 : 0;
  }
  if (category === 'SmallStraight') {
    const sets = [[1, 2, 3, 4], [2, 3, 4, 5], [3, 4, 5, 6]];
    return sets.some(st => st.every(n => unique.includes(n))) ? 30 : 0;
  }
  if (category === 'LargeStraight') {
    const sets = [[1, 2, 3, 4, 5], [2, 3, 4, 5, 6]];
    return sets.some(st => st.every(n => unique.includes(n))) ? 40 : 0;
  }
  if (category === 'Yahtzee') return vals.some(c => c === 5) ? 50 : 0;
  if (category === 'Chance') return s;

  return 0;
};

// --- 3. PRO BOT LOGIC: DYNAMIC WEIGHT CALCULATOR ---

const calculateDynamicWeights = (currentScores, openCategories) => {
    const weights = { ...STATIC_WEIGHTS };
    
    let upperScore = 0;
    let upperSlotsLeft = 0;
    const upperCats = ['Ones', 'Twos', 'Threes', 'Fours', 'Fives', 'Sixes'];
    
    upperCats.forEach((cat, idx) => {
        if (currentScores[cat] !== undefined) {
            upperScore += currentScores[cat];
        } else {
            upperSlotsLeft++;
        }
    });

    const target = 63;
    const deficit = target - upperScore;

    if (upperSlotsLeft > 0) {
        if (deficit <= 0) {
            upperCats.forEach(cat => {
                if (openCategories.includes(cat)) weights[cat] = 1.0; 
            });
        } else {
            const averageNeeded = deficit / upperSlotsLeft;
            if (averageNeeded > 3.0) {
                upperCats.forEach((cat, idx) => {
                    if (openCategories.includes(cat)) {
                         weights[cat] += (averageNeeded * 2); 
                    }
                });
            }
        }
    }

    if (openCategories.length > 7) {
        weights['Chance'] = 26.0; 
    } else if (openCategories.length < 4) {
        weights['Chance'] = 15.0; 
    }

    weights['Yahtzee'] = 50.0;
    return weights;
};


// --- 4. PROBABILITY ENGINE (SHARED) ---

const _ROLL_CACHE = {};
const getRollOutcomes = (numDice) => {
  if (numDice === 0) return { '': 1.0 };
  if (_ROLL_CACHE[numDice]) return _ROLL_CACHE[numDice];

  const outcomes = {};
  const totalCombs = Math.pow(6, numDice);
  const generate = (current) => {
    if (current.length === numDice) {
      const key = current.sort((a, b) => a - b).join('');
      outcomes[key] = (outcomes[key] || 0) + 1;
      return;
    }
    for (let i = 1; i <= 6; i++) generate([...current, i]);
  };
  generate([]);

  const probs = {};
  for (let key in outcomes) probs[key] = outcomes[key] / totalCombs;
  _ROLL_CACHE[numDice] = probs;
  return probs;
};

const getTransitionalProb = (heldDice, numRolling) => {
  const rollProbs = getRollOutcomes(numRolling);
  const finalProbs = []; 
  for (let [rollKey, prob] of Object.entries(rollProbs)) {
    const rollArr = rollKey ? rollKey.split('').map(Number) : [];
    const fullHand = [...heldDice, ...rollArr].sort((a, b) => a - b);
    finalProbs.push({ hand: fullHand, prob });
  }
  return finalProbs;
};

let _EV_CACHE = {};

const getPotentialScore = (hand, openCategories, currentWeights) => {
  let bestScore = -Infinity;
  let bestCat = null;
  
  for (let cat of openCategories) {
    let points = scoreHand(hand, cat);
    let threshold = currentWeights[cat] || 0;
    let weightedVal = points - threshold;
    
    if (['Ones', 'Twos', 'Threes', 'Fours', 'Fives', 'Sixes'].includes(cat)) {
        const idx = ['Ones', 'Twos', 'Threes', 'Fours', 'Fives', 'Sixes'].indexOf(cat) + 1;
        const count = hand.filter(d => d === idx).length;
        if (count >= 3) weightedVal += 5; 
        if (count >= 4) weightedVal += 2;
    }

    if (weightedVal > bestScore) {
      bestScore = weightedVal;
      bestCat = cat;
    }
  }
  return { bestScore, bestCat };
};

const getExpectedValue = (hand, rollsLeft, openCategories, currentWeights) => {
  const key = `${hand.join('')}|${rollsLeft}|${openCategories.length}`; 
  if (_EV_CACHE[key] !== undefined) return _EV_CACHE[key];

  if (rollsLeft === 0) {
    const { bestScore } = getPotentialScore(hand, openCategories, currentWeights);
    _EV_CACHE[key] = bestScore;
    return bestScore;
  }

  let maxEv = -Infinity;
  
  for (let i = 0; i < 32; i++) {
    const keepIndices = [];
    for (let bit = 0; bit < 5; bit++) {
      if ((i >> bit) & 1) keepIndices.push(bit);
    }

    const keptDice = keepIndices.map(idx => hand[idx]).sort((a, b) => a - b);
    const numRolling = 5 - keptDice.length;
    const outcomes = getTransitionalProb(keptDice, numRolling);

    let currentEv = 0;
    for (let { hand: nextHand, prob } of outcomes) {
      currentEv += prob * getExpectedValue(nextHand, rollsLeft - 1, openCategories, currentWeights);
    }

    if (currentEv > maxEv) maxEv = currentEv;
  }

  _EV_CACHE[key] = maxEv;
  return maxEv;
};

const getBestMove = (hand, rollsLeft, openCategories, currentWeights) => {
  _EV_CACHE = {}; 
  let bestEv = -Infinity;
  let bestKeepMask = 0;

  for (let i = 0; i < 32; i++) {
    const keepIndices = [];
    for (let bit = 0; bit < 5; bit++) {
      if ((i >> bit) & 1) keepIndices.push(bit);
    }

    const keptDice = keepIndices.map(idx => hand[idx]).sort((a, b) => a - b);
    const numRolling = 5 - keptDice.length;
    const outcomes = getTransitionalProb(keptDice, numRolling);

    let weightedEv = 0;
    for (let { hand: nextHand, prob } of outcomes) {
      weightedEv += prob * getExpectedValue(nextHand, rollsLeft - 1, openCategories, currentWeights);
    }

    if (weightedEv > bestEv) {
      bestEv = weightedEv;
      bestKeepMask = i;
    }
  }
  return { bestKeepMask, bestEv };
};

// --- 5. AI TURN SIMULATION ---

const simulateAiTurn = (startHand, openCategories, currentScores, difficulty) => {
    let weights = STATIC_WEIGHTS;
    if (difficulty === 'pro') {
        weights = calculateDynamicWeights(currentScores, openCategories);
    }

    let currentHand = [...startHand];
    let rollsLeft = 2; 
    let history = [];

    while (rollsLeft > 0) {
        const { bestKeepMask } = getBestMove(currentHand, rollsLeft, openCategories, weights);
        
        const keptIndices = [];
        for (let i=0; i<5; i++) if ((bestKeepMask >> i) & 1) keptIndices.push(i);
        const keptDice = keptIndices.map(i => currentHand[i]);
        
        history.push({ rollsLeft, hand: [...currentHand], kept: [...keptDice] });

        if (keptDice.length === 5) break; 

        const newDice = Array.from({ length: 5 - keptDice.length }, () => Math.floor(Math.random() * 6) + 1);
        currentHand = [...keptDice, ...newDice].sort((a, b) => a - b);
        rollsLeft--;
    }

    const { bestCat } = getPotentialScore(currentHand, openCategories, weights);
    const finalCat = bestCat || openCategories[0];
    
    return { finalHand: currentHand, category: finalCat, score: scoreHand(currentHand, finalCat), history };
};


// --- 6. REACT COMPONENT ---

const Dice = ({ value, held, aiSuggested, onClick, rolling }) => {
  const pips = {
    1: ['center'],
    2: ['top-left', 'bottom-right'],
    3: ['top-left', 'center', 'bottom-right'],
    4: ['top-left', 'top-right', 'bottom-left', 'bottom-right'],
    5: ['top-left', 'top-right', 'center', 'bottom-left', 'bottom-right'],
    6: ['top-left', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-right'],
  };

  const getPositionStyle = (pos) => {
    switch(pos) {
      case 'center': return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };
      case 'top-left': return { top: '15%', left: '15%' };
      case 'top-right': return { top: '15%', right: '15%' };
      case 'bottom-left': return { bottom: '15%', left: '15%' };
      case 'bottom-right': return { bottom: '15%', right: '15%' };
      case 'middle-left': return { top: '50%', left: '15%', transform: 'translate(0, -50%)' };
      case 'middle-right': return { top: '50%', right: '15%', transform: 'translate(0, -50%)' };
      default: return {};
    }
  };

  return (
    <div 
      onClick={onClick}
      className={`
        relative w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-xl shadow-sm cursor-pointer transition-all duration-200 select-none border
        ${rolling ? 'animate-spin' : ''}
        ${held 
            ? 'bg-red-50 border-red-500 dark:bg-red-900/30 dark:border-red-500 translate-y-2 shadow-inner' 
            : 'bg-white border-gray-200 hover:-translate-y-1 shadow-md dark:bg-gray-100 dark:border-gray-300'}
        ${aiSuggested && !held ? 'ring-4 ring-blue-400 ring-opacity-50 dark:ring-blue-500' : ''}
        ${aiSuggested && held ? 'ring-4 ring-blue-600 dark:ring-blue-400' : ''}
      `}
    >
      {pips[value]?.map((pos, i) => (
        <div 
          key={i} 
          className={`absolute w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full ${held ? 'bg-red-900 dark:bg-red-200' : 'bg-gray-800'}`}
          style={getPositionStyle(pos)}
        />
      ))}
    </div>
  );
};

const ScoreRow = ({ category, playerScore, aiScore, potentialScore, playerUsed, aiUsed, onClick }) => (
  <div 
    onClick={!playerUsed ? onClick : undefined}
    className={`
      grid grid-cols-[1.5fr_1fr_1fr] items-center p-2.5 border-b last:border-0 text-sm transition-colors
      ${playerUsed 
          ? 'bg-gray-50 dark:bg-gray-800/50 dark:border-gray-700' 
          : 'hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer border-gray-100 dark:border-gray-700'}
    `}
  >
    <span className="font-medium text-gray-700 dark:text-gray-300 truncate pr-2">{category.replace(/([A-Z])/g, ' $1').trim()}</span>
    <span className={`font-mono text-center ${playerUsed ? 'font-bold text-gray-800 dark:text-gray-100' : 'text-blue-600 dark:text-blue-400 font-semibold'}`}>
      {playerUsed ? playerScore : (potentialScore !== null ? potentialScore : '-')}
    </span>
    <span className={`font-mono text-center border-l border-gray-100 dark:border-gray-700 ${aiUsed ? 'font-bold text-purple-700 dark:text-purple-400' : 'text-gray-300 dark:text-gray-600'}`}>
      {aiUsed ? aiScore : '-'}
    </span>
  </div>
);

export default function YahtzeePro() {
  // --- STATE ---
  const [hand, setHand] = useState([1, 1, 1, 1, 1]);
  const [heldMask, setHeldMask] = useState(0);
  const [rollsLeft, setRollsLeft] = useState(3);
  
  const [playerScores, setPlayerScores] = useState({});
  const [playerOpenCats, setPlayerOpenCats] = useState(CATEGORIES);
  
  const [aiScores, setAiScores] = useState({});
  const [aiOpenCats, setAiOpenCats] = useState(CATEGORIES);
  const [lastAiAction, setLastAiAction] = useState(null);

  const [turnStartHand, setTurnStartHand] = useState(null);
  const [gameOver, setGameOver] = useState(false);
  
  const [botDifficulty, setBotDifficulty] = useState('standard'); 
  const [aiSuggestion, setAiSuggestion] = useState({ mask: 0, ev: 0 });
  const [calculating, setCalculating] = useState(false);

  // Theme State
  const [darkMode, setDarkMode] = useState(false);

  // --- EFFECTS ---

  useEffect(() => {
    // Detect system preference
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        setDarkMode(true);
    }
    startNewTurn();
  }, []);

  const startNewTurn = () => {
    const newDice = Array.from({ length: 5 }, () => Math.floor(Math.random() * 6) + 1).sort((a, b) => a - b);
    setHand(newDice);
    setTurnStartHand(newDice);
    setHeldMask(0);
    setRollsLeft(2); 
  };

  useEffect(() => {
    if (gameOver || rollsLeft === 3) return;
    
    setCalculating(true);
    const timer = setTimeout(() => {
      const weights = calculateDynamicWeights(playerScores, playerOpenCats);
      const { bestKeepMask, bestEv } = getBestMove(hand, rollsLeft, playerOpenCats, weights);
      
      setAiSuggestion({ mask: bestKeepMask, ev: bestEv });
      setCalculating(false);
    }, 100);

    return () => clearTimeout(timer);
  }, [hand, rollsLeft, playerOpenCats, gameOver, playerScores]);

  // --- HANDLERS ---

  const handleRollClick = () => {
    if (rollsLeft <= 0) return;
    
    let diceToRollCount = 0;
    for(let i=0; i<5; i++) {
        if (!((heldMask >> i) & 1)) diceToRollCount++;
    }

    setHand(currentHand => {
      const newVals = Array.from({ length: diceToRollCount }, () => Math.floor(Math.random() * 6) + 1);
      let consumed = 0;
      const nextHand = currentHand.map((val, i) => {
        if ((heldMask >> i) & 1) return val;
        return newVals[consumed++];
      });
      return nextHand.sort((a, b) => a - b);
    });
    
    setRollsLeft(prev => prev - 1);
  };

  const toggleHold = (idx) => {
    setHeldMask(prev => prev ^ (1 << idx));
  };

  const selectCategory = (cat) => {
    if (rollsLeft === 3) return; 

    const pScore = scoreHand(hand, cat);
    const newPlayerScores = { ...playerScores, [cat]: pScore };
    setPlayerScores(newPlayerScores);
    
    const newPlayerOpen = playerOpenCats.filter(c => c !== cat);
    setPlayerOpenCats(newPlayerOpen);

    if (turnStartHand) {
        const aiResult = simulateAiTurn(turnStartHand, aiOpenCats, aiScores, botDifficulty);
        
        setAiScores(prev => ({ ...prev, [aiResult.category]: aiResult.score }));
        setAiOpenCats(prev => prev.filter(c => c !== aiResult.category));
        setLastAiAction({
            start: turnStartHand,
            end: aiResult.finalHand,
            cat: aiResult.category,
            score: aiResult.score
        });
    }

    if (newPlayerOpen.length === 0) {
      setGameOver(true);
      setRollsLeft(0);
    } else {
      startNewTurn();
    }
  };

  const calcScore = (scoreObj) => {
    const upper = CATEGORIES.slice(0, 6).reduce((acc, cat) => acc + (scoreObj[cat] || 0), 0);
    const bonus = upper >= 63 ? 35 : 0;
    const lower = CATEGORIES.slice(6).reduce((acc, cat) => acc + (scoreObj[cat] || 0), 0);
    return { total: upper + bonus + lower, upper, bonus };
  };

  const pStats = calcScore(playerScores);
  const aiStats = calcScore(aiScores);

  return (
    <div className={`${darkMode ? 'dark' : ''} transition-colors duration-200`}>
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 font-sans flex flex-col lg:flex-row gap-4 sm:gap-6 p-3 sm:p-6 lg:p-8 text-slate-800 dark:text-slate-100 transition-colors duration-200">
      
      {/* LEFT PANEL: Game Board */}
      <div className="flex-1 flex flex-col gap-4 sm:gap-6">
        {/* Header */}
        <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="text-center sm:text-left">
            <h1 className="text-xl sm:text-2xl font-bold flex items-center justify-center sm:justify-start gap-2">
              <Dices className="text-blue-600 dark:text-blue-400" /> 
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600 dark:from-blue-400 dark:to-purple-400">
                Pro Yahtzee
              </span>
            </h1>
            <p className="text-gray-500 dark:text-slate-400 text-sm mt-1">
               {gameOver ? 'Game Over!' : `Rolls Left: ${rollsLeft}`}
            </p>
          </div>
          
          <div className="flex items-center gap-3">
             {/* Theme Toggle */}
             <button 
                onClick={() => setDarkMode(!darkMode)}
                className="p-2 rounded-full bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
             >
                 {darkMode ? <Sun size={18} /> : <Moon size={18} />}
             </button>

             {/* Difficulty Toggle */}
             {!gameOver && (
                <div className="flex items-center bg-gray-100 dark:bg-slate-700 rounded-lg p-1">
                    <button 
                        onClick={() => setBotDifficulty('standard')}
                        className={`px-3 py-1 text-sm font-medium rounded-md transition-all ${botDifficulty === 'standard' ? 'bg-white dark:bg-slate-600 shadow text-gray-800 dark:text-white' : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'}`}
                    >
                        Std
                    </button>
                    <button 
                        onClick={() => setBotDifficulty('pro')}
                        className={`px-3 py-1 text-sm font-medium rounded-md transition-all flex items-center gap-1 ${botDifficulty === 'pro' ? 'bg-purple-600 text-white shadow' : 'text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'}`}
                    >
                        <Zap size={12} /> Pro
                    </button>
                </div>
            )}
          </div>
        </div>

        {/* Dice Area */}
        <div className="bg-white dark:bg-slate-800 p-4 sm:p-8 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 flex flex-col items-center justify-center min-h-[200px] sm:min-h-[300px] relative transition-colors">
           {gameOver ? (
             <div className="text-center">
                <Trophy size={48} className="mx-auto text-yellow-500 mb-4" />
                <h2 className="text-2xl sm:text-3xl font-bold mb-2 dark:text-white">
                    {pStats.total > aiStats.total ? 'You Won!' : (pStats.total === aiStats.total ? 'Tie Game!' : 'Bot Won!')}
                </h2>
                <p className="text-gray-500 dark:text-slate-400 mb-6">Final Score: {pStats.total} vs {aiStats.total}</p>
                <button onClick={() => window.location.reload()} className="bg-blue-600 text-white px-6 py-2 rounded-full font-bold hover:bg-blue-700 transition-colors">Play Again</button>
             </div>
           ) : (
             <>
              <div className="flex gap-2 sm:gap-4 mb-6 sm:mb-8 flex-wrap justify-center">
                {hand.map((val, i) => (
                  <Dice 
                    key={i} 
                    value={val} 
                    held={(heldMask >> i) & 1} 
                    aiSuggested={(aiSuggestion.mask >> i) & 1}
                    onClick={() => toggleHold(i)} 
                  />
                ))}
              </div>

              <div className="flex gap-4 w-full justify-center">
                <button 
                  onClick={handleRollClick}
                  disabled={rollsLeft === 0}
                  className={`
                    px-6 sm:px-8 py-3 rounded-full font-bold shadow-lg transition active:scale-95 flex items-center gap-2 text-sm sm:text-base
                    ${rollsLeft === 0 
                      ? 'bg-gray-200 dark:bg-slate-700 text-gray-400 dark:text-slate-500 cursor-not-allowed' 
                      : 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500'}
                  `}
                >
                  <RotateCcw size={20} /> {rollsLeft > 0 ? `Roll Dice (${rollsLeft})` : 'Select Category'}
                </button>
              </div>
             </>
           )}
        </div>

        {/* Advisor & Log Panel */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Advisor */}
            {!gameOver && rollsLeft < 3 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4 rounded-xl flex items-start gap-3 transition-colors">
                <Brain className="text-blue-600 dark:text-blue-400 mt-1 flex-shrink-0" />
                <div>
                <h3 className="font-bold text-blue-800 dark:text-blue-300 text-sm">Pro Strategy Advisor</h3>
                {calculating ? (
                    <p className="text-xs text-blue-600 dark:text-blue-400 animate-pulse">Calculating...</p>
                ) : (
                    <div className="text-sm text-blue-700 dark:text-blue-200 space-y-1">
                    <p>
                        Suggestion: 
                        <span className="font-mono font-bold mx-1">
                        {hand.filter((_, i) => (aiSuggestion.mask >> i) & 1).length > 0 
                            ? `Keep [${hand.filter((_, i) => (aiSuggestion.mask >> i) & 1).join(', ')}]` 
                            : 'Reroll All'}
                        </span>
                    </p>
                    <p className="text-xs opacity-75">Adjusted EV: {aiSuggestion.ev.toFixed(2)}</p>
                    {((heldMask !== aiSuggestion.mask) && rollsLeft > 0) && (
                        <div className="flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400 font-semibold mt-2">
                        <AlertCircle size={12} />
                        <span>Sub-optimal hold</span>
                        </div>
                    )}
                    </div>
                )}
                </div>
            </div>
            )}

            {/* Bot Log */}
            {lastAiAction && (
                <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 p-4 rounded-xl flex items-start gap-3 transition-colors">
                    <Bot className="text-purple-600 dark:text-purple-400 mt-1 flex-shrink-0" />
                    <div>
                        <h3 className="font-bold text-purple-800 dark:text-purple-300 text-sm">Bot's Turn ({botDifficulty})</h3>
                        <div className="text-sm text-purple-700 dark:text-purple-200 mt-1">
                            <p>Started: <span className="font-mono text-xs text-gray-500 dark:text-slate-400">[{lastAiAction.start.join(',')}]</span></p>
                            <p>Ended: <span className="font-mono text-xs">[{lastAiAction.end.join(',')}]</span></p>
                            <p className="font-semibold mt-1">Took {lastAiAction.cat} ({lastAiAction.score})</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
      </div>

      {/* RIGHT PANEL: Scorecard */}
      <div className="w-full lg:w-96 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden flex flex-col h-auto lg:h-[calc(100vh-4rem)] lg:sticky lg:top-8 transition-colors">
        {/* Scorecard Header */}
        <div className="grid grid-cols-[1.5fr_1fr_1fr] bg-gray-100 dark:bg-slate-700/50 p-3 border-b border-gray-200 dark:border-slate-700 text-sm font-bold text-gray-600 dark:text-slate-300">
            <span>Category</span>
            <span className="text-center flex items-center justify-center gap-1 text-blue-700 dark:text-blue-400"><User size={14}/> You</span>
            <span className="text-center flex items-center justify-center gap-1 text-purple-700 dark:text-purple-400"><Bot size={14}/> Bot</span>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2">
          <div className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider px-2 py-1 mt-2">Upper Section</div>
          {CATEGORIES.slice(0, 6).map(cat => (
            <ScoreRow 
              key={cat} 
              category={cat} 
              playerScore={playerScores[cat]}
              aiScore={aiScores[cat]}
              potentialScore={!gameOver ? scoreHand(hand, cat) : null}
              playerUsed={!playerOpenCats.includes(cat)}
              aiUsed={!aiOpenCats.includes(cat)}
              onClick={() => selectCategory(cat)}
            />
          ))}
          
          {/* Subtotals */}
          <div className="grid grid-cols-[1.5fr_1fr_1fr] text-xs py-2 px-2 bg-gray-50 dark:bg-slate-800/50 font-semibold text-gray-500 dark:text-slate-400 border-y border-gray-200 dark:border-slate-700">
             <span>Upper Score</span>
             <span className="text-center">{pStats.upper}/63</span>
             <span className="text-center">{aiStats.upper}/63</span>
          </div>
          <div className="grid grid-cols-[1.5fr_1fr_1fr] text-xs py-1 px-2 bg-gray-50 dark:bg-slate-800/50 font-semibold text-green-600 dark:text-green-400">
             <span>Bonus (+35)</span>
             <span className="text-center">{pStats.bonus > 0 ? '✓' : '-'}</span>
             <span className="text-center">{aiStats.bonus > 0 ? '✓' : '-'}</span>
          </div>

          <div className="text-xs font-bold text-gray-400 dark:text-slate-500 uppercase tracking-wider px-2 py-1 mt-4">Lower Section</div>
          {CATEGORIES.slice(6).map(cat => (
            <ScoreRow 
              key={cat} 
              category={cat} 
              playerScore={playerScores[cat]}
              aiScore={aiScores[cat]}
              potentialScore={!gameOver ? scoreHand(hand, cat) : null}
              playerUsed={!playerOpenCats.includes(cat)}
              aiUsed={!aiOpenCats.includes(cat)}
              onClick={() => selectCategory(cat)}
            />
          ))}
        </div>

        <div className="p-4 bg-gray-800 dark:bg-slate-950 text-white flex justify-between items-center transition-colors">
            <div className="flex flex-col">
                <span className="text-xs text-gray-400 uppercase">Your Total</span>
                <span className="text-2xl font-bold">{pStats.total}</span>
            </div>
            <div className="h-8 w-px bg-gray-600 dark:bg-slate-800"></div>
            <div className="flex flex-col text-right">
                <span className="text-xs text-gray-400 uppercase">Bot Total</span>
                <span className="text-2xl font-bold text-purple-300">{aiStats.total}</span>
            </div>
        </div>
      </div>

    </div>
    </div>
  );
}