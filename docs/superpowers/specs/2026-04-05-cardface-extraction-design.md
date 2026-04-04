# CardFace Component Extraction

**Linear issue:** ENG-41
**Date:** 2026-04-05

## Problem

The 3x3 card stat cross layout (T/R/B/L with `=== 10 ? 'A'` formatting) is duplicated across three components:

- `SwapStep.svelte` — two copies (player cards, opponent cards), no type badge or modifier
- `HandPanel.svelte` — with type badge and modifier overlay
- `BoardCell.svelte` — with type badge and modifier overlay

Additionally, unknown cards render inconsistently:
- SwapStep: dashed border + centered `?`
- HandPanel: normal border + centered `?`

## Design

### New component: `src/app/components/CardFace.svelte`

A pure display component that renders a card's stats in the 3x3 cross layout, or a `?` placeholder when unknown. No border, no button, no interactivity — just the interior content.

#### Props

| Prop | Type | Default | Purpose |
|------|------|---------|---------|
| `card` | `Card` | required | The card to display |
| `unknown` | `boolean` | `false` | Show `?` instead of stats |
| `modifier` | `number \| null` | `null` | Ascension/descension modifier overlay |
| `showType` | `boolean` | `true` | Whether to show type abbreviation badge |

#### Unknown card convention

`CardFace` does not render borders — the caller's `<button>` wrapper owns all border styling. When showing an unknown card, callers add `border-dashed` to their wrapper. This applies to two call sites: SwapStep and HandPanel.

### Consumer changes

**HandPanel:** Replace inline 3x3 grid with `<CardFace>`. The unknown branch uses `<CardFace {card} unknown />`, and the wrapper button gets `border-dashed` when unknown.

**SwapStep:** Replace both duplicated 3x3 grids with `<CardFace {card} showType={false} />`. Unknown opponent card buttons get `border-dashed` and use `<CardFace>` with `unknown`.

**BoardCell:** Replace inline 3x3 grid with `<CardFace card={cell.card} {modifier} />`.

### File location

Top-level shared: `src/app/components/CardFace.svelte`. If more shared components emerge later, we'll organize into a subdirectory then.

## Out of scope

- Unifying the reveal-unknown-card interaction pattern (tracked as ENG-42)
- Unifying the button wrapper / tile styling across consumers
