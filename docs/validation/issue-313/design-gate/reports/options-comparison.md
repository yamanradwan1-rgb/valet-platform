# Issue #313 — Four option comparison

These alternatives add **one** Customer Feedback panel inside the existing
Analytics view, immediately between the four operational KPIs and two charts.
All existing content is rendered through the same frozen local HTML and the
same unchanged synthetic operational fixture.

| Criterion | 1 Summary First | 2 Insights First | 3 History First | 4 Balanced Executive |
| --- | --- | --- | --- | --- |
| Original VAYLET shell | Shared frozen reference | Shared frozen reference | Shared frozen reference | Shared frozen reference |
| Executive readability | Fastest headline scan | Analytic, second | History-focused | Strong balanced scan |
| Statistical transparency | Supported by bars and denominators | Primary visual priority | Supporting module | First-class alongside score |
| Rating history | Compact secondary list | Compact secondary evidence | Primary record-oriented view | Clear dedicated area |
| Expected mobile behavior | Score first, stacked | Vertical breakdown | Dense record cards | Balanced linear stack |
| Expected information density | Low–medium | Medium–high | High | Medium |
| Implementation complexity | Lower | Medium | Medium | Medium |
| RTL and UI freeze | Independent browser QA required | Independent browser QA required | Independent browser QA required | Independent browser QA required |

## Design rationale

**Option 1** foregrounds average score and participation. It is suited to a
manager who needs the headline first. Its limitation is that distribution
and visit evidence are less prominent.

**Option 2** foregrounds five-through-one-star counts, coverage and
denominator, making it easier to inspect the quality of the sample.
The headline rating becomes supporting information.

**Option 3** foregrounds authorized visit-by-visit evidence. It is suitable
for operational review of recently submitted ratings, but it consumes
more vertical space and demands careful responsive treatment.

**Option 4** presents the average, rated/eligible participation, complete
distribution and recent visits in coordinated parts. It aims for the best
tradeoff between scan speed and supporting evidence.

## Prime's provisional preference

**Option 4 — Balanced Executive**, provided it passes the exact frozen UI
comparison, 320px/390px mobile reflow, Arabic/dark mode and keyboard QA.
The Owner can select any option or request HTML-only revisions. Preference
does not constitute permission to implement any production change.
