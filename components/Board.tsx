import React, { useMemo } from 'react';
import { StoneColor, Coordinates, AnalysisPoint } from '../types';

interface BoardProps {
  grid: StoneColor[][];
  size: number;
  lastMove: Coordinates | null;
  analysisData: AnalysisPoint[];
  showAnalysis: boolean;
  onIntersectionClick: (x: number, y: number) => void;
  disabled?: boolean;
}

const STAR_POINTS_19 = [
  { x: 3, y: 3 }, { x: 9, y: 3 }, { x: 15, y: 3 },
  { x: 3, y: 9 }, { x: 9, y: 9 }, { x: 15, y: 9 },
  { x: 3, y: 15 }, { x: 9, y: 15 }, { x: 15, y: 15 },
];

export const Board: React.FC<BoardProps> = ({
  grid,
  size,
  lastMove,
  analysisData,
  showAnalysis,
  onIntersectionClick,
  disabled
}) => {
  // Constants for rendering
  const cellSize = 32;
  const padding = 30;
  const boardPixelSize = (size - 1) * cellSize + padding * 2;

  // Render grid lines
  const lines = useMemo(() => {
    const linesArray = [];
    for (let i = 0; i < size; i++) {
      // Vertical
      linesArray.push(
        <line
          key={`v-${i}`}
          x1={padding + i * cellSize}
          y1={padding}
          x2={padding + i * cellSize}
          y2={boardPixelSize - padding}
          stroke="#000"
          strokeWidth="1"
        />
      );
      // Horizontal
      linesArray.push(
        <line
          key={`h-${i}`}
          x1={padding}
          y1={padding + i * cellSize}
          x2={boardPixelSize - padding}
          y2={padding + i * cellSize}
          stroke="#000"
          strokeWidth="1"
        />
      );
    }
    return linesArray;
  }, [size, boardPixelSize]);

  // Render Star Points (Hoshi)
  const starPoints = useMemo(() => {
    if (size !== 19) return null; // Only for 19x19 for now
    return STAR_POINTS_19.map((p, i) => (
      <circle
        key={`star-${i}`}
        cx={padding + p.x * cellSize}
        cy={padding + p.y * cellSize}
        r={3}
        fill="#000"
      />
    ));
  }, [size]);

  // Render Stones
  const stones = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const stone = grid[y][x];
      if (stone !== StoneColor.EMPTY) {
        const cx = padding + x * cellSize;
        const cy = padding + y * cellSize;
        
        // Stone shadow
        stones.push(
          <circle
            key={`shadow-${x}-${y}`}
            cx={cx + 1}
            cy={cy + 1}
            r={cellSize * 0.48}
            fill="rgba(0,0,0,0.2)"
          />
        );

        // Actual stone
        stones.push(
          <circle
            key={`stone-${x}-${y}`}
            cx={cx}
            cy={cy}
            r={cellSize * 0.46}
            fill={stone === StoneColor.BLACK ? '#111' : '#fcfcfc'}
            stroke={stone === StoneColor.WHITE ? '#ddd' : 'none'}
          />
        );

        // Stone highlight (for 3D effect)
        if (stone === StoneColor.BLACK) {
           stones.push(
            <circle
              key={`glint-${x}-${y}`}
              cx={cx - cellSize * 0.15}
              cy={cy - cellSize * 0.15}
              r={cellSize * 0.1}
              fill="rgba(255,255,255,0.15)"
            />
           )
        } else {
             stones.push(
            <circle
              key={`shade-${x}-${y}`}
              cx={cx - cellSize * 0.1}
              cy={cy - cellSize * 0.1}
              r={cellSize * 0.35}
              fill="rgba(255,255,255,0.4)" // subtle shell texture simulation
              className="pointer-events-none"
            />
           )
        }
      }
    }
  }

  // Last Move Marker
  let lastMoveMarker = null;
  if (lastMove) {
    const cx = padding + lastMove.x * cellSize;
    const cy = padding + lastMove.y * cellSize;
    const stoneColor = grid[lastMove.y][lastMove.x];
    lastMoveMarker = (
      <circle
        cx={cx}
        cy={cy}
        r={cellSize * 0.2}
        fill="transparent"
        stroke={stoneColor === StoneColor.BLACK ? '#fff' : '#000'}
        strokeWidth="2"
      />
    );
  }

  // Analysis Overlays
  const analysisMarkers = useMemo(() => {
    if (!showAnalysis) return null;
    return analysisData.map((point, index) => {
        const cx = padding + point.x * cellSize;
        const cy = padding + point.y * cellSize;
        
        // Heatmap color based on weight
        const opacity = Math.min(Math.max(point.weight / 100, 0.2), 0.9);
        const color = `rgba(50, 205, 50, ${opacity})`; // Green-ish

        return (
            <g key={`analysis-${index}`}>
                 <circle
                    cx={cx}
                    cy={cy}
                    r={cellSize * 0.4}
                    fill={color}
                    className="animate-pulse"
                />
                <text 
                    x={cx} 
                    y={cy} 
                    dy=".3em" 
                    textAnchor="middle" 
                    fontSize="10" 
                    fill="#fff" 
                    fontWeight="bold"
                    pointerEvents="none"
                >
                    {point.weight}
                </text>
            </g>
        )
    })
  }, [analysisData, showAnalysis]);

  // Clickable areas (invisible circles)
  const clickTargets = [];
  if (!disabled) {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        clickTargets.push(
          <rect
            key={`click-${x}-${y}`}
            x={padding + x * cellSize - cellSize / 2}
            y={padding + y * cellSize - cellSize / 2}
            width={cellSize}
            height={cellSize}
            fill="transparent"
            cursor="pointer"
            onClick={() => onIntersectionClick(x, y)}
            className="hover:fill-black/10 transition-colors"
          />
        );
      }
    }
  }

  return (
    <div className="relative shadow-2xl rounded-sm overflow-hidden bg-[#e3c07e] select-none inline-block">
      {/* Wood Texture Background CSS */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-40"
        style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.6' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23noise)' opacity='0.5'/%3E%3C/svg%3E")`,
            filter: 'sepia(0.5) contrast(0.8)'
        }}
      ></div>

      <svg width={boardPixelSize} height={boardPixelSize} className="relative z-10 block">
        {lines}
        {starPoints}
        {stones}
        {lastMoveMarker}
        {analysisMarkers}
        {clickTargets}
      </svg>
      
      {/* Coordinates labels - Top */}
      <div className="absolute top-0 left-0 w-full h-[30px] flex items-end pointer-events-none">
          {Array.from({length: 19}).map((_, i) => {
               const letters = "ABCDEFGHJKLMNOPQRST";
               return (
                   <div key={i} className="flex-1 text-center text-[10px] font-bold opacity-60" style={{width: 32, flex: 'none', marginLeft: i === 0 ? 14 : 0}}>
                       {letters[i]}
                   </div>
               )
          })}
      </div>
    </div>
  );
};
