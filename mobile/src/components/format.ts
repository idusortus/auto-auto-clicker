// format.ts — presentation-only formatters shared by the RN components.
//
// These are pure functions of their arguments plus the ACTIVE_THEME's duration
// copy. They hold no gameplay rules and no balance numbers: every number passed
// in already came from an engine getter or a state field.

import { ACTIVE_THEME } from '@auto-auto-clicker/engine-core';

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60_000;
const MINUTES_PER_HOUR = 60;

/** Format a whole number for display (floored, matching the web renderer). */
export function formatInt(value: number): string {
  return String(Math.floor(value));
}

/** Format a fractional contribution (crit/gold/power) as a percentage. */
export function formatPercent(fraction: number): string {
  return `${(fraction * 100).toFixed(1)}%`;
}

/** Format a damage multiplier without trailing zeros (e.g. 5, 2.5). */
export function formatMultiplier(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** Human duration copy, read entirely from the active theme. */
export function formatDuration(ms: number): string {
  const theme = ACTIVE_THEME;
  const totalMinutes = Math.floor(ms / MS_PER_MINUTE);
  if (totalMinutes < 1) return theme.ui.duration.lessThanMinute;
  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  const minutes = totalMinutes % MINUTES_PER_HOUR;
  if (hours < 1) return theme.ui.duration.minutes(String(minutes));
  if (minutes === 0) return theme.ui.duration.hours(String(hours));
  return theme.ui.duration.hoursMinutes(String(hours), String(minutes));
}

/** Stall duration: seconds under a minute, otherwise the shared duration format. */
export function formatStallDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < MS_PER_MINUTE) {
    const seconds = Math.max(0, Math.floor(ms / MS_PER_SECOND));
    return ACTIVE_THEME.ui.duration.seconds(String(seconds));
  }
  return formatDuration(ms);
}
