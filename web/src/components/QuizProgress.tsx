export function QuizProgress({ current, total }: { current: number; total: number }) {
  const pct = Math.round((current / total) * 100);
  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-white/60 mb-2">
        <span>{current} de {total}</span>
        <span>{pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full bg-gradient-to-r from-violet-600 to-cyan-400 transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
