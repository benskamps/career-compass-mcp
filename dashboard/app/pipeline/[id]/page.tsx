import { notFound } from "next/navigation";
import Link from "next/link";
import { loadPipeline } from "@/lib/data";
import { ApplicationHeader } from "@/components/pipeline/application-header";
import { ApplicationTimeline } from "@/components/pipeline/application-timeline";
import { ContactsPanel } from "@/components/pipeline/contacts-panel";
import { NotesLog } from "@/components/pipeline/notes-log";
import { MetadataSidebar } from "@/components/pipeline/metadata-sidebar";

export default async function ApplicationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const pipeline = await loadPipeline();
  const app = pipeline.applications.find((a) => a.id === id);
  if (!app) notFound();

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Link
        href="/pipeline"
        className="text-sm text-text-muted hover:text-text-primary mb-4 inline-block"
      >
        &larr; Back to Pipeline
      </Link>
      <ApplicationHeader app={app} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
        <div className="lg:col-span-2 space-y-8">
          <ApplicationTimeline app={app} />
          <ContactsPanel contacts={app.contacts} />
          <NotesLog notes={app.notes} />
        </div>
        <div>
          <MetadataSidebar app={app} />
        </div>
      </div>
    </div>
  );
}
