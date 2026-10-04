# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
