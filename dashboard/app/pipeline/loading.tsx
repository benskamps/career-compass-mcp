export default function PipelineLoading() {
  return (
    <div className="p-6 animate-pulse">
      <div className="h-8 w-32 bg-bg-elevated rounded mb-6" />
      <div className="flex gap-4 overflow-x-auto pb-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex flex-col min-w-[272px] w-full md:w-72 md:shrink-0">
            <div className="flex items-center gap-2 px-3 py-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-bg-elevated" />
              <div className="h-4 w-20 bg-bg-elevated rounded" />
            </div>
            <div className="flex flex-col gap-2">
              {Array.from({ length: 2 }).map((_, j) => (
                <div key={j} className="h-28 rounded-xl bg-bg-elevated" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
