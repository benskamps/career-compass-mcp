Thanks for this — the report was exactly right, including your hunch that `data` was being stringified before it reached the Zod schema. That's precisely what was happening, and it wasn't something you were doing wrong. `save_career_section` was refusing every call from every client on v2.4.0.

**Root cause.** `data`'s shape depends on `section`, so it was declared `z.unknown()`. Zod emits `{}` for that — a *required* property with no `type` at all. Here's what the server was actually advertising:

```
section: {"type":"string","enum":["profile","experience",...]}
data:    {}
```

With no type to go on, clients serialize the value as a JSON string. The section schema, which correctly wants an object or an array, then rejected it. So the tool was refusing callers for doing the only thing its own schema left open to them. And since this is the only tool that populates the Career KB, your read of the impact was right too: a fresh install could never leave the empty state, which is why `check_setup` kept calling that normal.

**The fix** ([#35](https://github.com/benskamps/career-compass-mcp/pull/35)) has two halves:

1. `data` is now declared as a real `object | array | string` union, so the advertised schema carries actual types and clients send structured data.
2. The handler unwraps a JSON string before validating, so a client that still stringifies works anyway.

`string` stays in the union deliberately — remove it and a stringifying client gets rejected by the SDK before the handler can produce a useful error.

Parsing didn't loosen validation. A wrong shape inside valid JSON is still refused with the same field-level help, and a string that isn't JSON now gets its own distinct error instead of a confusing shape complaint.

**Why CI never caught it:** the existing tests drive the server over an in-memory transport with native JS objects. They prove the server *handles* structured data; they never proved a client *sends* it. Your report found the gap between those two things. There's now a repo-wide guard that fails if any tool ever advertises an untyped parameter again, and I swept all 17 tools — this was the only one.

I also drove the full flow end to end after the fix: all six KB sections populated, then all 17 tools called. `check_setup` now reports "All sections populated," and the resume and interview tools read the data back correctly.

This ships in **v2.4.1**. I'll follow up here when it's on npm — until then `npm i career-compass-mcp` still gets the broken build. Sorry you hit this, and thank you for the unusually clear write-up; the reproduction steps and the "what I tried" section made it a fast diagnosis.
