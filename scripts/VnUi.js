import { Node } from '/engine/Node.js'
import { VN_CSS } from './VnStyle.js'

/**
 * VnUi — the DOM interface layer for 流年 · 雪中信.
 *
 * Owns every piece of text the player reads: the dialogue plate, speaker
 * plate, choices, the tension string, chapter cards, the letter mini-game,
 * the seven-day sequence, menus, the impression collection and ending stats.
 *
 * The Phaser canvas stays the "world" (Stage); this node is the "interface".
 * Advance / cancel / navigation are driven by Director polling inputMap, so
 * real keys and Runtime-API injected input behave identically.
 *
 * All overlays funnel through _overlay(), which returns
 * `{ panel, close(value), result }` — `result` always settles with the value
 * passed to `close()`, so callers never have to observe the DOM.
 */

function el(tag, cls, html) {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (html != null) n.innerHTML = html
  return n
}

export default class VnUi extends Node {
  ready() {
    const ui = this.sceneTree.ui
    this.ui = ui
    this.asset = (k) => ui.assetUrl(k)

    this._injectStyles()

    this.root = el('div')
    this.root.id = 'vn-root'
    ui.mount(this.root)

    this.busts = el('div', 'vn-busts')
    this.catcher = el('div', 'vn-catcher')
    this.snowEl = el('div', 'vn-snow')
    this.dialog = el('div', 'vn-dialog')
    this.choicesEl = el('div', 'vn-choices')
    this.cardEl = el('div', 'vn-card')
    this.curtainEl = el('div', 'vn-curtain')
    this.vignette = el('div', 'vn-vignette')
    this.flashEl = el('div', 'vn-flash')
    this.flashTextEl = el('div', 'vn-flashtext')
    this.hudEl = el('div', 'vn-hud')
    this.whisperEl = el('div', 'vn-whisper')
    this.titleEl = el('div', 'vn-title')
    this.overlayHost = el('div', 'vn-overlay-host')
    this.toastHost = el('div', 'vn-toast-host')
    this.pauseBtn = el('div', 'vn-pausebtn', '&#9776;')

    for (const n of [
      this.busts, this.catcher, this.snowEl, this.dialog, this.choicesEl,
      this.cardEl, this.curtainEl, this.vignette, this.flashEl, this.flashTextEl,
      this.hudEl, this.whisperEl, this.titleEl, this.pauseBtn, this.overlayHost, this.toastHost,
    ]) this.root.appendChild(n)

    this._buildHud()
    this._buildDialog()

    this.bustNodes = {}
    this._waiter = null
    this._typer = null
    this._typeTarget = ''
    this._choiceNodes = []
    this._choiceCursor = 0
    this._menuCursor = 0
    this._menuItems = []
    this._overlays = []
    this._tension = 0

    this.catcher.addEventListener('pointerdown', () => this.press())
    this.dialog.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.press() })
    this.pauseBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.emit('ui_pause') })
    this.root.appendChild(el('div', 'vn-vignette'))
  }

  /* ================================================================== *
   *  construction
   * ================================================================== */

  _injectStyles() {
    if (document.getElementById('vn-style')) return
    const s = document.createElement('style')
    s.id = 'vn-style'
    s.textContent = VN_CSS + `
      .vn-busts { position:absolute; inset:0; z-index:30; pointer-events:none; }
      .vn-busts * { pointer-events:none; }
      .vn-busts img {
        position:absolute; bottom:-16px; opacity:0;
        transition: opacity .62s ease, filter .5s ease, left .5s ease, right .5s ease;
        filter: drop-shadow(0 18px 34px rgba(0,0,0,.72));
      }
      .vn-busts img.dim { filter: brightness(.42) saturate(.55) drop-shadow(0 18px 34px rgba(0,0,0,.72)); }
      .vn-overlay-host, .vn-toast-host { position:absolute; inset:0; z-index:44; pointer-events:none; }
      .vn-overlay-host .vn-overlay, .vn-overlay-host .vn-overlay * { pointer-events:auto; }
      .vn-toast-host { z-index:45; }
    `
    document.head.appendChild(s)
  }

  _buildHud() {
    this.stringEl = el('div', 'vn-string')
    this.stringEl.innerHTML = `<svg viewBox="0 0 470 30" width="470" height="30">
      <path class="vn-str-path" d="M4,15 Q235,29 466,15"/>
      <line class="vn-str-tick" x1="10" y1="8" x2="10" y2="22"/>
      <line class="vn-str-tick" x1="17" y1="6" x2="17" y2="24"/>
      <line class="vn-str-tick" x1="453" y1="6" x2="453" y2="24"/>
      <line class="vn-str-tick" x1="460" y1="8" x2="460" y2="22"/>
      <rect class="vn-str-knot" x="230" y="10.5" width="10" height="10" transform="rotate(45 235 15.5)"/>
    </svg>`
    this.stringPath = this.stringEl.querySelector('.vn-str-path')
    this.hudWord = el('div', 'vn-hud-word', '')
    const row = el('div', 'vn-hud-row')
    row.append(
      el('div', 'vn-hud-side left', '靠近'),
      this.stringEl,
      el('div', 'vn-hud-side right', '远离'),
    )
    this.hudEl.append(this.hudWord, row)
  }

  _buildDialog() {
    this.nameEl = el('div', 'vn-name hidden')
    this.textEl = el('div', 'vn-text')
    this.contEl = el('div', 'vn-continue')
    this.dialog.append(this.nameEl, this.textEl, this.contEl)

    const css = document.createElement('style')
    css.textContent = `
      .vn-dialog { border-image-source: url("${this.asset('ui-panel-lg')}"); }
      .vn-panel  { border-image-source: url("${this.asset('ui-panel-lg')}"); }
      .vn-choice { border-image-source: url("${this.asset('ui-row-idle')}"); }
      .vn-choice:hover, .vn-choice.sel { border-image-source: url("${this.asset('ui-row-hi')}"); }
      .vn-btn { border-image-source: url("${this.asset('ui-row-idle')}"); }
      .vn-btn:hover, .vn-btn.sel { border-image-source: url("${this.asset('ui-row-hi')}"); }
      .vn-imp { background-image: none; }
    `
    document.head.appendChild(css)
  }

  /* ================================================================== *
   *  input plumbing — called from Director each frame
   * ================================================================== */

  press() {
    const w = this._waiter
    if (!w) return
    if (w.kind === 'say') {
      if (this._typer) { this._finishTyping(); return }
      this._resolveWaiter(undefined)
      return
    }
    if (w.kind === 'choice') { this._commitChoice(this._choiceCursor); return }
    if (w.kind === 'beat') { this._resolveWaiter(undefined); return }
    if (w.kind === 'days' && typeof w.onPress === 'function') { w.onPress(); return }
  }

  cancel() {
    const w = this._waiter
    if (!w) { this.emit('ui_pause'); return }
    if (w.kind === 'say' || w.kind === 'beat') { this._resolveWaiter(undefined); return }
    if (w.kind === 'days' && typeof w.onPress === 'function') { w.onPress(); return }
  }

  nav(dir) {
    const w = this._waiter
    if (!w) return
    if (w.kind === 'choice' && this._choiceNodes.length) {
      this._choiceCursor = (this._choiceCursor + dir + this._choiceNodes.length) % this._choiceNodes.length
      this._paintChoiceCursor()
      return
    }
    if (w.kind === 'menu' && this._menuItems.length) {
      let i = this._menuCursor
      for (let n = 0; n < this._menuItems.length; n++) {
        i = (i + dir + this._menuItems.length) % this._menuItems.length
        if (!this._menuItems[i].disabled) break
      }
      this._menuCursor = i
      this._paintMenuCursor()
    }
  }

  _resolveWaiter(value) {
    const w = this._waiter
    this._waiter = null
    if (this._typer) { clearInterval(this._typer); this._typer = null }
    this.dialog.classList.remove('ready', 'typing')
    w?.resolve(value)
  }

  /* ================================================================== *
   *  busts
   * ================================================================== */

  setBust(id, key, side = 'center', { dim = false } = {}) {
    const pos = side === 'left'
      ? { left: '110px', right: 'auto', marginLeft: '0' }
      : side === 'right'
        ? { left: 'auto', right: '110px' }
        : { left: '50%', right: 'auto', marginLeft: '-260px' }

    let node = this.bustNodes[id]
    if (!node) {
      const img = el('img')
      img.style.height = '540px'
      Object.assign(img.style, pos)
      img.style.opacity = '0'
      this.busts.appendChild(img)
      node = { img, key: null }
      this.bustNodes[id] = node
      requestAnimationFrame(() => { img.style.opacity = '1' })
    } else {
      Object.assign(node.img.style, pos)
      node.img.style.opacity = '1'
    }
    if (node.key !== key) {
      node.img.style.opacity = '0'
      const onLoad = () => { node.img.style.opacity = '1' }
      node.img.onload = onLoad
      node.img.src = this.asset(key)
      node.key = key
      if (node.img.complete) onLoad()
    }
    node.img.classList.toggle('dim', !!dim)
  }

  dimBusts(exceptId) {
    for (const [id, n] of Object.entries(this.bustNodes)) {
      n.img.classList.toggle('dim', !!exceptId && id !== exceptId)
    }
  }

  clearBusts() {
    for (const id of Object.keys(this.bustNodes)) {
      const img = this.bustNodes[id].img
      img.style.opacity = '0'
      setTimeout(() => img.remove(), 700)
      delete this.bustNodes[id]
    }
  }

  /* ================================================================== *
   *  dialogue
   * ================================================================== */

  say({ name = null, text = '', style = 'voice', speed = 24 } = {}) {
    this.choicesEl.replaceChildren()
    this.dialog.classList.add('on')
    this.dialog.classList.remove('ready', 'typing')
    if (name) {
      this.nameEl.textContent = name
      this.nameEl.classList.remove('hidden')
    } else {
      this.nameEl.classList.add('hidden')
    }
    this.textEl.className = `vn-text ${style}`
    return new Promise((resolve) => {
      this._waiter = { kind: 'say', resolve }
      this._typeOut(text, speed, () => this.dialog.classList.add('ready'))
    })
  }

  _typeOut(text, speed, onDone) {
    if (this._typer) { clearInterval(this._typer); this._typer = null }
    this._typeTarget = text
    const chars = Array.from(text)
    this.textEl.textContent = ''
    if (speed <= 0) {
      this.textEl.textContent = text
      this.textEl.classList.remove('typing')
      onDone?.()
      return
    }
    this.textEl.classList.add('typing')
    let i = 0
    this._typer = setInterval(() => {
      i += 1
      this.textEl.textContent = chars.slice(0, i).join('')
      if (i >= chars.length) {
        clearInterval(this._typer)
        this._typer = null
        this.textEl.classList.remove('typing')
        onDone?.()
      }
    }, speed)
  }

  _finishTyping() {
    if (this._typer) { clearInterval(this._typer); this._typer = null }
    this.textEl.textContent = this._typeTarget
    this.textEl.classList.remove('typing')
    this.dialog.classList.add('ready')
  }

  hideDialog() { this.dialog.classList.remove('on', 'ready', 'typing') }

  beat({ showDialog = false } = {}) {
    this.choicesEl.replaceChildren()
    if (!showDialog) this.hideDialog()
    else this.dialog.classList.add('on')
    return new Promise((resolve) => { this._waiter = { kind: 'beat', resolve } })
  }

  pause(ms) { return new Promise((r) => setTimeout(r, ms)) }

  /* ================================================================== *
   *  choices
   * ================================================================== */

  choices(list, { head = '' } = {}) {
    // the choice list replaces the dialogue plate while it is open
    this.dialog.classList.remove('on', 'ready', 'typing')
    this.choicesEl.replaceChildren()
    if (head) this.choicesEl.appendChild(el('div', 'vn-choices-head', head))
    this._choiceNodes = []
    const frag = document.createDocumentFragment()
    list.forEach((opt, i) => {
      const kind = opt.costKind || ''
      const n = el('div', `vn-choice ${kind}`)
      n.style.animationDelay = `${i * 70}ms`
      n.innerHTML = `<span>${opt.text}</span>${opt.cost ? `<span class="cost">${opt.cost}</span>` : ''}`
      n.addEventListener('pointerdown', (e) => { e.stopPropagation(); this._choiceCursor = i; this._commitChoice(i) })
      n.addEventListener('pointerenter', () => { this._choiceCursor = i; this._paintChoiceCursor() })
      frag.appendChild(n)
      this._choiceNodes.push(n)
    })
    this.choicesEl.appendChild(frag)
    this._choiceCursor = 0
    this._paintChoiceCursor()
    return new Promise((resolve) => { this._waiter = { kind: 'choice', resolve } })
  }

  _paintChoiceCursor() {
    this._choiceNodes.forEach((n, i) => n.classList.toggle('sel', i === this._choiceCursor))
  }

  _commitChoice(i) {
    if (!this._waiter || this._waiter.kind !== 'choice') return
    const nodes = this._choiceNodes
    nodes.forEach((n) => { n.style.pointerEvents = 'none' })
    if (nodes[i]) nodes[i].classList.add('sel')
    const value = i
    setTimeout(() => {
      this.choicesEl.replaceChildren()
      this._resolveWaiter(value)
    }, 180)
  }

  /* ================================================================== *
   *  tension string
   * ================================================================== */

  showString(on = true) { this.hudEl.classList.toggle('on', !!on) }

  setTension(t, { animate = true } = {}) {
    const v = Math.max(0, Math.min(1, t))
    this._tension = v
    const sag = 14 * (1 - v)
    const d = `M4,15 Q235,${(15 + sag).toFixed(2)} 466,15`
    if (animate) this._animateSag(d)
    else this.stringPath.setAttribute('d', d)
    this.stringEl.style.setProperty('--amp', (v * v * 3.4).toFixed(2))
    this.stringEl.classList.toggle('quiver', v > 0.55)
    this.stringEl.classList.toggle('warm', v > 0.34 && v <= 0.72)
    this.stringEl.classList.toggle('hot', v > 0.72)
    const word = v >= 0.97 ? '将断' : v >= 0.8 ? '绷紧' : v >= 0.55 ? '拉直' : v >= 0.28 ? '微紧' : '松弛'
    this.hudWord.textContent = `弦 · ${word}`
    this.hudWord.style.color = v > 0.72 ? '#b03a30' : v > 0.34 ? '#c9a961' : '#6f8ba8'
  }

  _animateSag(to) {
    const m0 = /Q235,([\d.]+)/.exec(this.stringPath.getAttribute('d') || '')
    const m1 = /Q235,([\d.]+)/.exec(to)
    if (!m0 || !m1) { this.stringPath.setAttribute('d', to); return }
    const y0 = parseFloat(m0[1])
    const y1 = parseFloat(m1[1])
    const t0 = performance.now()
    const step = () => {
      const k = Math.min(1, (performance.now() - t0) / 900)
      const e = 1 - Math.pow(1 - k, 3)
      this.stringPath.setAttribute('d', `M4,15 Q235,${(y0 + (y1 - y0) * e).toFixed(2)} 466,15`)
      if (k < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }

  get tension() { return this._tension }

  /* ================================================================== *
   *  atmosphere
   * ================================================================== */

  snow(level = 'off') {
    this.snowEl.classList.toggle('on', level !== 'off')
    this.snowEl.classList.toggle('heavy', level === 'heavy' || level === 'storm')
  }

  curtain(on, ms = 800) {
    this.curtainEl.style.transition = `opacity ${ms}ms ease`
    this.curtainEl.classList.toggle('on', !!on)
    return new Promise((r) => setTimeout(r, ms))
  }

  /** Faint centred line used by the silence beats. */
  whisper(text) {
    this.whisperEl.textContent = text || ''
    this.whisperEl.classList.toggle('on', !!text)
  }

  flash(kind = 'cold') {
    this.flashEl.className = `vn-flash ${kind}`
    void this.flashEl.offsetWidth
    this.flashEl.classList.add('play')
  }

  async flashText(text, kind = 'cold', hold = 1600) {
    this.flashTextEl.className = `vn-flashtext ${kind} on`
    this.flashTextEl.innerHTML = `<span>${text}</span>`
    await this.pause(hold)
    this.flashTextEl.classList.remove('on')
    await this.pause(1000)
  }

  toast(msg, ms = 2000) {
    const t = el('div', 'vn-toast', msg)
    this.toastHost.replaceChildren(t)
    setTimeout(() => {
      t.classList.add('out')
      setTimeout(() => t.remove(), 600)
    }, ms)
  }

  /* ================================================================== *
   *  chapter card
   * ================================================================== */

  async chapterCard({ num = '', title = '', sub = '' } = {}) {
    this.hideDialog()
    this.cardEl.innerHTML = `
      <div class="num">${num}</div>
      <div class="line"></div>
      <div class="ttl">${title}</div>
      <div class="line"></div>
      ${sub ? `<div class="sub">${sub}</div>` : ''}
      <div class="hint">点击继续</div>`
    await this.pause(40)
    this.cardEl.classList.add('on')
    await new Promise((resolve) => { this._waiter = { kind: 'beat', resolve } })
    this.cardEl.classList.remove('on')
    await this.pause(620)
  }

  /* ================================================================== *
   *  generic overlay
   * ================================================================== */

  /**
   * @returns {{ panel: HTMLElement, close: (v:any)=>void, result: Promise<any> }}
   */
  _overlay(inner, { width = null, className = 'vn-panel' } = {}) {
    const ov = el('div', 'vn-overlay')
    const panel = el('div', className)
    if (width) panel.style.width = `${width}px`
    panel.innerHTML = inner
    ov.appendChild(panel)
    // stop clicks inside the panel from falling through to the catcher
    ov.addEventListener('pointerdown', (e) => e.stopPropagation())
    this.overlayHost.appendChild(ov)
    this._overlays.push(ov)

    let settled = false
    let resolveFn = () => {}
    const result = new Promise((r) => { resolveFn = r })
    const close = (value) => {
      if (settled) return
      settled = true
      ov.remove()
      this._overlays = this._overlays.filter((o) => o !== ov)
      resolveFn(value)
    }
    return { ov, panel, close, result }
  }

  /* ================================================================== *
   *  menu
   * ================================================================== */

  menu({ title = '', items = [] } = {}) {
    const { panel, close, result } = this._overlay(`<h2>${title}</h2><div class="vn-menu-list"></div>`)
    const list = panel.querySelector('.vn-menu-list')
    this._menuItems = []
    items.forEach((it) => {
      const b = el('button', `vn-btn ${it.disabled ? 'dim' : ''}`,
        `${it.label}${it.sub ? `<span class="sub">${it.sub}</span>` : ''}`)
      if (!it.disabled) {
        b.addEventListener('pointerdown', (e) => { e.stopPropagation(); close(it.id) })
        b.addEventListener('pointerenter', () => {
          this._menuCursor = this._menuItems.indexOf(it)
          this._paintMenuCursor()
        })
      }
      list.appendChild(b)
      this._menuItems.push({ ...it, node: b })
    })
    this._menuCursor = Math.max(0, this._menuItems.findIndex((i) => !i.disabled))
    this._paintMenuCursor()

    const w = { kind: 'menu', resolve: close }
    this._waiter = w
    result.then(() => { if (this._waiter === w) this._waiter = null })
    return result
  }

  _paintMenuCursor() {
    this._menuItems.forEach((it, i) => it.node.classList.toggle('sel', i === this._menuCursor))
  }

  menuResolve() {
    const it = this._menuItems?.[this._menuCursor]
    if (it && !it.disabled) {
      it.node.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    }
  }

  /* ================================================================== *
   *  impressions
   * ================================================================== */

  impressions({ list = [], owned = new Set() } = {}) {
    const cells = list.map((it) => {
      const has = owned.has(it.id)
      return `<div class="vn-imp ${has ? '' : 'locked'}">
        <div class="t">${has ? it.title : '· · ·'}</div>
        <div class="q">${has ? it.text : '尚未拾起'}</div>
      </div>`
    }).join('')
    const body = list.length
      ? `<div class="vn-imp-grid">${cells}</div>`
      : '<div class="vn-empty">还没有拾起任何留印。<br>在雪地里多走一走。</div>'
    const { panel, close, result } = this._overlay(`<h2>留印 · 雪中的字</h2>${body}`, { width: 1010 })
    const foot = el('div')
    foot.style.cssText = 'display:flex;justify-content:center;margin-top:26px'
    const b = el('button', 'vn-btn', '合上')
    b.style.width = '260px'
    b.addEventListener('pointerdown', (e) => { e.stopPropagation(); close('ok') })
    foot.appendChild(b)
    panel.appendChild(foot)
    return result
  }

  /* ================================================================== *
   *  history log
   * ================================================================== */

  history(rows = []) {
    const body = rows.map((r) => r.name
      ? `<div class="row"><div class="who">${r.name}</div><div class="say">${r.text}</div></div>`
      : `<div class="row"><div class="say nar">${r.text}</div></div>`).join('')
    const { panel, close, result } = this._overlay(
      `<h2>回想</h2><div class="vn-log">${body || '<div class="vn-empty">还没有可以回想的事。</div>'}</div>`,
      { width: 1030 },
    )
    const foot = el('div')
    foot.style.cssText = 'display:flex;justify-content:center;margin-top:22px'
    const b = el('button', 'vn-btn', '收起')
    b.style.width = '240px'
    b.addEventListener('pointerdown', (e) => { e.stopPropagation(); close('ok') })
    foot.appendChild(b)
    panel.appendChild(foot)
    const log = panel.querySelector('.vn-log')
    if (log) log.scrollTop = log.scrollHeight
    return result
  }

  /* ================================================================== *
   *  mini-game : the five-line letter
   * ================================================================== */

  /**
   * The player must choose exactly `need` lines from a pool and post it.
   * @returns {Promise<string[]>} chosen ids (canonical order preserved)
   */
  letterGame({ pool = [], need = 5, title = '', intro = '' } = {}) {
    const { panel, close, result } = this._overlay(
      `<div class="vn-letter">
         <div class="paper">
           <div class="head">${title}</div>
           <div class="rule"></div>
           <div class="pool"></div>
           <div class="draft"><div class="ph">${intro}</div></div>
           <div class="foot">
             <div class="count">已写下 <b>0</b> / ${need} 行</div>
             <div class="actions">
               <button class="vn-lbtn ghost">全部擦掉</button>
               <button class="vn-lbtn send" disabled>寄出这封信</button>
             </div>
           </div>
         </div>
       </div>`,
      { className: 'vn-panel vn-letter-panel', width: 1040 },
    )

    const poolEl = panel.querySelector('.pool')
    const draftEl = panel.querySelector('.draft')
    const countEl = panel.querySelector('.count b')
    const sendBtn = panel.querySelector('.send')
    const clearBtn = panel.querySelector('.ghost')
    const picked = []

    const refresh = () => {
      countEl.textContent = String(picked.length)
      sendBtn.disabled = picked.length !== need
      draftEl.innerHTML = picked.length
        ? picked.map((id) => {
          const item = pool.find((p) => p.id === id)
          const struck = item.struck ? `<span class="sc">${item.struck}</span>` : ''
          return `<div class="ln">${item.text}${struck}</div>`
        }).join('')
        : `<div class="ph">${intro}</div>`
      poolEl.querySelectorAll('.vn-line').forEach((n) => {
        n.classList.toggle('picked', picked.includes(n.dataset.id))
      })
    }

    pool.forEach((p) => {
      const n = el('button', 'vn-line', p.text)
      n.dataset.id = p.id
      n.addEventListener('pointerdown', (e) => {
        e.stopPropagation()
        const i = picked.indexOf(p.id)
        if (i >= 0) picked.splice(i, 1)
        else if (picked.length < need) picked.push(p.id)
        else { picked.shift(); picked.push(p.id) }
        refresh()
      })
      poolEl.appendChild(n)
    })
    clearBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); picked.length = 0; refresh() })
    sendBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation()
      if (sendBtn.disabled) return
      close([...picked])
    })
    refresh()
    return result
  }

  /* ================================================================== *
   *  mini-game : seven days
   * ================================================================== */

  sevenDays({ days = [] } = {}) {
    const { panel, close, result } = this._overlay(
      `<div class="vn-days">
         <div class="track"></div>
         <div class="body"></div>
         <div class="vn-whole"><div class="lbl">完整感</div><div class="bar"><i style="width:0%"></i></div></div>
         <div style="display:flex;justify-content:center;margin-top:26px" class="foot"></div>
       </div>`,
      { className: 'vn-panel vn-days-panel', width: 940 },
    )

    const trackEl = panel.querySelector('.track')
    const bodyEl = panel.querySelector('.body')
    const barEl = panel.querySelector('.bar i')
    const footEl = panel.querySelector('.foot')
    days.forEach((d) => trackEl.appendChild(el('div', 'vn-day-dot', `<span>${d.day}</span>`)))
    const dots = [...trackEl.children]

    let idx = -1
    const show = () => {
      idx += 1
      if (idx >= days.length) {
        this._waiter = null
        close('done')
        return
      }
      const d = days[idx]
      dots.forEach((n, i) => {
        n.classList.toggle('done', i < idx)
        n.classList.toggle('now', i === idx)
      })
      bodyEl.innerHTML = d.whisper
        ? `${d.text}<br><span class="whisper">${d.whisper}</span>`
        : d.text
      barEl.style.width = `${Math.round((d.whole ?? ((idx + 1) / days.length)) * 100)}%`
      footEl.innerHTML = `<button class="vn-lbtn">${d.ask || '继续'}</button>`
      footEl.querySelector('button').addEventListener('pointerdown', (e) => { e.stopPropagation(); show() })
      this._waiter = { kind: 'days', onPress: show }
    }
    show()
    return result
  }

  /* ================================================================== *
   *  final choice
   * ================================================================== */

  /** @returns {Promise<string>} the chosen option id */
  finalChoice({ prompt = '', options = [] } = {}) {
    const { panel, close, result } = this._overlay(
      `<div class="vn-final">
         <div class="item"><img alt="" /></div>
         <div class="prompt">${prompt}</div>
         <div class="two"></div>
       </div>`,
      { className: 'vn-panel vn-final-panel', width: 980 },
    )
    panel.querySelector('img').src = this.asset('item-cross')
    const two = panel.querySelector('.two')
    options.forEach((o) => {
      const b = el('button', 'vn-btn', o.label)
      b.addEventListener('pointerdown', (e) => { e.stopPropagation(); close(o.id) })
      two.appendChild(b)
    })
    return result
  }

  /* ================================================================== *
   *  ending stats
   * ================================================================== */

  statsPanel({ rows = [], quote = '' } = {}) {
    const body = rows.map((r) => `<div class="vn-stat"><span class="k">${r.k}</span><span class="v">${r.v}${r.unit ? `<small>${r.unit}</small>` : ''}</span></div>`).join('')
    const { panel, close, result } = this._overlay(
      `<h2>这一场雪</h2><div class="vn-stats"><div>${body}</div>${quote ? `<div class="quote">${quote}</div>` : ''}</div>`,
      { className: 'vn-panel vn-stats-panel', width: 760 },
    )
    const foot = el('div')
    foot.style.cssText = 'display:flex;justify-content:center;margin-top:26px'
    const b = el('button', 'vn-btn', '回到雪里')
    b.style.width = '280px'
    b.addEventListener('pointerdown', (e) => { e.stopPropagation(); close('ok') })
    foot.appendChild(b)
    panel.appendChild(foot)
    return result
  }

  /* ================================================================== *
   *  title
   * ================================================================== */

  title({ hasSave = false, impressions = 0, total = 0, canContinue = true } = {}) {
    this.titleEl.innerHTML = `
      <div class="mark"><i></i><i></i></div>
      <h1>流 年</h1>
      <div class="sub">雪 中 信</div>
      <div class="menu"></div>
      <div class="foot">LETTERS IN SNOW&nbsp;&nbsp;·&nbsp;&nbsp;改编自同名小说&nbsp;&nbsp;·&nbsp;&nbsp;全九章</div>`
    const menu = this.titleEl.querySelector('.menu')

    let resolveFn = () => {}
    const result = new Promise((r) => { resolveFn = r })

    const items = [
      { id: 'new', label: canContinue ? '重新开始' : '开 始' },
      {
        id: 'continue',
        label: '继 续',
        sub: hasSave ? null : '（还没有落过一场雪）',
        disabled: !hasSave,
      },
      { id: 'impressions', label: '留 印', sub: `已拾起 ${impressions} / ${total}` },
      { id: 'about', label: '关 于 这 场 雪' },
    ]
    const nodes = []
    items.forEach((it) => {
      const b = el('button', `vn-btn ${it.disabled ? 'dim' : ''}`,
        `${it.label}${it.sub ? `<span class="sub">${it.sub}</span>` : ''}`)
      if (!it.disabled) {
        b.addEventListener('pointerdown', (e) => { e.stopPropagation(); resolveFn(it.id) })
        b.addEventListener('pointerenter', () => {
          nodes.forEach((n) => n.b.classList.remove('sel'))
          b.classList.add('sel')
        })
      }
      menu.appendChild(b)
      nodes.push({ id: it.id, b, disabled: !!it.disabled })
    })

    this._titleNodes = nodes
    this._titleCursor = Math.max(0, nodes.findIndex((n) => !n.disabled))
    this._paintTitleCursor()

    this.titleEl.style.transition = 'opacity 1.5s ease'
    this.titleEl.classList.add('on')
    this.titleEl.style.opacity = '0'
    requestAnimationFrame(() => { this.titleEl.style.opacity = '1' })
    return result
  }

  titleResolve() {
    const n = this._titleNodes?.[this._titleCursor]
    if (!n || n.disabled) return
    const ev = new PointerEvent('pointerdown', { bubbles: true })
    n.b.dispatchEvent(ev)
  }

  _paintTitleCursor() {
    (this._titleNodes || []).forEach((n, i) => n.b.classList.toggle('sel', i === this._titleCursor))
  }

  titleNav(dir) {
    const nodes = this._titleNodes || []
    if (!nodes.length) return
    let i = this._titleCursor
    for (let n = 0; n < nodes.length; n++) {
      i = (i + dir + nodes.length) % nodes.length
      if (!nodes[i].disabled) break
    }
    this._titleCursor = i
    this._paintTitleCursor()
  }

  hideTitle() {
    this.titleEl.style.opacity = '0'
    this.titleEl.classList.remove('on')
    setTimeout(() => { this.titleEl.innerHTML = ''; this._titleNodes = [] }, 900)
  }

  showPauseButton(on) { this.pauseBtn.classList.toggle('hidden', !on) }

  showingTitle() { return this.titleEl.classList.contains('on') }
}
