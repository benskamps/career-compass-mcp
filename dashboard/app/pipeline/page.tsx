import { loadPipeline } from "@/lib/data";
import { KanbanBoard } from "@/components/pipeline/kanban-board";

export default async function PipelinePage() {
  const pipeline = await loadPipeline();
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-6">Pipeline</h1>
      <KanbanBoard applications={pipeline.applications} />
    </div>
  );
}
