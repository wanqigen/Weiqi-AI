import React, { useState, useEffect, useRef } from 'react';
import { Board } from './components/Board';
import { StoneColor, Coordinates, AnalysisPoint, GameHistory } from './types';
import { createEmptyBoard, placeStone, BOARD_SIZE } from './utils/gameLogic';
import { getBestMove, getBoardAnalysis, fetchOllamaModels, sendChat, boardToString } from './services/geminiService';
import { Brain, RotateCcw, Play, SkipForward, Info, Activity, Settings, AlertCircle, RefreshCw, X, HelpCircle, CheckCircle, MessageSquare, Send, Code } from 'lucide-react';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
}

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
  
  // Chat State
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    { role: 'system', content: 'Welcome to Zen Go. Game started.', timestamp: Date.now() }
  ]);
  const [chatInput, setChatInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [lastDebugLog, setLastDebugLog] = useState<any>(null);

  // Settings
  // Using 127.0.0.1 is safer than localhost to avoid IPv6 resolution issues with Ollama
  const [aiPlaying, setAiPlaying] = useState<StoneColor | null>(StoneColor.WHITE); 
  const [ollamaBaseUrl, setOllamaBaseUrl] = useState("http://127.0.0.1:11434");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [ollamaModel, setOllamaModel] = useState("llama3");
  const [showSettings, setShowSettings] = useState(false);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // Initial fetch for models
  useEffect(() => {
    handleFetchModels(true);
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  const handleFetchModels = async (silent = false) => {
    if (!silent) setIsFetchingModels(true);
    setConnectionStatus('idle');
    setErrorMsg(null);
    try {
        const models = await fetchOllamaModels(ollamaBaseUrl);
        setAvailableModels(models);
        // If we found models and current model is not in list (or default), select first one
        if (models.length > 0 && (!ollamaModel || !models.includes(ollamaModel))) {
            setOllamaModel(models[0]);
        }
        if (!silent) setConnectionStatus('success');
    } catch (e) {
        if (!silent) {
            handleAiError(e);
            setConnectionStatus('error');
        }
    } finally {
        if (!silent) setIsFetchingModels(false);
    }
  };

  const addChatMessage = (role: 'user' | 'assistant' | 'system', content: string) => {
      setChatHistory(prev => [...prev, { role, content, timestamp: Date.now() }]);
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

  const getCoordString = (x: number, y: number) => {
      const letters = "ABCDEFGHJKLMNOPQRST";
      return `${letters[x]}${BOARD_SIZE - y}`;
  };

  const handleIntersectionClick = async (x: number, y: number) => {
    if (isThinking) return;
    if (aiPlaying === currentTurn) return; // Not human's turn

    await executeMove(x, y, currentTurn);
  };

  const executeMove = async (x: number, y: number, color: StoneColor): Promise<boolean> => {
    // Validate coordinates
    if (x < 0 || x >= BOARD_SIZE || y < 0 || y >= BOARD_SIZE) {
      console.warn(`Invalid coordinates: (${x}, ${y})`);
      return false;
    }

    const result = placeStone(board, x, y, color);
    if (!result) {
      console.warn(`Invalid move at (${x}, ${y}) - position occupied or suicide`);
      return false; // Invalid move
    }

    const colorName = color === StoneColor.BLACK ? "Black" : "White";
    const icon = color === StoneColor.BLACK ? "⚫" : "⚪";
    addChatMessage('system', `${icon} ${colorName} played at ${getCoordString(x, y)}`);

    addToHistory();
    setBoard(result.newGrid);
    setLastMove({ x, y });
    setErrorMsg(null);
    
    // Update captures
    const captured = result.capturedCount;
    if (captured > 0) {
        addChatMessage('system', `${captured} stone(s) captured.`);
    }

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
    return true;
  };

  const handleAiError = (err: any) => {
     let msg = "Failed to connect to Ollama.";
     if (err instanceof TypeError && err.message.includes("Failed to fetch")) {
         // Check for mixed content issue
         if (window.location.protocol === 'https:' && ollamaBaseUrl.startsWith('http:')) {
            msg = "Mixed Content Error: Browser blocked HTTP request from HTTPS. Please run this app locally or enable 'Insecure content'.";
         } else {
            msg = `Connection failed. Browser blocked the request to ${ollamaBaseUrl}.`;
         }
         setShowHelpModal(true);
     } else if (err instanceof Error) {
         msg = err.message;
     }
     setErrorMsg(msg);
     addChatMessage('system', `Error: ${msg}`);
  };

  // AI Turn Effect
  useEffect(() => {
    if (currentTurn === aiPlaying && !isThinking) {
      const makeAiMove = async () => {
        setIsThinking(true);
        setErrorMsg(null);
        let retryCount = 0;
        const maxRetries = 2; // Reduced retries
        
        while (retryCount <= maxRetries) {
          try {
            const { result: move, payload } = await getBestMove(board, currentTurn, ollamaModel, ollamaBaseUrl);
            setLastDebugLog(payload);
            
            if (move) {
              // Validate move coordinates
              if (move.x >= 0 && move.x < BOARD_SIZE && move.y >= 0 && move.y < BOARD_SIZE) {
                const success = await executeMove(move.x, move.y, currentTurn);
                if (success) {
                  const reasoning = move.explanation || "Strategic placement.";
                  setAiSuggestion(reasoning);
                  addChatMessage('assistant', `AI Thought: ${reasoning}`);
                  break; // Success, exit retry loop
                } else {
                  // Invalid move logic (occupied etc)
                  retryCount++;
                  setAiSuggestion(`AI tried invalid move (${move.x}, ${move.y}), retrying...`);
                }
              } else {
                retryCount++;
              }
            } else {
                // Null move returned
                retryCount++;
            }
            
            if (retryCount > maxRetries) {
                 const msg = "Pass (AI failed to find valid move)";
                 setAiSuggestion(msg);
                 addChatMessage('system', `AI Passed.`);
                 const nextTurn = currentTurn === StoneColor.BLACK ? StoneColor.WHITE : StoneColor.BLACK;
                 setCurrentTurn(nextTurn);
                 break;
            }
          } catch (e) {
            handleAiError(e);
            break;
          }
        }
        setIsThinking(false);
      };
      makeAiMove();
    }
  }, [currentTurn, aiPlaying, board, ollamaModel, ollamaBaseUrl]);

  const handleSendMessage = async () => {
      if (!chatInput.trim() || isThinking) return;
      
      const userMsg = chatInput.trim();
      setChatInput("");
      addChatMessage('user', userMsg);
      setIsThinking(true);

      try {
          const apiHistory = chatHistory
            .filter(m => m.role !== 'system')
            .map(m => ({ role: m.role, content: m.content }));
            
          const { result: response, payload } = await sendChat(board, currentTurn, apiHistory, history, userMsg, ollamaModel, ollamaBaseUrl);
          setLastDebugLog(payload);
          addChatMessage('assistant', response);
      } catch (e) {
          handleAiError(e);
      } finally {
          setIsThinking(false);
      }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleSendMessage();
      }
  };

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
    addChatMessage('system', 'Undo performed.');
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
    setChatHistory([{ role: 'system', content: 'New Game Started.', timestamp: Date.now() }]);
  };

  const handleAnalyze = async () => {
    if (isThinking) return;
    setIsThinking(true);
    setErrorMsg(null);
    addChatMessage('system', 'Analyzing position...');
    try {
        const { result: points, payload } = await getBoardAnalysis(board, currentTurn, ollamaModel, ollamaBaseUrl);
        setLastDebugLog(payload);
        setAnalysisData(points);
        setShowAnalysis(true);
        if (points.length > 0) {
            const summary = points.map(p => `${getCoordString(p.x, p.y)} (${p.weight}%)`).join(', ');
            addChatMessage('assistant', `Analysis complete. Top moves: ${summary}`);
        } else {
            addChatMessage('assistant', 'Analysis returned no specific hotspots.');
        }
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
        const { result: move, payload } = await getBestMove(board, currentTurn, ollamaModel, ollamaBaseUrl);
        setLastDebugLog(payload);
        if (move) {
            const coord = getCoordString(move.x, move.y);
            const msg = `Recommended: ${coord} - ${move.explanation}`;
            setAiSuggestion(msg);
            addChatMessage('assistant', msg);
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

  const getStatusIcon = () => {
      if (isFetchingModels) return <RefreshCw size={12} className="animate-spin" />;
      if (connectionStatus === 'success') return <CheckCircle size={12} />;
      if (connectionStatus === 'error') return <AlertCircle size={12} />;
      return <RefreshCw size={12} />;
  };

  return (
    <div className="min-h-screen bg-stone-100 flex flex-col items-center py-8 font-sans">
      
      {/* Header */}
      <header className="mb-6 text-center relative z-10">
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
                            <div className="flex justify-between items-center mb-1">
                                <label className="text-xs font-bold text-stone-600">Ollama Base URL</label>
                                <button onClick={() => setShowHelpModal(true)} className="text-xs text-emerald-600 hover:underline flex items-center gap-1">
                                    <HelpCircle size={10} /> Help
                                </button>
                            </div>
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
                                    className={`p-1.5 rounded hover:bg-stone-300 disabled:opacity-50 transition-colors ${connectionStatus === 'success' ? 'bg-emerald-100 text-emerald-600' : connectionStatus === 'error' ? 'bg-red-100 text-red-600' : 'bg-stone-200 text-stone-600'}`}
                                    title="Test Connection & Fetch Models"
                                >
                                    {getStatusIcon()}
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
                <div 
                    onClick={() => setShowHelpModal(true)}
                    className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2 cursor-pointer hover:bg-red-100 transition-colors"
                    title="Click for help"
                >
                    <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-xs text-red-700 font-bold mb-1">Connection Error</p>
                        <p className="text-[10px] text-red-600 break-words leading-tight">{errorMsg}</p>
                        <p className="text-[10px] text-red-500 underline mt-1">Click for setup instructions</p>
                    </div>
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

        {/* Right Panel: Actions & Analysis & Chat */}
        <div className="w-full lg:w-80 flex flex-col gap-4 order-3">
            
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

             {/* Action Buttons */}
             <div className="grid grid-cols-2 gap-2">
                 <button 
                    onClick={handleAskBestMove}
                    disabled={isThinking || (!!aiPlaying && currentTurn === aiPlaying)}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-emerald-50 text-emerald-800 rounded-lg border border-emerald-100 hover:bg-emerald-100 transition-colors disabled:opacity-50 text-xs font-medium"
                >
                    <Play size={14} /> Ask Best Move
                </button>

                <button 
                    onClick={handleAnalyze}
                    disabled={isThinking}
                    className="flex items-center justify-center gap-2 px-3 py-2 bg-indigo-50 text-indigo-800 rounded-lg border border-indigo-100 hover:bg-indigo-100 transition-colors disabled:opacity-50 text-xs font-medium"
                >
                    <Info size={14} /> Analyze
                </button>
             </div>
             
             {analysisData.length > 0 && (
                <div className="flex items-center gap-2 px-2">
                        <input 
                        type="checkbox" 
                        id="showAnalysis" 
                        checked={showAnalysis} 
                        onChange={(e) => setShowAnalysis(e.target.checked)}
                        className="w-4 h-4 accent-emerald-600"
                        />
                        <label htmlFor="showAnalysis" className="text-sm text-stone-600 select-none cursor-pointer">Show Overlay on Board</label>
                </div>
            )}

            {/* Chat & Logs Window */}
            <div className="h-[500px] bg-white rounded-xl shadow-lg border border-stone-200 flex flex-col overflow-hidden relative">
                <div className="p-3 border-b border-stone-100 bg-stone-50 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                         <MessageSquare size={16} className="text-stone-400" />
                         <span className="text-xs font-bold text-stone-600 uppercase tracking-wide">Game Log & Chat</span>
                    </div>
                    {lastDebugLog && (
                        <button 
                            onClick={() => setShowDebug(!showDebug)} 
                            className={`p-1 rounded hover:bg-stone-200 transition-colors ${showDebug ? 'text-emerald-600 bg-emerald-50' : 'text-stone-400'}`}
                            title="View AI Prompt / Debug Info"
                        >
                            <Code size={14} />
                        </button>
                    )}
                </div>
                
                {/* Debug Overlay */}
                {showDebug && lastDebugLog && (
                    <div className="absolute inset-0 top-[40px] bg-white/95 backdrop-blur z-20 flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-200">
                        <div className="p-2 border-b border-stone-200 flex justify-between items-center bg-stone-50">
                            <span className="text-xs font-mono font-bold text-stone-600">Raw Prompt Payload</span>
                            <button onClick={() => setShowDebug(false)} className="text-stone-400 hover:text-stone-600">
                                <X size={14} />
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto p-4">
                             <pre className="text-[10px] font-mono text-stone-700 whitespace-pre-wrap break-all">
                                {JSON.stringify(lastDebugLog, null, 2)}
                             </pre>
                        </div>
                    </div>
                )}
                
                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-stone-50/30">
                    {chatHistory.map((msg, idx) => (
                        <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                            <div 
                                className={`max-w-[90%] rounded-lg px-3 py-2 text-sm shadow-sm
                                ${msg.role === 'user' ? 'bg-blue-600 text-white' : 
                                  msg.role === 'system' ? 'bg-stone-200 text-stone-600 text-xs font-mono' : 
                                  'bg-white border border-stone-200 text-stone-800'}
                                `}
                            >
                                {msg.content}
                            </div>
                        </div>
                    ))}
                    {isThinking && (
                        <div className="flex items-start">
                             <div className="bg-white border border-stone-200 rounded-lg px-3 py-2 text-xs text-stone-400 italic animate-pulse">
                                AI is thinking...
                             </div>
                        </div>
                    )}
                    <div ref={chatEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-2 bg-white border-t border-stone-100 flex gap-2">
                    <input 
                        type="text" 
                        value={chatInput}
                        onChange={(e) => setChatInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask about the game..."
                        className="flex-1 text-sm bg-stone-50 border border-stone-200 rounded-md px-3 py-2 outline-none focus:border-emerald-500 focus:bg-white transition-colors"
                        disabled={isThinking}
                    />
                    <button 
                        onClick={handleSendMessage}
                        disabled={!chatInput.trim() || isThinking}
                        className="bg-emerald-600 text-white p-2 rounded-md hover:bg-emerald-700 disabled:opacity-50 disabled:hover:bg-emerald-600 transition-colors"
                    >
                        <Send size={16} />
                    </button>
                </div>
            </div>

        </div>
      </div>

      {/* Troubleshooting Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full p-6 relative">
                <button 
                    onClick={() => setShowHelpModal(false)}
                    className="absolute top-4 right-4 text-stone-400 hover:text-stone-600"
                >
                    <X size={20} />
                </button>
                
                <h2 className="text-xl font-bold text-stone-800 mb-4 flex items-center gap-2">
                    <AlertCircle className="text-emerald-600" />
                    Connecting to Ollama
                </h2>
                
                <div className="space-y-4 text-sm text-stone-700">
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <p className="font-bold text-amber-800 mb-1">Connection Refused (CORS or Mixed Content)</p>
                        <p>Browsers block web pages from accessing local servers unless specific headers are set.</p>
                    </div>
                    
                    {window.location.protocol === 'https:' && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                            <p className="font-bold text-red-800 mb-1">HTTPS Warning</p>
                            <p>You are viewing this page via HTTPS, but trying to access HTTP (Ollama). Browsers block this.</p>
                            <p className="mt-2"><strong>Solution:</strong> Either run this frontend locally (http://localhost:...) OR use a tool like ngrok to tunnel your Ollama instance to https.</p>
                        </div>
                    )}

                    <div>
                        <h3 className="font-bold text-stone-900 mb-2">1. Configure Ollama (CORS)</h3>
                        <p className="mb-2">Restart Ollama with the <code>OLLAMA_ORIGINS</code> variable:</p>
                        <div className="bg-stone-800 text-stone-100 p-3 rounded-lg font-mono text-xs overflow-x-auto space-y-2">
                             <div>
                                <span className="text-stone-400"># Mac / Linux</span><br/>
                                OLLAMA_ORIGINS="*" ollama serve
                             </div>
                             <div>
                                <span className="text-stone-400"># Windows Powershell</span><br/>
                                $env:OLLAMA_ORIGINS="*"; ollama serve
                             </div>
                        </div>
                    </div>

                    <div>
                         <h3 className="font-bold text-stone-900 mb-2">2. Common Troubleshooting</h3>
                         <ul className="list-disc pl-5 space-y-1 text-stone-600">
                             <li>Use <code>http://127.0.0.1:11434</code> instead of <code>localhost</code>.</li>
                             <li>Ensure your model (e.g., <code>llama3</code>) is pulled: <code>ollama pull llama3</code>.</li>
                         </ul>
                    </div>
                </div>

                <div className="mt-6 flex justify-end">
                    <button 
                        onClick={() => setShowHelpModal(false)}
                        className="px-4 py-2 bg-stone-200 text-stone-700 rounded-lg hover:bg-stone-300 font-medium"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
      )}

    </div>
  );
};

export default App;