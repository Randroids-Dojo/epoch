# Tech Debt & Future Cleanup

Deferred items from the time-travel tutorial / fog-of-war / VFX review rounds.

---

## Renderer — Performance

- [ ] **Pre-cache `hexKey` on animation objects**: `drawAnimatedUnits()` calls `hexKey(fromHex)` and `hexKey(toHex)` every frame for each AI unit. Store the pre-computed strings on `UnitAnim` / `StructAnim` during `buildAnimationTimeline` to eliminate repeated string concat + Map lookups at 60fps.
- [ ] **Offscreen canvas for echo reveal mist**: `drawEchoRevealMist` issues ~170 `ctx.arc()` + `ctx.fill()` calls per frame for 2.4s (~144 frames). Pre-render the spiral to an offscreen canvas at key t-thresholds and composite with varying opacity instead.
- [ ] **Narrow `tutorialCombatUnitId` useMemo deps**: Depends on the entire `gameState` object, recomputing on every state mutation while tutorial is active. Use `gameState.units` or `gameState.units.size` instead. Same applies to the existing `tutorialDroneId` memo.
- [ ] **Wrap `onEchoRevealDone` in useCallback**: Inline `() => setEchoReveal(null)` creates a new closure every render. Impact is negligible (mitigated by ref in GameCanvas), but easy to fix.

## Architecture — Code Reuse

- [ ] **Extract fog visibility helpers to shared module**: `isUnitHiddenByFog` / `structureFogMode` in `drawEntities.ts` duplicate the same logic inlined in `Minimap.tsx`. Move to `engine/fog.ts` or `lib/fog.ts` so both layers share a single source of truth.
- [ ] **Extract easing functions to shared module**: `drawEntities.ts` has an inline quadratic ease-in-out; `actionSequence.ts` has a cubic `easeInOut`. Create `renderer/easing.ts` with named exports (`easeInOutQuad`, `easeInOutCubic`) to avoid further proliferation.
- [ ] **Unify `tutorialDroneId` / `tutorialCombatUnitId` into a generic helper**: Both follow a two-pass pattern (find idle unit matching criteria, fall back to any match). A shared `findTutorialUnit(units, orders, filter)` would eliminate structural duplication.

## Architecture — Code Quality

- [ ] **Data-driven tutorial build phases**: The "build Tech Lab" and "build Flux Conduit" tutorial sequences are structurally identical 4-step flows differing only in prefix and structure type. Similarly, the "select global command" pattern repeats for echo/research/anchor/recall. Extract into data-driven helpers.
- [ ] **Type `unitCommands` map values**: `AnimationTimelineOptions.unitCommands` uses `{ type: string }`. Use `{ type: Command['type'] }` from the engine's command union for compile-time safety on `chrono_shift` / `phase_surge` checks.
- [ ] **Move `EchoRevealState` out of `drawEntities.ts`**: It's a rendering concern but constructed in GameView's game logic. Move to `lib/types.ts` or a dedicated `renderer/echoReveal.ts` to reduce the surface area of the already-large `drawEntities.ts`.
- [ ] **Remove label-based matching in CommandPicker tutorial**: `entry.label === 'Anchor Set'` / `'Anchor Recall'` is fragile — if display text changes, tutorial breaks silently. Use a more robust identifier.
- [ ] **Simplify `tutorialHighlightUnitId` JSX ternary**: Growing ternary chain mapping step names to unit IDs. Extract to a lookup map or helper outside JSX.
