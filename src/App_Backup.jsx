import React, { useState, useEffect, useRef } from 'react';
import { Dices, RotateCcw, Brain, Trophy, AlertCircle, Bot, User } from 'lucide-react';

// --- LOGIC PORT: GAME CONSTANTS & UTILS ---

const CATEGORIES = [
  'Ones', 'Twos', 'Threes', 'Fours', 'Fives', 'Sixes',
  'ThreeOfAKind', 'FourOfAKind', 'FullHouse',
  'SmallStraight', 'LargeStraight', 'Yahtzee', 'Chance'
];

const CATEGORY_WEIGHTS = {
  'Ones': 2.0, 'Twos': 5.0, 'Threes': 8.0, 'Fours': 11.0, 'Fives': 14.0, 'Sixes': 17.0,
  'ThreeOfAKind': 20.0, 'FourOfAKind': 15.0, 'FullHouse': 20.0,
  'SmallStraight': 25.0, 'LargeStraight': 30.0, 'Yahtzee': 50.0, 'Chance': 22.0
};

// Helper: Count occurrences of dice values
const getCounts = (hand) => {
  const counts = {};
  for (let d of hand) counts[d] = (counts[d] || 0) + 1;
  return counts;
};

// Helper: Calculate score for a specific category
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

// --- LOGIC PORT: PROBABILITY SOLVER ---

// Cache for roll outcomes to avoid re-computing 6^N constantly
const _ROLL_CACHE = {};

const getRollOutcomes = (numDice) => {
  if (numDice === 0) return { '': 1.0 }; // No dice to roll, 100% chance of nothing
  if (_ROLL_CACHE[numDice]) return _ROLL_CACHE[numDice];

  const outcomes = {};
  const totalCombs = Math.pow(6, numDice);

  // Cartesian product generator
  const combinations = [];
  const generate = (current) => {
    if (current.length === numDice) {
      combinations.push(current);
      return;
    }
    for (let i = 1; i <= 6; i++) generate([...current, i]);
  };
  generate([]);

  for (let roll of combinations) {
    const key = roll.sort((a, b) => a - b).join(',');
    outcomes[key] = (outcomes[key] || 0) + 1;
  }

  const probs = {};
  for (let key in outcomes) {
    probs[key] = outcomes[key] / totalCombs;
  }
  
  _ROLL_CACHE[numDice] = probs;
  return probs;
};

const getTransitionalProb = (heldDice, numRolling) => {
  const rollProbs = getRollOutcomes(numRolling);
  const finalProbs = []; 

  for (let [rollKey, prob] of Object.entries(rollProbs)) {
    const rollArr = rollKey ? rollKey.split(',').map(Number) : [];
    const fullHand = [...heldDice, ...rollArr].sort((a, b) => a - b);
    finalProbs.push({ hand: fullHand, prob });
  }
  return finalProbs;
};

// Memoization for expected values
let _EV_CACHE = {};

const getPotentialScore = (hand, openCategories) => {
  let bestScore = -Infinity;
  
  for (let cat of openCategories) {
    let points = scoreHand(hand, cat);
    let weightedVal = points - CATEGORY_WEIGHTS[cat];
    
    // Upper section bonus incentive
    if (['Ones', 'Twos', 'Threes', 'Fours', 'Fives', 'Sixes'].includes(cat)) {
        const idx = ['Ones', 'Twos', 'Threes', 'Fours', 'Fives', 'Sixes'].indexOf(cat) + 1;
        const count = hand.filter(d => d === idx).length;
        if (count >= 3) weightedVal += 5; 
    }

    if (weightedVal > bestScore) {
      bestScore = weightedVal;
    }
  }
  return bestScore;
};

const getExpectedValue = (hand, rollsLeft, openCategories) => {
  const key = `${hand.join(',')}|${rollsLeft}|${openCategories.join(',')}`;
  if (_EV_CACHE[key] !== undefined) return _EV_CACHE[key];

  if (rollsLeft === 0) {
    const val = getPotentialScore(hand, openCategories);
    _EV_CACHE[key] = val;
    return val;
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
      currentEv += prob * getExpectedValue(nextHand, rollsLeft - 1, openCategories);
    }

    if (currentEv > maxEv) maxEv = currentEv;
  }

  _EV_CACHE[key] = maxEv;
  return maxEv;
};

const getBestMove = (hand, rollsLeft, openCategories) => {
  _EV_CACHE = {}; // Clear cache
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
      weightedEv += prob * getExpectedValue(nextHand, rollsLeft - 1, openCategories);
    }

    if (weightedEv > bestEv) {
      bestEv = weightedEv;
      bestKeepMask = i;
    }
  }
  return { bestKeepMask, bestEv };
};

