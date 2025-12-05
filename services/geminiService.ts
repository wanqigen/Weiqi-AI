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

// Fetch available models from Ollama
export const fetchOllamaModels = async (baseUrl: string): Promise<string[]> => {
  try {
    const cleanUrl = baseUrl.replace(/\/$/, "");
    const response = await fetch(`${cleanUrl}/api/tags`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.statusText}`);
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

// Generic fetch wrapper for Ollama
async function callOllama(prompt: string, model: string, baseUrl: string): Promise<any> {
  const cleanUrl = baseUrl.replace(/\/$/, "");
  const apiUrl = `${cleanUrl}/api/generate`;

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        prompt: prompt,
        stream: false,
        format: "json" // Request JSON mode from Ollama
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    const data = await response.json();
    return JSON.parse(data.response);
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

  const prompt = `
    You are a professional 9-dan Go (Weiqi) player.
    
    Current Board State:
    ${boardStr}
    
    It is ${playerStr}'s turn.
    Analyze the board and choose the ONE best next move.
    
    You must output a VALID JSON object. Do not include markdown formatting.
    The JSON object must have these fields:
    - "x": integer (0-18, representing the column from left, A=0)
    - "y": integer (0-18, representing the row from top, 19=0)
    - "explanation": string (A short strategic reasoning for the move)

    Example Output:
    { "x": 15, "y": 3, "explanation": "Approaching the corner to secure territory." }
  `;

  try {
    const json = await callOllama(prompt, modelName, baseUrl);
    
    if (typeof json.x === 'number' && typeof json.y === 'number') {
      return { x: json.x, y: json.y, explanation: json.explanation || "Strategic move" };
    }
    return null;

  } catch (error) {
    console.error("Error getting best move:", error);
    throw error; // Re-throw to handle in UI
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

  const prompt = `
    You are a professional Go tutor.
    
    Current Board State:
    ${boardStr}
    
    It is ${playerStr}'s turn.
    Identify the top 3 candidate moves.
    
    You must output a VALID JSON ARRAY of objects. Do not include markdown formatting.
    Each object in the array must have:
    - "x": integer (0-18, column index)
    - "y": integer (0-18, row index)
    - "weight": integer (0-100, representing move quality)
    - "reasoning": string (Short explanation)

    Example Output:
    [
      { "x": 3, "y": 3, "weight": 95, "reasoning": "Taking the star point." },
      { "x": 16, "y": 3, "weight": 80, "reasoning": "Enclosing the corner." }
    ]
  `;

  try {
    const data = await callOllama(prompt, modelName, baseUrl);
    if (Array.isArray(data)) {
      return data as AnalysisPoint[];
    }
    return [];
  } catch (error) {
    console.error("Error analyzing board:", error);
    return [];
  }
};