# Epoch — Game Design Document

**A Real-Time Strategy Game of Cycles, Not Clicks**

> *Plan the Next Epoch.*

---

## Table of Contents

1. [Game Overview](#1-game-overview)
2. [Core Design Philosophy](#2-core-design-philosophy)
3. [Core Gameplay Loop](#3-core-gameplay-loop--the-epoch-cycle)
4. [Temporal Mechanics](#4-temporal-mechanics-core-pillar)
5. [Command System](#5-command-system)
6. [Units & Structures](#6-units--structures)
7. [Resource System](#7-resource-system)
8. [Map & Fog of War](#8-map--fog-of-war)
9. [AI Opponent](#9-ai-opponent)
10. [UI/UX Design](#10-uiux-design)
11. [Visual Design](#11-visual-design)
12. [Audio Design](#12-audio-design)
13. [Technical Architecture](#13-technical-architecture)
14. [Vercel Deployment](#14-vercel-deployment)
15. [MVP Scope](#15-mvp-scope-v10)
16. [Future Roadmap](#16-future-roadmap)

---

## 1. Game Overview

| Field | Detail |
|-------|--------|
| **Title** | Epoch |
| **Tagline** | *Plan the Next Epoch.* |
| **Genre** | Phase-Based Real-Time Strategy |
| **Platform** | Browser (mobile-first + desktop) |
| **Deployment** | Vercel (auto-deploy from GitHub) |
| **Players** | 1 Human vs 1 AI Opponent |
| **Session Length** | 5–15 minutes |
| **Art Style** | Minimalist, sci-fi, vector-based graphics |

### High Concept

Epoch is a modern, mobile-friendly real-time strategy game where victory is determined not by speed, but by foresight.

Instead of micromanaging units in real time, players issue a limited set of commands during a **Planning Phase**. Every 30 seconds, the game executes all queued commands simultaneously in an **Execution Phase**. Strategy unfolds in decisive, discrete "epochs" of action.

Time itself is a resource. Players who master temporal mechanics — rewinding units, echoing enemy plans, forking timelines — gain a strategic edge that transcends conventional warfare. Every epoch is a battle across both space and time.

### Target Audience

- Strategy game fans who prefer planning over twitch mechanics
- Mobile gamers looking for deep-but-accessible strategy
- Players who enjoy the "one more game" loop of short competitive sessions
- Fans of simultaneous-resolution games (Frozen Synapse, Diplomacy, Into the Breach)

---

## 2. Core Design Philosophy

### Less APM. More Anticipation.

Epoch removes twitch mechanics and replaces them with:

- **Structured decision windows** — You have 30 seconds to think. No more, no less.
- **Bounded command slots** — You cannot do everything. Every epoch forces meaningful prioritization.
- **Predictive strategy** — Victory comes from reading the opponent, not out-clicking them.
- **Systemic outcomes** — Actions interact with each other and with the opponent's actions in emergent ways.

### Design Pillars

1. **Foresight Over Reflex** — The best move is the one you planned two epochs ago.
2. **Temporal Mastery** — Time is not just a theme — it is a playable resource and tactical dimension.
3. **Constrained Agency** — Limited command slots create meaningful dilemmas every cycle.
4. **Readable Complexity** — The game should be deep but never opaque. Every outcome must be traceable to player decisions.
5. **Mobile-Native Strategy** — Touch-first design that doesn't compromise strategic depth.

### What Epoch Is NOT

| Epoch is NOT | Epoch IS |
|-------------|----------|
| A traditional RTS clone | Real-time at macro scale |
| Turn-based strategy | Turnless but phase-driven |
| A click-heavy micro game | Strategic batching as core mechanic |
| A twitch-skill test | Designed for foresight, not reflex |

---

## 3. Core Gameplay Loop — The Epoch Cycle

Each match runs in repeating **epochs**. An epoch consists of two phases:

```
┌─────────────────────────────────────────────────────────┐
│                     ONE EPOCH                           │
│                                                         │
│  ┌──────────────────┐    ┌──────────────────────────┐   │
│  │  PLANNING PHASE  │───▶│    EXECUTION PHASE       │   │
│  │   (30 seconds)   │    │  (simultaneous resolve)  │   │
│  │                  │    │                          │   │
│  │  Fill 5 command  │    │  All commands execute    │   │
│  │  slots with      │    │  simultaneously for      │   │
│  │  orders          │    │  both players             │   │
│  │                  │    │                          │   │
│  │  Lock in early   │    │  Outcomes displayed      │   │
│  │  for TE bonus    │    │  with animation          │   │
│  └──────────────────┘    └──────────────────────────┘   │
│                                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │              EPOCH TRANSITION                     │   │
│  │  Summary overlay → Score update → Next epoch      │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

### 3.1 Planning Phase (30 seconds)

During the Planning Phase, the player:

1. **Surveys the battlefield** — Pan and zoom the hex map, check fog of war edges, review unit/structure status.
2. **Fills command slots** — The player has **5 command slots** (upgradable to 8 via the tech tree). Each slot holds one action.
3. **Considers temporal abilities** — Temporal abilities also consume a command slot, creating tension between time powers and conventional orders.
4. **Locks in commands** — Commands are locked when the timer expires, or the player can **lock in early** to gain a **+1 Temporal Energy bonus**.

Available commands per slot:

| Command | Description |
|---------|-------------|
| **Gather** | Assign a Drone to harvest from a resource node |
| **Build** | Construct a structure on a hex (1–2 epochs to complete) |
| **Train** | Produce a unit at a Barracks or War Foundry |
| **Move** | Move a unit or group to a target hex |
| **Attack** | Engage an enemy unit or structure |
| **Defend** | Fortify a unit in place (+50% damage resistance this epoch) |
| **Upgrade** | Research a tech at the Tech Lab |
| **Temporal** | Activate a temporal ability (Echo, Shift, Fork, Anchor, Scout) |

### 3.2 Execution Phase (5–10 seconds, animated)

All commands from both players resolve **simultaneously** using a deterministic priority system:

```
Resolution Order:
1. Defend    — Units dig in before anything else happens
2. Temporal  — Time abilities resolve (echoes reveal, shifts rewind, etc.)
3. Move      — All units move toward their targets
4. Attack    — Combat resolves (units in same hex engage)
5. Build     — Construction progresses or completes
6. Upgrade   — Research progresses or completes
7. Gather    — Resources are harvested
8. Train     — New units are produced
```

The execution is animated so the player can **see the consequences of their decisions**. Movement trails, combat effects, and resource flows are all rendered clearly.

### 3.3 Epoch Transition

After execution completes:

- **Summary overlay** shows key events (units lost, structures built, resources gained, temporal abilities used)
- **Epoch counter** increments
- **New planning phase** begins

### 3.4 Win Conditions

A match ends when any of these conditions are met:

| Condition | Description |
|-----------|-------------|
| **Annihilation** | Destroy the enemy's Command Nexus |
| **Temporal Singularity** | Complete the entire tech tree (all 4 tiers researched) |
| **Resource Dominance** | Control all Crystal Node hexes on the map for 5 consecutive epochs |

### 3.5 Strategic Tension

The core tension of Epoch comes from:

- **Limited action economy** — 5 slots, too many things to do
- **Simultaneous resolution** — You can't react to what you see; you must predict
- **Imperfect information** — Fog of war hides enemy intentions
- **Competing priorities** — Gather now or train units? Expand or defend? Attack or bait?
- **Temporal trade-offs** — Spending a slot on a time ability means one fewer conventional action

Examples of dilemmas:
- *"I could Echo to see what they did last epoch... but that costs me an attack command."*
- *"If I Chrono Shift my Sentry back to safety, I lose the slot I need to train a replacement."*
- *"Do I lock in early for the TE bonus, or wait to see if my scout reveals anything?"*

---

## 4. Temporal Mechanics (Core Pillar)

Time is not just a theme in Epoch — it is a **playable strategic dimension**. Temporal abilities let players bend the rules of simultaneous resolution, peek through the fog of causality, and rewrite tactical mistakes.

All temporal abilities:
- Cost **Temporal Energy (TE)**
- Consume **one command slot** (competing with conventional orders)
- Have **visual and audio tells** during execution (opponents can see that a temporal ability was used, even if they don't know which one)

### 4.1 Temporal Energy (TE)

| Property | Value |
|----------|-------|
| Starting TE | 3 |
| Passive regen | +1 TE per epoch |
| Maximum cap | 10 (15 with Chrono Spire) |
| Early lock-in bonus | +1 TE if commands are locked before the timer expires |

Temporal Energy is the only resource that cannot be directly harvested. It regenerates passively and rewards decisive planning (early lock-in). This creates a secondary tension: *wait for more information or commit early for more temporal power?*

### 4.2 Temporal Abilities

#### Temporal Echo — *"See what was"*

| Property | Value |
|----------|-------|
| TE Cost | 2 |
| Command Slot | 1 |
| Unlocked | Available from start |

Reveals the opponent's **commands from the previous epoch** as ghost overlays on the map during the current planning phase. Shows command types and target hexes, but not the specific units assigned.

**Strategic use:** Counter-intelligence. If the enemy attacked your east flank last epoch, they might attack again — or they might anticipate your defense and pivot. Echo gives you data to decode their patterns.

#### Chrono Shift — *"Undo what was done"*

| Property | Value |
|----------|-------|
| TE Cost | 3 |
| Command Slot | 1 |
| Unlocked | Tech Tier 1 |

Rewinds **one selected unit** to its position and HP from **2 epochs ago**. The unit gains a brief **damage shield** (absorbs first hit) after shifting.

**Strategic use:** Tactical retreat. Save an overextended unit. Bait the enemy into attacking a position, then shift your unit back to safety. The damage shield prevents immediate punishment.

**Constraint:** Cannot shift a unit that didn't exist 2 epochs ago (newly trained units).

#### Timeline Fork — *"See what could be"*

| Property | Value |
|----------|-------|
| TE Cost | 4 |
| Command Slot | 1 |
| Unlocked | Tech Tier 2 |

Simulates the **next execution phase** with your current commands against a predicted AI response. The simulation plays out as a ghost overlay. After viewing, you may **revise your commands once** before the real lock-in.

**Strategic use:** High-cost scouting of outcomes. Test whether your attack will succeed before committing. But the AI prediction is based on the AI's archetype tendencies — it's an estimate, not certainty (~80% accuracy against lower difficulties, ~60% against Epoch Master).

**Constraint:** One use per match at MVP. Future versions may allow multiple uses at escalating TE costs.

#### Epoch Anchor — *"Remember what was"*

| Property | Value |
|----------|-------|
| TE Cost | 5 to set, 3 to activate |
| Command Slot | 1 (each: setting and activating) |
| Unlocked | Tech Tier 3 |

**Setting:** Bookmark the current positions and HP of all your units. The anchor persists for **5 epochs**.

**Activating:** Revert all your units to their anchored positions and HP. Structures and resources are NOT reverted — only unit state.

**Strategic use:** Insurance policy. Set an anchor before a risky all-in attack. If it fails, spend 3 TE to pull your army back to safety. But you've spent 2 command slots across 2 epochs, and the anchor expires if you wait too long.

**Constraint:** Only one anchor can exist at a time. Setting a new one overwrites the old one.

#### Chrono Scout — *"See what will be"*

| Property | Value |
|----------|-------|
| TE Cost | 2 |
| Command Slot | 1 |
| Unlocked | Chrono Spire structure required |

Reveals **predicted enemy positions** for the next epoch as probability clouds on the map. Accuracy is ~75% — positions are shown as fuzzy hexes that may be off by 1 hex.

**Strategic use:** Preemptive positioning. Place your units where the enemy will be, not where they are. Pairs well with Attack commands aimed at predicted locations.

**Constraint:** Requires the Chrono Spire structure (expensive, Tech Tier 2). If the Spire is destroyed, Chrono Scout is unavailable.

### 4.3 Paradox Risk — Temporal Instability

Overuse of temporal abilities in rapid succession creates **Temporal Instability**:

| Trigger | Effect |
|---------|--------|
| 3+ temporal abilities used in 2 consecutive epochs | All units suffer **-25% movement speed** and **-15% damage** for 2 epochs |
| 5+ temporal abilities used in 3 consecutive epochs | Above penalties + structures produce **-50% resources** for 2 epochs |

This prevents spamming time powers and forces players to balance temporal abilities with conventional strategy. The instability debuff is visible to both players, so an opponent can exploit a temporally-exhausted player.

### 4.4 Temporal Integration Across Systems

Temporal mechanics are not siloed — they interact with every system:

- **Fog of War:** Temporal Echo and Chrono Scout provide unique vision that bypasses fog
- **AI Opponent:** Higher-difficulty AIs use temporal abilities strategically and adapt to the player's temporal patterns
- **Resources:** TE is the only non-harvestable resource, creating unique economic tension
- **Command Slots:** Every temporal ability is a conventional action you didn't take
- **Win Conditions:** Temporal Singularity victory requires completing the tech tree, which unlocks all temporal abilities as a side effect
- **Map Control:** Chrono Spire placement matters — it enables Chrono Scout but is vulnerable to attack

---

## 5. Command System

### 5.1 Command Slots

The player begins each match with **5 command slots** per epoch. Additional slots are unlocked through the tech tree:

| Tech Tier | Command Slots |
|-----------|---------------|
| Start | 5 |
| Tier 1 | 6 |
| Tier 2 | 7 |
| Tier 3 | 8 |

Each slot holds exactly one command. Unused slots are wasted — there is no banking.

### 5.2 Command Types in Detail

#### Gather

- **Target:** One Drone + one resource node (Crystal Node or Flux Vent)
- **Effect:** Drone moves to node (if not adjacent) and begins harvesting
- **Yield:** +3 CC per Crystal Node per epoch, +2 FX per Flux Vent per epoch
- **Notes:** A Drone will continue gathering automatically in subsequent epochs until given a new command or the node is depleted

#### Build

- **Target:** One empty hex within your territory (adjacent to existing structure)
- **Effect:** Construction begins. Most structures take 1–2 epochs to complete.
- **Cost:** Varies by structure (see Section 6)
- **Notes:** Partially-built structures can be destroyed. Building on a hex claims it.

#### Train

- **Target:** One production structure (Barracks or War Foundry)
- **Effect:** A new unit is produced at the structure's hex at the end of the epoch
- **Cost:** Varies by unit (see Section 6)
- **Notes:** Each production structure can train one unit per epoch

#### Move

- **Target:** One unit or group + one destination hex
- **Effect:** Unit moves toward the target hex during execution. Movement range depends on unit speed and terrain.
- **Group move:** Select multiple units on the same or adjacent hexes to move together
- **Notes:** Units stop if they encounter an impassable hex or enemy unit (triggers combat if Attack was also queued)

#### Attack

- **Target:** One unit or group + one enemy unit/structure hex
- **Effect:** Selected units engage the target during execution. If units need to move to reach the target, they move first, then attack.
- **Notes:** Attacking into fog of war is allowed (but risky — target may have moved)

#### Defend

- **Target:** One unit or group
- **Effect:** Units hold position and gain **+50% damage resistance** for this epoch
- **Notes:** Defending units still counter-attack if engaged. Good for holding choke points.

#### Upgrade

- **Target:** Tech Lab structure
- **Effect:** Begins researching the next tech tier (3 epochs per tier)
- **Notes:** Research is interrupted if the Tech Lab is destroyed. Progress is lost.

#### Temporal

- **Target:** Varies by ability (see Section 4)
- **Effect:** Activates one temporal ability
- **Notes:** Consumes TE in addition to the command slot

### 5.3 Command Resolution Priority

When commands conflict (e.g., two units attacking each other simultaneously), the deterministic resolution order ensures consistent outcomes:

```
1. Defend    — Damage resistance applied first
2. Temporal  — Time abilities resolve (echoes, shifts, forks, anchors, scouts)
3. Move      — All movement resolves simultaneously
4. Attack    — Combat damage calculated and applied
5. Build     — Construction progress ticks
6. Upgrade   — Research progress ticks
7. Gather    — Resources harvested
8. Train     — New units spawned at production structures
```

Within the same priority tier, actions are resolved in map order (top-left to bottom-right hex by cube coordinates).

### 5.4 Command Queue UX

**Mobile (touch):**
1. Tap an empty command slot in the bottom tray
2. A **radial menu** appears with available command types
3. Select command type
4. Tap a target on the hex map (unit, structure, or hex)
5. Command populates the slot with an icon + mini-description
6. Drag to reorder slots, swipe to clear a slot

**Desktop (mouse + keyboard):**
1. Click a command slot or press **1–8** to select a slot
2. Right-click the map or use keyboard shortcut (**G**ather, **B**uild, **T**rain, **M**ove, **A**ttack, **D**efend, **U**pgrade, **[Space]** temporal)
3. Click target on map
4. **Spacebar** to lock in all commands early (TE bonus)

---

## 6. Units & Structures

All units and structures follow the minimalist vector aesthetic — geometric shapes with team color coding. Each has a distinct silhouette readable at any zoom level.

### 6.1 Units

#### Tier 0 — Available from Start

| Unit | Cost | HP | ATK | Speed | Range | Shape | Special |
|------|------|----|-----|-------|-------|-------|---------|
| **Drone** | 2 CC | 15 | 3 | 2 hex | — | Small circle | Harvests resources. Can repair structures (1 slot, restores 10 HP/epoch). Non-combat. |

#### Tier 1 — Available from Start

| Unit | Cost | HP | ATK | Speed | Range | Shape | Special |
|------|------|----|-----|-------|-------|-------|---------|
| **Pulse Sentry** | 4 CC | 40 | 12 | 2 hex | 1 (melee) | Square | Sturdy front-line fighter. +25% damage when Defending. |
| **Arc Ranger** | 5 CC | 25 | 8 | 2 hex | 3 hex | Diamond | Ranged attacker. Can fire without moving into the target hex. Fragile. |

#### Tier 2 — Requires Tech Tier 1

| Unit | Cost | HP | ATK | Speed | Range | Shape | Special |
|------|------|----|-----|-------|-------|-------|---------|
| **Phase Walker** | 6 CC, 1 FX | 30 | 10 | 3 hex | 1 (melee) | Triangle | Phases through enemy units during Move (ignores blocking). Cannot be intercepted in transit. |
| **Temporal Warden** | 5 CC, 2 FX | 35 | 6 | 2 hex | 2 hex | Hexagon | Provides **+2 hex vision radius** to all friendly units within 3 hexes. Detects Chrono Shifted units. |

#### Tier 3 — Requires Tech Tier 2 + War Foundry

| Unit | Cost | HP | ATK | Speed | Range | Shape | Special |
|------|------|----|-----|-------|-------|-------|---------|
| **Void Striker** | 8 CC, 3 FX | 50 | 18 | 1 hex | 2 hex | Octagon | Heavy DPS. Attacks deal **splash damage** to adjacent hexes (50% of primary damage). Slow. |
| **Flux Weaver** | 6 CC, 2 FX | 20 | 0 | 2 hex | 3 hex | Star (6-pointed) | Healer. Restores 12 HP to one friendly unit per epoch. Cannot attack. |

#### Tier 4 — Requires Tech Tier 3 + War Foundry

| Unit | Cost | HP | ATK | Speed | Range | Shape | Special |
|------|------|----|-----|-------|-------|-------|---------|
| **Chrono Titan** | 12 CC, 5 FX | 80 | 22 | 1 hex | 1 (melee) | Double-ring circle | On death, triggers a **free Chrono Shift** for all friendly units within 2 hexes (no TE cost, no slot cost). Once per match. |

### 6.2 Structures

| Structure | Cost | HP | Build Time | Requires | Description |
|-----------|------|----|------------|----------|-------------|
| **Command Nexus** | — | 100 | — | — | Starting HQ. Provides 3 hex vision. If destroyed, you lose (Annihilation). Cannot be rebuilt. |
| **Crystal Extractor** | 3 CC | 30 | 1 epoch | Adjacent to Crystal Node | Harvests Chrono Crystals. Must be placed on or adjacent to a Crystal Node. +3 CC/epoch when staffed by a Drone. |
| **Flux Conduit** | 4 CC, 1 FX | 25 | 1 epoch | Adjacent to Flux Vent, Tech Tier 1 | Harvests Flux. Must be placed on or adjacent to a Flux Vent. +2 FX/epoch when staffed by a Drone. |
| **Barracks** | 5 CC | 40 | 1 epoch | — | Produces Tier 0–2 units. One unit per epoch. |
| **War Foundry** | 8 CC, 3 FX | 50 | 2 epochs | Tech Tier 2 | Produces Tier 3–4 units. One unit per epoch. |
| **Tech Lab** | 6 CC | 35 | 1 epoch | — | Researches tech tiers. Only one Tech Lab active at a time. |
| **Chrono Spire** | 7 CC, 4 FX | 30 | 2 epochs | Tech Tier 2 | Increases TE cap to 15. Enables Chrono Scout ability. Fragile but powerful. |
| **Watchtower** | 3 CC | 20 | 1 epoch | — | Provides **+4 hex vision radius**. No other function. Cheap fog-of-war counter. |
| **Shield Pylon** | 5 CC, 2 FX | 25 | 1 epoch | Tech Tier 1 | All friendly units within 2 hexes gain **+20% damage resistance**. Does not stack with Defend. |

### 6.3 Tech Tree

Research is performed at the Tech Lab. Each tier takes **3 epochs** to complete and grants **+1 command slot** plus unlocks new units/structures/abilities.

```
TECH TIER 0 (Start)
├── Units: Drone, Pulse Sentry, Arc Ranger
├── Structures: Command Nexus, Crystal Extractor, Barracks, Tech Lab, Watchtower
├── Temporal: Temporal Echo
└── Command Slots: 5

TECH TIER 1 (3 epochs research)
├── Unlocks: Phase Walker, Temporal Warden
├── Unlocks: Flux Conduit, Shield Pylon
├── Unlocks: Chrono Shift ability
└── Command Slots: 6

TECH TIER 2 (3 epochs research, requires Tier 1)
├── Unlocks: Void Striker, Flux Weaver
├── Unlocks: War Foundry, Chrono Spire
├── Unlocks: Timeline Fork ability
└── Command Slots: 7

TECH TIER 3 (3 epochs research, requires Tier 2)
├── Unlocks: Chrono Titan
├── Unlocks: Epoch Anchor ability
├── Unlocks: Chrono Scout ability (requires Chrono Spire)
└── Command Slots: 8
```

Completing all 4 tiers (Tier 0 + 3 researched) triggers the **Temporal Singularity** win condition.

---

## 7. Resource System

Epoch uses a **triple-resource economy** that creates distinct strategic pressures:

### 7.1 Chrono Crystals (CC)

| Property | Value |
|----------|-------|
| **Role** | Primary currency for all building and training |
| **Source** | Crystal Nodes on the map (6–10 per map) |
| **Harvest rate** | +3 CC per staffed Crystal Extractor per epoch |
| **Starting amount** | 10 CC |

Crystal Nodes are the backbone of the economy. They are distributed across the map, with some near starting positions and others in contested territory. Controlling more nodes = faster economy.

Crystal Nodes are **finite** — each node contains ~50 CC before depletion (approximately 17 epochs of harvesting). Late-game resource scarcity forces aggression.

### 7.2 Flux (FX)

| Property | Value |
|----------|-------|
| **Role** | Advanced resource for powerful units, structures, and upgrades |
| **Source** | Flux Vents on the map (3–5 per map, always in contested zones) |
| **Harvest rate** | +2 FX per staffed Flux Conduit per epoch |
| **Starting amount** | 0 FX |

Flux Vents are always placed in **exposed, contestable map positions** — never near starting bases. Controlling Flux requires map control, which requires military investment, which requires Flux. This creates a snowball-or-starve dynamic.

Flux Vents are **infinite** — they never deplete. This makes them valuable long-term investments.

### 7.3 Temporal Energy (TE)

| Property | Value |
|----------|-------|
| **Role** | Fuel for temporal abilities |
| **Source** | Passive regeneration only (+1 TE/epoch) |
| **Harvest rate** | Cannot be harvested from the map |
| **Starting amount** | 3 TE |
| **Cap** | 10 (15 with Chrono Spire) |
| **Bonus** | +1 TE for locking in commands early |

TE is unique: it cannot be rushed, stockpiled easily, or stolen. It rewards patience and decisive play. The early lock-in bonus creates a risk/reward tension — commit early for more temporal power, or wait for more information.

### 7.4 Resource Tension Map

```
Chrono Crystals ──── "What can I build?"
      │                  │
      │                  ▼
      │         Flux ──── "What SHOULD I build?"
      │           │
      │           │
      ▼           ▼
 Command Slots ──── "What can I DO this epoch?"
      │
      ▼
 Temporal Energy ── "Should I bend time... or act?"
```

Every epoch, the player must balance spending across all three resources while working within the command slot budget. There is never enough of everything.

---

## 8. Map & Fog of War

### 8.1 Hex Grid System

The map uses a **pointy-top hex grid** with **cube coordinates** (q, r, s where q + r + s = 0). This system provides:

- **6-directional movement** for more interesting tactical positioning than square grids
- **Equal distance** between all adjacent hexes (no diagonal advantage)
- **Efficient pathfinding** using cube coordinate math
- **Clean vector rendering** aligned with the minimalist aesthetic

**Standard map size:** ~24 columns × 20 rows (~480 hexes)

### 8.2 Map Generation

Maps are **procedurally generated** with a seed (shareable for replay/challenge purposes). Generation follows these constraints:

- **Mirror symmetry** — Starting positions and initial resource access are symmetrical across the map center, ensuring fairness
- **Crystal Node placement** — 6–10 nodes, with 2 guaranteed near each starting position and the rest in contested territory
- **Flux Vent placement** — 3–5 vents, always in the map center or contested zones, never near starting positions
- **Terrain variety** — Mix of open ground, ridges, void rifts, and energy fields
- **Chokepoint guarantee** — At least 2 natural chokepoints exist between starting positions

### 8.3 Terrain Types

| Terrain | Symbol | Movement | Vision | Notes |
|---------|--------|----------|--------|-------|
| **Open Ground** | — | Normal | Normal | Default terrain. No modifiers. |
| **Ridge** | ▲ | Normal | Blocks LoS | Units on a ridge gain +1 vision range. Blocks line of sight for units behind it. |
| **Void Rift** | ✕ | Impassable | Normal | Cannot be crossed or built on. Natural walls. Phase Walkers CAN cross. |
| **Energy Field** | ≈ | -1 speed | Normal | Slows all units passing through. Provides +1 CC/epoch if a Crystal Extractor is adjacent. |
| **Crystal Node** | ◆ | Normal | Normal | Resource hex. Build a Crystal Extractor adjacent to harvest. Depletes after ~50 CC. |
| **Flux Vent** | ◈ | Normal | Normal | Resource hex. Build a Flux Conduit adjacent to harvest. Infinite. |

### 8.4 Fog of War

Epoch uses a **three-state fog of war** system:

```
┌─────────────────────────────────────────────────────────────┐
│                    FOG OF WAR STATES                        │
│                                                             │
│  ┌──────────────┐ ┌──────────────────┐ ┌────────────────┐  │
│  │  UNEXPLORED  │ │  EXPLORED (DARK) │ │    VISIBLE     │  │
│  │              │ │                  │ │                │  │
│  │ Solid dark   │ │ Desaturated      │ │ Full color     │  │
│  │ overlay      │ │ terrain shown    │ │ Real-time info │  │
│  │              │ │                  │ │                │  │
│  │ No info      │ │ Last-known enemy │ │ Current enemy  │  │
│  │              │ │ positions shown  │ │ positions      │  │
│  │              │ │ as ghosts with   │ │                │  │
│  │              │ │ epoch timestamp  │ │                │  │
│  └──────────────┘ └──────────────────┘ └────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

1. **Unexplored** — Hex has never been within vision range. Rendered as solid dark overlay. No information.
2. **Explored (Dark)** — Hex was previously visible but is no longer in vision range. Terrain is shown desaturated. Enemy units/structures last seen here are shown as **ghost outlines** with an epoch timestamp (e.g., "Epoch 4"). Actual enemy positions may have changed.
3. **Visible** — Hex is currently within vision range of a friendly unit or structure. Full-color rendering. Enemy positions are accurate and real-time.

**Vision sources:**

| Source | Vision Radius |
|--------|---------------|
| Command Nexus | 3 hexes |
| Watchtower | 4 hexes |
| Most units | 2 hexes |
| Temporal Warden | 2 hexes (self) + grants +2 to nearby allies |
| Arc Ranger | 3 hexes (matches attack range) |

**Temporal abilities and fog:**
- **Temporal Echo** bypasses fog — shows last-epoch enemy commands even in unexplored hexes
- **Chrono Scout** bypasses fog — shows predicted enemy positions in probability clouds
- **Timeline Fork** simulates using your current fog state — doesn't reveal new information

### 8.5 Map Navigation

The entire map is **zoomable and pannable** on both platforms:

| Action | Mobile | Desktop |
|--------|--------|---------|
| **Pan** | Touch-drag with one finger | Click-drag, or WASD keys |
| **Zoom in** | Pinch-to-zoom | Scroll wheel up, or `+` key |
| **Zoom out** | Pinch-to-zoom | Scroll wheel down, or `-` key |
| **Snap to base** | Double-tap minimap home icon | Press `Home` key |
| **Snap to action** | Tap execution event notification | Press `F` to follow action |

**Minimap:** A small minimap is always visible in the corner (bottom-left on mobile, top-right on desktop). It shows:
- Fog of war state (simplified)
- Friendly unit/structure positions (team color dots)
- Known enemy positions (enemy color dots)
- Current viewport rectangle
- Tap/click to snap the main view to that location

**Zoom levels:**
- **Strategic view** — Entire map visible. Units shown as colored dots. Good for planning.
- **Tactical view** — ~12×8 hexes visible. Units shown as geometric shapes. Default view.
- **Detail view** — ~6×4 hexes visible. Unit stats visible on hover/tap. Good for reviewing specific engagements.

Zoom and pan are smooth (interpolated) and maintain 60fps on mobile devices.

---

## 9. AI Opponent

Epoch is designed around a **strategic AI dialogue**. The AI is not a reflex-based opponent — it operates within the same epoch system, command slot constraints, and fog of war as the player.

### 9.1 AI Archetypes

The AI selects (or blends) from four strategic archetypes:

| Archetype | Priorities | Early Game | Mid Game | Late Game |
|-----------|-----------|------------|----------|-----------|
| **Expander** | Economy, map control | Builds extractors aggressively, claims Crystal Nodes | Secures Flux Vents, builds Watchtowers for vision | Leverages resource advantage into overwhelming force |
| **Aggressor** | Military pressure | Trains Pulse Sentries immediately, early attacks | Constant harassment, targets undefended extractors | All-in pushes with Void Strikers |
| **Technologist** | Tech tree, temporal abilities | Rushes Tech Lab, researches Tier 1 ASAP | Uses Chrono Shift and Timeline Fork aggressively | Aims for Temporal Singularity win condition |
| **Fortress** | Defense, turtling | Builds Shield Pylons, Defends frequently | Creates layered defense with Watchtowers and Barriers | Slow, methodical push with overwhelming tech advantage |

### 9.2 Difficulty Levels

| Difficulty | Command Slots | Temporal Abilities | Behavior |
|-----------|---------------|--------------------|----------|
| **Novice** | 4 | None | Single archetype, no adaptation. Makes suboptimal moves ~30% of the time. Slower to expand. |
| **Adept** | 5 | Temporal Echo only | Single archetype with mild adaptation. Optimizes resource usage. |
| **Commander** | 5 | Echo + Chrono Shift | Blended archetypes. Adapts to player patterns. Uses temporal abilities tactically. |
| **Epoch Master** | 6 | All abilities | Full archetype blending. Aggressive adaptation. Exploits player habits. Uses temporal abilities strategically. |

### 9.3 Adaptation System

The AI tracks the player's **command distribution** over the last 5 epochs:

```
Example: Player command history (last 5 epochs)
┌────────┬───────┬───────┬───────┬────────┬────────┬──────────┐
│ Epoch  │ Gather│ Build │ Train │ Move   │ Attack │ Temporal │
├────────┼───────┼───────┼───────┼────────┼────────┼──────────┤
│ E-5    │  2    │  1    │  1    │  0     │  1     │  0       │
│ E-4    │  1    │  1    │  2    │  1     │  0     │  0       │
│ E-3    │  0    │  0    │  2    │  2     │  1     │  0       │
│ E-2    │  0    │  0    │  1    │  2     │  2     │  0       │
│ E-1    │  0    │  0    │  1    │  2     │  2     │  0       │
└────────┴───────┴───────┴───────┴────────┴────────┴──────────┘

AI Analysis: Player shifted from economy to military buildup.
             Likely incoming attack. Shift archetype blend toward Fortress.
```

Each epoch, the AI shifts its archetype blend by ~10% toward the counter-strategy:
- Heavy Gather/Build detected → shift toward Aggressor (punish greedy economy)
- Heavy Attack/Move detected → shift toward Fortress (absorb aggression)
- Heavy Temporal detected → shift toward Expander (outpace while they spend TE)
- Balanced play detected → maintain current blend

### 9.4 AI Decision Making

The AI evaluates commands each epoch using a **weighted scoring system**:

1. **Threat assessment** — Evaluates known and last-known enemy positions near own structures
2. **Economic evaluation** — Tracks resource income vs. spending rate, identifies deficits
3. **Opportunity detection** — Identifies undefended enemy structures, depleting nodes, exposed Chrono Spires
4. **Temporal planning** — Decides whether to spend TE based on game state (Commander+ only)
5. **Command allocation** — Assigns slots to highest-scoring actions, respecting archetype weighting

The AI operates within the same fog of war as the player. It does NOT cheat — it uses Watchtowers, Temporal Wardens, and temporal abilities to gather information, just like the player.

### 9.5 AI Personality Tells

To make the AI feel like a strategic opponent rather than a machine, each archetype has subtle behavioral patterns:

- **Expander** — Builds Watchtowers in a consistent expansion pattern (clockwise or counterclockwise)
- **Aggressor** — Tends to probe the same flank twice before switching
- **Technologist** — Retreats units to protect Tech Lab when threatened
- **Fortress** — Leaves "bait" units slightly forward to draw attacks into defensive range

These tells are intentional — an observant player can read the AI's archetype and adapt. Higher difficulties blend tells, making them harder to read.

---

## 10. UI/UX Design

### 10.1 Layout Philosophy

Epoch is **mobile-first** but fully functional on desktop. The UI adapts between portrait (mobile) and landscape (desktop) orientations while maintaining the same information hierarchy:

1. **Hex map** — Primary view, always largest element
2. **Resource bar** — Always visible, minimal footprint
3. **Command tray** — Appears during planning phase, collapses during execution
4. **Minimap** — Always visible, small

### 10.2 Mobile Layout (Portrait)

```
┌────────────────────────────────┐
│  ⏱ 0:24  │ CC:15 │ FX:3 │ TE:5│  ← Resource/Timer Bar
├────────────────────────────────┤
│                                │
│                                │
│                                │
│         HEX MAP VIEW           │
│      (touch to pan/zoom)       │
│                                │
│                                │
│                                │
│                    ┌────┐      │
│                    │mini│      │  ← Minimap
│                    │map │      │
│                    └────┘      │
├────────────────────────────────┤
│ [1:Gather] [2:Train] [3:Move] │  ← Command Slots
│ [4:Attack] [5:____]           │
├────────────────────────────────┤
│  [LOCK IN ▶]    Epoch 7       │  ← Action Bar
└────────────────────────────────┘
```

### 10.3 Desktop Layout (Landscape)

```
┌──────────────────────────────────────────────────┐
│  ⏱ 0:24  │ CC:15 │ FX:3 │ TE:5 │ Epoch 7       │
├──────────────────────────────────────────────────┤
│                                          ┌─────┐│
│                                          │mini ││
│                                          │map  ││
│                                          └─────┘│
│              HEX MAP VIEW                       │
│                                                 │
│                                                 │
│                                                 │
│                                                 │
├──────────────────────────────────────────────────┤
│ [1] [2] [3] [4] [5] [_] [_] [_]  [LOCK IN ▶]  │
│ Gather Train Move Attack ___                    │
└──────────────────────────────────────────────────┘
```

### 10.4 Planning Phase UI

During the planning phase, the command tray is active:

- **Empty slots** pulse gently to draw attention
- **Filled slots** show an icon + abbreviated label (e.g., sword icon + "Atk E3" for Attack at hex E3)
- **Tap a slot** → radial menu appears at tap location with command type icons
- **Select command type** → map enters targeting mode (eligible hexes highlight)
- **Tap target hex** → command is confirmed, slot fills
- **Long-press a filled slot** → shows detail tooltip with command parameters
- **Swipe a slot left** → clears the command
- **Drag between slots** → reorders (order doesn't affect execution, but helps player organize)

**Countdown timer** is prominent (top bar) and changes color:
- Green: >15 seconds remaining
- Yellow: 5–15 seconds remaining
- Red: <5 seconds remaining, pulses

**Lock-in button** is always accessible. Pressing it early locks commands and grants +1 TE bonus. Button shows a confirmation animation.

### 10.5 Execution Phase UI

During execution:

- Command tray **collapses** to maximize map view
- **Camera auto-follows** the most significant action (combat > movement > building)
- Player can **override** auto-camera by touching/clicking the map
- **Event feed** scrolls on the side: "Pulse Sentry destroyed at C4", "Crystal Extractor completed at A2"
- **Temporal effects** are prominently animated (ripple distortion, clock motifs)
- Execution plays at **1x speed** by default, with a **skip button** to jump to results

### 10.6 Epoch Transition Overlay

After execution completes, a summary overlay appears briefly:

```
┌──────────────────────────────────────┐
│          EPOCH 7 COMPLETE            │
│                                      │
│  Units lost: 1 Pulse Sentry         │
│  Units trained: 2 Arc Rangers       │
│  Resources gained: +9 CC, +2 FX     │
│  Structures: Crystal Extractor (B3) │
│  Temporal: Echo used                 │
│                                      │
│         [CONTINUE ▶]                │
└──────────────────────────────────────┘
```

Tapping Continue (or automatic after 3 seconds) starts the next planning phase.

### 10.7 Accessibility

- **Color-blind support:** Team colors are paired with distinct shapes (player = circles/squares, AI = triangles/diamonds for units). Shapes differentiate even without color.
- **Text scaling:** UI respects system font size preferences
- **Touch targets:** All interactive elements are minimum 44×44px (Apple HIG standard)
- **Reduced motion:** Option to disable execution animations (show results instantly)

---

## 11. Visual Design

### 11.1 Aesthetic Direction

**Minimalist. Vector. Sci-fi.**

The visual style prioritizes **clarity over spectacle**. Every element on screen serves a strategic purpose. The aesthetic draws from:

- **Tron** — Clean glowing lines on dark backgrounds
- **Monument Valley** — Geometric precision, limited palette
- **Into the Breach** — UI clarity, readable game state at a glance

No photorealistic textures. No 3D perspective distortion. Clean 2D top-down hex view with vector-drawn elements.

### 11.2 Color Palette

| Role | Color | Hex Code | Usage |
|------|-------|----------|-------|
| **Background** | Deep Navy | `#0a0e1a` | Map background, empty space |
| **Hex Grid** | Slate | `#1e293b` | Hex borders and fill |
| **Hex Grid Lines** | Dim Cyan | `#334155` | Subtle hex outlines |
| **Player (Friendly)** | Cyan | `#00e5ff` | Player units, structures, UI highlights |
| **AI (Enemy)** | Coral | `#ff6b4a` | Enemy units, structures, threat indicators |
| **Temporal** | Gold | `#fbbf24` | Temporal abilities, TE meter, time effects |
| **Flux** | Magenta | `#d946ef` | Flux resources, Flux-related structures |
| **Crystal** | Ice Blue | `#7dd3fc` | Chrono Crystal resources, Crystal Nodes |
| **UI Text** | White | `#f8fafc` | Primary text |
| **UI Secondary** | Gray | `#94a3b8` | Secondary text, labels |
| **Positive** | Green | `#4ade80` | Health bars, positive events |
| **Warning** | Amber | `#f59e0b` | Timer warnings, low resources |
| **Danger** | Red | `#ef4444` | Critical warnings, low HP |

### 11.3 Hex Rendering

- **Default hex fill:** `#1e293b` with `#334155` border (0.5px)
- **Visible hex:** Slightly brighter fill (`#1e293b` → `#253347`)
- **Explored-dark hex:** Desaturated fill with 40% opacity dark overlay
- **Unexplored hex:** Solid `#070b14` with subtle noise pattern
- **Fog edge:** Soft gradient at visibility boundary (3px feather)
- **Selected hex:** Bright border in player color with subtle pulse animation
- **Targetable hex:** Dotted border during command targeting

### 11.4 Unit Rendering

Units are **geometric shapes** drawn with vector strokes and fills:

| Unit | Shape | Size | Details |
|------|-------|------|---------|
| Drone | Small circle | 8px radius | Single dot center |
| Pulse Sentry | Square | 12px | Diagonal cross lines |
| Arc Ranger | Diamond (rotated square) | 12px | Horizontal line through center |
| Phase Walker | Triangle (pointing up) | 14px | Dashed outline (phase effect) |
| Temporal Warden | Hexagon | 14px | Clock-face lines inside |
| Void Striker | Octagon | 16px | Concentric inner octagon |
| Flux Weaver | 6-pointed star | 14px | Pulsing inner glow |
| Chrono Titan | Double-ring circle | 20px | Inner ring rotates slowly |

All units use their **team color** as the primary fill/stroke. A small HP bar appears below each unit (green → yellow → red).

### 11.5 Structure Rendering

Structures are **larger geometric shapes** with internal detail lines:

| Structure | Shape | Size | Details |
|-----------|-------|------|---------|
| Command Nexus | Large hexagon | 24px | Triple concentric hex rings, pulsing |
| Crystal Extractor | Pentagon | 16px | Crystal icon inside |
| Flux Conduit | Rounded rectangle | 16px | Flowing particle line inside |
| Barracks | Rectangle | 18px | Grid lines (barracks doors) |
| War Foundry | Double rectangle | 20px | Gear icon inside |
| Tech Lab | Circle with ring | 18px | Spiral inside (research) |
| Chrono Spire | Tall diamond | 20px | Vertical clock-hand lines |
| Watchtower | Triangle | 14px | Eye icon inside |
| Shield Pylon | Inverted triangle | 14px | Arc lines radiating outward |

Structures under construction show a **dashed outline** that progressively fills in solid as construction completes.

### 11.6 Execution Phase Effects

- **Movement:** Smooth interpolation along hex path with fading **trail line** in team color
- **Attack (melee):** Quick dash to target hex + white **impact flash** (2 frames)
- **Attack (ranged):** Thin **beam line** from attacker to target with brief glow
- **Damage:** Floating damage number rises and fades (e.g., "-12" in red)
- **Unit death:** Shape **shatters** into 4–6 fragments that fade out
- **Construction:** Shape **assembles** from fragments into final form
- **Resource gather:** Small particles flow from node toward extractor

### 11.7 Temporal Effect Visuals

Temporal abilities have **distinctive, immediately recognizable** visual effects:

| Ability | Visual Effect |
|---------|---------------|
| **Temporal Echo** | Ghost outlines of last-epoch enemy commands appear as translucent gold overlays. Commands pulse slowly. |
| **Chrono Shift** | Target unit leaves a **gold afterimage** at current position, then snaps to 2-epochs-ago position with a **ripple distortion** effect. Damage shield shown as gold ring. |
| **Timeline Fork** | Screen briefly **splits** with a vertical crack effect. Simulation plays in desaturated tones. When revising, the crack "heals" with a flash. |
| **Epoch Anchor** | Gold **bookmark icon** appears above all friendly units. When activated, gold **rewind lines** trace from current positions back to anchored positions. |
| **Chrono Scout** | Gold **probability clouds** (fuzzy hexagons) appear at predicted enemy locations. Clouds pulse with higher opacity = higher confidence. |
| **Paradox Risk** | When Temporal Instability triggers, a brief **glitch/static** effect covers all friendly units. Affected units show faint gold static for the debuff duration. |

---

## 12. Audio Design

### 12.1 Philosophy

All audio is **procedurally generated** using the Web Audio API — no audio files. This approach:

- Keeps the bundle size minimal (0 KB audio assets)
- Allows dynamic audio that responds to game state
- Aligns with the Determined project's proven approach
- Enables infinite variation without repetition

### 12.2 Ambient Soundscape

A low-frequency ambient drone plays continuously, shifting character based on game state:

| Game State | Ambient Character |
|------------|-------------------|
| **Planning Phase (calm)** | Low sine wave drone (60–80Hz), soft, contemplative |
| **Planning Phase (tense)** | Drone pitch rises slightly, adds subtle sawtooth harmonics |
| **Execution Phase** | Drone becomes rhythmic (pulsing at ~120 BPM), percussive undertones |
| **Temporal Ability Active** | Drone pitch-shifts downward, reverb increases, creates "time stretching" feel |
| **Late Game / Low HP** | Drone becomes more dissonant, higher frequency components added |

### 12.3 UI Sounds

| Action | Sound Design |
|--------|-------------|
| **Fill command slot** | Rising tone (200Hz → 400Hz, triangle wave, 100ms). Pitch increases with slot number. |
| **Clear command slot** | Descending tone (400Hz → 200Hz, 100ms) |
| **Lock in commands** | Satisfying "click-lock" — short noise burst + sine wave chord (C-E-G, 200ms) |
| **Lock in early (TE bonus)** | Same as lock-in but with added high shimmer (gold/temporal audio cue) |
| **Timer warning (5s)** | Soft tick every second (short noise burst, 50ms) |
| **Timer critical (3s)** | Faster ticks, rising pitch each second |
| **Epoch transition** | Deep chord change (resolving suspension, 500ms fade) |
| **Select unit** | Short blip (sine, 800Hz, 30ms) |
| **Select structure** | Lower blip (sine, 400Hz, 50ms) |

### 12.4 Execution Sounds

| Event | Sound Design |
|-------|-------------|
| **Unit movement** | Soft tick per hex crossed (filtered noise, 20ms) |
| **Melee attack** | Short noise burst with quick pitch drop (impact feel, 80ms) |
| **Ranged attack** | Rising "zap" (sawtooth, 200Hz → 2kHz sweep, 100ms) |
| **Damage taken** | Dull thud (low noise burst, 60ms) |
| **Unit destroyed** | Descending noise sweep with reverb tail (300ms) |
| **Structure completed** | Rising arpeggio (3 sine tones, ascending, 300ms) |
| **Resource gathered** | Crystalline chime (high sine + harmonics, 100ms) |

### 12.5 Temporal Ability Sounds

Each temporal ability has a **distinctive audio signature** that reinforces the time-travel theme:

| Ability | Sound Design |
|---------|-------------|
| **Temporal Echo** | Reverse reverb effect — sound that seems to play backward, then resolves forward (like hearing an echo before the original sound). 500ms. |
| **Chrono Shift** | Doppler sweep — pitch drops rapidly as if the unit is "falling" backward through time. Short "snap" at the end when it arrives. 400ms. |
| **Timeline Fork** | Splitting crackle — stereo-panned noise that diverges left and right, like reality cracking. 600ms. |
| **Epoch Anchor (set)** | Deep resonant gong — low frequency sine with long decay and slight pitch wobble. 800ms. |
| **Epoch Anchor (activate)** | Same gong played in reverse, followed by a "whoosh" sweep. 600ms. |
| **Chrono Scout** | High-frequency sonar ping that repeats 3 times with increasing clarity. 500ms total. |
| **Paradox Risk trigger** | Dissonant cluster chord + static noise burst. Unsettling. 400ms. |

### 12.6 Music

No traditional music tracks. The ambient soundscape IS the music — it evolves organically with the game state, creating a unique "score" for every match. This avoids repetition across sessions and keeps the atmosphere immersive.

---

## 13. Technical Architecture

### 13.1 Tech Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Framework** | Next.js 15 (App Router) | Aligned with Mi Casa Es Su Casa. SSG for fast loading, App Router for modern React patterns. |
| **Language** | TypeScript 5.7 | Strong typing for complex game state. Catches bugs at compile time. |
| **UI Framework** | React 19 | Component model for HUD, menus, command tray. |
| **Styling** | Tailwind CSS 4 | Utility-first CSS for responsive layouts. Consistent with existing projects. |
| **Game Rendering** | HTML5 Canvas 2D | Vector-style rendering, performant on mobile, no WebGL dependency. |
| **Audio** | Web Audio API | Procedural audio synthesis, zero audio file assets. |
| **Testing** | Vitest + Playwright | Unit tests for game logic, E2E tests for UI flows. |
| **Deployment** | Vercel | Auto-deploy, preview deployments, edge CDN. |

### 13.2 Project Structure

```
epoch/
├── Docs/
│   └── GDD.md                 # This document
├── app/                        # Next.js App Router
│   ├── layout.tsx              # Root layout (meta, fonts, global styles)
│   ├── page.tsx                # Landing / main menu
│   └── game/
│       └── page.tsx            # Game page (canvas + React HUD)
├── components/                 # React UI components
│   ├── hud/
│   │   ├── ResourceBar.tsx     # CC, FX, TE display
│   │   ├── CommandTray.tsx     # Command slot UI
│   │   ├── EpochTimer.tsx      # Countdown timer
│   │   ├── Minimap.tsx         # Minimap overlay
│   │   └── EpochSummary.tsx    # Transition overlay
│   ├── menu/
│   │   ├── MainMenu.tsx        # Start game, settings, credits
│   │   ├── DifficultySelect.tsx
│   │   └── SettingsPanel.tsx
│   └── shared/
│       ├── RadialMenu.tsx      # Command type selector (mobile)
│       └── Tooltip.tsx
├── engine/                     # Pure TypeScript game logic (no DOM/React)
│   ├── state.ts                # GameState type, initial state factory
│   ├── commands.ts             # Command types, validation, queueing
│   ├── simulation.ts           # Execution phase resolution logic
│   ├── units.ts                # Unit definitions, stats, behaviors
│   ├── structures.ts           # Structure definitions, construction
│   ├── resources.ts            # Resource harvesting, economy
│   ├── temporal.ts             # Temporal ability logic
│   ├── fog.ts                  # Fog of war calculations
│   ├── map.ts                  # Map generation, terrain, hex queries
│   ├── ai/
│   │   ├── ai.ts               # AI entry point, decision loop
│   │   ├── archetypes.ts       # Archetype definitions and blending
│   │   ├── evaluation.ts       # Threat/opportunity scoring
│   │   └── adaptation.ts       # Player pattern tracking
│   └── tech.ts                 # Tech tree progression
├── renderer/                   # Canvas 2D rendering (no game logic)
│   ├── canvas.ts               # Canvas setup, resize handling
│   ├── camera.ts               # Zoom, pan, viewport math
│   ├── hex.ts                  # Hex grid rendering
│   ├── units.ts                # Unit shape rendering
│   ├── structures.ts           # Structure shape rendering
│   ├── fog.ts                  # Fog of war overlay rendering
│   ├── effects.ts              # Execution phase animations
│   ├── temporal.ts             # Temporal ability visual effects
│   └── minimap.ts              # Minimap rendering
├── audio/
│   ├── manager.ts              # AudioContext lifecycle, master volume
│   ├── ambient.ts              # Ambient drone synthesis
│   ├── ui.ts                   # UI sound effects
│   ├── execution.ts            # Execution phase sounds
│   └── temporal.ts             # Temporal ability sounds
├── lib/                        # Shared utilities
│   ├── hex-math.ts             # Cube coordinate math, distance, neighbors, line-of-sight
│   ├── types.ts                # Shared TypeScript types/interfaces
│   └── constants.ts            # Game balance constants, color palette
├── public/
│   └── favicon.ico
├── tests/
│   ├── engine/                 # Vitest unit tests for game logic
│   └── e2e/                    # Playwright E2E tests
├── .github/
│   └── workflows/
│       └── ci.yml              # Lint + typecheck + test on push/PR
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
├── vercel.json
└── README.md
```

### 13.3 Architecture Principles

#### Separation of Concerns

The codebase is divided into three independent layers:

1. **Engine** (`/engine`) — Pure TypeScript. No DOM, no React, no Canvas. Contains all game rules, state transitions, and AI logic. Fully testable with Vitest.
2. **Renderer** (`/renderer`) — Canvas 2D drawing code. Reads game state, draws frames. No game logic.
3. **UI** (`/components`) — React components for HUD, menus, overlays. Communicates with engine via state.

```
┌────────────────┐     ┌────────────────┐     ┌────────────────┐
│   React UI     │────▶│  Game Engine   │◀────│  Canvas        │
│  (components/) │     │  (engine/)     │     │  Renderer      │
│                │     │                │     │  (renderer/)   │
│  HUD, menus,   │     │  State, rules, │     │  Hex grid,     │
│  command tray  │     │  AI, simulation│     │  units, fog,   │
│                │     │                │     │  effects       │
└────────────────┘     └────────────────┘     └────────────────┘
         │                     │                       │
         └─────────────────────┼───────────────────────┘
                               ▼
                     ┌────────────────┐
                     │   Game State   │
                     │   (single      │
                     │   source of    │
                     │   truth)       │
                     └────────────────┘
```

#### Deterministic State Transitions

The game engine is a **pure function**:

```typescript
function resolveEpoch(
  currentState: GameState,
  playerCommands: Command[],
  aiCommands: Command[]
): GameState {
  // Deterministic resolution — same inputs always produce same outputs
  // Enables replay, Timeline Fork simulation, and testing
}
```

This means:
- **Replays** are just arrays of commands — state can be reconstructed from any point
- **Timeline Fork** runs the same function with predicted AI commands
- **Testing** is straightforward — assert on state output given known inputs
- **No hidden state** — everything is in the GameState object

#### Game Loop

```
PLANNING PHASE (React-driven):
  - React components render command tray, timer, HUD
  - Player fills command slots via React state
  - Canvas renders hex map, units, fog (requestAnimationFrame for smooth pan/zoom)
  - Timer counts down via setInterval

EXECUTION PHASE (Canvas-driven):
  1. resolveEpoch() computes new GameState instantly
  2. Renderer interpolates between old and new state over 5-10 seconds
  3. Animations play (movement trails, combat effects, temporal visuals)
  4. requestAnimationFrame drives 60fps rendering
  5. When animation completes, transition to next planning phase
```

### 13.4 State Management

Game state is managed via React Context + `useReducer`:

```typescript
interface GameState {
  epoch: number;
  phase: 'planning' | 'execution' | 'transition';
  timer: number;
  map: HexMap;
  players: {
    human: PlayerState;
    ai: PlayerState;
  };
  fog: FogState;
  history: EpochSnapshot[]; // For Chrono Shift (needs 2-epoch lookback)
  anchor: EpochAnchor | null;
  temporalInstability: number; // Epochs remaining on debuff
}

interface PlayerState {
  resources: { cc: number; fx: number; te: number };
  units: Unit[];
  structures: Structure[];
  techTier: number;
  commandSlots: number;
  commands: Command[]; // Current epoch's queued commands
}
```

### 13.5 Performance Targets

| Metric | Target |
|--------|--------|
| **FPS** | 60fps on mid-range mobile (2022 devices) |
| **First Contentful Paint** | < 1.5s |
| **Bundle size** | < 500KB (gzipped) |
| **Lighthouse score** | > 90 (Performance) |
| **Canvas draw calls** | < 1000 per frame |
| **State transition** | < 10ms (resolveEpoch) |

---

## 14. Vercel Deployment

### 14.1 Deployment Strategy

Epoch is a **fully client-side** game with no server requirements for MVP. Vercel serves it as a static Next.js application with edge CDN distribution.

| Aspect | Configuration |
|--------|---------------|
| **Platform** | Vercel |
| **Framework Preset** | Next.js |
| **Build Command** | `next build` |
| **Output** | Static export (SSG) |
| **Region** | Auto (edge CDN) |
| **Branch Deploys** | `main` → production, PRs → preview |

### 14.2 Vercel Configuration

```json
// vercel.json
{
  "framework": "nextjs",
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        }
      ]
    }
  ]
}
```

### 14.3 CI/CD Pipeline

GitHub Actions runs on every push and pull request:

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run lint        # ESLint
      - run: npm run typecheck   # tsc --noEmit
      - run: npm run test        # Vitest
      - run: npm run build       # Next.js build
```

### 14.4 Environment Variables

**MVP:** No environment variables needed. The game is entirely client-side.

**Future (v1.1+):**

| Variable | Purpose |
|----------|---------|
| `KV_REST_API_URL` | Vercel KV endpoint for match history |
| `KV_REST_API_TOKEN` | Vercel KV auth token |

### 14.5 Performance Budget

Vercel's edge CDN ensures fast global delivery. Additional measures:

- **Static generation** — All pages pre-rendered at build time
- **Code splitting** — Game engine loaded only on `/game` route
- **Canvas rendering** — No heavy framework overhead during gameplay
- **Zero audio assets** — Procedural audio adds 0 KB to bundle
- **Tree shaking** — Only imported engine modules are bundled

---

## 15. MVP Scope (v1.0)

### What's IN the MVP

| Feature | Scope |
|---------|-------|
| **Players** | 1 Human vs 1 AI (Adept difficulty) |
| **Epoch Loop** | Full planning (30s) + execution cycle |
| **Command Slots** | 5 fixed (no upgrading in MVP) |
| **Commands** | Gather, Build, Train, Move, Attack, Defend, Temporal |
| **Units** | Drone, Pulse Sentry, Arc Ranger (Tier 0–1 only) |
| **Structures** | Command Nexus, Crystal Extractor, Barracks, Tech Lab, Watchtower |
| **Resources** | Chrono Crystals only (no Flux in MVP) |
| **Temporal** | Temporal Echo only (2 TE cost) |
| **Map** | Medium hex grid (~24×20), procedurally generated |
| **Terrain** | Open Ground, Void Rift, Crystal Node |
| **Fog of War** | Full 3-state system (unexplored/explored/visible) |
| **Map Navigation** | Zoom + pan (mobile touch + desktop mouse/keyboard) |
| **Minimap** | Simplified minimap with viewport indicator |
| **Win Condition** | Annihilation only (destroy enemy Nexus) |
| **Execution Animation** | 1x speed, basic movement/combat effects |
| **Audio** | Procedural ambient + UI sounds + basic execution sounds |
| **Platforms** | Mobile web (portrait) + Desktop web (landscape) |
| **Deployment** | Vercel auto-deploy from GitHub |

### What's NOT in the MVP

| Feature | Deferred To |
|---------|-------------|
| Flux resource + Flux Conduit | ✅ v1.1 |
| Tier 2–4 units | ✅ v1.1 |
| War Foundry, Chrono Spire, Shield Pylon | ✅ v1.1 |
| Tech tree research / command slot upgrades | ✅ v1.1 |
| Chrono Shift | ✅ v1.1 |
| Timeline Fork, Epoch Anchor, Chrono Scout | v1.1 |
| Paradox Risk / Temporal Instability | v1.1 |
| AI archetypes (Aggressor, Technologist, Fortress) | v1.1 |
| AI difficulty levels (Novice, Commander, Epoch Master) | v1.1 |
| Temporal Singularity + Resource Dominance win conditions | v1.1 |
| Execution speed controls (0.5x, 2x, skip) | v1.2 |
| Tutorial / onboarding | v1.2 |
| Settings panel (audio, accessibility) | v1.2 |
| Match replay viewer | v1.2 |
| Multiplayer | v2.0 |
| Accounts + persistence | v2.0 |

### MVP Technical Milestones

1. **Hex map rendering** — Canvas 2D hex grid with zoom/pan and fog of war
2. **Game state engine** — GameState type, command system, epoch resolution
3. **Planning phase UI** — Command tray, radial menu, timer, lock-in
4. **Execution phase** — Simultaneous resolution, basic animation
5. **AI (Adept)** — Simple Expander archetype, no adaptation
6. **Temporal Echo** — Single temporal ability working end-to-end
7. **Win condition** — Annihilation detection + victory/defeat screen
8. **Mobile responsive** — Portrait layout, touch interactions
9. **Audio** — Procedural ambient + UI sounds
10. **Deploy** — Vercel pipeline, CI checks passing

---

## 16. Future Roadmap

### v1.1 — Full Strategic Depth

- ✅ Full tech tree (4 tiers) with command slot upgrades (5 → 8)
- ✅ All 8 unit types (Tier 0–4)
- ✅ All 9 structure types
- ✅ Flux resource + Flux Vents + Flux Conduit
- ✅ Temporal Echo + Chrono Shift
- ✅ Annihilation win condition (carried from v1.0)
- ⬜ Timeline Fork, Epoch Anchor, Chrono Scout temporal abilities
- ⬜ Paradox Risk / Temporal Instability system
- ⬜ All 4 AI archetypes with blending
- ⬜ All 4 difficulty levels (Novice → Epoch Master)
- ⬜ AI adaptation system (pattern tracking over 5 epochs)
- ⬜ Temporal Singularity + Resource Dominance win conditions
- ⬜ Ridge and Energy Field terrain types
- ⬜ Map size options (Small, Medium, Large)

### v1.2 — Polish & Accessibility

- Interactive tutorial (guided first match)
- Settings panel (audio volume, reduced motion, color-blind mode)
- Execution speed controls (0.5x, 1x, 2x, skip)
- Match replay viewer with timeline scrubber
- Daily challenge maps (seeded, shareable)
- Match statistics summary (units produced, resources spent, epochs played)
- Improved touch controls and haptic feedback (where supported)

### v2.0 — Multiplayer

- Async multiplayer — both players submit commands independently, execution resolves when both are locked in
- Player accounts with Vercel KV persistence
- Match history and win/loss records
- Ranked AI ladder (Elo-style rating against AI difficulties)
- Shareable match replays
- Friend invites via link

### v2.1 — Asymmetric Factions

- 2–3 factions with unique unit rosters, structures, and temporal abilities
- Faction-specific tech trees
- Balance tuning with community feedback
- Faction selection at match start

### v3.0 — Competitive

- Live multiplayer with real-time simultaneous planning
- Spectator mode
- Tournament brackets
- Community-created maps (map editor)
- Leaderboards (global, faction, weekly)
- Seasonal content (limited-time maps, faction events)

---

*Document version: 1.0*
*Last updated: March 2026*
*Repository: github.com/Randroids-Dojo/epoch*
