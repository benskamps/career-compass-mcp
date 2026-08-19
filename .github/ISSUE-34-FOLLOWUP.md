**v2.4.1 is on npm now** — `npm i career-compass-mcp@latest` gets the fix.

Verified against the published package rather than the local tree: fresh install from the registry, server launched over stdio, and your exact payloads replayed.

```
advertised `data` schema : anyOf ["object","array","string"]   (was: {} )

save_career_section profile  {"name":"Test User","summary":"..."}   -> ✅ saved
save_career_section education [{"degree":"BS",...}]                 -> ✅ saved
check_setup                                                          -> Populated: profile (1), skills (1), education (1)
```

Both of the cases you reported now write, sent the same way that previously failed. Native objects and arrays work too, so whichever form your client picks is fine.

One note in case it matters for your setup: the issue auto-closed when the fix PR merged, which was about an hour before the package actually reached npm. That was a GitHub keyword doing its thing, not a claim that it was shipped — the release is genuinely live as of now.

Thanks again for the report. The reproduction steps and your "both produce the identical error" observation pointed straight at the input handling, which is exactly where it was.
