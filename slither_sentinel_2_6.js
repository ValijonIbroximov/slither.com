/* Slither Sentinel 2.7 — Chrome F12 → Console ga BIR MARTA joylanadi.
   T: bot  H: hujum (oldini kesish + o'rab olish)  D: qo'lda o'ynashda yordamchi himoya  R: radar
   Z/X yoki g'ildirak: zoom  C: zoom 0.40  Esc: pauza
   Log: paneldagi "Log nusxalash" yoki Console: copy(SENTINEL.logText())
   © Valijon Ibroximov */
(() => {
  'use strict';
  const VERSION = '2.7';
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

  /* ================= 1. Sozlamalar =================
     2.6 jonli logidan kalibrlangan fizika: k=30.8, omegaN=3.52, omegaB=3.85, accUp=11.4, accDown=14.1 */
  const CFG = {
    tickMs: 50,            // qaror davri
    horizon: 2.0, dt: 0.08, rays: 32,
    kInit: 30.8,           // 2.6 log: k = 30.8 (n=272)
    omegaInit: 3.45,       // 2.6 log: wN = 3.52, wB = 3.85 → sc o'sishi bilan moslashadi
    accUp: 11.4, accDown: 14.1, // 2.6 log: accUp = 11.4 (n=254), accDown = 14.1 (n=181)
    latency: 0.09,         // s, buyruq → harakat kechikishi
    rScale: 14.5,          // raqib tanasi radiusi = 14.5·sc
    selfR: 0.45,           // bizning radiusning hisobga olinadigan ulushi
    margin: 6, comfort: 18,
    deadId: -1234,         // o'lgan ilon id'si shu qiymatga almashadi
    headU: [6, 16, 12],    // qattiq tekshiruv uchun bosh noaniqligi a + b·t + c·t²
    headHardT: 1.25,       // s: bosh bilan to'qnashuv shu vaqtgacha "qattiq"
    cell: 40, gridR: 960,  // qamal xaritasi
    zoom: 0.40, zoomMin: 0.08, zoomMax: 2.5,
    boostMinSct: 14, escapeBoostMinSct: 8,
    attackMinSct: 16,      // kesish uchun minimal uzunlik
    attackMaxD: 450,       // 2.6 log: d=504..543 da boshlangan COMMIT'lar 0.25–0.39 s da "kesishuv yo'q" bilan bekor bo'lgan
    raceMinSct: 28, raceMs: 3500, raceCost: 0.08,
    coilMinL: 1300, coilRatio: 0.4, coilMs: 20000, squeezeMs: 30000,
    ringWarn: 1.15 * Math.PI, ringUrgent: 1.6 * Math.PI,
    attackMinTsct: 8,
    closeHeadGap: 220, closeBoostMs: 1050, closeBoostCoolMs: 1400, // 2.6 log: 2.5 s tanaffus ikkinchi hujumchi (491) kelganda boostni bloklagan
    calmMs: 1050, trapCalmMs: 1200, planBudgetMs: 28,
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

  // 2.6 logidagi halokatli xato tuzatildi: kinPath va steerFor endi AYNAN BIR XIL burilish qoidasini ishlatadi.
  // Qulf (side = ±1) faqat |Δ| > 2.35 rad (haqiqiy ≈π orqaga burilish) bo'lgandagina ishlaydi.
  function turnDelta(tgt, a, side) {
    let dd = dAng(tgt, a);
    if (side && Math.abs(dd) > 2.35 && Math.sign(dd) !== side) dd += side * TAU;
    return dd;
  }

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

  /* ================= 3. Fizika kalibratori (o'z ilonimiz kuzatuvidan) =================
     2.6 logida w > e uchun 0.10 va w < e uchun 0.02 og'irlik tufayli kichikligida o'lchangan yuqori burilish tezligi (3.52)
     ilon kattalashganda (sc=1.82) pasaymagan va 0.5 s bashorat xatosi max=81.6 ga chiqqan.
     Endi simmetrik EMA + sc bo'yicha masshtablash ishlatiladi. */
  const PHY = {
    k: CFG.kInit, wN: CFG.omegaInit, wB: CFG.omegaInit, accUp: CFG.accUp, accDown: CFG.accDown,
    scRef: 1.0,
    n: { k: 0, wN: 0, wB: 0, up: 0, down: 0 }, prev: null, win: null, pend: [],
    err: { n: 0, sum: 0, max: 0, keep: [] },
    reset() { this.prev = null; this.win = null; this.pend = []; this.scRef = 1.0; },
    effW(me, boost) {
      const base = boost ? this.wB : this.wN;
      // Ilon qalinlashgan sari burilish burchak tezligi biroz kamayadi; kalibrlangan scRef ga nisbatan tuzatish
      const ratio = clamp(Math.pow(this.scRef / Math.max(me.sc, 1), 0.18), 0.82, 1.08);
      return clamp(base * ratio, 1.3, 6.2);
    },
    observe(me, t, cmdPrev) {
      const p = this.prev;
      if (p) {
        const dt = (t - p.t) / 1000;
        if (dt > 0.032 && dt < 0.22) {
          if (cmdPrev != null && Math.abs(dAng(cmdPrev, p.ang)) > 0.65) {
            const w = Math.abs(dAng(me.ang, p.ang)) / dt;
            if (w > 0.4 && w < 6.2) {
              const key = me.boosting ? 'wB' : 'wN', e = this[key];
              const alpha = w > e ? 0.05 : 0.06; // yuqoriga sakrashlarga chidamli, sc o'sganda tezroq moslashadi
              this[key] = clamp(e + alpha * (w - e), 1.3, 6.2);
              this.scRef += 0.05 * (me.sc - this.scRef);
              this.n[key]++;
            }
          }
          const dsp = (me.sp - p.sp) / dt;
          if (me.boosting && me.sp < me.spB - 0.6 && dsp > 0.5) { this.accUp = clamp(this.accUp + 0.08 * (dsp - this.accUp), 5, 22); this.n.up++; }
          if (!me.boosting && me.sp > me.spN + 0.6 && dsp < -0.5) { this.accDown = clamp(this.accDown + 0.08 * (-dsp - this.accDown), 5, 25); this.n.down++; }
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
    expect(due, x, y, cmd, boost) { this.pend.push({ due, x, y, cmd, boost, ok: true }); if (this.pend.length > 16) this.pend.shift(); },
    check(me, t, cmd, boost) {
      while (this.pend.length && this.pend[0].due <= t) {
        const p = this.pend.shift();
        if (!p.ok) continue;
        const e = hyp(me.x - p.x, me.y - p.y), E = this.err;
        E.n++; E.sum += e; if (e > E.max) E.max = e;
        if (E.keep.length < 120) E.keep.push(e); else E.keep[Math.floor(Math.random() * 120)] = e;
      }
      for (const p of this.pend) if (cmd == null || Math.abs(dAng(cmd, p.cmd)) > 0.12 || boost !== p.boost) p.ok = false;
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
    scan(t) {
      if (t - this.last < 250) return;
      this.last = t;
      const f = W.foods; if (!Array.isArray(f)) return;
      const set = new Set();
      for (let i = 0; i < f.length; i++) {
        const o = f[i]; if (!o || o.eaten || !fin(o.xx) || !fin(o.yy)) continue;
        set.add(o);
        const pv = this.pos.get(o);
        if (!pv) this.pos.set(o, [o.xx, o.yy, 0]);
        else if (Math.abs(pv[0] - o.xx) > 3 || Math.abs(pv[1] - o.yy) > 3) { pv[0] = o.xx; pv[1] = o.yy; pv[2] = t; }
      }
      this.ring.push({ t, set });
      if (this.ring.length > 7) this.ring.shift();
    },
    base() { return this.ring.length ? this.ring[0] : null; },
    alive(o) { const r = this.ring[this.ring.length - 1]; return !!o && !o.eaten && (!r || r.set.has(o)); },
    isNew(o, b) {
      if (!b) return false;
      if (!b.set.has(o)) return true;
      const pv = this.pos.get(o); return !!(pv && pv[2] > b.t);
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
          const dx = o.xx - pts[k], dy = o.yy - pts[k + 1];
          if (dx * dx + dy * dy < R2) { out.push(o); break; }
        }
      }
      return out;
    },
  };

  const DEATH = {
    zones: [], viewR: 1100, cnt: { observed: 0, probable: 0, vanished: 0, leftView: 0, killLikely: 0, diedNearby: 0 },
    reset() { this.zones = []; this.viewR = 1100; for (const k in this.cnt) this.cnt[k] = 0; },
    onDeadFlag(tr, t, me) { this.cnt.observed++; this.addZone(tr, t, 'observed', me); },
    onGone(tr, t, me) {
      if (tr.dead) return;
      if (tr.d > this.viewR * 0.65) { this.cnt.leftView++; return; }
      this.addZone(tr, t, 'pending', me);
    },
    addZone(tr, t, kind, me) {
      const pts = tr.body && tr.body.length ? tr.body.slice() : [];
      pts.push(tr.x, tr.y);
      const z = { id: tr.id, kind, t, pts, base: FOOD.base(), newSet: new Set(), upd: -1e9, sct: tr.sct,
                  x: tr.x, y: tr.y, d: tr.d, until: t + 9000, need: Math.max(6, Math.min(30, tr.sct * 0.2)),
                  ourTarget: ATK.recentTarget(tr.id, t), headToOurBody: me ? ourBodyDist(me, tr.x, tr.y) : null, attributed: false };
      this.zones.push(z);
      if (this.zones.length > 6) this.zones.shift();
      return z;
    },
    update(t, me) {
      for (const z of this.zones) {
        if (t - z.upd >= 250 && t - z.t < 2600) {
          z.upd = t;
          for (const o of FOOD.near(z.pts, 55)) if (FOOD.isNew(o, z.base)) z.newSet.add(o);
        }
        if (z.kind === 'pending') {
          if (z.newSet.size >= z.need) { z.kind = 'probable'; this.cnt.probable++; LOG.death(z, 'probable'); }
          else if (t - z.t > 1500) { z.kind = 'vanished'; this.cnt.vanished++; z.until = t; LOG.death(z, 'vanished'); }
        }
        if (z.kind === 'observed' && !z.logged && t - z.t > 1500) { z.logged = true; LOG.death(z, 'observed'); }
        if ((z.kind === 'observed' || z.kind === 'probable') && !z.attributed && z.ourTarget) {
          z.attributed = true;
          const close = z.headToOurBody != null && z.headToOurBody < 75;
          if (close) this.cnt.killLikely++; else this.cnt.diedNearby++;
          ATK.outcome(z.id, close ? 'killLikely' : 'diedNearby', z);
        }
      }
      this.zones = this.zones.filter(z => t < z.until);
    },
    pendingLoot(me, t) {
      const out = [];
      for (const z of this.zones) {
        if (z.kind !== 'observed' || t - z.t > 2000 || z.newSet.size >= z.need || z.d > 1400) continue;
        let bx = z.x, by = z.y, bd = Infinity;
        for (let i = 0; i + 1 < z.pts.length; i += 2) { const d = hyp(z.pts[i] - me.x, z.pts[i + 1] - me.y); if (d < bd) { bd = d; bx = z.pts[i]; by = z.pts[i + 1]; } }
        out.push({ x: bx, y: by, mass: clamp(z.sct * 0.6, 4, 60) });
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
  const rsOf = (me, trR) => Math.max(trR * 0.8, trR + CFG.selfR * me.r + CFG.margin - COLL.shrink);

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
    const v = tr.v, w0 = clamp(tr.w * (tr.wj < 0.5 && tr.t - tr.since > 1000 ? 0.9 : 0.72), -3.6, 3.6);
    for (let i = 0; i <= n; i++) {
      pred[2 * i] = x; pred[2 * i + 1] = y;
      // Uzoq bashoratda burilish asta-sekin to'g'rilanadi (ilon doimiy doira chizavermaydi, 1 s dan keyin yoy tekislanadi)
      const w = w0 * (i * dt > 0.9 ? 0.65 : 1);
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
          tr = { id, since: t, t, x: h.x, y: h.y, ang, w: 0, wj: 1, dead: false, body: [], wb: [], L: 0, sct: 0, d: 1e9 };
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
      let lx = null, ly = null, fx = null, fy = null, ex = null, ey = null, wx = null, wy = null, L = 0;
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
            if (qx * qx + qy * qy < 250000) {
              const dd = ptSeg(me.x, me.y, lx, ly, x, y);
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
        if (!nb || dd - rs < nb.d) nb = { id: tr.id, d: dd - rs, c: dd, x: (h.x + nk[0]) / 2, y: (h.y + nk[1]) / 2 };
      } else grid.add(h.x, h.y, h.x, h.y, rs, tr.id);
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
    return { t, me, grid, heads: heads.slice(0, 10), allHeads: heads, nb, arena };
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
      mark(p.ax, p.ay, p.bx, p.by, p.r, c, false, Math.max(p.r * 0.75, p.r - 0.25 * me.r - CFG.margin));
    }
    for (const h of heads) {
      if (h.d > R + 400) continue;
      const P = h.pred, n = Math.min(P.length / 2 - 1, Math.round(1.0 / CFG.dt));
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
    const level = d1 < 0 ? 2 : (detour > 350 || area < 150 || (d2 < 0 && area < 450)) ? 1 : 0;
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
    if (d1 < 0) {
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

  /* ================= 7. Trayektoriya simulyatsiyasi ================= */
  const NSTEP = Math.round(CFG.horizon / CFG.dt);
  function kinPath(me, aim, boost, cmd0, side = 0) {
    const dt = CFG.dt, P = new Float64Array(2 * (NSTEP + 1)), A = new Float64Array(NSTEP + 1);
    let x = me.x, y = me.y, a = me.ang, sp = me.sp;
    const spT = boost ? me.spB : me.spN, w = PHY.effW(me, boost);
    P[0] = x; P[1] = y; A[0] = a;
    for (let i = 1; i <= NSTEP; i++) {
      const t = i * dt, tgt = (t <= CFG.latency && cmd0 != null) ? cmd0 : aim;
      const dd = turnDelta(tgt, a, side);
      const da = clamp(dd, -w * dt, w * dt), am = a + da / 2; a += da;
      if (t > CFG.latency) sp = sp < spT ? Math.min(spT, sp + PHY.accUp * dt) : Math.max(spT, sp - PHY.accDown * dt);
      const v = sp * PHY.k; x += Math.cos(am) * v * dt; y += Math.sin(am) * v * dt;
      P[2 * i] = x; P[2 * i + 1] = y; A[i] = a;
    }
    return { P, A };
  }

  // 2.6 logidagi 2-muammo: kelajak tanasi (bosh izi) oldin 2*dt (70 birlik) qadamli nuqtalar sifatida tekshirilgan;
  // endi uzluksiz segSeg kesma-kesma masofasi bilan tekshiriladi — boostdagi raqib izi orasidan nur "teshib" o'tmaydi.
  function simulate(env, aim, boost, cmd0, opt = S.simOpt) {
    const { me, grid, heads, arena } = env, dt = CFG.dt, U = CFG.headU, HT = CFG.headHardT;
    const side = opt && opt.side != null ? opt.side : (S.turnSide || 0);
    const { P } = kinPath(me, aim, boost, cmd0, side), out = {};
    const vMax = me.spB * PHY.k;
    let minGap = 60, ttc = Infinity, risk = 0, who = null, stop = NSTEP;
    let g0 = grid.gap(me.x, me.y, me.x, me.y, 60);
    for (const h of heads) g0 = Math.min(g0, hyp(me.x - h.x, me.y - h.y) - h.rs - U[0]);
    for (let i = 1; i <= NSTEP; i++) {
      const t = i * dt, x0 = P[2 * i - 2], y0 = P[2 * i - 1], x = P[2 * i], y = P[2 * i + 1];
      let g = grid.gap(x0, y0, x, y, 60, out), gw = out.cap ? out.cap.id : null;
      if (arena) { const ga = arena.R - me.r - CFG.margin - hyp(x - arena.cx, y - arena.cy); if (ga < g) { g = ga; gw = 'chegara'; } }
      const u = U[0] + U[1] * t + U[2] * t * t;
      for (let k = 0; k < heads.length; k++) {
        const h = heads[k], H = h.pred, own = !!opt && h.id === opt.id;
        if (h.d > (vMax + h.v * 1.6) * t + h.rs + 220) continue;
        // Raqib boshining [t-dt, t] dagi harakat kesmasi bilan bizning [t-dt, t] kesmamiz orasidagi uzluksiz masofa
        const ds = segSeg(x0, y0, x, y, H[2 * i - 2], H[2 * i - 1], H[2 * i], H[2 * i + 1]);
        if (t <= (own ? opt.ht : HT)) {
          const gh = ds - h.rs - u * (own ? opt.uK : 1);
          if (gh < g) { g = gh; gw = h.id; }
        }
        // Raqib boshining [0 .. t-dt] dagi uzluksiz izi (kelajakda hosil bo'ladigan bo'yin va tana)
        for (let q = 0; (q + 1) < i && q * dt <= HT; q += 2) {
          const q2 = Math.min(i - 1, q + 2);
          const gt = segSeg(x0, y0, x, y, H[2 * q], H[2 * q + 1], H[2 * q2], H[2 * q2 + 1]) - h.rs - (U[0] + U[1] * q * dt) * 0.55;
          if (gt < g) { g = gt; gw = h.id; }
        }
        const soft = h.rs + u + 42 * t * t + (h.boosting ? 40 : 25);
        if (ds < soft && !(own && t > opt.ht)) risk += (soft - ds) * dt * (h.boosting ? 1.35 : 1);
      }
      const th = g0 < 0 ? Math.min(0, g0 - 3 + 60 * Math.max(0, t - 0.35)) : 0;
      if (g < minGap) { minGap = g; who = gw; }
      if (g < th && ttc === Infinity) ttc = t;
      if (g < th - 25) { stop = i; break; }
    }
    for (let j = stop + 1; j <= NSTEP; j++) { P[2 * j] = P[2 * stop]; P[2 * j + 1] = P[2 * stop + 1]; }
    return { aim: wrap(aim), boost: !!boost, path: P, ttc, gap: minGap, g0, risk, who, safe: ttc === Infinity,
             ex: P[2 * NSTEP], ey: P[2 * NSTEP + 1] };
  }

  function crossPaths(K, H) {
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
    return null;
  }

  function evalRays(env, specials, cmd0, nRays) {
    const me = env.me, out = [], used = [];
    const add = a => {
      if (!fin(a)) return; a = wrap(a);
      for (const b of used) if (Math.abs(dAng(a, b)) < 0.03) return;
      used.push(a); out.push(simulate(env, a, false, cmd0));
    };
    for (const a of specials) add(a);
    for (let i = 0; i < nRays; i++) add(me.ang + (i - nRays / 2) * TAU / nRays);
    return out;
  }

  const WEIGHTS = {
    FORAGE: { clear: 0.65, goal: 1.0, turn: 6, stab: 10, risk: 1.6, open: 0.45, pocket: 1, maxTurn: 2.0, conc: 1.1 },
    LOOT:   { clear: 0.6,  goal: 1.45, turn: 4, stab: 8,  risk: 1.7, open: 0.45, pocket: 1, maxTurn: 2.3, conc: 0.8 },
    LOOP:   { clear: 1.0,  goal: 1.0, turn: 3, stab: 10, risk: 2,   open: 0.8, pocket: 1, maxTurn: 1.6, conc: 1 },
    EVADE:  { clear: 3.2,  goal: 0.15, turn: 1.8, stab: 6, risk: 4.2, open: 1.1, pocket: 1, maxTurn: null, conc: 1.2 },
    ESCAPE: { clear: 1.4,  goal: 1.0, turn: 1, stab: 10, risk: 3.2, open: 3.0, pocket: 0, maxTurn: null, conc: 2 },
    EXIT:   { clear: 1.2,  goal: 0,   turn: 4, stab: 6,  risk: 2,   open: 0.4, pocket: 1, maxTurn: null, conc: 0.5 },
    COIL:   { clear: 1.0,  goal: 2.5, turn: 0.5, stab: 3, risk: 0.8, open: 0.3, pocket: 0, maxTurn: null, conc: 0 },
    ASSIST: { clear: 1.0,  goal: 2.0, turn: 1, stab: 4,  risk: 2,   open: 0.3, pocket: 0, maxTurn: null, conc: 0 },
  };
  let CONC = [];
  const concOf = P => { let x0 = 1e12, y0 = 1e12, x1 = -1e12, y1 = -1e12; for (let i = 0; i + 1 < P.length; i += 2) { x0 = Math.min(x0, P[i]); x1 = Math.max(x1, P[i]); y0 = Math.min(y0, P[i + 1]); y1 = Math.max(y1, P[i + 1]); } return { P, x0, y0, x1, y1 }; };
  function concPen(x, y) {
    let p = 0;
    for (const c of CONC) {
      if (x < c.x0 || x > c.x1 || y < c.y0 || y > c.y1) continue;
      const a = Math.abs(winding(c.P, x, y, 1300)); if (a > 0.85 * Math.PI) p += (a - 0.85 * Math.PI) * 95;
    }
    return p;
  }
  function scoreRay(r, me, w, goal, prevCmd, trap, exitDir) {
    if (!r.safe) return -1e6 + r.ttc * 2e4 + clamp(r.gap, -100, 60) * 35 - r.risk * 2 - 55 * Math.abs(dAng(r.aim, prevCmd == null ? me.ang : prevCmd));
    let s = w.clear * Math.min(r.gap, 60) - w.risk * r.risk;
    const turn = Math.abs(dAng(r.aim, me.ang));
    s -= w.turn * turn + w.stab * Math.abs(dAng(r.aim, prevCmd == null ? me.ang : prevCmd));
    if (w.maxTurn != null && turn > w.maxTurn) s -= 400 * (turn - w.maxTurn);
    if (goal && w.goal) {
      const d0 = hyp(goal.x - me.x, goal.y - me.y); let best = d0;
      for (let i = 2; i < r.path.length; i += 2) best = Math.min(best, hyp(goal.x - r.path[i], goal.y - r.path[i + 1]));
      s += w.goal * Math.min(300, d0 - best) * 0.5;
    }
    if (trap) {
      const d0 = trap.dHere, d1 = trap.dAt(r.ex, r.ey);
      s += w.open * clamp(d0 - d1, -20, 20) * 10;
      if (w.pocket && d0 < 9999 && d1 >= 9999) s -= 320 * w.pocket;
    }
    if (exitDir != null && Math.abs(dAng(r.aim, exitDir)) > 0.6) s -= 500;
    if (w.conc && CONC.length) s -= w.conc * concPen(r.ex, r.ey);
    return s;
  }

  /* ================= 8. Hujum: oldini kesish — holat mashinasi =================
     2.6 logidagi 10/10 bekor bo'lish sabablari tuzatildi:
     1) Boshlang'ich COMMIT faqat yaqin va aniq masofada (d ≤ 450, th ≤ 0.82 s); uzoqroq nishonga avval RACE bilan yaqinlashiladi.
     2) COMMIT ichida qayta rejalash oynasi ±0.35 rad va har tick ±0.26 rad tuzatish — nishonning tabiiy egriligi rejani buzmaydi.
     3) Biz nishon oldiga juda yaqin kelib qolganda (d < 300 va th < 0.55 s) nishon vahimada burilsa ham, yo'limiz xavfsiz bo'lsa
        hujum bekor qilinmaydi — kesish devori oxirigacha tortiladi (193.3 s dagi id=184 kabi kill'larni yo'qotmaslik uchun). */
  const topWhy = o => { let k = null, v = -1; for (const x in o) if (o[x] > v) { v = o[x]; k = x; } return k; };
  const ATK = {
    cur: null, cool: new Map(), globalCool: 0, lastEval: -1e9, why: 'kutilmoqda', obs: [],
    stats: null,
    reset() {
      this.cur = null; this.cool.clear(); this.globalCool = 0; this.lastEval = -1e9; this.why = 'kutilmoqda'; this.obs = [];
      this.stats = { started: 0, races: 0, raceToCut: 0, counter: 0, aborted: 0, crossed: 0, ended: 0, abortWhy: {}, outcomes: {} }; this.whyHist = {};
    },
    recentTarget(id, t) { return this.obs.some(o => o.id === id && t - o.t < 3800); },
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
          if (opts.only == null && (this.cool.get(h.id) || 0) > env.t) { no('tanaffus'); continue; }
          if (h.d < 110 || h.d > (CT ? 650 : CFG.attackMaxD)) { no('masofa'); continue; }
          if (h.age < 0.35) { no('kuzatuv qisqa'); continue; }
          if (Math.abs(h.w) > (CT ? 3.2 : 1.45)) { no('nishon burilmoqda'); continue; }
        } else if (Math.abs(h.w) > (CT ? 3.8 : (h.d < 290 ? 3.2 : 2.5))) { no('nishon keskin burildi'); continue; }
        if (h.v < 60) { no('nishon sekin'); continue; }
        if (!RX && !CT && h.sct < CFG.attackMinTsct) { no('nishon mayda'); continue; }
        const vN = me.spN * PHY.k, tBoost = h.v > 1.25 * vN;
        if (tBoost && !RX && !CT && Math.abs(h.w) > 0.9) { no('nishon boostda burilmoqda'); continue; }
        const aims = [];
        if (RX) for (const o of [-0.32, -0.22, -0.14, -0.07, 0, 0.07, 0.14, 0.22, 0.32]) aims.push({ aim: wrap(opts.aimC + o), off: o });
        else {
          if (!shared) { shared = []; for (let o = -1.4; o <= 1.4001; o += 0.14) shared.push({ aim: wrap(me.ang + o), off: o }); }
          for (const a of shared) aims.push(a);
        }
        const H = h.pred, nS = H.length / 2 - 1;
        const side = Math.sign(cross(Math.cos(h.ang), Math.sin(h.ang), me.x - h.x, me.y - h.y)) || 1;
        if (!opts.noIp) for (const ti of [0.35, 0.55, 0.75, 1.0, 1.25, 1.55]) {
          const j = Math.min(nS - 1, Math.round(ti / CFG.dt));
          const ex = H[2 * j + 2] - H[2 * j], ey = H[2 * j + 3] - H[2 * j + 1], el = hyp(ex, ey) || 1;
          const nx = side * ey / el, ny = -side * ex / el;
          for (const D of [65, 160, 240]) {
            const a = Math.atan2(H[2 * j + 1] + ny * D - me.y, H[2 * j] + nx * D - me.x);
            if (RX && Math.abs(dAng(a, opts.aimC)) > 0.58) continue;
            if (Math.abs(dAng(a, me.ang)) > 2.1) continue;
            aims.push({ aim: a, off: dAng(a, me.ang), ip: true });
          }
        }
        for (const p of aims) {
          if (!p.K) p.K = kinPath(me, p.aim, true, S.steer, 0);
          const X = crossPaths(p.K, H);
          if (!X) { no('kesishuv yo\'q'); continue; }
          const sinX = Math.abs(Math.sin(X.ourDir - X.enDir));
          if (sinX < (RX ? 0.34 : CT ? 0.35 : 0.48)) { no('burchak kichik'); continue; }
          if (X.th < (RX ? 0.02 : 0.06) || X.th > (RX ? 1.25 : CT ? 1.1 : 0.82) || X.tc > (RX ? 2.1 : 1.75)) { no('vaqt oynasi'); continue; }
          const lead = X.tc - X.th, leadMin = Math.max(tBoost ? 0.42 : 0, ((h.rs + 14) / Math.max(h.v, 60) + 0.14) * (RX ? 0.55 : CT ? 0.75 : 1));
          if (lead < leadMin) { no(tBoost ? 'nishon boostda' : 'kechikamiz'); continue; }
          if (tBoost && X.tc > 1.35) { no('nishon boostda'); continue; }
          if (X.tc + (RX ? 0.08 : 0.22) > X.th + me.L / vB * 0.85) { no('tana qisqa'); continue; }
          const need = 0.22 + (Math.PI / 2) / Math.max(PHY.wN, 1.5);
          const diff = need / Math.max(X.tc, 0.1);
          if (!CT && diff < (RX ? 0.28 : 0.44)) { no('nishon qochib ulguradi'); continue; }
          const sc = 65 * Math.min(diff, 1.6) + 30 * sinX + 18 * Math.min(lead, 0.65) - 32 * X.th - 6 * Math.abs(p.off) + Math.min(20, h.sct / 20);
          cand.push(Object.assign({ h, aim: p.aim, lead, diff, sinX, sc, ip: !!p.ip }, X));
        }
      }
      cand.sort((a, b) => b.sc - a.sc);
      for (const c of cand.slice(0, 4)) {
        const r = simulate(env, c.aim, true, S.steer, { id: c.h.id, ht: c.th + 0.12, uK: 1, side: 0 });
        if (r.safe && r.gap >= (RX ? 4 : 9)) { c.ray = r; return { best: c, why }; }
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
      S.turnSide = 0;
      if (kind === 'counter') this.stats.counter++;
      if (prev && prev.phase === 'RACE') this.stats.raceToCut++; else this.stats.started++;
      this.why = 'hujum bajarilmoqda';
      this.watch(h.id, t, kind, false);
      LOG.atk(kind === 'counter' ? 'counter' : 'start', this.cur, env);
    },
    raceCand(env) {
      const me = env.me, vB = me.spB * PHY.k;
      if (me.sct < CFG.raceMinSct || me.L < 650) return null;
      let best = null;
      for (const h of env.heads) {
        if ((this.cool.get(h.id) || 0) > env.t || h.age < 0.5 || h.sct < 8 || h.d > 720) continue;
        if (h.v > 0.72 * vB || Math.abs(dAng(h.ang, me.ang)) > 0.85 || Math.abs(h.w) > 1.15) continue;
        const ux = Math.cos(h.ang), uy = Math.sin(h.ang), rx = me.x - h.x, ry = me.y - h.y;
        const along = rx * ux + ry * uy, lat = cross(ux, uy, rx, ry);
        if (along < -360 || along > 180 || Math.abs(lat) < 55 || Math.abs(lat) > 400) continue;
        const sc = h.sct - Math.abs(lat) * 0.02 - Math.max(0, -along) * 0.03;
        if (!best || sc > best.sc) best = { h, sc, lat, along };
      }
      return best;
    },
    raceAim(h, me) {
      const ux = Math.cos(h.ang), uy = Math.sin(h.ang), lat = cross(ux, uy, me.x - h.x, me.y - h.y), s = Math.sign(lat) || 1;
      return wrap(h.ang - s * clamp((Math.abs(lat) - 140) / 240, -0.38, 0.38));
    },
    tryStart(env, blocked, flags = {}) {
      const t = env.t, me = env.me;
      if (t - this.lastEval < 150) return false;
      this.lastEval = t;
      const no = w => { this.why = w; const k = w.split(' ')[0] === 'uzunlik' ? 'uzunlik' : w; this.whyHist[k] = (this.whyHist[k] || 0) + 1; return false; };
      if (!S.hunt) return no('hujum o\'chiq (H)');
      if (me.sct < CFG.attackMinSct) return no('uzunlik ' + me.sct + '/' + CFG.attackMinSct);
      if (blocked) return no(blocked);
      if (!flags.counter && t < this.globalCool) return no('umumiy tanaffus');
      const res = this.plan(env, { counter: !!flags.counter });
      if (res.best && res.best.sc >= (flags.counter ? 15 : 38)) { this.commit(res.best, env, flags.counter ? 'counter' : 'cut'); return true; }
      if (!flags.counter) {
        const rc = this.raceCand(env);
        if (rc) {
          const aim = this.raceAim(rc.h, me), r = simulate(env, aim, true, S.steer, { id: rc.h.id, ht: 0.9, uK: 1, side: 0 });
          if (r.safe && r.gap >= 12) {
            this.cur = { id: rc.h.id, phase: 'RACE', kind: 'race', aim, started: t, sct0: me.sct, unsafeN: 0, lastPlan: t, cx: rc.h.x, cy: rc.h.y,
                         plan: { lat: r0(rc.lat), along: r0(rc.along), d: r0(rc.h.d), tsct: rc.h.sct } };
            S.turnSide = 0; this.stats.races++; this.why = 'quvib o\'tish';
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
      this.obs = this.obs.filter(o => { if (t - o.t < 3800) return true; if (!o.done) this.outcome(o.id, 'survived'); return false; });
      const c = this.cur; if (!c) return;
      const h = env.heads.find(x => x.id === c.id);
      const trc = TR.get(c.id);
      if (!h && trc && trc.dead) return this.end(t, 'nishon o\'ldi');
      if (c.phase !== 'EXIT') this.watch(c.id, t, c.kind, false);
      if (!c.counter && c.phase !== 'EXIT' && S.trapLvl >= 1) return this.abort(t, 'qamal');
      if (c.phase === 'RACE') {
        if (!h) return this.abort(t, 'nishon ko\'rinmay qoldi');
        if (t - c.started > CFG.raceMs) return this.abort(t, 'quvish vaqti tugadi');
        if (me.sct < c.sct0 * (1 - CFG.raceCost) - 1) return this.abort(t, 'boost qimmat');
        if (Math.abs(dAng(h.ang, me.ang)) > 1.25) return this.abort(t, 'nishon burildi');
        if (h.v > 0.85 * me.spB * PHY.k) return this.abort(t, 'nishon boostda');
        c.aim = this.raceAim(h, me); c.cx = h.x; c.cy = h.y;
        if (t - c.lastPlan >= 100) {
          c.lastPlan = t;
          const res = this.plan(env, { only: h.id });
          if (res.best && res.best.sc >= 32) this.commit(res.best, env, 'cut');
        }
        return;
      }
      if (c.phase === 'COMMIT') {
        if (!h) return this.abort(t, 'nishon ko\'rinmay qoldi');
        if (t - c.started > 2600) return this.abort(t, 'vaqt tugadi');
        const ux = Math.cos(h.ang), uy = Math.sin(h.ang), rx = me.x - h.x, ry = me.y - h.y;
        const lat = cross(ux, uy, rx, ry), ahead = rx * ux + ry * uy;
        const near = h.d - h.rs < 250 || hyp(me.x - c.cx, me.y - c.cy) < 110;
        if (Math.sign(lat) !== c.side0 && ahead > -h.rs * 0.5 && near) {
          c.phase = 'EXIT'; c.crossT = t; c.exitDir = me.ang;
          c.exitUntil = t + clamp(c.tcAbs - t + 700, 500, 1500);
          this.stats.crossed++;
          this.watch(c.id, t, c.kind, true);
          LOG.atk('cross', c, env);
          return;
        }
        const res = this.plan(env, { only: c.id, aimC: c.aim, counter: c.counter });
        if (res.best) {
          const b = res.best; c.fails = 0;
          c.aim = wrap(c.aim + clamp(dAng(b.aim, c.aim), -0.26, 0.26));
          c.cx = b.cx; c.cy = b.cy; c.ourDir = b.ourDir; c.tcAbs = t + b.tc * 1000; c.thAbs = t + b.th * 1000; c.ray = b.ray;
        } else {
          // Nishon juda yaqin (d < 290) va kesishuv vaqtiga < 0.45 s qolganida vahimada burilsa, kesish chizig'idan
          // voz kechish o'rniga EXIT fazasiga o'tib devorni ushlab turamiz (yo'l xavfsiz bo'lsa).
          if (h.d < 290 && c.thAbs - t < 450 && ahead > -30) {
            const rHold = simulate(env, c.aim, true, S.steer, { id: c.id, ht: 0.45, uK: 0.8, side: 0 });
            if (rHold.safe && rHold.gap >= 6) {
              c.phase = 'EXIT'; c.crossT = t; c.exitDir = c.aim; c.exitUntil = t + 650;
              this.stats.crossed++;
              this.watch(c.id, t, c.kind, true);
              LOG.atk('cross', c, env);
              return;
            }
          }
          c.fails++; c.lastWhy = topWhy(res.why);
          if (c.fails >= 5) return this.abort(t, 'reja buzildi: ' + c.lastWhy);
        }
      } else if (c.phase === 'EXIT') {
        if (h && h.d - h.rs < 150 && Math.abs(dAng(Math.atan2(h.y - me.y, h.x - me.x), me.ang)) < 1.4) return this.end(t, 'nishon oldinda');
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
      this.cool.set(c.id, t + 4000); this.globalCool = t + (c.counter ? 300 : 1500);
      LOG.atk('abort', c, null, why);
      this.cur = null; this.why = 'bekor: ' + why;
    },
    end(t, why) {
      const c = this.cur; if (!c) return;
      this.stats.ended++;
      this.cool.set(c.id, t + 3000); this.globalCool = t + 1200;
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

  /* ================= 9. Ozuqa nishoni, barqarorlik, aylanish ================= */
  const BL = [];
  const blacklisted = (x, y, t) => BL.some(b => t < b.until && hyp(b.x - x, b.y - y) < 120);
  const blacklist = (x, y, t, ms) => { BL.push({ x, y, until: t + ms }); while (BL.length > 12) BL.shift(); };

  function foodTargets(env, trap) {
    const me = env.me, t = env.t, cell = 100, m = new Map(), R = 1400;
    const lootObj = new Map(); for (const L of DEATH.lootSet()) lootObj.set(L.o, L.z.ourTarget ? 1.5 : 1);
    const add = (x, y, mass, isL) => {
      const dx = x - me.x, dy = y - me.y; if (dx * dx + dy * dy > R * R) return;
      const k = Math.floor(x / cell) * 100003 + Math.floor(y / cell);
      let c = m.get(k); if (!c) m.set(k, c = { sx: 0, sy: 0, mass: 0, loot: 0, n: 0 });
      c.sx += x * mass; c.sy += y * mass; c.mass += mass; c.n++; if (isL) c.loot += mass;
    };
    const f = Array.isArray(W.foods) ? W.foods : [];
    for (let i = 0; i < f.length; i++) {
      const o = f[i]; if (!o || o.eaten || !fin(o.xx) || !fin(o.yy)) continue;
      const sz = num(o.sz, 5), lw = lootObj.get(o);
      add(o.xx, o.yy, clamp(sz * sz, 1, 400) / 16 * (lw || 1), !!lw);
    }
    for (const pl of DEATH.pendingLoot(me, t)) add(pl.x, pl.y, pl.mass, true);
    for (const p of (Array.isArray(W.preys) ? W.preys : [])) if (okObj(p) && !p.eaten) add(p.xx, p.yy, 3, false);
    const vN = me.spN * PHY.k, wEff = PHY.effW(me, false), Rt = vN / wEff, sa = Math.sin(me.ang), ca = Math.cos(me.ang);
    const cL = { x: me.x - sa * Rt, y: me.y + ca * Rt }, cR = { x: me.x + sa * Rt, y: me.y - ca * Rt };
    const out = [];
    for (const c of m.values()) {
      const x = c.sx / c.mass, y = c.sy / c.mass, d = hyp(x - me.x, y - me.y);
      if (d < me.r * 0.8) continue;
      if (hyp(x - cL.x, y - cL.y) < Rt * 0.92 || hyp(x - cR.x, y - cR.y) < Rt * 0.92) continue;
      if (blacklisted(x, y, t)) continue;
      if (env.grid.gap(x, y, x, y, 42) < 8) continue;
      if (trap.dHere < 9999 && trap.dAt(x, y) >= 9999) continue;
      if (CONC.length && concPen(x, y) > 0.18 * Math.PI * 95) continue;
      const ang = Math.atan2(y - me.y, x - me.x), eta = d / vN + Math.abs(dAng(ang, me.ang)) / wEff;
      const etaB = d / (me.spB * PHY.k) + Math.abs(dAng(ang, me.ang)) / PHY.effW(me, true) + 0.15;
      let rival = Infinity, crowd = 0, fastThreat = false;
      for (const h of env.allHeads) {
        const dh = hyp(h.x - x, h.y - y); if (dh < 380) crowd++;
        rival = Math.min(rival, dh / Math.max(h.v, 60));
        // 2.6 log (220.53 s): boostdagi raqib (sp=14) ozuqa yo'nalishida kelayotgan bo'lsa, ozuqaga burilmaslik
        if (h.boosting && dh < 420 && Math.cos(h.ang - Math.atan2(y - h.y, x - h.x)) > 0.35) fastThreat = true;
      }
      if (fastThreat && d > 140) continue;
      const contested = rival < eta * 0.85 && rival < 2.5;
      const winB = contested && c.loot >= 3 && me.sct >= CFG.boostMinSct && etaB < rival * 0.82 && !fastThreat;
      let val = (c.mass + 5 * c.loot) / ((winB ? etaB : eta) + 0.7);
      if (contested && !winB) val *= 0.32;
      if (crowd >= 3) val *= winB ? 0.65 : 0.35;
      out.push({ x, y, d, ang, eta, etaB, mass: c.mass, loot: c.loot, n: c.n, contested, winB, crowd, rival, val });
    }
    out.sort((a, b) => b.val - a.val);
    return out.slice(0, 12);
  }

  function pickGoal(env, foods) {
    const t = env.t, me = env.me, g = S.goal;
    if (g) {
      const match = foods.find(f => hyp(f.x - g.x, f.y - g.y) < 90);
      const d = hyp(g.x - me.x, g.y - me.y);
      if (d < g.bestD - 15) { g.bestD = d; g.progT = t; }
      const stalled = t - g.progT > 2200;
      if (match && !stalled && t < g.until) {
        const best = foods[0];
        if (!(best && best !== match && best.val > match.val * 1.6 + 0.2)) {
          g.x = match.x; g.y = match.y; g.ref = match; g.kind = match.loot >= 3 ? 'loot' : 'food';
          return g;
        }
      } else if (stalled) { blacklist(g.x, g.y, t, 4000); LOG.ev(1, 'goal_stalled', { x: r0(g.x), y: r0(g.y) }); }
    }
    const best = foods[0];
    if (!best) { S.goal = null; return null; }
    S.goal = { x: best.x, y: best.y, kind: best.loot >= 3 ? 'loot' : 'food', until: t + 6000, bestD: best.d, progT: t, ref: best };
    if (S.goal.kind === 'loot') LOG.ev(1, 'loot_goal', { d: r0(best.d), loot: r1(best.loot), mass: r1(best.mass), contested: best.contested, winB: best.winB, crowd: best.crowd });
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
      for (const r of rays) if (r.safe && Math.abs(dAng(r.aim, me.ang)) < 1.2) {
        const sc = Math.min(r.gap, 60) - (S.trap ? S.trap.dAt(r.ex, r.ey) * 0.5 : 0);
        if (sc > bg) { bg = sc; bestA = r.aim; }
      }
      S.loopGoal = { x: me.x + Math.cos(bestA) * 700, y: me.y + Math.sin(bestA) * 700 };
      S.loopUntil = t + 2500; S.trail = []; S.loopBreaks++;
      LOG.ev(2, 'loop_break', { path: r0(path), turn: r2(turn), dir: r2(bestA), n: S.loopBreaks });
    }
  }

  /* ================= 10. Xavf darajasi va gisterezis ================= */
  function hyst(key, lvl, t, calm) {
    const L = key + 'Lvl', C = key + 'Calm';
    if (lvl >= S[L]) { S[L] = lvl; S[C] = t; }
    else if (t - S[C] >= calm) { S[L] = Math.max(lvl, S[L] - 1); S[C] = t; }
  }
  function assess(env, rays, cur) {
    const anySafe = rays.some(r => r.safe), comfy = rays.some(r => r.safe && r.gap >= CFG.comfort);
    let lvl = 0;
    if (!anySafe || cur.ttc < 0.75 || S.trapLvl >= 2) lvl = 2;
    else if (!cur.safe || cur.gap < 12 || !comfy || S.trapLvl >= 1) lvl = 1;
    if (S.threat) lvl = Math.max(lvl, S.threat.gap < 95 ? 2 : 1);
    S.dangerRaw = lvl; S.comfy = comfy;
    hyst('danger', lvl, env.t, S.dangerLvl === 2 ? 600 : CFG.calmMs);
    if (S.dangerLvl >= 1) { if (!S.dangerSince) S.dangerSince = env.t; } else S.dangerSince = 0;
  }

  /* ================= 11. Boost boshqaruvi (2.7: favqulodda boost muqobil nurlarni ham tekshiradi) ================= */
  function boostDecide(env, mode, sel, rays, w, g, trap, exitDir) {
    const t = env.t, me = env.me;
    let want = false, why = '';
    const gRef = S.goal && S.goal.ref;
    if (mode === 'ATTACK' && ATK.cur && (ATK.cur.phase === 'COMMIT' || ATK.cur.phase === 'RACE') && sel.boost)
      return { ray: sel, why: ATK.cur.phase === 'RACE' ? 'quvib o\'tish' : ATK.cur.counter ? 'qarshi kesish' : 'hujum' };
    const esc = S.escape;
    const urgentThreat = S.threat && (S.threat.gap < 115 || S.threat.id !== S.lastThreatBoostId || t > S.closeBoostEnd + CFG.closeBoostCoolMs);
    if (mode === 'COIL' && COIL.wantBoost) { want = true; why = 'o\'rab olish'; }
    else if (mode === 'ESCAPE' && esc && esc.src !== 'markaz' && me.sct >= CFG.escapeBoostMinSct && sel.safe &&
             Math.abs(dAng(sel.aim, me.ang)) < 0.65 && (esc.src !== 'chiqish' || (S.trap && S.trap.level === 1))) {
      want = true; why = esc.src === 'halqa' ? 'halqadan chiqish' : 'qamaldan chiqish';
    }
    else if ((mode === 'EVADE' || mode === 'ESCAPE') && (!sel.safe || sel.ttc < 0.9 || sel.gap < 4) && me.sct >= CFG.escapeBoostMinSct) {
      want = true; why = 'favqulodda';
    }
    else if (S.threat && mode !== 'ATTACK' && mode !== 'COIL' && me.sct >= CFG.boostMinSct && Math.abs(dAng(sel.aim, me.ang)) < 0.85 &&
             Math.cos(sel.aim - Math.atan2(me.y - S.threat.y, me.x - S.threat.x)) > 0.05 && urgentThreat) {
      S.closeBoostEnd = t + CFG.closeBoostMs; S.lastThreatBoostId = S.threat.id;
      want = true; why = 'yaqin boshdan uzoqlashish';
    }
    else if (t <= S.closeBoostEnd && sel.safe && Math.abs(dAng(sel.aim, me.ang)) < 0.75 && mode !== 'ATTACK' && mode !== 'COIL') {
      want = true; why = 'yaqin boshdan uzoqlashish';
    }
    else if ((mode === 'EVADE' || mode === 'ESCAPE') && sel.safe && me.sct >= CFG.boostMinSct && S.dangerSince && t - S.dangerSince > 1700 &&
             env.heads[0] && env.heads[0].d - env.heads[0].rs < 230 && Math.abs(dAng(sel.aim, me.ang)) < 0.65) {
      if (t > S.breakEnd + 2600) S.breakEnd = t + 1200;
      if (t <= S.breakEnd) { want = true; why = 'aloqani uzish'; }
    }
    else if (mode === 'LOOT' && gRef && me.sct >= CFG.boostMinSct && gRef.loot >= 3 && gRef.crowd < 4 && Math.abs(dAng(gRef.ang, me.ang)) < 0.6 &&
             (gRef.winB || (gRef.loot >= 8 && gRef.d > 150 && !gRef.contested) || (gRef.d > 250 && !gRef.contested && gRef.eta - gRef.etaB > 0.35))) {
      want = true; why = gRef.winB ? 'ozuqa poygasi' : 'o\'lim ozuqasi';
    }
    let ray = sel;
    if (want) {
      const rb = sel.boost ? sel : simulate(env, sel.aim, true, S.steer);
      const ok = why === 'favqulodda' ? (rb.safe || rb.ttc > sel.ttc + 0.15 || (rb.ttc >= sel.ttc && rb.gap > sel.gap + 8)) : (rb.safe && rb.gap >= 9);
      if (ok) ray = rb;
      else if (why === 'favqulodda' && rays && rays.length) {
        // 2.6 log (221.69–221.95): tanlangan oddiy nurda boost foyda bermaganda, eng yaxshi 5 ta muqobil yo'nalishni boost bilan sinaymiz
        const top = rays.slice().sort((a, b) => scoreRay(b, me, w, g, S.cmd, trap, exitDir) - scoreRay(a, me, w, g, S.cmd, trap, exitDir)).slice(0, 5);
        let bestB = null, bestSc = scoreRay(sel, me, w, g, S.cmd, trap, exitDir) + 1500;
        for (const cand of top) {
          const rCand = simulate(env, cand.aim, true, S.steer);
          const sc = scoreRay(rCand, me, w, g, S.cmd, trap, exitDir);
          if ((rCand.safe || rCand.ttc > sel.ttc + 0.18) && sc > bestSc) { bestSc = sc; bestB = rCand; }
        }
        if (bestB) ray = bestB; else { want = false; why = 'boost yo\'li xavfliroq'; }
      } else { want = false; why = 'boost yo\'li xavfliroq'; }
    }
    if (!want && sel.boost) ray = simulate(env, sel.aim, false, S.steer);
    if (!want && S.boost && t - S.boostSince < 250 && why !== 'boost yo\'li xavfliroq' && mode !== 'EVADE' && mode !== 'ESCAPE') {
      const rb = simulate(env, ray.aim, true, S.steer);
      if (rb.safe && rb.gap >= 10) { ray = rb; want = true; why = S.boostWhy || 'ushlab turish'; }
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
      if (!h || h.age < 0.5) return 'kuzatuv qisqa';
      if (me.L < CFG.coilMinL) return 'tana qisqa';
      if (h.L > me.L * (relaxed ? 0.55 : CFG.coilRatio) || h.sc > me.sc * 1.05) return 'nishon katta';
      if (!relaxed && h.sct < 14) return 'nishon juda kichik';
      if (h.d > (relaxed ? 520 : 650)) return 'uzoq';
      if (h.v > me.spN * PHY.k * 1.35) return 'nishon boostda';
      for (const o of env.heads) if (o.id !== h.id && o.L > me.L * 0.5 && hyp(o.x - h.x, o.y - h.y) < 500) return 'yonida katta ilon';
      return null;
    },
    radius(me, h) { return clamp(me.L / TAU * 0.7, 140 + h.r, 420); },
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
    rMin(me, h) { return Math.max(me.spN * PHY.k / Math.max(PHY.effW(me, false), 1.5) * 1.25, h.r + me.r + 25); },
    start(env, h, why, relaxed) {
      if (!S.hunt || this.cur || (this.cool.get(h.id) || 0) > env.t) return false;
      const bad = this.eligible(env, h, relaxed); if (bad) { this.why = bad; return false; }
      const me = env.me, s = Math.sign(cross(Math.cos(me.ang), Math.sin(me.ang), h.x - me.x, h.y - me.y)) || 1;
      const R0 = Math.max(this.radius(me, h), this.clearR(me, h, this.center(h).E, 30));
      if (TAU * R0 > me.L * 0.95) { this.why = 'halqaga tana yetmaydi'; return false; }
      this.cur = { id: h.id, s, R: R0, R0, phase: 'WRAP', since: env.t, sct0: me.sct, maxW: 0, W: 0, wh: [], why };
      this.stats.started++; this.why = 'o\'rab olinmoqda';
      ATK.watch(h.id, env.t, 'coil', true);
      LOG.ev(2, 'coil_start', { id: h.id, tsct: h.sct, tL: r0(h.L), L: r0(me.L), d: r0(h.d), R: r0(this.cur.R), s, why });
      return true;
    },
    tryStart(env, blocked) {
      const t = env.t, me = env.me;
      if (t - this.lastEval < 300) return false;
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
      const a = this.aimFor(env, best, Math.max(this.radius(me, best), this.clearR(me, best, this.center(best).E, 30)),
                            Math.sign(cross(Math.cos(me.ang), Math.sin(me.ang), best.x - me.x, best.y - me.y)) || 1);
      const r = simulate(env, a, false, S.steer, { id: best.id, ht: 0.45, uK: 0.6 });
      if (!r.safe || r.gap < 8) { this.why = 'orbita yo\'li xavfli'; return false; }
      return this.start(env, best, 'qidiruv', false);
    },
    aimFor(env, h, R, s) {
      const me = env.me, C = this.center(h);
      const b = Math.atan2(C.y - me.y, C.x - me.x), d = hyp(C.x - me.x, C.y - me.y);
      const dl = clamp(1.3 * (d - R) / R, -0.6, 1.1);
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
      if (c.phase === 'WRAP' && t - c.since > 7000 && c.maxW < Math.PI) return this.abort(t, 'halqa o\'smayapti');
      if (S.trapLvl >= 1) return this.abort(t, 'qamal');
      if (h.v > 1.25 * me.spN * PHY.k) return this.abort(t, 'nishon boostda');
      if (S.dangerRaw >= 2 && S.curWho != null && S.curWho !== c.id && (c.phase === 'WRAP' || env.heads.some(o => o.id === S.curWho && o.d - o.rs < 250))) return this.abort(t, 'boshqa xavf');
      if (me.sct < c.sct0 * 0.93 - 1) return this.abort(t, 'boost qimmat');
      c.tightN = (S.sel && (!S.sel.safe || (S.sel.gap < 10 && S.sel.who != null && S.sel.who !== c.id))) ? (c.tightN || 0) + 1 : 0;
      if (c.tightN >= 2) return this.abort(t, 'yo\'l tor');
      for (const o of env.heads) if (o.id !== c.id && o.L > me.L * 0.5 && o.d < 380) return this.abort(t, 'katta ilon yaqinlashdi');
      const W = Math.abs(this.ourW(me, h.x, h.y));
      c.W = W; c.maxW = Math.max(c.maxW, W);
      const C = this.center(h), d = hyp(C.x - me.x, C.y - me.y);
      if (c.phase === 'WRAP' ? (d > c.R + 450 || (c.maxW > 1.2 * Math.PI && W < 0.55 * c.maxW)) : (W < 1.1 * Math.PI && d > c.R + 200)) return this.abort(t, 'nishon qochdi');
      const Rfloor = Math.max(this.rMin(me, h), this.clearR(me, h, C.E, 12));
      if (c.phase === 'WRAP') c.R = Math.max(c.R0, this.clearR(me, h, C.E, 30));
      if (c.phase === 'WRAP' && W >= 1.8 * Math.PI) {
        c.phase = 'SQUEEZE'; c.closedT = t; this.stats.closed++;
        LOG.ev(2, 'coil_closed', { id: c.id, W: r2(W), R: r0(c.R), sec: r1((t - c.since) / 1000) });
      }
      const dtS = CFG.tickMs / 1000, tight = S.sel && (!S.sel.safe || S.sel.gap < 18);
      if (c.phase === 'SQUEEZE') c.R = tight ? Math.min(Math.max(c.R0, Rfloor), c.R + 40 * dtS) : Math.max(Rfloor, c.R - 45 * dtS);
      c.wh.push({ t, W }); while (c.wh.length && t - c.wh[0].t > 1000) c.wh.shift();
      const prog = c.wh.length > 5 ? W - c.wh[0].W : Infinity;
      const away = (Math.cos(h.ang) * (h.x - me.x) + Math.sin(h.ang) * (h.y - me.y)) / Math.max(d, 1);
      const slow = c.phase === 'WRAP' && t - c.since > 1000 && prog < 0.35 * Math.PI && h.v > 0.6 * me.spN * PHY.k;
      while (this.bLog.length && t - this.bLog[0] > 60000) this.bLog.shift();
      this.wantBoost = ((d > c.R + 60 && away > 0.4) || slow) && h.d - h.rs > 180 && me.sct >= c.sct0 * 0.95 && me.sct >= CFG.boostMinSct &&
                       this.bLog.length * CFG.tickMs < 5000;
      if (this.wantBoost) this.bLog.push(t);
    },
    abort(t, why) {
      const c = this.cur; if (!c) return;
      this.stats.aborted++; this.stats.abortWhy[why] = (this.stats.abortWhy[why] || 0) + 1;
      this.cool.set(c.id, t + 6000); this.globalCool = t + 4000;
      LOG.ev(2, 'coil_abort', { id: c.id, why, W: r2(c.W), maxW: r2(c.maxW), sec: r1((t - c.since) / 1000) });
      this.cur = null; this.why = 'bekor: ' + why; this.wantBoost = false;
    },
    end(t, why) {
      const c = this.cur; if (!c) return;
      this.stats.ended++;
      this.cool.set(c.id, t + 3000);
      LOG.ev(2, 'coil_end', { id: c.id, why, W: r2(c.W), sec: r1((t - c.since) / 1000) });
      this.cur = null; this.why = why; this.wantBoost = false;
    },
  };

  /* ================= 8c. O'ralish xavfi ================= */
  const RING = {
    stats: null, logged: new Map(),
    reset() { this.stats = { warn: 0, urgent: 0, maxW: 0 }; this.logged.clear(); },
    assess(env) {
      const me = env.me, t = env.t, vB = me.spB * PHY.k, M2 = 1300 * 1300;
      let best = { lvl: 0 };
      for (const h of env.allHeads) {
        const tr = h.tr, P = tr.wb;
        if (!P || P.length < 10 || tr.L < 600 || h.d > 1600) continue;
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
        const span = hyp(e1x - e2x, e1y - e2y), gapW = aW >= 1.95 * Math.PI ? -1 : span - 2 * h.r - 2 * me.r;
        const gx = (e1x + e2x) / 2, gy = (e1y + e2y) / 2, gd = hyp(gx - me.x, gy - me.y) || 1;
        const tEsc = gd / vB + Math.abs(dAng(Math.atan2(gy - me.y, gx - me.x), me.ang)) / Math.max(PHY.effW(me, true), 1.5);
        const headEnd = last === P.length - 2;
        const close = headEnd && span > 1 ? (Math.cos(h.ang) * (e1x - e2x) + Math.sin(h.ang) * (e1y - e2y)) / span * h.v : 0;
        const tClose = close > 30 ? Math.max(0, gapW) / close : Infinity;
        let lvl = gapW <= 0 ? 1 : aW >= CFG.ringUrgent || tClose < tEsc + 0.4 ? 2 : 1;
        const sc = lvl * 10 + aW;
        if (sc > (best.sc || 0)) {
          const ox = (gx - me.x) / gd, oy = (gy - me.y) / gd;
          best = { lvl, sc, id: h.id, W: aW, gx, gy, ex: gx + ox * 250, ey: gy + oy * 250, gapW, tClose, tEsc, tsct: h.sct };
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
    else if (trap.exit) nx = { x: trap.exit.x, y: trap.exit.y, src: 'chiqish' };
    else if (trap.nexit) nx = { x: trap.nexit.x, y: trap.nexit.y, src: 'tor' };
    else if (trap.center) nx = { x: trap.center.x, y: trap.center.y, src: 'markaz' };
    if (!nx) { S.escape = null; return; }
    if (e && e.src === nx.src && t - e.since < 700 && hyp(e.x - me.x, e.y - me.y) > 60 && (nx.src !== 'chiqish' || trap.dAt(e.x, e.y) < 9999)) return;
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
      if (c.phase === 'COMMIT') return { id: c.id, ht: clamp((c.thAbs - t) / 1000 + 0.12, 0.1, CFG.headHardT), uK: 1 };
      if (c.phase === 'EXIT') return { id: c.id, ht: 0.6, uK: 1 };
      if (c.phase === 'RACE') return { id: c.id, ht: 0.9, uK: 1 };
    }
    if (COIL.cur) return { id: COIL.cur.id, ht: 0.45, uK: 0.6 };
    return null;
  }

  // 2.6 logidagi halokatli xato tuzatildi:
  // steerFor HECH QACHON |Δ| <= 2.35 rad bo'lganda nishonning teskari tomoniga burmaydi!
  // Qulf (S.turnSide) faqat |Δ| > 2.35 rad (orqaga ≈π burilish) bo'lganda kinPath bilan bir xil turnDelta() qoidasi orqali ishlaydi.
  function steerFor(aim, me, t, rays) {
    const d = dAng(aim, me.ang), ad = Math.abs(d);
    if (ad <= 2.15) {
      S.turnSide = 0;
      return aim;
    }
    // |Δ| > 2.15 rad: orqaga burilish. Agar qulf hali yo'q bo'lsa, o'ng/chap (+1.5 / -1.5 rad) nurlardan qaysi biri xavfsizroq bo'lsa o'sha tomon tanlanadi.
    if (!S.turnSide && ad > 2.35) {
      let side = Math.sign(d) || 1;
      if (rays && rays.length) {
        const near = a => { let b = null, bd = 9; for (const r of rays) { const x = Math.abs(dAng(r.aim, a)); if (x < bd) { bd = x; b = r; } } return b; };
        const rPos = near(wrap(me.ang + 1.55)), rNeg = near(wrap(me.ang - 1.55));
        if (rPos && rNeg) {
          if (rPos.safe !== rNeg.safe) side = rPos.safe ? 1 : -1;
          else if (Math.abs(rPos.gap - rNeg.gap) > 10) side = rPos.gap > rNeg.gap ? 1 : -1;
        }
      }
      S.turnSide = side; S.turnSideT = t;
    }
    const dd = turnDelta(aim, me.ang, S.turnSide);
    if (Math.abs(dd) > 1.85) return wrap(me.ang + Math.sign(dd) * 1.85);
    return aim;
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
    if (!S.foodsT || t - S.foodsT >= 150 || !S.goal) { S.foods = foodTargets(env, trap); S.foodsT = t; }
    const foods = S.foods;
    const goal = pickGoal(env, foods);
    ATK.update(env); COIL.update(env);
    S.threat = null;
    {
      const vN = me.spN * PHY.k;
      for (const h of env.heads) {
        if (h.d - h.rs > CFG.closeHeadGap) break;
        if (((ATK.cur && ATK.cur.id === h.id) || (COIL.cur && COIL.cur.id === h.id)) && h.v <= 1.25 * vN) continue;
        const closing = Math.cos(h.ang - Math.atan2(me.y - h.y, me.x - h.x)) > -0.25;
        const aggr = h.v > 1.25 * vN || (Math.abs(h.w) > 1.5 && h.L >= 0.5 * me.L && h.d - h.rs < 130);
        if (aggr && closing) { S.threat = { id: h.id, x: h.x, y: h.y, gap: h.d - h.rs }; break; }
      }
      if (S.threat && (!S.threatLog || t - S.threatLog > 3000)) { S.threatLog = t; LOG.ev(2, 'close_head', { id: S.threat.id, gap: r0(S.threat.gap) }); }
    }
    S.simOpt = simOptNow(t);
    const A = (p) => p ? Math.atan2(p.y - me.y, p.x - me.x) : null;
    const specials = () => [me.ang, S.cmd, A(goal), trap.exit && trap.exit.a, trap.nexit && trap.nexit.a, A(S.escape), ATK.cur && ATK.cur.aim, ATK.cur && ATK.cur.exitDir,
                            COIL.cur ? COIL.desired(env) : null, ring.lvl ? A({ x: ring.ex, y: ring.ey }) : null, trap.center ? A(trap.center) : null,
                            S.threat ? Math.atan2(me.y - S.threat.y, me.x - S.threat.x) : null,
                            t < S.loopUntil ? A(S.loopGoal) : null];
    let rays = evalRays(env, specials(), S.steer, S.slowRun > 3 ? 20 : CFG.rays);
    const cur = simulate(env, S.cmd == null ? me.ang : S.cmd, S.boost, S.steer);
    S.curWho = cur.safe ? null : cur.who;
    assess(env, rays, cur);
    loopCheck(env, rays, S.dangerLvl === 0 && S.trapLvl === 0 && !COIL.cur);
    const lootNear = goal && goal.kind === 'loot' && hyp(goal.x - me.x, goal.y - me.y) < 500;
    const atkBlock = S.trapLvl > 0 ? 'qamal' : S.dangerLvl >= 2 || S.dangerRaw >= 2 ? 'xavf yuqori' : S.threat ? 'yaqin tajovuzkor bosh' : !S.comfy ? 'bo\'sh joy kam'
                   : lootNear ? 'o\'lim ozuqasi yaqin' : t < S.loopUntil ? 'aylanish buzilmoqda' : null;
    const coilBlock = atkBlock === 'bo\'sh joy kam' ? null : atkBlock;
    const closedNoWay = trap.d1 < 0 && !trap.nexit && !(ring.lvl && ring.gapW > 0);
    let mode;
    if (ATK.cur && ATK.cur.counter) mode = 'ATTACK';
    else if (S.dangerLvl >= 1 && S.trapLvl >= 1) {
      mode = 'ESCAPE';
      if (ATK.cur) { if (ATK.cur.phase === 'EXIT') ATK.end(t, 'qamal (chiqishda)'); else ATK.abort(t, 'qamal'); }
      if (COIL.cur) COIL.abort(t, 'qamal');
      if (closedNoWay && ATK.tryStart(env, null, { counter: true })) mode = 'ATTACK';
    }
    else if (ATK.cur) mode = 'ATTACK';
    else if (COIL.cur) mode = 'COIL';
    else if (ATK.tryStart(env, atkBlock)) mode = 'ATTACK';
    else if (COIL.tryStart(env, coilBlock)) mode = 'COIL';
    else if (S.dangerLvl >= 1) mode = 'EVADE';
    else if (t < S.loopUntil) mode = 'LOOP';
    else if (goal && goal.kind === 'loot') mode = 'LOOT';
    else mode = 'FORAGE';
    if (mode === 'ATTACK' && ATK.cur && ATK.cur.phase === 'EXIT' && S.dangerLvl >= 2 && !ATK.cur.counter) { ATK.end(t, 'xavf (chiqishda)'); mode = 'EVADE'; }
    const optKey = o => o ? o.id + ':' + o.uK : '';
    const opt2 = simOptNow(t);
    if (optKey(opt2) !== optKey(S.simOpt)) { S.simOpt = opt2; rays = evalRays(env, specials(), S.steer, S.slowRun > 3 ? 20 : CFG.rays); }
    S.simOpt = opt2;
    let sel = null, g = null, exitDir = null, w = WEIGHTS[mode];
    const c = ATK.cur;
    if (mode === 'ATTACK' && c && (c.phase === 'COMMIT' || c.phase === 'RACE')) {
      const r = simulate(env, c.aim, true, S.steer);
      if (r.safe && r.gap >= 4) { c.unsafeN = 0; sel = r; }
      else if (++c.unsafeN < 3 && r.ttc > 0.45) sel = r;
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
        // Yaqin tajovuzkor boshdan uzoqlashuvchi maqsad vektori
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
    S.sel = sel; S.cmd = sel.aim; S.steer = steerFor(sel.aim, me, t, rays); S.target = target; S.rays = rays; S.cur = cur;
    const k = Math.round(0.5 / CFG.dt);
    PHY.expect(t + k * CFG.dt * 1000, sel.path[2 * k], sel.path[2 * k + 1], S.steer, sel.boost);
  }

  function mouseAngle() { return Math.atan2(S.mouseY - num(W.hh, innerHeight) / 2, S.mouseX - num(W.ww, innerWidth) / 2); }
  function assist(env) {
    const t = env.t, me = env.me;
    S.simOpt = null;
    if (!S.dodge) { if (S.owns) release(); setMode('MANUAL', t); return; }
    const ua = mouseAngle(), user = simulate(env, ua, false, null);
    if (!user.safe || user.gap < 6) S.userSafeSince = 0; else if (!S.userSafeSince) S.userSafeSince = t;
    const take = !user.safe || user.gap < 6 || (S.owns && t - S.userSafeSince < 500);
    if (!take) { if (S.owns) release(); S.sel = user; setMode('MANUAL', t); return; }
    const rays = evalRays(env, [ua, me.ang, S.cmd], S.steer, CFG.rays);
    const goal = { x: me.x + Math.cos(ua) * 500, y: me.y + Math.sin(ua) * 500 };
    let sel = null, bs = -Infinity;
    for (const r of rays) { const s = scoreRay(r, me, WEIGHTS.ASSIST, goal, S.cmd, null, null); if (s > bs) { bs = s; sel = r; } }
    S.owns = true; S.sel = sel; S.cmd = sel.aim; S.steer = steerFor(sel.aim, me, t, rays); S.boost = false; S.rays = rays; S.target = ua;
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
    S.owns = false; S.boost = false; S.turnSide = 0;
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
      sel: S.sel ? { aim: r2(S.sel.aim), boost: S.sel.boost, safe: S.sel.safe, gap: r1(S.sel.gap), g0: r1(S.sel.g0), ttc: fin(S.sel.ttc) ? r2(S.sel.ttc) : null, who: S.sel.who } : null,
      trap: S.trap ? { lvl: S.trap.level, d1: S.trap.d1, detour: S.trap.detour, area: S.trap.area, narrowExit: !!S.trap.nexit } : null,
      ring: S.ring && S.ring.lvl ? { id: S.ring.id, lvl: S.ring.lvl, W: r2(S.ring.W), gapW: r0(S.ring.gapW), tClose: fin(S.ring.tClose) ? r2(S.ring.tClose) : null, tEsc: r2(S.ring.tEsc) } : null,
      maxRingW: (() => { let m = 0; for (const h of env.allHeads) if (h.tr.wb && h.tr.L >= 600) m = Math.max(m, Math.abs(winding(h.tr.wb, me.x, me.y, 1300))); return r2(m); })(),
      escape: S.escape ? S.escape.src : null,
    };
  }

  /* ================= 14. O'yin sikli ================= */
  function newGame(s, t) {
    S.game = s;
    TR.clear(); PHY.reset(); FOOD.reset(); DEATH.reset(); ATK.reset(); COIL.reset(); RING.reset(); BL.length = 0; CONC = [];
    Object.assign(S, { goal: null, foods: [], foodsT: 0, trail: [], loopUntil: 0, loopGoal: null, loopBreaks: 0, escape: null, dangerLvl: 0, dangerCalm: t,
                       trapLvl: 0, trapCalm: t, cmd: null, steer: null, turnSide: 0, turnSideT: 0, boost: false, boostWhy: '', sel: null, slow: 0, slowRun: 0,
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
    mode: 'WAIT', modeSince: 0, owns: false, cmd: null, steer: null, turnSide: 0, boost: false, boostWhy: '', boostSince: 0, target: null,
    dangerLvl: 0, dangerCalm: 0, dangerRaw: 0, trapLvl: 0, trapCalm: 0, trap: null, closedLogged: false,
    goal: null, foods: [], trail: [], loopUntil: 0, loopGoal: null, loopBreaks: 0, escape: null,
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
      cfg: { rays: CFG.rays, horizon: CFG.horizon, rScale: CFG.rScale, selfR: CFG.selfR, margin: CFG.margin, attackMinSct: CFG.attackMinSct,
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
        ' · hujum ' + ATK.stats.started + '/' + ATK.stats.crossed + ' · o\'rash ' + COIL.stats.started,
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
          foodTargets, decide, tick, ptSeg, segSeg, segX, release, apply, BL, makeHead, boostDecide, readMe, pickGoal, WEIGHTS,
          COLL, TRO, steerFor, turnDelta, rsOf, COIL, RING, winding, simOptNow, escapeRoute, concPen, setConc: a => { CONC = a.map(concOf); }, ourPts: () => ourPts },
  };
  W.SENTINEL = api;
  W.__SENTINEL_CLEANUP__ = stop;
  ATK.reset(); COIL.reset(); RING.reset();
  ZOOM.install();
  raf = requestAnimationFrame(loop);
  console.info('[Sentinel ' + VERSION + '] tayyor. T: bot · H: hujum · Esc: pauza · Log: copy(SENTINEL.logText())');
})();