# The Career Compass advisory council

A simulated review panel: five product managers with different beats and one reviewer
modeled on Anthropic technical staff. Nobody is hired; each member is a Claude subagent
with a fixed persona, a fixed rubric and a fixed output shape, so runs are comparable from
release to release.

Reconvene it after every release (or before a big climb). A Claude session does it by
following `.claude/skills/council/SKILL.md`. No paid eval run is involved: the council
reads code, skills, listing copy, eval results and the live numbers Ben pastes.

| File | What it holds |
|---|---|
| `charter.md` | The axes, the scoring scale, the output schema, the synthesis rules |
| `personas.md` | The six members: beat, lens, what each one reads first, what they distrust |
| `runs/<version>.md` | The merged findings of each sitting (ranked list + axis scores) |

Raw per-member notes go to `/mnt/project-files/council/<version>/` in the project, not here.
