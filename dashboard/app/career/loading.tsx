export default function CareerLoading() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8 animate-pulse">
      <div className="flex items-center gap-6">
        <div className="w-16 h-16 rounded-full bg-bg-elevated" />
        <div className="space-y-2 flex-1">
          <div className="h-7 w-48 bg-bg-elevated rounded" />
          <div className="h-4 w-80 bg-bg-elevated rounded" />
        </div>
      </div>
      <div className="space-y-4">
        <div className="h-5 w-16 bg-bg-elevated rounded" />
        <div className="h-48 bg-bg-elevated rounded-xl" />
      </div>
      <div className="h-px bg-border" />
      <div className="space-y-4">
        <div className="h-5 w-24 bg-bg-elevated rounded" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-20 bg-bg-elevated rounded-xl" />
        ))}
      </div>
    </div>
  );
}