// Helper to find the best category for the AI to lock in
const pickBestCategory = (hand, openCategories) => {
    let bestScore = -Infinity;
    let bestCat = null;
    
    for (let cat of openCategories) {
      let points = scoreHand(hand, cat);
      let weightedVal = points - CATEGORY_WEIGHTS[cat];
      
      if (['Ones', 'Twos', 'Threes', 'Fours', 'Fives', 'Sixes'].includes(cat)) {
          const idx = ['Ones', 'Twos', 'Threes', 'Fours', 'Fives', 'Sixes'].indexOf(cat) + 1;
          const count = hand.filter(d => d === idx).length;
          if (count >= 3) weightedVal += 5; 
      }
  
      if (weightedVal > bestScore) {
        bestScore = weightedVal;
        bestCat = cat;
      }
    }
    // Fallback if all are negative (forced bad choice), pick max raw score or min loss
    if (!bestCat) bestCat = openCategories[0]; 
    return { category: bestCat, score: scoreHand(hand, bestCat) };
};

// --- SIMULATION LOGIC ---
// Plays a full turn for the AI starting from a specific hand
const simulateAiTurn = (startHand, openCategories) => {
    let currentHand = [...startHand];
    let rollsLeft = 2; // Start after 1st roll
    
    // We log the path taken
    let history = [];

    while (rollsLeft > 0) {
        const { bestKeepMask } = getBestMove(currentHand, rollsLeft, openCategories);
        
        const keptIndices = [];
        for (let i=0; i<5; i++) if ((bestKeepMask >> i) & 1) keptIndices.push(i);
        const keptDice = keptIndices.map(i => currentHand[i]);
        
        history.push({ rollsLeft, hand: [...currentHand], kept: [...keptDice] });

        if (keptDice.length === 5) break; // AI stays

        // Roll remaining
        const newDice = Array.from({ length: 5 - keptDice.length }, () => Math.floor(Math.random() * 6) + 1);
        currentHand = [...keptDice, ...newDice].sort((a, b) => a - b);
        rollsLeft--;
    }

    const { category, score } = pickBestCategory(currentHand, openCategories);
    return { finalHand: currentHand, category, score, history };
};


// --- REACT COMPONENTS ---

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
        relative w-14 h-14 sm:w-16 sm:h-16 rounded-xl shadow-md cursor-pointer transition-all duration-200 select-none
        ${rolling ? 'animate-spin' : ''}
        ${held ? 'bg-red-100 border-2 border-red-500 translate-y-2' : 'bg-white border border-gray-300 hover:-translate-y-1'}
        ${aiSuggested && !held ? 'ring-4 ring-blue-400 ring-opacity-50' : ''}
        ${aiSuggested && held ? 'ring-4 ring-blue-600' : ''}
      `}
    >
      {pips[value]?.map((pos, i) => (
        <div 
          key={i} 
          className="absolute w-3 h-3 bg-gray-800 rounded-full"
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
      grid grid-cols-[1.5fr_1fr_1fr] items-center p-2 border-b last:border-0 text-sm
      ${playerUsed ? 'bg-gray-50' : 'hover:bg-blue-50 cursor-pointer'}
    `}
  >
    <span className="font-medium text-gray-700 truncate pr-2">{category.replace(/([A-Z])/g, ' $1').trim()}</span>
    
    {/* Player Score Column */}
    <span className={`font-mono text-center ${playerUsed ? 'font-bold text-gray-800' : 'text-blue-600 font-semibold'}`}>
      {playerUsed ? playerScore : (potentialScore !== null ? potentialScore : '-')}
    </span>

    {/* AI Score Column */}
    <span className={`font-mono text-center border-l border-gray-100 ${aiUsed ? 'font-bold text-purple-700' : 'text-gray-300'}`}>
      {aiUsed ? aiScore : '-'}
    </span>
  </div>
);

