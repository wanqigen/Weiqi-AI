import { StoneColor, Coordinates } from '../types';

export const BOARD_SIZE = 19;

// Create an empty board
export const createEmptyBoard = (size: number = BOARD_SIZE): StoneColor[][] => {
  return Array.from({ length: size }, () => Array(size).fill(StoneColor.EMPTY));
};

// Deep copy the board grid
export const copyGrid = (grid: StoneColor[][]): StoneColor[][] => {
  return grid.map(row => [...row]);
};

// Check if a move is within bounds
export const isValidCoordinate = (x: number, y: number, size: number = BOARD_SIZE): boolean => {
  return x >= 0 && x < size && y >= 0 && y < size;
};

// Get group of stones connected to (x,y) and their liberties
const getGroupAndLiberties = (
  grid: StoneColor[][],
  x: number,
  y: number,
  color: StoneColor
): { group: Coordinates[]; liberties: number } => {
  const size = grid.length;
  const group: Coordinates[] = [];
  const visited = new Set<string>();
  const liberties = new Set<string>();
  const stack: Coordinates[] = [{ x, y }];
  
  visited.add(`${x},${y}`);

  while (stack.length > 0) {
    const current = stack.pop()!;
    group.push(current);

    const directions = [
      { dx: 0, dy: 1 },
      { dx: 0, dy: -1 },
      { dx: 1, dy: 0 },
      { dx: -1, dy: 0 },
    ];

    for (const dir of directions) {
      const nx = current.x + dir.dx;
      const ny = current.y + dir.dy;

      if (isValidCoordinate(nx, ny, size)) {
        const neighborColor = grid[ny][nx];
        const key = `${nx},${ny}`;

        if (neighborColor === StoneColor.EMPTY) {
          liberties.add(key);
        } else if (neighborColor === color && !visited.has(key)) {
          visited.add(key);
          stack.push({ x: nx, y: ny });
        }
      }
    }
  }

  return { group, liberties: liberties.size };
};

// Attempt to place a stone. Returns new grid and capture count if valid, or null if invalid.
// Basic Ko rule not implemented for simplicity, but basic suicide prevention is.
export const placeStone = (
  grid: StoneColor[][],
  x: number,
  y: number,
  color: StoneColor
): { newGrid: StoneColor[][]; capturedCount: number } | null => {
  if (grid[y][x] !== StoneColor.EMPTY) return null;

  const newGrid = copyGrid(grid);
  newGrid[y][x] = color;
  const opponent = color === StoneColor.BLACK ? StoneColor.WHITE : StoneColor.BLACK;
  let totalCaptured = 0;

  // Check for captures of opponent stones
  const directions = [
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
  ];

  for (const dir of directions) {
    const nx = x + dir.dx;
    const ny = y + dir.dy;

    if (isValidCoordinate(nx, ny, newGrid.length)) {
      if (newGrid[ny][nx] === opponent) {
        const { group, liberties } = getGroupAndLiberties(newGrid, nx, ny, opponent);
        if (liberties === 0) {
          // Capture!
          group.forEach(stone => {
            newGrid[stone.y][stone.x] = StoneColor.EMPTY;
          });
          totalCaptured += group.length;
        }
      }
    }
  }

  // Check for suicide (stone placed has no liberties and captured nothing)
  // Note: Standard Go allows suicide if it captures stones, but we processed captures above.
  // If after capturing, the placed stone still has 0 liberties, it's a suicide move (usually illegal).
  const { liberties: selfLiberties } = getGroupAndLiberties(newGrid, x, y, color);
  if (selfLiberties === 0) {
    // If it captured something, it now has liberties (the empty spots where opponent was).
    // But we already removed captured stones.
    // So if selfLiberties is still 0, it means it's a true suicide.
    return null;
  }

  return { newGrid, capturedCount: totalCaptured };
};
