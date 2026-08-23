/**
 * One promise chain per key. The in-process half of write serialization.
 *
 * Extracted from file-store.ts so `write-claim.ts` can use it too without an
 * import cycle. Two callers, one implementation — a second copy of this is how
 * the two dashboards drifted apart, and the same reasoning applies here.
 *
 * This is a different guarantee from an atomic rename. Atomic *writes* stop a
 * reader from ever seeing a half-written file. They do nothing about two
 * overlapping read-modify-write cycles: both load the same snapshot, both mutate
 * their own copy, both write, and whichever renames last wins outright. That is
 * not theoretical — an MCP client may dispatch several `tools/call` requests
 * before any resolves (the SDK's stdio transport drains a whole chunk
 * synchronously and dispatches each without awaiting the previous), which is
 * exactly what happens when a user says "add both of these jobs." Before this
 * lock, eight concurrent adds left one application on disk and reported eight
 * successes.
 *
 * It QUEUES; it never refuses. That is the right shape for work inside one
 * process, where the second caller is a legitimate request that should proceed
 * once the first finishes — unlike the cross-process write claim, which must
 * fail fast because the other holder is not ours to wait for.
 */
const chains = new Map<string, Promise<unknown>>();

export function serializeOn<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = chains.get(key) ?? Promise.resolve();
  // Run on both settle paths: one caller's failure must not wedge the chain.
  const run = previous.then(fn, fn);
  // Store a never-rejecting tail so an unhandled rejection can't escape here;
  // `run` itself still rejects to the caller.
  chains.set(
    key,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  return run;
}
