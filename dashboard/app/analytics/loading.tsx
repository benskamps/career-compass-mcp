export default function AnalyticsLoading() {
  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8 animate-pulse">
      <div className="h-8 w-28 bg-bg-elevated rounded" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-bg-elevated rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-64 bg-bg-elevated rounded-xl" />
        ))}
      </div>
    </div>
  );
}
