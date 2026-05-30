# Design Review: Demo RH Simplificada

Reviewed against: user brief in chat; no dedicated `.design/demo-rh/DESIGN_BRIEF.md` existed.
Philosophy: functional/Scandinavian within existing product tokens.
Date: 2026-05-29

## Screenshots Captured

| Screenshot | Breakpoint | Description |
| --- | --- | --- |
| `screenshots/review-demo-rh-picker-desktop-1280.png` | Desktop (1280x800) | Initial 3-vaga picker. |
| `screenshots/review-demo-rh-picker-tablet-768.png` | Tablet (768x1024) | Initial picker stacked/responsive state. |
| `screenshots/review-demo-rh-picker-mobile-375.png` | Mobile (375x812) | Initial picker on phone width. |
| `screenshots/review-demo-rh-ranking-desktop-1280.png` | Desktop (1280x800) | Full flow after Frentista selection, generated vacancy, candidates, analysis and ranking. |
| `screenshots/review-demo-rh-ranking-tablet-768.png` | Tablet (768x1024) | Full flow on tablet width. |
| `screenshots/review-demo-rh-ranking-mobile-375.png` | Mobile (375x812) | Full flow on phone width. |

All screenshots are in `.design/demo-rh/screenshots/`.

## Summary

The simplified Demo RH is visually much clearer than the D2/D3 concept: the first decision is obvious, the 5-step flow is legible, and the ranking reads like a practical sales demo instead of an internal operations tool. I made two small visual fixes during review: candidate-job card CTAs now stay inside cards on mobile, and demo toasts reuse a single toast key so the flow does not stack notifications over the interface.

## Must Fix

None found after the small visual corrections.

## Should Fix

1. **Mobile ranking is long and dense**: The full ranking state is usable at 375px, but each candidate card becomes a tall block with five actions. See `screenshots/review-demo-rh-ranking-mobile-375.png`. _Fix later, if needed: collapse secondary actions behind a compact “Mais ações” menu only on mobile._

## Could Improve

1. **Generated vacancy block could become scannable chips**: The structured IA result is readable, but still text-heavy. See `screenshots/review-demo-rh-ranking-desktop-1280.png`. _Suggestion: keep the current content, but consider chip styling for requirements and triage questions if this page becomes a frequent sales surface._
2. **One toast can still overlap content briefly on full-page mobile captures**: The previous toast stack was fixed; one success toast remains acceptable as feedback. _Suggestion: no change now unless demos are usually screen-recorded at mobile width._

## What Works Well

- The initial 3-card picker is clear on desktop and mobile. The job titles, descriptions, candidate counts and primary CTA are easy to scan.
- The 5-step stepper communicates progress well without reintroducing remessa/backlog/ERP terminology.
- The “Carregar mais candidatos exemplo” action is visually secondary and does not dominate the main flow.
- The ranking is ordered and understandable: name, adherence, recommendation, strengths, concerns and recommended action all appear in one card.
- The UI remains frontend-only in presentation language and does not suggest backend persistence.

## Changes Made During Review

- `frontend/src/pages/DemoRhPage.tsx`: changed the job picker cards to `flex flex-col` and card content to `flex-1` so mobile CTAs no longer overflow into the next card.
- `frontend/src/pages/DemoRhPage.tsx`: added a `demoToast` helper using `{ key: "demo-rh" }` so rapid demo actions update one toast instead of stacking multiple notifications.

## Validation

- `npm --prefix frontend test -- --run src/pages/__tests__/DemoRhPage.test.tsx` passed.
- `npm --prefix frontend run build` passed.
