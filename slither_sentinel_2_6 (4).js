/* Slither Sentinel 3.2 — Chrome F12 → Console ga BIR MARTA joylanadi.
   T: bot  H: hujum (yonma-yon siquv, tig'iz kesish, qarshi hujum, o'rash)  D: qo'lda himoya  R: radar
   Z/X yoki g'ildirak: zoom  C: zoom 0.40  Esc: pauza
   Log: paneldagi "Log nusxalash" yoki Console: copy(SENTINEL.logText())
   © Valijon Ibroximov */
(() => {
  'use strict';
  const VERSION = '3.2';
  const W = window, TAU = Math.PI * 2;

  /* ================= 0. Eski nusxalarni tozalash ================= */
  for (const k of ['__SENTINEL_CLEANUP__', '__SLITHER_PRO_CLEANUP__', '__SLITHER_DIAG_CLEANUP__']) {
    if (typeof W[k] === 'function') { try { W[k](); } catch (e) { console.warn('[Sentinel] cleanup', k, e); } }
  }
  try { if (W.SLITHER_AI && typeof W.SLITHER_AI.stop === 'function') W.SLITHER_AI.stop(); } catch (e) {}
  try { if (W.MINILOG && typeof W.MINILOG.stopTimer === 'function') W.MINILOG.stopTimer(); } catch (e) {}
  for (const id of ['slither-sentinel-hud', 'slither-sentinel-radar', 'sentinel-log-box', 'sentinel2-hud', 'sentinel2-radar']) {
    const el = document.getElementById(id); if (el) el.remove();
  }

  /* ================= 1. Sozlamalar (3.2: Ishorali burilish kinematikasi + Kvadratik ufq ozuqa maydoni) =================
     3.1 log tahlili:
     1) 10.86..11.33 s da nishon burchagi ±π atrofida bo'lganda evalRays() +π va -π nurlarni birlashtirib yuborgan hamda
        steer har tickda +0.71 <-> +3.03 <-> -2.40 orasida sakrab 255-ilonga urilgan.
        YECHIM: Barcha nurlar dunyo burchagi emas, ISHORALI BURILISH BURCHAGI (delta ∈ [-2.85, +2.85]) bilan parametrlandi!
        Endi +2.75 (chapga U-burilish) va -2.75 (o'ngga U-burilish) alohida tekshiriladi va steer = wrap(me.ang + clamp(delta, -1.75, 1.75))
        hech qachon ±π chegarasida teskari tomonga sakramaydi!
     2) 0..10 s da bot 464..1234 birlik uzoqdagi (contested: true) ozuqalarga yugurib, burni oldidagi ozuqalarni yemagan.
        YECHIM: Kvadratik vaqt jarimasi (eta + 0.20 + 0.35*eta²) va raqib soyasi (rival < eta*0.80 bo'lsa 92% jarima) kiritildi. */
  const CFG = {
    tickMs: 50,            // qaror davri (20 Hz)
    horizon: 1.52, dt: 0.08, rays: 36,
    safeT: 0.78,           // normal tezlikda xavfsizlik darvozasi (boostda +0.16 s)
    kInit: 31.0,           // 3.1 log: k = 31.1
    omegaInit: 3.05,       // 3.1 log: omegaN = 3.20, omegaB = 2.95
    accUp: 12.5, accDown: 15.5,
    latency: 0.09,         // s, buyruq → harakat kechikishi
    rScale: 12.6,          // tana hitbox radiusi
    selfR: 0.30,           // boshimizning to'qnashuv yadrosi ulushi
    margin: 3.0, comfort: 8,
    deadId: -1234,
    headU: [3, 8, 6],      // bosh noaniqligi a + b·t + c·t²
    headHardT: 0.85,
    cell: 40, gridR: 960,
    zoom: 0.40, zoomMin: 0.08, zoomMax: 2.5,
    boostMinSct: 14,       // sct >= 14 da yirik o'lim ozuqasiga boost
    escapeBoostMinSct: 7,
    attackMinSct: 10,
    attackMaxD: 560,
    raceMinSct: 11, raceMs: 4200, raceCost: 0.14,
    coilMinL: 1100, coilRatio: 0.45, coilMs: 16000, squeezeMs: 26000,
    ringWarn: 1.22 * Math.PI, ringUrgent: 1.55 * Math.PI,
    attackMinTsct: 4,
    closeHeadGap: 155, closeBoostMs: 850, closeBoostCoolMs: 1000,
    calmMs: 380, trapCalmMs: 700, planBudgetMs: 28,
  };

  /* ================= 2. Yordamchilar va geometriya ================= */
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const num = (v, d = 0) => (typeof v === 'number' && isFinite(v)) ? v : d;
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  const dAng = (a, b) => wrap(a - b);
  const hyp = Math.hypot;
  const fin = v => typeof v === 'number' && isFinite(v);
  const r2 = v => fin(v) ? Math.round(v * 100) / 100 : null;
  const r1 = v => fin(v) ? Math.round(v * 10) / 10 : null;
  const r0 = v => fin(v) ? Math.round(v) : null;
  const okObj = o => !!o && fin(o.xx) && fin(o.yy);
  const pos = o => ({ x: o.xx + num(o.fx), y: o.yy + num(o.fy) });
  const now = () => performance.now();
  const cross = (ax, ay, bx, by) => ax * by - ay * bx;

  // Ishorali burilish burchagidan (delta) o'yinga yuboriladigan steer burchagini hisoblash:
  // |clamp(delta, -1.75, 1.75)| <= 1.75 < π bo'lgani uchun o'yin HECH QACHON teskari tomonga burilib ketmaydi!
  const steerFromDelta = (meAng, delta) => wrap(meAng + clamp(delta, -1.75, 1.75));

  function ptSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    let t = L > 0 ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return hyp(px - ax - t * dx, py - ay - t * dy);
  }
  function segX(ax, ay, bx, by, cx, cy, dx, dy) {
    const ux = bx - ax, uy = by - ay, vx = dx - cx, vy = dy - cy, den = ux * vy - uy * vx;
    if (Math.abs(den) < 1e-9) return null;
    const wx = cx - ax, wy = cy - ay;
    const s = (wx * vy - wy * vx) / den, q = (wx * uy - wy * ux) / den;
    return (s >= 0 && s <= 1 && q >= 0 && q <= 1) ? { s, q } : null;
  }
  function segSeg(ax, ay, bx, by, cx, cy, dx, dy) {
    if (segX(ax, ay, bx, by, cx, cy, dx, dy)) return 0;
    return Math.min(ptSeg(ax, ay, cx, cy, dx, dy), ptSeg(bx, by, cx, cy, dx, dy),
                    ptSeg(cx, cy, ax, ay, bx, by), ptSeg(dx, dy, ax, ay, bx, by));
  }

  function winding(P, px, py, maxD) {
    let W = 0, pa = null; const m2 = maxD * maxD;
    for (let i = 0; i + 1 < P.length; i += 2) {
      const dx = P[i] - px, dy = P[i + 1] - py;
      if (dx * dx + dy * dy > m2) { pa = null; continue; }
      const a = Math.atan2(dy, dx);
      if (pa != null) W += dAng(a, pa);
      pa = a;
    }
    return W;
  }

  class CapGrid {
    constructor(cell) { this.c = cell; this.m = new Map(); this.n = 0; this.st = 0; this.all = []; }
    key(ix, iy) { return ix * 100003 + iy; }
    add(ax, ay, bx, by, r, id) {
      const cap = { ax, ay, bx, by, r, id, s: 0, x0: Math.min(ax, bx) - r, x1: Math.max(ax, bx) + r, y0: Math.min(ay, by) - r, y1: Math.max(ay, by) + r }, c = this.c;
      this.n++; this.all.push(cap);
      const x0 = Math.floor((Math.min(ax, bx) - r) / c), x1 = Math.floor((Math.max(ax, bx) + r) / c);
      const y0 = Math.floor((Math.min(ay, by) - r) / c), y1 = Math.floor((Math.max(ay, by) + r) / c);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        const k = this.key(x, y); let a = this.m.get(k);
        if (!a) this.m.set(k, a = []);
        a.push(cap);
      }
    }
    gap(ax, ay, bx, by, limit, out) {
      const c = this.c, st = ++this.st;
      let best = limit, who = null;
      const mnx = Math.min(ax, bx), mxx = Math.max(ax, bx), mny = Math.min(ay, by), mxy = Math.max(ay, by);
      const x0 = Math.floor((mnx - limit) / c), x1 = Math.floor((mxx + limit) / c);
      const y0 = Math.floor((mny - limit) / c), y1 = Math.floor((mxy + limit) / c);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
        const a = this.m.get(this.key(x, y)); if (!a) continue;
        for (let i = 0; i < a.length; i++) {
          const p = a[i]; if (p.s === st) continue; p.s = st;
          if (p.x0 > mxx + best || p.x1 < mnx - best || p.y0 > mxy + best || p.y1 < mny - best) continue;
          const g = segSeg(ax, ay, bx, by, p.ax, p.ay, p.bx, p.by) - p.r;
          if (g < best) { best = g; who = p; }
        }
      }
      if (out) out.cap = who;
      return best;
    }
  }

  /* ================= 3. Fizika kalibratori ================= */
  const PHY = {
    k: CFG.kInit, wN: CFG.omegaInit, wB: CFG.omegaInit, myW: 0, accUp: CFG.accUp, accDown: CFG.accDown,
    scRef: 1.0,
    n: { k: 0, wN: 0, wB: 0, up: 0, down: 0 }, prev: null, win: null, pend: [],
    err: { n: 0, sum: 0, max: 0, keep: [] },
    reset() {
      this.prev = null; this.win = null; this.pend = []; this.scRef = 1.0; this.myW = 0;
      this.err = { n: 0, sum: 0, max: 0, keep: [] };
    },
    effW(me, boost) {
      const s = me.obj;
      if (s && fin(W.mamu) && fin(s.scang)) {
        const spang = boost ? clamp(me.spN / Math.max(me.spB, 10), 0.65, 1) : num(s.spang, 1);
        const engW = W.mamu * (1000 / 125) * s.scang * clamp(spang, 0.6, 1.05);
        if (engW > 1.4 && engW < 4.2) {
          const cal = boost ? this.wB : this.wN;
          return clamp(0.55 * cal + 0.45 * engW, 1.95, 3.35);
        }
      }
      const base = boost ? this.wB : this.wN;
      const ratio = clamp(Math.pow(this.scRef / Math.max(me.sc, 1), 0.20), 0.78, 1.05);
      return clamp(base * ratio, 1.95, boost ? 3.15 : 3.35);
    },
    observe(me, t, cmdPrev) {
      const p = this.prev;
      if (p) {
        const dt = (t - p.t) / 1000;
        if (dt > 0.032 && dt < 0.22) {
          const rawW = dAng(me.ang, p.ang) / dt;
          this.myW = 0.50 * this.myW + 0.50 * clamp(rawW, -4.2, 4.2);
          if (cmdPrev != null && Math.abs(dAng(cmdPrev, p.ang)) > 0.85) {
            const w = Math.abs(rawW);
            if (w > 1.3 && w < 4.1) {
              const key = me.boosting ? 'wB' : 'wN', e = this[key];
              const alpha = w > e ? 0.04 : 0.055;
              this[key] = clamp(e + alpha * (w - e), 1.95, me.boosting ? 3.15 : 3.35);
              this.scRef += 0.05 * (me.sc - this.scRef);
              this.n[key]++;
            }
          }
          const dsp = (me.sp - p.sp) / dt;
          if (me.boosting && me.sp < me.spB - 0.6 && dsp > 0.5) { this.accUp = clamp(this.accUp + 0.08 * (dsp - this.accUp), 6, 22); this.n.up++; }
          if (!me.boosting && me.sp > me.spN + 0.6 && dsp < -0.5) { this.accDown = clamp(this.accDown + 0.08 * (-dsp - this.accDown), 6, 25); this.n.down++; }
          const w = this.win || (this.win = { t: p.t, a0: p.ang, path: 0, sp: 0, n: 0 });
          w.path += hyp(me.x - p.x, me.y - p.y); w.sp += me.sp; w.n++;
          if (t - w.t >= 250) {
            const dtw = (t - w.t) / 1000, msp = w.sp / w.n;
            if (Math.abs(dAng(me.ang, w.a0)) < 0.12 && msp > 3) {
              const k = w.path / dtw / msp;
              if (k > 18 && k < 50) { this.k = clamp(this.k + 0.10 * (k - this.k), 22, 42); this.n.k++; }
            }
            this.win = null;
          }
        } else this.win = null;
      }
      this.prev = { t, x: me.x, y: me.y, ang: me.ang, sp: me.sp };
    },
    expect(due, x, y, steer, boost) { this.pend.push({ due, x, y, cmd: steer, boost, ok: true }); if (this.pend.length > 16) this.pend.shift(); },
    check(me, t, steer, boost) {
      while (this.pend.length && this.pend[0].due <= t) {
        const p = this.pend.shift();
        if (!p.ok) continue;
        const e = hyp(me.x - p.x, me.y - p.y), E = this.err;
        E.n++; E.sum += e; if (e > E.max) E.max = e;
        if (E.keep.length < 120) E.keep.push(e); else E.keep[Math.floor(Math.random() * 120)] = e;
      }
      for (const p of this.pend) if (steer == null || Math.abs(dAng(steer, p.cmd)) > 0.14 || boost !== p.boost) p.ok = false;
    },
    errStats() {
      const E = this.err, s = E.keep.slice().sort((a, b) => a - b);
      return { n: E.n, mean: E.n ? r1(E.sum / E.n) : null, p90: s.length ? r1(s[Math.floor(s.length * 0.9)]) : null, max: r1(E.max) };
    },
  };

  /* ================= 4. Ozuqa kuzatuvi va o'lim dalillari ================= */
  const FOOD = {
    ring: [], pos: new WeakMap(), last: -1e9,
    reset() { this.ring = []; this.pos = new WeakMap(); this.last = -1e9; },
    scan(t, force = false) {
      if (!force && t - this.last < 80) return;
      this.last = t;
      const f = W.foods; if (!Array.isArray(f)) return;
      const set = new Set();
      for (let i = 0; i < f.length; i++) {
        const o = f[i]; if (!o || o.eaten || !fin(o.xx) || !fin(o.yy)) continue;
        set.add(o);
        const pv = this.pos.get(o);
        if (!pv) this.pos.set(o, [o.xx, o.yy, t]);
        else if (Math.abs(pv[0] - o.xx) > 3 || Math.abs(pv[1] - o.yy) > 3) { pv[0] = o.xx; pv[1] = o.yy; pv[2] = t; }
      }
      this.ring.push({ t, set });
      if (this.ring.length > 18) this.ring.shift();
    },
    base() { return this.ring.length ? this.ring[0] : null; },
    alive(o) { const r = this.ring[this.ring.length - 1]; return !!o && !o.eaten && (!r || r.set.has(o)); },
    isNew(o, b) {
      if (!b) return false;
      if (!b.set.has(o)) return true;
      const pv = this.pos.get(o); return !!(pv && pv[2] > b.t - 100);
    },
    near(pts, R) {
      const out = [], f = W.foods; if (!Array.isArray(f) || !pts.length) return out;
      let x0 = 1e12, y0 = 1e12, x1 = -1e12, y1 = -1e12;
      for (let i = 0; i < pts.length; i += 2) { x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]); }
      const R2 = R * R;
      for (let i = 0; i < f.length; i++) {
        const o = f[i]; if (!o || o.eaten || !fin(o.xx)) continue;
        if (o.xx < x0 - R || o.xx > x1 + R || o.yy < y0 - R || o.yy > y1 + R) continue;
        for (let k = 0; k < pts.length; k += 2) {
          if (k + 3 < pts.length) {
            if (ptSeg(o.xx, o.yy, pts[k], pts[k + 1], pts[k + 2], pts[k + 3]) < R) { out.push(o); break; }
          } else {
            const dx = o.xx - pts[k], dy = o.yy - pts[k + 1];
            if (dx * dx + dy * dy < R2) { out.push(o); break; }
          }
        }
      }
      return out;
    },
  };

  const DEATH = {
    zones: [], viewR: 1100, cnt: { observed: 0, probable: 0, vanished: 0, leftView: 0, killLikely: 0, diedNearby: 0 },
    reset() { this.zones = []; this.viewR = 1100; for (const k in this.cnt) this.cnt[k] = 0; },
    onDeadFlag(tr, t, me) {
      this.cnt.observed++;
      this.addZone(tr, t, 'observed', me);
      FOOD.scan(t, true); S.foodsT = 0;
    },
    onGone(tr, t, me) {
      if (tr.dead) return;
      if (tr.d > this.viewR * 0.65) { this.cnt.leftView++; return; }
      this.addZone(tr, t, 'pending', me);
      FOOD.scan(t, true); S.foodsT = 0;
    },
    addZone(tr, t, kind, me) {
      const pts = tr.wb && tr.wb.length ? tr.wb.slice() : (tr.body && tr.body.length ? tr.body.slice() : []);
      pts.push(tr.x, tr.y);
      const z = { id: tr.id, kind, t, pts, base: FOOD.base(), newSet: new Set(), upd: -1e9, sct: tr.sct,
                  x: tr.x, y: tr.y, d: tr.d, until: t + 10000, need: Math.max(5, Math.min(28, tr.sct * 0.18)),
                  ourTarget: ATK.recentTarget(tr.id, t), headToOurBody: me ? ourBodyDist(me, tr.x, tr.y) : null, attributed: false };
      this.zones.push(z);
      if (this.zones.length > 8) this.zones.shift();
      return z;
    },
    update(t, me) {
      for (const z of this.zones) {
        if (t - z.upd >= 80 && t - z.t < 3000) {
          z.upd = t;
          for (const o of FOOD.near(z.pts, 75)) if (FOOD.isNew(o, z.base) || num(o.sz, 5) >= 8.5) z.newSet.add(o);
        }
        if (z.kind === 'pending') {
          if (z.newSet.size >= z.need) { z.kind = 'probable'; this.cnt.probable++; S.foodsT = 0; LOG.death(z, 'probable'); }
          else if (t - z.t > 1500) { z.kind = 'vanished'; this.cnt.vanished++; z.until = t; LOG.death(z, 'vanished'); }
        }
        if (z.kind === 'observed' && !z.logged && t - z.t > 1500) { z.logged = true; LOG.death(z, 'observed'); }
        if ((z.kind === 'observed' || z.kind === 'probable') && !z.attributed && (z.ourTarget || (z.headToOurBody != null && z.headToOurBody < 55))) {
          z.attributed = true;
          const close = z.headToOurBody != null && z.headToOurBody < 85;
          if (close) this.cnt.killLikely++; else this.cnt.diedNearby++;
          ATK.outcome(z.id, close ? 'killLikely' : 'diedNearby', z);
        }
      }
      this.zones = this.zones.filter(z => t < z.until);
    },
    pendingLoot(me, t) {
      const out = [];
      for (const z of this.zones) {
        if (z.kind !== 'observed' || t - z.t > 2200 || z.d > 1400) continue;
        const step = Math.max(2, Math.floor(z.pts.length / 8) * 2);
        for (let i = 0; i + 1 < z.pts.length; i += step) {
          out.push({ x: z.pts[i], y: z.pts[i + 1], mass: clamp(z.sct * 0.45, 8, 55), our: z.ourTarget });
        }
      }
      return out;
    },
    lootSet() {
      const out = [];
      for (const z of this.zones) if (z.kind === 'observed' || z.kind === 'probable')
        for (const o of z.newSet) if (FOOD.alive(o)) out.push({ o, z });
      return out;
    },
  };

  /* ================= 5. Dunyo holati ================= */
  const TR = new Map(), TRO = new Map();
  let ourPts = [], deadSeq = 0;

  const COLL = {
    shrink: 0, top: [], n: 0, pend: null, fatal: null,
    reset() { this.pend = null; },
    observe(nb, t) {
      const base = nb ? nb.d - this.shrink : null;
      if (this.pend && t - this.pend.t < 200) {
        this.n++; this.top.push(this.pend.pen); this.top.sort((a, b) => b - a); this.top.length = Math.min(3, this.top.length);
        this.shrink = clamp(0.5 * (this.top[1] || 0), 0, 14);
      }
      this.pend = base != null && base < -3 ? { t, pen: -base } : null;
    },
    onDeath() { if (this.pend) this.fatal = r1(this.pend.pen); this.pend = null; },
  };
  const rsOf = (me, trR) => Math.max(trR * 0.78, trR + CFG.selfR * me.r + CFG.margin - COLL.shrink);

  function reversePairs(a) {
    for (let i = 0, j = a.length - 2; i < j; i += 2, j -= 2) { const x = a[i], y = a[i + 1]; a[i] = a[j]; a[i + 1] = a[j + 1]; a[j] = x; a[j + 1] = y; }
    return a;
  }
  function ourBodyDist(me, x, y) {
    let best = Infinity;
    for (let i = 0; i + 3 < ourPts.length; i += 2) best = Math.min(best, ptSeg(x, y, ourPts[i], ourPts[i + 1], ourPts[i + 2], ourPts[i + 3]));
    return fin(best) ? best - me.r : null;
  }

  function readMe(s) {
    const p = pos(s), sc = clamp(num(s.sc, 1), 0.5, 15), sp = num(s.sp, 5.8);
    const pts = Array.isArray(s.pts) ? s.pts : [];
    let L = 0, px = null, py = null;
    ourPts = [];
    for (let i = 0; i < pts.length; i++) {
      const q = pts[i]; if (!okObj(q) || q.dying) continue;
      const x = q.xx + num(q.fx), y = q.yy + num(q.fy);
      if (px != null) L += hyp(x - px, y - py);
      px = x; py = y; ourPts.push(x, y);
    }
    const sct = num(s.sct, pts.length);
    return { obj: s, x: p.x, y: p.y, ang: wrap(num(s.ang, num(s.ehang))), sp, sc, sct, r: CFG.rScale * sc,
             spN: num(W.nsp1, 5.39) + num(W.nsp2, 0.4) * sc,
             spB: num(W.nsp3, 14), L: L > 0 ? L : sct * 12, boosting: !!s.wmd };
  }

  function makeHead(tr, me) {
    const n = Math.round(CFG.horizon / CFG.dt), dt = CFG.dt, pred = new Float64Array(2 * (n + 1));
    let x = tr.x, y = tr.y, a = tr.ang;
    const v = tr.v, w0 = clamp(tr.w * (tr.wj < 0.5 && tr.t - tr.since > 1000 ? 0.88 : 0.68), -3.5, 3.5);
    for (let i = 0; i <= n; i++) {
      pred[2 * i] = x; pred[2 * i + 1] = y;
      const w = w0 * (i * dt > 0.75 ? 0.55 : 1);
      const am = a + w * dt / 2; x += Math.cos(am) * v * dt; y += Math.sin(am) * v * dt; a += w * dt;
    }
    return { id: tr.id, tr, x: tr.x, y: tr.y, ang: tr.ang, v, w: tr.w, r: tr.r, rs: rsOf(me, tr.r),
             sc: tr.sc, sct: tr.sct, L: tr.L, age: (tr.t - tr.since) / 1000, pred, d: tr.d, boosting: tr.sp > 9.2 };
  }

  let arenaBad = false;
  function readWorld(t, s) {
    const me = readMe(s);
    const list = Array.isArray(W.slithers) ? W.slithers : [];
    const present = new Set(list), grid = new CapGrid(90), heads = [];
    const reach = me.spB * PHY.k * CFG.horizon + 250;
    let nb = null, maxD = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!okObj(e) || e === s) continue;
      const h = pos(e), ang = wrap(num(e.ang, num(e.ehang)));
      const dead = !!e.dead || num(e.dead_amt) > 0 || e.id === CFG.deadId;
      let tr = TRO.get(e);
      if (!tr) {
        if (dead) {
          for (const c of TR.values()) if (!c.dead && !present.has(c.obj) && hyp(c.x - h.x, c.y - h.y) < 90) { tr = c; TRO.delete(c.obj); break; }
        } else if (e.id != null) {
          const c = TR.get(e.id); if (c && !present.has(c.obj)) { tr = c; TRO.delete(c.obj); }
        }
        if (!tr) {
          const id = e.id != null && e.id !== CFG.deadId ? e.id : 'd' + (++deadSeq);
          tr = { id, since: t, t, x: h.x, y: h.y, ang, w: 0, wj: 1, dead: false, body: [], wb: [], L: 0, sct: 0, d: 1e9, minBodyD: 1e9 };
          TR.set(id, tr);
        }
        tr.obj = e; TRO.set(e, tr);
      } else if (!dead) {
        const dt = (t - tr.t) / 1000;
        if (dt > 0.02 && dt < 0.5) {
          const wi = clamp(dAng(ang, tr.ang) / dt, -6, 6);
          tr.wj = 0.8 * tr.wj + 0.2 * Math.abs(wi - tr.w);
          tr.w = 0.6 * tr.w + 0.4 * wi;
        }
      }
      tr.seenT = t;
      tr.t = t; tr.x = h.x; tr.y = h.y; tr.ang = ang; tr.sp = num(e.sp, 5.8); tr.sc = clamp(num(e.sc, 1), 0.5, 15);
      tr.r = CFG.rScale * tr.sc; tr.v = tr.sp * PHY.k; tr.sct = num(e.sct, tr.sct); tr.d = hyp(h.x - me.x, h.y - me.y);
      if (tr.d > maxD) maxD = tr.d;
      if (dead) { if (!tr.dead) { tr.dead = true; DEATH.onDeadFlag(tr, t, me); } continue; }
      const pts = Array.isArray(e.pts) ? e.pts : [], rs = rsOf(me, tr.r);
      const body = [], wb = [], step = Math.max(1, Math.ceil(pts.length / 24));
      let lx = null, ly = null, fx = null, fy = null, ex = null, ey = null, wx = null, wy = null, L = 0, minBD = tr.d;
      for (let j = 0; j < pts.length; j++) {
        const q = pts[j];
        if (!okObj(q) || q.dying) { lx = null; continue; }
        const x = q.xx + num(q.fx), y = q.yy + num(q.fy);
        if (fx == null) { fx = x; fy = y; }
        if (ex != null) L += hyp(x - ex, y - ey);
        ex = x; ey = y;
        if (j % step === 0) body.push(x, y);
        if (wx == null || hyp(x - wx, y - wy) >= 45) { wb.push(x, y); wx = x; wy = y; }
        if (lx != null) {
          const qx = x - me.x, qy = y - me.y, lim = reach + rs + 60;
          if (qx * qx + qy * qy < lim * lim) {
            grid.add(lx, ly, x, y, rs, tr.id);
            if (qx * qx + qy * qy < 360000) {
              const dd = ptSeg(me.x, me.y, lx, ly, x, y);
              if (dd < minBD) minBD = dd;
              if (!nb || dd - rs < nb.d) nb = { id: tr.id, d: dd - rs, c: dd, x: (lx + x) / 2, y: (ly + y) / 2 };
            }
          }
        }
        lx = x; ly = y;
      }
      if (fx != null) {
        const nk = hyp(h.x - fx, h.y - fy) < hyp(h.x - ex, h.y - ey) ? [fx, fy] : [ex, ey];
        grid.add(h.x, h.y, nk[0], nk[1], rs, tr.id);
        const dd = ptSeg(me.x, me.y, h.x, h.y, nk[0], nk[1]);
        if (dd < minBD) minBD = dd;
        if (!nb || dd - rs < nb.d) nb = { id: tr.id, d: dd - rs, c: dd, x: (h.x + nk[0]) / 2, y: (h.y + nk[1]) / 2 };
      } else grid.add(h.x, h.y, h.x, h.y, rs, tr.id);
      tr.minBodyD = minBD;
      if (body.length) tr.body = body;
      if (fx != null) {
        const headLast = hyp(h.x - ex, h.y - ey) <= hyp(h.x - fx, h.y - fy);
        if (!headLast) reversePairs(wb);
        wb.push(h.x, h.y); tr.wb = wb; tr.L = L + hyp(h.x - (headLast ? ex : fx), h.y - (headLast ? ey : fy));
      } else { tr.wb = [h.x, h.y]; tr.L = 0; }
      if (tr.d < reach + 400) heads.push(makeHead(tr, me));
    }
    for (const [id, tr] of TR) if (tr.seenT !== t) { TR.delete(id); TRO.delete(tr.obj); DEATH.onGone(tr, t, me); }
    if (maxD > 0) DEATH.viewR = Math.max(maxD, DEATH.viewR * 0.998);
    let arena = null;
    const cx = num(W.grd, NaN), R = num(W.flux_grd, NaN);
    if (fin(cx) && fin(R) && R > 500) {
      if (hyp(me.x - cx, me.y - cx) < R) arena = { cx, cy: cx, R }; else arenaBad = true;
    }
    if (arenaBad) arena = null;
    heads.sort((a, b) => a.d - b.d);
    return { t, me, grid, heads: heads.slice(0, 12), allHeads: heads, nb, arena };
  }

  /* ================= 6. Qamal xaritasi: flood-fill ================= */
  function buildTrap(env) {
    const { me, grid, heads, arena } = env, c = CFG.cell, R = CFG.gridR, N = Math.ceil(2 * R / c);
    const ox = me.x - R, oy = me.y - R, NN = N * N;
    const occ = new Uint8Array(NN), occ2 = new Uint8Array(NN), base = new Uint8Array(NN);
    for (let iy = 0; iy < N; iy++) for (let ix = 0; ix < N; ix++) {
      const x = ox + (ix + 0.5) * c, y = oy + (iy + 0.5) * c, i = iy * N + ix;
      if ((x - me.x) ** 2 + (y - me.y) ** 2 > R * R) { occ[i] = 2; occ2[i] = 2; base[i] = 2; continue; }
      if (arena && hyp(x - arena.cx, y - arena.cy) > arena.R - me.r - CFG.margin) { occ[i] = 1; occ2[i] = 1; base[i] = 1; }
    }
    const occN = base.slice();
    const mark = (ax, ay, bx, by, r, extra, only2, rN = 0) => {
      const rr = r + extra;
      const x0 = Math.max(0, Math.floor((Math.min(ax, bx) - rr - ox) / c)), x1 = Math.min(N - 1, Math.floor((Math.max(ax, bx) + rr - ox) / c));
      const y0 = Math.max(0, Math.floor((Math.min(ay, by) - rr - oy) / c)), y1 = Math.min(N - 1, Math.floor((Math.max(ay, by) + rr - oy) / c));
      for (let iy = y0; iy <= y1; iy++) for (let ix = x0; ix <= x1; ix++) {
        const i = iy * N + ix; if (occ[i] === 2) continue;
        const d = ptSeg(ox + (ix + 0.5) * c, oy + (iy + 0.5) * c, ax, ay, bx, by);
        if (d < r && !only2) { occ[i] = 1; occ2[i] = 1; if (d < rN) occN[i] = 1; } else if (d < rr) occ2[i] = 1;
      }
    };
    for (const p of grid.all) {
      if (ptSeg(me.x, me.y, p.ax, p.ay, p.bx, p.by) > R + p.r) continue;
      mark(p.ax, p.ay, p.bx, p.by, p.r, c * 0.75, false, Math.max(p.r * 0.72, p.r - 0.25 * me.r - CFG.margin));
    }
    for (const h of heads) {
      if (h.d > R + 400) continue;
      const P = h.pred, n = Math.min(P.length / 2 - 1, Math.round(0.75 / CFG.dt));
      for (let i = 2; i <= n; i += 2) mark(P[2 * i - 4], P[2 * i - 3], P[2 * i], P[2 * i + 1], h.rs + CFG.headU[0] + CFG.headU[1] * i * CFG.dt * 0.5, 0, true);
    }
    const ring = (arr, i) => {
      const ix = i % N, iy = (i / N) | 0;
      return ix === 0 || iy === 0 || ix === N - 1 || iy === N - 1 ||
        arr[i - 1] === 2 || arr[i + 1] === 2 || arr[i - N] === 2 || arr[i + N] === 2;
    };
    const Q = new Int32Array(NN);
    const bfs = arr => {
      const D = new Int32Array(NN).fill(-1), B = [[]];
      for (let i = 0; i < NN; i++) if (arr[i] === 0 && ring(arr, i)) { D[i] = 0; B[0].push(i); }
      for (let d = 0; d < B.length; d++) {
        const L = B[d]; if (!L) continue;
        for (let q = 0; q < L.length; q++) {
          const i = L[q]; if (D[i] !== d) continue;
          const ix = i % N, iy = (i / N) | 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const jx = ix + dx, jy = iy + dy; if (jx < 0 || jy < 0 || jx >= N || jy >= N) continue;
            const j = jy * N + jx; if (arr[j] !== 0) continue;
            if (dx && dy && (arr[iy * N + jx] !== 0 || arr[jy * N + ix] !== 0)) continue;
            const nd = d + (dx && dy ? 3 : 2);
            if (D[j] < 0 || nd < D[j]) { D[j] = nd; (B[nd] || (B[nd] = [])).push(j); }
          }
        }
      }
      return D;
    };
    const D1 = bfs(occ), D2 = bfs(occ2);
    const cellOf = (x, y) => {
      const ix = Math.floor((x - ox) / c), iy = Math.floor((y - oy) / c);
      return (ix < 0 || iy < 0 || ix >= N || iy >= N) ? -1 : iy * N + ix;
    };
    const nearFree = (arr, m0) => {
      if (m0 < 0 || arr[m0] === 0) return m0;
      let best = -1, bd = 1e9; const mx = m0 % N, my = (m0 / N) | 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const jx = mx + dx, jy = my + dy; if (jx < 0 || jy < 0 || jx >= N || jy >= N) continue;
        const j = jy * N + jx; if (arr[j] === 0 && dx * dx + dy * dy < bd) { bd = dx * dx + dy * dy; best = j; }
      }
      return best;
    };
    const m0 = cellOf(me.x, me.y), m = nearFree(occ, m0), m2 = nearFree(occ2, m0);
    let area = 0, free = 0;
    const seen = new Uint8Array(NN);
    for (let i = 0; i < NN; i++) if (occ[i] === 0) free++;
    if (m >= 0) {
      let h = 0, tl = 0; Q[tl++] = m; seen[m] = 1;
      while (h < tl) {
        const i = Q[h++], ix = i % N, iy = (i / N) | 0; area++;
        const nb = [ix > 0 ? i - 1 : -1, ix < N - 1 ? i + 1 : -1, iy > 0 ? i - N : -1, iy < N - 1 ? i + N : -1];
        for (const j of nb) if (j >= 0 && !seen[j] && occ[j] === 0) { seen[j] = 1; Q[tl++] = j; }
      }
    }
    const d1 = m >= 0 ? D1[m] : -1, d2 = m2 >= 0 ? D2[m2] : -1;
    const frac = free ? area / free : 0;
    const detour = d1 >= 0 ? d1 * c / 2 - R : null;
    const level = d1 < 0 ? 2 : (detour > 420 || area < 130 || (d2 < 0 && area < 350)) ? 1 : 0;
    const DR = d2 >= 0 ? D2 : D1;
    const descend = (D, i0) => {
      let i = i0;
      for (let s = 0; s < 7 && D[i] > 0; s++) {
        const ix = i % N, iy = (i / N) | 0; let bj = -1, bd = D[i];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const jx = ix + dx, jy = iy + dy; if (jx < 0 || jy < 0 || jx >= N || jy >= N) continue;
          const j = jy * N + jx; if (D[j] >= 0 && D[j] < bd) { bd = D[j]; bj = j; }
        }
        if (bj < 0) break; i = bj;
      }
      if (i === i0) return null;
      const x = ox + (i % N + 0.5) * c, y = oy + (((i / N) | 0) + 0.5) * c;
      return { x, y, a: Math.atan2(y - me.y, x - me.x) };
    };
    let nexit = null, center = null;
    if (d1 < 0 || area < 600) {
      const DN = bfs(occN), mN = nearFree(occN, m0);
      if (mN >= 0 && DN[mN] >= 0) nexit = descend(DN, mN);
      if (m >= 0) {
        const C = new Int32Array(NN).fill(-1); let h = 0, tl = 0;
        for (let i = 0; i < NN; i++) if (occ[i] !== 0) { C[i] = 0; Q[tl++] = i; }
        while (h < tl) {
          const i = Q[h++], ix = i % N, iy = (i / N) | 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const jx = ix + dx, jy = iy + dy; if ((!dx && !dy) || jx < 0 || jy < 0 || jx >= N || jy >= N) continue;
            const j = jy * N + jx; if (C[j] < 0) { C[j] = C[i] + 1; Q[tl++] = j; }
          }
        }
        let bi = -1, bv = -1, bd = 1e9;
        for (let i = 0; i < NN; i++) if (seen[i]) {
          const dd = Math.abs(i % N - m % N) + Math.abs(((i / N) | 0) - ((m / N) | 0));
          if (C[i] > bv || (C[i] === bv && dd < bd)) { bv = C[i]; bi = i; bd = dd; }
        }
        if (bi >= 0) center = { x: ox + (bi % N + 0.5) * c, y: oy + (((bi / N) | 0) + 0.5) * c, clr: bv * c };
      }
    }
    const exit = m >= 0 && DR[m] >= 0 ? descend(DR, m) : null;
    const dAt = (x, y) => { const i = cellOf(x, y); return i < 0 ? 0 : DR[i] >= 0 ? DR[i] : 9999; };
    return { N, c, ox, oy, occ, occ2, D1, D2, level, d1, d2, detour: r0(detour), area, frac: r2(frac), exit, nexit, center, cellOf, dAt,
             dHere: m >= 0 && DR[m] >= 0 ? DR[m] : 9999 };
  }

  /* ================= 7. Trayektoriya simulyatsiyasi (3.2: Ishorali burilish delta kinematikasi) =================
     kinPath(me, delta, boost, cmd0) da delta ∈ [-3.0, +3.0] — boshimizning hozirgi burchagidan (me.ang) qaysi tomonga
     va qancha burilish kerakligini bildiradi (delta > 0: soat miliga teskari, delta < 0: soat mili bo'yicha).
     Shu sababli +2.75 rad va -2.75 rad burilishlar hech qachon bir-biriga aralashib ketmaydi! */
  const NSTEP = Math.round(CFG.horizon / CFG.dt);
  function kinPath(me, delta, boost, cmd0) {
    const dt = CFG.dt, P = new Float64Array(2 * (NSTEP + 1)), A = new Float64Array(NSTEP + 1);
    let x = me.x, y = me.y, a = me.ang, sp = me.sp, rem = delta;
    const spT = boost ? me.spB : me.spN, w = PHY.effW(me, boost);
    P[0] = x; P[1] = y; A[0] = a;
    for (let i = 1; i <= NSTEP; i++) {
      const t = i * dt;
      let da;
      if (t <= CFG.latency) {
        const dd0 = cmd0 != null ? dAng(cmd0, a) : PHY.myW * dt;
        da = clamp(0.5 * dd0 + 0.5 * PHY.myW * dt, -w * dt, w * dt);
        rem -= da;
      } else {
        da = clamp(rem, -w * dt, w * dt);
        rem -= da;
      }
      const am = a + da / 2; a = wrap(a + da);
      if (t > CFG.latency) sp = sp < spT ? Math.min(spT, sp + PHY.accUp * dt) : Math.max(spT, sp - PHY.accDown * dt);
      const v = sp * PHY.k; x += Math.cos(am) * v * dt; y += Math.sin(am) * v * dt;
      P[2 * i] = x; P[2 * i + 1] = y; A[i] = a;
    }
    return { P, A };
  }

  // aimOrDelta: agar opt.isDelta bo'lsa ishorali delta, aks holda dunyo burchagi aim (dAng(aim, me.ang) ga o'giriladi)
  function simulate(env, aimOrDelta, boost, cmd0, opt = S.simOpt) {
    const { me, grid, heads, arena } = env, dt = CFG.dt, U = CFG.headU, HT = CFG.headHardT;
    const delta = (opt && opt.isDelta) ? aimOrDelta : dAng(aimOrDelta, me.ang);
    const aim = wrap(me.ang + delta);
    const { P } = kinPath(me, delta, boost, cmd0), out = {};
    const vMax = me.spB * PHY.k;
    const effSp = boost ? Math.max(me.sp, me.spB * 0.85) : me.sp;
    const spBuf = (opt && opt.cut) ? 0 : Math.max(0, (effSp - me.spN - 1.0) * 1.35);
    const reqSafeT = CFG.safeT + (effSp > me.spN + 2.0 ? 0.16 : 0);
    let minGap = 60, nearGap = 60, ttc = Infinity, risk = 0, who = null, stop = NSTEP;
    let g0 = grid.gap(me.x, me.y, me.x, me.y, 60) - spBuf * 0.5;
    for (const h of heads) g0 = Math.min(g0, hyp(me.x - h.x, me.y - h.y) - h.rs);
    for (let i = 1; i <= NSTEP; i++) {
      const t = i * dt, x0 = P[2 * i - 2], y0 = P[2 * i - 1], x = P[2 * i], y = P[2 * i + 1];
      const stepBuf = t <= 0.55 ? spBuf * (1 - t * 0.7) : 0;
      let g = grid.gap(x0, y0, x, y, 60, out) - stepBuf, gw = out.cap ? out.cap.id : null;
      if (arena) { const ga = arena.R - me.r - CFG.margin - hyp(x - arena.cx, y - arena.cy) - stepBuf; if (ga < g) { g = ga; gw = 'chegara'; } }
      const u = U[0] + U[1] * t + U[2] * t * t;
      for (let k = 0; k < heads.length; k++) {
        const h = heads[k], H = h.pred, own = !!opt && h.id === opt.id;
        if (h.d > (vMax + h.v * 1.6) * t + h.rs + 200) continue;
        const ds = segSeg(x0, y0, x, y, H[2 * i - 2], H[2 * i - 1], H[2 * i], H[2 * i + 1]);
        if (own && opt.cut) {
          if (t <= opt.ht) {
            const rCore = h.r * 0.72 + me.r * 0.30 + 3;
            const gh = ds - rCore;
            if (gh < g) { g = gh; gw = h.id; }
          }
          continue;
        }
        if (t <= (own ? opt.ht : HT)) {
          const gh = ds - h.rs - u * (own ? opt.uK : 0.85) - stepBuf * 0.5;
          if (gh < g) { g = gh; gw = h.id; }
        }
        const trailLim = own ? opt.ht : Math.min(HT, 0.72);
        for (let q = 0; (q + 1) < i && q * dt <= trailLim; q += 2) {
          const q2 = Math.min(i - 1, q + 2);
          const gt = segSeg(x0, y0, x, y, H[2 * q], H[2 * q + 1], H[2 * q2], H[2 * q2 + 1]) - h.rs - (U[0] + U[1] * q * dt) * 0.4;
          if (gt < g) { g = gt; gw = h.id; }
        }
        const soft = h.rs + u * 0.7 + 22 * t * t + (h.boosting ? 24 : 12);
        if (ds < soft && !(own && t > opt.ht)) risk += (soft - ds) * dt * (h.boosting ? 1.2 : 0.75);
      }
      const th = g0 < 0 ? Math.min(0, g0 - 3 + 65 * Math.max(0, t - 0.30)) : 0;
      if (g < minGap) { minGap = g; who = gw; }
      if (t <= reqSafeT && g < nearGap) nearGap = g;
      if (g < th && ttc === Infinity) ttc = t;
      if (g < th - 25) { stop = i; break; }
    }
    for (let j = stop + 1; j <= NSTEP; j++) { P[2 * j] = P[2 * stop]; P[2 * j + 1] = P[2 * j + 1]; }
    const isSafe = ttc > reqSafeT;
    return { aim, delta, steer: steerFromDelta(me.ang, delta), boost: !!boost, path: P, ttc,
             gap: isSafe ? nearGap : minGap, fullGap: minGap, g0, risk, who, safe: isSafe,
             ex: P[2 * NSTEP], ey: P[2 * NSTEP + 1] };
  }

  function crossPaths(K, H, h) {
    const P = K.P, dt = CFG.dt, n = NSTEP, m = H.length / 2 - 1;
    for (let i = 1; i <= n; i++) {
      const ax = P[2 * i - 2], ay = P[2 * i - 1], bx = P[2 * i], by = P[2 * i + 1];
      for (let j = 1; j <= m; j++) {
        const X = segX(ax, ay, bx, by, H[2 * j - 2], H[2 * j - 1], H[2 * j], H[2 * j + 1]);
        if (!X) continue;
        return { th: (i - 1 + X.s) * dt, tc: (j - 1 + X.q) * dt, cx: ax + (bx - ax) * X.s, cy: ay + (by - ay) * X.s,
                 ourDir: Math.atan2(by - ay, bx - ax), enDir: Math.atan2(H[2 * j + 1] - H[2 * j - 1], H[2 * j] - H[2 * j - 2]) };
      }
    }
    if (h) {
      const blockR = h.rs + 34;
      for (let j = 2; j <= m; j++) {
        const hx = H[2 * j], hy = H[2 * j + 1], tc = j * dt;
        const enDir = Math.atan2(hy - H[2 * j - 2], hx - H[2 * j - 1]);
        for (let i = 1; i <= j; i++) {
          const ax = P[2 * i - 2], ay = P[2 * i - 1], bx = P[2 * i], by = P[2 * i + 1];
          const d = ptSeg(hx, hy, ax, ay, bx, by);
          if (d <= blockR && (i - 0.5) * dt < tc - 0.03) {
            return { th: (i - 0.5) * dt, tc, cx: (ax + bx) / 2, cy: (ay + by) / 2,
                     ourDir: Math.atan2(by - ay, bx - ax), enDir };
          }
        }
      }
    }
    return null;
  }

  // 3.2: Nurlar ISHORALI delta bo'yicha yaratiladi va tekshiriladi — chapga U-burilish (+2.8) va o'ngga U-burilish (-2.8)
  // ikkalasi ham doim mavjud!
  function evalRays(env, specials, cmd0, nRays) {
    const me = env.me, out = [], usedD = [];
    const baseOpt = S.simOpt ? Object.assign({}, S.simOpt, { isDelta: true }) : { isDelta: true };
    const addDelta = d => {
      if (!fin(d)) return;
      d = clamp(d, -2.90, 2.90);
      for (const b of usedD) if (Math.abs(d - b) < 0.035) return;
      usedD.push(d);
      out.push(simulate(env, d, false, cmd0, baseOpt));
    };
    for (const a of specials) {
      if (!fin(a)) continue;
      const d = dAng(a, me.ang);
      addDelta(d);
      // Agar nishon orqada (|d| > 2.1) bo'lsa, ham chapdan, ham o'ngdan U-burilishni sinab ko'ramiz!
      if (Math.abs(d) > 2.1) addDelta(d > 0 ? d - TAU : d + TAU);
    }
    for (let i = 0; i <= nRays; i++) {
      const d = -2.85 + (2 * 2.85 * i) / nRays;
      addDelta(d);
    }
    return out;
  }

  const WEIGHTS = {
    FORAGE: { clear: 0.35, goal: 1.95, harvest: 2.3, turn: 2.4, stab: 3.5, risk: 0.75, open: 0.35, pocket: 1, maxTurn: 2.3, conc: 0.6 },
    LOOT:   { clear: 0.30, goal: 2.60, harvest: 3.4, turn: 1.0, stab: 1.4, risk: 0.65, open: 0.25, pocket: 0.8, maxTurn: 2.7, conc: 0.35 },
    LOOP:   { clear: 0.8,  goal: 1.0,  harvest: 0,   turn: 3,   stab: 8,   risk: 1.4,  open: 0.8,  pocket: 1, maxTurn: 1.6, conc: 0.8 },
    EVADE:  { clear: 2.6,  goal: 0.25, harvest: 0.2, turn: 1.2, stab: 5.5, risk: 2.8,  open: 1.3,  pocket: 1, maxTurn: null, conc: 0.9 },
    ESCAPE: { clear: 1.5,  goal: 1.5,  harvest: 0,   turn: 0.8, stab: 6.0, risk: 2.2,  open: 3.2,  pocket: 0, maxTurn: null, conc: 1.5 },
    EXIT:   { clear: 0.9,  goal: 0,    harvest: 0.8, turn: 3.5, stab: 5,   risk: 1.2,  open: 0.4,  pocket: 1, maxTurn: null, conc: 0.4 },
    COIL:   { clear: 0.8,  goal: 2.6,  harvest: 0,   turn: 0.5, stab: 2.5, risk: 0.6,  open: 0.3,  pocket: 0, maxTurn: null, conc: 0 },
    ASSIST: { clear: 1.0,  goal: 2.0,  harvest: 0,   turn: 1,   stab: 4,   risk: 1.8,  open: 0.3,  pocket: 0, maxTurn: null, conc: 0 },
  };
  let CONC = [];
  const concOf = P => { let x0 = 1e12, y0 = 1e12, x1 = -1e12, y1 = -1e12; for (let i = 0; i + 1 < P.length; i += 2) { x0 = Math.min(x0, P[i]); x1 = Math.max(x1, P[i]); y0 = Math.min(y0, P[i + 1]); y1 = Math.max(y1, P[i + 1]); } return { P, x0, y0, x1, y1 }; };
  function concPen(x, y) {
    let p = 0;
    for (const c of CONC) {
      if (x < c.x0 || x > c.x1 || y < c.y0 || y > c.y1) continue;
      const a = Math.abs(winding(c.P, x, y, 1200)); if (a > 0.95 * Math.PI) p += (a - 0.95 * Math.PI) * 75;
    }
    return p;
  }

  function harvestAlongRay(r, me, foods) {
    const eatR = me.r + 56, P = r.path, maxIdx = Math.min(P.length, 2 * Math.round(1.15 / CFG.dt));
    let total = 0;
    const orbs = S.nearOrbs;
    if (orbs && orbs.length) {
      for (let k = 0; k < orbs.length; k++) {
        const o = orbs[k];
        let minD = 1e9, hitStep = 99;
        for (let i = 2; i < maxIdx; i += 2) {
          const d = hyp(o.x - P[i], o.y - P[i + 1]);
          if (d < minD) { minD = d; hitStep = i >> 1; }
        }
        if (minD < eatR) {
          total += o.val / (1 + hitStep * 0.08) * (1 - minD / (eatR * 1.35));
        }
      }
    } else if (foods && foods.length) {
      for (let k = 0; k < foods.length; k++) {
        const f = foods[k];
        if (f.d > 520) continue;
        let minD = 1e9, hitStep = 99;
        for (let i = 2; i < maxIdx; i += 2) {
          const d = hyp(f.x - P[i], f.y - P[i + 1]);
          if (d < minD) { minD = d; hitStep = i >> 1; }
        }
        if (minD < eatR + 18) {
          total += (f.mass + 3.5 * f.loot) / (1 + hitStep * 0.08) * (1 - minD / ((eatR + 18) * 1.4));
        }
      }
    }
    return Math.min(340, total * 2.6);
  }

  function scoreRay(r, me, w, goal, prevCmd, trap, exitDir) {
    const rDelta = r.delta != null ? r.delta : dAng(r.aim, me.ang);
    const prevDelta = S.cmdDelta != null ? S.cmdDelta : (prevCmd == null ? 0 : dAng(prevCmd, me.ang));
    // Xavfli nurlar orasida ham ishorali burilish uzluksizligi saqlanadi (chap-o'ng sakrash bo'lmaydi!)
    if (!r.safe) return -1e6 + r.ttc * 2e4 + clamp(r.gap, -100, 60) * 35 - r.risk * 2 - 90 * Math.abs(rDelta - prevDelta);
    let s = w.clear * Math.min(r.gap, 30) + (fin(r.ttc) ? -140 / (r.ttc + 0.15) : 0) - w.risk * r.risk;
    const turn = Math.abs(rDelta);
    s -= w.turn * turn + w.stab * Math.abs(rDelta - prevDelta);
    // Agar hozir katta burilish (|prevDelta| > 0.65) bajarilayotgan bo'lsa, burilish ishorasini o'zgartirishga kuchli jarima!
    if (Math.abs(prevDelta) > 0.65 && Math.abs(rDelta) > 0.55 && Math.sign(rDelta) !== Math.sign(prevDelta)) {
      s -= 75;
    }
    if (w.maxTurn != null && turn > w.maxTurn) s -= 400 * (turn - w.maxTurn);
    if (goal && w.goal) {
      const d0 = hyp(goal.x - me.x, goal.y - me.y); let best = d0;
      for (let i = 2; i < r.path.length; i += 2) best = Math.min(best, hyp(goal.x - r.path[i], goal.y - r.path[i + 1]));
      s += w.goal * Math.min(350, d0 - best) * 0.62;
    }
    if (w.harvest) {
      s += w.harvest * harvestAlongRay(r, me, S.foods);
    }
    if (trap) {
      const d0 = trap.dHere, d1 = trap.dAt(r.ex, r.ey);
      s += w.open * clamp(d0 - d1, -20, 20) * 10;
      if (w.pocket && d0 < 9999 && d1 >= 9999) s -= 300 * w.pocket;
    }
    if (exitDir != null && Math.abs(dAng(r.aim, exitDir)) > 0.65) s -= 500;
    if (w.conc && CONC.length) s -= w.conc * concPen(r.ex, r.ey);
    return s;
  }

  /* ================= 8. Hujum: Yonma-yon Siquv (PINCH) + Tig'iz Kesish (CUT) + Qarshi Kesish ================= */
  const topWhy = o => { let k = null, v = -1; for (const x in o) if (o[x] > v) { v = o[x]; k = x; } return k; };
  const ATK = {
    cur: null, cool: new Map(), globalCool: 0, lastEval: -1e9, why: 'kutilmoqda', obs: [],
    stats: null,
    reset() {
      this.cur = null; this.cool.clear(); this.globalCool = 0; this.lastEval = -1e9; this.why = 'kutilmoqda'; this.obs = [];
      this.stats = { started: 0, races: 0, raceToCut: 0, counter: 0, aborted: 0, crossed: 0, ended: 0, abortWhy: {}, outcomes: {} }; this.whyHist = {};
    },
    recentTarget(id, t) { return this.obs.some(o => o.id === id && t - o.t < 4500); },
    watch(id, t, src, crossed) {
      const o = this.obs.find(x => x.id === id && !x.done);
      if (o) { o.t = t; o.crossed = o.src === src ? o.crossed || crossed : crossed; o.src = src; } else this.obs.push({ id, t, src, done: false, crossed });
    },
    plan(env, opts = {}) {
      const me = env.me, vB = me.spB * PHY.k, why = {}, cand = [], RX = opts.aimC != null, CT = !!opts.counter;
      const no = k => { why[k] = (why[k] || 0) + 1; };
      let shared = null;
      for (const h of env.heads) {
        if (opts.only != null && h.id !== opts.only) continue;
        if (!RX) {
          if (opts.only == null && !CT && (this.cool.get(h.id) || 0) > env.t) { no('tanaffus'); continue; }
          if (h.d < 30 || h.d > (CT ? 380 : CFG.attackMaxD)) { no('masofa'); continue; }
          if (h.age < 0.12) { no('kuzatuv qisqa'); continue; }
          if (Math.abs(h.w) > (CT ? 4.2 : (h.d < 240 ? 3.4 : 2.4))) { no('nishon burilmoqda'); continue; }
        } else if (Math.abs(h.w) > (CT ? 4.5 : (h.d < 340 ? 3.8 : 3.0))) { no('nishon keskin burildi'); continue; }
        if (h.v < 45) { no('nishon sekin'); continue; }
        if (!RX && !CT && h.sct < CFG.attackMinTsct) { no('nishon mayda'); continue; }
        const vN = me.spN * PHY.k, tBoost = h.v > 1.25 * vN;
        const ux = Math.cos(h.ang), uy = Math.sin(h.ang), rx = me.x - h.x, ry = me.y - h.y;
        const along = rx * ux + ry * uy, lat = Math.abs(cross(ux, uy, rx, ry));
        const sideBySide = along >= -25 && lat < 240 && Math.abs(dAng(h.ang, me.ang)) < 1.15;
        const aims = [];
        if (RX) for (const o of [-0.52, -0.36, -0.24, -0.12, 0, 0.12, 0.24, 0.36, 0.52]) {
          const a = wrap(opts.aimC + o);
          aims.push({ aim: a, delta: dAng(a, me.ang), off: o });
        } else {
          if (!shared) {
            shared = [];
            for (let o = -1.75; o <= 1.7501; o += 0.10) shared.push({ aim: wrap(me.ang + o), delta: o, off: o });
          }
          for (const a of shared) aims.push(a);
        }
        const H = h.pred, nS = H.length / 2 - 1;
        const side = Math.sign(cross(ux, uy, rx, ry)) || 1;
        if (!opts.noIp) for (const ti of [0.10, 0.18, 0.28, 0.42, 0.60, 0.82, 1.10, 1.38]) {
          const j = Math.min(nS - 1, Math.round(ti / CFG.dt));
          const ex = H[2 * j + 2] - H[2 * j], ey = H[2 * j + 3] - H[2 * j + 1], el = hyp(ex, ey) || 1;
          const nx = side * ey / el, ny = -side * ex / el;
          for (const D of [15, 45, 95, 165, 240]) {
            const a = Math.atan2(H[2 * j + 1] + ny * D - me.y, H[2 * j] + nx * D - me.x);
            if (RX && Math.abs(dAng(a, opts.aimC)) > 0.78) continue;
            const dl = dAng(a, me.ang);
            if (Math.abs(dl) > 2.35) continue;
            aims.push({ aim: a, delta: dl, off: dl, ip: true });
          }
        }
        for (const p of aims) {
          if (!p.K) p.K = kinPath(me, p.delta, true, S.steer);
          const X = crossPaths(p.K, H, h);
          if (!X) { no('kesishuv yo\'q'); continue; }
          const sinX = Math.abs(Math.sin(X.ourDir - X.enDir));
          if (sinX < (sideBySide ? 0.16 : RX ? 0.20 : CT ? 0.22 : 0.26)) { no('burchak kichik'); continue; }
          if (X.th < 0.02 || X.th > (RX ? 1.45 : CT ? 1.15 : 1.30) || X.tc > (RX ? 1.90 : 1.75)) { no('vaqt oynasi'); continue; }
          const lead = X.tc - X.th;
          const minClearSec = (h.r * 0.70 + me.r * 0.30 + 4) / Math.max(h.v, 60) + (tBoost && !sideBySide ? 0.06 : 0.015);
          const leadMin = minClearSec * (RX ? 0.55 : CT ? 0.65 : sideBySide ? 0.70 : 0.88);
          if (lead < leadMin) { no(tBoost && !sideBySide ? 'nishon boostda' : 'kechikamiz'); continue; }
          if (tBoost && !sideBySide && X.tc > 1.25 && !CT) { no('nishon boostda'); continue; }
          if (X.tc + (RX ? 0.04 : 0.10) > X.th + me.L / vB * 0.95) { no('tana qisqa'); continue; }
          const need = 0.22 + (Math.PI / 2) / Math.max(PHY.wN, 1.8);
          const diff = need / Math.max(X.tc, 0.10);
          if (!CT && diff < (RX ? 0.20 : 0.28)) { no('nishon qochib ulguradi'); continue; }
          const closeCutBonus = (h.d < 260 ? 28 : 0) + (sideBySide ? 24 : 0) + (X.tc < 0.75 ? 24 : 0) + (lead <= 0.36 ? 18 : 0);
          const sc = 70 * Math.min(diff, 1.8) + 26 * sinX + closeCutBonus - 24 * X.th - 3.5 * Math.abs(p.off) + Math.min(25, h.sct / 15);
          cand.push(Object.assign({ h, aim: p.aim, delta: p.delta, lead, diff, sinX, sc, ip: !!p.ip }, X));
        }
      }
      cand.sort((a, b) => b.sc - a.sc);
      for (const c of cand.slice(0, 6)) {
        const r = simulate(env, c.delta, true, S.steer, { id: c.h.id, ht: c.th, uK: 0, cut: true, isDelta: true });
        if ((r.safe || (CT && r.ttc > c.th + 0.25)) && r.gap >= (RX ? 1 : CT ? 0 : 3)) { c.ray = r; return { best: c, why }; }
        no('yo\'l xavfli');
      }
      return { best: null, why };
    },
    commit(b, env, kind) {
      const t = env.t, me = env.me, h = b.h, prev = this.cur;
      const side0 = Math.sign(cross(Math.cos(h.ang), Math.sin(h.ang), me.x - h.x, me.y - h.y)) || 1;
      this.cur = { id: h.id, phase: 'COMMIT', kind, counter: kind === 'counter', aim: b.aim, cx: b.cx, cy: b.cy, ourDir: b.ourDir,
                   tcAbs: t + b.tc * 1000, thAbs: t + b.th * 1000, started: t, raceStart: prev ? prev.started : null, fails: 0, unsafeN: 0,
                   side0, ray: b.ray, sct0: prev ? prev.sct0 : me.sct,
                   plan: { th: r2(b.th), tc: r2(b.tc), lead: r2(b.lead), diff: r2(b.diff), sin: r2(b.sinX), ip: b.ip, d: r0(h.d), tsct: h.sct, L: r0(me.L) } };
      if (kind === 'counter') this.stats.counter++;
      if (prev && prev.phase === 'RACE') this.stats.raceToCut++; else this.stats.started++;
      this.why = 'hujum bajarilmoqda';
      this.watch(h.id, t, kind, false);
      LOG.atk(kind === 'counter' ? 'counter' : 'start', this.cur, env);
    },
    raceCand(env) {
      const me = env.me;
      if (me.sct < CFG.raceMinSct || me.L < 240) return null;
      let best = null;
      for (const h of env.heads) {
        if ((this.cool.get(h.id) || 0) > env.t || h.age < 0.12 || h.sct < CFG.attackMinTsct || h.d > 680) continue;
        const ux = Math.cos(h.ang), uy = Math.sin(h.ang), rx = me.x - h.x, ry = me.y - h.y;
        const along = rx * ux + ry * uy, lat = cross(ux, uy, rx, ry), absLat = Math.abs(lat);
        if (h.boosting && (along < -40 || absLat > 240)) continue;
        if (Math.abs(dAng(h.ang, me.ang)) > 1.45 || Math.abs(h.w) > 2.0) continue;
        const minLat = h.r + me.r * 0.4 + 6;
        if (along < -360 || along > 260 || absLat < minLat || absLat > 400) continue;
        const sc = Math.min(45, h.sct) + 40 - absLat * 0.08 - Math.max(0, -along) * 0.05 + (along >= -15 ? 25 : 0);
        if (!best || sc > best.sc) best = { h, sc, lat, along };
      }
      return best;
    },
    raceAim(h, me) {
      const ux = Math.cos(h.ang), uy = Math.sin(h.ang), rx = me.x - h.x, ry = me.y - h.y;
      const along = rx * ux + ry * uy, lat = cross(ux, uy, rx, ry), s = Math.sign(lat) || 1;
      const gapLat = Math.abs(lat) - (h.r + me.r * 0.5);
      if (along > 40 && gapLat < 220) {
        return wrap(h.ang - s * clamp(0.85 + (along - 40) / 135, 0.78, 1.55));
      }
      if (along >= -5 && gapLat < 250) {
        const pinchAng = clamp(0.38 + (along + 5) / 105 + clamp((90 - gapLat) / 260, -0.1, 0.24), 0.30, 0.88);
        return wrap(h.ang - s * pinchAng);
      }
      return wrap(h.ang - s * clamp((gapLat - 24) / 125, -0.22, 0.58));
    },
    tryStart(env, blocked, flags = {}) {
      const t = env.t, me = env.me;
      if (!flags.counter && t - this.lastEval < 50) return false;
      this.lastEval = t;
      const no = w => { this.why = w; const k = w.split(' ')[0] === 'uzunlik' ? 'uzunlik' : w; this.whyHist[k] = (this.whyHist[k] || 0) + 1; return false; };
      if (!S.hunt) return no('hujum o\'chiq (H)');
      if (me.sct < (flags.counter ? 8 : CFG.attackMinSct)) return no('uzunlik ' + me.sct + '/' + CFG.attackMinSct);
      if (blocked && !flags.counter) return no(blocked);
      if (!flags.counter && t < this.globalCool) return no('umumiy tanaffus');
      const res = this.plan(env, { counter: !!flags.counter, only: flags.targetId });
      if (res.best && res.best.sc >= (flags.counter ? 12 : 22)) {
        if (COIL.cur) COIL.abort(t, 'kesish ustun');
        this.commit(res.best, env, flags.counter ? 'counter' : 'cut');
        return true;
      }
      if (flags.counter && flags.targetId != null) {
        const resAny = this.plan(env, { counter: true });
        if (resAny.best && resAny.best.sc >= 12) {
          if (COIL.cur) COIL.abort(t, 'kesish ustun');
          this.commit(resAny.best, env, 'counter');
          return true;
        }
      }
      if (!flags.counter && !COIL.cur) {
        const rc = this.raceCand(env);
        if (rc) {
          const aim = this.raceAim(rc.h, me), r = simulate(env, dAng(aim, me.ang), true, S.steer, { id: rc.h.id, ht: 0.45, uK: 0, cut: true, isDelta: true });
          if (r.safe && r.gap >= 3) {
            this.cur = { id: rc.h.id, phase: 'RACE', kind: 'race', aim, started: t, sct0: me.sct, unsafeN: 0, lastPlan: t, cx: rc.h.x, cy: rc.h.y,
                         plan: { lat: r0(rc.lat), along: r0(rc.along), d: r0(rc.h.d), tsct: rc.h.sct } };
            this.stats.races++; this.why = 'yonma-yon siquv';
            this.watch(rc.h.id, t, 'race', false);
            LOG.atk('race', this.cur, env);
            return true;
          }
          return no('quvish yo\'li xavfli');
        }
      }
      return no(res.best ? 'foyda kam' : (topWhy(res.why) || 'yaqin raqib yo\'q'));
    },
    update(env) {
      const t = env.t, me = env.me;
      this.obs = this.obs.filter(o => { if (t - o.t < 4500) return true; if (!o.done) this.outcome(o.id, 'survived'); return false; });
      const c = this.cur; if (!c) return;
      const h = env.heads.find(x => x.id === c.id);
      const trc = TR.get(c.id);
      if (!h && trc && trc.dead) return this.end(t, 'nishon o\'ldi');
      if (c.phase !== 'EXIT') this.watch(c.id, t, c.kind, false);
      if (!c.counter && c.phase !== 'EXIT' && S.trapLvl >= 2) return this.abort(t, 'qamal');
      if (c.phase === 'RACE') {
        if (!h) return this.abort(t, 'nishon ko\'rinmay qoldi');
        if (t - c.started > CFG.raceMs) return this.abort(t, 'quvish vaqti tugadi');
        if (me.sct < c.sct0 * (1 - CFG.raceCost) - 1) return this.abort(t, 'boost qimmat');
        const ux = Math.cos(h.ang), uy = Math.sin(h.ang), rx = me.x - h.x, ry = me.y - h.y;
        const along = rx * ux + ry * uy, lat = cross(ux, uy, rx, ry);
        if (Math.abs(dAng(h.ang, me.ang)) > 1.70 && along < 0) return this.abort(t, 'nishon burildi');
        if (h.boosting && along < -70) return this.abort(t, 'nishon uzoqlashdi');
        c.aim = this.raceAim(h, me); c.cx = h.x; c.cy = h.y;
        if (along > 10 && Math.abs(lat) < 180 && c.side0 && Math.sign(lat) !== c.side0) {
          c.phase = 'EXIT'; c.crossT = t; c.exitDir = wrap(me.ang - c.side0 * 0.25);
          c.exitUntil = t + 750;
          this.stats.crossed++; this.watch(c.id, t, c.kind, true); LOG.atk('cross', c, env);
          return;
        }
        if (!c.side0) c.side0 = Math.sign(lat) || 1;
        if (t - c.lastPlan >= 50) {
          c.lastPlan = t;
          const res = this.plan(env, { only: h.id });
          if (res.best && res.best.sc >= 16) this.commit(res.best, env, 'cut');
        }
        return;
      }
      if (c.phase === 'COMMIT') {
        if (!h) return this.abort(t, 'nishon ko\'rinmay qoldi');
        if (t - c.started > 2600) return this.abort(t, 'vaqt tugadi');
        const ux = Math.cos(h.ang), uy = Math.sin(h.ang), rx = me.x - h.x, ry = me.y - h.y;
        const lat = cross(ux, uy, rx, ry), ahead = rx * ux + ry * uy;
        const near = h.d - h.rs < 270 || hyp(me.x - c.cx, me.y - c.cy) < 125;
        if (Math.sign(lat) !== c.side0 && ahead > -h.rs * 0.5 && near) {
          c.phase = 'EXIT'; c.crossT = t; c.exitDir = wrap(me.ang - c.side0 * 0.25);
          c.exitUntil = t + clamp(c.tcAbs - t + 650, 450, 1350);
          this.stats.crossed++;
          this.watch(c.id, t, c.kind, true);
          LOG.atk('cross', c, env);
          return;
        }
        const res = this.plan(env, { only: c.id, aimC: c.aim, counter: c.counter });
        if (res.best) {
          const b = res.best; c.fails = 0;
          c.aim = wrap(c.aim + clamp(dAng(b.aim, c.aim), -0.40, 0.40));
          c.cx = b.cx; c.cy = b.cy; c.ourDir = b.ourDir; c.tcAbs = t + b.tc * 1000; c.thAbs = t + b.th * 1000; c.ray = b.ray;
        } else {
          if (h.d < 340 && ahead > -35 && Math.abs(lat) < 230) {
            const pAim = this.raceAim(h, me);
            const rHold = simulate(env, dAng(pAim, me.ang), true, S.steer, { id: c.id, ht: 0.40, uK: 0, cut: true, isDelta: true });
            if (rHold.safe && rHold.gap >= 2) {
              c.aim = pAim; c.fails = 0;
              return;
            }
          }
          c.fails++; c.lastWhy = topWhy(res.why);
          if (c.fails >= 5) return this.abort(t, 'reja buzildi: ' + c.lastWhy);
        }
      } else if (c.phase === 'EXIT') {
        if (h && h.d - h.rs < 120 && Math.abs(dAng(Math.atan2(h.y - me.y, h.x - me.x), me.ang)) < 1.2) return this.end(t, 'nishon oldinda');
        if (t > c.exitUntil) {
          this.end(t, 'chiqish tugadi');
          if (h && !c.counter) COIL.start(env, h, 'kesishdan keyin', true);
        }
      }
    },
    abort(t, why) {
      const c = this.cur; if (!c) return;
      const k = why.split(':')[0];
      this.stats.aborted++; this.stats.abortWhy[k] = (this.stats.abortWhy[k] || 0) + 1;
      this.cool.set(c.id, t + 1100); this.globalCool = t + (c.counter ? 250 : 300);
      LOG.atk('abort', c, null, why);
      this.cur = null; this.why = 'bekor: ' + why;
    },
    end(t, why) {
      const c = this.cur; if (!c) return;
      this.stats.ended++;
      this.cool.set(c.id, t + 1000); this.globalCool = t + 250;
      LOG.atk('end', c, null, why);
      this.cur = null;
    },
    outcome(id, kind, z) {
      const o = this.obs.find(x => x.id === id && !x.done); if (!o) return;
      o.done = true;
      const pre = o.src === 'coil' ? 'orash_' : o.src === 'counter' ? 'qarshi_' : o.src === 'race' ? 'quvish_' : '';
      const k = pre + kind + (o.src !== 'coil' && !o.crossed ? '_bekorQilingan' : '');
      this.stats.outcomes[k] = (this.stats.outcomes[k] || 0) + 1;
      LOG.atkOutcome(id, k, z);
    },
  };

  /* ================= 9. Ozuqa nishoni (3.2: Kvadratik Ufq + Tig'iz 130px Klaster + Raqib Soyasi) =================
     3.1 logda (t=0..11 s) bot d=464..1234 birlik uzoqdagi contested ozuqalarga qarab ketib, yaqin ozuqani yemagan.
     Endi:
     1) Klaster yadrosi 3×3 qo'shni katak (radius <= 135 px, σ = 75 px) bo'yicha hisoblanadi — faqat haqiqiy zich to'plamlar
        (macro >= 36 yoki corpse >= 8) LOOT hisoblanadi.
     2) Vaqt maxraji kvadratik: timeCost = eta + 0.20 + 0.35 * eta * eta. Uzoqdagi ozuqa qiymati masofa kvadratiga proporsional
        kamayadi, shuning uchun bot avval atrofidagi (d < 300) eng boy to'plamlarni chaqqonlik bilan supurib oladi!
     3) Raqib bizdan ancha oldin yetadigan (rival < eta * 0.78) uzoq to'plamlar 92% ga kesiladi (bekorga uzoqqa yugurmaydi!). */
  const BL = [];
  const blacklisted = (x, y, t) => BL.some(b => t < b.until && hyp(b.x - x, b.y - y) < 100);
  const blacklist = (x, y, t, ms) => { BL.push({ x, y, until: t + ms }); while (BL.length > 12) BL.shift(); };

  function foodTargets(env, trap) {
    const me = env.me, t = env.t, cell = 65, m = new Map(), R = 1400;
    const lootObj = new Map();
    for (const L of DEATH.lootSet()) lootObj.set(L.o, L.z.ourTarget ? 2.4 : 1.8);
    const nearOrbs = [];
    const add = (x, y, mass, corpseW, isBig) => {
      const dx = x - me.x, dy = y - me.y, d2 = dx * dx + dy * dy;
      if (d2 > R * R) return;
      if (d2 < 520 * 520) nearOrbs.push({ x, y, val: mass * (corpseW ? 3.0 : isBig ? 1.5 : 1.0) });
      const ix = Math.floor(x / cell), iy = Math.floor(y / cell), k = ix * 100003 + iy;
      let c = m.get(k); if (!c) m.set(k, c = { ix, iy, sx: 0, sy: 0, mass: 0, corpse: 0, big: 0, n: 0 });
      c.sx += x * mass; c.sy += y * mass; c.mass += mass; c.n++;
      if (corpseW) c.corpse += mass * corpseW;
      if (isBig) c.big++;
    };
    const f = Array.isArray(W.foods) ? W.foods : [];
    for (let i = 0; i < f.length; i++) {
      const o = f[i]; if (!o || o.eaten || !fin(o.xx) || !fin(o.yy)) continue;
      const sz = num(o.sz, 5), lw = lootObj.get(o) || 0;
      const mass = clamp(sz * sz, 1, 450) / 16;
      add(o.xx, o.yy, mass, lw, sz >= 8.5);
    }
    for (const pl of DEATH.pendingLoot(me, t)) add(pl.x, pl.y, pl.mass, pl.our ? 2.2 : 1.6, true);
    for (const p of (Array.isArray(W.preys) ? W.preys : [])) if (okObj(p) && !p.eaten) add(p.xx, p.yy, 16, 1.5, true);
    S.nearOrbs = nearOrbs;

    // Tig'iz 135px radiusdagi haqiqiy to'plam zichligi (faqat dx, dy ∈ [-2, 2])
    const cells = Array.from(m.values());
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      c.x = c.sx / c.mass; c.y = c.sy / c.mass;
      let macro = c.mass, macroCorpse = c.corpse, macroBig = c.big;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (!dx && !dy) continue;
        const nb = m.get((c.ix + dx) * 100003 + (c.iy + dy));
        if (!nb) continue;
        const dist2 = (c.x - nb.sx / nb.mass) ** 2 + (c.y - nb.sy / nb.mass) ** 2;
        if (dist2 < 140 * 140) {
          const w = Math.exp(-dist2 / (2 * 75 * 75));
          macro += nb.mass * w;
          macroCorpse += nb.corpse * w;
          if (dist2 < 110 * 110) macroBig += nb.big;
        }
      }
      c.macro = macro;
      // Haqiqiy o'lim ozuqasi yoki juda zich yirik ozuqalar to'plami:
      c.loot = macroCorpse >= 8 ? macroCorpse : ((macro >= 36 && macroBig >= 3) ? macro : 0);
    }

    const vN = me.spN * PHY.k, wEff = PHY.effW(me, false), Rt = vN / wEff, sa = Math.sin(me.ang), ca = Math.cos(me.ang);
    const cL = { x: me.x - sa * Rt, y: me.y + ca * Rt }, cR = { x: me.x + sa * Rt, y: me.y - ca * Rt };
    const out = [];
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i], x = c.x, y = c.y, d = hyp(x - me.x, y - me.y);
      if (d < me.r * 0.45) continue;
      if (c.loot < 8 && c.macro < 16 && (hyp(x - cL.x, y - cL.y) < Rt * 0.80 || hyp(x - cR.x, y - cR.y) < Rt * 0.80)) continue;
      if (blacklisted(x, y, t)) continue;
      if (env.grid.gap(x, y, x, y, 24) < (c.loot >= 10 ? 0 : 2)) continue;
      if (trap.dHere < 9999 && trap.dAt(x, y) >= 9999) continue;
      const ang = Math.atan2(y - me.y, x - me.x), turnA = Math.abs(dAng(ang, me.ang));
      const eta = d / vN + turnA / wEff;
      const etaB = d / (me.spB * PHY.k) + turnA / PHY.effW(me, true) + 0.10;
      let rival = Infinity, crowd = 0;
      for (const h of env.allHeads) {
        const dh = hyp(h.x - x, h.y - y); if (dh < 320) crowd++;
        rival = Math.min(rival, dh / Math.max(h.v, 60));
      }
      const isLoot = c.loot >= 8 && d < 950;
      const canBoost = me.sct >= CFG.boostMinSct;
      const winB = isLoot && canBoost && etaB < rival * 0.95;
      const useB = isLoot && canBoost && (winB || (d > 100 && c.loot >= 14 && rival > etaB * 0.85));
      const etaUsed = useB ? etaB : eta;
      const lostToRival = rival < etaUsed * 0.78;
      const contested = rival < etaUsed * 0.95 && rival < 2.8;
      // Kvadratik ufq formulasi: yaqin va boy to'plamlar har doim uzoqdagi (d=700..1200) to'plamlardan ustun!
      const timeCost = etaUsed + 0.18 + 0.35 * etaUsed * etaUsed;
      const effMass = c.mass + 1.15 * (c.macro - c.mass) + (isLoot ? 3.8 * c.loot : 0);
      let val = effMass / timeCost;
      if (d < 240 && turnA < 1.15) val *= 1.45;
      if (lostToRival) val *= 0.08; // Raqib bizdan ancha oldin yeb ketadigan uzoq ozuqaga yugurmaslik!
      else if (contested && !winB) val *= 0.35;
      out.push({ x, y, d, ang, eta, etaB, mass: c.mass, macro: c.macro, loot: isLoot && !lostToRival ? c.loot : 0, n: c.n, contested, winB, useB, crowd, rival, val });
    }
    out.sort((a, b) => b.val - a.val);
    return out.slice(0, 16);
  }

  function pickGoal(env, foods) {
    const t = env.t, me = env.me, g = S.goal, best = foods[0];
    if (best && best.loot >= 10 && (!g || g.kind !== 'loot')) {
      S.goal = { x: best.x, y: best.y, kind: 'loot', until: t + 4500, bestD: best.d, progT: t, ref: best };
      LOG.ev(1, 'loot_goal', { d: r0(best.d), loot: r1(best.loot), mass: r1(best.macro), contested: best.contested, winB: best.winB, crowd: best.crowd });
      return S.goal;
    }
    if (g) {
      const match = foods.find(f => hyp(f.x - g.x, f.y - g.y) < 85);
      const d = hyp(g.x - me.x, g.y - me.y);
      if (d < me.r + 48 && foods.length > 1) {
        const next = foods.find(f => f !== match && hyp(f.x - me.x, f.y - me.y) > me.r + 25) || best;
        if (next) {
          const wasLoot = g.kind === 'loot', isNextLoot = next.loot >= 10;
          S.goal = { x: next.x, y: next.y, kind: isNextLoot ? 'loot' : 'food', until: t + 4500, bestD: next.d, progT: t, ref: next };
          if (isNextLoot && !wasLoot) LOG.ev(1, 'loot_goal', { d: r0(next.d), loot: r1(next.loot), mass: r1(next.macro) });
          return S.goal;
        }
      }
      if (d < g.bestD - 12) { g.bestD = d; g.progT = t; }
      const stalled = t - g.progT > (g.kind === 'loot' ? 1400 : 1700);
      if (match && !stalled && t < g.until) {
        if (!(best && best !== match && best.val > match.val * 1.45 + 0.5)) {
          g.x = match.x; g.y = match.y; g.ref = match; g.kind = match.loot >= 10 ? 'loot' : 'food';
          return g;
        }
      } else if (stalled) { blacklist(g.x, g.y, t, 3500); LOG.ev(1, 'goal_stalled', { x: r0(g.x), y: r0(g.y) }); }
    }
    if (!best) { S.goal = null; return null; }
    S.goal = { x: best.x, y: best.y, kind: best.loot >= 10 ? 'loot' : 'food', until: t + 4500, bestD: best.d, progT: t, ref: best };
    if (S.goal.kind === 'loot') LOG.ev(1, 'loot_goal', { d: r0(best.d), loot: r1(best.loot), mass: r1(best.macro), contested: best.contested, winB: best.winB, crowd: best.crowd });
    return S.goal;
  }

  function loopCheck(env, rays, allow) {
    if (!allow) { S.trail = []; return; }
    const t = env.t, me = env.me, T = S.trail;
    if (!T.length || t - T[T.length - 1].t >= 200) T.push({ x: me.x, y: me.y, a: me.ang, t });
    while (T.length && t - T[0].t > 6000) T.shift();
    if (t < S.loopUntil || T.length < 15) return;
    let path = 0, turn = 0;
    for (let i = 1; i < T.length; i++) { path += hyp(T[i].x - T[i - 1].x, T[i].y - T[i - 1].y); turn += dAng(T[i].a, T[i - 1].a); }
    if (path > 400 && hyp(me.x - T[0].x, me.y - T[0].y) < path * 0.3 && Math.abs(turn) > TAU * 0.85) {
      if (S.goal) blacklist(S.goal.x, S.goal.y, t, 5000);
      S.goal = null;
      let bestA = me.ang, bg = -1e9;
      for (const r of rays) if (r.safe && Math.abs(r.delta) < 1.2) {
        const sc = Math.min(r.gap, 60) - (S.trap ? S.trap.dAt(r.ex, r.ey) * 0.5 : 0);
        if (sc > bg) { bg = sc; bestA = r.aim; }
      }
      S.loopGoal = { x: me.x + Math.cos(bestA) * 700, y: me.y + Math.sin(bestA) * 700 };
      S.loopUntil = t + 2200; S.trail = []; S.loopBreaks++;
      LOG.ev(2, 'loop_break', { path: r0(path), turn: r2(turn), dir: r2(bestA), n: S.loopBreaks });
    }
  }

  /* ================= 10. Xavf darajasi va gisterezis (3.2: Yaqin raqib yonida EVADE -> LOOT sakrashini bloklash) ================= */
  function hyst(key, lvl, t, calm) {
    const L = key + 'Lvl', C = key + 'Calm';
    if (lvl >= S[L]) { S[L] = lvl; S[C] = t; }
    else if (t - S[C] >= calm) { S[L] = Math.max(lvl, S[L] - 1); S[C] = t; }
  }
  function assess(env, rays, cur) {
    const me = env.me, fast = me.sp > me.spN + 2.0;
    const anySafe = rays.some(r => r.safe), comfy = rays.some(r => r.safe && r.gap >= CFG.comfort);
    let lvl = 0;
    if (!anySafe || cur.ttc < (fast ? 0.62 : 0.42) || S.trapLvl >= 2) lvl = 2;
    else if (cur.ttc < (fast ? 0.85 : 0.60) || cur.gap < (fast ? 10 : 3) || !comfy || S.trapLvl >= 1) lvl = 1;
    // 3.1 log (10.75 s): nhGap=90, nbGap=55 bo'lganida bot EVADE dan LOOT ga tushib, raqib tomonga burilgan!
    // Endi oldimizda yaqin raqib boshi (< 95) yoki juda yaqin tana (< 45) bo'lsa, xavf kamida 1 bo'lib turadi!
    const nh = env.heads[0], nb = env.nb;
    if (nh && nh.d - nh.rs < 95 && Math.abs(dAng(Math.atan2(nh.y - me.y, nh.x - me.x), me.ang)) < 1.35) lvl = Math.max(lvl, 1);
    if (nb && nb.d < 42 && Math.abs(dAng(Math.atan2(nb.y - me.y, nb.x - me.x), me.ang)) < 1.25) lvl = Math.max(lvl, 1);
    if (S.threat) lvl = Math.max(lvl, S.threat.gap < 80 ? 2 : 1);
    S.dangerRaw = lvl; S.comfy = comfy;
    hyst('danger', lvl, env.t, S.dangerLvl === 2 ? 380 : CFG.calmMs);
    if (S.dangerLvl >= 1) { if (!S.dangerSince) S.dangerSince = env.t; } else S.dangerSince = 0;
  }

  /* ================= 11. Boost boshqaruvi ================= */
  function boostDecide(env, mode, sel, rays, w, g, trap, exitDir) {
    const t = env.t, me = env.me;
    let want = false, why = '';
    const gRef = S.goal && S.goal.ref;
    if (mode === 'ATTACK' && ATK.cur && (ATK.cur.phase === 'COMMIT' || ATK.cur.phase === 'RACE') && sel.boost)
      return { ray: sel, why: ATK.cur.phase === 'RACE' ? 'quvib o\'tish' : ATK.cur.counter ? 'qarshi kesish' : 'hujum' };
    const esc = S.escape;
    const urgentThreat = S.threat && (S.threat.gap < 105 || S.threat.id !== S.lastThreatBoostId || t > S.closeBoostEnd + CFG.closeBoostCoolMs);
    const selDelta = sel.delta != null ? sel.delta : dAng(sel.aim, me.ang);
    if (mode === 'COIL' && COIL.wantBoost) { want = true; why = 'o\'rab olish'; }
    else if (mode === 'ESCAPE' && esc && esc.src !== 'markaz' && me.sct >= CFG.escapeBoostMinSct &&
             Math.abs(selDelta) < 1.10) {
      want = true; why = esc.src === 'halqa' ? 'halqadan chiqish' : 'qamaldan chiqish';
    }
    else if ((mode === 'EVADE' || mode === 'ESCAPE') && (!sel.safe || sel.ttc < 0.75) && me.sct >= CFG.escapeBoostMinSct &&
             (!env.nb || env.nb.d > 36)) {
      want = true; why = 'favqulodda';
    }
    else if (S.threat && mode !== 'ATTACK' && mode !== 'COIL' && me.sct >= CFG.boostMinSct && Math.abs(selDelta) < 0.90 &&
             Math.cos(sel.aim - Math.atan2(me.y - S.threat.y, me.x - S.threat.x)) > 0.0 && urgentThreat) {
      S.closeBoostEnd = t + CFG.closeBoostMs; S.lastThreatBoostId = S.threat.id;
      want = true; why = 'yaqin boshdan uzoqlashish';
    }
    else if (t <= S.closeBoostEnd && sel.safe && Math.abs(selDelta) < 0.80 && mode !== 'ATTACK' && mode !== 'COIL') {
      want = true; why = 'yaqin boshdan uzoqlashish';
    }
    else if ((mode === 'EVADE' || mode === 'ESCAPE') && me.sct >= CFG.boostMinSct && S.dangerSince && t - S.dangerSince > 1200 &&
             env.heads[0] && env.heads[0].d - env.heads[0].rs < 220 && Math.abs(selDelta) < 0.80) {
      if (t > S.breakEnd + 2200) S.breakEnd = t + 1100;
      if (t <= S.breakEnd) { want = true; why = 'aloqani uzish'; }
    }
    else if (mode === 'LOOT' && gRef && me.sct >= CFG.boostMinSct && gRef.loot >= 10 && gRef.crowd < 6 &&
             Math.abs(selDelta) < 0.85 && (!env.nb || env.nb.d > 45) &&
             ((gRef.d > 95 && (gRef.winB || gRef.loot >= 15)) || (gRef.rival < 1.5 && gRef.d > 50))) {
      want = true; why = gRef.contested || gRef.rival < 2.0 ? 'ozuqa poygasi' : 'o\'lim ozuqasi';
    }
    let ray = sel;
    const baseOpt = S.simOpt ? Object.assign({}, S.simOpt, { isDelta: true }) : { isDelta: true };
    if (want) {
      const rb = sel.boost ? sel : simulate(env, selDelta, true, S.steer, baseOpt);
      const isEscBoost = why === 'halqadan chiqish' || why === 'qamaldan chiqish' || why === 'favqulodda';
      const minG = isEscBoost ? 3 : 6;
      const ok = isEscBoost ? (rb.ttc > 0.65 && rb.gap >= 0) : (rb.safe && rb.gap >= minG);
      if (ok) ray = rb;
      else if (rays && rays.length) {
        const top = rays.slice().sort((a, b) => scoreRay(b, me, w, g, S.cmd, trap, exitDir) - scoreRay(a, me, w, g, S.cmd, trap, exitDir)).slice(0, 6);
        let bestB = null, bestSc = -1e9;
        for (const cand of top) {
          const rCand = simulate(env, cand.delta, true, S.steer, baseOpt);
          const sc = scoreRay(rCand, me, w, g, S.cmd, trap, exitDir);
          if ((isEscBoost ? (rCand.ttc > 0.65 && rCand.gap >= 0) : (rCand.safe && rCand.gap >= minG)) && sc > bestSc) {
            bestSc = sc; bestB = rCand;
          }
        }
        if (bestB) ray = bestB; else { want = false; why = 'boost yo\'li xavfliroq'; }
      } else { want = false; why = 'boost yo\'li xavfliroq'; }
    }
    if (!want && sel.boost) ray = simulate(env, selDelta, false, S.steer, baseOpt);
    if (!want && S.boost && t - S.boostSince < 200 && why !== 'boost yo\'li xavfliroq' && mode !== 'EVADE' && mode !== 'ESCAPE') {
      const rDelta = ray.delta != null ? ray.delta : dAng(ray.aim, me.ang);
      const rb = simulate(env, rDelta, true, S.steer, baseOpt);
      if (rb.safe && rb.gap >= 8) { ray = rb; want = true; why = S.boostWhy || 'ushlab turish'; }
    }
    return { ray, why: want ? why : (why || '') };
  }

  /* ================= 8b. O'rab olish ================= */
  const COIL = {
    cur: null, cool: new Map(), globalCool: 0, bLog: [], stats: null, why: '—', lastEval: -1e9, wantBoost: false,
    reset() { this.cur = null; this.cool.clear(); this.lastEval = -1e9; this.globalCool = 0; this.bLog = []; this.why = '—'; this.wantBoost = false;
              this.stats = { started: 0, closed: 0, aborted: 0, ended: 0, abortWhy: {} }; },
    ourW(me, x, y) { const P = ourPts.slice(); P.push(me.x, me.y); return winding(P, x, y, 2500); },
    eligible(env, h, relaxed) {
      const me = env.me;
      if (!h || h.age < 0.35) return 'kuzatuv qisqa';
      if (me.L < CFG.coilMinL) return 'tana qisqa';
      if (h.L > me.L * (relaxed ? 0.55 : CFG.coilRatio) || h.sc > me.sc * 1.05) return 'nishon katta';
      if (!relaxed && h.sct < 10) return 'nishon juda kichik';
      if (h.d > (relaxed ? 480 : 380)) return 'uzoq';
      if (h.v > me.spN * PHY.k * 1.30) return 'nishon boostda';
      const W0 = Math.abs(this.ourW(me, h.x, h.y));
      const away = (Math.cos(h.ang) * (h.x - me.x) + Math.sin(h.ang) * (h.y - me.y)) / Math.max(h.d, 1);
      if (!relaxed && W0 < 0.50 * Math.PI && away > 0.25 && Math.abs(h.w) < 1.0) return 'nishon uzoqlashmoqda (kesish afzal)';
      for (const o of env.heads) if (o.id !== h.id && o.L > me.L * 0.5 && hyp(o.x - h.x, o.y - h.y) < 450) return 'yonida katta ilon';
      return null;
    },
    radius(me, h) { return clamp(me.L / TAU * 0.66, 125 + h.r, 380); },
    center(h) {
      const P = h.tr.wb && h.tr.wb.length ? h.tr.wb : [h.x, h.y];
      let sx = 0, sy = 0, n = 0;
      for (let i = 0; i + 1 < P.length; i += 2) { sx += P[i]; sy += P[i + 1]; n++; }
      const x = sx / n + Math.cos(h.ang) * h.v * 0.12, y = sy / n + Math.sin(h.ang) * h.v * 0.12;
      let E = hyp(h.x - x, h.y - y);
      for (let i = 0; i + 1 < P.length; i += 2) E = Math.max(E, hyp(P[i] - x, P[i + 1] - y));
      return { x, y, E };
    },
    clearR(me, h, E, extra) { return E + h.r + CFG.selfR * me.r + CFG.margin + extra; },
    rMin(me, h) { return Math.max(me.spN * PHY.k / Math.max(PHY.effW(me, false), 1.5) * 1.18, h.r + me.r + 18); },
    start(env, h, why, relaxed) {
      if (!S.hunt || this.cur || (this.cool.get(h.id) || 0) > env.t) return false;
      const bad = this.eligible(env, h, relaxed); if (bad) { this.why = bad; return false; }
      const me = env.me, s = Math.sign(cross(Math.cos(me.ang), Math.sin(me.ang), h.x - me.x, h.y - me.y)) || 1;
      const R0 = Math.max(this.radius(me, h), this.clearR(me, h, this.center(h).E, 22));
      if (TAU * R0 > me.L * 0.95) { this.why = 'halqaga tana yetmaydi'; return false; }
      this.cur = { id: h.id, s, R: R0, R0, phase: 'WRAP', since: env.t, sct0: me.sct, maxW: 0, W: 0, wh: [], why };
      this.stats.started++; this.why = 'o\'rab olinmoqda';
      ATK.watch(h.id, env.t, 'coil', true);
      LOG.ev(2, 'coil_start', { id: h.id, tsct: h.sct, tL: r0(h.L), L: r0(me.L), d: r0(h.d), R: r0(this.cur.R), s, why });
      return true;
    },
    tryStart(env, blocked) {
      const t = env.t, me = env.me;
      if (t - this.lastEval < 250) return false;
      this.lastEval = t;
      if (!S.hunt) { this.why = 'hujum o\'chiq'; return false; }
      if (blocked) { this.why = blocked; return false; }
      if (t < this.globalCool) { this.why = 'tanaffus'; return false; }
      if (me.L < CFG.coilMinL) { this.why = 'tana qisqa ' + r0(me.L) + '/' + CFG.coilMinL; return false; }
      let best = null, bs = -1;
      for (const h of env.heads) {
        if ((this.cool.get(h.id) || 0) > t || this.eligible(env, h, false)) continue;
        const sc = (h.sct + 5) / (h.d + 150);
        if (sc > bs) { bs = sc; best = h; }
      }
      if (!best) { this.why = 'mos nishon yo\'q'; return false; }
      const a = this.aimFor(env, best, Math.max(this.radius(me, best), this.clearR(me, best, this.center(best).E, 22)),
                            Math.sign(cross(Math.cos(me.ang), Math.sin(me.ang), best.x - me.x, best.y - me.y)) || 1);
      const r = simulate(env, dAng(a, me.ang), false, S.steer, { id: best.id, ht: 0.45, uK: 0.5, isDelta: true });
      if (!r.safe || r.gap < 5) { this.why = 'orbita yo\'li xavfli'; return false; }
      return this.start(env, best, 'qidiruv', false);
    },
    aimFor(env, h, R, s) {
      const me = env.me, C = this.center(h);
      const b = Math.atan2(C.y - me.y, C.x - me.x), d = hyp(C.x - me.x, C.y - me.y);
      const dl = clamp(1.35 * (d - R) / R, -0.6, 1.15);
      return wrap(b - s * (Math.PI / 2 - dl));
    },
    desired(env) {
      const c = this.cur; if (!c) return null;
      const h = env.heads.find(x => x.id === c.id); if (!h) return null;
      return this.aimFor(env, h, c.R, c.s);
    },
    update(env) {
      const c = this.cur; this.wantBoost = false; if (!c) return;
      const t = env.t, me = env.me, h = env.heads.find(x => x.id === c.id), trc = TR.get(c.id);
      if (!h && trc && trc.dead) return this.end(t, 'nishon o\'ldi');
      if (!h) return this.abort(t, 'nishon ko\'rinmay qoldi');
      ATK.watch(c.id, t, 'coil', true);
      if (c.phase === 'WRAP' ? t - c.since > CFG.coilMs : t - c.closedT > CFG.squeezeMs) return this.abort(t, 'vaqt tugadi');
      if (c.phase === 'WRAP' && t - c.since > 4200 && c.maxW < 0.95 * Math.PI) return this.abort(t, 'halqa o\'smayapti');
      if (S.trapLvl >= 1) return this.abort(t, 'qamal');
      if (h.v > 1.25 * me.spN * PHY.k) return this.abort(t, 'nishon boostda');
      if (S.dangerRaw >= 2 && S.curWho != null && S.curWho !== c.id && (c.phase === 'WRAP' || env.heads.some(o => o.id === S.curWho && o.d - o.rs < 220))) return this.abort(t, 'boshqa xavf');
      if (me.sct < c.sct0 * 0.90 - 1) return this.abort(t, 'boost qimmat');
      c.tightN = (S.sel && (!S.sel.safe || (S.sel.gap < 6 && S.sel.who != null && S.sel.who !== c.id))) ? (c.tightN || 0) + 1 : 0;
      if (c.tightN >= 2) return this.abort(t, 'yo\'l tor');
      for (const o of env.heads) if (o.id !== c.id && o.L > me.L * 0.5 && o.d < 340) return this.abort(t, 'katta ilon yaqinlashdi');
      const W = Math.abs(this.ourW(me, h.x, h.y));
      c.W = W; c.maxW = Math.max(c.maxW, W);
      const C = this.center(h), d = hyp(C.x - me.x, C.y - me.y);
      if (c.phase === 'WRAP' ? (d > c.R + 350 || (c.maxW > 1.1 * Math.PI && W < 0.58 * c.maxW)) : (W < 1.1 * Math.PI && d > c.R + 200)) return this.abort(t, 'nishon qochdi');
      const Rfloor = Math.max(this.rMin(me, h), this.clearR(me, h, C.E, 8));
      if (c.phase === 'WRAP') c.R = Math.max(c.R0, this.clearR(me, h, C.E, 20));
      if (c.phase === 'WRAP' && W >= 1.75 * Math.PI) {
        c.phase = 'SQUEEZE'; c.closedT = t; this.stats.closed++;
        LOG.ev(2, 'coil_closed', { id: c.id, W: r2(W), R: r0(c.R), sec: r1((t - c.since) / 1000) });
      }
      const dtS = CFG.tickMs / 1000, tight = S.sel && (!S.sel.safe || S.sel.gap < 12);
      if (c.phase === 'SQUEEZE') c.R = tight ? Math.min(Math.max(c.R0, Rfloor), c.R + 35 * dtS) : Math.max(Rfloor, c.R - 55 * dtS);
      c.wh.push({ t, W }); while (c.wh.length && t - c.wh[0].t > 1000) c.wh.shift();
      while (this.bLog.length && t - this.bLog[0] > 60000) this.bLog.shift();
      this.wantBoost = c.phase === 'WRAP' && W < 1.60 * Math.PI && h.d - h.rs > 110 && me.sct >= c.sct0 * 0.92 && me.sct >= 18 &&
                       this.bLog.length * CFG.tickMs < 8000;
      if (this.wantBoost) this.bLog.push(t);
    },
    abort(t, why) {
      const c = this.cur; if (!c) return;
      this.stats.aborted++; this.stats.abortWhy[why] = (this.stats.abortWhy[why] || 0) + 1;
      this.cool.set(c.id, t + 4000); this.globalCool = t + 2000;
      LOG.ev(2, 'coil_abort', { id: c.id, why, W: r2(c.W), maxW: r2(c.maxW), sec: r1((t - c.since) / 1000) });
      this.cur = null; this.why = 'bekor: ' + why; this.wantBoost = false;
    },
    end(t, why) {
      const c = this.cur; if (!c) return;
      this.stats.ended++;
      this.cool.set(c.id, t + 2000);
      LOG.ev(2, 'coil_end', { id: c.id, why, W: r2(c.W), sec: r1((t - c.since) / 1000) });
      this.cur = null; this.why = why; this.wantBoost = false;
    },
  };

  /* ================= 8c. O'ralish xavfi ================= */
  const RING = {
    stats: null, logged: new Map(),
    reset() { this.stats = { warn: 0, urgent: 0, maxW: 0 }; this.logged.clear(); },
    assess(env) {
      const me = env.me, t = env.t, vB = me.spB * PHY.k, M2 = 850 * 850;
      let best = { lvl: 0 };
      for (const h of env.allHeads) {
        const tr = h.tr, P = tr.wb;
        if (!P || P.length < 10 || tr.L < 600 || tr.minBodyD > 460) continue;
        let W = 0, pa = null, first = -1, last = -1;
        for (let i = 0; i + 1 < P.length; i += 2) {
          const dx = P[i] - me.x, dy = P[i + 1] - me.y;
          if (dx * dx + dy * dy > M2) { pa = null; continue; }
          const a = Math.atan2(dy, dx);
          if (pa != null) W += dAng(a, pa);
          pa = a; if (first < 0) first = i; last = i;
        }
        const aW = Math.abs(W);
        if (aW > this.stats.maxW) this.stats.maxW = r2(aW);
        if (aW < CFG.ringWarn) continue;
        const e1x = P[first], e1y = P[first + 1], e2x = P[last], e2y = P[last + 1];
        const span = hyp(e1x - e2x, e1y - e2y), gapW = aW >= 1.90 * Math.PI ? -1 : span - 2 * h.r - 2 * me.r;
        if (gapW > 900 && aW < CFG.ringUrgent) continue;
        const gx = e1x * 0.65 + e2x * 0.35, gy = e1y * 0.65 + e2y * 0.35, gd = hyp(gx - me.x, gy - me.y) || 1;
        const tEsc = gd / vB + Math.abs(dAng(Math.atan2(gy - me.y, gx - me.x), me.ang)) / Math.max(PHY.effW(me, true), 1.5);
        const headEnd = last === P.length - 2;
        const close = headEnd && span > 1 ? (Math.cos(h.ang) * (e1x - e2x) + Math.sin(h.ang) * (e1y - e2y)) / span * h.v : 0;
        const tClose = close > 30 ? Math.max(0, gapW) / close : Infinity;
        let lvl = gapW <= 0 ? 2 : aW >= CFG.ringUrgent || tClose < tEsc + 0.55 ? 2 : 1;
        const sc = lvl * 10 + aW;
        if (sc > (best.sc || 0)) {
          const ox = (gx - me.x) / gd, oy = (gy - me.y) / gd;
          best = { lvl, sc, id: h.id, W: aW, gx, gy, ex: gx + ox * 320, ey: gy + oy * 320, gapW, tClose, tEsc, tsct: h.sct };
        }
      }
      if (best.lvl) {
        const k = best.id + ':' + best.lvl, lt = this.logged.get(k) || -1e9;
        if (t - lt > 4000) {
          this.logged.set(k, t); this.stats[best.lvl === 2 ? 'urgent' : 'warn']++;
          LOG.ev(best.lvl === 2 ? 3 : 2, 'ring', { id: best.id, lvl: best.lvl, W: r2(best.W), gapW: r0(best.gapW), tClose: fin(best.tClose) ? r2(best.tClose) : null,
                                                  tEsc: r2(best.tEsc), tsct: best.tsct });
        }
      }
      return best;
    },
  };

  /* ================= 12. Yagona qaror — bitta boshqaruv egasi ================= */
  const MODE_UZ = { FORAGE: 'Ozuqa', LOOT: 'O\'lim ozuqasi', ATTACK: 'Hujum: oldini kesish', COIL: 'O\'rab olish', EVADE: 'Himoya', ESCAPE: 'Qamaldan chiqish',
                    LOOP: 'Aylanishni buzish', MANUAL: 'Qo\'lda', ASSIST: 'Yordamchi himoya (D)', PAUSE: 'Pauza', WAIT: 'O\'yin kutilmoqda' };
  const MODE_CODE = { FORAGE: 'F', LOOT: 'L', ATTACK: 'A', COIL: 'C', EVADE: 'E', ESCAPE: 'X', LOOP: 'O', MANUAL: 'M', ASSIST: 'S', PAUSE: 'P', WAIT: 'W' };

  function escapeRoute(env, trap, ring) {
    const t = env.t, me = env.me, e = S.escape;
    let nx = null;
    if (ring && ring.lvl && ring.gapW > 0) nx = { x: ring.ex, y: ring.ey, src: 'halqa' };
    else if (ring && ring.W >= 1.85 * Math.PI && trap.nexit) nx = { x: trap.nexit.x, y: trap.nexit.y, src: 'tor' };
    else if (ring && ring.W >= 1.85 * Math.PI && trap.center && (!trap.exit || trap.detour > 120)) nx = { x: trap.center.x, y: trap.center.y, src: 'markaz' };
    else if (trap.exit) nx = { x: trap.exit.x, y: trap.exit.y, src: 'chiqish' };
    else if (trap.nexit) nx = { x: trap.nexit.x, y: trap.nexit.y, src: 'tor' };
    else if (trap.center) nx = { x: trap.center.x, y: trap.center.y, src: 'markaz' };
    if (!nx) { S.escape = null; return; }
    if (e && e.src === nx.src && t - e.since < 450 && hyp(e.x - me.x, e.y - me.y) > 60 && (nx.src !== 'chiqish' || trap.dAt(e.x, e.y) < 9999)) return;
    if (!e || e.src !== nx.src || hyp(nx.x - e.x, nx.y - e.y) > 80) {
      LOG.ev(S.escLogged ? 1 : 3, 'escape_route', { src: nx.src, a: r2(Math.atan2(nx.y - me.y, nx.x - me.x)), d1: trap.d1, detour: trap.detour, area: trap.area,
                                                   ring: ring && ring.lvl ? { id: ring.id, W: r2(ring.W), gapW: r0(ring.gapW) } : undefined });
      S.escLogged = true;
    }
    S.escape = { x: nx.x, y: nx.y, src: nx.src, since: t };
  }

  function simOptNow(t) {
    const c = ATK.cur;
    if (c) {
      if (c.phase === 'COMMIT') return { id: c.id, ht: clamp((c.thAbs - t) / 1000, 0.05, CFG.headHardT), uK: 0, cut: true };
      if (c.phase === 'EXIT') return { id: c.id, ht: 0.45, uK: 0, cut: true };
      if (c.phase === 'RACE') return { id: c.id, ht: 0.45, uK: 0, cut: true };
    }
    if (COIL.cur) return { id: COIL.cur.id, ht: 0.45, uK: 0.5 };
    return null;
  }

  function decide(env) {
    const t = env.t, me = env.me;
    const trap = buildTrap(env); S.trap = trap;
    if (trap.level === 2) {
      const old = S.areaHist.find(a => t - a.t >= 900);
      trap.shrinking = !!(old && trap.area < old.area * 0.85);
      if (trap.area >= 450 && !trap.shrinking) { trap.level = 1; trap.closedLarge = true; }
    }
    S.areaHist.push({ t, area: trap.area }); while (S.areaHist.length && t - S.areaHist[0].t > 1500) S.areaHist.shift();
    const ring = RING.assess(env); S.ring = ring;
    if (ring.lvl > trap.level) { trap.level = ring.lvl; trap.byRing = true; }
    hyst('trap', trap.level, t, CFG.trapCalmMs);
    if (trap.d1 < 0) {
      S.openSince = 0;
      if (!S.closedLogged) { LOG.ev(3, 'trap_closed', { area: trap.area, large: !!trap.closedLarge, shrinking: !!trap.shrinking, narrowExit: !!trap.nexit }); S.closedLogged = true; }
    } else { if (!S.openSince) S.openSince = t; if (t - S.openSince > 1500) { S.closedLogged = false; S.escLogged = false; } }
    CONC = [];
    for (const h of env.allHeads) if (h.tr.L >= Math.max(900, 0.6 * me.L) && h.d < 1600 && h.tr.wb.length >= 8 && CONC.length < 4) CONC.push(concOf(h.tr.wb));
    if (!S.foodsT || t - S.foodsT >= 50 || !S.goal) { S.foods = foodTargets(env, trap); S.foodsT = t; }
    const foods = S.foods;
    const goal = pickGoal(env, foods);
    ATK.update(env); COIL.update(env);
    S.threat = null;
    {
      const vN = me.spN * PHY.k;
      for (const h of env.heads) {
        if (h.d - h.rs > CFG.closeHeadGap) break;
        if (((ATK.cur && ATK.cur.id === h.id) || (COIL.cur && COIL.cur.id === h.id)) && h.v <= 1.25 * vN) continue;
        const closing = Math.cos(h.ang - Math.atan2(me.y - h.y, me.x - h.x)) > 0.35;
        const aggr = h.v > 1.25 * vN && h.d - h.rs < 135;
        if (aggr && closing) { S.threat = { id: h.id, x: h.x, y: h.y, gap: h.d - h.rs }; break; }
      }
      if (S.threat && (!S.threatLog || t - S.threatLog > 3000)) { S.threatLog = t; LOG.ev(2, 'close_head', { id: S.threat.id, gap: r0(S.threat.gap) }); }
    }
    S.simOpt = simOptNow(t);
    const A = (p) => p ? Math.atan2(p.y - me.y, p.x - me.x) : null;
    const topFoodAngles = foods.slice(0, 4).map(f => f.ang);
    const specials = () => [me.ang, S.cmd, A(goal), ...topFoodAngles, trap.exit && trap.exit.a, trap.nexit && trap.nexit.a, A(S.escape),
                            ATK.cur && ATK.cur.aim, ATK.cur && ATK.cur.exitDir,
                            COIL.cur ? COIL.desired(env) : null, ring.lvl ? A({ x: ring.ex, y: ring.ey }) : null, trap.center ? A(trap.center) : null,
                            S.threat ? Math.atan2(me.y - S.threat.y, me.x - S.threat.x) : null,
                            t < S.loopUntil ? A(S.loopGoal) : null];
    let rays = evalRays(env, specials(), S.steer, S.slowRun > 3 ? 20 : CFG.rays);
    const curOpt = S.simOpt ? Object.assign({}, S.simOpt, { isDelta: true }) : { isDelta: true };
    const cur = simulate(env, S.cmdDelta == null ? 0 : S.cmdDelta, S.boost, S.steer, curOpt);
    S.curWho = cur.safe ? null : cur.who;
    assess(env, rays, cur);
    loopCheck(env, rays, S.dangerLvl === 0 && S.trapLvl === 0 && !COIL.cur);

    const lootNear = goal && goal.kind === 'loot' && goal.ref && goal.ref.loot >= 22 && hyp(goal.x - me.x, goal.y - me.y) < 180;
    const atkBlock = S.dangerLvl >= 2 && S.trapLvl === 0 ? 'xavf yuqori' : lootNear ? 'o\'lim ozuqasi yaqin' : null;
    const coilBlock = S.trapLvl > 0 ? 'qamal' : S.dangerLvl >= 1 ? 'xavf' : (goal && goal.kind === 'loot' && hyp(goal.x - me.x, goal.y - me.y) < 450 ? 'o\'lim ozuqasi yaqin' : null);

    let mode;
    if (ATK.cur && ATK.cur.counter) mode = 'ATTACK';
    else if (S.trapLvl >= 1 || (ring && ring.lvl >= 1)) {
      const coilerId = (ring && ring.id) || (env.nb && env.nb.id) || null;
      if (ATK.tryStart(env, null, { counter: true, targetId: coilerId })) {
        mode = 'ATTACK';
      } else {
        mode = 'ESCAPE';
        if (ATK.cur) { if (ATK.cur.phase === 'EXIT') ATK.end(t, 'qamal (chiqishda)'); else ATK.abort(t, 'qamal'); }
        if (COIL.cur) COIL.abort(t, 'qamal');
      }
    }
    else if (ATK.cur) mode = 'ATTACK';
    else if ((!COIL.cur || (COIL.cur.phase === 'WRAP' && COIL.cur.W < 1.35 * Math.PI)) && ATK.tryStart(env, atkBlock)) mode = 'ATTACK';
    else if (COIL.cur) mode = 'COIL';
    else if (S.dangerLvl >= 1) mode = 'EVADE';
    else if (goal && goal.kind === 'loot') mode = 'LOOT';
    else if (COIL.tryStart(env, coilBlock)) mode = 'COIL';
    else if (t < S.loopUntil) mode = 'LOOP';
    else mode = 'FORAGE';

    if (mode === 'ATTACK' && ATK.cur && ATK.cur.phase === 'EXIT' && S.dangerLvl >= 2 && !ATK.cur.counter) { ATK.end(t, 'xavf (chiqishda)'); mode = 'EVADE'; }
    const optKey = o => o ? o.id + ':' + o.uK + ':' + !!o.cut : '';
    const opt2 = simOptNow(t);
    if (optKey(opt2) !== optKey(S.simOpt)) { S.simOpt = opt2; rays = evalRays(env, specials(), S.steer, S.slowRun > 3 ? 20 : CFG.rays); }
    S.simOpt = opt2;
    let sel = null, g = null, exitDir = null, w = WEIGHTS[mode];
    const c = ATK.cur;
    if (mode === 'ATTACK' && c && (c.phase === 'COMMIT' || c.phase === 'RACE')) {
      const cDelta = dAng(c.aim, me.ang);
      const atkOpt = S.simOpt ? Object.assign({}, S.simOpt, { isDelta: true }) : { isDelta: true };
      const r = simulate(env, cDelta, true, S.steer, atkOpt);
      if ((r.safe || (c.counter && r.ttc > 0.48)) && r.gap >= (c.counter ? 1 : 3)) { c.unsafeN = 0; sel = r; }
      else if (++c.unsafeN < 2 && r.ttc > 0.48) sel = r;
      else {
        ATK.abort(t, 'yo\'l xavfli'); mode = S.trapLvl >= 1 ? 'ESCAPE' : 'EVADE'; w = WEIGHTS[mode];
        if (S.simOpt) { S.simOpt = null; rays = evalRays(env, specials(), S.steer, S.slowRun > 3 ? 20 : CFG.rays); }
      }
    }
    if (!sel) {
      if (mode === 'ATTACK' && ATK.cur) { w = WEIGHTS.EXIT; exitDir = ATK.cur.exitDir; }
      else if (mode === 'ATTACK') { mode = 'FORAGE'; w = WEIGHTS.FORAGE; g = goal; }
      else if (mode === 'COIL') { const a = COIL.desired(env) ?? me.ang; g = { x: me.x + Math.cos(a) * 300, y: me.y + Math.sin(a) * 300 }; }
      else if (mode === 'ESCAPE') { escapeRoute(env, trap, ring); g = S.escape; }
      else if (mode === 'LOOP') g = S.loopGoal;
      else if (mode === 'EVADE' && S.threat) {
        const awayA = Math.atan2(me.y - S.threat.y, me.x - S.threat.x);
        g = { x: me.x + Math.cos(awayA) * 450, y: me.y + Math.sin(awayA) * 450 };
      }
      else g = goal;
      let bs = -Infinity;
      for (const r of rays) { const sc = scoreRay(r, me, w, g, S.cmd, trap, exitDir); if (sc > bs) { bs = sc; sel = r; } }
    }
    if (mode !== 'ESCAPE') S.escape = null;
    const bd = boostDecide(env, mode, sel, rays, w, g, trap, exitDir);
    sel = bd.ray;
    const target = mode === 'ATTACK' && ATK.cur ? (ATK.cur.phase === 'EXIT' ? ATK.cur.exitDir : ATK.cur.aim) : g ? A(g) : sel.aim;
    setMode(mode, t);
    if (sel.boost !== S.boost) {
      if (sel.boost) S.boostSince = t;
      LOG.ev(sel.boost ? 2 : 1, sel.boost ? 'boost_on' : 'boost_off', { why: sel.boost ? bd.why : (bd.why || S.boostWhy) });
    }
    S.boost = sel.boost; S.boostWhy = sel.boost ? bd.why : '';
    const finalDelta = sel.delta != null ? sel.delta : dAng(sel.aim, me.ang);
    S.sel = sel; S.cmd = sel.aim; S.cmdDelta = finalDelta; S.steer = steerFromDelta(me.ang, finalDelta); S.target = target; S.rays = rays; S.cur = cur;
    const k = Math.round(0.5 / CFG.dt);
    PHY.expect(t + k * CFG.dt * 1000, sel.path[2 * k], sel.path[2 * k + 1], S.steer, sel.boost);
  }

  function mouseAngle() { return Math.atan2(S.mouseY - num(W.hh, innerHeight) / 2, S.mouseX - num(W.ww, innerWidth) / 2); }
  function assist(env) {
    const t = env.t, me = env.me;
    S.simOpt = null;
    if (!S.dodge) { if (S.owns) release(); setMode('MANUAL', t); return; }
    const ua = mouseAngle(), user = simulate(env, dAng(ua, me.ang), false, null, { isDelta: true });
    if (!user.safe || user.gap < 5) S.userSafeSince = 0; else if (!S.userSafeSince) S.userSafeSince = t;
    const take = !user.safe || user.gap < 5 || (S.owns && t - S.userSafeSince < 400);
    if (!take) { if (S.owns) release(); S.sel = user; setMode('MANUAL', t); return; }
    const rays = evalRays(env, [ua, me.ang, S.cmd], S.steer, CFG.rays);
    const goal = { x: me.x + Math.cos(ua) * 500, y: me.y + Math.sin(ua) * 500 };
    let sel = null, bs = -Infinity;
    for (const r of rays) { const s = scoreRay(r, me, WEIGHTS.ASSIST, goal, S.cmd, null, null); if (s > bs) { bs = s; sel = r; } }
    const finalDelta = sel.delta != null ? sel.delta : dAng(sel.aim, me.ang);
    S.owns = true; S.sel = sel; S.cmd = sel.aim; S.cmdDelta = finalDelta; S.steer = steerFromDelta(me.ang, finalDelta); S.boost = false; S.rays = rays; S.target = ua;
    setMode('ASSIST', t);
  }

  /* ================= 13. Ijrochi: xm/ym va boost ================= */
  let boostSent = null, boostSentT = 0;
  function setBoost(on) {
    const t = now();
    if (boostSent === on && t - boostSentT < 500) return;
    boostSent = on; boostSentT = t;
    try { if (typeof W.setAcceleration === 'function') W.setAcceleration(on ? 1 : 0); else if (W.slither) W.slither.wmd = !!on; } catch (e) {}
  }
  function apply() {
    if (!S.owns || S.steer == null) return;
    W.xm = Math.cos(S.steer) * 320; W.ym = Math.sin(S.steer) * 320; W.want_e = true;
    setBoost(!!S.boost);
  }
  function release() {
    if (S.owns || S.boost || boostSent) { boostSent = null; setBoost(false); }
    if (S.owns) { W.xm = S.mouseX - num(W.ww, innerWidth) / 2; W.ym = S.mouseY - num(W.hh, innerHeight) / 2; W.want_e = true; }
    S.owns = false; S.boost = false; S.turnSide = 0; S.cmdDelta = 0;
  }

  function setMode(mode, t) {
    if (mode === S.mode) return;
    const from = S.mode, big = m => m === 'EVADE' || m === 'ESCAPE';
    S.mode = mode; S.modeSince = t;
    const pri = big(mode) && S.dangerLvl >= 2 ? 3 : (big(mode) || big(from) || ['LOOT', 'LOOP', 'ATTACK', 'COIL', 'PAUSE'].includes(mode)) ? 2 : 1;
    const tr = S.trap;
    LOG.ev(pri, 'mode', { f: MODE_CODE[from] || from, to: MODE_CODE[mode], dz: S.dangerRaw, tr: tr ? tr.level : null, det: tr ? tr.detour : null, area: tr ? tr.area : null });
  }

  function hazards(env) {
    const me = env.me, rel = (x, y) => r2(dAng(Math.atan2(y - me.y, x - me.x), me.ang));
    return {
      heads: env.heads.slice(0, 3).map(h => ({ id: h.id, gap: r0(h.d - h.rs), rel: rel(h.x, h.y), hdgRel: r2(dAng(h.ang, me.ang)), sp: r2(h.tr.sp), w: r2(h.w), sct: h.sct })),
      body: env.nb ? { id: env.nb.id, gap: r0(env.nb.d), center: r0(env.nb.c), rel: rel(env.nb.x, env.nb.y) } : null,
      me: { sc: r2(me.sc), r: r1(me.r) }, shrink: r1(COLL.shrink),
      sel: S.sel ? { aim: r2(S.sel.aim), delta: r2(S.sel.delta), boost: S.sel.boost, safe: S.sel.safe, gap: r1(S.sel.gap), g0: r1(S.sel.g0), ttc: fin(S.sel.ttc) ? r2(S.sel.ttc) : null, who: S.sel.who } : null,
      trap: S.trap ? { lvl: S.trap.level, d1: S.trap.d1, detour: S.trap.detour, area: S.trap.area, narrowExit: !!S.trap.nexit } : null,
      ring: S.ring && S.ring.lvl ? { id: S.ring.id, lvl: S.ring.lvl, W: r2(S.ring.W), gapW: r0(S.ring.gapW), tClose: fin(S.ring.tClose) ? r2(S.ring.tClose) : null, tEsc: r2(S.ring.tEsc) } : null,
      maxRingW: (() => { let m = 0; for (const h of env.allHeads) if (h.tr.wb && h.tr.L >= 600) m = Math.max(m, Math.abs(winding(h.tr.wb, me.x, me.y, 850))); return r2(m); })(),
      escape: S.escape ? S.escape.src : null,
    };
  }

  /* ================= 14. O'yin sikli ================= */
  function newGame(s, t) {
    S.game = s;
    TR.clear(); PHY.reset(); FOOD.reset(); DEATH.reset(); ATK.reset(); COIL.reset(); RING.reset(); BL.length = 0; CONC = [];
    Object.assign(S, { goal: null, foods: [], nearOrbs: [], foodsT: 0, trail: [], loopUntil: 0, loopGoal: null, loopBreaks: 0, escape: null, dangerLvl: 0, dangerCalm: t,
                       trapLvl: 0, trapCalm: t, cmd: null, cmdDelta: 0, steer: null, turnSide: 0, turnSideT: 0, boost: false, boostWhy: '', sel: null,
                       planMs: 0, planSum: 0, planN: 0, planMax: 0, slow: 0, slowRun: 0,
                       mode: 'WAIT', areaHist: [], closedLogged: false, escLogged: false, openSince: 0, dangerSince: 0, breakEnd: -1e9,
                       ring: null, simOpt: null, curWho: null, threat: null, threatLog: 0, closeBoostEnd: -1e9, lastThreatBoostId: null });
    TRO.clear(); COLL.reset();
    if (LOG.d && LOG.d.state === 'recording') LOG.end('new_snake');
    LOG.begin(t, readMe(s));
  }
  function gameWatch(s, alive, t) {
    if (alive) { LOG.missing = 0; return; }
    if (LOG.d && LOG.d.state === 'recording') {
      const p = S.game;
      if (p && (p.dead || num(p.dead_amt) > 0)) { COLL.onDeath(); LOG.end('death'); }
      else { if (!LOG.missing) LOG.missing = t; if (t - LOG.missing > 1500) LOG.end('inactive'); }
    }
  }
  function tick(t, gap) {
    const s = W.slither;
    const alive = okObj(s) && !s.dead && !(num(s.dead_amt) > 0) && W.playing !== false;
    gameWatch(s, alive, t);
    if (!alive) { if (S.owns) release(); S.env = null; S.sel = null; S.mode = 'WAIT'; return; }
    if (S.game !== s) newGame(s, t);
    const t0 = now();
    FOOD.scan(t);
    const env = readWorld(t, s); S.env = env;
    COLL.observe(env.nb, t);
    DEATH.update(t, env.me);
    PHY.observe(env.me, t, S.owns ? S.steer : Math.atan2(num(W.ym), num(W.xm)));
    PHY.check(env.me, t, S.owns ? S.steer : null, S.boost);
    if (S.paused) { if (S.owns) release(); setMode('PAUSE', t); }
    else if (!S.auto) assist(env);
    else { decide(env); S.owns = true; }
    if (S.owns) apply();
    S.planMs = now() - t0;
    if (S.planMs > CFG.planBudgetMs) { S.slow++; S.slowRun++; } else S.slowRun = 0;
    S.planSum += S.planMs; S.planN++; S.planMax = Math.max(S.planMax, S.planMs);
    const d = LOG.d;
    if (d && d.state === 'recording') {
      const dt = Math.min(gap, 200);
      d.modeMs[S.mode] = (d.modeMs[S.mode] || 0) + dt;
      if (S.owns && S.boost) d.boostMs[S.boostWhy || '?'] = (d.boostMs[S.boostWhy || '?'] || 0) + dt;
      if (env.me.sct > d.maxSct) d.maxSct = env.me.sct;
    }
    S.lastRow = LOG.mkRow(env);
    S.lastHaz = hazards(env);
    LOG.flush(S.lastRow);
    LOG.sample(t, S.lastRow);
  }

  /* ================= 15. Holat ================= */
  const S = {
    auto: true, hunt: true, dodge: true, radar: true, paused: false, zoom: CFG.zoom,
    mode: 'WAIT', modeSince: 0, owns: false, cmd: null, cmdDelta: 0, steer: null, turnSide: 0, boost: false, boostWhy: '', boostSince: 0, target: null,
    dangerLvl: 0, dangerCalm: 0, dangerRaw: 0, trapLvl: 0, trapCalm: 0, trap: null, closedLogged: false,
    goal: null, foods: [], nearOrbs: [], trail: [], loopUntil: 0, loopGoal: null, loopBreaks: 0, escape: null,
    sel: null, cur: null, rays: [], env: null, game: null, userSafeSince: 0,
    planMs: 0, planSum: 0, planN: 0, planMax: 0, slow: 0, slowRun: 0, errors: 0,
    mouseX: innerWidth / 2, mouseY: innerHeight / 2, lastRow: null, lastHaz: null,
    turnSideT: 0, areaHist: [], escLogged: false, openSince: 0, dangerSince: 0, breakEnd: -1e9,
    ring: null, simOpt: null, curWho: null, threat: null, threatLog: 0, closeBoostEnd: -1e9, lastThreatBoostId: null,
  };

  /* ================= 16. Logger ================= */
  const COLS = ['t', 'x', 'y', 'hdg', 'sp', 'sct', 'mode', 'target', 'cmd', 'steer', 'cmdRead', 'boostCmd', 'boostAct', 'gap', 'ttc',
                'danger', 'trap', 'exitDist', 'nhId', 'nhGap', 'nhRel', 'nbId', 'nbGap', 'planMs', 'sc', 'nbCenter', 'g0', 'ringW', 'L'];
  const COMPACT = [0, 1, 2, 3, 5, 6, 15, 16];
  const LS_KEY = 'sentinel2-last-log';
  const LOG = {
    d: null, t0: 0, q: [], missing: 0, lastSampleT: -1e9, saved: '', budget: 20000,
    begin(t, me) {
      this.t0 = t; this.q = []; this.lastSampleT = -1e9;
      this.d = { format: 'sentinel-log@3', version: VERSION, created: new Date().toISOString(), state: 'recording',
        note: 'gap/clearance — model qiymati (radius va zaxira ayirilgan, 60 = yuqori chegara). Kill faqat "ehtimoliy". Burchaklar radian.',
        cols: COLS, modeCodes: MODE_CODE, start: { sct: me.sct }, events: [], attacks: [], deaths: [], last: [],
        dropped: { 1: 0, 2: 0, 3: 0 }, evCount: {}, modeMs: {}, boostMs: {}, maxSct: me.sct };
      this.ev(3, 'start', { sct: me.sct, auto: S.auto, hunt: S.hunt, paused: S.paused, zoom: ZOOM.msg,
                            arena: { grd: num(W.grd, null), flux: num(W.flux_grd, null) } });
    },
    rel(t) { return r2((t - this.t0) / 1000); },
    rec() { return !!(this.d && this.d.state === 'recording'); },
    ev(pri, ty, d) {
      if (!this.rec()) return;
      this.d.evCount[ty] = (this.d.evCount[ty] || 0) + 1;
      this.q.push({ arr: 'events', o: { t: this.rel(now()), ty, p: pri, d } });
    },
    atk(k, c, env, why) {
      if (!this.rec()) return;
      this.q.push({ arr: 'attacks', o: { t: this.rel(now()), k, id: c.id, ph: c.phase, why: why || undefined,
        kind: c.kind, aim: r2(c.aim), cx: r0(c.cx), cy: r0(c.cy), plan: (k === 'start' || k === 'race' || k === 'counter') ? c.plan : undefined } });
    },
    atkOutcome(id, res, z) {
      if (this.rec()) this.q.push({ arr: 'attacks', o: { t: this.rel(now()), k: 'outcome', id, res,
        headToOurBody: z ? r0(z.headToOurBody) : undefined, newFood: z ? z.newSet.size : undefined } });
    },
    death(z, kind) {
      if (kind === 'vanished' && z.d > 800) return;
      if (this.rec()) this.q.push({ arr: 'deaths', o: { t: this.rel(now()), k: kind, id: z.id, sct: z.sct, d: r0(z.d),
        newFood: z.newSet.size, need: r0(z.need), ourTarget: z.ourTarget, headToOurBody: r0(z.headToOurBody) } });
    },
    flush(row) {
      const d = this.d; if (!d) { this.q = []; return; }
      for (const e of this.q) {
        const full = e.arr === 'attacks' || (e.arr === 'events' && e.o.p >= 3) || (e.arr === 'deaths' && e.o.d != null && e.o.d < 900);
        e.o.r = row && !full ? COMPACT.map(i => row[i]) : row;
        const A = d[e.arr];
        if (e.arr === 'events') {
          const last = A[A.length - 1];
          if (last && e.o.p < 3 && last.ty === e.o.ty && e.o.t - last.t < 2 && JSON.stringify(last.d) === JSON.stringify(e.o.d)) { last.n = (last.n || 1) + 1; continue; }
          A.push(e.o);
          if (A.length > 90) this.dropOne(1) || this.dropOne(2) || this.dropOne(3);
        } else { A.push(e.o); if (A.length > 40) A.splice(0, 1); }
      }
      this.q = [];
    },
    dropOne(p) {
      const E = this.d.events;
      for (let i = 1; i < E.length; i++) if (E[i].p === p) { E.splice(i, 1); this.d.dropped[p]++; return true; }
      return false;
    },
    mkRow(env) {
      const me = env.me, nh = env.heads[0], nb = env.nb, sel = S.sel, tr = S.trap;
      return [this.rel(env.t), r1(me.x), r1(me.y), r2(me.ang), r2(me.sp), me.sct, MODE_CODE[S.mode] || '?', r2(S.target),
        S.owns ? r2(S.cmd) : null, S.owns ? r2(S.steer) : null, r2(Math.atan2(num(W.ym), num(W.xm))), S.owns ? +!!S.boost : null, +me.boosting,
        sel ? r1(sel.gap) : null, sel && fin(sel.ttc) ? r2(sel.ttc) : null, S.dangerLvl, S.trapLvl,
        tr ? (tr.d1 < 0 ? -1 : r0(tr.d1 * CFG.cell / 2)) : null,
        nh ? nh.id : null, nh ? r0(nh.d - nh.rs) : null, nh ? r2(dAng(Math.atan2(nh.y - me.y, nh.x - me.x), me.ang)) : null,
        nb ? nb.id : null, nb ? r0(nb.d) : null, r1(S.planMs), r2(me.sc), nb ? r0(nb.c) : null, sel && fin(sel.g0) ? r1(sel.g0) : null,
        S.ring && S.ring.lvl ? r2(S.ring.W) : 0, r0(me.L)];
    },
    sample(t, row) {
      if (!this.rec() || t - this.lastSampleT < 100) return;
      this.lastSampleT = t; this.d.last.push(row);
      if (this.d.last.length > 50) this.d.last.shift();
    },
    end(reason) {
      const d = this.d; if (!this.rec()) return this.saved;
      this.flush(S.lastRow);
      d.state = 'finished'; d.reason = reason; d.duration = this.rel(now());
      d.events.push({ t: d.duration, ty: 'end', p: 3, d: { reason }, r: S.lastRow });
      d.final = { lastRow: S.lastRow, hazards: S.lastHaz };
      d.stats = statsNow();
      this.saved = '';
      this.saved = this.text();
      try { localStorage.setItem(LS_KEY, this.saved); } catch (e) {}
      W.SENTINEL_LAST_LOG = this.saved;
      UI.msg('Log tayyor (' + reason + ', ' + (this.saved.length / 1024).toFixed(1) + ' KB)');
      try {
        if (navigator.clipboard && W.isSecureContext && document.hasFocus())
          navigator.clipboard.writeText(this.saved).then(() => UI.msg('Log tayyor va nusxalandi ✓'), () => {});
      } catch (e) {}
      return this.saved;
    },
    text() {
      const d = this.d;
      if (!d) return this.saved || W.SENTINEL_LAST_LOG || (() => { try { return localStorage.getItem(LS_KEY); } catch (e) { return null; } })() ||
        '{"format":"sentinel-log@3","state":"waiting"}';
      if (d.state === 'finished' && this.saved) return this.saved;
      if (d.state === 'recording') { d.stats = statsNow(); d.duration = this.rel(now()); }
      let out = JSON.stringify(d), guard = 0;
      while (out.length > this.budget && guard++ < 500) {
        if (!(this.dropOne(1) || (d.last.length > 30 && d.last.shift()) || this.dropOne(2) ||
              (d.attacks.length > 12 && d.attacks.shift()) || (d.deaths.length > 8 && d.deaths.shift()))) break;
        out = JSON.stringify(d);
      }
      return out;
    },
  };
  function statsNow() {
    const ms = o => { const r = {}; for (const k in o) r[k] = r1(o[k] / 1000); return r; };
    const d = LOG.d;
    return {
      sct: { start: d.start.sct, max: d.maxSct, end: S.env ? S.env.me.sct : null },
      modeSec: ms(d.modeMs), boostSec: ms(d.boostMs), loopBreaks: S.loopBreaks,
      attacks: ATK.stats, attackWhy: ATK.whyHist, coil: Object.assign({ lastWhy: COIL.why }, COIL.stats), ring: RING.stats,
      deaths: Object.assign({}, DEATH.cnt), evCount: d.evCount,
      collision: { shrink: r1(COLL.shrink), topPen: COLL.top.map(r1), n: COLL.n, fatalPen: COLL.fatal, selfR: CFG.selfR,
                   note: 'pen: model (shrinksiz) bo\'yicha tana ichiga kirish, keyingi tick tirik qolingan' },
      physics: { k: r1(PHY.k), omegaN: r2(PHY.wN), omegaB: r2(PHY.wB), scRef: r2(PHY.scRef), accUp: r1(PHY.accUp), accDown: r1(PHY.accDown), n: PHY.n,
                 predErr05s: PHY.errStats(), note: 'k: siljish/s ÷ sp; omega: rad/s; predErr: 0.5 s bashorat xatosi (birlik)' },
      plan: { meanMs: S.planN ? r1(S.planSum / S.planN) : null, maxMs: r1(S.planMax), slowTicks: S.slow, ticks: S.planN },
      errors: S.errors, zoom: { value: r2(S.zoom), status: ZOOM.msg }, arena: { grd: num(W.grd, null), flux: num(W.flux_grd, null), modelBad: arenaBad },
      cfg: { rays: CFG.rays, horizon: CFG.horizon, safeT: CFG.safeT, rScale: CFG.rScale, selfR: CFG.selfR, margin: CFG.margin, attackMinSct: CFG.attackMinSct,
             attackMaxD: CFG.attackMaxD, coilMinL: CFG.coilMinL, coilRatio: CFG.coilRatio, raceMinSct: CFG.raceMinSct, ringWarn: r2(CFG.ringWarn), ringUrgent: r2(CFG.ringUrgent) },
    };
  }

  /* ================= 17. Zoom ================= */
  const ZOOM = {
    ok: false, msg: 'tekshirilmagan', orig: { redraw: W.redraw, gsc: W.gsc, sgsc: W.sgsc }, patched: null,
    install() {
      W.__SENTINEL_ZOOM__ = S.zoom;
      const o = this.orig.redraw;
      if (typeof o !== 'function') { this.msg = 'redraw topilmadi — zoom o\'chiq'; return; }
      let src; try { src = Function.prototype.toString.call(o); } catch (e) { this.msg = 'redraw o\'qilmadi'; return; }
      const re = /var\s+dgsc\s*=\s*\.64285\s*\+\s*\.514285714\s*\/\s*Math\.max\(\s*1\s*,\s*\(\s*slither\.sct\s*\+\s*16\s*\)\s*\/\s*36\s*\)\s*;/g;
      const mm = src.match(re);
      if (!mm || mm.length !== 1) { this.msg = 'noma\'lum build — zoom patch qilinmadi'; return; }
      try {
        const fn = (0, eval)('(' + src.replace(re, 'var dgsc=window.__SENTINEL_ZOOM__;gsc=dgsc;') + ')');
        const self = this;
        this.patched = function () {
          if (!self.ok) return o.apply(this, arguments);
          try { W.gsc = W.__SENTINEL_ZOOM__; W.sgsc = W.__SENTINEL_ZOOM__; return fn.apply(this, arguments); }
          catch (e) { self.ok = false; self.msg = 'patch xatosi — asl redraw tiklandi'; self.restore(); console.warn('[Sentinel] zoom', e); return o.apply(this, arguments); }
        };
        W.redraw = this.patched; this.ok = true; this.msg = 'native zoom';
      } catch (e) { this.msg = 'patch bloklandi'; console.warn('[Sentinel] zoom', e); }
    },
    set(z) { S.zoom = clamp(z, CFG.zoomMin, CFG.zoomMax); W.__SENTINEL_ZOOM__ = S.zoom; },
    restore() {
      if (this.patched && W.redraw === this.patched) W.redraw = this.orig.redraw;
      try { W.gsc = this.orig.gsc; W.sgsc = this.orig.sgsc; } catch (e) {}
    },
  };

  /* ================= 18. Panel, radar, klaviatura ================= */
  const LISTEN = [];
  const on = (tg, ty, fn, opt = false) => { tg.addEventListener(ty, fn, opt); LISTEN.push(() => tg.removeEventListener(ty, fn, opt)); };
  const hud = document.createElement('div'), canvas = document.createElement('canvas');
  hud.id = 'sentinel2-hud'; canvas.id = 'sentinel2-radar';
  hud.style.cssText = 'position:fixed;left:12px;top:12px;z-index:2147483647;background:#081321ee;color:#dff9f7;border:1px solid #28dcb3;' +
    'border-radius:10px;padding:10px 12px;font:12px/1.5 monospace;max-width:360px;box-shadow:0 6px 25px #0008;user-select:none';
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2147483646';
  const title = document.createElement('b'); title.textContent = 'SLITHER SENTINEL ' + VERSION; title.style.color = '#42efc2';
  const info = document.createElement('div'); info.style.whiteSpace = 'pre';
  const btns = document.createElement('div');
  const msgEl = document.createElement('div'); msgEl.style.cssText = 'color:#ffd36b;margin-top:4px';
  const area = document.createElement('textarea');
  area.readOnly = true; area.style.cssText = 'display:none;width:330px;height:120px;margin-top:6px;font:11px monospace';
  hud.append(title, info, btns, msgEl, area);
  const UI = { msg(t) { msgEl.textContent = t; } };

  async function copyLog() {
    const txt = LOG.text();
    try {
      if (navigator.clipboard && W.isSecureContext) { await navigator.clipboard.writeText(txt); UI.msg('Log nusxalandi ✓ (' + (txt.length / 1024).toFixed(1) + ' KB)'); return true; }
    } catch (e) {}
    area.value = txt; area.style.display = 'block'; area.focus(); area.select();
    try { if (document.execCommand('copy')) { UI.msg('Log nusxalandi ✓'); area.style.display = 'none'; return true; } } catch (e) {}
    UI.msg('Matn tanlandi — Ctrl+C. Yoki Console: copy(SENTINEL.logText())');
    return false;
  }
  function togglePause() {
    S.paused = !S.paused;
    if (S.paused) release();
    LOG.ev(2, S.paused ? 'pause' : 'resume', {}); LOG.flush(S.lastRow);
  }
  function toggleBot() {
    if (S.paused) { S.paused = false; S.auto = true; } else S.auto = !S.auto;
    release();
    LOG.ev(2, 'bot', { auto: S.auto }); LOG.flush(S.lastRow);
  }
  const ACT = {
    t: toggleBot,
    h: () => {
      S.hunt = !S.hunt;
      if (!S.hunt && ATK.cur) ATK.abort(now(), 'H o\'chirildi');
      if (!S.hunt && COIL.cur) COIL.abort(now(), 'H o\'chirildi');
      LOG.ev(2, 'hunt', { on: S.hunt }); LOG.flush(S.lastRow);
    },
    d: () => { S.dodge = !S.dodge; if (!S.auto) release(); },
    r: () => { S.radar = !S.radar; },
    z: () => ZOOM.set(S.zoom * 0.85), x: () => ZOOM.set(S.zoom / 0.85), c: () => ZOOM.set(CFG.zoom),
    escape: togglePause,
  };
  const btn = (label, fn) => {
    const b = document.createElement('button'); b.textContent = label;
    b.style.cssText = 'margin:5px 4px 0 0;padding:3px 7px;border:1px solid #3c6470;border-radius:5px;background:#152b3c;color:#fff;cursor:pointer;font:11px monospace';
    on(b, 'click', e => { e.stopPropagation(); fn(); }); btns.appendChild(b);
  };
  btn('T Bot', ACT.t); btn('H Hujum', ACT.h); btn('D Himoya', ACT.d); btn('R Radar', ACT.r);
  btn('−', ACT.z); btn('+', ACT.x); btn('Esc Pauza', ACT.escape); btn('Log nusxalash', copyLog); btn('O\'chirish', () => stop());
  document.body.appendChild(canvas); document.body.appendChild(hud);
  const ctx = canvas.getContext('2d');
  const resize = () => { canvas.width = innerWidth; canvas.height = innerHeight; };
  resize(); on(W, 'resize', resize);

  const editable = e => e.target && e.target.closest && e.target.closest('input,textarea,select,[contenteditable="true"]');
  const inHud = e => e.target && hud.contains(e.target);
  on(W, 'mousemove', e => { S.mouseX = e.clientX; S.mouseY = e.clientY; if (S.owns && !inHud(e)) e.stopImmediatePropagation(); }, true);
  for (const ty of ['mousedown', 'mouseup', 'pointerdown', 'pointerup']) {
    on(W, ty, e => { if (S.owns && !inHud(e)) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  }
  for (const ty of ['mousedown', 'mouseup', 'keydown', 'keyup', 'wheel']) on(hud, ty, e => e.stopPropagation());
  on(W, 'keydown', e => {
    if (editable(e) || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = (e.key || '').toLowerCase();
    if (k === ' ' && S.owns) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (e.repeat || !ACT[k]) return;
    e.preventDefault(); e.stopImmediatePropagation(); ACT[k]();
  }, true);
  on(W, 'keyup', e => { if (e.key === ' ' && S.owns && !editable(e)) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  on(W, 'wheel', e => {
    if (!ZOOM.ok || editable(e) || inHud(e) || e.ctrlKey || e.metaKey) return;
    e.preventDefault(); e.stopImmediatePropagation(); ZOOM.set(S.zoom * (e.deltaY > 0 ? 0.88 : 1 / 0.88));
  }, { capture: true, passive: false });

  function screen(x, y) {
    const mw = num(W.mww, innerWidth), mh = num(W.mhh, innerHeight), g = num(W.gsc, 1), me = S.env && S.env.me;
    return { x: (num(W.mww2, mw / 2) + (x - num(W.view_xx, me ? me.x : 0)) * g) * innerWidth / mw,
             y: (num(W.mhh2, mh / 2) + (y - num(W.view_yy, me ? me.y : 0)) * g) * innerHeight / mh };
  }
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const env = S.env; if (!S.radar || !env || S.paused) return;
    const line = (P, col, wd) => {
      ctx.beginPath();
      for (let i = 0; i < P.length; i += 2) { const v = screen(P[i], P[i + 1]); i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y); }
      ctx.strokeStyle = col; ctx.lineWidth = wd; ctx.stroke();
    };
    const dot = (x, y, r, col) => { const v = screen(x, y); ctx.beginPath(); ctx.arc(v.x, v.y, r, 0, TAU); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke(); };
    S.rays.forEach((r, i) => { if (i % 3 === 0) line(r.path, r.safe ? '#20bda433' : '#ff3c4b55', 1); });
    for (const h of env.heads.slice(0, 5)) line(h.pred, '#ff8a3d66', 1);
    if (S.sel) line(S.sel.path, S.sel.boost ? '#ffcc44' : '#26f6c1', 3);
    if (S.goal && (S.mode === 'FORAGE' || S.mode === 'LOOT')) dot(S.goal.x, S.goal.y, 10, S.goal.kind === 'loot' ? '#ff5cf0' : '#ffda52');
    if (S.escape) dot(S.escape.x, S.escape.y, 14, '#c77dff');
    if (ATK.cur) dot(ATK.cur.cx, ATK.cur.cy, 12, '#ff6b2c');
    if (COIL.cur) { const h = env.heads.find(x => x.id === COIL.cur.id); if (h) dot(h.x, h.y, 18, '#ff2cdf'); }
    if (S.ring && S.ring.lvl) dot(S.ring.gx, S.ring.gy, 22, S.ring.lvl === 2 ? '#ff2020' : '#ffa020');
  }
  const kb = s => (s.length / 1024).toFixed(1) + ' KB';
  function hudUpdate() {
    const me = S.env && S.env.me, c = ATK.cur, tr = S.trap;
    const logState = LOG.d ? (LOG.d.state === 'recording' ? 'yozilmoqda' : 'tugadi: ' + LOG.d.reason) : 'kutilmoqda';
    info.textContent = [
      'Bot: ' + (S.paused ? 'PAUZA' : S.auto ? 'ON' : 'OFF (qo\'lda)') + ' | Hujum: ' + (S.hunt ? 'ON' : 'OFF') + ' | Himoya(D): ' + (S.dodge ? 'ON' : 'OFF'),
      'Rejim: ' + (MODE_UZ[S.mode] || S.mode),
      'Xavf: ' + S.dangerLvl + ' | Qamal: ' + S.trapLvl + (tr ? ' (aylanma ' + (tr.detour == null ? '∞' : tr.detour) + ', maydon ' + tr.area + ')' : '') +
        (S.threat ? ' | Yaqin bosh: ' + S.threat.id + ' (' + S.threat.gap.toFixed(0) + ')' : ''),
      'Nishon: ' + (c ? c.id + ' · ' + c.phase + (c.counter ? ' (qarshi)' : '') : '—') + ' | Sabab: ' + (c ? 'bajarilmoqda' : ATK.why),
      'O\'rash: ' + (COIL.cur ? COIL.cur.id + ' · ' + COIL.cur.phase + ' · W ' + (COIL.cur.W / Math.PI).toFixed(2) + 'π · R ' + COIL.cur.R.toFixed(0) : COIL.why) +
        ' | Halqa: ' + (S.ring && S.ring.lvl ? S.ring.lvl + ' (' + (S.ring.W / Math.PI).toFixed(2) + 'π, ' + S.ring.id + ')' : '—'),
      'Boost: ' + (S.owns && S.boost ? 'ON (' + S.boostWhy + ')' : 'OFF') + (me ? ' | sp ' + me.sp.toFixed(2) + ' | sct ' + me.sct : ''),
      'Rejalash: ' + S.planMs.toFixed(1) + ' ms | bashorat xatosi ' + (PHY.errStats().mean ?? '—'),
      'Fizika: k ' + PHY.k.toFixed(1) + ' · ω ' + PHY.wN.toFixed(2) + '/' + PHY.wB.toFixed(2) + ' rad/s · radius −' + COLL.shrink.toFixed(0),
      'O\'lim: kuz. ' + DEATH.cnt.observed + ' · ehtim. ' + DEATH.cnt.probable + ' · kill(ehtim.) ' + DEATH.cnt.killLikely +
        ' · hujum ' + (ATK.stats.started + ATK.stats.races) + '/' + ATK.stats.crossed + ' (qarshi ' + ATK.stats.counter + ') · o\'rash ' + COIL.stats.started,
      'Zoom ' + S.zoom.toFixed(2) + ' · ' + ZOOM.msg,
      'Log: ' + logState + ' · ' + kb(LOG.text()),
      'T/H/D/R · Z/X/C/g\'ildirak · Esc',
    ].join('\n');
  }

  /* ================= 19. Asosiy sikl, to'xtatish, API ================= */
  let raf = 0, stopped = false, lastTick = 0, lastHud = 0, errT = [];
  function loop() {
    if (stopped) return;
    raf = requestAnimationFrame(loop);
    const t = now();
    try {
      if (t - lastTick >= CFG.tickMs) {
        const gap = t - lastTick; lastTick = t;
        if (gap > 700 && S.owns) { release(); PHY.reset(); }
        tick(t, gap);
      }
      if (S.owns && !S.paused) apply();
      draw();
      if (t - lastHud > 250) { hudUpdate(); lastHud = t; }
    } catch (e) {
      S.errors++; errT.push(t); errT = errT.filter(x => t - x < 3000);
      LOG.ev(3, 'error', { m: String((e && e.message) || e).slice(0, 140) }); LOG.flush(S.lastRow);
      console.error('[Sentinel]', e);
      if (errT.length >= 5) { S.paused = true; release(); UI.msg('Ketma-ket xatolar — pauza. Console\'ni ko\'ring.'); }
    }
  }
  function stop() {
    if (stopped) return;
    stopped = true;
    try { if (LOG.rec()) LOG.end('bot_stopped'); } catch (e) { console.warn(e); }
    cancelAnimationFrame(raf);
    try { release(); } catch (e) {}
    for (const f of LISTEN.splice(0)) { try { f(); } catch (e) {} }
    hud.remove(); canvas.remove();
    ZOOM.restore();
    try { delete W.__SENTINEL_ZOOM__; } catch (e) { W.__SENTINEL_ZOOM__ = undefined; }
    if (W.__SENTINEL_CLEANUP__ === stop) W.__SENTINEL_CLEANUP__ = undefined;
    api.stopped = true;
    console.info('[Sentinel] o\'chirildi. Oxirgi log: copy(SENTINEL.logText())');
  }
  const api = {
    version: VERSION, stopped: false, stop, copyLog,
    logText: () => LOG.text(),
    pause: () => { if (!S.paused) togglePause(); }, resume: () => { if (S.paused) togglePause(); },
    get zoom() { return S.zoom; }, set zoom(v) { if (fin(v)) ZOOM.set(v); },
    report: () => ({ version: VERSION, mode: S.mode, auto: S.auto, hunt: S.hunt, paused: S.paused, danger: S.dangerLvl, trap: S.trapLvl,
                     attack: ATK.cur ? { id: ATK.cur.id, phase: ATK.cur.phase } : null, why: ATK.why, boost: S.boost, boostWhy: S.boostWhy,
                     physics: { k: PHY.k, wN: PHY.wN, wB: PHY.wB }, planMs: S.planMs, zoom: ZOOM.msg }),
    _t: { CFG, S, PHY, FOOD, DEATH, TR, ATK, LOG, CapGrid, readWorld, buildTrap, simulate, kinPath, crossPaths, evalRays, scoreRay,
          harvestAlongRay, foodTargets, decide, tick, ptSeg, segSeg, segX, release, apply, BL, makeHead, boostDecide, readMe, pickGoal, WEIGHTS,
          COLL, TRO, steerFromDelta, rsOf, COIL, RING, winding, simOptNow, escapeRoute, concPen, setConc: a => { CONC = a.map(concOf); }, ourPts: () => ourPts },
  };
  W.SENTINEL = api;
  W.__SENTINEL_CLEANUP__ = stop;
  ATK.reset(); COIL.reset(); RING.reset();
  ZOOM.install();
  raf = requestAnimationFrame(loop);
  console.info('[Sentinel ' + VERSION + '] tayyor. T: bot · H: hujum · Esc: pauza · Log: copy(SENTINEL.logText())');
})();