/**
 * Static audit of StoryData.js — run from the project root:
 *   node tools/audit_story.mjs
 *
 * Checks that every declared 留印 is reachable, that no node references an
 * undeclared impression, that every choice has options, that every asset key
 * referenced by the script exists in assets/manifest.json, and prints the
 * chapter/node census.
 */
import { readFileSync } from 'node:fs'

const m = await import('../scripts/StoryData.js')
const manifest = JSON.parse(readFileSync(new URL('../assets/manifest.json', import.meta.url), 'utf8'))

const all = new Set(m.IMPRESSIONS.map((i) => i.id))
const used = new Set()
const assets = new Set()
const problems = []
let choices = 0
let choiceOpts = 0

const BUST = {
  lute: ['calm', 'open', 'ponder', 'shocked', 'weary', 'stern', 'smile-closed', 'gloom'],
  tess: ['neutral', 'smile', 'warm-smile', 'pout', 'earnest', 'dejected', 'calm', 'resolute'],
  heroine: ['calm', 'smile', 'angry', 'shocked', 'weary', 'serious', 'sad', 'worried'],
}
const CHAR_OF = { lute: 'lute', tess: 'tess', heroine: 'heroine', woman: 'heroine', root: 'lute' }

function checkBust(where, who, mood) {
  const ch = CHAR_OF[who]
  if (!ch) return
  if (mood && !BUST[ch].includes(mood)) problems.push(`${where}: bad mood "${who}/${mood}"`)
}

function walk(nodes, where) {
  let i = -1
  for (const n of nodes || []) {
    i += 1
    if (!n || typeof n !== 'object') continue
    const at = `${where}[${i}]`
    if (n.imp) used.add(n.imp)
    if (n.bg) assets.add(n.bg)
    if (n.bust) { assets.add(n.bust.key); checkBust(at, n.bust.id, String(n.bust.key || '').replace(/^bust-[a-z]+-/, '')) }
    if (n.walk) {
      assets.add(n.walk.texture || 'walk-lute')
      for (const h of n.walk.hotspots || []) {
        if (h.texture) assets.add(h.texture)
        walk(h.then, `${at}.hotspot(${h.id})`)
      }
    }
    const useQ = n.question != null && !n.choice
    const opts = (useQ ? n.options : n.choice?.options) || []
    if (n.choice || n.question) {
      choices += 1
      if (!opts.length) problems.push(`${at}: choice with 0 options`)
      choiceOpts += opts.length
      opts.forEach((o, oi) => {
        if (o.imp) used.add(o.imp)
        walk(o.then, `${at}.opt${oi}`)
      })
    }
  }
}
m.CHAPTERS.forEach((c) => walk(c.nodes, c.id))

// asset key resolution: bg/, item-, etc. live as exact keys; walk/bust handled above
const missingAssets = [...assets].filter((k) => {
  if (k.endsWith('-')) { // bust prefix check
    const hit = Object.keys(manifest).some((mkey) => mkey.startsWith(k))
    return !hit
  }
  return !manifest[k]
})
missingAssets.forEach((k) => problems.push(`asset key not in manifest: ${k}`))

console.log('IMPRESSIONS declared :', all.size)
console.log('IMPRESSIONS reachable:', used.size)
console.log('unreachable          :', [...all].filter((x) => !used.has(x)).join(', ') || '(none)')
console.log('undeclared           :', [...used].filter((x) => !all.has(x)).join(', ') || '(none)')
console.log('choices              :', choices, '(' + choiceOpts + ' options)')
console.log('chapters             :', m.CHAPTERS.map((c) => c.id + ':' + c.nodes.length).join(' '))
console.log('total nodes          :', m.CHAPTERS.reduce((a, c) => a + c.nodes.length, 0))
console.log('finales              :', Object.keys(m.FINALES).join(', '))
console.log('PROBLEMS             :', problems.length ? '\n  ' + problems.join('\n  ') : '(none)')
