import { Node } from '/engine/Node.js'
import Walker from './Walker.js'

/**
 * Stage — the Phaser-side "world" layer.
 *
 * Owns everything that is *the scene* rather than *the interface*:
 *   - the background plate (two stacked images, cross-faded)
 *   - a full-screen mood tint above the plate
 *   - camera shake / impact pulses
 *   - the top-down walker used by the frame chapters
 *
 * All text, portraits, gauges and menus live in the DOM layer (VnUi).
 */
export default class Stage extends Node {
  ready() {
    this.W = this.scene.scale.width
    this.H = this.scene.scale.height

    // --- background plates (cross-fade pair) ---
    this.plates = [
      this.scene.add.image(this.W / 2, this.H / 2, 'bg-church-steps').setOrigin(0.5).setDepth(0),
      this.scene.add.image(this.W / 2, this.H / 2, 'bg-church-steps').setOrigin(0.5).setDepth(1),
    ]
    this.plates.forEach((p) => { p.setDisplaySize(this.W, this.H); p.setAlpha(0) })
    this.activePlate = 0
    this.plates[0].setAlpha(1)
    this.currentKey = 'bg-church-steps'

    // --- mood tint above the plate ---
    this.tint = this.scene.add.rectangle(this.W / 2, this.H / 2, this.W, this.H, 0x0a1526, 0)
      .setDepth(2)
      .setOrigin(0.5)

    // --- vignette-ish gradient bar for letterboxing cinematic beats ---
    this.bars = [
      this.scene.add.rectangle(this.W / 2, -40, this.W, 80, 0x000000, 0.96).setDepth(3).setOrigin(0.5),
      this.scene.add.rectangle(this.W / 2, this.H + 40, this.W, 80, 0x000000, 0.96).setDepth(3).setOrigin(0.5),
    ]

    // --- ambient slow push so a still plate is never dead ---
    this._pushT = 0
    this._pushOn = true

    // --- walker (created lazily by the frame chapters) ---
    this.walker = null
  }

  /* ------------------------------------------------------------------ *
   *  Background
   * ------------------------------------------------------------------ */

  setBackground(key, { fade = 900, immediate = false } = {}) {
    if (!key) return
    if (key === this.currentKey && !immediate) return

    const nextIdx = 1 - this.activePlate
    const next = this.plates[nextIdx]
    const prev = this.plates[this.activePlate]

    next.setTexture(key)
    next.setDisplaySize(this.W, this.H)
    next.setDepth(1)

    if (immediate || fade <= 0) {
      next.setAlpha(1)
      prev.setAlpha(0)
      prev.setDepth(0)
      next.setDepth(1)
      this.activePlate = nextIdx
      this.currentKey = key
      this._pushT = 0
      return
    }

    // kill any in-flight fade tweens
    this.scene.tweens.killTweensOf(prev)
    this.scene.tweens.killTweensOf(next)

    next.setAlpha(0)
    this.scene.tweens.add({ targets: next, alpha: 1, duration: fade, ease: 'Sine.easeInOut' })
    this.scene.tweens.add({
      targets: prev,
      alpha: 0,
      duration: fade,
      ease: 'Sine.easeInOut',
      onComplete: () => { prev.setDepth(0) },
    })

    this.activePlate = nextIdx
    this.currentKey = key
    this._pushT = 0
  }

  /** Full-canvas mood wash. color 0xRRGGBB, alpha 0..1 */
  tintTo(color, alpha, duration = 900) {
    const next = this.scene.add.rectangle(this.W / 2, this.H / 2, this.W, this.H, color, alpha)
      .setDepth(2).setOrigin(0.5)
    next.setAlpha(0)
    this.scene.tweens.add({
      targets: next,
      alpha,
      duration,
      ease: 'Sine.easeInOut',
      onUpdate: () => { this.tint.setAlpha(1 - (next.alpha / Math.max(alpha, 0.0001))) },
      onComplete: () => {
        this.tint?.destroy()
        this.tint = next
      },
    })
  }

  /* ------------------------------------------------------------------ *
   *  Impact
   * ------------------------------------------------------------------ */

  shake(duration = 320, intensity = 0.006) {
    this.scene.cameras.main.shake(duration, intensity)
  }

  /** Short punch-in, used on the snap beat. */
  punch(scale = 1.035, duration = 260) {
    const cam = this.scene.cameras.main
    cam.zoomTo(scale, duration, 'Quad.easeOut', true)
    this.scene.time.delayedCall(duration + 40, () => cam.zoomTo(1, duration * 1.6, 'Sine.easeInOut', true))
  }

  /** Cinematic letterbox */
  letterbox(on, duration = 600) {
    const targets = on
      ? [{ y: 40 }, { y: this.H - 40 }]
      : [{ y: -40 }, { y: this.H + 40 }]
    this.bars.forEach((bar, i) => {
      this.scene.tweens.add({ targets: bar, y: targets[i].y, duration, ease: 'Sine.easeInOut' })
    })
  }

  /* ------------------------------------------------------------------ *
   *  Walker (frame-chapter exploration)
   * ------------------------------------------------------------------ */

  spawnWalker(cfg = {}) {
    if (!this.walker) {
      this.walker = new Walker(this.scene, {
        texture: cfg.texture || 'walk-lute',
        depth: cfg.depth ?? 20,
        displayHeight: cfg.displayHeight ?? 158,
        speed: cfg.speed ?? 190,
      })
    } else {
      this.walker.despawn()
      this.walker.texture = cfg.texture || 'walk-lute'
      this.walker._registerAnims()
    }
    if (cfg.bounds) this.walker.setBounds(cfg.bounds)
    if (cfg.speed) this.walker.setSpeed(cfg.speed)
    this.walker.spawn(cfg.x ?? this.W / 2, cfg.y ?? this.H - 110, cfg.facing || 'down')
    return this.walker
  }

  despawnWalker() {
    this.walker?.despawn()
  }

  /* ------------------------------------------------------------------ *
   *  Frame
   * ------------------------------------------------------------------ */

  update(dt) {
    if (this.walker?.active) {
      this.walker.update(dt, this.sceneTree.inputMap)
    }
    if (!this._pushOn) return
    this._pushT += dt
    // 0.6% slow breathing zoom, reset whenever the plate changes
    if (this.suspended) return
    const s = 1 + (this._pushT % 26) / 26 * 0.012
    this.plates.forEach((p) => {
      if (p.alpha > 0.01) {
        p.setDisplaySize(this.W * s, this.H * s)
      }
    })
  }

  runtimeState() {
    return {
      scene: this.currentKey,
      plate: this.activePlate,
      tint: this.tint ? this.tint.fillAlpha : 0,
      walker: this.walker ? this.walker.runtimeState() : null,
    }
  }
}
