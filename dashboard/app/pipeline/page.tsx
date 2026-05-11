import { loadPipeline } from "@/lib/data";
import { KanbanBoard } from "@/components/pipeline/kanban-board";
import { KANBAN_COLUMNS } from "@/lib/theme";

export default async function PipelinePage() {
  const pipeline = await loadPipeline();
  const total = pipeline.applications.length;
  return (
    <div className="px-6 py-8 max-w-[1600px] mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
        <p className="text-sm text-text-secondary mt-1">
          {total} {total === 1 ? "application" : "applications"} across {KANBAN_COLUMNS.length} stages
        </p>
      </header>
      <KanbanBoard applications={pipeline.applications} />
    </div>
  );
}
