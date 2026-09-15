/**
 * Walker — top-down four-direction walker used by the frame chapters
 * (路特走在雪地里) and by the interior beats.
 *
 * Plain JS (not a Node): Stage owns the Phaser scene and pumps update().
 * Stage exposes the walker's state through its own runtimeState(), which is
 * the pattern the engine guide asks for ("keep logic in plain JS, let a host
 * Node return the important values").
 *
 * Row layout of the walk sheets is documented in assets/char/walk-layout.json:
 *   rows = [down, left, right, up], 4 columns each.
 */

const ROWS = ['down', 'left', 'right', 'up']
const DIR_ROW = { down: 0, left: 1, right: 2, up: 3 }
const FRAME_COUNT = 4

export default class Walker {
  constructor(scene, { texture = 'walk-lute', depth = 20, displayHeight = 158, speed = 190 } = {}) {
    this.scene = scene
    this.texture = texture
    this.depth = depth
    this.displayHeight = displayHeight
    this.speed = speed

    this.sprite = null
    this.facing = 'down'
    this.moving = false
    this.active = false
    this.bounds = { x: 60, y: 120, w: 1160, h: 520 }
    this.hotspots = []
    this._hotspotHit = new Set()
    this._arrive = null
    this._footT = 0
    this._footprints = []
    this._playing = null
    this._handlers = { arrive: [], hotspot: [] }
    this._registerAnims()
  }

  _registerAnims() {
    for (const dir of ROWS) {
      const key = `${this.texture}-${dir}`
      if (this.scene.anims.exists(key)) continue
      const start = DIR_ROW[dir] * FRAME_COUNT
      this.scene.anims.create({
        key,
        frames: this.scene.anims.generateFrameNumbers(this.texture, { start, end: start + FRAME_COUNT - 1 }),
        frameRate: 8,
        repeat: -1,
      })
    }
    if (!this.scene.anims.exists('fx-footprint-walk')) {
      this.scene.anims.create({
        key: 'fx-footprint-walk',
        frames: this.scene.anims.generateFrameNumbers('fx-footprint', { start: 0, end: 7 }),
        frameRate: 10,
        repeat: 0,
      })
    }
  }

  on(evt, cb) {
    if (this._handlers[evt]) this._handlers[evt].push(cb)
  }

  _fire(evt, payload) {
    for (const cb of this._handlers[evt] || []) cb(payload)
  }

  spawn(x, y, facing = 'down') {
    if (!this.sprite) {
      this.sprite = this.scene.add.sprite(x, y, this.texture, DIR_ROW[facing] * FRAME_COUNT)
        .setOrigin(0.5, 1)
        .setDepth(this.depth)
      const frameH = this.sprite.height || 248
      this.sprite.setScale(this.displayHeight / frameH)
    } else {
      this.sprite.setPosition(x, y).setVisible(true)
    }
    this.facing = facing
    this._playing = null
    this._stopAnim()
    this.active = true
    this._arrive = null
    return this.sprite
  }

  despawn() {
    if (this.sprite) { this.sprite.destroy(); this.sprite = null }
    this._clearFootprints()
    this.active = false
    this.moving = false
    this._playing = null
    this._arrive = null
  }

  setBounds(rect) { this.bounds = { ...this.bounds, ...rect } }

  setSpeed(v) { this.speed = v }

  /** Scripted walk: glide to a point, then resolve. Movement input is ignored until it lands. */
  moveTo(x, y, onArrive) {
    this._arrive = { x, y, cb: onArrive }
    if (!this.sprite) { this._arrive = null; onArrive?.() }
  }

  setHotspots(list) {
    for (const h of this.hotspots) h.sprite?.destroy()
    this._hotspotHit = new Set()
    this.hotspots = (list || []).map((h) => {
      const s = this.scene.add.image(h.x, h.y, h.texture || 'item-letter-scraps')
        .setOrigin(0.5, 1)
        .setDepth(this.depth - 1)
      const targetH = h.size || 44
      s.setScale(targetH / Math.max(s.height, 1))
      this.scene.tweens.add({
        targets: s, y: h.y - 9, duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      })
      return { ...h, sprite: s }
    })
  }

  markHotspotDone(id) {
    const h = this.hotspots.find((x) => x.id === id)
    if (!h) return
    this._hotspotHit.add(id)
    if (h.sprite) this.scene.tweens.add({ targets: h.sprite, alpha: 0.14, duration: 500 })
  }

  allHotspotsDone() {
    return this.hotspots.length > 0 && this.hotspots.every((h) => this._hotspotHit.has(h.id))
  }

