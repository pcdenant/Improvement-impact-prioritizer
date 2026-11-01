# Improvement Impact Prioritizer

Which improvement action will move your P85 lead time the most?

Part of the Collaboration Solved flow toolkit. It sits at the start of the chain:
**choose** (this tool) → understand ([littles-law-sim](https://github.com/pcdenant/littles-law-sim)) →
cost an impediment ([impediment-value-calculator](https://github.com/pcdenant/impediment-value-calculator)) →
prove the result ([Continuous-Improvement-Calculator](https://github.com/pcdenant/Continuous-Improvement-Calculator)).

Two versions are in this repo, to test side by side:

- `index.html` — **distribution-based prioritizer**: median and P85 per stage, Monte Carlo simulation.
- `vsm.html` — **future-state VSM calculator**: process time and inventory per step, the classic Lean future-state map, with the P85 projected on top.

## Use (`index.html`)

Open `index.html` in a browser. No build, no server. Data stays in the browser (localStorage), with JSON export/import.

1. **The problem.** Enter the real median and P85 lead time, the target P85, and the median and P85 time of each value stream stage, plus its average WIP (optional). Each stage is tagged *Measured (Jira)* or *Team estimate*. Stages can be reordered (↑ ↓) and pasted from Excel or Confluence. The real values are shown next to the values computed from the stages, with a warning when they differ by more than 25 %.
2. **The actions.** For each stage an action touches (upstream or downstream), enter a pessimistic / probable / optimistic % time reduction and the % of items affected. For a WIP limit, pick *WIP held* and enter the WIP the team will really hold (in items): the tool converts it to a time reduction with Little's law, at constant throughput. An action with no stage or no probable % is flagged *impact not demonstrable*.
3. **The impact.** Actions are ranked by days removed from P85 (probable value). Each one shows the % of the gap to the target it closes, with its range. The top 3 are badged. Tick actions to see their combined effect.

## Model

- Each stage is a log-normal distribution fitted on its median and P85.
- 10,000 items are simulated (seeded, so results are stable between edits). Each action is replayed on the same items: an item touched by an action (draw < % items) has its stage time multiplied by `1 − reduction`.
- Combined actions multiply on the same stage, so their combined gain is not the sum of individual gains.
- The model assumes stages are independent, which underestimates the tail. To correct for this, the gain is computed as a % of the simulated P85 and applied to the real P85.
- "Where does the time go" compares a typical item (P40–P60 of the simulated total) with a tail item (≥ P85).

## Future-state VSM calculator (`vsm.html`)

1. **Current state.** Throughput (items/week), real median and P85, target P85. Per step: process time (days of real work) and inventory (items). Wait = inventory ÷ throughput (Little's law); a wait can be entered directly when there is no inventory count. Shows VSM lead time, flow efficiency and a work/wait timeline per step.
2. **Kaizen bursts.** Each burst changes boxes on the map (a step's process time, inventory or wait, or the stream throughput) to a future value: pessimistic / probable / optimistic. The tool shows the % change and its effect.
3. **Future state.** Bursts are ranked by P85 gain (probable). Ticked bursts build the future-state map: VSM lead time, flow efficiency and P85, before and after.

Model: lead time = Σ process time + Σ wait. Two bursts on the same box multiply. The P85 and median are scaled by the lead-time ratio (future ÷ current), which assumes the tail shrinks in proportion: optimistic when the tail is driven by blocked items.

## Tests

```
node --test tests/calc.test.js tests/vsm.test.js
```

Out of scope for v1: cost of delay, effort, CSV/Jira import, link with the Continuous-Improvement-Calculator, French UI, WIP effects in the paste format.

Known debt: data entry is barely usable on mobile (the keyboard hides the fields). Use a laptop.
