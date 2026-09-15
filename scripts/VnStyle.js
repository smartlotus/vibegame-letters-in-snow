/**
 * VnStyle — the DOM UI stylesheet for 流年 · 雪中信.
 *
 * Shipped as a JS module (not a bare .css file) so it is guaranteed to travel
 * with the `scripts/` runtime root in the release branch.
 *
 * Palette is sampled from the game's own art so the UI sits with the scenes:
 *   ink      #05070c    night canvas
 *   panel    #0b1018    dialogue plate
 *   edge     #2b2318    warm wood/gold shadow line
 *   gold     #c9a961    primary ornament gold
 *   gold-lo  #8c7239    dim gold
 *   bone     #d8d2c4    body text
 *   dim      #8b8574    secondary text
 *   cold     #6f8ba8    snow / distance
 *   blood    #b03a30    the snapped string
 */

export const VN_CSS = `
@keyframes vn-blink { 0%,55% { opacity: .85 } 56%,100% { opacity: 0 } }
@keyframes vn-snowdrift { from { background-position: 0 0, 0 0 } to { background-position: -240px 720px, 160px 520px } }
@keyframes vn-quiver {
  0%   { transform: translateY(0px) }
  25%  { transform: translateY(calc(var(--amp) * -1px)) }
  50%  { transform: translateY(calc(var(--amp) * 0.4px)) }
  75%  { transform: translateY(calc(var(--amp) * -0.7px)) }
  100% { transform: translateY(0px) }
}
@keyframes vn-rise { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: translateY(0) } }
@keyframes vn-risefast { from { opacity: 0; transform: translateY(7px) } to { opacity: 1; transform: translateY(0) } }
@keyframes vn-fade { from { opacity: 0 } to { opacity: 1 } }
@keyframes vn-snap {
  0%   { opacity: 0 }
  8%   { opacity: 1 }
  20%  { opacity: .2 }
  30%  { opacity: 1 }
  100% { opacity: 0 }
}
@keyframes vn-breathe { 0%,100% { opacity: .34 } 50% { opacity: .72 } }
@keyframes vn-slowpush { from { transform: scale(1) } to { transform: scale(1.055) } }

#vn-root {
  position: absolute; inset: 0; overflow: hidden;
  font-family: "Source Han Serif CN", "Source Han Serif SC", "Noto Serif CJK SC",
               "Songti SC", "STSong", "SimSun", Georgia, "Times New Roman", serif;
  color: #d8d2c4;
  -webkit-font-smoothing: antialiased;
}
#vn-root * { box-sizing: border-box; }

/* ---------- vignette + grain over everything ---------- */
.vn-vignette {
  position: absolute; inset: 0; pointer-events: none; z-index: 40;
  background:
    radial-gradient(120% 85% at 50% 42%, rgba(0,0,0,0) 42%, rgba(0,0,0,.55) 100%),
    linear-gradient(to bottom, rgba(4,6,11,.42) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 74%, rgba(4,6,11,.5) 100%);
}

/* ---------- click catcher ---------- */
.vn-catcher { position: absolute; inset: 0; z-index: 30; pointer-events: auto; }

/* ---------- top HUD : the taut string ---------- */
.vn-hud {
  position: absolute; top: 18px; left: 0; right: 0; z-index: 34;
  display: flex; flex-direction: column; align-items: center; gap: 7px;
  opacity: 0; transition: opacity .9s ease;
}
.vn-hud.on { opacity: 1; }
.vn-hud-row {
  display: flex; align-items: center; justify-content: center; gap: 18px;
}
.vn-hud-side {
  font-size: 15px; letter-spacing: .34em; color: #8b8574;
  text-indent: .34em;
}
.vn-hud-side.left  { color: #9fb6c9; }
.vn-hud-side.right { color: #9fb6c9; }
.vn-hud-word {
  font-size: 12px; letter-spacing: .42em; color: #8c7239; text-indent: .42em;
  transition: color .6s ease; line-height: 1;
}
.vn-string {
  position: relative; width: 470px; height: 30px; overflow: visible;
}
.vn-string svg { width: 100%; height: 100%; overflow: visible; display: block; }
.vn-string .vn-str-path {
  fill: none; stroke: #6f8ba8; stroke-width: 1.5; stroke-linecap: round;
  transition: stroke .8s ease, stroke-width .8s ease;
  filter: drop-shadow(0 0 4px rgba(111,139,168,.5));
}
.vn-string.warm .vn-str-path { stroke: #c9a961; filter: drop-shadow(0 0 5px rgba(201,169,97,.55)); }
.vn-string.hot  .vn-str-path { stroke: #b03a30; stroke-width: 2.1; filter: drop-shadow(0 0 7px rgba(176,58,48,.7)); }
.vn-string .vn-str-tick { stroke: #d8d2c4; stroke-width: 1.2; opacity: 0; }
.vn-string.hot .vn-str-tick { opacity: .85; }
.vn-string .vn-str-knot {
  fill: #0b1018; stroke: #c9a961; stroke-width: 1.6;
}
.vn-string.quiver svg { animation: vn-quiver 900ms ease-in-out infinite; }

/* ---------- dialogue ---------- */
.vn-dialog {
  position: absolute; left: 50%; bottom: 34px; transform: translateX(-50%);
  width: 1140px; min-height: 216px; z-index: 33;
  padding: 30px 46px 40px 46px;
  border: 30px solid transparent;
  border-image-slice: 58 fill;
  border-image-width: 30px;
  border-image-repeat: stretch;
  opacity: 0; transition: opacity .45s ease;
  pointer-events: none;
}
.vn-dialog.on { opacity: 1; pointer-events: auto; }

.vn-name {
  position: absolute; top: -46px; left: 40px;
  min-width: 130px; height: 44px; line-height: 40px;
  padding: 0 26px 0 30px;
  font-size: 20px; letter-spacing: .22em; text-indent: .22em;
  color: #e6d9b4;
  background: linear-gradient(180deg, #16120c 0%, #0a0806 100%);
  border: 1px solid #6b5a33;
  box-shadow: 0 0 0 1px #0a0806 inset, 0 6px 18px rgba(0,0,0,.6);
  text-shadow: 0 0 10px rgba(201,169,97,.35);
}
.vn-name::before {
  content: ""; position: absolute; left: 10px; top: 50%; width: 7px; height: 7px;
  transform: translateY(-50%) rotate(45deg);
  background: #c9a961; box-shadow: 0 0 6px rgba(201,169,97,.8);
}
.vn-name.hidden { display: none; }

.vn-text {
  font-size: 23px; line-height: 2.0; letter-spacing: .085em;
  color: #e2ddd0; text-shadow: 0 2px 10px rgba(0,0,0,.85);
  min-height: 92px; white-space: pre-wrap;
}
.vn-text .cursor { opacity: 0; }
.vn-text.typing .cursor { opacity: .8; }
.vn-text.narration { color: #b9b3a5; font-size: 21.5px; }
.vn-text.voice     { color: #c6cdd6; font-size: 21.5px; }
.vn-text.small     { font-size: 19px; color: #9d978a; }
.vn-text em { font-style: normal; color: #e6d9b4; }
.vn-text .hl { color: #c9a961; }

.vn-continue {
  position: absolute; right: 44px; bottom: 30px;
  width: 15px; height: 15px;
  border-right: 2px solid #c9a961; border-bottom: 2px solid #c9a961;
  transform: rotate(45deg) translate(-3px,-3px);
  animation: vn-blink 1.35s steps(1) infinite;
  opacity: 0;
}
.vn-dialog.ready .vn-continue { opacity: 1; }

/* ---------- choices ---------- */
.vn-choices {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%);
  width: 900px; z-index: 36; display: flex; flex-direction: column; gap: 14px;
  pointer-events: auto;
}
.vn-choices-head {
  text-align: center; font-size: 14px; letter-spacing: .5em; text-indent: .5em;
  color: #8c7239; margin-bottom: 10px;
}
.vn-choice {
  position: relative;
  padding: 17px 30px 17px 60px;
  font-size: 21px; line-height: 1.55; letter-spacing: .06em;
  color: #cbc5b7; cursor: pointer;
  border: 19px solid transparent;
  border-image-slice: 26 fill; border-image-width: 19px; border-image-repeat: stretch;
  animation: vn-risefast .34s ease both;
  transition: color .2s ease, transform .2s ease;
  text-shadow: 0 2px 8px rgba(0,0,0,.8);
}
.vn-choice::before {
  content: "◆"; position: absolute; left: 24px; top: 50%; transform: translateY(-50%);
  font-size: 11px; color: #5f5334; transition: color .2s ease;
}
.vn-choice:hover {
  color: #f0e6cd; transform: translateX(6px);
}
.vn-choice:hover::before { color: #e3cf9a; }
.vn-choice .cost {
  position: absolute; right: 26px; top: 50%; transform: translateY(-50%);
  font-size: 12.5px; letter-spacing: .18em; color: #6f8ba8; opacity: 0;
  transition: opacity .25s ease;
}
.vn-choice:hover .cost { opacity: .9; }
.vn-choice.lean .cost { color: #9fb6c9; }
.vn-choice.pull .cost { color: #c9a961; }

/* ---------- chapter card ---------- */
.vn-card {
  position: absolute; inset: 0; z-index: 38;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  background: radial-gradient(70% 60% at 50% 50%, #0a0e15 0%, #03050a 100%);
  opacity: 0; transition: opacity .8s ease; pointer-events: none;
}
.vn-card.on { opacity: 1; }
.vn-card .num {
  font-size: 15px; letter-spacing: .85em; text-indent: .85em; color: #8c7239; margin-bottom: 26px;
}
.vn-card .line { width: 200px; height: 1px; background: linear-gradient(90deg, transparent, #6b5a33, transparent); }
.vn-card .ttl {
  margin: 30px 0 20px; font-size: 46px; letter-spacing: .3em; text-indent: .3em;
  color: #e9dcb8; text-shadow: 0 0 26px rgba(201,169,97,.28);
}
.vn-card .sub { margin-top: 6px; font-size: 17px; letter-spacing: .38em; text-indent: .38em; color: #8b8574; }
.vn-card .hint {
  position: absolute; bottom: 78px; font-size: 12.5px; letter-spacing: .4em; text-indent: .4em; color: #5b5648;
  animation: vn-breathe 3.4s ease-in-out infinite;
}

/* ---------- overlays (menu / impressions / stats) ---------- */
.vn-overlay {
  position: absolute; inset: 0; z-index: 44;
  display: flex; align-items: center; justify-content: center;
  background: rgba(3,5,10,.86); backdrop-filter: blur(3px);
  animation: vn-fade .3s ease both; pointer-events: auto;
}
.vn-panel {
  position: relative;
  border: 40px solid transparent;
  border-image-slice: 58 fill; border-image-width: 40px; border-image-repeat: stretch;
  padding: 6px 54px 34px 54px;
  animation: vn-rise .38s ease both;
}
.vn-panel h2 {
  font-size: 17px; font-weight: 400; letter-spacing: .55em; text-indent: .55em;
  color: #c9a961; text-align: center; margin: 18px 0 26px;
}
.vn-panel h2::after {
  content: ""; display: block; width: 140px; height: 1px; margin: 16px auto 0;
  background: linear-gradient(90deg, transparent, #6b5a33, transparent);
}
.vn-menu-list { display: flex; flex-direction: column; gap: 12px; width: 380px; }
.vn-btn {
  position: relative; text-align: center;
  padding: 15px 18px; font-size: 19px; letter-spacing: .3em; text-indent: .3em;
  color: #cbc5b7; cursor: pointer; background: none; border: none;
  font-family: inherit;
  border: 17px solid transparent;
  border-image-slice: 26 fill; border-image-width: 17px; border-image-repeat: stretch;
  transition: color .18s ease, letter-spacing .25s ease;
}
.vn-btn:hover { color: #f2e8cf; letter-spacing: .4em; text-indent: .4em; }
.vn-btn.dim { color: #6b665a; cursor: default; }
.vn-btn.dim:hover { color: #6b665a; letter-spacing: .3em; text-indent: .3em; }
.vn-btn .sub { display: block; font-size: 12.5px; letter-spacing: .12em; text-indent: 0; color: #6f6a5c; margin-top: 5px; }

/* ---------- impressions (留印) ---------- */
.vn-imp-grid {
  width: 880px; max-height: 430px; overflow-y: auto; padding-right: 12px;
  display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
}
.vn-imp-grid::-webkit-scrollbar { width: 6px; }
.vn-imp-grid::-webkit-scrollbar-thumb { background: #2b2318; }
.vn-imp {
  padding: 15px 18px; background: rgba(18,22,31,.72);
  border-left: 2px solid #3a3222; animation: vn-risefast .3s ease both;
}
.vn-imp .t { font-size: 12.5px; letter-spacing: .26em; color: #8c7239; margin-bottom: 8px; }
.vn-imp .q { font-size: 16.5px; line-height: 1.75; color: #cdc7b9; }
.vn-imp.locked { opacity: .3; }
.vn-imp.locked .q { color: #57534a; }
.vn-empty { text-align: center; color: #5b5648; font-size: 16px; letter-spacing: .2em; padding: 60px 0; }

/* ---------- letter minigame ---------- */
.vn-letter { width: 1000px; }
.vn-letter .paper {
  position: relative; padding: 34px 46px;
  background:
    linear-gradient(180deg, rgba(226,219,201,.97), rgba(210,202,182,.97));
  color: #2a2620; box-shadow: 0 24px 60px rgba(0,0,0,.65);
}
.vn-letter .paper::after {
  content: ""; position: absolute; inset: 0; pointer-events: none;
  background: radial-gradient(90% 70% at 20% 10%, rgba(120,100,70,.16), transparent 70%);
}
.vn-letter .head { font-size: 14px; letter-spacing: .34em; color: #6d6350; margin-bottom: 16px; }
.vn-letter .rule { height: 1px; background: rgba(90,78,58,.35); margin: 4px 0 22px; }
.vn-letter .pool { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
.vn-line {
  padding: 11px 16px; font-size: 17.5px; line-height: 1.5; cursor: pointer;
  color: #3a352c; border: 1px solid rgba(90,78,58,.28);
  background: rgba(255,255,255,.22);
  transition: all .16s ease; position: relative; font-family: inherit;
  text-align: left;
}
.vn-line:hover { background: rgba(255,255,255,.55); border-color: #8a7a55; }
.vn-line.picked {
  background: rgba(58,52,40,.9); color: #e6dcc2; border-color: #3a3428;
}
.vn-line.picked::after { content: "已写下"; position: absolute; right: 12px; top: 50%; transform: translateY(-50%); font-size: 11px; letter-spacing: .2em; color: #b7a877; }
.vn-letter .draft {
  margin-top: 22px; min-height: 168px; padding: 18px 22px;
  background: rgba(255,255,255,.42); border: 1px dashed rgba(90,78,58,.42);
  font-size: 19px; line-height: 2.05; color: #241f18;
}
.vn-letter .draft .ph { color: #8d8471; font-size: 16px; letter-spacing: .12em; }
.vn-letter .draft .ln { animation: vn-risefast .28s ease both; }
.vn-letter .draft .ln .sc {
  color: #8d8471; font-size: 15px; margin-left: 8px; text-decoration: line-through;
}
.vn-letter .foot { display: flex; align-items: center; justify-content: space-between; margin-top: 20px; }
.vn-letter .count { font-size: 14px; letter-spacing: .26em; color: #6d6350; }
.vn-letter .count b { color: #7d4a3f; font-weight: 600; }
.vn-letter .actions { display: flex; gap: 12px; }
.vn-lbtn {
  padding: 12px 30px; font-family: inherit; font-size: 17px; letter-spacing: .26em; text-indent: .26em;
  background: #241f18; color: #ddd3ba; border: 1px solid #4a4234; cursor: pointer;
  transition: all .18s ease;
}
.vn-lbtn:hover { background: #332c21; color: #f3ead1; }
.vn-lbtn.ghost { background: transparent; color: #6d6350; }
.vn-lbtn.ghost:hover { color: #3a352c; }
.vn-lbtn:disabled { opacity: .35; cursor: default; }

/* ---------- seven days ---------- */
.vn-days { width: 860px; }
.vn-days .track { display: flex; gap: 8px; justify-content: center; margin-bottom: 26px; }
.vn-day-dot {
  width: 44px; height: 44px; line-height: 42px; text-align: center;
  font-size: 15px; color: #5b5648; border: 1px solid #2b2318; transform: rotate(45deg);
}
.vn-day-dot span { display: block; transform: rotate(-45deg); }
.vn-day-dot.done { color: #c9a961; border-color: #6b5a33; background: rgba(201,169,97,.08); }
.vn-day-dot.now  { color: #f0e6cd; border-color: #c9a961; box-shadow: 0 0 14px rgba(201,169,97,.35); }
.vn-days .body { font-size: 21px; line-height: 2.05; color: #d5cfc1; min-height: 150px; letter-spacing: .06em; }
.vn-days .body .whisper { color: #8b8574; font-size: 18.5px; }
.vn-whole { margin-top: 22px; display: flex; align-items: center; gap: 16px; }
.vn-whole .lbl { font-size: 12.5px; letter-spacing: .34em; color: #6f8ba8; }
.vn-whole .bar { position: relative; flex: 1; height: 3px; background: rgba(111,139,168,.16); }
.vn-whole .bar i {
  position: absolute; inset: 0 auto 0 0; display: block;
  background: linear-gradient(90deg, #6f8ba8, #cfd8e0);
  box-shadow: 0 0 10px rgba(159,182,201,.5);
  transition: width 1.1s cubic-bezier(.3,.9,.3,1);
}

/* ---------- final choice ---------- */
.vn-final { text-align: center; width: 900px; }
.vn-final .item { margin: 6px auto 22px; height: 150px; }
.vn-final .item img { height: 150px; filter: drop-shadow(0 0 22px rgba(201,169,97,.5)); }
.vn-final .prompt { font-size: 22px; line-height: 1.95; color: #d5cfc1; margin-bottom: 30px; letter-spacing: .06em; }
.vn-final .two { display: flex; gap: 22px; justify-content: center; }
.vn-final .two .vn-btn { flex: 1; max-width: 330px; }

/* ---------- ending stats ---------- */
.vn-stats { width: 660px; }
.vn-stat { display: flex; justify-content: space-between; align-items: baseline; padding: 13px 0; border-bottom: 1px solid rgba(43,35,24,.75); }
.vn-stat .k { font-size: 16px; letter-spacing: .2em; color: #8b8574; }
.vn-stat .v { font-size: 21px; color: #e6d9b4; letter-spacing: .1em; }
.vn-stat .v small { font-size: 13px; color: #8c7239; margin-left: 6px; }
.vn-stats .quote {
  margin-top: 28px; padding-top: 22px; border-top: 1px solid rgba(43,35,24,.75);
  font-size: 16px; line-height: 1.95; color: #9d978a; text-align: center; letter-spacing: .06em;
}

/* ---------- title ---------- */
.vn-title {
  position: absolute; inset: 0; z-index: 42;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding-bottom: 26px;
}
.vn-title > * { flex: 0 0 auto; }
.vn-title .mark { display: flex; width: 300px; height: 1px; }
.vn-title .mark i { flex: 1; background: linear-gradient(90deg, transparent, #8c7239); }
.vn-title .mark i:last-child { background: linear-gradient(90deg, #8c7239, transparent); }
.vn-title h1 {
  font-size: 66px; font-weight: 400; letter-spacing: .3em; text-indent: .3em; line-height: 1.1;
  color: #ece0bd; margin: 24px 0 0; text-shadow: 0 0 46px rgba(201,169,97,.3), 0 4px 20px rgba(0,0,0,.9);
  animation: vn-fade 1.7s ease both;
}
.vn-title .sub {
  margin-top: 18px; font-size: 16px; letter-spacing: .54em; text-indent: .54em; color: #a8a08c;
  animation: vn-fade 2.4s ease both;
}
.vn-title .menu {
  display: flex; flex-direction: column; gap: 8px; margin-top: 52px; width: 336px;
  animation: vn-fade 3s ease both;
}
.vn-title .menu .vn-btn {
  padding: 11px 16px; font-size: 17px; letter-spacing: .28em; text-indent: .28em;
  border-width: 15px; border-image-width: 15px;
}
.vn-title .menu .vn-btn .sub { margin-top: 2px; font-size: 11.5px; }
.vn-title .foot {
  position: absolute; bottom: 22px; font-size: 11.5px; letter-spacing: .26em; color: #4d4840;
}

/* ---------- pause button ---------- */
.vn-pausebtn {
  position: absolute; right: 22px; top: 20px; z-index: 35;
  width: 38px; height: 38px; line-height: 34px; text-align: center;
  font-size: 15px; color: #6b655a; cursor: pointer; pointer-events: auto;
  border: 1px solid rgba(107,90,51,.5); background: rgba(5,7,12,.55);
  transition: color .2s ease, border-color .2s ease;
}
.vn-pausebtn:hover { color: #c9a961; border-color: #c9a961; }
.vn-pausebtn.hidden { display: none; }

/* ---------- full-screen color flashes (snap / rebound) ---------- */
.vn-flash { position: absolute; inset: 0; z-index: 41; pointer-events: none; opacity: 0; }
.vn-flash.play { animation: vn-snap 1.15s ease-out both; }
.vn-flash.warm { background: radial-gradient(60% 60% at 50% 60%, rgba(214,176,110,.6), transparent 72%); }
.vn-flash.cold { background: linear-gradient(105deg, rgba(255,255,255,.92), rgba(150,190,225,.55) 40%, rgba(8,10,16,.9)); }
.vn-flashtext {
  position: absolute; inset: 0; z-index: 43; display: flex; align-items: center; justify-content: center;
  pointer-events: none; opacity: 0; transition: opacity 1.1s ease;
}
.vn-flashtext.on { opacity: 1; }
.vn-flashtext span { font-size: 62px; letter-spacing: .5em; text-indent: .5em; }
.vn-flashtext.cold span { color: #eef3f8; text-shadow: 0 0 40px rgba(190,220,255,.8); }
.vn-flashtext.warm span { color: #f2dfae; text-shadow: 0 0 40px rgba(214,176,110,.85); }

/* ---------- blackout curtain ---------- */
.vn-curtain { position: absolute; inset: 0; z-index: 31; background: #03050a; opacity: 0; transition: opacity .8s ease; pointer-events: none; }
.vn-curtain.on { opacity: 1; }
.vn-curtain.white { background: #eef2f6; }

/* ---------- soft whisper (silence beats) ---------- */
.vn-whisper {
  position: absolute; left: 0; right: 0; bottom: 90px; z-index: 33;
  text-align: center; font-size: 17px; letter-spacing: .34em; text-indent: .34em;
  color: #6b665a; opacity: 0; transition: opacity 1.2s ease; pointer-events: none;
}
.vn-whisper.on { opacity: .92; }

/* ---------- snow layer (CSS, above canvas) ---------- */
.vn-snow {
  position: absolute; inset: 0; z-index: 32; pointer-events: none; opacity: 0;
  transition: opacity 1.4s ease;
  background-image:
    radial-gradient(1.6px 1.6px at 22px 34px, rgba(255,255,255,.85), transparent 100%),
    radial-gradient(1.2px 1.2px at 128px 90px, rgba(255,255,255,.6), transparent 100%),
    radial-gradient(2px 2px at 210px 150px, rgba(255,255,255,.7), transparent 100%),
    radial-gradient(1.3px 1.3px at 60px 220px, rgba(255,255,255,.5), transparent 100%),
    radial-gradient(1.7px 1.7px at 300px 60px, rgba(255,255,255,.75), transparent 100%),
    radial-gradient(1.1px 1.1px at 170px 300px, rgba(255,255,255,.45), transparent 100%);
  background-size: 360px 360px, 420px 420px, 300px 300px, 480px 480px, 260px 260px, 400px 400px;
  background-repeat: repeat;
}
.vn-snow.on { opacity: .75; animation: vn-snowdrift 26s linear infinite; }
.vn-snow.heavy.on { opacity: .95; animation-duration: 14s; }

/* ---------- toast ---------- */
.vn-toast {
  position: absolute; left: 50%; top: 76px; transform: translateX(-50%);
  z-index: 45; padding: 11px 28px; font-size: 15px; letter-spacing: .26em; text-indent: .26em;
  color: #e6d9b4; background: rgba(8,11,17,.94); border: 1px solid rgba(107,90,51,.7);
  box-shadow: 0 10px 30px rgba(0,0,0,.7);
  animation: vn-risefast .3s ease both; pointer-events: none; white-space: nowrap;
}
.vn-toast.out { opacity: 0; transition: opacity .5s ease; }

/* ---------- history log ---------- */
.vn-log { width: 960px; max-height: 420px; overflow-y: auto; padding-right: 14px; }
.vn-log::-webkit-scrollbar { width: 6px; }
.vn-log::-webkit-scrollbar-thumb { background: #2b2318; }
.vn-log .row { margin-bottom: 17px; animation: vn-risefast .25s ease both; }
.vn-log .who { font-size: 13.5px; letter-spacing: .24em; color: #8c7239; margin-bottom: 5px; }
.vn-log .say { font-size: 17px; line-height: 1.82; color: #c3bdaf; }
.vn-log .say.nar { color: #8b8574; font-size: 15.5px; }
`
