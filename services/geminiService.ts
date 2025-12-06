import { StoneColor, AnalysisPoint, MoveResult } from "../types";

const BOARD_SIZE = 19;

// Helper to convert grid to string representation for the AI
const boardToString = (grid: StoneColor[][]): string => {
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
): Promise<MoveResult | null> => {
  const playerStr = player === StoneColor.BLACK ? "Black (X)" : "White (O)";
  const boardStr = boardToString(grid);

  const systemPrompt = "You are a professional 9-dan Go (Weiqi) player.\n" +
    "You must analyze the board and find the ONE best move to play next.\n" +
    "Output only a JSON object with coordinates 'x', 'y' and a short 'explanation'.\n" +
    "Coordinates: x is 0-18 (left to right), y is 0-18 (top to bottom).\n" +
    "Do not output any markdown or conversational text.";

  const userMessage = "Current Board State:\n" + boardStr + "\n\nIt is " + playerStr + "'s turn. What is the best move?";

  try {
    const json = await callOllamaChat(
      [{ role: "system", content: systemPrompt }, { role: "user", content: userMessage }],
      modelName, 
      baseUrl, 
      true
    );
    
    if (json && typeof json.x === 'number' && typeof json.y === 'number') {
      return { x: json.x, y: json.y, explanation: json.explanation || "Strategic move" };
    }
    return null;

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
): Promise<AnalysisPoint[]> => {
  const playerStr = player === StoneColor.BLACK ? "Black (X)" : "White (O)";
  const boardStr = boardToString(grid);

  const systemPrompt = "You are a professional Go tutor.\n" +
    "Identify the top 3 candidate moves for the current player.\n" +
    "Output only a JSON ARRAY of objects.\n" +
    "Each object must have 'x', 'y', 'weight' (0-100), and 'reasoning'.\n" +
    "Coordinates: x is 0-18 (left to right), y is 0-18 (top to bottom).";

  const userMessage = "Current Board State:\n" + boardStr + "\n\nIt is " + playerStr + "'s turn. Analyze the best candidate moves.";

  try {
    const data = await callOllamaChat(
      [{ role: "system", content: systemPrompt }, { role: "user", content: userMessage }],
      modelName, 
      baseUrl, 
      true
    );
    if (Array.isArray(data)) {
      return data as AnalysisPoint[];
    }
    // Handle case where model wraps array in object like { "moves": [...] }
    if (data && typeof data === 'object') {
        const values = Object.values(data);
        const array = values.find(v => Array.isArray(v));
        if (array) return array as AnalysisPoint[];
    }
    return [];
  } catch (error) {
    console.error("Error analyzing board:", error);
    return [];
  }
};

export const sendChat = async (
  grid: StoneColor[][],
  player: StoneColor,
  history: { role: string, content: string }[],
  userMessage: string,
  modelName: string,
  baseUrl: string
): Promise<string> => {
  const playerStr = player === StoneColor.BLACK ? "Black (X)" : "White (O)";
  const boardStr = boardToString(grid);

  const systemPrompt = "You are a friendly and wise Go (Weiqi) tutor.\n" +
  "You have access to the current board state below.\n" +
  "Current Board:\n" + boardStr + "\n" +
  "Current Turn: " + playerStr + "\n" +
  "Answer the user's questions about the game situation, strategy, or rules based on this board.\n" +
  "Keep answers concise and helpful.";

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.slice(-6), // Keep last few turns for context
    { role: "user", content: userMessage }
  ];

  try {
    const response = await callOllamaChat(messages, modelName, baseUrl, false);
    return response;
  } catch (error) {
    console.error("Error in chat:", error);
    throw error;
  }
}