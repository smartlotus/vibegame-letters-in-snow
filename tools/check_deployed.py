"""
验证已部署的静态站点是否真的能玩 —— 用 Playwright 打开 GitHub Pages 上的发布分支，
采集 console / 失败请求，确认 Phaser canvas 与 DOM UI 都起来了，并截图。

静态部署没有 vibegame runtime server，Runtime API 不可用，所以这类验证只能用真实浏览器。
用法：
    python tools/check_deployed.py [URL]

退出码：0 = 页面起得来（canvas + UI 都在），1 = 起不来。
"""

import asyncio
import json
import sys

from playwright.async_api import async_playwright

DEFAULT_URL = "https://smartlotus.github.io/vibegame-letters-in-snow/"
OUT = r"C:\Users\28389\Desktop\grokpet\games\letters-in-snow\logs\deployed-live.png"


async def main() -> int:
    url = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_URL
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page(viewport={"width": 1280, "height": 720})

        console, failures = [], []
        page.on("console", lambda m: console.append((m.type, m.text[:200])))
        page.on("requestfailed", lambda r: failures.append((r.url[:140], str(r.failure))))
        page.on("response", lambda r: failures.append((r.url[:140], f"HTTP {r.status}"))
                if r.status >= 400 else None)

        await page.goto(url, wait_until="load", timeout=90000)
        await page.wait_for_timeout(22000)

        info = await page.evaluate("""() => ({
            cfg: window.__APP_CONFIG__,
            canvas: !!document.querySelector('#game-container canvas'),
            canvasSize: (() => {
                const c = document.querySelector('#game-container canvas');
                return c ? c.width + 'x' + c.height : null;
            })(),
            uiRoot: !!document.getElementById('vibegame-ui'),
            titleH1: (document.querySelector('#vn-root .vn-title h1') || {}).textContent || null,
            menuButtons: document.querySelectorAll('#vn-root .vn-title .menu .vn-btn').length,
            text: document.body.innerText.slice(0, 300)
        })""")

        await page.screenshot(path=OUT)
        await browser.close()

        print(json.dumps({"url": url, "info": info,
                          "failures": failures[:15], "console": console[:20]},
                         ensure_ascii=False, indent=2))

        ok = bool(info.get("canvas")) and bool(info.get("uiRoot")) and not [
            f for f in failures if "HTTP 4" in f[1] or "HTTP 5" in f[1]
        ]
        print("\nRESULT:", "PLAYABLE" if ok else "NOT PLAYABLE")
        return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