  /** Nearest unvisited hotspot within its radius, or null. */
  activeHotspot() {
    if (!this.sprite) return null
    let best = null
    let bestD = Infinity
    for (const h of this.hotspots) {
      if (this._hotspotHit.has(h.id)) continue
      const d = Math.hypot(h.x - this.sprite.x, h.y - this.sprite.y)
      if (d <= (h.r || 80) && d < bestD) { best = h; bestD = d }
    }
    return best
  }

  _facingTowards(x, y, tx, ty) {
    const dx = tx - x
    const dy = ty - y
    if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'left' : 'right'
    return dy < 0 ? 'up' : 'down'
  }

  _clearFootprints() {
    for (const f of this._footprints) f.destroy()
    this._footprints = []
  }

  _spawnFootprint() {
    if (this._footprints.length > 14) return
    const f = this.scene.add.sprite(this.sprite.x, this.sprite.y, 'fx-footprint', 0)
      .setOrigin(0.5, 0.5)
      .setDepth(this.depth - 2)
      .setAlpha(0.6)
    f.setScale(36 / Math.max(f.width, 1))
    this._footprints.push(f)
    this.scene.tweens.add({
      targets: f, alpha: 0, duration: 2600, delay: 400,
      onComplete: () => {
        f.destroy()
        this._footprints = this._footprints.filter((x) => x !== f)
      },
    })
  }

  update(dt, inputMap) {
    if (!this.active || !this.sprite) return

    // ---- scripted glide ----
    if (this._arrive) {
      const a = this._arrive
      const dx = a.x - this.sprite.x
      const dy = a.y - this.sprite.y
      const dist = Math.hypot(dx, dy)
      if (dist < 4) {
        this.sprite.setPosition(a.x, a.y)
        this._stopAnim()
        this.moving = false
        this._arrive = null
        a.cb?.()
        return
      }
      const step = Math.min(this.speed * dt, dist)
      this.sprite.x += (dx / dist) * step
      this.sprite.y += (dy / dist) * step
      this.facing = this._facingTowards(0, 0, dx, dy)
      this._playWalk(true)
      this._tickFootprints(dt)
      return
    }

    // ---- free movement ----
    let vx = 0
    let vy = 0
    if (inputMap) {
      if (inputMap.isHeld('move_left')) vx -= 1
      if (inputMap.isHeld('move_right')) vx += 1
      if (inputMap.isHeld('move_up')) vy -= 1
      if (inputMap.isHeld('move_down')) vy += 1
    }
    const moving = vx !== 0 || vy !== 0
    if (moving) {
      const len = Math.hypot(vx, vy) || 1
      this.sprite.x += (vx / len) * this.speed * dt
      this.sprite.y += (vy / len) * this.speed * dt
      this.facing = Math.abs(vx) > Math.abs(vy)
        ? (vx < 0 ? 'left' : 'right')
        : (vy < 0 ? 'up' : 'down')
      const b = this.bounds
      this.sprite.x = Phaser.Math.Clamp(this.sprite.x, b.x, b.x + b.w)
      this.sprite.y = Phaser.Math.Clamp(this.sprite.y, b.y, b.y + b.h)
    }
    this._playWalk(moving)
    this._tickFootprints(dt)
  }

  _tickFootprints(dt) {
    if (!this.moving) { this._footT = 0; return }
    this._footT += dt
    if (this._footT >= 0.32) {
      this._footT = 0
      this._spawnFootprint()
    }
  }

  _stopAnim() {
    if (this.sprite) {
      this.sprite.anims.stop()
      this.sprite.setFrame(DIR_ROW[this.facing] * FRAME_COUNT)
    }
    this._playing = null
  }

  _playWalk(moving) {
    this.moving = moving
    if (!this.sprite) return
    const key = `${this.texture}-${this.facing}`
    if (!this.scene.anims.exists(key)) return
    if (!moving) {
      if (this._playing) this._stopAnim()
      return
    }
    if (this._playing !== key) {
      this._playing = key
      this.sprite.play(key, true)
    }
  }

  runtimeState() {
    return {
      active: this.active,
      x: this.sprite ? Math.round(this.sprite.x) : null,
      y: this.sprite ? Math.round(this.sprite.y) : null,
      facing: this.facing,
      moving: this.moving,
      hotspot: this.activeHotspot()?.id ?? null,
      layers: this.hotspots.map((h) => ({ id: h.id, done: this._hotspotHit.has(h.id) })),
    }
  }
}
