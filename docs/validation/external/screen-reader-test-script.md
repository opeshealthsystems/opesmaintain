# Manual accessibility test script (plan item I2)

Run with **NVDA + Firefox** and **JAWS + Chrome** (Windows), **VoiceOver + Safari** (macOS and iOS)
and **TalkBack + Chrome** (Android). Also run once with keyboard only and at 200% browser zoom.
Record pass/fail and notes per step in a copy of this file under `docs/validation/`.

| # | Task | Expected |
|---|---|---|
| 1 | Sign in with e-mail and password; enter the 6-digit code when asked | Fields and errors are announced; focus moves to the code field |
| 2 | Use "Skip to content", then open the sidebar menu at phone width | Skip link works; menu opens and closes with Escape; current page is announced |
| 3 | Report a fault (Maintenance requests → New): leave Title empty and submit | The error summary and the field error are announced; focus can reach the field |
| 4 | Find the new request by global search and open it | Results are reachable with arrow or Tab keys and announced with their type |
| 5 | Convert the request to a work order using the action dialog | The dialog title is announced, focus is trapped, and Escape closes it |
| 6 | On the work order, switch tabs to "Execution & cost" | The tab role and selected state are announced |
| 7 | Reserve a part using the part search combobox | The combobox's expanded state and options are announced |
| 8 | Work board: move through lanes and open a card | Lane names and counts are announced; cards are links |
| 9 | Analytics: understand PM compliance | Ring charts expose their value as text ("PM compliance: 80%") |
| 10 | Technician app (`/technician`): open a job, mark a task done, read the sync status | The online/offline state and queue count are announced |
| 11 | Customer portal: sign off completed work | Rating and acceptance controls are labelled |
| 12 | Switch language to French and repeat step 3 | Labels and errors are in French; `lang="fr"` is set |
| 13 | Dark mode (OS setting): repeat steps 6–8 | Contrast stays readable; focus outlines are visible |

Automated baseline: axe-core WCAG 2.0/2.1/2.2 A and AA, 18 workflows in light and dark mode,
0 violations at the release commit.
