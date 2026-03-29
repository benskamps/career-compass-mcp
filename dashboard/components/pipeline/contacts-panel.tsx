import { Card, CardContent } from "@/components/ui/card";
import type { Contact } from "@shared/schemas/career-schema";

export function ContactsPanel({ contacts }: { contacts: Contact[] }) {
  if (contacts.length === 0) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-text-secondary uppercase tracking-wider">
        Contacts
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {contacts.map((c, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <p className="font-medium text-sm">{c.name}</p>
              {c.title && <p className="text-xs text-text-secondary">{c.title}</p>}
              {c.email && (
                <p className="text-xs font-mono text-text-muted mt-1">{c.email}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
