interface GridLinesProps {
  width: number;
  height: number;
  pixelsPerBeat: number;
  noteHeight: number;
  totalNotes: number;
}

export function GridLines({
  width,
  height,
  pixelsPerBeat,
  noteHeight,
  totalNotes,
}: GridLinesProps) {
  const beats = Math.ceil(width / pixelsPerBeat);
  const lines = [];

  // Vertical beat lines
  for (let beat = 0; beat <= beats; beat++) {
    const x = beat * pixelsPerBeat;
    const isMeasure = beat % 4 === 0;
    lines.push(
      <line
        key={`v-${beat}`}
        x1={x}
        y1={0}
        x2={x}
        y2={height}
        stroke={isMeasure ? '#333' : '#1e1e1e'}
        strokeWidth={isMeasure ? 1 : 0.5}
      />,
    );
  }

  // Horizontal note lines
  for (let i = 0; i <= totalNotes; i++) {
    const y = i * noteHeight;
    lines.push(
      <line
        key={`h-${i}`}
        x1={0}
        y1={y}
        x2={width}
        y2={y}
        stroke="#1e1e1e"
        strokeWidth={0.5}
      />,
    );
  }

  return <>{lines}</>;
}
