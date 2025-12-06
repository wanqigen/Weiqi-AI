import { StoneColor, AnalysisPoint, MoveResult } from "../types";

const BOARD_SIZE = 19;

// Helper to convert grid to string representation for the AI
export const boardToString = (grid: StoneColor[][]): string => {
  const letters = "ABCDEFGHJKLMNOPQRST"; // Standard Go coordinates (skip I)
  let s = "   " + letters.split('').join(' ') + "\n";
  
  for (let y = 0; y < BOARD_SIZE; y++) {
    const rowNum = BOARD_SIZE - y;
    s += (rowNum < 10 ? " " : "") + rowNum + " ";
    for (let x = 0; x < BOARD_SIZE; x++) {
      const val = grid[y][x];
      s += (val === StoneColor.BLACK ? "X" : val === StoneColor.WHITE ? "O" : ".") + " ";
    }
    s += rowNum + "\n";
  }
  s += "   " + letters.split('').join(' ');
  return s;
};

// Helper to convert x,y to Go notation (e.g. 3,3 -> D16)
const toGoCoordinate = (x: number, y: number): string => {
  const letters = "ABCDEFGHJKLMNOPQRST";
  const col = letters[x] || '?';
  const row = BOARD_SIZE - y;
  return `${col}${row}`;
};

// Helper to ensure URL has protocol
const normalizeUrl = (url: string): string => {
  let cleanUrl = url.trim().replace(/\/$/, "");
  if (!/^https?:\/\//i.test(cleanUrl)) {
    cleanUrl = "http://" + cleanUrl;
  }
  return cleanUrl;
};

// Fetch available models from Ollama
export const fetchOllamaModels = async (baseUrl: string): Promise<string[]> => {
  try {
    const cleanUrl = normalizeUrl(baseUrl);
    const response = await fetch(cleanUrl + "/api/tags");
    
    if (!response.ok) {
      throw new Error("Failed to fetch models: " + response.statusText);
    }

    const data = await response.json();
    // Ollama API returns structure: { models: [{ name: "llama3:latest", ... }, ...] }
    if (data.models && Array.isArray(data.models)) {
      return data.models.map((m: any) => m.name);
    }
    return [];
  } catch (error) {
    console.error("Error fetching Ollama models:", error);
    throw error;
  }
};

// Generic fetch wrapper for Ollama using Chat API
async function callOllamaChat(messages: any[], model: string, baseUrl: string, jsonMode: boolean = true): Promise<any> {
  const cleanUrl = normalizeUrl(baseUrl);
  const apiUrl = cleanUrl + "/api/chat";

  const body: any = {
    model: model,
    messages: messages,
    stream: false,
    options: {
      temperature: 0.2 // Lower temperature for more consistent logic
    }
  };

  if (jsonMode) {
    body.format = "json";
  }

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error("Ollama API error: " + response.statusText);
    }

    const data = await response.json();
    const content = data.message?.content || "";
    
    if (!jsonMode) {
      return content;
    }

    // Parse JSON
    try {
      // Sometimes models wrap JSON in markdown code blocks like ```json ... ```
      // or add text before/after. We try to find the JSON object/array.
      const jsonStart = content.indexOf('{');
      const jsonArrayStart = content.indexOf('[');
      
      let startIdx = -1;
      let endIdx = -1;

      // Determine if object or array comes first
      if (jsonStart !== -1 && (jsonArrayStart === -1 || jsonStart < jsonArrayStart)) {
          startIdx = jsonStart;
          endIdx = content.lastIndexOf('}') + 1;
      } else if (jsonArrayStart !== -1) {
          startIdx = jsonArrayStart;
          endIdx = content.lastIndexOf(']') + 1;
      }

      if (startIdx !== -1 && endIdx !== -1) {
        const jsonStr = content.substring(startIdx, endIdx);
        return JSON.parse(jsonStr);
      }
      
      // Fallback: try parsing the whole string
      return JSON.parse(content);

    } catch (e) {
      console.warn("Could not parse JSON from model response", content);
      throw new Error("Model response was not valid JSON");
    }
  } catch (error) {
    console.error("Ollama connection failed:", error);
    throw error;
  }
}

export const getBestMove = async (
  grid: StoneColor[][], 
  player: StoneColor,
  modelName: string,
  baseUrl: string
): Promise<{ result: MoveResult | null, payload: any }> => {
  const playerStr = player === StoneColor.BLACK ? "Black (X)" : "White (O)";
  const boardStr = boardToString(grid);

  const systemPrompt = "You are a professional 9-dan Go (Weiqi) player.\n" +
    "You must analyze the board and find the ONE best move to play next.\n" +
    "Output only a JSON object with coordinates 'x', 'y' and a short 'explanation'.\n" +
    "Coordinates: x is 0-18 (left to right), y is 0-18 (top to bottom).\n" +
    "Do not output any markdown or conversational text.";

  const userMessage = "Current Board State:\n" + boardStr + "\n\nIt is " + playerStr + "'s turn. What is the best move?";

  const messages = [{ role: "system", content: systemPrompt }, { role: "user", content: userMessage }];

  try {
    const json = await callOllamaChat(
      messages,
      modelName, 
      baseUrl, 
      true
    );
    
    if (json && typeof json.x === 'number' && typeof json.y === 'number') {
      return { 
        result: { x: json.x, y: json.y, explanation: json.explanation || "Strategic move" },
        payload: messages 
      };
    }
    return { result: null, payload: messages };

  } catch (error) {
    console.error("Error getting best move:", error);
    throw error;
  }
};

