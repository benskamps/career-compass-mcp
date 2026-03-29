export function NotesLog({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
        Notes
      </h3>
      <div className="space-y-2">
        {[...notes].reverse().map((note, i) => {
          const dateMatch = note.match(/^\[(\d{4}-\d{2}-\d{2})\]\s*/);
          const date = dateMatch ? dateMatch[1] : null;
          const text = dateMatch ? note.slice(dateMatch[0].length) : note;
          return (
            <div
              key={i}
              className="flex gap-3 py-2 border-b border-border last:border-0"
            >
              {date && (
                <span className="text-xs font-mono text-text-muted shrink-0">{date}</span>
              )}
              <p className="text-sm text-text-secondary">{text}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