export default function YahtzeeApp() {
  // Player State
  const [hand, setHand] = useState([1, 1, 1, 1, 1]);
  const [heldMask, setHeldMask] = useState(0);
  const [rollsLeft, setRollsLeft] = useState(3);
  const [playerScores, setPlayerScores] = useState({});
  const [playerOpenCats, setPlayerOpenCats] = useState(CATEGORIES);
  
  // AI State
  const [aiScores, setAiScores] = useState({});
  const [aiOpenCats, setAiOpenCats] = useState(CATEGORIES);
  const [lastAiAction, setLastAiAction] = useState(null);

  // Shared State
  const [turnStartHand, setTurnStartHand] = useState(null); // The hand both started with
  const [gameOver, setGameOver] = useState(false);
  
  // Solver Advisor State
  const [aiSuggestion, setAiSuggestion] = useState({ mask: 0, ev: 0 });
  const [calculating, setCalculating] = useState(false);

  // Initial Start
  useEffect(() => {
    startNewTurn();
  }, []);

  const startNewTurn = () => {
    const newDice = Array.from({ length: 5 }, () => Math.floor(Math.random() * 6) + 1).sort((a, b) => a - b);
    setHand(newDice);
    setTurnStartHand(newDice);
    setHeldMask(0);
    setRollsLeft(2); // Immediately consume roll 1
  };

  // Trigger Solver Advisor when hand updates (only for Player help)
  useEffect(() => {
    if (gameOver || rollsLeft === 3) return;
    
    setCalculating(true);
    const timer = setTimeout(() => {
      // We pass rollsLeft as is (0, 1, 2)
      const { bestKeepMask, bestEv } = getBestMove(hand, rollsLeft, playerOpenCats);
      setAiSuggestion({ mask: bestKeepMask, ev: bestEv });
      setCalculating(false);
    }, 50);

    return () => clearTimeout(timer);
  }, [hand, rollsLeft, playerOpenCats, gameOver]);

  const handleRollClick = () => {
    if (rollsLeft <= 0) return;
    
    // Rolls Left logic:
    // 2 -> rolling for 2nd time
    // 1 -> rolling for 3rd time
    
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
    if (rollsLeft === 3) return; // Should not happen based on logic

    // 1. Commit Player Score
    const pScore = scoreHand(hand, cat);
    const newPlayerScores = { ...playerScores, [cat]: pScore };
    setPlayerScores(newPlayerScores);
    
    const newPlayerOpen = playerOpenCats.filter(c => c !== cat);
    setPlayerOpenCats(newPlayerOpen);

    // 2. Run AI Turn (Shadow Play)
    // AI starts from the SAME turnStartHand that the player had
    if (turnStartHand) {
        const aiResult = simulateAiTurn(turnStartHand, aiOpenCats);
        
        // Commit AI Score
        setAiScores(prev => ({ ...prev, [aiResult.category]: aiResult.score }));
        setAiOpenCats(prev => prev.filter(c => c !== aiResult.category));
        setLastAiAction({
            start: turnStartHand,
            end: aiResult.finalHand,
            cat: aiResult.category,
            score: aiResult.score
        });
    }

    // 3. Game State Update
    if (newPlayerOpen.length === 0) {
      setGameOver(true);
      setRollsLeft(0);
    } else {
      startNewTurn();
    }
  };

  // Calculate totals
  const calcScore = (scoreObj) => {
    const upper = CATEGORIES.slice(0, 6).reduce((acc, cat) => acc + (scoreObj[cat] || 0), 0);
    const bonus = upper >= 63 ? 35 : 0;
    const lower = CATEGORIES.slice(6).reduce((acc, cat) => acc + (scoreObj[cat] || 0), 0);
    return { total: upper + bonus + lower, upper, bonus };
  };

  const pStats = calcScore(playerScores);
  const aiStats = calcScore(aiScores);

  return (
    <div className="max-w-6xl mx-auto p-4 font-sans bg-gray-50 min-h-screen flex flex-col lg:flex-row gap-6">
      
      {/* LEFT PANEL: Game Board */}
      <div className="flex-1 flex flex-col gap-6">
        {/* Header */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <Dices className="text-blue-600" /> Head-to-Head Yahtzee
            </h1>
            <p className="text-gray-500 text-sm mt-1">
               {gameOver ? 'Game Over!' : `Beat the Bot • Rolls Left: ${rollsLeft}`}
            </p>
          </div>
          {!gameOver && (
             <div className="text-right hidden sm:block">
                <div className="text-xs text-gray-400 font-semibold uppercase tracking-wider">Current Hand Value</div>
                <div className="text-xl font-mono font-bold text-blue-600">{Math.max(...playerOpenCats.map(c => scoreHand(hand, c)))} pts</div>
             </div>
          )}
        </div>

        {/* Dice Area */}
        <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-200 flex flex-col items-center justify-center min-h-[300px] relative">
           {gameOver ? (
             <div className="text-center">
                <Trophy size={48} className="mx-auto text-yellow-500 mb-4" />
                <h2 className="text-3xl font-bold text-gray-800 mb-2">
                    {pStats.total > aiStats.total ? 'You Won!' : (pStats.total === aiStats.total ? 'Tie Game!' : 'Bot Won!')}
                </h2>
                <p className="text-gray-500 mb-6">Final Score: {pStats.total} vs {aiStats.total}</p>
                <button onClick={() => window.location.reload()} className="bg-blue-600 text-white px-6 py-2 rounded-full font-bold">Play Again</button>
             </div>
           ) : (
             <>
              <div className="flex gap-3 mb-8 flex-wrap justify-center">
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
                    px-8 py-3 rounded-full font-bold shadow-lg transition active:scale-95 flex items-center gap-2
                    ${rollsLeft === 0 
                      ? 'bg-gray-200 text-gray-400 cursor-not-allowed' 
                      : 'bg-blue-600 text-white hover:bg-blue-700'}
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
            <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl flex items-start gap-3">
                <Brain className="text-blue-600 mt-1 flex-shrink-0" />
                <div>
                <h3 className="font-bold text-blue-800 text-sm">Optimal Strategy</h3>
                {calculating ? (
                    <p className="text-xs text-blue-600 animate-pulse">Calculating...</p>
                ) : (
                    <div className="text-sm text-blue-700 space-y-1">
                    <p>
                        Suggestion: 
                        <span className="font-mono font-bold mx-1">
                        {hand.filter((_, i) => (aiSuggestion.mask >> i) & 1).length > 0 
                            ? `Keep [${hand.filter((_, i) => (aiSuggestion.mask >> i) & 1).join(', ')}]` 
                            : 'Reroll All'}
                        </span>
                    </p>
                    <p className="text-xs opacity-75">Expected Value: {aiSuggestion.ev.toFixed(2)}</p>
                    {((heldMask !== aiSuggestion.mask) && rollsLeft > 0) && (
                        <div className="flex items-center gap-1 text-xs text-orange-600 font-semibold mt-2">
                        <AlertCircle size={12} />
                        <span>Your pick differs from optimal</span>
                        </div>
                    )}
                    </div>
                )}
                </div>
            </div>
            )}

            {/* Bot Log */}
            {lastAiAction && (
                <div className="bg-purple-50 border border-purple-200 p-4 rounded-xl flex items-start gap-3">
                    <Bot className="text-purple-600 mt-1 flex-shrink-0" />
                    <div>
                        <h3 className="font-bold text-purple-800 text-sm">Bot's Last Turn</h3>
                        <div className="text-sm text-purple-700 mt-1">
                            <p>Started with: <span className="font-mono text-xs">[{lastAiAction.start.join(',')}]</span></p>
                            <p>Ended with: <span className="font-mono text-xs">[{lastAiAction.end.join(',')}]</span></p>
                            <p className="font-semibold mt-1">Took {lastAiAction.cat} for {lastAiAction.score} pts</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
      </div>

      {/* RIGHT PANEL: Scorecard */}
      <div className="w-full lg:w-96 bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-full max-h-screen">
        {/* Scorecard Header */}
        <div className="grid grid-cols-[1.5fr_1fr_1fr] bg-gray-100 p-3 border-b text-sm font-bold text-gray-600">
            <span>Category</span>
            <span className="text-center flex items-center justify-center gap-1 text-blue-700"><User size={14}/> You</span>
            <span className="text-center flex items-center justify-center gap-1 text-purple-700"><Bot size={14}/> Bot</span>
        </div>
        
        <div className="flex-1 overflow-y-auto p-2">
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wider px-2 py-1 mt-2">Upper Section</div>
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
          <div className="grid grid-cols-[1.5fr_1fr_1fr] text-xs py-2 px-2 bg-gray-50 font-semibold text-gray-500 border-y">
             <span>Upper Score</span>
             <span className="text-center">{pStats.upper}/63</span>
             <span className="text-center">{aiStats.upper}/63</span>
          </div>
          <div className="grid grid-cols-[1.5fr_1fr_1fr] text-xs py-1 px-2 bg-gray-50 font-semibold text-green-600">
             <span>Bonus (+35)</span>
             <span className="text-center">{pStats.bonus > 0 ? '✓' : '-'}</span>
             <span className="text-center">{aiStats.bonus > 0 ? '✓' : '-'}</span>
          </div>

          <div className="text-xs font-bold text-gray-400 uppercase tracking-wider px-2 py-1 mt-4">Lower Section</div>
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

        <div className="p-4 bg-gray-800 text-white flex justify-between items-center">
            <div className="flex flex-col">
                <span className="text-xs text-gray-400 uppercase">Your Total</span>
                <span className="text-2xl font-bold">{pStats.total}</span>
            </div>
            <div className="h-8 w-px bg-gray-600"></div>
            <div className="flex flex-col text-right">
                <span className="text-xs text-gray-400 uppercase">Bot Total</span>
                <span className="text-2xl font-bold text-purple-300">{aiStats.total}</span>
            </div>
        </div>
      </div>

    </div>
  );
}