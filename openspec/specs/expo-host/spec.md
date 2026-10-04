# expo-host Specification

## Purpose

The behavioral contract of a React Native / Expo host that boots the unchanged `engine-core`
simulation, persists it locally, replays offline time through the same `advance()` contract,
and renders the core game loop and overlays through the active theme.

## Requirements

### Requirement: Save hydration on launch

The host SHALL load the persisted `SaveGame` through the `SaveRepository` abstraction before
starting the simulation, hydrate it with `engine-core`'s `loadGame`, and start a deterministic
fresh game when no save exists or when the stored blob is rejected.

#### Scenario: Existing valid save is restored

- **WHEN** the repository resolves a `SaveGame` the engine accepts
- **THEN** the host starts from the hydrated `GameState` (gold, stage, gear, achievements,
  RNG state) rather than a new game

#### Scenario: No save exists

- **WHEN** the repository resolves `null`
- **THEN** the host creates a fresh game with a seed and the current wall-clock time and
  renders the first frame

#### Scenario: Rejected or unsupported save

- **WHEN** the stored blob fails `loadGame` (corrupt JSON or an unsupported version)
- **THEN** the host logs the rejection and starts a fresh game instead of crashing

### Requirement: Offline elapsed-time replay

On boot the host SHALL credit away time by replaying the elapsed milliseconds through the same
`advance()` used by the live loop, in bounded fixed steps, capped at a maximum, and SHALL stop
replaying immediately when a choice is pending.

#### Scenario: Elapsed time is simulated

- **WHEN** a hydrated save has a finite `savedAt` earlier than the current time
- **THEN** the host advances the state by the elapsed time in fixed steps and boots from the
  resulting state

#### Scenario: Away time is capped

- **WHEN** the elapsed time exceeds the host's offline cap
- **THEN** the host replays only up to the cap and reports the raw elapsed time as capped

#### Scenario: Replay stops at a pending choice

- **WHEN** `advance` produces a state with a pending choice during replay
- **THEN** replay stops and the pending choice is shown on boot

#### Scenario: Replay grants no clicks

- **WHEN** offline time is replayed
- **THEN** only time-based simulation runs; no `click` or other player action is replayed

#### Scenario: Replay events are discarded

- **WHEN** offline replay produces `GameEvent`s
- **THEN** the host does not deliver them to the renderer's animation handling

#### Scenario: Offline summary is shown only when time was simulated

- **WHEN** replay advanced the state by at least one step
- **THEN** the host shows an offline summary with elapsed time, simulated time, and gold earned

### Requirement: Live fixed-step simulation loop

The host SHALL own the clock and drive `advance` in fixed simulation steps, bounded per frame,
and SHALL freeze simulation while a choice is pending.

#### Scenario: Fixed-step advancement

- **WHEN** real elapsed time accumulates
- **THEN** the host advances the state in whole fixed steps of the simulation step size

#### Scenario: Catch-up is bounded

- **WHEN** a frame's accumulated time would require more than the host's maximum number of steps
- **THEN** the host runs at most that many steps and drops the remaining backlog

#### Scenario: World freezes on a pending choice

- **WHEN** the state has a pending choice
- **THEN** the host stops advancing the simulation until the choice is resolved

### Requirement: Player actions dispatch through the engine

All player input SHALL be forwarded to `engine-core` as `Action`s and applied only via
`applyAction`; the host and renderer SHALL never mutate `GameState` directly.

#### Scenario: Tap maps to the click action

- **WHEN** the player taps the enemy
- **THEN** the host applies `{ type: 'click' }` and renders the returned state and events

#### Scenario: Upgrade, equip, choice, and claim map to actions

- **WHEN** the player uses an upgrade control, equips a bag item, resolves a pending choice, or
  claims a Golden Event
- **THEN** the host applies the matching `upgradeEquipped`, `equip`, `resolveChoice`, or
  `claimEvent` action

#### Scenario: No-op results skip re-rendering

- **WHEN** `applyAction` returns the same state object with no events (invalid or unaffordable)
- **THEN** the host does not re-render

### Requirement: Autosave and lifecycle persistence

The host SHALL persist the current state on a fixed autosave cadence and when the app leaves
the foreground, writing a versioned blob through `saveGame` with the wall-clock time at write.

#### Scenario: Periodic autosave

- **WHEN** the autosave interval elapses and no save is already in flight
- **THEN** the host serializes and persists the current state

#### Scenario: Persist when backgrounded

- **WHEN** the app transitions out of the active foreground state
- **THEN** the host flushes the current state before the app may be suspended

#### Scenario: A new game is saved immediately

- **WHEN** the host starts a fresh game
- **THEN** it persists a save from the first moment so a later launch can resume

### Requirement: Theme-driven presentation

The host SHALL source all user-facing copy and colours from the active theme and SHALL resolve
asset slots from the theme's declared name and asset map, so switching `ACTIVE_THEME` rescans
the app without editing host components. Every resolved asset slot SHALL be rendered as real
bundled art (not a stand-in placeholder), and the host SHALL NOT hard-code any asset file name or
directory outside the theme's own declaration.

#### Scenario: Copy comes from the active theme

- **WHEN** the host renders a label, button, overlay, or advisory
- **THEN** the string is read from `ACTIVE_THEME`, never hard-coded in the host