export const getBoardAnalysis = async (
  grid: StoneColor[][],
  player: StoneColor,
  modelName: string,
  baseUrl: string
): Promise<{ result: AnalysisPoint[], payload: any }> => {
  const playerStr = player === StoneColor.BLACK ? "Black (X)" : "White (O)";
  const boardStr = boardToString(grid);

  const systemPrompt = "You are a professional Go tutor.\n" +
    "Identify the top 3 candidate moves for the current player.\n" +
    "Output only a JSON ARRAY of objects.\n" +
    "Each object must have 'x', 'y', 'weight' (0-100), and 'reasoning'.\n" +
    "Coordinates: x is 0-18 (left to right), y is 0-18 (top to bottom).";

  const userMessage = "Current Board State:\n" + boardStr + "\n\nIt is " + playerStr + "'s turn. Analyze the best candidate moves.";
  const messages = [{ role: "system", content: systemPrompt }, { role: "user", content: userMessage }];

  try {
    const data = await callOllamaChat(
      messages,
      modelName, 
      baseUrl, 
      true
    );
    let result: AnalysisPoint[] = [];

    if (Array.isArray(data)) {
      result = data as AnalysisPoint[];
    } else if (data && typeof data === 'object') {
        // Handle case where model wraps array in object like { "moves": [...] }
        const values = Object.values(data);
        const array = values.find(v => Array.isArray(v));
        if (array) result = array as AnalysisPoint[];
    }
    return { result, payload: messages };

  } catch (error) {
    console.error("Error analyzing board:", error);
    return { result: [], payload: messages };
  }
};

export const sendChat = async (
  grid: StoneColor[][],
  player: StoneColor,
  history: { role: string, content: string }[],
  gameHistory: { turn: StoneColor, lastMove: {x: number, y: number} | null }[],
  userMessage: string,
  modelName: string,
  baseUrl: string
): Promise<{ result: string, payload: any }> => {
  const playerStr = player === StoneColor.BLACK ? "Black (X)" : "White (O)";
  const boardStr = boardToString(grid);

  // Generate a textual summary of the last 10 moves
  const recentMovesStr = gameHistory
    .slice(-10)
    .map((state, i) => {
        if (!state.lastMove) return null;
        const color = state.turn === StoneColor.BLACK ? "White" : "Black"; // The state stores WHOSE turn it WAS, so the move was made by the opponent of current turn? No, wait. 
        // GameHistory stores state AFTER move usually. 
        // Let's rely on the input structure. 
        // We will just assume the history passed in is correct.
        // Actually, let's just use coordinates.
        const coord = toGoCoordinate(state.lastMove.x, state.lastMove.y);
        // The move was made BY the player who just finished their turn.
        // If current state turn is Black, previous move was White.
        // Simplification: Just list coordinates.
        return `${i + 1}. ${coord}`;
    })
    .filter(Boolean)
    .join(", ");

  const systemPrompt = "You are a friendly and wise Go (Weiqi) tutor.\n" +
  "IMPORTANT: The board layout below is the CURRENT LIVE STATE. Previous chat context may refer to older states.\n" +
  "Always base your answer on the CURRENT BOARD provided here.\n\n" +
  "Current Board:\n" + boardStr + "\n\n" +
  "Recent Moves (Last 10): " + (recentMovesStr || "None") + "\n" +
  "Current Turn: " + playerStr + "\n" +
  "Answer the user's questions about the game situation, strategy, or rules based on this board.\n" +
  "Keep answers concise and helpful.";

  // We want to keep conversation history but FORCE the system prompt to be the first message always
  // and we don't want to duplicate system prompts. 
  // We will take the user's chat history (user/assistant messages) and prepend the FRESH system prompt.
  
  // Filter out old system prompts from history to avoid confusion
  const cleanHistory = history.filter(m => m.role !== 'system');
  
  // Limit history length to avoid token limits (last 30 turns ~ 15 exchanges)
  const truncatedHistory = cleanHistory.slice(-30);

  const messages = [
    { role: "system", content: systemPrompt },
    ...truncatedHistory, 
    { role: "user", content: userMessage }
  ];

  try {
    const response = await callOllamaChat(messages, modelName, baseUrl, false);
    return { result: response, payload: messages };
  } catch (error) {
    console.error("Error in chat:", error);
    throw error;
  }
}