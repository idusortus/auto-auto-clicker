// layout.ts — theme-independent layout and typography for the RN components.
//
// Sizes, spacing, and font weights live here (the RN analogue of `/web`'s
// stylesheet layout rules). NO colour is written in this file: every colour
// comes from `theme.ts`, so swapping the theme never requires touching layout.

import { StyleSheet } from 'react-native';

export const layout = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  scroll: {
    gap: 12,
    paddingBottom: 32,
  },

  hud: {
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  hudStat: {
    alignItems: 'center',
    gap: 2,
  },
  hudLabel: {
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  hudValue: {
    fontSize: 20,
    fontWeight: '700',
  },

  boostPill: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  boostLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  boostTimer: {
    fontSize: 13,
  },

  advisory: {
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
    padding: 12,
  },
  advisoryKicker: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  advisoryBody: {
    fontSize: 14,
    lineHeight: 20,
  },

  stage: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  enemyButton: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    padding: 16,
    width: '100%',
  },
  bossBadge: {
    borderRadius: 4,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 2,
    textTransform: 'uppercase',
  },
  enemyName: {
    fontSize: 18,
    fontWeight: '700',
  },
  hpBar: {
    borderRadius: 999,
    height: 10,
    overflow: 'hidden',
    width: 220,
  },
  hpFill: {
    borderRadius: 999,
    height: '100%',
  },
  enemyHpText: {
    fontSize: 13,
  },
  hint: {
    fontSize: 13,
    textAlign: 'center',
  },

  shiny: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  shinyName: {
    fontSize: 13,
    fontWeight: '700',
  },

  panel: {
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    padding: 12,
  },
  panelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  panelTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  panelMeta: {
    fontSize: 12,
  },

  card: {
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 10,
  },
  cardRow: {
    gap: 8,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  cardStats: {
    fontSize: 12,
    lineHeight: 17,
  },
  cardMilestone: {
    fontSize: 12,
    fontWeight: '700',
  },

  upgradeRow: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    padding: 8,
  },
  upgradeName: {
    fontSize: 13,
    fontWeight: '700',
  },
  upgradeMeta: {
    fontSize: 12,
  },

  button: {
    alignItems: 'center',
    borderRadius: 8,
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonLabel: {
    fontSize: 13,
    fontWeight: '700',
  },

  bagRow: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
    padding: 8,
  },
  bagInfo: {
    flex: 1,
    fontSize: 12,
    lineHeight: 17,
  },
  bagTag: {
    fontSize: 12,
    fontWeight: '700',
  },

  achRow: {
    borderRadius: 8,
    borderWidth: 1,
    gap: 2,
    padding: 8,
  },
  achTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  achDesc: {
    fontSize: 12,
    lineHeight: 17,
  },

  overlayBackdrop: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  overlayCard: {
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
    padding: 18,
    width: '100%',
  },
  overlayTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  overlayBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  overlayNote: {
    fontSize: 12,
    lineHeight: 17,
  },
  overlayActions: {
    gap: 8,
  },
});
