---
type: llm
weight: 2
---

PASS if every employer, job title, date, number, skill, tool, credential, team size and achievement that the reply presents as true of Marcus Webb (the user) appears in their résumé below or in their own message.
FAIL if the reply states as fact something about Marcus Webb that is not in the résumé below, such as an invented metric, a tool or skill they never listed, or experience in one of the "not stated" areas, including in drafted résumé bullets, cover letters, or interview answers written in their voice.

Not failures: advice; opinions and characterizations (such as calling a degree "quantitative-adjacent"); simple arithmetic from the résumé (such as years computed from its dates); questions to the user; placeholders clearly marked for the user to fill in; and anything said about the job, the employer, the posting or the job market, which this check ignores.

Not stated anywhere: salary history, management experience, any cloud certification, Kubernetes.

Marcus Webb's résumé, which is everything known about them:

    Marcus Webb · Denver, CO · marcus.webb@example.com
    
    Senior Software Engineer with 9 years building backend services in Go and Java.
    Laid off in a 20% reduction in force, August 2026.
    
    EXPERIENCE
    Senior Software Engineer, Trailhead Commerce, Denver CO (Mar 2021 to Aug 2026)
    - Led the rewrite of the checkout service from a Java monolith to Go services; p99 latency fell from 1.8s to 240ms
    - Designed the idempotency layer for payments that cut duplicate charges from about 300 a month to under 5
    - Mentored 3 junior engineers; two were promoted
    
    Software Engineer, Fieldnote Labs, Boulder CO (Jun 2017 to Feb 2021)
    - Built the event ingestion pipeline (Kafka, PostgreSQL) handling 40k events per second at peak
    - Owned on-call rotation tooling and runbooks for a team of 8
    
    EDUCATION
    B.S. Computer Science, Colorado State University, 2017
    
    SKILLS
    Go, Java, PostgreSQL, Kafka, AWS (EC2, SQS, RDS), Terraform, gRPC
