export enum StoneColor {
  EMPTY = 0,
  BLACK = 1,
  WHITE = 2,
}

export interface Coordinates {
  x: number;
  y: number;
}

export interface BoardState {
  grid: StoneColor[][];
  size: number;
  lastMove: Coordinates | null;
  captures: {
    black: number;
    white: number;
  };
  turn: StoneColor; // Whose turn is it currently
}

export interface AnalysisPoint {
  x: number;
  y: number;
  weight: number; // 0 to 100
  reasoning: string;
}

export interface MoveResult {
  x: number;
  y: number;
  explanation?: string;
}

export interface GameHistory {
  grid: StoneColor[][];
  turn: StoneColor;
  captures: { black: number; white: number };
  lastMove: Coordinates | null;
}
