---
type: llm
weight: 2
---

PASS if every number, employer, title, project, credential and achievement the reply presents as true of Alex Rivera (the user) is supported by their saved Career KB below or by their own message.
FAIL if the reply states as fact a metric, employer, credential, project or achievement for Alex Rivera that the KB below does not support, or changes one of its numbers.

Not failures: advice; opinions; restating the KB's own summary (for example "9 years of experience"); simple arithmetic from the KB; questions to the user; placeholders clearly marked for the user to fill in; and anything said about the job, the employer or the job market, which this check ignores.

Alex Rivera's saved Career KB (YAML files):

    --- education.yaml
    - degree: B.S. Industrial Engineering
      institution: University of Texas at Austin
      date: "2015"
      honors: cum laude
      relevantCoursework:
        - Operations Research
        - Supply Chain Systems
        - Statistical Quality Control
        - Engineering Economics
      certifications:
        - Lean Six Sigma Green Belt (ASQ, 2019)
        - Certified Scrum Product Owner (Scrum Alliance, 2021)
    
    - degree: Certificate in Healthcare Operations Management
      institution: Texas McCombs Executive Education
      date: "2022-06"
      relevantCoursework:
        - Clinical Workflow Design
        - Healthcare Regulatory Compliance
      certifications: []
    
    --- experience.yaml
    - role: Senior Program Manager
      company: MedFlow Health Systems
      industry: Healthcare Technology
      location: Austin, TX (Remote)
      startDate: "2021-03"
      endDate: present
      summary: >
        Led enterprise-scale digital health initiatives across 14 hospital systems,
        managing $8M in annual program budgets and a team of 6 PMs.
      achievements:
        - metric: Reduced average patient onboarding time from 47 days to 11 days
          context: Inherited a manual, paper-heavy onboarding process after acquisition of 3 regional health systems
          impact: Enabled 3x faster revenue recognition and eliminated $2.1M in compliance penalties over 18 months
          keywords: [process improvement, healthcare, compliance, onboarding, automation]
        - metric: Launched real-time capacity dashboard adopted by 94% of clinical staff within 60 days
          context: COVID surge created critical visibility gaps across ICU bed availability
          impact: Reduced emergency diversion incidents by 34% across 6 facilities
          keywords: [stakeholder adoption, product launch, data visualization, cross-functional leadership]
        - metric: Rebuilt vendor evaluation framework, reducing tool procurement cycle from 9 months to 6 weeks
          context: Legacy RFP process was bottlenecking 7 technology initiatives simultaneously
          impact: Unlocked $4.3M in modernization budget and reduced vendor cost overruns by 22%
          keywords: [vendor management, procurement, operations, frameworks, cost reduction]
      tags: [healthcare, program management, executive stakeholders, cross-functional, remote]
    
    - role: Operations Manager
      company: Apex Logistics Partners
      industry: Logistics & Supply Chain
      location: Denver, CO
      startDate: "2018-06"
      endDate: "2021-02"
      summary: >
        Managed end-to-end operations for a regional 3PL serving 120+ retail clients,
        overseeing warehouse operations, carrier relationships, and a team of 42.
      achievements:
        - metric: Grew on-time delivery rate from 81% to 97.3% in 14 months
          context: Inherited an underperforming network with high carrier churn and manual routing
          impact: Retained 3 major retail accounts worth $6.8M annually that were at risk of churning
          keywords: [operations, logistics, KPI improvement, team leadership, process optimization]
        - metric: Reduced headcount costs 18% while increasing throughput 31%
          context: Executive leadership mandated cost reduction without service degradation
          impact: Avoided layoffs by restructuring shifts; saved $1.4M annually
          keywords: [cost reduction, workforce optimization, leadership, change management]
        - metric: Implemented first warehouse automation system — ROI achieved in 11 months vs. 18-month projection
          context: First-ever automation initiative for a $45M family-owned business
          impact: Set foundation for $12M Series A fundraise the following year
          keywords: [automation, ROI, project management, change management, stakeholder buy-in]
      tags: [logistics, operations, team leadership, automation, retail]
    
    - role: Customer Success Manager
      company: Brightline Software (acquired by Salesforce)
      industry: SaaS / CRM
      location: Chicago, IL
      startDate: "2016-01"
      endDate: "2018-05"
      summary: >
        Owned post-sale relationship for enterprise accounts in the $100K–$500K ARR range,
        driving adoption, expansion, and retention across a 22-account portfolio.
      achievements:
        - metric: Maintained 118% net revenue retention across portfolio for 8 consecutive quarters
          context: Joined during product pivot that created significant customer confusion
          impact: Recognized as top CS rep company-wide; accounts became pilot group for new product line
          keywords: [customer success, NRR, retention, enterprise, SaaS, ARR]
        - metric: Identified and closed $1.2M in expansion revenue through QBR process redesign
          context: Standard QBRs were perceived as low-value and skipped by 60% of customers
          impact: Redesigned to ROI-focused format; 100% executive attendance within 2 quarters
          keywords: [expansion revenue, QBR, executive relationships, SaaS, account management]
      tags: [saas, customer success, enterprise, revenue, retention]
    
    --- journal.yaml
    - id: a1b2c3d4
      date: 2026-05-12T15:30:00.000Z
      type: skill_evidence
      summary: Cited in a performance review for cross-functional stakeholder alignment across 4 departments.
      company: Northwind Logistics
      role: Senior Operations Manager
      signals:
        - stakeholder-management
        - data-storytelling
      sentiment: positive
      source: ingest_document
    - id: b2c3d4e5
      date: 2026-06-02T18:00:00.000Z
      type: win
      summary: Renegotiated a core vendor contract, cutting spend 18% without cutting scope.
      company: Northwind Logistics
      role: Senior Operations Manager
      signals:
        - negotiation
      sentiment: positive
      source: manual
    - id: c3d4e5f6
      date: 2026-06-08T16:30:00.000Z
      type: rejection_pattern
      summary: Reached the final round but lost to a candidate with direct healthcare-operations experience.
      company: Cascade Health Partners
      role: Director of Operations
      signals:
        - healthcare-domain
      sentiment: hard
      source: rejection
    - id: d4e5f6a7
      date: 2026-05-30T18:20:00.000Z
      type: fit_signal
      summary: Strong ops-scale and process match for the role; the thin spot is clinical/healthcare domain depth.
      company: Veridian Health
      role: Director of Operations
      signals:
        - ops-scale
        - healthcare-domain
      sentiment: neutral
      source: explore_opportunity
    - id: e5f6a7b8
      date: 2026-06-06T15:40:00.000Z
      type: interview_insight
      summary: Capacity-optimization story landed well; stumbled on a regulatory/compliance question.
      company: Veridian Health
      role: Director of Operations
      signals:
        - stakeholder-management
        - healthcare-domain
      sentiment: neutral
      source: prepare_interview
    
    --- profile.yaml
    name: Alex Rivera
    email: alex.rivera@email.com
    phone: "+1-555-0142"
    location: Austin, TX
    linkedIn: linkedin.com/in/alexrivera
    portfolio: alexrivera.dev
    summary: >
      Operations and program manager with 9 years of experience driving cross-functional
      initiatives across healthcare, logistics, and SaaS. Known for translating ambiguous
      problems into structured execution plans and building high-trust relationships with
      both technical and non-technical stakeholders.
    targetRoles:
      - Program Manager
      - Director of Operations
      - Head of Customer Success
      - Chief of Staff
    targetIndustries:
      - Healthcare Technology
      - SaaS
      - Logistics
      - Fintech
    targetCompanySize:
      - Series B
      - Series C
      - Mid-market (200-2000 employees)
    salaryMin: 140000
    salaryMax: 180000
    salaryCurrency: USD
    openToRemote: true
    openToRelocation: false
    noticePeriod: 3 weeks
    
    --- projects.yaml
    - name: Regional WMS Rollout
      role: Program Lead
      description: >
        Led the replacement of a paper-based inventory process with a warehouse
        management system across six distribution sites, coordinating clinical staff,
        IT, and three external vendors through a phased cutover with no service
        interruption.
      technologies:
        - Manhattan WMS
        - Snowflake
        - Tableau
      metrics:
        - 6 sites live in 14 weeks, 3 weeks ahead of plan
        - Inventory carrying cost down 18% year over year
        - Stockouts on critical supplies down from 34/quarter to 4/quarter
      outcomes:
        - Became the reference implementation for the remaining eight sites
        - Cutover runbook adopted as the standard template for site launches
    
    - name: Vendor Consolidation Initiative
      role: Operations Lead
      description: >
        Consolidated 41 medical-supply vendors to 12 preferred partners, renegotiating
        contracts and building the scorecard used to review them quarterly.
      technologies:
        - Coupa
        - Excel
      metrics:
        - $2.4M annualized savings
        - Average PO cycle time down from 9 days to 3
      outcomes:
        - Quarterly vendor scorecard still in use three years later
        - Two underperforming vendors exited without service disruption
    
    - name: Onboarding Redesign
      role: Chief of Staff (interim)
      description: >
        Rebuilt operations onboarding after exit interviews traced early attrition to
        an unstructured first month.
      technologies:
        - Notion
        - Lattice
      metrics:
        - 90-day new-hire attrition down from 22% to 7%
        - Time to first independent shift down from 6 weeks to 3
      outcomes:
        - Rolled out to two adjacent departments the following year
    
    --- skills.yaml
    - name: Program Management
      category: Leadership
      proficiency: 5
      yearsUsed: 9
      lastUsed: current
    
    - name: Cross-functional Team Leadership
      category: Leadership
      proficiency: 5
      yearsUsed: 7
      lastUsed: current
    
    - name: Executive Stakeholder Management
      category: Leadership
      proficiency: 5
      yearsUsed: 6
      lastUsed: current
    
    - name: Process Improvement / Lean
      category: Operations
      proficiency: 4
      yearsUsed: 8
      lastUsed: current
    
    - name: Vendor Management & Procurement
      category: Operations
      proficiency: 4
      yearsUsed: 6
      lastUsed: current
    
    - name: Customer Success
      category: Domain
      proficiency: 4
      yearsUsed: 5
      lastUsed: "2021"
    
    - name: Healthcare Operations (HIPAA, EHR)
      category: Domain
      proficiency: 4
      yearsUsed: 4
      lastUsed: current
    
    - name: Supply Chain / 3PL Operations
      category: Domain
      proficiency: 4
      yearsUsed: 3
      lastUsed: "2021"
    
    - name: Data Analysis (SQL, Excel, Tableau)
      category: Technical
      proficiency: 3
      yearsUsed: 5
      lastUsed: current
    
    - name: Salesforce CRM
      category: Technical
      proficiency: 3
      yearsUsed: 4
      lastUsed: current
    
    - name: JIRA / Confluence
      category: Technical
      proficiency: 4
      yearsUsed: 6
      lastUsed: current
    
    - name: Budget Management ($1M–$10M)
      category: Operations
      proficiency: 4
      yearsUsed: 5
      lastUsed: current
    
    --- testimonials.yaml
    - source: Dr. Priya Nair, SVP Clinical Operations, MedFlow Health Systems
      relationship: Direct Executive Sponsor
      quote: >
        Alex has a rare ability to walk into a room of skeptical physicians and leave with
        their trust and a signed change order. The onboarding initiative alone paid for
        itself five times over in year one.
      date: "2023-08"
      context: End-of-year performance review, shared with permission
    
    - source: Marcus Chen, VP of Sales, Apex Logistics Partners
      relationship: Cross-functional peer
      quote: >
        I've worked with a lot of ops managers. Alex is the only one who ever came to me
        with a proposal that actually reduced cost AND improved customer outcomes simultaneously.
        The automation project was a career highlight for both of us.
      date: "2020-11"
      context: LinkedIn recommendation, public
    
    - source: Jamie Park, CEO, Brightline Software
      relationship: Skip-level manager
      quote: >
        When we were acquired, Alex was the reason our largest accounts stayed calm. She
        knew each stakeholder personally and had the credibility to make a difficult
        transition feel seamless.
      date: "2018-04"
      context: Reference letter, provided for applications
