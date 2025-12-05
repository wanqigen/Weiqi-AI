import { GoogleGenAI, Type, Schema } from "@google/genai";
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

// Convert Go coordinate (e.g. "Q16") to x,y
// This is used if the model returns string coordinates, though we will ask for JSON.
const parseCoordinate = (coord: string): { x: number, y: number } | null => {
  const letters = "ABCDEFGHJKLMNOPQRST";
  const colChar = coord.charAt(0).toUpperCase();
  const rowStr = coord.slice(1);
  
  const x = letters.indexOf(colChar);
  const row = parseInt(rowStr);
  
  if (x === -1 || isNaN(row)) return null;
  
  const y = BOARD_SIZE - row;
  return { x, y };
};

const getAi = () => {
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

export const getBestMove = async (
  grid: StoneColor[][], 
  player: StoneColor
): Promise<MoveResult | null> => {
  const ai = getAi();
  const playerStr = player === StoneColor.BLACK ? "Black (X)" : "White (O)";
  const boardStr = boardToString(grid);

  const prompt = `
    You are a professional 9-dan Go player.
    Current Board State:
    ${boardStr}
    
    It is ${playerStr}'s turn.
    Analyze the board and choose the best next move.
    
    Return the result in JSON format with 'x' (0-18, from left), 'y' (0-18, from top), and a short 'explanation'.
    The top-left corner is 0,0.
    The bottom-right corner is 18,18.
    Ensure the move is legal (not on top of another stone).
  `;

  const schema: Schema = {
    type: Type.OBJECT,
    properties: {
      x: { type: Type.INTEGER, description: "The column index (0-18)" },
      y: { type: Type.INTEGER, description: "The row index (0-18)" },
      explanation: { type: Type.STRING, description: "Brief strategic reasoning" }
    },
    required: ["x", "y", "explanation"]
  };

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0.2 // Lower temperature for more focused play
      }
    });

    const json = JSON.parse(response.text || "{}");
    if (json.x !== undefined && json.y !== undefined) {
      return { x: json.x, y: json.y, explanation: json.explanation };
    }
    return null;

  } catch (error) {
    console.error("Error getting best move:", error);
    return null;
  }
};

export const getBoardAnalysis = async (
  grid: StoneColor[][],
  player: StoneColor
): Promise<AnalysisPoint[]> => {
  const ai = getAi();
  const playerStr = player === StoneColor.BLACK ? "Black (X)" : "White (O)";
  const boardStr = boardToString(grid);

  const prompt = `
    You are a professional Go tutor.
    Current Board State:
    ${boardStr}
    
    It is ${playerStr}'s turn.
    Identify the top 3 to 5 candidate moves.
    Assign a 'weight' (0-100) representing the quality/value of the move.
    Provide a very short reasoning for each.
    
    Return a JSON array of objects.
    Coordinates are 0-indexed: x (0-18 from left), y (0-18 from top).
  `;

  const schema: Schema = {
    type: Type.ARRAY,
    items: {
      type: Type.OBJECT,
      properties: {
        x: { type: Type.INTEGER },
        y: { type: Type.INTEGER },
        weight: { type: Type.INTEGER },
        reasoning: { type: Type.STRING }
      },
      required: ["x", "y", "weight", "reasoning"]
    }
  };

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
      }
    });

    const data = JSON.parse(response.text || "[]");
    return data as AnalysisPoint[];
  } catch (error) {
    console.error("Error analyzing board:", error);
    return [];
  }
};
