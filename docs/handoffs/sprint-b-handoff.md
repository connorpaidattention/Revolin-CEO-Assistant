# Sprint B Handoff — Agent Expansion (Task 3.17)

## Audit Findings

- Only 2 of 5 planned department agents existed (Greg — Analytics, Sarah — Ops).
- No per-agent model switching — all queries used Sonnet regardless of complexity.
- Context routing only handled analytics and operations keywords, with binary disambiguation.

## Changes Made

### New Agent Prompts — `src/lib/ai/provider.ts`

Added three new sub-agent prompts following the existing `<sub_agent>` XML format:

- **Marcus (Strategy Director):** Frameworks-first thinker. Capabilities: strategic planning, competitive analysis, pricing, market entry, scenario planning, fundraising. Uses Opus model for deeper reasoning.
- **Sam (Tech Lead):** Pragmatic, ship-focused. Capabilities: architecture, e-commerce, infrastructure, dev roadmapping, build-vs-buy. Uses Sonnet.
- **Alex (Relations Manager):** Warm, perceptive, relationship-as-investment. Capabilities: partnerships, communications, community, PR, stakeholder management, hiring. Uses Sonnet.

### Model Architecture — `src/lib/ai/provider.ts`

- Added `STRATEGY_MODEL_ID = "claude-opus-4-5-20251101"` constant
- Added `getStrategyModel()` function
- Updated `SYSTEM_PROMPT` personality_extensions to list all 5 agents with their commands

### Context Routing — `src/lib/context/builder.ts`

- Extended `ContextMode` type: added `"strategy" | "tech" | "relations"`
- Added explicit slash commands: `/marcus`, `/strategy`, `/sam`, `/tech`, `/alex`, `/relations`
- Added keyword arrays for each new department:
  - Strategy: strategy, competitive, positioning, market entry, business model, pricing strategy, vision, roadmap, long-term, scenario, fundraise, moat
  - Tech: technical, architecture, platform, website, ecommerce, database, api, infrastructure, developer, code, deploy, migration
  - Relations: partnership, sponsor, relationship, communications, community, pr, media, outreach, stakeholder, investor, event, hiring
- Replaced binary disambiguation with multi-department: routes only when exactly one department matches keywords. Ambiguous queries default to Chief of Staff.
- Added `buildContext` cases for strategy, tech, and relations modes.

### Per-Agent Model Switching — `src/app/api/chat/route.ts`

- Strategy mode (`/marcus` or unambiguous strategy keywords) uses Opus. All other modes use Sonnet.
- Model resolved before `streamText` call.

## Decisions

- **Opus only for strategy:** Marcus deals with high-stakes strategic thinking that benefits from Opus-level reasoning. Other agents handle more routine department tasks well-served by Sonnet.
- **Single-match only for keywords:** If a message matches keywords from multiple departments, it defaults to the Chief of Staff (default mode). This prevents misrouting on ambiguous queries like "ship the pricing strategy" (ops + strategy).
- **Slash commands are always explicit:** `/marcus` always routes to strategy regardless of keyword analysis.

## Cost Impact

- Opus is ~5x the cost of Sonnet. It only activates for `/marcus`, `/strategy`, or messages that unambiguously match strategy keywords only. Ambiguous queries stay on Sonnet.

## Test Results

- `npm run typecheck` — passes clean

## Manual Testing Checklist

- [ ] `/marcus` → strategic, frameworks-oriented response (Opus model)
- [ ] `/sam` → technical, pragmatic response
- [ ] `/alex` → relationship-focused, warm response
- [ ] `/greg` and `/sarah` still work as before
- [ ] "pricing strategy" → routes to Marcus (strategy only)
- [ ] "ship the pricing strategy" → defaults to Chief of Staff (ops + strategy = ambiguous)
- [ ] "What's our website architecture?" → routes to Sam (tech only)
