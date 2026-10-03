# Career Compass — Setup Check

ℹ️ **Version** — v2.9.5 installed. Not compared against npm — the update check is off unless you ask for it.
   → Say "check Career Compass for updates" to run this with checkForUpdates: true (one request to the public npm registry).
✅ **Data directory** — ~/.career-compass exists and is writable.
ℹ️ **Git backup** — ~/.career-compass is not a git repository.
   → Turn it into one, in any shell:
       git init "~/.career-compass"
       git -C "~/.career-compass" add -A
       git -C "~/.career-compass" commit -m "initial career kb"
     That gives you free backup and a diff history for all your career data.
✅ **Career KB** — All sections populated: profile (1), experience (3), skills (12), education (2), projects (3), testimonials (3), journal (5).
✅ **Pipeline** — Parses cleanly — 8 applications, 6 still active.
✅ **Temp files** — No leftover .tmp files.
✅ **Write claim** — No other process is writing this folder.
✅ **Dashboard** — Not running on port 3141 (nothing is listening). That's normal — it only runs while you have it open.
   → Open it on the folder above:
     PowerShell:  $env:CAREER_DATA_PATH="~/.career-compass"; npx -y career-compass-mcp@2.9.5 dashboard
     bash/zsh:    CAREER_DATA_PATH="~/.career-compass" npx -y career-compass-mcp@2.9.5 dashboard

**Everything checks out.**
