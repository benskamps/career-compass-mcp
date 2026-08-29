/**
 * Thrown when a write is attempted against the bundled read-only sample store.
 *
 * `data/example/` ships inside the installed package and is read at a shifted
 * date (see sample-data.ts). Writing to it would bake one session's shifted
 * dates into the demo everyone else sees, and in a global install it means
 * editing `node_modules`. It is a demo, not a store.
 *
 * A *typed* error rather than a plain `Error` because the tool layer catches by
 * type: `pipeline_add` (and its siblings) already surface `CorruptDataError`
 * and `WriteClaimUnavailableError` as a told-plainly sentence, but a plain
 * `Error` from `atomicWriteYaml` fell through those guards and escaped as a raw
 * transport error. This is defined in its own file — rather than beside the
 * other typed errors in file-store.ts — so it can be imported by both the
 * storage layer and the tools without either edit colliding with concurrent
 * work on file-store.ts.
 */
export class ReadOnlyStoreError extends Error {
  readonly filePath: string;
  constructor(filePath: string) {
    super(
      `${filePath} is inside the bundled sample data, which is a read-only demo. ` +
        `Point CAREER_DATA_PATH at your own directory (or unset it to use ~/.career-compass) before saving.`,
    );
    this.name = "ReadOnlyStoreError";
    this.filePath = filePath;
  }
}

export function isReadOnlyStore(e: unknown): e is ReadOnlyStoreError {
  return e instanceof ReadOnlyStoreError;
}
