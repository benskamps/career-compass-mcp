# How Career Compass works

Diagrams of the shipped system, for anyone deciding whether to trust it, extend it, or
debug it. Rendered by GitHub; the [README](../README.md) carries a plain-text version of
the first one, because npmjs.com does not render Mermaid.

For the adversarial version of this — findings, gates, and the defects that got closed —
see [`architecture-audit.md`](architecture-audit.md). This page describes the system as a
user meets it.

---

## 1. The system

One MCP server, one directory of plain YAML, and up to three peers reading it. Nothing is
hosted, and no process owns the data.

```mermaid
flowchart TB
    C["<b>Your MCP client</b><br/>Claude Code · Claude Desktop · Cursor · Zed · …"]
    D["<b>Local dashboard</b><br/>127.0.0.1 only"]
    E["<b>Your editor</b><br/>vim · VS Code · Finder"]

    subgraph net["off the machine"]
        NPM(["npm registry<br/><i>the only outbound call</i>"])
    end

    subgraph server["career-compass-mcp — Node, stdio, on your machine"]
        direction LR
        T["<b>18 tools</b><br/>explore · tailor<br/>prep · evaluate"]
        P["<b>6 prompts</b><br/>slash-command<br/>shortcuts"]
        R["<b>9 resources</b><br/>career:// URIs<br/>subscribable"]
    end

    subgraph disk["CAREER_DATA_PATH — your disk"]
        direction LR
        Y[("career/*.yaml<br/>pipeline/applications.yaml")]
        BAK[(".bak history<br/>5 most recent per file")]
        Y -.->|"on every write"| BAK
    end

    C <-->|"stdio · JSON-RPC"| server
    T -.->|"check_setup version check — skippable"| NPM
    T -->|"locked read + write"| Y
    R -->|read| Y
    Y -.->|"file change → notification"| R
    D -->|"re-read every request"| Y
    E -->|"it's just YAML"| Y
```

The dotted line to npm is the only outbound request the package makes: `check_setup`
asking whether a newer version exists. It carries nothing about you, and
`checkForUpdates: false` never constructs it.

---

## 2. What happens to one job posting

The path a single opportunity takes, and which tool drives each step. Read tools are
plain; **writes** are the ones your client will ask you to approve.

```mermaid
flowchart TB
    POST["A posting you pasted"] --> EXP["explore_opportunity<br/><i>fit score · gaps · comp check</i>"]
    EXP --> DEC{"Worth pursuing?"}
    DEC -->|no| INS1["<b>capture_insight</b><br/><i>why not — the pattern compounds</i>"]

    subgraph apply["Apply"]
        direction TB
        RES["research_company<br/><i>culture · funding · process</i>"]
        TAI["tailor_resume · generate_cover_letter<br/>format_for_ats"]
        RES --> TAI
    end

    DEC -->|yes| RES
    TAI --> ADD["<b>pipeline_add</b> — now it's tracked"]

    subgraph run["Run the process"]
        direction TB
        MAIL["classify_email<br/><i>replies → contacts, dates, suggested updates</i>"]
        UPD["<b>pipeline_update</b>"]
        PREP["prepare_interview<br/><i>pitch · STAR stories · questions</i>"]
        ARC["interview_arc<br/><i>what round N+1 will probe</i>"]
        MAIL --> UPD
        UPD --> PREP --> ARC
        ARC -->|"round N+1"| UPD
    end

    ADD --> MAIL
    UPD --> OUT{"Outcome"}
    OUT -->|offer| EVAL["evaluate_offer<br/><i>comp · market · counter scripts</i>"]
    OUT -->|rejection| REJ["<b>generate_rejection_response</b><br/><i>keeps the door open</i>"]

    EVAL --> INS2["<b>capture_insight</b>"]
    REJ --> INS2
    INS1 --> KB
    INS2 --> KB[("Career KB — a little richer<br/>than it was last time")]
    KB -.->|"read by every tool above"| EXP
```

The loop at the bottom is the point. Every outcome — including the rejections — can be
written back as a dated signal, and the next posting is scored against a KB that knows
about it.

---

## 3. An application's states

Ten statuses, six of them "active." `pipeline_view` counts the active ones; the response
and ghost rates are measured only against applications that were actually sent.

```mermaid
stateDiagram-v2
    direction LR
    [*] --> discovered: pipeline_add

    state "still live" as Active {
        discovered --> applied
        applied --> screening
        screening --> interviewing
        interviewing --> offer
        offer --> negotiating
    }

    Active --> accepted
    Active --> rejected
    Active --> withdrawn
    applied --> ghosted: silence, recorded
    screening --> ghosted
    interviewing --> ghosted

    accepted --> [*]
    rejected --> [*]
    withdrawn --> [*]
    ghosted --> [*]

    note right of Active
        pipeline_update drives every
        transition. An unknown status
        is refused with a did-you-mean.
    end note
```

