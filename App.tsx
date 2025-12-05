import React, { useState, useEffect } from 'react';
import { Board } from './components/Board';
import { StoneColor, Coordinates, AnalysisPoint, GameHistory } from './types';
import { createEmptyBoard, placeStone, BOARD_SIZE } from './utils/gameLogic';
import { getBestMove, getBoardAnalysis, fetchOllamaModels } from './services/geminiService';
import { Brain, RotateCcw, Play, SkipForward, Info, Activity, Settings, AlertCircle, RefreshCw } from 'lucide-react';

const App: React.FC = () => {
  // Game State
  const [board, setBoard] = useState<StoneColor[][]>(createEmptyBoard());
  const [currentTurn, setCurrentTurn] = useState<StoneColor>(StoneColor.BLACK);
  const [history, setHistory] = useState<GameHistory[]>([]);
  const [lastMove, setLastMove] = useState<Coordinates | null>(null);
  const [captures, setCaptures] = useState({ black: 0, white: 0 });

  // AI & Analysis State
  const [isThinking, setIsThinking] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [analysisData, setAnalysisData] = useState<AnalysisPoint[]>([]);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Settings
  const [aiPlaying, setAiPlaying] = useState<StoneColor | null>(StoneColor.WHITE); // Default AI plays White
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState("http://localhost:11434");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [ollamaModel, setOllamaModel] = useState("llama3");
  const [showSettings, setShowSettings] = useState(false);
  const [isFetchingModels, setIsFetchingModels] = useState(false);

  // Initial fetch for models
  useEffect(() => {
    handleFetchModels(true);
  }, []);

  const handleFetchModels = async (silent = false) => {
    if (!silent) setIsFetchingModels(true);
    setErrorMsg(null);
    try {
        const models = await fetchOllamaModels(ollamaBaseUrl);
        setAvailableModels(models);
        // If we found models and current model is not in list (or default), select first one
        if (models.length > 0 && !models.includes(ollamaModel)) {
            setOllamaModel(models[0]);
        }
    } catch (e) {
        if (!silent) {
            handleAiError(e);
        }
    } finally {
        if (!silent) setIsFetchingModels(false);
    }
  };

  // Helper to append history
  const addToHistory = () => {
    setHistory(prev => [
      ...prev,
      {
        grid: board.map(row => [...row]),
        turn: currentTurn,
        captures: { ...captures },
        lastMove: lastMove ? { ...lastMove } : null
      }
    ]);
  };

  const handleIntersectionClick = async (x: number, y: number) => {
    if (isThinking) return;
    if (aiPlaying === currentTurn) return; // Not human's turn

    await executeMove(x, y, currentTurn);
  };

  const executeMove = async (x: number, y: number, color: StoneColor) => {
    const result = placeStone(board, x, y, color);
    if (!result) return; // Invalid move

    addToHistory();
    setBoard(result.newGrid);
    setLastMove({ x, y });
    setErrorMsg(null);
    
    // Update captures
    const captured = result.capturedCount;
    if (color === StoneColor.BLACK) {
      setCaptures(prev => ({ ...prev, white: prev.white + captured }));
    } else {
      setCaptures(prev => ({ ...prev, black: prev.black + captured }));
    }

    // Switch turn
    const nextTurn = color === StoneColor.BLACK ? StoneColor.WHITE : StoneColor.BLACK;
    setCurrentTurn(nextTurn);
    setAnalysisData([]); // Clear old analysis
    setAiSuggestion(null);
  };

  const handleAiError = (err: any) => {
     let msg = "Failed to connect to Ollama.";
     if (err instanceof TypeError && err.message.includes("Failed to fetch")) {
         msg = `Could not connect to Ollama at ${ollamaBaseUrl}. Ensure it is running and 'OLLAMA_ORIGINS="*"' is set.`;
     } else if (err instanceof Error) {
         msg = err.message;
     }
     setErrorMsg(msg);
     setAiSuggestion(msg);
  };

  // AI Turn Effect
  useEffect(() => {
    if (currentTurn === aiPlaying && !isThinking) {
      const makeAiMove = async () => {
        setIsThinking(true);
        setErrorMsg(null);
        try {
            const move = await getBestMove(board, currentTurn, ollamaModel, ollamaBaseUrl);
            if (move) {
                setAiSuggestion(move.explanation || "Strategic placement.");
                await executeMove(move.x, move.y, currentTurn);
            } else {
                setAiSuggestion("Pass (AI could not find a valid move)");
                const nextTurn = currentTurn === StoneColor.BLACK ? StoneColor.WHITE : StoneColor.BLACK;
                setCurrentTurn(nextTurn);
            }
        } catch (e) {
            handleAiError(e);
        } finally {
            setIsThinking(false);
        }
      };
      makeAiMove();
    }
  }, [currentTurn, aiPlaying, board, ollamaModel, ollamaBaseUrl]);

  const handleUndo = () => {
    if (history.length === 0) return;
    if (isThinking) return;

    // Undo 2 steps if playing against AI to get back to user turn, unless AI is off
    let steps = 1;
    if (aiPlaying && history.length >= 2) {
        steps = 2;
    }

    const targetStateIndex = history.length - steps;
    if (targetStateIndex < 0) {
        // Reset to start
        handleNewGame();
        return;
    }

    const prevState = history[targetStateIndex];
    setBoard(prevState.grid.map(row => [...row]));
    setCurrentTurn(prevState.turn);
    setCaptures(prevState.captures);
    setLastMove(prevState.lastMove);
    setHistory(prev => prev.slice(0, targetStateIndex));
    setAiSuggestion(null);
    setAnalysisData([]);
    setErrorMsg(null);
  };

  const handleNewGame = () => {
    setBoard(createEmptyBoard());
    setHistory([]);
    setCurrentTurn(StoneColor.BLACK);
    setCaptures({ black: 0, white: 0 });
    setLastMove(null);
    setAiSuggestion(null);
    setAnalysisData([]);
    setErrorMsg(null);
  };

  const handleAnalyze = async () => {
    if (isThinking) return;
    setIsThinking(true);
    setErrorMsg(null);
    try {
        const points = await getBoardAnalysis(board, currentTurn, ollamaModel, ollamaBaseUrl);
        setAnalysisData(points);
        setShowAnalysis(true);
    } catch (e) {
        handleAiError(e);
    } finally {
        setIsThinking(false);
    }
  };

  const handleAskBestMove = async () => {
    if (isThinking) return;
    setIsThinking(true);
    setErrorMsg(null);
    try {
        const move = await getBestMove(board, currentTurn, ollamaModel, ollamaBaseUrl);
        if (move) {
            setAiSuggestion(`Recommended: ${move.x},${move.y} - ${move.explanation}`);
            // Highlight the move temporarily
            setAnalysisData([{ x: move.x, y: move.y, weight: 100, reasoning: move.explanation || "Best Move" }]);
            setShowAnalysis(true);
        }
    } catch (e) {
        handleAiError(e);
    } finally {
        setIsThinking(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-100 flex flex-col items-center py-8 font-sans">
      
      {/* Header */}
      <header className="mb-6 text-center">
        <h1 className="text-4xl font-serif-sc font-bold text-stone-800 mb-2 flex items-center justify-center gap-3">
          <Activity className="w-8 h-8 text-emerald-600" />
          Zen Go <span className="text-stone-400 font-light text-2xl">| Local AI</span>
        </h1>
        <p className="text-stone-500 text-sm max-w-md mx-auto">
          Play against local LLMs via Ollama.
        </p>
      </header>

      {/* Main Content Layout */}
      <div className="flex flex-col lg:flex-row gap-8 items-start justify-center w-full px-4 max-w-7xl">
        
        {/* Left Panel: Game Info & Controls */}
        <div className="w-full lg:w-64 flex flex-col gap-4 order-2 lg:order-1">
            
            {/* Player Cards */}
            <div className={`p-4 rounded-xl border-2 transition-all duration-300 ${currentTurn === StoneColor.BLACK ? 'bg-white border-stone-800 shadow-lg scale-105' : 'bg-stone-50 border-transparent opacity-70'}`}>
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                         <div className="w-4 h-4 rounded-full bg-black shadow-sm ring-1 ring-stone-300"></div>
                         <span className="font-bold text-stone-800">Black</span>
                    </div>
                    <span className="text-xs bg-stone-200 px-2 py-1 rounded">Captures: {captures.black}</span>
                </div>
                {currentTurn === StoneColor.BLACK && isThinking && <div className="text-xs text-emerald-600 animate-pulse">Thinking...</div>}
            </div>

            <div className={`p-4 rounded-xl border-2 transition-all duration-300 ${currentTurn === StoneColor.WHITE ? 'bg-white border-stone-800 shadow-lg scale-105' : 'bg-stone-50 border-transparent opacity-70'}`}>
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                         <div className="w-4 h-4 rounded-full bg-white shadow-sm ring-1 ring-stone-300"></div>
                         <span className="font-bold text-stone-800">White</span>
                    </div>
                     <span className="text-xs bg-stone-200 px-2 py-1 rounded">Captures: {captures.white}</span>
                </div>
                 {currentTurn === StoneColor.WHITE && isThinking && <div className="text-xs text-emerald-600 animate-pulse">Thinking...</div>}
            </div>

            {/* AI Controls */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-stone-200 mt-2">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-xs font-semibold uppercase text-stone-400 tracking-wider">AI Settings</h3>
                    <button 
                        onClick={() => setShowSettings(!showSettings)} 
                        className={`text-stone-400 hover:text-stone-600 transition-colors ${showSettings ? 'text-emerald-500' : ''}`}
                    >
                        <Settings size={14} />
                    </button>
                </div>
                
                {showSettings && (
                    <div className="mb-4 p-3 bg-stone-50 rounded border border-stone-200 space-y-3">
                         <div>
                            <label className="text-xs font-bold text-stone-600 block mb-1">Ollama Base URL</label>
                            <div className="flex gap-1">
                                <input 
                                    type="text" 
                                    value={ollamaBaseUrl}
                                    onChange={(e) => setOllamaBaseUrl(e.target.value)}
                                    className="w-full text-xs p-1.5 border border-stone-300 rounded focus:border-emerald-500 outline-none"
                                />
                                <button 
                                    onClick={() => handleFetchModels(false)}
                                    disabled={isFetchingModels}
                                    className="p-1.5 bg-stone-200 rounded hover:bg-stone-300 text-stone-600 disabled:opacity-50"
                                    title="Fetch Models"
                                >
                                    <RefreshCw size={12} className={isFetchingModels ? "animate-spin" : ""} />
                                </button>
                            </div>
                        </div>

                        <div>
                            <label className="text-xs font-bold text-stone-600 block mb-1">Model</label>
                            {availableModels.length > 0 ? (
                                <select 
                                    value={ollamaModel}
                                    onChange={(e) => setOllamaModel(e.target.value)}
                                    className="w-full text-xs p-1.5 border border-stone-300 rounded focus:border-emerald-500 outline-none bg-white"
                                >
                                    {availableModels.map(model => (
                                        <option key={model} value={model}>{model}</option>
                                    ))}
                                </select>
                            ) : (
                                <input 
                                    type="text" 
                                    value={ollamaModel}
                                    onChange={(e) => setOllamaModel(e.target.value)}
                                    placeholder="e.g. llama3"
                                    className="w-full text-xs p-1.5 border border-stone-300 rounded focus:border-emerald-500 outline-none"
                                />
                            )}
                        </div>
                        <p className="text-[10px] text-stone-400">Ensure 'ollama serve' is running.</p>
                    </div>
                )}

                <div className="flex flex-col gap-2">
                    <button 
                        onClick={() => setAiPlaying(null)}
                        className={`text-sm px-3 py-2 rounded-md border text-left flex items-center gap-2 ${aiPlaying === null ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'hover:bg-stone-50'}`}
                    >
                        <span className={`w-2 h-2 rounded-full ${aiPlaying === null ? 'bg-emerald-500' : 'bg-stone-300'}`}></span>
                        Human vs Human
                    </button>
                    <button 
                        onClick={() => setAiPlaying(StoneColor.WHITE)}
                        className={`text-sm px-3 py-2 rounded-md border text-left flex items-center gap-2 ${aiPlaying === StoneColor.WHITE ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'hover:bg-stone-50'}`}
                    >
                         <span className={`w-2 h-2 rounded-full ${aiPlaying === StoneColor.WHITE ? 'bg-emerald-500' : 'bg-stone-300'}`}></span>
                        Play as Black (AI White)
                    </button>
                     <button 
                        onClick={() => setAiPlaying(StoneColor.BLACK)}
                        className={`text-sm px-3 py-2 rounded-md border text-left flex items-center gap-2 ${aiPlaying === StoneColor.BLACK ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'hover:bg-stone-50'}`}
                    >
                         <span className={`w-2 h-2 rounded-full ${aiPlaying === StoneColor.BLACK ? 'bg-emerald-500' : 'bg-stone-300'}`}></span>
                        Play as White (AI Black)
                    </button>
                </div>
            </div>

            {/* Error Message Display */}
            {errorMsg && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-red-700 break-words">{errorMsg}</p>
                </div>
            )}

        </div>

        {/* Center: Board */}
        <div className="flex-1 flex justify-center order-1 lg:order-2">
             <Board 
                grid={board} 
                size={BOARD_SIZE} 
                lastMove={lastMove}
                analysisData={analysisData}
                showAnalysis={showAnalysis}
                onIntersectionClick={handleIntersectionClick}
                disabled={currentTurn === aiPlaying || isThinking}
             />
        </div>

        {/* Right Panel: Actions & Analysis */}
        <div className="w-full lg:w-72 flex flex-col gap-4 order-3">
            
            {/* Game Actions */}
            <div className="grid grid-cols-2 gap-2">
                <button 
                    onClick={handleNewGame}
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-stone-800 text-white rounded-lg hover:bg-stone-700 transition-colors shadow-sm"
                >
                    <RotateCcw size={16} /> New Game
                </button>
                <button 
                    onClick={handleUndo}
                    disabled={history.length === 0 || isThinking}
                    className="flex items-center justify-center gap-2 px-4 py-3 bg-white text-stone-700 border border-stone-300 rounded-lg hover:bg-stone-50 transition-colors shadow-sm disabled:opacity-50"
                >
                    <SkipForward size={16} className="rotate-180" /> Undo
                </button>
            </div>

            {/* Analysis Tools */}
             <div className="bg-white p-5 rounded-xl shadow-sm border border-stone-200">
                <h3 className="text-xs font-semibold uppercase text-stone-400 mb-4 tracking-wider flex items-center gap-2">
                    <Brain size={14} /> AI Assistance
                </h3>

                <div className="space-y-3">
                    <button 
                        onClick={handleAskBestMove}
                        disabled={isThinking || (!!aiPlaying && currentTurn === aiPlaying)}
                        className="w-full flex items-center justify-between px-4 py-3 bg-emerald-50 text-emerald-800 rounded-lg border border-emerald-100 hover:bg-emerald-100 transition-colors disabled:opacity-50 text-sm font-medium"
                    >
                        <span>Ask Best Move</span>
                        <Play size={14} />
                    </button>

                    <button 
                        onClick={handleAnalyze}
                        disabled={isThinking}
                        className="w-full flex items-center justify-between px-4 py-3 bg-indigo-50 text-indigo-800 rounded-lg border border-indigo-100 hover:bg-indigo-100 transition-colors disabled:opacity-50 text-sm font-medium"
                    >
                        <span>Analyze Position</span>
                        <Info size={14} />
                    </button>
                    
                    {analysisData.length > 0 && (
                        <div className="flex items-center gap-2 mt-2">
                             <input 
                                type="checkbox" 
                                id="showAnalysis" 
                                checked={showAnalysis} 
                                onChange={(e) => setShowAnalysis(e.target.checked)}
                                className="w-4 h-4 accent-emerald-600"
                             />
                             <label htmlFor="showAnalysis" className="text-sm text-stone-600 select-none cursor-pointer">Show Overlay</label>
                        </div>
                    )}
                </div>
            </div>

            {/* AI Message/Analysis Output */}
            {(aiSuggestion || (analysisData.length > 0 && showAnalysis)) && (
                <div className="bg-stone-800 text-stone-100 p-5 rounded-xl shadow-lg border-l-4 border-emerald-500 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <h4 className="font-bold text-emerald-400 text-sm mb-2 flex items-center gap-2">
                        <Activity size={14} /> AI Insight
                    </h4>
                    
                    {aiSuggestion && (
                        <div className="mb-3">
                            <p className="text-sm leading-relaxed opacity-90">{aiSuggestion}</p>
                        </div>
                    )}

                    {analysisData.length > 0 && showAnalysis && !aiSuggestion && (
                        <div className="space-y-2">
                            {analysisData.slice(0, 3).map((point, i) => (
                                <div key={i} className="flex items-start gap-2 text-xs border-b border-stone-700 pb-2 last:border-0">
                                    <span className="bg-stone-700 text-stone-300 px-1.5 py-0.5 rounded font-mono">
                                        {String.fromCharCode(65 + point.x)}{BOARD_SIZE - point.y}
                                    </span>
                                    <span className="flex-1 opacity-80">{point.reasoning}</span>
                                    <span className="font-bold text-emerald-400">{point.weight}%</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

        </div>
      </div>
    </div>
  );
};

export default App;