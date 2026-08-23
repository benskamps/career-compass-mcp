import { completable } from "@modelcontextprotocol/sdk/server/completable.js";
import { z } from "zod";
import { loadPipeline, isCorruptDataError } from "./storage/file-store.js";
import type { Application } from "./schemas/career-schema.js";

/**
 * Argument completion, served from the user's own YAML.
 *
 * Every other argument in this server is something the model can reason its way
 * to. `id` is the one it cannot: an opaque string that exists only on the user's
 * disk. Without completion the model's options are to call `pipeline_view`
 * first and burn a round trip, or to guess — and a guessed id fails a
 * *destructive* update, which is the worst place to be wrong.
 *
 * This is a genuinely MCP-shaped feature. A web form has the list because it
 * rendered it; a CLI has it because you tab. A tool call has no such affordance
 * unless the server offers one, and the server is the only thing that can,
 * because it is the only participant holding the file.
 *
 * ── Failure posture ─────────────────────────────────────────────────────────
 *
 * Completion is advisory. A host that does not implement `completion/complete`
 * simply never asks, and every tool behaves exactly as before — this feature
 * fails *silently*, not misleadingly, which is why it is worth shipping ahead of
 * anything whose value is contingent on host support.
 *
 * It must also never throw. A completion request arriving while the pipeline is
 * mid-write, corrupt, or absent has to answer "no suggestions" rather than
 * surface an error into a UI affordance the user did not deliberately invoke.
 */

/** Suggestions a host will render before it starts truncating. */
const MAX_SUGGESTIONS = 20;

/**
 * Rank applications for a partial id.
 *
 * The label a user is thinking of is the company, not the id — ids look like
 * `acme-senior-eng-2026-08`, so matching only the id prefix would fail the
 * obvious query "acme". Match across id, company and role; prefix hits sort
 * above substring hits, then the most recently updated first, because the thing
 * you are updating is almost always the thing you last touched.
 */
export function rankApplications(apps: Application[], partial: string): Application[] {
  const q = partial.trim().toLowerCase();

  const scored = apps.map((app) => {
    const id = app.id.toLowerCase();
    const company = (app.company ?? "").toLowerCase();
    const role = (app.role ?? "").toLowerCase();

    let score = -1;
    if (!q) score = 0;
    else if (id.startsWith(q)) score = 4;
    else if (company.startsWith(q)) score = 3;
    else if (id.includes(q) || company.includes(q)) score = 2;
    else if (role.includes(q)) score = 1;

    return { app, score };
  });

  return scored
    .filter((s) => s.score >= 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.app.dateUpdated ?? "").localeCompare(a.app.dateUpdated ?? "") ||
        a.app.id.localeCompare(b.app.id),
    )
    .map((s) => s.app);
}

/**
 * Format one application as a completion entry.
 *
 * The value must be the bare id — it is what gets substituted into the call.
 * Everything human goes in the label, because an id alone is unreadable and the
 * point of this feature is that a person can recognise the row.
 */
function toCompletion(app: Application): { value: string; label: string } {
  const bits = [app.company, app.role].filter(Boolean).join(" · ");
  const status = app.status ? ` [${app.status}]` : "";
  return { value: app.id, label: bits ? `${bits}${status}` : app.id };
}

/** Suggest application ids matching `partial`. Never throws. */
export async function completeApplicationId(
  partial: string,
): Promise<{ value: string; label: string }[]> {
  try {
    const pipeline = await loadPipeline();
    return rankApplications(pipeline.applications ?? [], partial)
      .slice(0, MAX_SUGGESTIONS)
      .map(toCompletion);
  } catch (error) {
    // A corrupt or half-written store must not surface an error through an
    // autocomplete popup. The user gets no suggestions and the tools still
    // report the real problem when they are actually called.
    if (!isCorruptDataError(error)) console.error("Completion failed:", error);
    return [];
  }
}

/**
 * The completable `id` variable for the `career://application/{id}` template.
 *
 * ── Why this lives on a resource template and not on a tool argument ────────
 *
 * The obvious place for this is `pipeline_update`'s `id` argument, and that was
 * the first implementation. It does nothing. MCP's `completion/complete` accepts
 * exactly two reference types — `ref/prompt` and `ref/resource` — and there is
 * no `ref/tool`. Wrapping a tool's input schema in `completable()` type-checks,
 * registers, and is never once consulted; a real stdio client asking for
 * completion got `-32601 Method not found`, because with nothing completable in
 * a prompt or a template the SDK never even installs the handler.
 *
 * A resource template is the seat that works, and it is the better feature
 * anyway: it makes each application individually addressable
 * (`career://application/acme-staff-eng-2026-03`) so a host can attach one
 * application to a conversation instead of the whole pipeline, and the id is
 * completable while the user picks it.
 */
export async function completeApplicationIdValues(partial: string): Promise<string[]> {
  return (await completeApplicationId(partial)).map((s) => s.value);
}
