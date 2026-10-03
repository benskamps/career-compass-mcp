---
tags: [trigger, should-not-fire]
max_turns: 4
timeout_seconds: 300
allowed_tools: [Skill]
---

Fix this SQL: SELECT name FROM users WHERE created_at > '2026-01-01' GROUP BY email;
