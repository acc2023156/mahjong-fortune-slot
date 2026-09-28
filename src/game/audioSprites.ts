/**
 * Audio sprite tables, all values [offsetMs, durationMs].
 *
 * general_audio.mp3: boundaries are the measured non-silent regions (−50 dB gate) of each
 * row in the user's sheet (gid 1673875040). Uses were confirmed by matching each region
 * against the reference screen recording (research/video/pg-mahjong ways.mov) and checking
 * the frames at every hit:
 *   ✔ confirmed — repeated hits, all at the same kind of moment
 *   ~ likely    — few or mixed hits
 *   ? guessed   — no reliable hit; used from the sheet label only
 */
export const soundSprites = {
  bigWinMain: [0, 20760], //            #1  ? sheet: BIG WIN MAIN
  bigWinEnd: [21040, 7850], //          #2  ? sheet: BIG WIN ENDING
  clickLong: [30060, 2110], //          #3  ? sheet: 普通點擊 (拉長音)
  coinRoll: [33070, 2190], //           #4  ~ win amount counting on the plaque
  coinRollEnd: [36080, 4720], //        #5  ~ counting finished
  swish: [41110, 780], //               #6  ? 咻
  wah: [42100, 820], //                 #7  ? 嘩
  sparkleRise: [43090, 5600], //        #8  ✔ each near-miss reel starts (4 hits, z≈35–41)
  bright: [49180, 2520], //             #9  ? 清亮
  button: [52110, 290], //              #10 ✔ button press (with SPIN / Start)
  promptRise: [53290, 1200], //         #11 ? 提示音
  drum: [55120, 870], //                #12 ? 鼓聲
  hollow: [56130, 1990], //             #13 ? 空聲
  laser: [59130, 480], //               #14 ? 雷射
  multiplierUp: [60180, 900], //        #15 ✔ multiplier rail steps up after a cascade
  highlightLight: [62160, 1860], //     #16 ~ plays with #24 when tiles settle
  rushUp: [65140, 1030], //             #17 ? 往上衝
  pin: [67150, 1010], //                #18 ~ plays with the SPIN press
  wildTransform: [69180, 1290], //      #19 ✔ gold tile turns into WILD
  dropStart: [71170, 1340], //          #20 ~ empty felt → tiles begin to fall
  dropAlt: [73170, 1550], //            #21 ~ around the drop
  drumRoll: [75180, 1890], //           #22 ? 督嚕督嚕
  lightCoins: [77180, 1750], //         #23 ? 燈ㄖ扔錢
  tilesLand: [79250, 1440], //          #24 ✔ reels settle / refill lands
  reelSpin: [81180, 1500], //           #25 ? 滾輪滾動
  stop: [83200, 280], //                #26 ? 停止
  reelStop: [84190, 150], //            #27 ? 滾輪停止 (very quiet)
  spinButton: [85210, 570], //          #28 ✔ SPIN press
  scatterLand: [87440, 1120], //        #30 ✔ 胡 lands
  metal: [89420, 550], //               #31 ? 金屬
  winHighlight: [90400, 1010], //       #32 ✔ win highlight → tiles turn into coins
  winPlaque: [93210, 750], //           #34 ? sheet: WIN plaque animation
  tong: [94210, 400], //                #35 ? 通
  huang: [95340, 300], //               #36 ? 晃
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