#### Scenario: Palette tokens drive styling

- **WHEN** the host builds component styles
- **THEN** colours come from the theme's palette tokens rather than fixed values

#### Scenario: Assets resolve from the theme

- **WHEN** the host renders a theme asset (player, enemy, Shiny)
- **THEN** the asset is located by the theme's `name` and `assets` map

#### Scenario: Declared art is rendered

- **WHEN** the host renders a normal or boss enemy, a Shiny variant, or the spawn popup
- **THEN** it displays the theme's declared image for that slot rather than a placeholder frame

#### Scenario: Missing slot fails loudly

- **WHEN** the host is asked for an asset slot the active theme does not declare
- **THEN** it fails with a descriptive error rather than rendering a silent blank

#### Scenario: Sprites are shown at their declared size

- **WHEN** a declared sprite is displayed
- **THEN** it is rendered at its source pixel dimensions (or an exact integer multiple) so the
  pixel art is not resampled and blurred

### Requirement: Stall advisory anchor is host-owned and unpersisted

The host SHALL record the simulation time at which the current stage began, pass it to the
stall advisory, and SHALL NOT persist it, so the save schema is unchanged.

#### Scenario: Anchor updates on stage change

- **WHEN** the host observes `combat.stage` changing between renders
- **THEN** it records the current `meta.totalPlayedMs` as the stage anchor and passes it to the
  advisory for that render

#### Scenario: Anchor is never saved

- **WHEN** the host persists a save
- **THEN** the stage anchor is not part of the persisted `GameState` and the save version
  remains v4

### Requirement: engine-core is consumed unchanged

The host SHALL treat `engine-core` as a read-only dependency: it SHALL call only its exported
API, add no engine fields, and keep the save schema at version 4.

#### Scenario: Engine source is untouched

- **WHEN** the change is complete
- **THEN** `git diff --stat engine-core` reports no changes

#### Scenario: Only the public API is used

- **WHEN** the host imports from the engine
- **THEN** it imports through the engine's public entry points and adds no engine fields

#### Scenario: Save version stays v4

- **WHEN** the host writes a save
- **THEN** the blob's `version` is the engine's current save version (4)

### Requirement: Theme animation cues drive transient sprite frames

The host SHALL consume the ordered engine events produced since the previous frame and SHALL
translate them into the active theme's declared animation cues, showing at most one transient
frame per actor for the cue's declared display duration and then returning that actor to its idle
frame. Handling events SHALL NOT mutate engine state, retain event history, or block the
simulation loop.

#### Scenario: Player attack cue animates the click source

- **WHEN** a damage event caused by a player click arrives
- **THEN** the cue selection attributes a `playerAttack` cue to the player target for its declared
  duration, and the host projects that cue on any player sprite it displays

#### Scenario: Enemy reaction selects the boss frame on a boss stage

- **WHEN** a hit or kill event arrives for an enemy on a boss stage
- **THEN** the enemy sprite shows the boss frame the theme declares for that cue

#### Scenario: Kill beats a same-batch hit

- **WHEN** one batch contains both a hit and a death for the same actor
- **THEN** only the higher-priority death frame is shown for that actor

#### Scenario: New enemy popup

- **WHEN** a new stage is entered
- **THEN** the global spawn popup displays the frame the theme declares for `stageEntered` for its
  declared duration

#### Scenario: Zero duration disables a cue

- **WHEN** a cue's declared duration is zero
- **THEN** no transient frame is shown for that cue

#### Scenario: Events are discarded after handling

- **WHEN** a frame's events have been translated into cues
- **THEN** the host keeps no event history and the next frame starts from an empty batch

### Requirement: Reduced motion suppresses movement but not information

The host SHALL honor the operating system's reduced-motion preference. While reduced motion is
enabled the host SHALL NOT swap sprite frames or play movement animations, but SHALL still present
informational text. The preference SHALL be applied live without a restart.

#### Scenario: No frame swaps under reduced motion

- **WHEN** reduced motion is enabled and engine events arrive
- **THEN** every sprite keeps its idle frame and no movement animation plays

#### Scenario: Information still shows under reduced motion

- **WHEN** reduced motion is enabled and an achievement unlocks, an enemy taunts, or offline
  progress is summarized
- **THEN** the informational text is still displayed

#### Scenario: Preference changes take effect immediately

- **WHEN** the player changes the reduced-motion preference mid-session
- **THEN** the host begins or stops movement animations from that point without a restart

### Requirement: Safe-area insets are respected

The host SHALL lay out the game screen inside the device's safe-area insets so that top content
clears the Android status bar / display cutout and the iOS notch, and bottom content clears the
home indicator / gesture area.

#### Scenario: Top content clears the status bar

- **WHEN** the host renders on a device whose safe area includes a top inset (edge-to-edge
  Android with a status bar, or an iOS notch)
- **THEN** the top of the game content sits at or below that inset and is not clipped

#### Scenario: Bottom content clears the gesture area

- **WHEN** the host renders on a device whose safe area includes a bottom inset
- **THEN** scrollable content and overlays keep clear of that inset

#### Scenario: No inset means no extra padding

- **WHEN** the reported safe-area insets are zero
- **THEN** the host applies no extra safe-area padding
