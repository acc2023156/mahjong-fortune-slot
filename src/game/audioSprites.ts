/**
 * Audio sprite tables, all values [offsetMs, durationMs].
 *
 * general_audio.mp3 uses follow the user's sheet research/VOX_0930.xlsx
 * (分頁「音效分段時間點與用途明細表」, 2026-09-30): only rows with a written use are wired.
 * Offsets are the measured non-silent part of each row's time range (−50 dB gate).
 * Rows without a use yet (#11–14, #16–18, #22–24, #29, #35, #36) are intentionally not listed.
 */
export const soundSprites = {
  bigWinMain: [0, 20760], //        #1  BIG WIN MAIN
  bigWinEnd: [21040, 7850], //      #2  BIG WIN ENDING (after MAIN stops, incl. player skip)
  bigWinReturn: [30060, 2110], //   #3  back from BIG WIN: TOTAL WIN plaque animation
  countRoll: [33070, 2190], //      #4  FREE SPIN result screen: amount counting
  countEnd: [36080, 4720], //       #5  FREE SPIN result screen: counting stops
  freeCount: [41110, 780], //       #6  FREE SPIN remaining count changes
  freeCountLast: [42100, 820], //   #7  FREE SPIN count changes to the last spin
  nearMiss: [43090, 5600], //       #8  near miss after two 胡
  bigWinAppear: [49180, 2520], //   #9  BIG WIN appears (once)
  button: [52110, 290], //          #10 player presses a button
  tileClear: [60180, 900], //       #15 winning tiles turn and clear
  multiplier1: [69180, 1290], //    #19 x1→x2 / free x2→x4
  multiplier2: [71170, 1340], //    #20 x2→x3 / free x4→x6
  multiplier3: [73170, 1550], //    #21 x3→x5 / free x6→x10
  reelSpin: [81180, 1500], //       #25 reels spinning
  turboStop: [83200, 280], //       #26 TURBO: all reels stop together
  reelStop: [84190, 150], //        #27 one reel stops (once per reel)
  spinButton: [85210, 570], //      #28 SPIN button
  scatterLand: [87440, 1120], //    #30 a single 胡 appears
  winTurn: [89420, 550], //         #31 winning line: tiles turn into coins
  wildWinTurn: [90400, 1010], //    #32 winning line with WILD: tiles turn into coins
  uiClick: [91930, 260], //         #33 UI button click (sheet range; measures near-silent)
  collect: [93210, 750], //         #34 FREE SPIN result: COLLECT pressed
} as const

// vox.mp3 timings as corrected by the user on 2026-09-25 (from the MJW prototype).
export const voiceSprites = {
  hu: [0, 2490], multiplier_2: [2920, 780], multiplier_3: [3920, 780],
  multiplier_4: [4920, 880], multiplier_6: [5920, 950],
  multiplier_10: [6920, 1040], multiplier_5: [7980, 710],
  bamboo_two: [9000, 810], dots_two: [9960, 920], bamboo_five: [11000, 770],
  dots_five: [11970, 1520], eight: [14040, 850], white: [15000, 1120],
  green_dragon: [17000, 590], red_dragon: [18000, 1170],
  all_match_female: [19950, 1330], all_match_male: [21940, 1220],
  look_cards: [23870, 2800], hurry: [27000, 2950], request_eat: [30000, 2030],
  taunt: [32050, 1730], ready_hand: [34050, 2750], hurry_dialect: [36920, 1750],
  self_draw: [38950, 1750], comment_dialect: [40950, 1910],
  joke_dialect: [42970, 3320], long_taunt: [46900, 2890], final_taunt: [49950, 3050],
} as const

export type SoundName = keyof typeof soundSprites
export type VoiceName = keyof typeof voiceSprites
