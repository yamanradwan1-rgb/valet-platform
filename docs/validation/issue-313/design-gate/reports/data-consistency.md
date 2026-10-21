# Issue #313 — Synthetic rating data contract

**Source:** `assets/feedback-fixture.js`. Every design option reads the same
in-browser fixture and uses `window.VAYLET313.selectData`. All figures are
synthetic. No API calls or customer information are used.

| September 2026 completed-visit cohort | Main Garage | North Garage | All authorized Locations |
| --- | ---: | ---: | ---: |
| Eligible completed visits | 70 | 50 | **120** |
| Visits with an authoritative 1–5 rating | 48 | 30 | **78** |
| 5 stars | 18 | 12 | **30** |
| 4 stars | 15 | 9 | **24** |
| 3 stars | 9 | 5 | **14** |
| 2 stars | 4 | 3 | **7** |
| 1 star | 2 | 1 | **3** |
| Rating points | 187 | 118 | **305** |
| Average (rated visits only) | 187/48 ≈ 3.90 | 118/30 ≈ 3.93 | **305/78 ≈ 3.91** |
| Participation (rated / eligible) | 48/70 ≈ 68.57% | 30/50 = 60% | **78/120 = 65%** |

Company average is the **weighted average from all rating points**, never
the arithmetic mean of the two Location averages. Five histogram bin counts
sum exactly to the rated sample count. The count of eligible visits is
different from the count of submitted ratings.

The fixture includes 14 eligible October 2026 completed visits, with six
ratings. August deliberately contains no eligible visits, and the local state
simulator can hide ratings while retaining eligible visits. These are useful
for showing null averages, unknown participation and empty history accurately.

Each `DEMO-VISIT-###` row represents one completed visit, with a local
completion date, optional integer rating and optional rating submission date.
The fixture's period selection uses the **Location-local completion date**.
Submission date is used only to order recent rating events. Therefore a
rating submitted in October for a September-completed visit remains in the
September rating cohort.

Company Admin can select only the two authorized synthetic Locations.
Location Manager is constrained to Main Garage and cannot request a company
aggregate or North Garage through the demo controls. Simulated denial,
loading and error states display no rating rows or private details.

Production authorization, real timezone conversion, actual completion data
and rating DTOs have deliberately not been implemented by Issue #313. The
independent QA scripts additionally test boundary and arithmetic examples.
