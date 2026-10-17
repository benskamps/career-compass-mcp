# Career Compass — Setup Check

Running as a standalone MCP server v2.13.1.

✅ **Version** — v2.13.1 installed. The Claude plugin updates itself; set up with npx or `install`, run `npx -y career-compass-mcp@latest install` and restart your client to update.
✅ **Data directory** — ~/.career-compass exists and is writable.
ℹ️ **Git backup** — ~/.career-compass is not a git repository.
   → Turn it into one, in any shell:
       git init "~/.career-compass"
       git -C "~/.career-compass" add -A
       git -C "~/.career-compass" commit -m "initial career kb"
     That gives you free backup and a diff history for all your career data.
✅ **Career KB** — Populated: profile (1), experience (3), skills (12), education (2), projects (3), testimonials (3), journal (5).
✅ **Pipeline** — Parses cleanly — 8 applications, 6 still active.
✅ **Temp files** — No leftover .tmp files.
✅ **Write claim** — No other process is writing this folder.
✅ **Dashboard** — Not running on port 3141 (nothing is listening). That's normal — it only runs while you have it open.

**Everything checks out.**

If Career Compass helped, a GitHub star or a two-line note in Discussions (https://github.com/benskamps/career-compass-mcp/discussions) is the only way the author hears about it. Nothing is sent automatically.