`discovered` counts as live work — a role you have found and not yet applied to is on the
board — but it is excluded from response-rate denominators, because a job you never
applied to cannot answer you. `ghosted` is the *recorded* absence of a reply, which is why
it is a state rather than a gap in the data.

---

## 4. Your first conversation

What actually happens between pasting a résumé and having a Career KB.

```mermaid
sequenceDiagram
    autonumber
    actor You
    participant Claude
    participant S as MCP server
    participant FS as file-store<br/>(lock + write claim)
    participant Y as career/*.yaml

    You->>Claude: "Set up my Career KB" + résumé text
    Claude->>Claude: extract structure,<br/>ask about gaps and vague metrics
    loop once per section
        Claude->>S: save_career_section(profile | experience | …)
        S->>S: validate against the section schema
        alt shape is wrong
            S-->>Claude: field-level error — nothing written
        else shape is valid
            S->>FS: acquire lock + write claim
            FS->>Y: copy current → timestamped .bak
            FS->>Y: atomic write
            FS->>FS: prune to 5 backups, release claim
            FS-->>Claude: saved
        end
    end
    Claude-->>You: "KB populated — ask me anything"
    Note over You,Y: Your client asks you to approve each write.<br/>Approving them is what fills the KB.
```

A write is refused rather than half-applied: validation happens before the file is
touched, and the previous version survives as a `.bak` either way.

---

## 5. Three peers, one directory

The conversation, the dashboard, and your editor all read the same files, and none of them
owns the data. MCP resource subscriptions are what keep the conversation from talking to a
stale copy of your own job search.

```mermaid
sequenceDiagram
    autonumber
    participant Claude
    participant S as MCP server
    participant W as fs watcher<br/>(lazy — started by the first subscribe)
    participant Y as applications.yaml
    actor You

    Claude->>S: resources/subscribe career://pipeline
    S->>W: start watching (nothing was watched before this)

    Note over You,Y: you move a card by hand
    You->>Y: edit the YAML in vim
    Y-->>W: change event
    W->>W: debounce
    W-->>Claude: notifications/resources/updated<br/>career://pipeline + career://full
    Claude->>S: resources/read career://pipeline
    S-->>Claude: current contents

    Note over W: A client that never subscribes<br/>starts no watcher and pays nothing.
```

The notification is advisory: the server promises to tell you, not that your client will
act on it. Whether the model refreshes its context is the host's call.

---

## 6. Why a write cannot be half-done

Two Career Compass processes can point at one data directory — an MCP server and a
dashboard, or two clients. The claim file is what keeps the second one from interleaving.

```mermaid
flowchart TB
    START(["a tool wants to write"]) --> CLAIM{"create .write-claim<br/>exclusively (wx)"}
    CLAIM -->|"created"| OWN["we hold it"]
    CLAIM -->|"exists"| INSPECT{"inspect the holder"}

    INSPECT -->|"pid is alive<br/>and inside TTL"| WAIT["refuse, with a sentence<br/>saying who holds it"]
    INSPECT -->|"pid is dead"| BREAK["break by atomic rename<br/><i>so exactly one breaker wins</i>"]
    INSPECT -->|"past the hard cap"| BREAK
    BREAK --> OWN

    OWN --> READ["read current file"]
    READ --> MUT["apply the change<br/><i>read-modify-write, all inside the claim</i>"]
    MUT --> BAKUP["current → timestamped .bak"]
    BAKUP --> WRITE["atomic write"]
    WRITE --> PRUNE["prune to 5 backups<br/><i>hand-made backups untouched</i>"]
    PRUNE --> REL["release — nonce-guarded,<br/>so we can only release our own"]
    REL --> DONE(["done"])
    WAIT --> FAIL(["refused — your file is unchanged"])
```

The hard cap exists because a crashed writer's pid can be reused by an unrelated process,
which would otherwise wedge the directory permanently. The nonce on release exists so a
process that lost its claim cannot delete the claim that replaced it.

> **One known limit:** on a network or cloud-synced directory, pid liveness means nothing
> across machines and sync can resurrect a deleted claim. Career Compass does not defend
> against that — it is labelled rather than designed away. Keep your data directory local.

---

## Where the code is

| Concern | Files |
|---|---|
| Server assembly | `src/server.ts` |
| Tools | `src/tools/*.ts` — one file per group |
| Resources + subscriptions | `src/resources/career-kb.ts`, `src/resources/live.ts` |
| Prompts | `src/prompts/index.ts` |
| Storage, locking, backups | `src/storage/file-store.ts`, `src/storage/write-claim.ts` |
| Schemas | `src/schemas/career-schema.ts` |
| Shipped dashboard | `src/dashboard-lite/` |
| Loopback enforcement | `src/loopback-guard.ts` |
| CLI | `bin/cli.ts` |
