# Career Compass — Setup Check

ℹ️ **Version** — v2.9.7 installed. Not compared against npm — the update check is off unless you ask for it.
   → Say "check Career Compass for updates" to run this with checkForUpdates: true (one request to the public npm registry).
✅ **Data directory** — ~/.career-compass exists and is writable.
ℹ️ **Git backup** — ~/.career-compass is not a git repository.
   → Turn it into one, in any shell:
       git init "~/.career-compass"
       git -C "~/.career-compass" add -A
       git -C "~/.career-compass" commit -m "initial career kb"
     That gives you free backup and a diff history for all your career data.
⚠️ **Career KB** — Nothing saved yet, so `tailor_resume`, `generate_cover_letter`, `explore_opportunity`, and `prepare_interview` have nothing to work from. This is the normal state of a fresh install.
   → Paste in your resume and say "save this to my Career KB" — Claude extracts the structure and writes it with `save_career_section`.
ℹ️ **Pipeline** — No applications tracked yet.
   → Add the first one with `pipeline_add`, then watch it move:
     PowerShell:  $env:CAREER_DATA_PATH="~/.career-compass"; npx -y career-compass-mcp@2.9.7 dashboard
     bash/zsh:    CAREER_DATA_PATH="~/.career-compass" npx -y career-compass-mcp@2.9.7 dashboard
✅ **Temp files** — No leftover .tmp files.
✅ **Write claim** — No other process is writing this folder.
✅ **Dashboard** — Not running on port 3141 (nothing is listening). That's normal — it only runs while you have it open.
   → Open it on the folder above:
     PowerShell:  $env:CAREER_DATA_PATH="~/.career-compass"; npx -y career-compass-mcp@2.9.7 dashboard
     bash/zsh:    CAREER_DATA_PATH="~/.career-compass" npx -y career-compass-mcp@2.9.7 dashboard

**Getting started.** The install itself is fine — there's just no career data in it yet. Paste your resume into this conversation and ask me to save it; I'll extract the structure and write it with `save_career_section`. After that, add a role you're chasing with `pipeline_add`, and everything else here has something to work with.
