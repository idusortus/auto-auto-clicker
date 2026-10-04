# Spec Delta

## MODIFIED Requirements

### Requirement: Theme-driven presentation

The host SHALL source all user-facing copy and colours from the active theme and SHALL resolve
asset slots from the theme's declared name and asset map, so switching `ACTIVE_THEME` rescans
the app without editing host components. Every resolved asset slot SHALL be rendered as real
bundled art (not a placeholder blob), and the host SHALL NOT hard-code any asset file name or
directory outside the theme's own declaration. Each declared asset slot SHALL be an ordered set of
one or more frames at the slot's declared pixel dimensions, and the host SHALL render the slot at
those dimensions.

#### Scenario: Copy comes from the active theme

- **WHEN** the host renders a label, button, overlay, or advisory
- **THEN** the string is read from `ACTIVE_THEME`, never hard-coded in the host

#### Scenario: Palette tokens drive styling

- **WHEN** the host builds component styles
- **THEN** colours come from the theme's palette tokens rather than fixed values

#### Scenario: Assets resolve from the theme

- **WHEN** the host renders a theme asset (player, enemy, Shiny)
- **THEN** the asset is located by the theme's `name` and assets map

#### Scenario: Declared art is rendered

- **WHEN** the host renders a normal or boss enemy, a Shiny variant, or the spawn popup
- **THEN** it displays the theme's declared art for that slot rather than a placeholder frame

#### Scenario: Authored art is not a placeholder

- **WHEN** the active theme's sprites are inspected
- **THEN** each sprite is recognisable character art with a distinct silhouette, and the frames of
  one action are visibly different from one another rather than recoloured flat blocks

#### Scenario: Missing slot fails loudly

- **WHEN** the host is asked for an asset slot the active theme does not declare
- **THEN** it fails with a descriptive error rather than rendering a silent blank

#### Scenario: Sprites are shown at their declared size

- **WHEN** a declared sprite is displayed
- **THEN** it is rendered at its source pixel dimensions (or an exact integer multiple) so the
  pixel art is not resampled and blurred

### Requirement: Theme animation cues drive transient sprite frames

The host SHALL consume the ordered engine events produced since the previous frame and SHALL
translate them into the active theme's declared animation cues, showing at most one transient
sequence per actor for the cue's declared duration and then returning that actor to its idle
sequence. A cue's declared value SHALL be an ordered frame sequence, and the host SHALL advance
through those frames over the cue's display duration. Idle sprites SHALL loop their idle frame
sequence continuously; an action cue SHALL play its sequence once and then return the actor to the
idle loop. Handling events SHALL NOT mutate engine state, retain event history, or block the
simulation loop.

#### Scenario: Idle sprites loop continuously

- **WHEN** an actor is idle and no cue is live
- **THEN** its sprite advances through the idle sequence's frames on a loop, restarting after the
  last frame

#### Scenario: Player attack cue animates the click source

- **WHEN** a damage event caused by a player click arrives
- **THEN** the cue selection attributes a `playerAttack` cue to the player target for its declared
  duration, and the host plays that cue's frame sequence on any player sprite it displays

#### Scenario: An action cue plays its sequence once

- **WHEN** an action cue is live for an actor
- **THEN** the host advances through that cue's frames in order, playing it once, and then returns
  the actor to its looping idle sequence

#### Scenario: Enemy reaction selects the boss frame on a boss stage

- **WHEN** a hit or kill event arrives for an enemy on a boss stage
- **THEN** the enemy sprite plays the boss sequence the theme declares for that cue

#### Scenario: Kill beats a same-batch hit

- **WHEN** one batch contains both a hit and a death for the same actor
- **THEN** only the higher-priority death sequence plays for that actor

#### Scenario: New enemy popup

- **WHEN** a new stage is entered
- **THEN** the global spawn popup displays the sequence the theme declares for `stageEntered` for
  its declared duration

#### Scenario: Zero duration disables a cue

- **WHEN** a cue's declared duration is zero
- **THEN** no transient sequence is played for that cue

#### Scenario: Events are discarded after handling

- **WHEN** a frame's events have been translated into cues
- **THEN** the host keeps no event history and the next frame starts from an empty batch

## ADDED Requirements

### Requirement: Reduced motion holds the rest frame of every sequence

While the operating system's reduced-motion preference is enabled, the host SHALL NOT loop or
advance any sprite sequence: every actor SHALL hold a single rest frame. Informational text SHALL
be unaffected.

#### Scenario: No sequence advances under reduced motion

- **WHEN** reduced motion is enabled
- **THEN** no idle sequence loops, no action cue advances through frames, and every sprite holds
  its rest frame

#### Scenario: Rest frame is stable

- **WHEN** reduced motion is enabled and engine events arrive
- **THEN** the sprite shown for an actor does not change between frames

### Requirement: Animation frame sequences are validated

The theme contract SHALL require every declared animation frame to exist on disk at its declared
size, fail loudly when a frame is missing or mis-sized, and keep the frame set identical across
every shipped theme, so a partially authored theme cannot ship.

#### Scenario: Every declared frame is present and correctly sized

- **WHEN** the theme asset check runs
- **THEN** it verifies every frame file exists and matches its declared pixel dimensions, reporting
  each missing or mis-sized frame with its path and actual-vs-expected size

#### Scenario: Missing frame fails loudly

- **WHEN** a theme declares a frame whose file is absent or the wrong size
- **THEN** the check exits non-zero with an actionable list rather than silently rendering blank

#### Scenario: Themes declare the same frame set

- **WHEN** the shipped themes are compared
- **THEN** every theme declares the same set of slots and the same number of frames per slot
