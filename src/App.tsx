/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef, useCallback, FormEvent } from 'react';
import { Heart } from 'lucide-react';
import { collection, addDoc, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from './firebase';
import { WordData, GameStatus } from './types';
import { playSound } from './audio';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: null,
      email: null,
      emailVerified: null,
      isAnonymous: null,
      tenantId: null,
      providerInfo: []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const WORDS = ["APPLE", "BANANA", "TIGER", "HOUSE", "SCHOOL", "FRIEND", "WATER", "FLOWER", "DANCER", "COOKIE"];

export default function App() {
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [timeLeft, setTimeLeft] = useState(30);
  const [words, setWords] = useState<WordData[]>([]);
  const [status, setStatus] = useState<GameStatus>('idle');
  const [feedback, setFeedback] = useState<Record<string, 'correct' | 'wrong' | null>>({});
  const [playerName, setPlayerName] = useState('');
  const [leaderboard, setLeaderboard] = useState<{name: string, score: number}[]>([]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  
  const gameAreaRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number>();
  const lastTimeRef = useRef<number>();

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const q = query(collection(db, 'leaderboard'), orderBy('score', 'desc'), limit(5));
        const querySnapshot = await getDocs(q);
        const entries = querySnapshot.docs.map(doc => doc.data() as { name: string, score: number });
        setLeaderboard(entries);
      } catch (error) {
        console.error("Failed to fetch leaderboard from Firestore:", error);
      }
    };
    fetchLeaderboard();
  }, [showLeaderboard, hasSubmitted]);

  const startGame = () => {
    setScore(0);
    setLives(3);
    setTimeLeft(30);
    setWords([]);
    setHasSubmitted(false);
    setPlayerName('');
    setStatus('playing');
    lastTimeRef.current = performance.now();
    spawnWord();
  };

  const spawnWord = useCallback(() => {
    const word = WORDS[Math.floor(Math.random() * WORDS.length)];
    const hiddenIndex = Math.floor(Math.random() * word.length);
    const newWord: WordData = {
      id: Date.now(),
      word,
      hiddenIndex,
      position: 0,
      isCorrect: null,
    };
    setWords(prev => [...prev, newWord]);
  }, []);

  useEffect(() => {
    if (status === 'playing' && timeLeft > 0) {
      const timer = setInterval(() => setTimeLeft(prev => prev - 1), 1000);
      return () => clearInterval(timer);
    } else if (timeLeft === 0 && status === 'playing') {
      setStatus('gameover');
      playSound('gameover');
    }
  }, [status, timeLeft, score]);

  const handleGameOverSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) return;
    await updateLeaderboard(playerName.trim(), score);
    setHasSubmitted(true);
  };

  const updateLeaderboard = async (name: string, newScore: number) => {
    try {
      await addDoc(collection(db, 'leaderboard'), { name, score: newScore });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'leaderboard');
    }
  };

  const gameLoop = useCallback((time: number) => {
    if (status !== 'playing') return;

    if (lastTimeRef.current !== undefined) {
      const deltaTime = time - lastTimeRef.current;
      const speedMultiplier = 0.5 + (score / 200);
      setWords(prev => {
        const nextWords = prev.map(w => ({ ...w, position: w.position + deltaTime * 0.03 * speedMultiplier }))
          .filter(w => w.position < 80);
        
        const removed = prev.filter(w => w.position >= 80);
        if (removed.length > 0) {
          setLives(l => Math.max(0, l - 1));
        }
        return nextWords;
      });
    }
    
    lastTimeRef.current = time;
    if (Math.random() < 0.015) spawnWord();
    requestRef.current = requestAnimationFrame(gameLoop);
  }, [status, spawnWord, score]);

  useEffect(() => {
    if (lives <= 0) {
      setStatus('gameover');
      playSound('gameover');
    }
  }, [lives, score]);

  useEffect(() => {
    if (status === 'playing') {
      requestRef.current = requestAnimationFrame(gameLoop);
    }
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [gameLoop, status]);

  const handleInput = (char: string) => {
    if (status !== 'playing') return;
    const upperChar = char.toUpperCase();
    
    let hit = false;
    setWords(prev => prev.map(w => {
      if (w.word[w.hiddenIndex] === upperChar) {
        hit = true;
        setScore(s => s + 10);
        return { ...w, isCorrect: true };
      }
      return w;
    }).filter(w => w.isCorrect !== true));

    if (hit) {
      playSound('correct');
      setFeedback(f => ({ ...f, [upperChar]: 'correct' }));
      setTimeout(() => setFeedback(f => ({ ...f, [upperChar]: null })), 500);
    } else {
      playSound('wrong');
      setFeedback(f => ({ ...f, [upperChar]: 'wrong' }));
      setTimeout(() => setFeedback(f => ({ ...f, [upperChar]: null })), 500);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => handleInput(e.key);
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleInput]);

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col font-sans" id="game-container">
      <header className="p-4 flex justify-between items-center bg-gray-800 shadow-lg">
        <h1 className="text-xl font-bold">Word Defender</h1>
        <div className="flex gap-4">
          <div className="text-lg">Time: {timeLeft}s</div>
          <div className="text-lg">Score: {score}</div>
        </div>
        <div className="flex gap-2">
          {[...Array(3)].map((_, i) => (
            <Heart key={i} className={i < lives ? "text-red-500 fill-red-500" : "text-gray-600"} />
          ))}
        </div>
      </header>

      <main className="flex-grow relative overflow-hidden" ref={gameAreaRef} id="drop-area">
        {status === 'idle' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/80">
            <h2 className="text-4xl font-bold">Word Defender</h2>
            <button onClick={startGame} className="px-6 py-3 bg-blue-600 rounded-lg text-xl font-bold hover:bg-blue-500">
              Start Game
            </button>
            <button onClick={() => setShowLeaderboard(true)} className="px-6 py-3 bg-gray-600 rounded-lg text-xl font-bold hover:bg-gray-500">
              View Leaderboard
            </button>
          </div>
        )}
        {showLeaderboard && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/90 text-white p-6">
            <h2 className="text-3xl font-bold">Leaderboard</h2>
            <ul className="text-lg w-full max-w-sm">
              {leaderboard.map((entry, i) => <li key={i} className="flex justify-between py-2 border-b border-gray-700">{i+1}. {entry.name}: {entry.score}</li>)}
            </ul>
            <button onClick={() => setShowLeaderboard(false)} className="px-6 py-3 bg-red-600 rounded-lg text-xl font-bold hover:bg-red-500">
              Close
            </button>
          </div>
        )}
        {status === 'playing' && words.map(w => (
          <div 
            key={w.id}
            className="absolute text-2xl font-bold"
            style={{ top: `${w.position}%`, left: '50%', transform: 'translateX(-50%)' }}
          >
            {w.word.split('').map((char, i) => (
              <span key={i} className={i === w.hiddenIndex ? "text-yellow-400" : ""}>
                {i === w.hiddenIndex ? '_' : char}
              </span>
            ))}
          </div>
        ))}
        {status === 'gameover' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/85 p-6 text-white text-center">
            <h2 className="text-4xl font-extrabold text-red-500 tracking-wider">GAME OVER</h2>
            <p className="text-2xl font-semibold">Your Score: <span className="text-yellow-400">{score}</span></p>
            
            {!hasSubmitted ? (
              <form onSubmit={handleGameOverSubmit} className="flex flex-col items-center gap-4 mt-2 w-full max-w-sm">
                <input 
                  type="text" 
                  placeholder="請輸入名字 (Name)" 
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  className="w-full px-4 py-2 text-black bg-white rounded text-lg text-center font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                  required
                />
                <button type="submit" className="w-full px-6 py-3 bg-blue-600 rounded-lg text-lg font-bold hover:bg-blue-500 transition-colors shadow-lg">
                  Submit Score
                </button>
                <button 
                  type="button"
                  onClick={() => setHasSubmitted(true)}
                  className="text-sm text-gray-400 hover:text-gray-200 underline mt-1"
                >
                  Skip & View Leaderboard
                </button>
              </form>
            ) : (
              <div className="flex flex-col items-center gap-4 w-full max-w-sm mt-2">
                <h3 className="text-2xl font-bold text-yellow-400 border-b border-gray-700 w-full pb-2">Top Defenders</h3>
                <ul className="text-lg w-full">
                  {leaderboard.length === 0 ? (
                    <li className="text-gray-500 py-2">No records yet. Be the first!</li>
                  ) : (
                    leaderboard.map((entry, i) => (
                      <li key={i} className="flex justify-between py-2 border-b border-gray-800/50 text-base">
                        <span className="font-semibold text-gray-300">
                          {i === 0 && '🏆 '}
                          {i === 1 && '🥈 '}
                          {i === 2 && '🥉 '}
                          {i > 2 && `${i + 1}. `}
                          {entry.name}
                        </span>
                        <span className="text-yellow-400 font-mono font-bold">{entry.score}</span>
                      </li>
                    ))
                  )}
                </ul>
                <div className="flex gap-4 w-full mt-2">
                  <button onClick={startGame} className="flex-1 px-6 py-3 bg-green-600 rounded-lg text-lg font-bold hover:bg-green-500 transition-colors shadow-lg">
                    Play Again
                  </button>
                  <button onClick={() => setStatus('idle')} className="flex-1 px-6 py-3 bg-gray-600 rounded-lg text-lg font-bold hover:bg-gray-500 transition-colors">
                    Main Menu
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="p-4 bg-gray-800" id="virtual-keyboard">
        <div className="flex flex-col gap-2 max-w-2xl mx-auto">
          {["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"].map((row, rowIndex) => (
            <div key={rowIndex} className="flex justify-center gap-2">
              {row.split('').map(char => (
                <button 
                  key={char}
                  onClick={() => handleInput(char)}
                  className={`p-3 rounded-lg font-bold min-w-[2.5rem] ${
                    feedback[char] === 'correct' ? 'bg-green-600' :
                    feedback[char] === 'wrong' ? 'bg-red-600' : 'bg-gray-700 hover:bg-gray-600'
                  }`}
                >
                  {char}
                </button>
              ))}
            </div>
          ))}
        </div>
      </footer>
    </div>
  );
}
