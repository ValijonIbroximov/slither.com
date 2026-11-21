/* Slither Sentinel 4.5 Performance — Chrome F12 → Console ga BIR MARTA joylanadi.
   T: bot  H: hujum (yonma-yon siquv, tig'iz kesish, qarshi hujum, o'rash)  D: qo'lda himoya  R: radar  G: yengil grafika
   Z/X yoki g'ildirak: zoom  C: zoom 0.40  Esc: pauza  I: batafsil panel
   Sichqoncha bosish: botga ishora (o'sha joydagi ozuqa/o'lja yoki ilon)
   Log: paneldagi 📋 tugmasi (sichqonchani panel ustiga olib boring) yoki Console: copy(SENTINEL.logText())
   © Valijon Ibroximov */
(() => {
  'use strict';
  const VERSION = '4.5-performance';
  const W = window, PI = Math.PI, TAU = Math.PI * 2;

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
     4.0 — "qotmaydigan" dvigatel (qaror mantig'i 3.2 dan meros, hisoblash yadrosi to'liq qayta yozilgan):
     1) Xotira: fazoviy panjara, qamal xaritasi, ozuqa klasterlari, trayektoriyalar — hammasi oldindan ajratilgan typed-array
        buferlarda. 3.2 har tickda yuzlab KB axlat yaratib, GC to'xtalishlariga sabab bo'lardi.
     2) Tezlik: Math.hypot → sqrt; trayektoriya keshi; chegaralovchi doira bilan rad etish; ochiq maydonda panjara so'rovisiz
        o'tish; ozuqa xaritasi va qamal xaritasi tinch holatda 10 Hz.
     3) Log: 3.2 HUD uchun butun logni har 250 ms da (ba'zan yuzlab marta) JSON.stringify qilardi — 10–20 ms li qotishlar manbai.
     4) Tuzatilgan xatolar: (a) crossPaths() da raqib yo'nalishi indekslari almashgan edi → hujum burchagi noto'g'ri baholanardi;
        (b) simulate() da to'qnashuvdan keyingi yo'lning y koordinatasi muzlatilmasdi; (c) barqarorlik jarimasi eskirgan
        to'liq delta bilan hisoblanardi (har tickda ortiqcha burilishga moyillik) — endi buyruqning QOLGAN burilishi olinadi;
        (d) 60 Hz ekranda tick 50/67 ms orasida sakrardi — endi barqaror 20 Hz.
     5) Aniqlik: 44 nur + eng yaxshi nur atrofida 4 ta aniqlashtiruvchi nur (0.13 → 0.03 rad).
     6) Sifat boshqaruvchisi: kompyuter sekinlashsa nurlar soni avtomatik kamayadi, o'yin qotmaydi.
     7) Markazga tortish: xarita chekkasida ozuqa qiymati markaz yo'nalishida oshiriladi (o'lja ko'p joyga siljiydi).
     8) Hujum xavfsizligi: kesishdagi zaxira vaqti nishon bashoratining noaniqligiga mos o'sadi (leadU); "qaytmas nuqta" nazorati —
        chekinish yo'li yo'qolishidan oldin zaxira yetmasa hujum erta bekor qilinadi (3.2 rejani kech bekor qilib, boostda nishon
        boshiga borib urilardi). O'chirish: SENTINEL._t.CFG.noReturn = false; SENTINEL._t.CFG.leadU = 0

     4.1 — haqiqiy o'yin logi tahlili (4.0, 93 s: sct 71 da sct 6 li nishonga 547 birlikdan hujum → nishon boost bosdi → biz kechikdik →
     reja 121 birlik qolganda bekor qilindi → to'qnashuv). Sabablar va yechimlar:
     1) Kesish simulyatsiyasi nishonning KELAJAKDAGI tanasini (boshi bosib o'tadigan yo'lni) ko'rmasdi: "kechikyapmiz" holati faqat
        nishonga jismonan yaqinlashganda sezilardi. Endi nishon kesishish nuqtasiga bizdan oldin yetadigan bo'lsa, yo'l darhol xavfli.
     2) Raqib tezligi doimiy deb olinardi. Endi tezlanish (boost boshlanishi/tugashi) bashoratga kiradi.
     3) Reja buzilganda 5 tick (past FPS da ~320 ms) kutilardi. Endi ikki bosqich: ERTA (kesishishga > 0.55 s) — 55–150 ms dan keyin
        bekor qilinadi (chekinish hali xavfsiz); KECH — hujum qulflanadi, chunki sinovlarda kech bekor qilishning o'zi o'limga olib keldi.
        Nishon bizga nisbatan mayda bo'lsa, qulflash uchun ko'proq zaxira talab qilinadi (riskHi/riskLo).
     4) Uzoqdan boshlanadigan kesish uchun zaxira talabi oshirildi (leadU 0.6 → 1.2).
     5) Mayda nishonga uzoqdan hujum qilinmaydi (attackGain): 71 uzunlikni 6 uzunlikdagi ilon uchun xavfga qo'yish foydasiz.
     6) Qaror davri kadr uzunligiga moslanadi (logda FPS 31 edi va qarorlar 20 o'rniga ~17 Hz ga tushgan): 34 FPS dan pastda har kadrda.
        FPS ~4 s past tursa, yengil grafika bir marta avtomatik yoqiladi (G — qaytarish; o'chirish: SENTINEL._t.CFG.autoGfx = false).

     4.2 — ikkinchi log tahlili (4.1, 277 s, 6-o'rin; bitta kichikroq ilonga 15 s ichida 5 marta hujum → ikki ilon orasida siqilib o'lim):
     1) Harakatlanuvchi ozuqa (prey) "o'lja" deb baholanib, har biriga boost bilan quvilardi (logda 22.6 s boost). Endi quvilmaydi.
     2) O'lja: 900 birlikdan uzoqdagi yirik o'limlar e'tiborsiz qolardi — endi qiymati boost xarajatidan katta bo'lsa 2400 birlikkacha
        yuguriladi; zich o'lja ustida raqiblar yaqin bo'lsa boost bilan "supuriladi".
     3) Hujum: bir nishonga ketma-ket muvaffaqiyatsiz hujumdan keyin tanaffus uzayadi (1.1 → 3.5 → 9 s); juda mayda nishonga umuman
        hujum qilinmaydi; yirik nishonga ustunlik; boostdagi nishon ortidan foydasiz quvish to'xtatiladi; yirik ilon yoniga siljish ("ov").
     4) Qochishda burilish tomoni ~0.45 s ushlab turiladi (4.0 dagi "qolgan burilish" tuzatishi chap-o'ng ikkilanishni kuchaytirgan edi).
     5) Sichqoncha bosish — ishora: nuqtadagi ozuqa/o'lja maqsad bo'ladi; ilon bosilsa — o'rash/kesish uchun ustuvor nishon,
        u bizdan yirik va biz tomonga kelayotgan bo'lsa — xavf sifatida uzoqlashiladi. Xavfsizlik qoidalari har doim ustun.
     6) Panel: ixcham ikonkalar (tugmalar sichqoncha ustiga kelganda ochiladi, I — batafsil matn).
     7) Muntazam tozalash (har 20 s va har yangi o'yinda), FPS past bo'lsa zoom himoyasi, logda qotish/xotira ko'rsatkichlari.

     4.3 — uchinchi log (4.2, 52.9 s, uzunlik 24): boostdagi kichik ilon (#252) oldini kesishga urinish → nishon burildi, 253 birlik uzoqda
     bo'lsa ham "kesib o'tildi" deb hisoblandi → bot 0.64 s davomida boostsiz to'g'ri unga qarab yurdi → 117 birlikda kech burildi → o'lim.
     1) "Kesib o'tildi" endi nishonning hujum boshidagi yo'l chizig'i bo'yicha aniqlanadi (avval nishon burilsa, 270 birlik uzoqda ham soxta ishlardi).
     2) Chiqish bosqichi (boostdagi nishon): yumshoq model faqat 0.35 s; nishon oldinda va yaqinlashayotgan bo'lsa masofa emas, VAQT bo'yicha
        (yaqinlashish tezligi) erta chekiniladi; yaqin bosh xavfi paydo bo'lsa — darhol himoya.
     3) Boostda keskin burilayotgan nishonga (yonma-yon bo'lmasa) hujum boshlanmaydi — uning yo'lini bashorat qilib bo'lmaydi.
     4) Log: ishoralar endi logdan tushib qolmaydi, ishora bilan boshlangan hujum belgilanadi.
     Sinab ko'rilib, olib tashlangan: qattiqroq nishon filtri (uzunlik ≥ 8, ≥ 20%) va boostdagi boshni vaqt bo'yicha xavf deb hisoblash
     (CFG.threatT) — simulyatorda kill va o'sishni kamaytirdi.

     4.4 — to'rtinchi log (4.3, 119.9 s, uzunlik 30; 16 ta ishora, boostning 12 s i ishoraga ketgan):
     1) Ishora: bizdan yirik ilonga boost bilan yugurilmaydi (oddiy tezlikda yaqinlashiladi); kichigiga boost — ko'pi bilan 2 s;
        ishora qilingan ilonga hujum bekor bo'lsa, ishora ham bekor bo'ladi (bot qochgan/hujumkor ilon yonida qolib ketmaydi).
     2) "Aloqani uzish" boosti: bizdan yirik ilonning boshi oldimizda bo'lsa yoqilmaydi (logda bot boost bilan uning oldidan kesib o'tgan).
     3) Kechikish o'lchovi: buyruqdan burilishgacha o'tgan vaqt o'lchanadi, logga (stats.net) yoziladi, 180 ms dan oshsa panelda 📶 chiqadi.
        Shu logda u ~0.15–0.3 s edi (model 0.09 s deb hisoblaydi), oxirgi 0.6 s da esa buyruqlar umuman bajarilmagan.
        Kechikishni rejalashtirishda ishlatish (CFG.latAdapt) va o'ljamiz o'lganda darhol qaytish (CFG.calmOnKill) sinab ko'rildi,
        simulyatorda foyda bermadi — o'chiq holda qoldirildi. */
  const CFG = {
    tickMs: 55,            // yuqori tezlikdagi qaror davri (maks. ~18 Hz, yukga qarab pasayadi)
    radarFps: 12, foodRayCap: 384,   // grafik va ozuqa bo‘yicha hisoblash limiti
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
    calmMs: 380, trapCalmMs: 700, planBudgetMs: 14,
    centerPull: 0.25,      // xarita chekkasida markaz tomondagi ozuqaga ustunlik (0 — o'chiq)
    refine: true,          // eng yaxshi nur atrofida aniqlashtirish
    leadU: 1.2,            // hujumni BOSHLASH uchun zaxira vaqtiga qo'shiladigan noaniqlik ulushi (0 — 3.2 dagidek)
    leadURx: 0.8,          // hujum davomida (qayta rejalashda) qo'shiladigan ulush
    riskHi: 0.5, riskLo: 0.15,   // nishon/biz uzunlik nisbati: riskHi dan yuqorida dadil, riskLo dan pastda ehtiyotkor
    lockT: 0.55,           // kesishishga shuncha soniya qolganda hujum qulflanadi (chekinish endi foydasiz)
    exactMs: 450,          // qulflangan hujum bekor bo'lgach, nishon shuncha vaqt aniq model bilan baholanadi
    cutTrail: true,        // kesishda nishonning kelajakdagi tanasini tekshirish
    attackGain: 0.12,      // nishonning eng kichik uzunligi (bizning uzunligimiz ulushi)
    raceBack0: 360, raceBackK: 0,      // quvib o'tishni boshlash uchun nishondan eng ko'p orqada qolish: raceBack0 + raceBackK × uzunlik (40 gacha)
    threatT: 0, threatMaxGap: 450,     // boostdagi bosh shu vaqt (s) ichida yetib kelsa — xavf; 0 — o'chiq (simulyatorda zararli chiqdi), 0.7 — sinash uchun
    crossGap: 160,         // "kesib o'tildi" deb hisoblash uchun nishon boshigacha eng katta oraliq
    boostTurnW: 0.8, exitVcK: 0.55,
    exitSoftMs: 350,       // kesib o'tgach nishon boshi yumshoq model bilan baholanadigan vaqt
    autoGfx: true,         // FPS uzoq vaqt past bo'lsa yengil grafikani avtomatik yoqish
    preyMass: 3,           // harakatlanuvchi ozuqa: faqat yo'l ustida bo'lsa oddiy ozuqa kabi (0 — butunlay e'tiborsiz)
    rushMinSct: 30, rushMaxD: 2400, boostCost: 1.2,   // uzoqdagi yirik o'ljaga yugurish: eng kichik ilon, eng uzoq masofa, boost narxi (uzunlik/s)
    sweepHv: 130,          // o'lja ustida boost bilan "supurish" chegarasi (0 — o'chiq)
    huntPull: 0.45,        // yirik ilon yoniga siljish kuchi (0 — o'chiq)
    hintMs: 8000,          // sichqoncha ishorasi amal qiladigan vaqt
    hintBoostMs: 2000,     // ilon ishorasida boost bilan yaqinlashish vaqti (faqat bizdan yirik bo'lmagan ilonga)
    calmOnKill: false,     // o'z o'ljamiz o'lganda xavfni darhol tinchlantirish (simulyatorda o'limni biroz oshirdi — o'chiq)
    breakDirChk: true,     // "aloqani uzish" boosti: bizdan yirik ilon boshi oldimizda bo'lsa yoqilmaydi
    latAdapt: false, latMax: 0.40,     // buyruq → burilish kechikishi har doim o'lchanadi va logga yoziladi; true — rejalashtirishda ham ishlatish (tajriba)
    holdNoBoost: true,     // boostdagi nishon ortidan (biz oldinda bo'lmasak) hujumni ushlab turmaslik
    turnHoldMs: 450,       // qochishda tanlangan burilish tomonini ushlab turish vaqti (0 — o'chiq)
    failCool2: 3500, failCool3: 9000,     // bir nishonga 2- va 3-muvaffaqiyatsiz hujumdan keyingi tanaffus (ms); birinchisidan keyin 1100
    fpsGuard: true, zoomGuardMax: 0.40,   // FPS 38 dan past tursa zoom shu qiymatgacha asta yaqinlashadi (uzoq zoom — chizishning eng og'ir yuki)
    leadLock: 1.0,         // qaytmas nuqtada talab qilinadigan zaxira (noaniqlik ulushi)
    noReturn: true,        // "qaytmas nuqta" nazorati
  };

  /* ================= 2. Yordamchilar va geometriya ================= */
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const num = (v, d = 0) => (typeof v === 'number' && v - v === 0) ? v : d;
  const wrap = a => (a <= PI && a > -PI) ? a : Math.atan2(Math.sin(a), Math.cos(a));   // tez yo'l: oraliqdagi burchak o'zgarmaydi
  const dAng = (a, b) => wrap(a - b);
  const hyp = (x, y) => Math.sqrt(x * x + y * y);   // Math.hypot V8 da bir necha barobar sekin
  const fin = v => typeof v === 'number' && v - v === 0;
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

  function ptSeg2(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    let t = L > 0 ? ((px - ax) * dx + (py - ay) * dy) / L : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const ex = px - ax - t * dx, ey = py - ay - t * dy;
    return ex * ex + ey * ey;
  }
  const ptSeg = (px, py, ax, ay, bx, by) => Math.sqrt(ptSeg2(px, py, ax, ay, bx, by));
  function segX(ax, ay, bx, by, cx, cy, dx, dy) {
    const ux = bx - ax, uy = by - ay, vx = dx - cx, vy = dy - cy, den = ux * vy - uy * vx;
    if (Math.abs(den) < 1e-9) return null;
    const wx = cx - ax, wy = cy - ay;
    const s = (wx * vy - wy * vx) / den, q = (wx * uy - wy * ux) / den;
    return (s >= 0 && s <= 1 && q >= 0 && q <= 1) ? { s, q } : null;
  }
  // Ikki kesma orasidagi masofa KVADRATI (ildizsiz, obyekt yaratmaydi) — rejalashtiruvchining eng issiq nuqtasi
  function segSeg2(ax, ay, bx, by, cx, cy, dx, dy) {
    const ux = bx - ax, uy = by - ay, vx = dx - cx, vy = dy - cy, den = ux * vy - uy * vx;
    if (!(den < 1e-9 && den > -1e-9)) {
      const wx = cx - ax, wy = cy - ay;
      const s = (wx * vy - wy * vx) / den, q = (wx * uy - wy * ux) / den;
      if (s >= 0 && s <= 1 && q >= 0 && q <= 1) return 0;
    }
    let m = ptSeg2(ax, ay, cx, cy, dx, dy), d = ptSeg2(bx, by, cx, cy, dx, dy);
    if (d < m) m = d;
    d = ptSeg2(cx, cy, ax, ay, bx, by); if (d < m) m = d;
    d = ptSeg2(dx, dy, ax, ay, bx, by); if (d < m) m = d;
    return m;
  }
  const segSeg = (ax, ay, bx, by, cx, cy, dx, dy) => Math.sqrt(segSeg2(ax, ay, bx, by, cx, cy, dx, dy));

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

  /* 4.0: Fazoviy panjara — typed-array + CSR (hisoblab saralash). Har tickda qayta ishlatiladi: Map, massiv va
     kapsula-obyektlar yaratilmaydi, shuning uchun axlat yig'uvchi (GC) o'yinni to'xtatib qo'ymaydi. */
  class CapGrid {
    constructor(cell) {
      this.c = cell; this.n = 0; this.cap = 0; this.st = 0; this.who = null; this.wi = -1; this.dirty = true; this.ids = [];
      this.gx0 = 0; this.gy0 = 0; this.gw = 0; this.gh = 0;
      this.start = new Int32Array(2); this.items = new Int32Array(64); this.fillp = new Int32Array(2);
      this.grow(1024);
    }
    grow(cap) {
      for (const k of ['ax', 'ay', 'bx', 'by', 'r', 'x0', 'x1', 'y0', 'y1']) { const a = new Float64Array(cap); if (this[k]) a.set(this[k]); this[k] = a; }
      const s = new Int32Array(cap); if (this.stamp) s.set(this.stamp); this.stamp = s;
      this.cap = cap;
    }
    reset() { if (this.shrinkTo) { const c = this.shrinkTo; this.shrinkTo = 0; this.shrink(c); } this.n = 0; this.dirty = true; this.who = null; }
    shrink(cap) {            // 4.2: katta to'qnashuvdan keyin o'sib ketgan buferlarni qaytarish (MAINT so'raydi, keyingi reset() bajaradi)
      for (const k of ['ax', 'ay', 'bx', 'by', 'r', 'x0', 'x1', 'y0', 'y1']) this[k] = null;
      this.stamp = null; this.ids = []; this.items = new Int32Array(64); this.start = new Int32Array(2); this.fillp = new Int32Array(2);
      this.gw = 0; this.gh = 0; this.grow(cap);
    }
    add(ax, ay, bx, by, r, id) {
      if (this.n === this.cap) this.grow(this.cap * 2);
      const i = this.n++;
      this.ax[i] = ax; this.ay[i] = ay; this.bx[i] = bx; this.by[i] = by; this.r[i] = r; this.ids[i] = id;
      this.x0[i] = (ax < bx ? ax : bx) - r; this.x1[i] = (ax > bx ? ax : bx) + r;
      this.y0[i] = (ay < by ? ay : by) - r; this.y1[i] = (ay > by ? ay : by) + r;
      this.dirty = true;
    }
    build() {
      const n = this.n, c = this.c, X0 = this.x0, X1 = this.x1, Y0 = this.y0, Y1 = this.y1;
      this.dirty = false; this.st = 0; this.stamp.fill(0, 0, n);
      if (!n) { this.gw = 0; this.gh = 0; return; }
      let a = Infinity, b = -Infinity, e = Infinity, d = -Infinity;
      for (let i = 0; i < n; i++) { if (X0[i] < a) a = X0[i]; if (X1[i] > b) b = X1[i]; if (Y0[i] < e) e = Y0[i]; if (Y1[i] > d) d = Y1[i]; }
      const gx0 = Math.floor(a / c), gy0 = Math.floor(e / c), gw = Math.floor(b / c) - gx0 + 1, gh = Math.floor(d / c) - gy0 + 1, nc = gw * gh;
      this.gx0 = gx0; this.gy0 = gy0; this.gw = gw; this.gh = gh;
      if (this.start.length < nc + 1) { this.start = new Int32Array(nc + 1 + (nc >> 1)); this.fillp = new Int32Array(nc + 1 + (nc >> 1)); }
      const start = this.start, fillp = this.fillp;
      start.fill(0, 0, nc + 1);
      let total = 0;
      for (let i = 0; i < n; i++) {
        const cx0 = Math.floor(X0[i] / c) - gx0, cx1 = Math.floor(X1[i] / c) - gx0, cy0 = Math.floor(Y0[i] / c) - gy0, cy1 = Math.floor(Y1[i] / c) - gy0;
        for (let x = cx0; x <= cx1; x++) for (let y = cy0; y <= cy1; y++) start[x * gh + y + 1]++;
        total += (cx1 - cx0 + 1) * (cy1 - cy0 + 1);
      }
      for (let k = 0; k < nc; k++) { start[k + 1] += start[k]; fillp[k] = start[k]; }
      if (this.items.length < total) this.items = new Int32Array(total + (total >> 1) + 16);
      const items = this.items;
      for (let i = 0; i < n; i++) {
        const cx0 = Math.floor(X0[i] / c) - gx0, cx1 = Math.floor(X1[i] / c) - gx0, cy0 = Math.floor(Y0[i] / c) - gy0, cy1 = Math.floor(Y1[i] / c) - gy0;
        for (let x = cx0; x <= cx1; x++) for (let y = cy0; y <= cy1; y++) items[fillp[x * gh + y]++] = i;
      }
    }
    // (a,b) kesmadan eng yaqin kapsulagacha toza masofa (radius ayirilgan); limit — yuqori chegara. Egasi: this.who
    gap(ax, ay, bx, by, limit, out) {
      if (this.dirty) this.build();
      this.who = null;
      let best = limit, wi = -1;
      if (this.n) {
        const c = this.c, gw = this.gw, gh = this.gh, st = ++this.st;
        const mnx = ax < bx ? ax : bx, mxx = ax < bx ? bx : ax, mny = ay < by ? ay : by, mxy = ay < by ? by : ay;
        let x0 = Math.floor((mnx - limit) / c) - this.gx0, x1 = Math.floor((mxx + limit) / c) - this.gx0;
        let y0 = Math.floor((mny - limit) / c) - this.gy0, y1 = Math.floor((mxy + limit) / c) - this.gy0;
        if (x0 < 0) x0 = 0; if (y0 < 0) y0 = 0; if (x1 >= gw) x1 = gw - 1; if (y1 >= gh) y1 = gh - 1;
        const start = this.start, items = this.items, stamp = this.stamp, X0 = this.x0, X1 = this.x1, Y0 = this.y0, Y1 = this.y1;
        const AX = this.ax, AY = this.ay, BX = this.bx, BY = this.by, R = this.r;
        for (let x = x0; x <= x1; x++) {
          let ci = x * gh + y0;
          for (let y = y0; y <= y1; y++, ci++) {
            for (let k = start[ci], e = start[ci + 1]; k < e; k++) {
              const p = items[k]; if (stamp[p] === st) continue; stamp[p] = st;
              if (X0[p] > mxx + best || X1[p] < mnx - best || Y0[p] > mxy + best || Y1[p] < mny - best) continue;
              const g = Math.sqrt(segSeg2(ax, ay, bx, by, AX[p], AY[p], BX[p], BY[p])) - R[p];
              if (g < best) { best = g; wi = p; }
            }
          }
        }
        if (wi >= 0) this.who = this.ids[wi];
      }
      this.wi = wi;
      if (out) out.cap = wi >= 0 ? { id: this.ids[wi] } : null;
      return best;
    }
    get all() {
      const o = [];
      for (let i = 0; i < this.n; i++) o.push({ ax: this.ax[i], ay: this.ay[i], bx: this.bx[i], by: this.by[i], r: this.r[i], id: this.ids[i] });
      return o;
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
    effW(me, boost) {            // 4.0: tick ichida bir marta hisoblanadi (me har tickda yangi obyekt)
      const key = boost ? 'eW1' : 'eW0'; let v = me[key];
      if (v === undefined) v = me[key] = this.effW0(me, boost);
      return v;
    },
    effW0(me, boost) {
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

  /* 4.4: buyruq → burilish javobining haqiqiy kechikishi (tarmoq + server). Yangi tomonga keskin burilish buyrug'i berilgandan
     bosh shu tomonga burila boshlaguncha o'tgan vaqt o'lchanadi. O'lchovda ~0.05 s kvantlash xatosi bor — u ayirib tashlanadi. */
  const LAT = {
    v: CFG.latency, n: 0, p: null, pa: null, pt: 0, w: 0, max: 0, keep: [], tP: -1e9, tN: -1e9,
    reset() { this.v = CFG.latency; this.n = 0; this.p = null; this.pa = null; this.w = 0; this.max = 0; this.keep = []; this.tP = -1e9; this.tN = -1e9; },
    obs(t, ang) {
      if (this.pa != null && t > this.pt) { const dt = (t - this.pt) / 1000; if (dt < 0.2) this.w = dAng(ang, this.pa) / dt; else { this.w = 0; this.p = null; } }
      this.pa = ang; this.pt = t;
      const p = this.p; if (!p) return;
      if (Math.sign(this.w) === p.sg && Math.abs(this.w) > 1.3) {
        const d = (t - p.t) / 1000; this.p = null;
        if (d >= 0.03 && d <= 0.7) {
          this.n++; if (d > this.max) this.max = d;
          const K = this.keep; K.push(d); if (K.length > 9) K.shift();
          this.v = K.slice().sort((x, y) => x - y)[K.length >> 1];          // oxirgi 9 namunaning medianasi
        }
      } else if (t - p.t > 800) this.p = null;
    },
    cmd(t, delta) {
      const sg = Math.abs(delta) > 0.7 ? Math.sign(delta) : 0;
      if (this.p && sg !== this.p.sg) this.p = null;
      // toza namuna: shu tomonga oxirgi 0.6 s da buyruq berilmagan (aks holda eski buyruqning javobi o'lchanib qoladi) va bosh hozir bu tomonga burilmayapti
      if (!this.p && sg !== 0 && t - (sg > 0 ? this.tP : this.tN) > 600 && !(Math.sign(this.w) === sg && Math.abs(this.w) > 0.6)) this.p = { t, sg };
      if (delta > 0.15) this.tP = t; else if (delta < -0.15) this.tN = t;        // kichik burilish buyrug'i ham shu tomonga javob beradi
    },
    cur() { return CFG.latAdapt && this.n >= 2 ? clamp(this.v - 0.05, CFG.latency, CFG.latMax) : CFG.latency; },
  };

  /* ================= 4. Ozuqa kuzatuvi va o'lim dalillari ================= */
  /* 4.0: har skanerda 1500 ta ozuqadan iborat yangi Set yaratish o'rniga (GC to'xtalishlarining asosiy sababi)
     har bir ozuqa uchun bitta kichik yozuv saqlanadi: t0 — birinchi ko'rilgan, tm — oxirgi siljigan, ts — oxirgi ko'rilgan vaqt. */
  const FOOD = {
    rec: new WeakMap(), ring: [], last: -1e9, scanT: -1,
    reset() { this.rec = new WeakMap(); this.ring = []; this.last = -1e9; this.scanT = -1; },
    scan(t, force = false) {
      if (!force && t - this.last < (DEATH.hot(t) ? 80 : 160)) return;
      this.last = t;
      const f = W.foods; if (!Array.isArray(f)) return;
      const rec = this.rec;
      for (let i = 0; i < f.length; i++) {
        const o = f[i]; if (!o || o.eaten) continue;
        const x = o.xx, y = o.yy; if (!fin(x) || !fin(y)) continue;
        const r = rec.get(o);
        if (!r) rec.set(o, { x, y, tm: t, t0: t, ts: t, lw: 0, lwT: -1 });
        else { if (Math.abs(r.x - x) > 3 || Math.abs(r.y - y) > 3) { r.x = x; r.y = y; r.tm = t; } r.ts = t; }
      }
      this.scanT = t;
      this.ring.push(t); while (this.ring.length > 48 || (this.ring.length > 1 && t - this.ring[0] > 3000)) this.ring.shift();
    },
    base() {            // ~1.4 s oldingi skaner vaqti (kadans 80 yoki 160 ms bo'lishidan qat'i nazar)
      const R = this.ring, n = R.length; if (!n) return null;
      const lim = R[n - 1] - 1400; let i = 0; while (i < n - 1 && R[i] < lim) i++;
      return { t: R[i] };
    },
    alive(o) {
      if (!o || o.eaten) return false;
      if (this.scanT < 0) return true;
      const r = this.rec.get(o); return !!r && r.ts === this.scanT;
    },
    isNew(o, b) {
      if (!b) return false;
      const r = this.rec.get(o);
      return !r || r.t0 > b.t || r.tm > b.t - 100;
    },
    // Zona yaqinidagi YANGI yoki yirik ozuqalarni z.newSet ga qo'shadi. Arzon shartlar (to'plamda bor / yangi emas)
    // geometriyadan oldin tekshiriladi — 3.2 dagi near() dan ~10 barobar yengil, natija bir xil.
    collect(z, R) {
      const pts = z.pts, f = W.foods; if (!Array.isArray(f) || !pts.length) return;
      let x0 = 1e12, y0 = 1e12, x1 = -1e12, y1 = -1e12;
      for (let i = 0; i < pts.length; i += 2) { x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]); }
      const R2 = R * R, set = z.newSet, base = z.base, n = pts.length;
      x0 -= R; x1 += R; y0 -= R; y1 += R;
      for (let i = 0; i < f.length; i++) {
        const o = f[i]; if (!o || o.eaten) continue;
        const fx = o.xx, fy = o.yy; if (!fin(fx)) continue;
        if (fx < x0 || fx > x1 || fy < y0 || fy > y1) continue;
        if (set.has(o)) continue;
        if (!(this.isNew(o, base) || num(o.sz, 5) >= 8.5)) continue;
        for (let k = 0; k < n; k += 2) {
          if (k + 3 < n) {
            if (ptSeg(fx, fy, pts[k], pts[k + 1], pts[k + 2], pts[k + 3]) < R) { set.add(o); break; }
          } else {
            const dx = fx - pts[k], dy = fy - pts[k + 1];
            if (dx * dx + dy * dy < R2) { set.add(o); break; }
          }
        }
      }
    },
    near(pts, R) {
      const out = [], f = W.foods; if (!Array.isArray(f) || !pts.length) return out;
      let x0 = 1e12, y0 = 1e12, x1 = -1e12, y1 = -1e12;
      for (let i = 0; i < pts.length; i += 2) { x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); y0 = Math.min(y0, pts[i + 1]); y1 = Math.max(y1, pts[i + 1]); }
      const R2 = R * R;
      for (let i = 0; i < f.length; i++) {
        const o = f[i]; if (!o || o.eaten || !fin(o.xx)) continue;
        const fx = o.xx, fy = o.yy;
        if (fx < x0 - R || fx > x1 + R || fy < y0 - R || fy > y1 + R) continue;
        for (let k = 0; k < pts.length; k += 2) {
          if (k + 3 < pts.length) {
            if (ptSeg(fx, fy, pts[k], pts[k + 1], pts[k + 2], pts[k + 3]) < R) { out.push(o); break; }
          } else {
            const dx = fx - pts[k], dy = fy - pts[k + 1];
            if (dx * dx + dy * dy < R2) { out.push(o); break; }
          }
        }
      }
      return out;
    },
  };

  const DEATH = {
    hot(t) { for (const z of this.zones) if (t - z.t < 3200) return true; return false; },
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
      // 4.4: O'Z o'ljamiz o'lsa — xavf darhol qayta baholanadi (har qanday yaqin o'limda emas: simulyatorda bu o'limlarni ko'paytirdi)
      if (CFG.calmOnKill && tr.d < 450 && (z.ourTarget || (z.headToOurBody != null && z.headToOurBody < 85))) S.calmUntil = t + 700;
      if (this.zones.length > 8) this.zones.shift();
      return z;
    },
    update(t, me) {
      for (const z of this.zones) {
        if (t - z.upd >= 80 && t - z.t < 3000) {
          z.upd = t;
          FOOD.collect(z, 75);
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
    let nO = 0;
    for (let i = 0; i < pts.length; i++) {
      const q = pts[i]; if (!okObj(q) || q.dying) continue;
      const x = q.xx + num(q.fx), y = q.yy + num(q.fy);
      if (px != null) L += hyp(x - px, y - py);
      px = x; py = y; ourPts[nO++] = x; ourPts[nO++] = y;
    }
    ourPts.length = nO;
    const sct = num(s.sct, pts.length);
    return { obj: s, x: p.x, y: p.y, ang: wrap(num(s.ang, num(s.ehang))), sp, sc, sct, r: CFG.rScale * sc,
             spN: num(W.nsp1, 5.39) + num(W.nsp2, 0.4) * sc,
             spB: num(W.nsp3, 14), L: L > 0 ? L : sct * 12, boosting: !!s.wmd };
  }

  // 4.0: bosh bashoratlari uchun bufer hovuzi — har tickda qayta ishlatiladi
  const HPOOL = { a: [], n: 0, get(len) { let p = this.a[this.n]; if (!p || p.length !== len) p = this.a[this.n] = new Float64Array(len); this.n++; return p; } };
  function makeHead(tr, me) {
    const n = Math.round(CFG.horizon / CFG.dt), dt = CFG.dt, pred = HPOOL.get(2 * (n + 1));
    let x = tr.x, y = tr.y, a = tr.ang, sp = tr.sp;
    const tsp = fin(tr.tsp) ? tr.tsp : tr.sp, kk = PHY.k, aUp = PHY.accUp * dt, aDn = PHY.accDown * dt;
    const v = tr.v, w0 = clamp(tr.w * (tr.wj < 0.5 && tr.t - tr.since > 1000 ? 0.88 : 0.68), -3.5, 3.5);
    let x0 = x, x1 = x, y0 = y, y1 = y;
    for (let i = 0; i <= n; i++) {
      pred[2 * i] = x; pred[2 * i + 1] = y;
      if (x < x0) x0 = x; else if (x > x1) x1 = x;
      if (y < y0) y0 = y; else if (y > y1) y1 = y;
      const w = w0 * (i * dt > 0.75 ? 0.55 : 1);
      const am = a + w * dt / 2, vi = sp * kk; x += Math.cos(am) * vi * dt; y += Math.sin(am) * vi * dt; a += w * dt;
      if (sp < tsp) { sp += aUp; if (sp > tsp) sp = tsp; } else if (sp > tsp) { sp -= aDn; if (sp < tsp) sp = tsp; }
    }
    // 4.0: bashorat yo'lining chegaralovchi doirasi va qutisi — uzoqdagi boshlarni arzon rad etish uchun
    const bcx = (x0 + x1) / 2, bcy = (y0 + y1) / 2; let br2 = 0;
    for (let i = 0; i <= n; i++) { const dx = pred[2 * i] - bcx, dy = pred[2 * i + 1] - bcy, d2 = dx * dx + dy * dy; if (d2 > br2) br2 = d2; }
    return { id: tr.id, tr, x: tr.x, y: tr.y, ang: tr.ang, v, w: tr.w, r: tr.r, rs: rsOf(me, tr.r),
             sc: tr.sc, sct: tr.sct, L: tr.L, age: (tr.t - tr.since) / 1000, pred, d: tr.d, boosting: tr.sp > 9.2 || tsp > 9.2, vT: tsp * kk,
             bcx, bcy, br: Math.sqrt(br2), hx0: x0, hx1: x1, hy0: y0, hy1: y1 };
  }

  const GRID = new CapGrid(90);
  let arenaBad = false;
  function readWorld(t, s) {
    const me = readMe(s);
    const list = Array.isArray(W.slithers) ? W.slithers : [];
    const grid = GRID, heads = [];
    grid.reset(); HPOOL.n = 0;
    let present = null;
    const here = o => (present || (present = new Set(list))).has(o);
    const reach = me.spB * PHY.k * CFG.horizon + 250;
    let nbOn = false, nbId = null, nbD = 0, nbC = 0, nbX = 0, nbY = 0, maxD = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!okObj(e) || e === s) continue;
      const hx = e.xx + num(e.fx), hy = e.yy + num(e.fy), ang = wrap(num(e.ang, num(e.ehang)));
      const dead = !!e.dead || num(e.dead_amt) > 0 || e.id === CFG.deadId;
      let tr = TRO.get(e);
      if (!tr) {
        if (dead) {
          for (const c of TR.values()) if (!c.dead && !here(c.obj) && hyp(c.x - hx, c.y - hy) < 90) { tr = c; TRO.delete(c.obj); break; }
        } else if (e.id != null) {
          const c = TR.get(e.id); if (c && !here(c.obj)) { tr = c; TRO.delete(c.obj); }
        }
        if (!tr) {
          const id = e.id != null && e.id !== CFG.deadId ? e.id : 'd' + (++deadSeq);
          tr = { id, since: t, t, x: hx, y: hy, ang, w: 0, wj: 1, upT: -1e9, dnT: -1e9, tsp: 5.8, sp: num(e.sp, 5.8), dead: false, body: [], wb: [], L: 0, sct: 0, d: 1e9, minBodyD: 1e9 };
          TR.set(id, tr);
        }
        tr.obj = e; TRO.set(e, tr);
      } else if (!dead) {
        const dt = (t - tr.t) / 1000;
        if (dt > 0.02 && dt < 0.5) {
          const wi = clamp(dAng(ang, tr.ang) / dt, -6, 6);
          tr.wj = 0.8 * tr.wj + 0.2 * Math.abs(wi - tr.w);
          tr.w = 0.6 * tr.w + 0.4 * wi;
          // 4.1: tezlik sakrashi (server paketlari bilan pog'onali keladi) — tezlanish/sekinlashish belgisi 400 ms ushlab turiladi
          const dsp = num(e.sp, 5.8) - tr.sp;
          if (dsp > 0.25) tr.upT = t; else if (dsp < -0.25) tr.dnT = t;
        }
      }
      tr.seenT = t;
      tr.t = t; tr.x = hx; tr.y = hy; tr.ang = ang; tr.sp = num(e.sp, 5.8); tr.sc = clamp(num(e.sc, 1), 0.5, 15);
      tr.r = CFG.rScale * tr.sc; tr.v = tr.sp * PHY.k; tr.sct = num(e.sct, tr.sct); tr.d = hyp(hx - me.x, hy - me.y);
      // 4.1: nishon tezlik — tezlashayotgan ilon boost tezligiga, sekinlashayotgani oddiy tezlikka yetadi deb olinadi
      {
        const spNo = num(W.nsp1, 5.39) + num(W.nsp2, 0.4) * tr.sc, spBo = num(W.nsp3, 14);
        tr.tsp = (t - tr.upT < 400 && tr.upT > tr.dnT && tr.sp < spBo) ? spBo : (t - tr.dnT < 400 && tr.dnT > tr.upT && tr.sp > spNo) ? spNo : tr.sp;
      }
      if (tr.d > maxD) maxD = tr.d;
      if (dead) { if (!tr.dead) { tr.dead = true; DEATH.onDeadFlag(tr, t, me); } continue; }
      const pts = Array.isArray(e.pts) ? e.pts : [], rs = rsOf(me, tr.r);
      const body = tr.body2 || (tr.body2 = []), wb = tr.wb2 || (tr.wb2 = []), step = Math.max(1, Math.ceil(pts.length / 24));
      let nB = 0, nW = 0;
      const lim = reach + rs + 60, lim2 = lim * lim;
      let lx = null, ly = null, fx = null, fy = null, ex = null, ey = null, wx = null, wy = null, L = 0, minBD = tr.d;
      for (let j = 0; j < pts.length; j++) {
        const q = pts[j];
        if (!okObj(q) || q.dying) { lx = null; continue; }
        const x = q.xx + num(q.fx), y = q.yy + num(q.fy);
        if (fx == null) { fx = x; fy = y; }
        if (ex != null) L += hyp(x - ex, y - ey);
        ex = x; ey = y;
        if (j % step === 0) { body[nB++] = x; body[nB++] = y; }
        if (wx == null || hyp(x - wx, y - wy) >= 45) { wb[nW++] = x; wb[nW++] = y; wx = x; wy = y; }
        if (lx != null) {
          const qx = x - me.x, qy = y - me.y, q2 = qx * qx + qy * qy;
          if (q2 < lim2) {
            grid.add(lx, ly, x, y, rs, tr.id);
            if (q2 < 360000) {
              const dd = ptSeg(me.x, me.y, lx, ly, x, y);
              if (dd < minBD) minBD = dd;
              if (!nbOn || dd - rs < nbD) { nbOn = true; nbId = tr.id; nbD = dd - rs; nbC = dd; nbX = (lx + x) / 2; nbY = (ly + y) / 2; }
            }
          }
        }
        lx = x; ly = y;
      }
      if (fx != null) {
        const nearF = hyp(hx - fx, hy - fy) < hyp(hx - ex, hy - ey), nkx = nearF ? fx : ex, nky = nearF ? fy : ey;
        // Distant snakes cannot affect the short-term path. Keeping them out of
        // CapGrid avoids huge sparse bounding grids and expensive allocations.
        if (ptSeg2(me.x, me.y, hx, hy, nkx, nky) < (reach + rs + 60) ** 2) {
          grid.add(hx, hy, nkx, nky, rs, tr.id);
          const dd = ptSeg(me.x, me.y, hx, hy, nkx, nky);
          if (dd < minBD) minBD = dd;
          if (!nbOn || dd - rs < nbD) { nbOn = true; nbId = tr.id; nbD = dd - rs; nbC = dd; nbX = (hx + nkx) / 2; nbY = (hy + nky) / 2; }
        }
      } else if (tr.d < reach + rs + 60) grid.add(hx, hy, hx, hy, rs, tr.id);
      tr.minBodyD = minBD;
      if (nB) { body.length = nB; tr.body2 = tr.body; tr.body = body; }   // ikki bufer navbatlashadi — yangi massiv yaratilmaydi
      if (fx != null) {
        wb.length = nW;
        const headLast = hyp(hx - ex, hy - ey) <= hyp(hx - fx, hy - fy);
        if (!headLast) reversePairs(wb);
        wb.push(hx, hy); tr.wb2 = tr.wb; tr.wb = wb; tr.L = L + hyp(hx - (headLast ? ex : fx), hy - (headLast ? ey : fy));
      } else { tr.wb = [hx, hy]; tr.L = 0; }
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
    return { t, me, grid, heads: heads.slice(0, 12), allHeads: heads, nb: nbOn ? { id: nbId, d: nbD, c: nbC, x: nbX, y: nbY } : null, arena };
  }

  /* ================= 6. Qamal xaritasi: flood-fill (4.0: barcha massivlar bir marta ajratiladi, Dial-BFS) ================= */
  const TRAP = (() => {
    const c = CFG.cell, R = CFG.gridR, N = Math.ceil(2 * R / c), NN = N * N, mask = new Uint8Array(NN);
    for (let iy = 0; iy < N; iy++) for (let ix = 0; ix < N; ix++) {
      const x = -R + (ix + 0.5) * c, y = -R + (iy + 0.5) * c;
      if (x * x + y * y > R * R) mask[iy * N + ix] = 2;
    }
    const u8 = () => new Uint8Array(NN), i32 = () => new Int32Array(NN);
    return { c, R, N, NN, mask, base: u8(), occ: u8(), occ2: u8(), occN: u8(), seen: u8(), D1: i32(), D2: i32(), DN: i32(), C: i32(), Q: i32(),
             bk: [0, 1, 2, 3].map(() => new Int32Array(NN * 8 + 8)), cnt: new Int32Array(4), ox: 0, oy: 0 };
  })();
  function trapMark(ax, ay, bx, by, r, extra, only2, rN) {
    const T = TRAP, c = T.c, N = T.N, ox = T.ox, oy = T.oy, occ = T.occ, occ2 = T.occ2, occN = T.occN, rr = r + extra, r2 = r * r, rr2 = rr * rr, rN2 = rN * rN;
    const x0 = Math.max(0, Math.floor((Math.min(ax, bx) - rr - ox) / c)), x1 = Math.min(N - 1, Math.floor((Math.max(ax, bx) + rr - ox) / c));
    const y0 = Math.max(0, Math.floor((Math.min(ay, by) - rr - oy) / c)), y1 = Math.min(N - 1, Math.floor((Math.max(ay, by) + rr - oy) / c));
    for (let iy = y0; iy <= y1; iy++) for (let ix = x0; ix <= x1; ix++) {
      const i = iy * N + ix; if (occ[i] === 2) continue;
      const d2 = ptSeg2(ox + (ix + 0.5) * c, oy + (iy + 0.5) * c, ax, ay, bx, by);
      if (d2 < r2 && !only2) { occ[i] = 1; occ2[i] = 1; if (d2 < rN2) occN[i] = 1; } else if (d2 < rr2) occ2[i] = 1;
    }
  }
  // Ko'p manbali eng qisqa yo'l (to'g'ri qadam 2, diagonal 3): 4 ta aylanma chelak (massiv yaratilmaydi), 8 qo'shni yoyib yozilgan
  function trapBfs(arr, D) {
    const T = TRAP, N = T.N, bk = T.bk, cnt = T.cnt, N1 = N - 1;
    D.fill(-1); cnt[0] = 0; cnt[1] = 0; cnt[2] = 0; cnt[3] = 0;
    const b0 = bk[0]; let c0 = 0;
    for (let iy = 0, i = 0; iy < N; iy++) for (let ix = 0; ix < N; ix++, i++) {
      if (arr[i] !== 0) continue;
      if (ix === 0 || iy === 0 || ix === N1 || iy === N1 || arr[i - 1] === 2 || arr[i + 1] === 2 || arr[i - N] === 2 || arr[i + N] === 2) { D[i] = 0; b0[c0++] = i; }
    }
    cnt[0] = c0;
    for (let d = 0, idle = 0; idle < 4; d++) {
      const b = d & 3, L = cnt[b];
      if (!L) { idle++; continue; }
      idle = 0;
      const buf = bk[b], k2 = (d + 2) & 3, k3 = (d + 3) & 3, B2 = bk[k2], B3 = bk[k3], d2 = d + 2, d3 = d + 3;
      let c2 = cnt[k2], c3 = cnt[k3];
      for (let q = 0; q < L; q++) {
        const i = buf[q]; if (D[i] !== d) continue;
        const ix = i % N, iy = (i - ix) / N;
        const fl = ix > 0 && arr[i - 1] === 0, fr = ix < N1 && arr[i + 1] === 0, fu = iy > 0 && arr[i - N] === 0, fd = iy < N1 && arr[i + N] === 0;
        let j, v;
        if (fl) { j = i - 1; v = D[j]; if (v < 0 || d2 < v) { D[j] = d2; B2[c2++] = j; } }
        if (fr) { j = i + 1; v = D[j]; if (v < 0 || d2 < v) { D[j] = d2; B2[c2++] = j; } }
        if (fu) { j = i - N; v = D[j]; if (v < 0 || d2 < v) { D[j] = d2; B2[c2++] = j; } }
        if (fd) { j = i + N; v = D[j]; if (v < 0 || d2 < v) { D[j] = d2; B2[c2++] = j; } }
        if (fl && fu) { j = i - N - 1; if (arr[j] === 0) { v = D[j]; if (v < 0 || d3 < v) { D[j] = d3; B3[c3++] = j; } } }
        if (fr && fu) { j = i - N + 1; if (arr[j] === 0) { v = D[j]; if (v < 0 || d3 < v) { D[j] = d3; B3[c3++] = j; } } }
        if (fl && fd) { j = i + N - 1; if (arr[j] === 0) { v = D[j]; if (v < 0 || d3 < v) { D[j] = d3; B3[c3++] = j; } } }
        if (fr && fd) { j = i + N + 1; if (arr[j] === 0) { v = D[j]; if (v < 0 || d3 < v) { D[j] = d3; B3[c3++] = j; } } }
      }
      cnt[b] = 0; cnt[k2] = c2; cnt[k3] = c3;
    }
    return D;
  }
  function buildTrap(env) {
    const { me, grid, heads, arena } = env, T = TRAP, c = T.c, R = T.R, N = T.N, NN = T.NN;
    const ox = T.ox = me.x - R, oy = T.oy = me.y - R;
    const occ = T.occ, occ2 = T.occ2, occN = T.occN, base = T.base, Q = T.Q, seen = T.seen;
    base.set(T.mask);
    if (arena) {
      const lim = arena.R - me.r - CFG.margin;
      if (hyp(me.x - arena.cx, me.y - arena.cy) + R + 1 > lim) {
        for (let iy = 0; iy < N; iy++) for (let ix = 0; ix < N; ix++) {
          const i = iy * N + ix; if (base[i] === 2) continue;
          if (hyp(ox + (ix + 0.5) * c - arena.cx, oy + (iy + 0.5) * c - arena.cy) > lim) base[i] = 1;
        }
      }
    }
    occ.set(base); occ2.set(base); occN.set(base);
    const GA = grid.ax, GB = grid.ay, GC = grid.bx, GD = grid.by, GR = grid.r;
    for (let p = 0, n = grid.n; p < n; p++) {
      const r = GR[p];
      if (ptSeg2(me.x, me.y, GA[p], GB[p], GC[p], GD[p]) > (R + r) * (R + r)) continue;
      trapMark(GA[p], GB[p], GC[p], GD[p], r, c * 0.75, false, Math.max(r * 0.72, r - 0.25 * me.r - CFG.margin));
    }
    for (const h of heads) {
      if (h.d > R + 400) continue;
      const P = h.pred, n = Math.min(P.length / 2 - 1, Math.round(0.75 / CFG.dt));
      for (let i = 2; i <= n; i += 2) trapMark(P[2 * i - 4], P[2 * i - 3], P[2 * i], P[2 * i + 1], h.rs + CFG.headU[0] + CFG.headU[1] * i * CFG.dt * 0.5, 0, true, 0);
    }
    const D1 = trapBfs(occ, T.D1), D2 = trapBfs(occ2, T.D2);
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
    seen.fill(0);
    for (let i = 0; i < NN; i++) if (occ[i] === 0) free++;
    if (m >= 0) {
      let h = 0, tl = 0; Q[tl++] = m; seen[m] = 1;
      while (h < tl) {
        const i = Q[h++], ix = i % N, iy = (i / N) | 0; area++;
        if (ix > 0 && !seen[i - 1] && occ[i - 1] === 0) { seen[i - 1] = 1; Q[tl++] = i - 1; }
        if (ix < N - 1 && !seen[i + 1] && occ[i + 1] === 0) { seen[i + 1] = 1; Q[tl++] = i + 1; }
        if (iy > 0 && !seen[i - N] && occ[i - N] === 0) { seen[i - N] = 1; Q[tl++] = i - N; }
        if (iy < N - 1 && !seen[i + N] && occ[i + N] === 0) { seen[i + N] = 1; Q[tl++] = i + N; }
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
      const DN = trapBfs(occN, T.DN), mN = nearFree(occN, m0);
      if (mN >= 0 && DN[mN] >= 0) nexit = descend(DN, mN);
      if (m >= 0) {
        const C = T.C; C.fill(-1); let h = 0, tl = 0;
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
  /* 4.0: Trayektoriya keshi + bufer hovuzi. Bir tick ichida bir xil (delta, boost) yo'li ko'p marta so'raladi (nurlarni
     qayta baholash, boost varianti, hujum rejasi) — yo'l (P), chegaralovchi doirasi va tana-oraliq qatori (G) bir marta
     hisoblanadi. Buferlar har tickda qayta ishlatiladi: rejalashtirish paytida xotira ajratilmaydi. */
  // 4.4: yuborilgan buyruqlar tarixi (oxirgi ~1 s). Kechikish katta bo'lsa, kelajakdagi dastlabki `lat` soniyada bosh aynan shu buyruqlar bo'yicha buriladi.
  const CMDH = {
    t: new Float64Array(32), a: new Float64Array(32), n: 0, i: 0,
    reset() { this.n = 0; this.i = 0; },
    push(t, a) { this.t[this.i] = t; this.a[this.i] = a; this.i = (this.i + 1) & 31; if (this.n < 32) this.n++; },
    at(time) {            // `time` paytida (yoki undan oldin) yuborilgan oxirgi buyruq
      let j = (this.i + 31) & 31;
      for (let k = 0; k < this.n; k++, j = (j + 31) & 31) if (this.t[j] <= time || k === this.n - 1) return this.a[j];
      return null;
    },
  };
  const KC = { me: null, cmd0: null, m0: new Map(), m1: new Map(), pool: [], n: 0, lat: CFG.latency, t: 0, hist: false };
  function kinPath(me, delta, boost, cmd0) {
    let cache = null;
    if (KC.me !== me) { KC.me = me; KC.cmd0 = cmd0; KC.m0.clear(); KC.m1.clear(); KC.n = 0; KC.lat = LAT.cur(); KC.t = S.env ? S.env.t : now(); KC.hist = KC.lat >= 0.16 && CMDH.n > 0; }
    if (KC.cmd0 === cmd0) { cache = boost ? KC.m1 : KC.m0; const hit = cache.get(delta); if (hit) return hit; }
    let K = KC.pool[KC.n];
    if (!K) K = KC.pool[KC.n] = { P: new Float64Array(2 * (NSTEP + 1)), G: new Float64Array(NSTEP + 1), Wi: new Int32Array(NSTEP + 1), cx: 0, cy: 0, cr: 0, gn: 0 };
    KC.n++; K.gn = 0;
    const dt = CFG.dt, P = K.P, lat = KC.lat;
    let x = me.x, y = me.y, a = me.ang, sp = me.sp, rem = delta, lastAm = NaN, ca = 0, sa = 0;
    const spT = boost ? me.spB : me.spN, wdt = PHY.effW(me, boost) * dt;
    P[0] = x; P[1] = y;
    for (let i = 1; i <= NSTEP; i++) {
      const t = i * dt;
      let da;
      if (t <= lat) {
        if (KC.hist) da = clamp(dAng(CMDH.at(KC.t - (lat - t + dt * 0.5) * 1000), a), -wdt, wdt);        // 4.4: shu oraliq o'rtasida kuchda bo'ladigan eski buyruq
        else {
          const dd0 = cmd0 != null ? dAng(cmd0, a) : PHY.myW * dt;
          da = clamp(0.5 * dd0 + 0.5 * PHY.myW * dt, -wdt, wdt);
        }
        rem -= da;
      } else {
        da = clamp(rem, -wdt, wdt);
        rem -= da;
      }
      const am = a + da / 2; a = wrap(a + da);
      if (am !== lastAm) { ca = Math.cos(am); sa = Math.sin(am); lastAm = am; }     // to'g'ri qismda trigonometriya takrorlanmaydi
      if (t > lat) sp = sp < spT ? Math.min(spT, sp + PHY.accUp * dt) : Math.max(spT, sp - PHY.accDown * dt);
      const v = sp * PHY.k; x += ca * v * dt; y += sa * v * dt;
      P[2 * i] = x; P[2 * i + 1] = y;
    }
    const cx = (P[0] + x) / 2, cy = (P[1] + y) / 2; let cr2 = 0;
    for (let i = 0; i <= NSTEP; i++) { const dx = P[2 * i] - cx, dy = P[2 * i + 1] - cy, d2 = dx * dx + dy * dy; if (d2 > cr2) cr2 = d2; }
    K.cx = cx; K.cy = cy; K.cr = Math.sqrt(cr2);
    if (cache) cache.set(delta, K);
    return K;
  }

  // Bosh ta'sir zonasi zaxirasi: qattiq oraliq (60 + 0.85u) va yumshoq xavf (0.7u + 22t² + 24) chegaralaridan katta
  const HMARG = (() => { const h = CFG.horizon, u = CFG.headU[0] + CFG.headU[1] * h + CFG.headU[2] * h * h; return Math.max(60 + 0.85 * u + 22, 0.7 * u + 22 * h * h + 46); })();
  const HACT = new Int32Array(64), HLIM = new Float64Array(64);
  // aimOrDelta: agar opt.isDelta bo'lsa ishorali delta, aks holda dunyo burchagi aim (dAng(aim, me.ang) ga o'giriladi)
  // Natijada path — umumiy (keshdagi) bufer; n — to'qnashuvgacha bo'lgan haqiqiy qadamlar soni (path[0..n] ishlatiladi).
  function simulate(env, aimOrDelta, boost, cmd0, opt = S.simOpt) {
    const { me, grid, heads, arena } = env, dt = CFG.dt, U = CFG.headU, HT = CFG.headHardT;
    const delta = (opt && opt.isDelta) ? aimOrDelta : dAng(aimOrDelta, me.ang);
    const aim = wrap(me.ang + delta);
    const K = kinPath(me, delta, boost, cmd0), P = K.P, G = K.G, Wi = K.Wi;
    const vMax = me.spB * PHY.k, mx = me.x, my = me.y;
    const effSp = boost ? Math.max(me.sp, me.spB * 0.85) : me.sp;
    const spBuf = (opt && opt.cut) ? 0 : Math.max(0, (effSp - me.spN - 1.0) * 1.35);
    const reqSafeT = CFG.safeT + (effSp > me.spN + 2.0 ? 0.16 : 0);
    let minGap = 60, nearGap = 60, ttc = Infinity, risk = 0, who = null, stop = NSTEP;
    if (env.g0g === undefined) {
      // Boshdagi toza masofa (c) bir marta, kengroq chegara bilan o'lchanadi: c − 60 radiusli doira ichidagi barcha
      // qadamlar uchun tana oralig'i aniq 60 (chegara) bo'ladi — ochiq maydonda panjara so'rovlari umuman bajarilmaydi.
      const c = grid.gap(mx, my, mx, my, 320);
      env.g0g = c < 60 ? c : 60;
      env.rho2 = c > 61 ? (c - 60.5) * (c - 60.5) : -1;
      let m = Infinity;
      for (const h of heads) { const d = hyp(mx - h.x, my - h.y) - h.rs; if (d < m) m = d; }
      env.g0h = m;
    }
    const g0 = Math.min(env.g0g - spBuf * 0.5, env.g0h), rho2 = env.rho2;
    // Shu yo'lga umuman ta'sir qila olmaydigan boshlar bir marta rad etiladi (chegaralovchi doiralar)
    let na = 0;
    const sl = vMax * dt;
    for (let k = 0; k < heads.length && na < 64; k++) {
      const h = heads[k], dx = h.bcx - K.cx, dy = h.bcy - K.cy, lim = K.cr + h.br + h.rs + HMARG;
      if (!(dx * dx + dy * dy >= lim * lim)) { const q = h.br + h.rs + HMARG + sl; HLIM[na] = q * q; HACT[na++] = k; }
    }
    for (let i = 1; i <= NSTEP; i++) {
      const t = i * dt, x0 = P[2 * i - 2], y0 = P[2 * i - 1], x = P[2 * i], y = P[2 * i + 1];
      const stepBuf = t <= 0.55 ? spBuf * (1 - t * 0.7) : 0;
      if (i > K.gn) {
        const e0x = x0 - mx, e0y = y0 - my, e1x = x - mx, e1y = y - my;
        if (e0x * e0x + e0y * e0y < rho2 && e1x * e1x + e1y * e1y < rho2) { G[i] = 60; Wi[i] = -1; }
        else { G[i] = grid.gap(x0, y0, x, y, 60); Wi[i] = grid.wi; }
        K.gn = i;
      }
      let g = G[i] - stepBuf, gw = Wi[i] >= 0 ? grid.ids[Wi[i]] : null;
      if (arena) { const ga = arena.R - me.r - CFG.margin - hyp(x - arena.cx, y - arena.cy) - stepBuf; if (ga < g) { g = ga; gw = 'chegara'; } }
      const u = U[0] + U[1] * t + U[2] * t * t;
      for (let kk = 0; kk < na; kk++) {
        const h = heads[HACT[kk]], H = h.pred, own = !!opt && h.id === opt.id;
        if (h.d > (vMax + h.v * 1.6) * t + h.rs + 200) continue;
        const qx = (x0 + x) * 0.5 - h.bcx, qy = (y0 + y) * 0.5 - h.bcy;
        if (qx * qx + qy * qy >= HLIM[kk]) continue;       // bu qadam bosh bashoratining butun doirasidan uzoqda
        const ds = segSeg(x0, y0, x, y, H[2 * i - 2], H[2 * i - 1], H[2 * i], H[2 * i + 1]);
        if (own && opt.cut) {
          const rCore = h.r * 0.72 + me.r * 0.30 + 3;
          if (t <= opt.ht) { const gh = ds - rCore; if (gh < g) { g = gh; gw = h.id; } }
          // 4.1: nishon boshi shu paytgacha bosib o'tgan (bashorat qilingan) yo'l — uning kelajakdagi tanasi. To'g'ri kesishda biz
          // kesishish nuqtasidan nishondan OLDIN o'tamiz va bu tekshiruv jim turadi; kechiksak — to'qnashuv sifatida ko'rinadi.
          // Tana uzunligidan uzoqroq orqada qolgan bo'laklar hisobga olinmaydi (qisqa ilonning dumi u yerdan allaqachon o'tib ketgan).
          // Kesishish vaqtidan (ht) keyin yotqiziladigan bo'laklar hisobga olinmaydi: u paytga kelib nishon bizning tanamizga urilgan bo'ladi.
          if (CFG.cutTrail) {
            const span = (h.L + 40) / Math.max(h.v, 60) / dt;          // tana necha qadamda o'tib ketadi
            for (let q = 0; q + 1 < i; q += 2) {
              const q2 = Math.min(i - 1, q + 2);
              if (q2 * dt > opt.ht + dt) break;
              if (i - q2 > span) continue;
              const gt = segSeg(x0, y0, x, y, H[2 * q], H[2 * q + 1], H[2 * q2], H[2 * q2 + 1]) - rCore;
              if (gt < g) { g = gt; gw = h.id; }
            }
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
    const isSafe = ttc > reqSafeT;
    return { aim, delta, steer: steerFromDelta(me.ang, delta), boost: !!boost, path: P, n: stop, ttc,
             gap: isSafe ? nearGap : minGap, fullGap: minGap, g0, risk, who, safe: isSafe,
             ex: P[2 * stop], ey: P[2 * stop + 1], hv: undefined };
  }

  function crossPaths(K, H, h) {
    const P = K.P, dt = CFG.dt, n = NSTEP, m = H.length / 2 - 1;
    const hb = !!h && h.pred === H && h.br != null && K.cr != null;      // chegaralar ma'lum → arzon rad etish
    const cd = hb ? hyp(h.bcx - K.cx, h.bcy - K.cy) : 0;
    if (!hb || cd <= K.cr + h.br + 1) {
      for (let i = 1; i <= n; i++) {
        const ax = P[2 * i - 2], ay = P[2 * i - 1], bx = P[2 * i], by = P[2 * i + 1];
        if (hb && ((ax < h.hx0 && bx < h.hx0) || (ax > h.hx1 && bx > h.hx1) || (ay < h.hy0 && by < h.hy0) || (ay > h.hy1 && by > h.hy1))) continue;
        for (let j = 1; j <= m; j++) {
          const X = segX(ax, ay, bx, by, H[2 * j - 2], H[2 * j - 1], H[2 * j], H[2 * j + 1]);
          if (!X) continue;
          return { th: (i - 1 + X.s) * dt, tc: (j - 1 + X.q) * dt, cx: ax + (bx - ax) * X.s, cy: ay + (by - ay) * X.s,
                   ourDir: Math.atan2(by - ay, bx - ax), enDir: Math.atan2(H[2 * j + 1] - H[2 * j - 1], H[2 * j] - H[2 * j - 2]) };
        }
      }
    }
    if (h) {
      const blockR = h.rs + 34;
      if (hb && cd > K.cr + h.br + blockR + 1) return null;
      const qlim = hb ? (K.cr + blockR + 1) * (K.cr + blockR + 1) : 0;
      for (let j = 2; j <= m; j++) {
        const hx = H[2 * j], hy = H[2 * j + 1], tc = j * dt;
        if (hb) { const qx = hx - K.cx, qy = hy - K.cy; if (qx * qx + qy * qy > qlim) continue; }
        // 4.0 TUZATISH: 3.2 da indekslar almashib qolgan edi (hy − H[2j−2], hx − H[2j−1]) → raqib yo'nalishi noto'g'ri chiqardi
        const enDir = Math.atan2(hy - H[2 * j - 1], hx - H[2 * j - 2]);
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
  const RAYS_Q = [16, 24, 32];                 // sifat darajasi bo'yicha nurlar soni
  const REFINE = [-0.5, 0.5, -0.25, 0.25];     // aniqlashtirish: nurlar orasidagi qadam ulushlari
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
    if (r.hv !== undefined) return r.hv;       // 4.0: har bir nur uchun bir marta hisoblanadi
    const eatR = me.r + 56, P = r.path;
    const maxIdx = Math.min(P.length, 2 * Math.round(1.15 / CFG.dt), r.n != null ? 2 * r.n + 2 : 1e9);
    let total = 0;
    const orbs = S.nearOrbs;
    if (orbs && orbs.n) {
      // yo'lning dastlabki ~1 s qismining chegaralovchi doirasi: uzoqdagi ozuqalar ichki siklga kirmaydi
      const li = maxIdx - 2, hcx = (P[2] + P[li]) / 2, hcy = (P[3] + P[li + 1]) / 2; let hr2 = 0;
      for (let i = 2; i < maxIdx; i += 2) { const dx = P[i] - hcx, dy = P[i + 1] - hcy, d2 = dx * dx + dy * dy; if (d2 > hr2) hr2 = d2; }
      const OX = orbs.x, OY = orbs.y, OV = orbs.v, lim = Math.sqrt(hr2) + eatR + 1, lim2 = lim * lim;
      // Katta ozuqa to'plamida barcha nuqtani har nurda tekshirish CPU'ni band qiladi.
      // Har bir ray uchun bir xil tarqatilgan 384 tagacha namuna olinadi.
      const stride = Math.max(1, Math.ceil(orbs.n / CFG.foodRayCap));
      for (let k = 0, n = orbs.n; k < n; k += stride) {
        const ox = OX[k], oy = OY[k], qx = ox - hcx, qy = oy - hcy;
        if (qx * qx + qy * qy > lim2) continue;
        let m2 = 1e18, hitStep = 99;
        for (let i = 2; i < maxIdx; i += 2) {
          const dx = ox - P[i], dy = oy - P[i + 1], d2 = dx * dx + dy * dy;
          if (d2 < m2) { m2 = d2; hitStep = i >> 1; }
        }
        const minD = Math.sqrt(m2);
        if (minD < eatR) total += OV[k] * stride / (1 + hitStep * 0.08) * (1 - minD / (eatR * 1.35));
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
    return (r.hv = Math.min(340, total * 2.6));
  }

  function scoreRay(r, me, w, goal, prevCmd, trap, exitDir) {
    const rDelta = r.delta != null ? r.delta : dAng(r.aim, me.ang);
    const prevDelta = S.cmdRem != null ? S.cmdRem : (prevCmd == null ? 0 : dAng(prevCmd, me.ang));
    // Xavfli nurlar orasida ham ishorali burilish uzluksizligi saqlanadi (chap-o'ng sakrash bo'lmaydi!)
    // 4.2: xavf paytida tanlangan burilish tomoni ~0.45 s ushlab turiladi. 4.0 dagi "qolgan burilish" tuzatishidan keyin bot to'siq
    // oldida chapga-o'ngga ikkilanib, to'g'ri unga borib urilishi mumkin edi (4.1 logidagi o'lim: 1.3 s ichida 6 marta tomon almashgan).
    const flip = S.turnSide !== 0 && S.env && S.env.t < S.turnHold && Math.abs(rDelta) > 0.30 && Math.sign(rDelta) === -S.turnSide;
    if (!r.safe) return -1e6 + r.ttc * 2e4 + clamp(r.gap, -100, 60) * 35 - r.risk * 2 - 90 * Math.abs(rDelta - prevDelta) - (flip ? 2600 : 0);
    let s = w.clear * Math.min(r.gap, 30) + (fin(r.ttc) ? -140 / (r.ttc + 0.15) : 0) - w.risk * r.risk;
    if (flip && (w === WEIGHTS.EVADE || w === WEIGHTS.ESCAPE)) s -= 120;
    const turn = Math.abs(rDelta);
    s -= w.turn * turn + w.stab * Math.abs(rDelta - prevDelta);
    // Agar hozir katta burilish (|prevDelta| > 0.65) bajarilayotgan bo'lsa, burilish ishorasini o'zgartirishga kuchli jarima!
    if (Math.abs(prevDelta) > 0.65 && Math.abs(rDelta) > 0.55 && Math.sign(rDelta) !== Math.sign(prevDelta)) {
      s -= 75;
    }
    if (w.maxTurn != null && turn > w.maxTurn) s -= 400 * (turn - w.maxTurn);
    if (goal && w.goal) {
      const d0 = hyp(goal.x - me.x, goal.y - me.y), RP = r.path, gx = goal.x, gy = goal.y; let b2 = Infinity;
      for (let i = 2, e = r.n != null ? 2 * r.n + 2 : RP.length; i < e; i += 2) { const dx = gx - RP[i], dy = gy - RP[i + 1], q2 = dx * dx + dy * dy; if (q2 < b2) b2 = q2; }
      const best = Math.min(d0, Math.sqrt(b2));
      s += w.goal * (goal.hint ? 1.7 : 1) * Math.min(350, d0 - best) * 0.62;
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
  const BAIL = [0, 0.6, -0.6, 1.2, -1.2, 1.8, -1.8, 2.5, -2.5], BAILOPT = { isDelta: true };   // chekinish yo'llari (ishorali burilish)
  const PA_AIM = new Float64Array(160), PA_DEL = new Float64Array(160), PA_OFF = new Float64Array(160), PA_IP = new Uint8Array(160);
  const RXOFF = [-0.52, -0.36, -0.24, -0.12, 0, 0.12, 0.24, 0.36, 0.52], IPT = [0.10, 0.18, 0.28, 0.42, 0.60, 0.82, 1.10, 1.38], IPD = [15, 45, 95, 165, 240];
  const ATK = {
    cur: null, cool: new Map(), globalCool: 0, lastEval: -1e9, why: 'kutilmoqda', obs: [],
    stats: null,
    reset() {
      this.cur = null; this.exact = null; this.failN = new Map(); this.cool.clear(); this.globalCool = 0; this.lastEval = -1e9; this.why = 'kutilmoqda'; this.obs = [];
      this.stats = { started: 0, races: 0, raceToCut: 0, counter: 0, aborted: 0, crossed: 0, ended: 0, vsBigger: 0, repeatBlocked: 0, abortWhy: {}, outcomes: {} }; this.whyHist = {};
    },
    recentTarget(id, t) { return this.obs.some(o => o.id === id && t - o.t < 4500); },
    watch(id, t, src, crossed) {
      const o = this.obs.find(x => x.id === id && !x.done);
      if (o) { o.t = t; o.crossed = o.src === src ? o.crossed || crossed : crossed; o.src = src; } else this.obs.push({ id, t, src, done: false, crossed });
    },
    plan(env, opts = {}) {
      const me = env.me, vB = me.spB * PHY.k, why = {}, cand = [], RX = opts.aimC != null, CT = !!opts.counter;
      const hintId = HINT.snakeId(env.t);
      const no = k => { why[k] = (why[k] || 0) + 1; };
      for (const h of env.heads) {
        if (opts.only != null && h.id !== opts.only) continue;
        if (!RX) {
          if (opts.only == null && !CT && h.id !== hintId && (this.cool.get(h.id) || 0) > env.t) { no('tanaffus'); continue; }
          if (h.d < 30 || h.d > (CT ? 380 : CFG.attackMaxD)) { no('masofa'); continue; }
          if (h.age < 0.12) { no('kuzatuv qisqa'); continue; }
          if (Math.abs(h.w) > (CT ? 4.2 : (h.d < 240 ? 3.4 : 2.4))) { no('nishon burilmoqda'); continue; }
        } else if (Math.abs(h.w) > (CT ? 4.5 : (h.d < 340 ? 3.8 : 3.0))) { no('nishon keskin burildi'); continue; }
        if (h.v < 45) { no('nishon sekin'); continue; }
        if (!RX && !CT && h.sct < CFG.attackMinTsct) { no('nishon mayda'); continue; }
        const vN = me.spN * PHY.k, tBoost = Math.max(h.v, h.vT || 0) > 1.25 * vN;
        const ux = Math.cos(h.ang), uy = Math.sin(h.ang), rx = me.x - h.x, ry = me.y - h.y;
        const along = rx * ux + ry * uy, lat = Math.abs(cross(ux, uy, rx, ry));
        const sideBySide = along >= -25 && lat < 240 && Math.abs(dAng(h.ang, me.ang)) < 1.15;
        // 4.1: yonma-yon bo'lmagan uzoq nishon biznikiga nisbatan juda mayda bo'lsa — foyda kam, xavf katta
        if (!RX && !CT && h.id !== hintId && h.sct < CFG.attackGain * me.sct) { no('nishon mayda'); continue; }      // 4.2: yaqindan ham (logda sct 5 li nishonga hujum ttc 0.08 bilan tugagan)
        if (!RX && !CT && tBoost && !sideBySide && Math.abs(h.w) > CFG.boostTurnW) { no('nishon boostda'); continue; }           // 4.3: boostda burilayotgan nishon — bashorat ishonchsiz
        const H = h.pred, nS = H.length / 2 - 1;
        let nA = 0;
        if (RX) for (const o of RXOFF) {
          const a = wrap(opts.aimC + o);
          PA_AIM[nA] = a; PA_DEL[nA] = dAng(a, me.ang); PA_OFF[nA] = o; PA_IP[nA] = 0; nA++;
        } else {
          for (let o = -1.75; o <= 1.7501; o += 0.10) { PA_AIM[nA] = wrap(me.ang + o); PA_DEL[nA] = o; PA_OFF[nA] = o; PA_IP[nA] = 0; nA++; }
        }
        const side = Math.sign(cross(ux, uy, rx, ry)) || 1;
        if (!opts.noIp) for (const ti of IPT) {
          const j = Math.min(nS - 1, Math.round(ti / CFG.dt));
          const ex = H[2 * j + 2] - H[2 * j], ey = H[2 * j + 3] - H[2 * j + 1], el = hyp(ex, ey) || 1;
          const nx = side * ey / el, ny = -side * ex / el;
          for (const D of IPD) {
            const a = Math.atan2(H[2 * j + 1] + ny * D - me.y, H[2 * j] + nx * D - me.x);
            if (RX && Math.abs(dAng(a, opts.aimC)) > 0.78) continue;
            const dl = dAng(a, me.ang);
            if (Math.abs(dl) > 2.35) continue;
            PA_AIM[nA] = a; PA_DEL[nA] = dl; PA_OFF[nA] = dl; PA_IP[nA] = 1; nA++;
          }
        }
        for (let ai = 0; ai < nA; ai++) {
          const pAim = PA_AIM[ai], pDel = PA_DEL[ai], pOff = PA_OFF[ai], pIp = PA_IP[ai] === 1;
          const X = crossPaths(kinPath(me, pDel, true, S.steer), H, h);
          if (!X) { no('kesishuv yo\'q'); continue; }
          const sinX = Math.abs(Math.sin(X.ourDir - X.enDir));
          if (sinX < (sideBySide ? 0.16 : RX ? 0.20 : CT ? 0.22 : 0.26)) { no('burchak kichik'); continue; }
          if (X.th < 0.02 || X.th > (RX ? 1.45 : CT ? 1.15 : 1.30) || X.tc > (RX ? 1.90 : 1.75)) { no('vaqt oynasi'); continue; }
          const lead = X.tc - X.th;
          const minClearSec = (h.r * 0.70 + me.r * 0.30 + 4) / Math.max(h.v, 60) + (tBoost && !sideBySide ? 0.06 : 0.015);
          // 4.0: zaxira vaqti nishon bashoratining noaniqligi U(tc) bilan o'sadi: uzoqdan boshlangan kesishda ko'proq, yaqinda 3.2 dagidek
          const leadMin = minClearSec * (RX ? 0.55 : CT ? 0.65 : sideBySide ? 0.70 : 0.88) +
                          (CT ? 0 : (RX ? CFG.leadURx : CFG.leadU) * (CFG.headU[0] + CFG.headU[1] * X.tc + CFG.headU[2] * X.tc * X.tc) / Math.max(h.v, 60));
          if (lead < leadMin) { no(tBoost && !sideBySide ? 'nishon boostda' : 'kechikamiz'); continue; }
          if (tBoost && !sideBySide && X.tc > 1.25 && !CT) { no('nishon boostda'); continue; }
          if (X.tc + (RX ? 0.04 : 0.10) > X.th + me.L / vB * 0.95) { no('tana qisqa'); continue; }
          const need = 0.22 + (Math.PI / 2) / Math.max(PHY.wN, 1.8);
          const diff = need / Math.max(X.tc, 0.10);
          if (!CT && diff < (RX ? 0.20 : 0.28)) { no('nishon qochib ulguradi'); continue; }
          const closeCutBonus = (h.d < 260 ? 28 : 0) + (sideBySide ? 24 : 0) + (X.tc < 0.75 ? 24 : 0) + (lead <= 0.36 ? 18 : 0);
          const sc = 70 * Math.min(diff, 1.8) + 26 * sinX + closeCutBonus - 24 * X.th - 3.5 * Math.abs(pOff) + 6 + clamp(12 * Math.log2((h.sct + 10) / (me.sct + 10)), -12, 26) + (h.id === hintId ? 30 : 0);      // 4.2: yirik nishonga ustunlik
          cand.push(Object.assign({ h, aim: pAim, delta: pDel, lead, diff, sinX, sc, ip: pIp }, X));
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
                   side0, hAng0: h.ang, hx0: h.x, hy0: h.y, ray: b.ray, sct0: prev ? prev.sct0 : me.sct,
                   plan: { th: r2(b.th), tc: r2(b.tc), lead: r2(b.lead), diff: r2(b.diff), sin: r2(b.sinX), ip: b.ip, d: r0(h.d), tsct: h.sct, L: r0(me.L), tb: h.boosting ? 1 : undefined, hint: HINT.snakeId(t) === h.id ? 1 : undefined } };
      if (kind === 'counter') this.stats.counter++;
      if (h.sct > me.sct && !(prev && prev.id === h.id)) this.stats.vsBigger++;
      if (prev && prev.phase === 'RACE') this.stats.raceToCut++; else this.stats.started++;
      this.why = 'hujum bajarilmoqda';
      this.watch(h.id, t, kind, false);
      LOG.atk(kind === 'counter' ? 'counter' : 'start', this.cur, env);
    },
    raceCand(env) {
      const me = env.me;
      if (me.sct < CFG.raceMinSct || me.L < 240) return null;
      let best = null; const hintId = HINT.snakeId(env.t);
      for (const h of env.heads) {
        const hinted = h.id === hintId;
        if ((!hinted && (this.cool.get(h.id) || 0) > env.t) || h.age < 0.12 || h.sct < CFG.attackMinTsct || h.d > (hinted ? 900 : 680)) continue;
        if (!hinted && h.sct < CFG.attackGain * me.sct) continue;
        const ux = Math.cos(h.ang), uy = Math.sin(h.ang), rx = me.x - h.x, ry = me.y - h.y;
        const along = rx * ux + ry * uy, lat = cross(ux, uy, rx, ry), absLat = Math.abs(lat);
        if (h.boosting && (along < -40 || absLat > 240)) continue;
        if (Math.abs(dAng(h.ang, me.ang)) > 1.45 || Math.abs(h.w) > 2.0) continue;
        const minLat = h.r + me.r * 0.4 + 6;
        if (along < -(CFG.raceBack0 + CFG.raceBackK * Math.min(me.sct, 40)) || along > 260 || absLat < minLat || absLat > 400) continue;
        const sc = Math.min(45, h.sct) + 40 - absLat * 0.08 - Math.max(0, -along) * 0.05 + (along >= -15 ? 25 : 0) +
                   clamp(10 * Math.log2((h.sct + 10) / (me.sct + 10)), -10, 20) + (hinted ? 40 : 0);
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
                         plan: { lat: r0(rc.lat), along: r0(rc.along), d: r0(rc.h.d), tsct: rc.h.sct, hint: HINT.snakeId(t) === rc.h.id ? 1 : undefined } };
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
        c.dbg = { gap: r0(h.d - h.rs), tsp: r1(h.tr.sp), rem: r2((c.thAbs - t) / 1000), fails: c.fails };
        // 4.3: uzoqda (160–270) faqat nishonning HUJUM BOSHIDAGI yo'l chizig'ini ham kesib o'tgan bo'lsak hisoblanadi —
        // avval nishon burilsa, biz hali yetib bormasak ham "kesib o'tildi" deb hisoblanardi (logdagi o'lim)
        const g0 = h.d - h.rs, near = g0 < CFG.crossGap || hyp(me.x - c.cx, me.y - c.cy) < 90 ||
                     (g0 < 270 && c.hAng0 != null && Math.sign(cross(Math.cos(c.hAng0), Math.sin(c.hAng0), me.x - c.hx0, me.y - c.hy0)) !== c.side0);
        if (Math.sign(lat) !== c.side0 && ahead > -h.rs * 0.5 && near) {
          c.phase = 'EXIT'; c.crossT = t; c.exitDir = wrap(me.ang - c.side0 * 0.25);
          c.exitUntil = t + clamp(c.tcAbs - t + 650, 450, 1350);
          this.stats.crossed++;
          this.watch(c.id, t, c.kind, true);
          LOG.atk('cross', c, env);
          return;
        }
        const res = this.plan(env, { only: c.id, aimC: c.aim, counter: c.counter });
        const rem = (c.thAbs - t) / 1000;         // oxirgi yaroqli reja bo'yicha kesishishgacha qolgan vaqt
        /* 4.1: ikki bosqich.
           ERTA (rem > lockT): chekinish arzon va xavfsiz — reja buzilsa yoki zaxira kamaysa darhol bekor qilinadi.
           KECH (rem <= lockT ≈ 0.5 s, boostda ~200 birlik): burilib ulgurib bo'lmaydi; bekor qilish baribir kesishish nuqtasiga,
           faqat kechroq olib boradi (stsenariy sinovlarida aynan shunday o'limlar chiqdi). Shuning uchun hujum qulflanadi: kesish
           yo'li jismonan xavfli bo'lmaguncha davom etadi (decide() buni har tickda nishonning kelajakdagi tanasi bilan tekshiradi). */
        if (!c.locked && !c.counter && rem <= CFG.lockT) {
          // Qulflash faqat reja HOZIR yaroqli va zaxira yetarli bo'lsa; aks holda — oxirgi imkoniyatda chekinamiz.
          const b = res.best, HU = CFG.headU, tcl = b ? b.tc : Math.max(rem, 0.1);
          const need = (h.r * 0.70 + me.r * 0.30 + 4) / Math.max(h.v, 60) + 0.015 + CFG.leadLock * (HU[0] + HU[1] * tcl + HU[2] * tcl * tcl) / Math.max(h.v, 60);
          c.dbg.lead = b ? r2(b.lead) : null; c.dbg.need = r2(need);
          // Xavfga moslik: nishon bizga nisbatan qanchalik mayda bo'lsa (yutuq kichik, yo'qotish katta), talab shunchalik qattiq.
          // Nishon bizning yarmimizdan katta bo'lsa — talab yo'q (3.2 dagidek dadil); 15% dan kichik bo'lsa — to'liq talab.
          const lam = clamp((CFG.riskHi - h.sct / Math.max(me.sct, 1)) / (CFG.riskHi - CFG.riskLo), 0, 1);
          c.dbg.lam = r2(lam);
          if (lam === 0 || (b && b.lead >= need * lam) || rem <= CFG.lockT - 0.2) { c.locked = true; LOG.atk('lock', c, env); }
          else return this.abort(t, 'qaytmas nuqta');
        }
        if (CFG.noReturn && !c.locked && !c.counter) {
          let plain = false, robust = false;
          for (let bi = 0; bi < BAIL.length && !robust; bi++) for (let bb = 0; bb < 2 && !robust; bb++) {
            const r = simulate(env, BAIL[bi], bb === 1, S.steer, BAILOPT);
            if (r.safe && r.gap >= 3) { plain = true; if (r.gap >= 14) robust = true; }
          }
          if (!robust && plain) {
            const b = res.best, HU = CFG.headU;
            const need = b ? (h.r * 0.70 + me.r * 0.30 + 4) / Math.max(h.v, 60) + 0.015 + CFG.leadLock * (HU[0] + HU[1] * b.tc + HU[2] * b.tc * b.tc) / Math.max(h.v, 60) : Infinity;
            c.dbg.lead = b ? r2(b.lead) : null; c.dbg.need = fin(need) ? r2(need) : null;
            if (!(b && b.lead >= need)) return this.abort(t, 'qaytmas nuqta');
          }
        }
        if (res.best) {
          const b = res.best; c.fails = 0;
          c.aim = wrap(c.aim + clamp(dAng(b.aim, c.aim), -0.40, 0.40));
          c.cx = b.cx; c.cy = b.cy; c.ourDir = b.ourDir; c.tcAbs = t + b.tc * 1000; c.thAbs = t + b.th * 1000; c.ray = b.ray;
        } else {
          // 4.2: nishon boostda va biz undan aniq oldinda emasmiz — yonma-yon quvish foydasiz (tezliklar teng), boost esa uzunlikni yeydi
          if (h.d < 340 && ahead > -35 && Math.abs(lat) < 230 && !(CFG.holdNoBoost && Math.max(h.v, h.vT || 0) > 1.25 * me.spN * PHY.k && ahead < 70)) {
            const pAim = this.raceAim(h, me);
            const rHold = simulate(env, dAng(pAim, me.ang), true, S.steer, { id: c.id, ht: 0.40, uK: 0, cut: true, isDelta: true });
            if (rHold.safe && rHold.gap >= 2) {
              c.aim = pAim; c.fails = 0;
              return;
            }
          }
          if (++c.fails === 1) c.failT = t;
          c.lastWhy = topWhy(res.why);
          if (c.locked) {
            if (rem < -0.35) return this.abort(t, 'kesishuv bo\'lmadi');       // qulflangan, lekin kesishish vaqti o'tib ketdi
          } else if (t - c.failT >= (c.counter ? 250 : rem > 0.9 ? 150 : 55)) {
            // bardosh vaqtga asoslangan (3.2 da doim 5 tick edi: 20 Hz da 250 ms, 31 FPS da 320 ms)
            return this.abort(t, 'reja buzildi: ' + c.lastWhy);
          }
        }
      } else if (c.phase === 'EXIT') {
        if (h) {
          // 4.3: nishon oldinda bo'lsa — yaqinlashish tezligiga qarab erta chekinish (boostdagi nishon 120 birlikni 0.2 s da bosib o'tadi)
          const dir = Math.atan2(h.y - me.y, h.x - me.x), hv = Math.max(h.v, h.vT || 0);
          c.tb = hv > 1.25 * me.spN * PHY.k;
          if (Math.abs(dAng(dir, me.ang)) < 1.2) {
            const vc = c.tb ? Math.max(0, me.sp * PHY.k * Math.cos(me.ang - dir) - hv * Math.cos(h.ang - dir)) : 0;
            if (h.d - h.rs < 120 + CFG.exitVcK * vc) return this.end(t, 'nishon oldinda');
          }
        }
        if (t > c.exitUntil) {
          this.end(t, 'chiqish tugadi');
          if (h && !c.counter) COIL.start(env, h, 'kesishdan keyin', true);
        }
      }
    },
    abort(t, why) {
      const c = this.cur; if (!c) return;
      if (c.phase === 'COMMIT' && c.locked && CFG.exactMs > 0) this.exact = { id: c.id, until: t + CFG.exactMs };
      const k = why.split(':')[0];
      this.stats.aborted++; this.stats.abortWhy[k] = (this.stats.abortWhy[k] || 0) + 1;
      // 4.2: bir nishonga ketma-ket muvaffaqiyatsiz hujumlar — tanaffus uzayadi (logda bitta ilonga 15 s ichida 5 marta hujum qilingan)
      const fN = this.failN.get(c.id), nF = fN && t - fN.t < 14000 ? fN.n + 1 : 1;
      this.failN.set(c.id, { n: nF, t });
      if (nF >= 2) this.stats.repeatBlocked++;
      this.cool.set(c.id, t + (nF >= 3 ? CFG.failCool3 : nF === 2 ? CFG.failCool2 : 1100)); this.globalCool = t + (c.counter ? 250 : 300);
      if (HINT.cur && HINT.cur.kind === 'snake' && HINT.cur.id === c.id) HINT.cur = null;       // 4.4
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

  /* 4.0: klasterlash typed-array kataklarida (Map va katak-obyektlarsiz); faqat eng yaxshi 16 nishon uchun obyekt yaratiladi.
     Baholash mantig'i 3.2 bilan bir xil. */
  const FB = (() => {
    const cell = 65, R = 1400, Wd = Math.ceil(2 * R / cell) + 8, n = Wd * Wd, f = () => new Float64Array(n);
    return { cell, R, Wd, sx: f(), sy: f(), ms: f(), cp: f(), cx: f(), cy: f(), macro: f(), loot: f(), bg: new Int32Array(n), cn: new Int32Array(n),
             touched: new Int32Array(n), nt: 0, hx: new Float64Array(64), hy: new Float64Array(64), hi: new Float64Array(64), orbs: { n: 0, x: new Float64Array(2048), y: new Float64Array(2048), v: new Float64Array(2048) } };
  })();
  function foodTargets(env, trap) {
    const me = env.me, t = env.t, B = FB, cell = B.cell, R = B.R, Wd = B.Wd, R2 = R * R;
    const SX = B.sx, SY = B.sy, MS = B.ms, CP = B.cp, CX = B.cx, CY = B.cy, MAC = B.macro, LOOT = B.loot, BG = B.bg, CN = B.cn, touched = B.touched;
    for (let q = 0; q < B.nt; q++) { const k = touched[q]; SX[k] = 0; SY[k] = 0; MS[k] = 0; CP[k] = 0; BG[k] = 0; CN[k] = 0; }
    let nt = 0, on = 0;
    const orbs = B.orbs; let OX = orbs.x, OY = orbs.y, OV = orbs.v;
    const bx0 = Math.floor((me.x - R) / cell) - 3, by0 = Math.floor((me.y - R) / cell) - 3, mx = me.x, my = me.y;
    const growOrbs = () => {
      const g = a => { const b = new Float64Array(a.length * 2); b.set(a); return b; };
      OX = orbs.x = g(OX); OY = orbs.y = g(OY); OV = orbs.v = g(OV);
    };
    const add = (x, y, mass, corpseW, isBig) => {
      const dx = x - mx, dy = y - my, d2 = dx * dx + dy * dy;
      if (d2 > R2) return;
      if (d2 < 270400) {
        if (on === OX.length) growOrbs();
        OX[on] = x; OY[on] = y; OV[on] = mass * (corpseW ? 3.0 : isBig ? 1.5 : 1.0); on++;
      }
      const k = (Math.floor(x / cell) - bx0) * Wd + (Math.floor(y / cell) - by0);
      if (CN[k] === 0) touched[nt++] = k;
      SX[k] += x * mass; SY[k] += y * mass; MS[k] += mass; CN[k]++;
      if (corpseW) CP[k] += mass * corpseW;
      if (isBig) BG[k]++;
    };
    const f = Array.isArray(W.foods) ? W.foods : [];
    for (let i = 0, nf = f.length; i < nf; i++) {          // eng issiq sikl: funksiya chaqiruvisiz
      const o = f[i]; if (!o || o.eaten) continue;
      const fx = o.xx, fy = o.yy;
      if (typeof fx !== 'number' || typeof fy !== 'number') continue;
      const dx = fx - mx, dy = fy - my, d2 = dx * dx + dy * dy;
      if (!(d2 <= R2)) continue;                             // uzoq yoki NaN
      let sz = o.sz; if (!(typeof sz === 'number' && sz - sz === 0)) sz = 5;
      let lw = 0;
      const q = sz * sz, mass = (q < 1 ? 1 : q > 450 ? 450 : q) / 16, big = sz >= 8.5;
      if (d2 < 270400) { if (on === OX.length) growOrbs(); OX[on] = fx; OY[on] = fy; OV[on] = mass * (lw ? 3.0 : big ? 1.5 : 1.0); on++; }
      const k = (Math.floor(fx / cell) - bx0) * Wd + (Math.floor(fy / cell) - by0);
      if (CN[k] === 0) touched[nt++] = k;
      SX[k] += fx * mass; SY[k] += fy * mass; MS[k] += mass; CN[k]++;
      if (lw) CP[k] += mass * lw;
      if (big) BG[k]++;
    }
    // O'lja (o'lim ozuqasi) qo'shimchasi alohida o'tishda: faqat zonalardagi ozuqalar ko'riladi, shuning uchun minglab oddiy
    // ozuqaning har biri uchun qidiruv bajarilmaydi. Zonalar teskari tartibda — 3.2 dagi kabi ro'yxatdagi oxirgi zona ustun.
    if (DEATH.zones.length) {
      const Z = DEATH.zones, rec = FOOD.rec, sT = FOOD.scanT;
      for (let zi = Z.length - 1; zi >= 0; zi--) {
        const z = Z[zi]; if (z.kind !== 'observed' && z.kind !== 'probable') continue;
        const w = z.ourTarget ? 2.4 : 1.8;
        for (const o of z.newSet) {
          if (o.eaten) continue;
          const r = rec.get(o); if (!r || r.lwT === t || (sT >= 0 && r.ts !== sT)) continue;
          r.lwT = t;
          const fx = o.xx, fy = o.yy; if (!fin(fx) || !fin(fy)) continue;
          const dx = fx - mx, dy = fy - my, d2 = dx * dx + dy * dy; if (d2 > R2) continue;
          const k = (Math.floor(fx / cell) - bx0) * Wd + (Math.floor(fy / cell) - by0);
          if (CN[k] === 0) continue;
          const sz = num(o.sz, 5), mass = clamp(sz * sz, 1, 450) / 16;
          CP[k] += mass * w;
          if (d2 < 270400) { if (on === OX.length) growOrbs(); OX[on] = fx; OY[on] = fy; OV[on] = mass * (3.0 - (sz >= 8.5 ? 1.5 : 1.0)); on++; }
        }
      }
    }
    for (const pl of DEATH.pendingLoot(me, t)) add(pl.x, pl.y, pl.mass, pl.our ? 2.2 : 1.6, true);
    // 4.2: harakatlanuvchi ozuqa endi o'lja hisoblanmaydi va uning ortidan boost bilan quvilmaydi (u qochadi, boost esa uzunlikni yeydi;
    // 4.1 logida shu sabab 22.6 s boost sarflangan). Faqat deyarli yo'l ustida (260 birlik, ±0.9 rad) bo'lsa oddiy ozuqa kabi olinadi.
    if (CFG.preyMass > 0) for (const p of (Array.isArray(W.preys) ? W.preys : [])) {
      if (!okObj(p) || p.eaten) continue;
      const dx = p.xx - mx, dy = p.yy - my;
      if (dx * dx + dy * dy < 67600 && Math.abs(dAng(Math.atan2(dy, dx), me.ang)) < 0.9) add(p.xx, p.yy, CFG.preyMass, 0, false);
    }
    B.nt = nt; orbs.n = on; S.nearOrbs = orbs;

    // Tig'iz 135px radiusdagi haqiqiy to'plam zichligi (faqat dx, dy ∈ [-2, 2])
    for (let q = 0; q < nt; q++) { const k = touched[q]; CX[k] = SX[k] / MS[k]; CY[k] = SY[k] / MS[k]; }
    for (let q = 0; q < nt; q++) {
      const k = touched[q], x = CX[k], y = CY[k];
      let macro = MS[k], macroCorpse = CP[k], macroBig = BG[k];
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (!dx && !dy) continue;
        const j = k + dx * Wd + dy;
        if (CN[j] === 0) continue;
        const ex = x - CX[j], ey = y - CY[j], dist2 = ex * ex + ey * ey;
        if (dist2 < 19600) {
          const w = Math.exp(-dist2 / 11250);
          macro += MS[j] * w;
          macroCorpse += CP[j] * w;
          if (dist2 < 12100) macroBig += BG[j];
        }
      }
      MAC[k] = macro;
      // Haqiqiy o'lim ozuqasi yoki juda zich yirik ozuqalar to'plami:
      LOOT[k] = macroCorpse >= 8 ? macroCorpse : ((macro >= 36 && macroBig >= 3) ? macro : 0);
    }

    const vN = me.spN * PHY.k, wEff = PHY.effW(me, false), wEffB = PHY.effW(me, true), Rt = vN / wEff, sa = Math.sin(me.ang), ca = Math.cos(me.ang);
    const cLx = mx - sa * Rt, cLy = my + ca * Rt, cRx = mx + sa * Rt, cRy = my - ca * Rt;
    const AH = env.allHeads, nh = AH.length, vB = me.spB * PHY.k, canBoost = me.sct >= CFG.boostMinSct;
    // raqiblar: koordinata va 1/v² oldindan — ichki siklda ildiz ham, bo'lish ham yo'q
    if (B.hx.length < nh) { B.hx = new Float64Array(nh * 2); B.hy = new Float64Array(nh * 2); B.hi = new Float64Array(nh * 2); }
    const HX = B.hx, HY = B.hy, HI = B.hi;
    for (let hi = 0; hi < nh; hi++) { const h = AH[hi], v = Math.max(h.v, 60); HX[hi] = h.x; HY[hi] = h.y; HI[hi] = 1 / (v * v); }
    let nBL = 0; for (let i = 0; i < BL.length; i++) if (t < BL[i].until) nBL++;
    let cpK = 0, cux = 0, cuy = 0;
    if (CFG.centerPull > 0 && env.arena) {
      const ax = env.arena.cx - mx, ay = env.arena.cy - my, ad = hyp(ax, ay);
      cpK = CFG.centerPull * clamp((ad / env.arena.R - 0.5) / 0.3, 0, 1);
      if (ad > 1) { cux = ax / ad; cuy = ay / ad; }
    }
    const hu = huntPoint(env); S.huntPt = hu;
    if (hu) { const ax = hu.x - mx, ay = hu.y - my, ad = hyp(ax, ay); if (ad > 1) { cpK = CFG.huntPull; cux = ax / ad; cuy = ay / ad; } }
    const UBK = 1.4500001 * (1 + cpK);
    const out = [];              // qiymat bo'yicha kamayuvchi tartibda saqlanadigan eng yaxshi 16 ta (barqaror tartib)
    for (let q = 0; q < nt; q++) {
      const k = touched[q], x = CX[k], y = CY[k], d = hyp(x - mx, y - my), cLoot = LOOT[k], cMacro = MAC[k], cMass = MS[k];
      if (d < me.r * 0.45) continue;
      if (cLoot < 8 && cMacro < 16 && (hyp(x - cLx, y - cLy) < Rt * 0.80 || hyp(x - cRx, y - cRy) < Rt * 0.80)) continue;
      if (out.length === 16) {      // yuqori chegara: eng yaxshi 16 talikka kira olmaydigan katak to'liq baholanmaydi
        const lp = cLoot >= 8 && d < 950, tmin = lp && canBoost ? Math.min(d / vN, d / vB + 0.10) : d / vN;
        if (!((cMass + 1.15 * (cMacro - cMass) + (lp ? 3.8 * cLoot : 0)) * UBK / (tmin + 0.18 + 0.35 * tmin * tmin) > out[15].val)) continue;
      }
      if (nBL && blacklisted(x, y, t)) continue;
      if (env.grid.gap(x, y, x, y, 24) < (cLoot >= 10 ? 0 : 2)) continue;
      if (trap.dHere < 9999 && trap.dAt(x, y) >= 9999) continue;
      const ang = Math.atan2(y - my, x - mx), turnA = Math.abs(dAng(ang, me.ang));
      const eta = d / vN + turnA / wEff;
      const etaB = d / vB + turnA / wEffB + 0.10;
      let rv2 = Infinity, crowd = 0;
      for (let hi = 0; hi < nh; hi++) {
        const qx = HX[hi] - x, qy = HY[hi] - y, q2 = qx * qx + qy * qy; if (q2 < 102400) crowd++;
        const r2v = q2 * HI[hi]; if (r2v < rv2) rv2 = r2v;
      }
      const rival = Math.sqrt(rv2);
      const isLoot = cLoot >= 8 && d < 950;
      const winB = isLoot && canBoost && etaB < rival * 0.95;
      const useB = isLoot && canBoost && (winB || (d > 100 && cLoot >= 14 && rival > etaB * 0.85));
      const etaUsed = useB ? etaB : eta;
      const lostToRival = rival < etaUsed * 0.78;
      const contested = rival < etaUsed * 0.95 && rival < 2.8;
      // Kvadratik ufq formulasi: yaqin va boy to'plamlar har doim uzoqdagi (d=700..1200) to'plamlardan ustun!
      const timeCost = etaUsed + 0.18 + 0.35 * etaUsed * etaUsed;
      const effMass = cMass + 1.15 * (cMacro - cMass) + (isLoot ? 3.8 * cLoot : 0);
      let val = effMass / timeCost;
      if (d < 240 && turnA < 1.15) val *= 1.45;
      if (lostToRival) val *= 0.08; // Raqib bizdan ancha oldin yeb ketadigan uzoq ozuqaga yugurmaslik!
      else if (contested && !winB) val *= 0.35;
      if (cpK > 0 && !isLoot && d > 1) val *= 1 + cpK * ((x - mx) * cux + (y - my) * cuy) / d;   // markazga tortish
      let pos = out.length;
      if (pos === 16) { if (!(val > out[15].val)) continue; pos = 15; }
      while (pos > 0 && val > out[pos - 1].val) pos--;
      if (out.length < 16) out.push(null);
      for (let j = out.length - 1; j > pos; j--) out[j] = out[j - 1];
      out[pos] = { x, y, d, ang, eta, etaB, mass: cMass, macro: cMacro, loot: isLoot && !lostToRival ? cLoot : 0, n: CN[k], contested, winB, useB, crowd, rival, val };
    }
    return out;
  }

  /* ================= 9b. Sichqoncha ishorasi (4.2) =================
     O'yinchi bosgan nuqta — botga taklif. Nuqtada ilon bo'lsa: o'rash/kesish uchun ustuvor nishon (yirik va biz tomonga kelayotgan
     bo'lsa — xavf); ilon bo'lmasa: o'sha joydagi ozuqa/o'lja maqsad qilib olinadi. Xavfsizlik qoidalari har doim ustun. */
  const HINT = {
    cur: null, n: 0, lastT: -1e9,
    world(cx, cy) {
      const me = S.env.me, mw = num(W.mww, innerWidth), mh = num(W.mhh, innerHeight), g = num(W.gsc, 1);
      const kx = g * innerWidth / mw, ky = g * innerHeight / mh;
      return { x: (cx - num(W.mww2, mw / 2) * innerWidth / mw) / kx + num(W.view_xx, me.x),
               y: (cy - num(W.mhh2, mh / 2) * innerHeight / mh) / ky + num(W.view_yy, me.y), tol: Math.max(45, 22 / kx) };
    },
    massAt(x, y) {
      const f = W.foods; let m = 0, big = 0; this.big = 0; if (!Array.isArray(f)) return 0;
      for (let i = 0; i < f.length; i++) {
        const o = f[i]; if (!o || o.eaten) continue;
        const dx = o.xx - x, dy = o.yy - y;
        if (dx * dx + dy * dy < 32400) { const sz = num(o.sz, 5), v = clamp(sz * sz, 1, 450) / 16; m += v; if (sz >= 8.5) big += v; }
      }
      this.big = big;       // yirik donalar (o'lgan ilon qoldig'i) ulushi
      return m;
    },
    click(cx, cy) {
      const env = S.env; if (!env) return;
      const p = this.world(cx, cy), t = env.t;
      if (!fin(p.x) || !fin(p.y)) return;
      let best = null, bd = p.tol;
      for (const tr of TR.values()) {
        if (tr.dead) continue;
        let d = hyp(tr.x - p.x, tr.y - p.y) - tr.r; const P = tr.wb;
        if (P) for (let i = 0; i + 3 < P.length; i += 2) { const q = ptSeg(p.x, p.y, P[i], P[i + 1], P[i + 2], P[i + 3]) - tr.r; if (q < d) d = q; }
        if (d < bd) { bd = d; best = tr; }
      }
      this.n++;
      if (best) this.cur = { kind: 'snake', id: best.id, x: p.x, y: p.y, t, until: t + CFG.hintMs + 2000 };
      else {
        const m = this.massAt(p.x, p.y), big = this.big;
        this.cur = { kind: 'point', x: p.x, y: p.y, t, until: t + CFG.hintMs,
                     ref: { x: p.x, y: p.y, d: 0, loot: big >= 12 ? Math.min(60, big) : 0, crowd: 0, rival: 9, winB: true, contested: false, macro: m, mass: m } };
      }
      S.foodsT = 0;
      LOG.ev(3, 'hint', best ? { k: 'ilon', id: best.id, sct: best.sct, d: r0(best.d) } : { k: 'nuqta', mass: r1(this.cur.ref.macro), d: r0(hyp(p.x - env.me.x, p.y - env.me.y)) });
      UI.msg(best ? '📍 ilon' : this.cur.ref.loot ? '📍 o\'lja' : '📍 nuqta');
    },
    active(t) { const c = this.cur; if (c && t > c.until) { this.cur = null; return null; } return c; },
    snakeId(t) { const c = this.active(t); return c && c.kind === 'snake' ? c.id : null; },
  };

  // 4.2: uzoqdagi yirik o'lja. Kutilgan yutuq (qoldiq × ulush) boost xarajatidan aniq katta bo'lsagina yuguriladi.
  function lootRush(env) {
    const t = env.t, me = env.me;
    if (CFG.rushMaxD <= 0 || me.sct < CFG.boostMinSct || S.dangerLvl >= 1 || S.trapLvl >= 1) return null;
    let best = null; const vB = me.spB * PHY.k;
    for (const z of DEATH.zones) {
      if ((z.kind !== 'observed' && z.kind !== 'probable') || t - z.t > 6000 || z.sct < Math.max(12, Math.min(CFG.rushMinSct, 0.5 * me.sct))) continue;
      const P = z.pts; let d2 = 1e18, px = z.x, py = z.y;
      for (let i = 0; i + 1 < P.length; i += 2) { const dx = P[i] - me.x, dy = P[i + 1] - me.y, q = dx * dx + dy * dy; if (q < d2) { d2 = q; px = P[i]; py = P[i + 1]; } }
      const d = Math.sqrt(d2);
      if (d < 900 || d > CFG.rushMaxD) continue;                    // yaqindagisi odatiy o'lja mantig'i bilan olinadi
      if (env.arena && hyp(px - env.arena.cx, py - env.arena.cy) > env.arena.R - 120) continue;
      const eta = d / vB + Math.abs(dAng(Math.atan2(py - me.y, px - me.x), me.ang)) / Math.max(PHY.effW(me, true), 1.5) + 0.35;
      let crowd = 0;
      for (const tr of TR.values()) if (!tr.dead && hyp(tr.x - px, tr.y - py) < 600) crowd++;
      const left = Math.max(0, 1 - ((t - z.t) / 1000 + eta) / (5 + z.sct / 25));        // yetib borguncha qancha qoladi (yirik ilon qoldig'i uzoqroq turadi)
      const val = z.sct * 0.5 * left / (1 + 0.5 * crowd) - 1.5 * eta * CFG.boostCost;
      if (val > 5 && (!best || val > best.val)) best = { x: px, y: py, d, val, z, eta, crowd };
    }
    return best;
  }

  // 4.2: "ov" — yirik ilon boshining oldinroq, biz tomondagi qanotiga siljish: yonma-yon siquv va kesish imkoniyati shu yerda paydo bo'ladi.
  function huntPoint(env) {
    const t = env.t, me = env.me, H = S.huntT;
    if (!S.hunt || CFG.huntPull <= 0 || me.sct < CFG.attackMinSct * 2 || S.dangerLvl >= 1 || S.trapLvl >= 1) { S.huntT = null; return null; }
    const hintId = HINT.snakeId(t);
    let tr = hintId != null ? TR.get(hintId) : (H && t < H.until ? TR.get(H.id) : null);
    if (!tr || tr.dead || tr.d > 1700) {
      let bv = 0; tr = null;
      for (const c of TR.values()) {
        if (c.dead || c.sct < Math.max(30, 0.7 * me.sct) || c.d < 260 || c.d > 1500 || t - c.since < 800) continue;
        const v = Math.min(c.sct, 4 * me.sct) / (c.d + 500);
        if (v > bv) { bv = v; tr = c; }
      }
      S.huntT = tr ? { id: tr.id, until: t + 4000 } : null;
    }
    if (!tr) return null;
    const ux = Math.cos(tr.ang), uy = Math.sin(tr.ang), sd = Math.sign(ux * (me.y - tr.y) - uy * (me.x - tr.x)) || 1;
    const lead = clamp(tr.d * 0.5, 120, 420), off = tr.r + me.r + 150;
    return { x: tr.x + ux * lead - uy * sd * off, y: tr.y + uy * lead + ux * sd * off, id: tr.id };
  }

  function pickGoal(env, foods) {
    const t = env.t, me = env.me, best = foods[0];
    let g = S.goal;
    // 4.2: sichqoncha ishorasi (nuqta) — eng ustun maqsad
    const hp = HINT.active(t);
    if (hp && hp.kind === 'point') {
      const d = hyp(hp.x - me.x, hp.y - me.y);
      if (d < me.r + 55 || (d < 450 && t - hp.t > 1200 && HINT.massAt(hp.x, hp.y) < 1)) { HINT.cur = null; if (g && g.hint) { S.goal = null; g = null; } }
      else {
        hp.ref.d = d;
        S.goal = { x: hp.x, y: hp.y, kind: hp.ref.loot >= 10 ? 'loot' : 'food', until: hp.until, bestD: d, progT: t, ref: hp.ref, hint: true };
        return S.goal;
      }
    } else if (hp && hp.kind === 'snake') {
      // ilon ishorasi: hujum/o'rash boshlanmaguncha nishon boshining oldinroq yon qanotiga boramiz (uzoq bo'lsa — boost bilan)
      const tr = TR.get(hp.id);
      if (!tr || tr.dead) HINT.cur = null;
      const hu = HINT.cur && !ATK.cur && !COIL.cur ? huntPoint(env) : null;
      if (hu && hu.id === hp.id) {
        const d = hyp(hu.x - me.x, hu.y - me.y);
        S.goal = { x: hu.x, y: hu.y, kind: tr.sct <= 1.15 * me.sct && t - hp.t < CFG.hintBoostMs && tr.d > 350 && d > 140 ? 'loot' : 'food', until: hp.until, bestD: d, progT: t, hint: true, snake: true,
                   ref: { x: hu.x, y: hu.y, d, loot: 12, crowd: 0, rival: 9, winB: true, contested: false, macro: 0, mass: 0 } };
        return S.goal;
      }
      if (g && g.hint) { S.goal = null; g = null; }
    } else if (g && g.hint) { S.goal = null; g = null; }
    // 4.2: uzoqdagi yirik o'ljaga yugurish (yaqinlashgach odatiy o'lja mantig'iga o'tadi)
    if (g && g.rush) {
      const d = hyp(g.x - me.x, g.y - me.y);
      if (d < g.bestD - 15) { g.bestD = d; g.progT = t; }
      if (d > 820 && t < g.until && t - g.progT < 1500 && S.dangerLvl < 2 && !(best && best.loot >= 14 && best.d < 600)) { g.ref.d = d; return g; }
      S.goal = null; g = null;
    }
    if (!g || g.kind !== 'loot') {
      const r = lootRush(env);
      if (r && !(best && best.loot >= 14 && best.d < 600)) {
        S.goal = { x: r.x, y: r.y, kind: 'loot', rush: true, until: t + 9000, bestD: r.d, progT: t,
                   ref: { x: r.x, y: r.y, d: r.d, loot: 30, crowd: 0, rival: 9, winB: true, contested: false, macro: r.z.sct, mass: r.z.sct } };
        S.rushN++;
        LOG.ev(2, 'loot_rush', { id: r.z.id, sct: r.z.sct, d: r0(r.d), crowd: r.crowd, val: r1(r.val) });
        return S.goal;
      }
    }
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
    if (env.t < S.calmUntil && lvl < S.dangerLvl) { S.dangerLvl = lvl; S.dangerCalm = env.t; S.closeBoostEnd = 0; S.breakEnd = env.t - 1; }
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
    // 4.2: zich o'lja ustida (yangi o'lim yoki raqib yaqin) boost bilan "supurish" — boshqalardan oldin yeyish
    const sweepOk = () => {
      if (mode !== 'LOOT' || CFG.sweepHv <= 0 || me.sct < CFG.boostMinSct || !sel.safe || Math.abs(selDelta) > 0.9 || (env.nb && env.nb.d < 40)) return false;
      if (!(DEATH.hot(t) || (env.heads.length && env.heads[0].d < 1200))) return false;
      const rs = sel.boost ? sel : simulate(env, selDelta, true, S.steer, S.simOpt ? Object.assign({}, S.simOpt, { isDelta: true }) : { isDelta: true });
      return rs.safe && rs.gap >= 6 && harvestAlongRay(rs, me, S.foods) >= CFG.sweepHv;
    };
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
             env.heads[0] && env.heads[0].d - env.heads[0].rs < 220 && Math.abs(selDelta) < 0.80 &&
             !(CFG.breakDirChk && env.heads[0].sct > 1.2 * me.sct && Math.abs(dAng(Math.atan2(env.heads[0].y - me.y, env.heads[0].x - me.x), sel.aim)) < 0.9)) {      // 4.4: bosh oldinda bo'lsa boost unga yaqinlashtiradi
      if (t > S.breakEnd + 2200) S.breakEnd = t + 1100;
      if (t <= S.breakEnd) { want = true; why = 'aloqani uzish'; }
    }
    else if (mode === 'LOOT' && gRef && me.sct >= CFG.boostMinSct && gRef.loot >= 10 && gRef.crowd < 6 &&
             Math.abs(selDelta) < 0.85 && (!env.nb || env.nb.d > 45) &&
             ((gRef.d > 95 && (gRef.winB || gRef.loot >= 15)) || (gRef.rival < 1.5 && gRef.d > 50))) {
      want = true; why = S.goal && S.goal.hint ? 'ishora' : S.goal && S.goal.rush ? 'o\'ljaga yugurish' : gRef.contested || gRef.rival < 2.0 ? 'ozuqa poygasi' : 'o\'lim ozuqasi';
    }
    else if (sweepOk()) {
      want = true; why = 'o\'lja supurish';
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
      const dtS = S.tickEma / 1000, tight = S.sel && (!S.sel.safe || S.sel.gap < 12);
      if (c.phase === 'SQUEEZE') c.R = tight ? Math.min(Math.max(c.R0, Rfloor), c.R + 35 * dtS) : Math.max(Rfloor, c.R - 55 * dtS);
      c.wh.push({ t, W }); while (c.wh.length && t - c.wh[0].t > 1000) c.wh.shift();
      while (this.bLog.length && t - this.bLog[0] > 60000) this.bLog.shift();
      this.wantBoost = c.phase === 'WRAP' && W < 1.60 * Math.PI && h.d - h.rs > 110 && me.sct >= c.sct0 * 0.92 && me.sct >= 18 &&
                       this.bLog.length * S.tickEma < 8000;
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
      if (c.phase === 'COMMIT') return { id: c.id, ht: c.fails > 0 ? CFG.headHardT : clamp((c.thAbs - t) / 1000, 0.05, CFG.headHardT), uK: 0, cut: true };
      if (c.phase === 'EXIT') return c.tb && t - c.crossT >= CFG.exitSoftMs ? null : { id: c.id, ht: 0.45, uK: 0, cut: true };      // 4.3: boostdagi nishon — 0.35 s dan keyin to'liq ehtiyotkor model
      if (c.phase === 'RACE') return { id: c.id, ht: 0.45, uK: 0, cut: true };
    }
    if (ATK.exact && t < ATK.exact.until) return { id: ATK.exact.id, ht: CFG.headHardT, uK: 0, cut: true };
    if (COIL.cur) return { id: COIL.cur.id, ht: 0.45, uK: 0.5 };
    return null;
  }

  // Oldingi buyruqning QOLGAN burilishi: 3.2 eskirgan to'liq deltani ishlatardi (har tickda ~0.15 rad ortiqcha burilishga moyillik)
  function cmdRemNow(me) {
    const cd = S.cmdDelta || 0;
    let rem = S.cmdAng == null ? cd : cd - dAng(me.ang, S.cmdAng);
    if (cd === 0 || rem * cd <= 0) rem = 0; else if (Math.abs(rem) > Math.abs(cd)) rem = cd;
    S.cmdRem = rem;
  }

  function decide(env) {
    const t = env.t, me = env.me;
    cmdRemNow(me);
    // 4.0: qamal ham, yuqori xavf ham, halqa ham bo'lmaganda qamal xaritasi 10 Hz da yangilanadi (aks holda har tickda)
    const pt = S.trap;
    const calm = !!pt && pt.t0 != null && t - pt.t0 < (S.q === 0 ? 160 : 135) && pt.level === 0 && S.trapLvl === 0 && S.dangerLvl < 2 && !(S.ring && S.ring.lvl) &&
                 !(ATK.cur && ATK.cur.counter);
    const trap = calm ? pt : buildTrap(env); S.trap = trap;
    if (!calm) trap.t0 = t;
    if (!calm && trap.level === 2) {
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
    // 4.0: ozuqa xaritasi tinch holatda 10 Hz, o'lja yaqinida 20 Hz; o'lim hodisasi (S.foodsT = 0) darhol yangilaydi
    const fdt = S.q === 0 ? 140 : (S.goal && S.goal.kind === 'loot' && hyp(S.goal.x - me.x, S.goal.y - me.y) < 420) ? 45 : 95;
    if (!S.foodsT || t - S.foodsT >= fdt || !S.goal) { S.foods = foodTargets(env, trap); S.foodsT = t; }
    const foods = S.foods;
    const goal = pickGoal(env, foods);
    ATK.update(env); COIL.update(env);
    const hintId = HINT.snakeId(t), hintH = hintId != null ? env.heads.find(x => x.id === hintId) : null;
    if (hintH && S.hunt && !ATK.cur && !COIL.cur && S.dangerLvl < 2 && S.trapLvl === 0) COIL.start(env, hintH, 'ishora', true);
    S.threat = null;
    {
      const vN = me.spN * PHY.k;
      const vMe = me.sp * PHY.k;
      for (const h of env.heads) {
        const gap = h.d - h.rs, hv = Math.max(h.v, h.vT || 0);
        if (gap > (CFG.threatT > 0 ? CFG.threatMaxGap : CFG.closeHeadGap)) break;
        if (hv <= 1.25 * vN) continue;                                   // faqat boostdagi bosh
        const c = ATK.cur, isTgt = !!(c && c.id === h.id && c.phase !== 'EXIT');       // hujum davomida nishon uchun avvalgi (135 birlik) qoida
        // 4.3: 0.25 s oldingi yo'nalish (burilib kelayotgan bosh) va yetib kelish vaqti hisobga olinadi
        const dir = Math.atan2(me.y - h.y, me.x - h.x), ha = h.ang + clamp(h.w, -3, 3) * 0.25;
        const cl0 = Math.cos(h.ang - dir), cl = Math.max(cl0, Math.cos(ha - dir));
        const vc = hv * cl - vMe * Math.cos(me.ang - dir);
        if ((gap < 135 && cl0 > 0.35) || (CFG.threatT > 0 && !isTgt && cl > 0.35 && vc > 0 && gap / vc < CFG.threatT)) { S.threat = { id: h.id, x: h.x, y: h.y, gap }; break; }
      }
      if (S.threat && (!S.threatLog || t - S.threatLog > 3000)) { S.threatLog = t; LOG.ev(2, 'close_head', { id: S.threat.id, gap: r0(S.threat.gap) }); }
    }
    if (!S.threat && hintH && hintH.sct > 0.9 * me.sct && hintH.d - hintH.rs < 420 && !(ATK.cur && ATK.cur.id === hintId) &&
        Math.cos(hintH.ang - Math.atan2(me.y - hintH.y, me.x - hintH.x)) > 0.3) S.threat = { id: hintH.id, x: hintH.x, y: hintH.y, gap: hintH.d - hintH.rs, hint: true };
    S.simOpt = simOptNow(t);
    const A = (p) => p ? Math.atan2(p.y - me.y, p.x - me.x) : null;
    const topFoodAngles = foods.slice(0, 4).map(f => Math.atan2(f.y - me.y, f.x - me.x));
    const specials = () => [me.ang, S.cmd, A(goal), ...topFoodAngles, trap.exit && trap.exit.a, trap.nexit && trap.nexit.a, A(S.escape),
                            ATK.cur && ATK.cur.aim, ATK.cur && ATK.cur.exitDir,
                            COIL.cur ? COIL.desired(env) : null, ring.lvl ? A({ x: ring.ex, y: ring.ey }) : null, trap.center ? A(trap.center) : null,
                            S.threat ? Math.atan2(me.y - S.threat.y, me.x - S.threat.x) : null,
                            t < S.loopUntil ? A(S.loopGoal) : null];
    let rays = evalRays(env, specials(), S.steer, RAYS_Q[S.q]);
    const curOpt = S.simOpt ? Object.assign({}, S.simOpt, { isDelta: true }) : { isDelta: true };
    const cur = simulate(env, S.cmdRem || 0, S.boost, S.steer, curOpt);
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

    if (mode === 'ATTACK' && ATK.cur && ATK.cur.phase === 'EXIT' && (S.dangerLvl >= 2 || (S.threat && CFG.exitVcK > 0)) && !ATK.cur.counter) { ATK.end(t, 'xavf (chiqishda)'); mode = 'EVADE'; }
    const optKey = o => o ? o.id + ':' + o.uK + ':' + !!o.cut : '';
    const opt2 = simOptNow(t);
    if (optKey(opt2) !== optKey(S.simOpt)) { S.simOpt = opt2; rays = evalRays(env, specials(), S.steer, RAYS_Q[S.q]); }
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
        if (S.simOpt) { S.simOpt = simOptNow(t); rays = evalRays(env, specials(), S.steer, RAYS_Q[S.q]); }
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
      else g = goal || S.huntPt || (CFG.centerPull > 0 && env.arena && hyp(me.x - env.arena.cx, me.y - env.arena.cy) > env.arena.R * 0.5 ? { x: env.arena.cx, y: env.arena.cy } : null);
      let bs = -Infinity;
      for (const r of rays) { const sc = scoreRay(r, me, w, g, S.cmd, trap, exitDir); if (sc > bs) { bs = sc; sel = r; } }
      // 4.0: aniqlik bosqichi — eng yaxshi nur atrofida yarim va chorak qadamli 4 ta qo'shimcha nur
      if (CFG.refine && S.q >= 2 && S.planEma < 8 && S.fps >= 44 && sel) {
        const st = 2 * 2.85 / RAYS_Q[S.q], d0 = sel.delta, ro = S.simOpt ? Object.assign({}, S.simOpt, { isDelta: true }) : { isDelta: true };
        for (const f of REFINE) {
          const d = clamp(d0 + f * st, -2.90, 2.90); if (d === d0) continue;
          const r = simulate(env, d, false, S.steer, ro), sc = scoreRay(r, me, w, g, S.cmd, trap, exitDir);
          rays.push(r);
          if (sc > bs) { bs = sc; sel = r; }
        }
      }
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
    if ((mode === 'EVADE' || mode === 'ESCAPE') && Math.abs(finalDelta) > 0.45) {
      const sg = Math.sign(finalDelta);
      if (sg !== S.turnSide || t >= S.turnHold) { S.turnSide = sg; S.turnHold = t + CFG.turnHoldMs; }
    } else if (t >= S.turnHold) S.turnSide = 0;
    LAT.cmd(t, finalDelta);
    S.sel = sel; S.cmd = sel.aim; S.cmdDelta = finalDelta; S.cmdAng = me.ang; S.steer = steerFromDelta(me.ang, finalDelta); S.target = target; S.rays = rays; S.cur = cur;
    const k = Math.round(0.5 / CFG.dt), kk = sel.n != null && sel.n < k ? sel.n : k;
    PHY.expect(t + k * CFG.dt * 1000, sel.path[2 * kk], sel.path[2 * kk + 1], S.steer, sel.boost);
  }

  function mouseAngle() { return Math.atan2(S.mouseY - num(W.hh, innerHeight) / 2, S.mouseX - num(W.ww, innerWidth) / 2); }
  function assist(env) {
    const t = env.t, me = env.me;
    S.simOpt = null;
    cmdRemNow(me);
    if (!S.dodge) { if (S.owns) release(); setMode('MANUAL', t); return; }
    const ua = mouseAngle(), user = simulate(env, dAng(ua, me.ang), false, null, { isDelta: true });
    if (!user.safe || user.gap < 5) S.userSafeSince = 0; else if (!S.userSafeSince) S.userSafeSince = t;
    const take = !user.safe || user.gap < 5 || (S.owns && t - S.userSafeSince < 400);
    if (!take) { if (S.owns) release(); S.sel = user; setMode('MANUAL', t); return; }
    const rays = evalRays(env, [ua, me.ang, S.cmd], S.steer, RAYS_Q[S.q]);
    const goal = { x: me.x + Math.cos(ua) * 500, y: me.y + Math.sin(ua) * 500 };
    let sel = null, bs = -Infinity;
    for (const r of rays) { const s = scoreRay(r, me, WEIGHTS.ASSIST, goal, S.cmd, null, null); if (s > bs) { bs = s; sel = r; } }
    const finalDelta = sel.delta != null ? sel.delta : dAng(sel.aim, me.ang);
    S.owns = true; S.sel = sel; S.cmd = sel.aim; S.cmdDelta = finalDelta; S.cmdAng = me.ang; S.steer = steerFromDelta(me.ang, finalDelta); S.boost = false; S.rays = rays; S.target = ua;
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
    S.owns = false; S.boost = false; S.turnSide = 0; S.cmdDelta = 0; S.cmdRem = 0;
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
    HINT.cur = null; HINT.n = 0; MAINT.run(t, true);
    LAT.reset();
    S.jank50 = 0; S.jank120 = 0; S.gapMax = 0; S.heap0 = 0; S.heapMax = 0; S.rushN = 0; S.huntT = null; S.huntPt = null; S.turnSide = 0; S.turnHold = 0;
    Object.assign(S, { goal: null, foods: [], nearOrbs: [], foodsT: 0, trail: [], loopUntil: 0, loopGoal: null, loopBreaks: 0, escape: null, dangerLvl: 0, dangerCalm: t,
                       trapLvl: 0, trapCalm: t, cmd: null, cmdDelta: 0, cmdRem: 0, cmdAng: null, steer: null, turnSide: 0, turnSideT: 0, boost: false, boostWhy: '', sel: null,
                       planMs: 0, scanEma: 0, worldEma: 0, aiEma: 0, radarEma: 0, planSum: 0, planN: 0, planMax: 0, slow: 0, slowRun: 0,
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
    S.tickEma += 0.1 * (Math.min(gap, 150) - S.tickEma);
    const s = W.slither;
    const alive = okObj(s) && !s.dead && !(num(s.dead_amt) > 0) && W.playing !== false;
    gameWatch(s, alive, t);
    if (!alive) { if (S.owns) release(); S.env = null; S.sel = null; S.mode = 'WAIT'; return; }
    if (S.game !== s) newGame(s, t);
    // Pause and passive manual mode should consume virtually no CPU.
    if (S.paused || (!S.auto && !S.dodge)) {
      if (S.owns) release();
      setMode(S.paused ? 'PAUSE' : 'MANUAL', t);
      return;
    }
    const t0 = now();
    FOOD.scan(t);
    const tScan = now();
    const env = readWorld(t, s); S.env = env;
    const tWorld = now();
    COLL.observe(env.nb, t);
    DEATH.update(t, env.me);
    PHY.observe(env.me, t, S.owns ? S.steer : Math.atan2(num(W.ym), num(W.xm)));
    LAT.obs(t, env.me.ang);
    PHY.check(env.me, t, S.owns ? S.steer : null, S.boost);
    if (S.paused) { if (S.owns) release(); setMode('PAUSE', t); }
    else if (!S.auto) assist(env);
    else { decide(env); S.owns = true; }
    if (S.owns) apply();
    const tAI = now();
    S.scanEma += 0.10 * ((tScan - t0) - S.scanEma);
    S.worldEma += 0.10 * ((tWorld - tScan) - S.worldEma);
    S.aiEma += 0.10 * ((tAI - tWorld) - S.aiEma);
    if (S.owns && S.steer != null) CMDH.push(t, S.steer); else CMDH.reset();
    S.planMs = now() - t0;
    if (S.planMs > CFG.planBudgetMs) { S.slow++; S.slowRun++; } else S.slowRun = 0;
    S.planEma += 0.12 * (S.planMs - S.planEma);
    // 4.0: sifat boshqaruvchisi — rejalashtirish qimmatlashsa nurlar soni kamayadi (o'yin qotmasligi uchun), arzonlashsa tiklanadi
    if (S.q > 0 && (S.planEma > (S.q === 2 ? 5 : 10) || S.slowRun > 2)) { S.q--; S.qT = t; }
    else if (S.q < S.maxQ && t - S.qT > 4000 && S.planEma < (S.q === 1 ? 2.5 : 5)) { S.q++; S.qT = t; }
    S.planSum += S.planMs; S.planN++; S.planMax = Math.max(S.planMax, S.planMs);
    const d = LOG.d;
    if (d && d.state === 'recording') {
      const dt = Math.min(gap, 200);
      d.modeMs[S.mode] = (d.modeMs[S.mode] || 0) + dt;
      if (S.owns && S.boost) d.boostMs[S.boostWhy || '?'] = (d.boostMs[S.boostWhy || '?'] || 0) + dt;
      if (env.me.sct > d.maxSct) d.maxSct = env.me.sct;
    }
    if (LOG.q.length || t - LOG.lastSampleT >= 100) {
      S.lastRow = LOG.mkRow(env);
      LOG.flush(S.lastRow);
      LOG.sample(t, S.lastRow);
    }
  }

  /* ================= 15. Holat ================= */
  const S = {
    auto: true, hunt: true, dodge: true, radar: true, paused: false, zoom: CFG.zoom,
    mode: 'WAIT', modeSince: 0, owns: false, cmd: null, cmdDelta: 0, cmdRem: 0, cmdAng: null, steer: null, turnSide: 0, boost: false, boostWhy: '', boostSince: 0, target: null,
    dangerLvl: 0, dangerCalm: 0, dangerRaw: 0, trapLvl: 0, trapCalm: 0, trap: null, closedLogged: false,
    goal: null, foods: [], nearOrbs: [], trail: [], loopUntil: 0, loopGoal: null, loopBreaks: 0, escape: null,
    sel: null, cur: null, rays: [], env: null, game: null, userSafeSince: 0,
    planMs: 0, scanEma: 0, worldEma: 0, aiEma: 0, radarEma: 0, planSum: 0, planN: 0, planMax: 0, slow: 0, slowRun: 0, errors: 0, planEma: 0, q: 1, maxQ: 2, qT: 0, fps: 60, tickEma: 50, turnHold: 0, huntT: null, huntPt: null, info: false,
    jank50: 0, jank120: 0, gapMax: 0, heap0: 0, heapMax: 0, heapNow: 0, rushN: 0,
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
        kind: c.kind, aim: r2(c.aim), cx: r0(c.cx), cy: r0(c.cy), plan: (k === 'start' || k === 'race' || k === 'counter') ? c.plan : undefined,
        dbg: (k === 'abort' || k === 'lock') ? c.dbg : undefined } });
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
      if (S.env) { try { S.lastRow = this.mkRow(S.env); } catch (e) {} }      // oxirgi tick holati
      this.flush(S.lastRow);
      d.state = 'finished'; d.reason = reason; d.duration = this.rel(now());
      d.events.push({ t: d.duration, ty: 'end', p: 3, d: { reason }, r: S.lastRow });
      let hz = S.lastHaz; try { if (S.env) hz = hazards(S.env); } catch (e) {}
      d.final = { lastRow: S.lastRow, hazards: hz };
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
    sizeStr() {       // HUD uchun: yozish paytida logni stringify qilmasdan
      const d = this.d;
      if (d && d.state === 'recording') return (d.events.length + d.attacks.length + d.deaths.length) + ' yozuv';
      return this.saved ? kb(this.saved) : '—';
    },
    text() {
      const d = this.d;
      if (!d) return this.saved || W.SENTINEL_LAST_LOG || (() => { try { return localStorage.getItem(LS_KEY); } catch (e) { return null; } })() ||
        '{"format":"sentinel-log@3","state":"waiting"}';
      if (d.state === 'finished' && this.saved) return this.saved;
      if (d.state === 'recording') { d.stats = statsNow(); d.duration = this.rel(now()); }
      let out = JSON.stringify(d), guard = 0;
      while (out.length > this.budget && guard++ < 60) {
        // 4.0: har bir tashlangan yozuvdan keyin butun logni qayta stringify qilmaslik uchun ortiqcha hajmga mos to'plam bilan qisqartiriladi
        let n = Math.max(1, Math.ceil((out.length - this.budget) / 450)), did = false;
        while (n-- > 0 && (this.dropOne(1) || (d.last.length > 30 && d.last.shift()) || this.dropOne(2) ||
               (d.attacks.length > 12 && d.attacks.shift()) || (d.deaths.length > 8 && d.deaths.shift()))) did = true;
        if (!did) break;
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
      net: { latMs: r0(LAT.v * 1000), usedMs: r0(LAT.cur() * 1000), n: LAT.n, maxMs: r0(LAT.max * 1000) },
      physics: { k: r1(PHY.k), omegaN: r2(PHY.wN), omegaB: r2(PHY.wB), scRef: r2(PHY.scRef), accUp: r1(PHY.accUp), accDown: r1(PHY.accDown), n: PHY.n,
                 predErr05s: PHY.errStats(), note: 'k: siljish/s ÷ sp; omega: rad/s; predErr: 0.5 s bashorat xatosi (birlik)' },
      plan: { meanMs: S.planN ? r2(S.planSum / S.planN) : null, maxMs: r1(S.planMax), slowTicks: S.slow, ticks: S.planN, ema: r2(S.planEma), q: S.q, fps: r0(S.fps), tickMs: r0(S.tickEma), gfx: GFX.on },
      jank: { f50: S.jank50, f120: S.jank120, maxMs: r0(S.gapMax), heapMB: [r0(S.heap0), r0(S.heapMax), r0(S.heapNow)], maint: MAINT.n },
      ux: { hints: HINT.n, rush: S.rushN },
      errors: S.errors, zoom: { value: r2(S.zoom), status: ZOOM.msg }, arena: { grd: num(W.grd, null), flux: num(W.flux_grd, null), modelBad: arenaBad },
      cfg: { rays: RAYS_Q[S.q], leadU: CFG.leadU, noReturn: CFG.noReturn, cutTrail: CFG.cutTrail, attackGain: CFG.attackGain, horizon: CFG.horizon, safeT: CFG.safeT, rScale: CFG.rScale, selfR: CFG.selfR, margin: CFG.margin, attackMinSct: CFG.attackMinSct,
             attackMaxD: CFG.attackMaxD, coilMinL: CFG.coilMinL, coilRatio: CFG.coilRatio, raceMinSct: CFG.raceMinSct, ringWarn: r2(CFG.ringWarn), ringUrgent: r2(CFG.ringUrgent) },
    };
  }

  /* ================= 17. Zoom ================= */
  const ZOOM = {
    ok: false, userT: -1e9, lowN: 0, msg: 'tekshirilmagan', orig: { redraw: W.redraw, gsc: W.gsc, sgsc: W.sgsc }, patched: null,
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
    set(z, auto) { S.zoom = clamp(z, CFG.zoomMin, CFG.zoomMax); W.__SENTINEL_ZOOM__ = S.zoom; if (!auto) this.userT = now(); },
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
  // 4.2: ixcham panel — bitta qator ikonka-holat; tugmalar sichqoncha panel ustiga kelganda ochiladi; I — batafsil matn
  hud.style.cssText = 'position:fixed;left:6px;top:6px;z-index:2147483647;background:#081321c4;color:#dff9f7;border:1px solid #28dcb380;border-radius:8px;' +
    'padding:2px 5px;font:11px/1.3 "Segoe UI Emoji","Noto Color Emoji","Apple Color Emoji",system-ui,sans-serif;box-shadow:0 2px 8px #0006;user-select:none;opacity:.85';
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2147483646';
  const mkRow = () => { const d = document.createElement('div'); d.style.cssText = 'display:flex;align-items:center;gap:3px;white-space:nowrap;min-height:16px'; return d; };
  const stat = mkRow(), btns = mkRow();
  btns.style.marginTop = '2px';
  const mkSp = css => { const e = document.createElement('span'); if (css) e.style.cssText = css; stat.appendChild(e); return e; };
  const elMode = mkSp('font-size:13px'), elAtk = mkSp(), elBoost = mkSp(), elHint = mkSp(), elKill = mkSp('font:10px monospace;color:#ffd36b'), elFps = mkSp('font:10px monospace;margin-left:2px'), elLat = mkSp('font:10px monospace;color:#ff7070');
  const msgEl = document.createElement('div'); msgEl.style.cssText = 'display:none;color:#ffd36b;font:10px/1.3 system-ui,sans-serif;max-width:230px;white-space:normal';
  const info = document.createElement('div'); info.style.cssText = 'display:none;white-space:pre;font:10px/1.35 monospace;margin-top:3px';
  const area = document.createElement('textarea');
  area.readOnly = true; area.style.cssText = 'display:none;width:230px;height:70px;margin-top:4px;font:10px monospace';
  hud.append(stat, btns, msgEl, info, area);
  const UI = { msgT: 0, msg(t) { msgEl.textContent = t; msgEl.style.display = t ? 'block' : 'none'; this.msgT = t ? now() : 0; } };

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
  // G: yengil grafika — o'yinning o'z sifat sozlamalarini pasaytiradi (soya/yaltirash o'chadi). Faqat mavjud bo'lsa tegiladi.
  const GFX = {
    on: false, orig: null, lowN: 0, tried: false,
    toggle(auto) {
      this.tried = true;
      if (this.on) { this.restore(); UI.msg('Grafika asl holiga qaytdi'); return; }
      const has = ['high_quality', 'want_quality', 'render_mode'].filter(k => typeof W[k] !== 'undefined');
      if (!has.length) { UI.msg(auto ? 'FPS past: X bilan yaqinlashtiring yoki R bilan radarni o\'chiring' : 'Yengil grafika: bu o\'yin versiyasida sozlama topilmadi'); return; }
      this.orig = {};
      try {
        for (const k of has) this.orig[k] = W[k];
        if ('high_quality' in this.orig) W.high_quality = false;
        if ('want_quality' in this.orig) W.want_quality = 0;
        if (this.orig.render_mode === 2) W.render_mode = 1;
      } catch (e) {}
      this.on = true; UI.msg(auto ? 'FPS past — yengil grafika avtomatik yoqildi (G — qaytarish)' : 'Yengil grafika yoqildi (G — qaytarish)');
    },
    restore() {
      if (this.orig) { try { for (const k in this.orig) W[k] = this.orig[k]; } catch (e) {} }
      this.orig = null; this.on = false;
    },
  };
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
    g: () => GFX.toggle(),
    i: () => { S.info = !S.info; info.style.display = S.info ? 'block' : 'none'; },
    z: () => ZOOM.set(S.zoom * 0.85), x: () => ZOOM.set(S.zoom / 0.85), c: () => ZOOM.set(CFG.zoom),
    escape: togglePause,
  };
  const BT = {};
  const btn = (key, icon, tip, fn) => {
    const b = document.createElement('span'); b.textContent = icon; b.title = tip;
    b.style.cssText = 'cursor:pointer;width:17px;height:17px;line-height:17px;text-align:center;border-radius:4px;font-size:11px;background:#ffffff16';
    on(b, 'click', e => { e.stopPropagation(); fn(); hudUpdate(); }); btns.appendChild(b); BT[key] = b;
  };
  btn('t', '🤖', 'Bot yoqish / o\'chirish (T)', ACT.t); btn('h', '⚔️', 'Hujum (H)', ACT.h); btn('d', '🛡️', 'Qo\'lda o\'ynaganda avtomatik himoya (D)', ACT.d);
  btn('r', '📡', 'Radar chiziqlari (R)', ACT.r); btn('g', '✨', 'Yengil grafika (G)', ACT.g);
  btn('z', '➖', 'Zoom: uzoqlashtirish (Z)', ACT.z); btn('x', '➕', 'Zoom: yaqinlashtirish (X)', ACT.x);
  btn('p', '⏸️', 'Pauza (Esc)', ACT.escape); btn('i', 'ℹ️', 'Batafsil ma\'lumot (I)', ACT.i); btn('l', '📋', 'Logni nusxalash', copyLog); btn('q', '✖️', 'Botni o\'chirish', () => stop());
  const setOn = (b, v) => { b.style.opacity = v ? '1' : '.38'; };
  // tugmalar faqat sichqoncha panel ustida turganda ko'rinadi (o'rnatilgandan keyin 6 s ochiq turadi)
  let btnHideT = now() + 6000;
  on(hud, 'mouseenter', () => { btns.style.display = 'flex'; btnHideT = 0; });
  on(hud, 'mouseleave', () => { btnHideT = now() + 900; });
  document.body.appendChild(canvas); document.body.appendChild(hud);
  const ctx = canvas.getContext('2d');
  const resize = () => { canvas.width = innerWidth; canvas.height = innerHeight; };
  resize(); on(W, 'resize', resize);

  const editable = e => e.target && e.target.closest && e.target.closest('input,textarea,select,[contenteditable="true"]');
  const inHud = e => e.target && hud.contains(e.target);
  on(W, 'mousemove', e => { S.mouseX = e.clientX; S.mouseY = e.clientY; if (S.owns && !inHud(e)) e.stopImmediatePropagation(); }, true);
  for (const ty of ['mousedown', 'mouseup', 'pointerdown', 'pointerup']) {
    on(W, ty, e => {
      if (!S.owns || inHud(e)) return;
      // pointerdown bekor qilingach brauzer mousedown yubormaydi — shuning uchun ikkalasidan birinchisi ishlatiladi
      if ((ty === 'pointerdown' || ty === 'mousedown') && e.button === 0 && !S.paused && now() - HINT.lastT > 120) {
        HINT.lastT = now();
        try { HINT.click(e.clientX, e.clientY); } catch (er) { console.warn('[Sentinel] ishora', er); }
      }
      e.preventDefault(); e.stopImmediatePropagation();
    }, true);
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

  let drawn = false;
  function draw() {
    const env = S.env;
    if (!S.radar || !env || S.paused) { if (drawn) { ctx.clearRect(0, 0, canvas.width, canvas.height); drawn = false; } return; }
    ctx.clearRect(0, 0, canvas.width, canvas.height); drawn = true;
    // 4.0: ekran o'zgartirishi kadr boshida bir marta hisoblanadi; nuqta-obyektlar yaratilmaydi, nurlar 2 ta yo'lga jamlanadi
    const mw = num(W.mww, innerWidth), mh = num(W.mhh, innerHeight), g = num(W.gsc, 1), me = env.me;
    const kx = g * innerWidth / mw, ky = g * innerHeight / mh;
    const ox = num(W.mww2, mw / 2) * innerWidth / mw - num(W.view_xx, me.x) * kx, oy = num(W.mhh2, mh / 2) * innerHeight / mh - num(W.view_yy, me.y) * ky;
    const trace = (P, n) => { const e = n != null ? 2 * n + 2 : P.length; ctx.moveTo(P[0] * kx + ox, P[1] * ky + oy); for (let i = 2; i < e; i += 2) ctx.lineTo(P[i] * kx + ox, P[i + 1] * ky + oy); };
    const dot = (x, y, r, col) => { ctx.beginPath(); ctx.arc(x * kx + ox, y * ky + oy, r, 0, TAU); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke(); };
    const rays = S.q >= 1 && S.fps >= 40 ? S.rays : [];        // past sifat yoki past FPS da faqat tanlangan yo'l chiziladi
    ctx.lineWidth = 1;
    ctx.beginPath(); for (let i = 0; i < rays.length; i += 3) if (rays[i].safe) trace(rays[i].path, rays[i].n); ctx.strokeStyle = '#20bda433'; ctx.stroke();
    ctx.beginPath(); for (let i = 0; i < rays.length; i += 3) if (!rays[i].safe) trace(rays[i].path, rays[i].n); ctx.strokeStyle = '#ff3c4b55'; ctx.stroke();
    ctx.beginPath(); for (let i = 0; i < env.heads.length && i < 5; i++) trace(env.heads[i].pred); ctx.strokeStyle = '#ff8a3d66'; ctx.stroke();
    if (S.sel) { ctx.beginPath(); trace(S.sel.path, S.sel.n); ctx.strokeStyle = S.sel.boost ? '#ffcc44' : '#26f6c1'; ctx.lineWidth = 3; ctx.stroke(); }
    if (S.goal && (S.mode === 'FORAGE' || S.mode === 'LOOT')) dot(S.goal.x, S.goal.y, 10, S.goal.kind === 'loot' ? '#ff5cf0' : '#ffda52');
    if (S.escape) dot(S.escape.x, S.escape.y, 14, '#c77dff');
    if (ATK.cur) dot(ATK.cur.cx, ATK.cur.cy, 12, '#ff6b2c');
    if (COIL.cur) { const h = env.heads.find(x => x.id === COIL.cur.id); if (h) dot(h.x, h.y, 18, '#ff2cdf'); }
    if (S.ring && S.ring.lvl) dot(S.ring.gx, S.ring.gy, 22, S.ring.lvl === 2 ? '#ff2020' : '#ffa020');
    const hp = HINT.cur;
    if (hp) { const ht = hp.kind === 'snake' ? TR.get(hp.id) : null; if (ht) dot(ht.x, ht.y, 22, '#00e5ff'); else if (hp.kind === 'point') dot(hp.x, hp.y, 13, '#00e5ff'); }
  }

  const kb = s => (s.length / 1024).toFixed(1) + ' KB';
  /* 4.2: muntazam tozalash — bufer hovuzlari oxirgi ehtiyojgacha qisqartiriladi, muddati o'tgan yozuvlar o'chiriladi
     (har 20 s va har yangi o'yinda). Xotira hajmi logga yoziladi. */
  const MAINT = {
    last: 0, n: 0,
    tick(tn) {
      if (tn - this.last < 20000) return;
      this.last = tn; this.run(S.env ? S.env.t : tn, false);
    },
    run(t, hard) {
      this.n++;
      const keepK = hard ? 64 : Math.max(96, KC.n + 64), keepH = hard ? 16 : HPOOL.n + 8;
      if (KC.pool.length > keepK) KC.pool.length = keepK;
      if (HPOOL.a.length > keepH) HPOOL.a.length = keepH;
      for (const [id, u] of ATK.cool) if (u < t) ATK.cool.delete(id);
      for (const [id, u] of COIL.cool) if (u < t) COIL.cool.delete(id);
      if (ATK.failN) for (const [id, f] of ATK.failN) if (t - f.t > 20000) ATK.failN.delete(id);
      for (const [k, v] of RING.logged) if (t - v > 20000) RING.logged.delete(k);
      for (let i = BL.length - 1; i >= 0; i--) if (BL[i].until < t) BL.splice(i, 1);
      const ob = FB.orbs;
      if (ob.x.length > 8192 && ob.n * 4 < ob.x.length) { ob.x = new Float64Array(2048); ob.y = new Float64Array(2048); ob.v = new Float64Array(2048); ob.n = 0; }
      if (GRID.cap > 4096 && GRID.n * 4 < GRID.cap) GRID.shrinkTo = 1024;
      const m = performance.memory;
      if (m && m.usedJSHeapSize) { const mb = m.usedJSHeapSize / 1048576; if (!S.heap0) S.heap0 = mb; if (mb > S.heapMax) S.heapMax = mb; S.heapNow = mb; }
    },
  };

  const MODE_ICON = { FORAGE: '🍏', LOOT: '🍖', ATTACK: '⚔️', COIL: '🌀', EVADE: '🛡️', ESCAPE: '🚪', LOOP: '🔄', MANUAL: '🖱️', ASSIST: '🦺', PAUSE: '⏸️', WAIT: '⏳' };
  function hudUpdate() {
    const tn = now();
    // FPS past: (1) yengil grafika bir marta avtomatik; (2) zoom asta yaqinlashadi (uzoq zoom — o'yin chizishining eng og'ir yuki)
    if (S.env && !S.paused && S.fps < 36) { if (++GFX.lowN >= 16 && CFG.autoGfx && !GFX.on && !GFX.tried) GFX.toggle(true); } else GFX.lowN = 0;
    if (CFG.fpsGuard && ZOOM.ok && S.env && !S.paused && S.fps < 38 && S.zoom < CFG.zoomGuardMax && tn - ZOOM.userT > 12000) {
      if (++ZOOM.lowN >= 10) { ZOOM.lowN = 6; ZOOM.set(Math.min(CFG.zoomGuardMax, S.zoom * 1.1), true); UI.msg('FPS ' + S.fps.toFixed(0) + ' → zoom ' + S.zoom.toFixed(2)); }
    } else ZOOM.lowN = 0;
    MAINT.tick(tn);
    const me = S.env && S.env.me, c = ATK.cur, tr = S.trap, dz = S.paused || !S.auto ? -1 : Math.max(S.dangerLvl, S.trapLvl);
    hud.style.borderColor = dz < 0 ? '#8a98a8' : dz >= 2 ? '#ff4545' : dz === 1 ? '#ffb020' : '#28dcb380';
    elMode.textContent = MODE_ICON[S.mode] || '•';
    elMode.title = 'Sentinel ' + VERSION + ' — ' + (MODE_UZ[S.mode] || S.mode) + ' · xavf ' + S.dangerLvl + ' · qamal ' + S.trapLvl;
    elAtk.textContent = c ? (c.phase === 'RACE' ? '🏁' : c.phase === 'EXIT' ? '↗️' : c.locked ? '🔒' : '🎯') : COIL.cur ? '➰' : '';
    elAtk.title = c ? 'Hujum: ' + c.id + ' · ' + c.phase : COIL.cur ? 'O\'rash: ' + COIL.cur.id + ' · ' + COIL.cur.phase : '';
    elBoost.textContent = S.owns && S.boost ? '⚡' : ''; elBoost.title = 'Boost: ' + (S.boostWhy || '');
    elHint.textContent = HINT.cur ? '📍' : ''; elHint.title = 'Ishora faol';
    elKill.textContent = DEATH.cnt.killLikely ? '☠' + DEATH.cnt.killLikely : ''; elKill.title = 'Ehtimoliy o\'ldirishlar';
    elFps.textContent = S.fps.toFixed(0); elFps.style.color = S.fps < 40 ? '#ff7070' : '#8fe6c8';
    const latMs = LAT.n >= 3 ? Math.max(0, LAT.v - 0.05) * 1000 : null;
    elFps.title = 'FPS · reja ' + S.planEma.toFixed(1) + ' ms · zoom ' + S.zoom.toFixed(2) + (latMs != null ? ' · kechikish ~' + latMs.toFixed(0) + ' ms' : '');
    elLat.textContent = latMs != null && latMs >= 180 ? '📶' + latMs.toFixed(0) : '';
    elLat.title = 'Buyruq → burilish kechikishi (ms) yuqori: bot kech javob beradi. Sahifani yangilab, boshqa serverga ulanib ko\'ring.';
    setOn(BT.t, S.auto && !S.paused); setOn(BT.h, S.hunt); setOn(BT.d, S.dodge); setOn(BT.r, S.radar); setOn(BT.g, GFX.on); setOn(BT.p, S.paused); setOn(BT.i, S.info);
    if (btnHideT && tn > btnHideT) { btnHideT = 0; btns.style.display = 'none'; }
    if (UI.msgT && tn - UI.msgT > 5000) UI.msg('');
    if (S.info) {
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
      'FPS ' + S.fps.toFixed(0) + (S.fps < 38 ? ' (past: G yoki X)' : '') + ' | reja ' + S.planEma.toFixed(1) + ' ms (maks ' + S.planMax.toFixed(1) + ') | sifat ' + (S.q + 1) + '/3 | bashorat xatosi ' + (PHY.errStats().mean ?? '—'),
      'CPU: dunyo ' + S.worldEma.toFixed(1) + ' ms · AI ' + S.aiEma.toFixed(1) + ' ms · radar ' + S.radarEma.toFixed(1) + ' ms',
      'Fizika: k ' + PHY.k.toFixed(1) + ' · ω ' + PHY.wN.toFixed(2) + '/' + PHY.wB.toFixed(2) + ' rad/s · radius −' + COLL.shrink.toFixed(0),
      'O\'lim: kuz. ' + DEATH.cnt.observed + ' · ehtim. ' + DEATH.cnt.probable + ' · kill(ehtim.) ' + DEATH.cnt.killLikely +
        ' · hujum ' + (ATK.stats.started + ATK.stats.races) + '/' + ATK.stats.crossed + ' (qarshi ' + ATK.stats.counter + ') · o\'rash ' + COIL.stats.started,
      'Zoom ' + S.zoom.toFixed(2) + ' · ' + ZOOM.msg,
      'Log: ' + logState + ' · ' + LOG.sizeStr(),
      'T/H/D/R · G grafika' + (GFX.on ? ' (yengil)' : '') + ' · Z/X/C/g\'ildirak · Esc · I',
      ].join('\n');
    }
  }

  /* ================= 19. Asosiy sikl, to'xtatish, API ================= */
  let raf = 0, stopped = false, lastTick = 0, lastHud = 0, lastRadar = 0, lastFrame = 0, errT = [];
  function tickInterval() {
    // Never accelerate when FPS drops: that creates a positive feedback loop.
    const cost = S.planEma, fps = S.fps;
    let ms = cost > 24 || fps < 24 ? 120
           : cost > 14 || fps < 34 ? 95
           : cost > 8 || fps < 45 ? 75 : CFG.tickMs;
    // Shorten under imminent danger while keeping a minimum 55ms frame budget.
    if (S.dangerLvl >= 1 || S.trapLvl >= 1 || S.threat) ms = Math.min(ms, 75);
    return Math.max(ms, CFG.tickMs);
  }
  function loop() {
    if (stopped) return;
    raf = requestAnimationFrame(loop);
    const t = now();
    if (lastFrame) {
      const fd = t - lastFrame;
      if (fd > 0 && fd < 500) S.fps += 0.05 * (1000 / fd - S.fps);
      if (S.env && fd < 3000) { if (fd > 50) S.jank50++; if (fd > 120) S.jank120++; if (fd > S.gapMax) S.gapMax = fd; }      // qotish diagnostikasi (logga yoziladi)
    }
    lastFrame = t;
    let ticked = false;
    try {
      // Fixed adaptive deadline. Low FPS decreases, never increases planning rate.
      if (t - lastTick >= tickInterval()) {
        const gap = t - lastTick; lastTick = t;
        if (gap > 700 && S.owns) { release(); PHY.reset(); }
        tick(t, gap); ticked = true;
      }
      if (S.owns && !S.paused) apply();
      // Full-screen canvas is throttled independently of steering updates.
      if ((!S.radar || S.paused) && drawn) draw();
      else if (S.radar && !S.paused && t - lastRadar >= 1000 / CFG.radarFps) {
        const t0 = now(); draw(); lastRadar = t;
        S.radarEma += 0.10 * ((now() - t0) - S.radarEma);
      }
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
    ZOOM.restore(); GFX.restore();
    try { delete W.__SENTINEL_ZOOM__; } catch (e) { W.__SENTINEL_ZOOM__ = undefined; }
    if (W.__SENTINEL_CLEANUP__ === stop) W.__SENTINEL_CLEANUP__ = undefined;
    api.stopped = true;
    console.info('[Sentinel] o\'chirildi. Oxirgi log: copy(SENTINEL.logText())');
  }
  const api = {
    version: VERSION, stopped: false, stop, copyLog,
    setPerformance(mode) {
      // Low: reduce workload immediately; balanced/high require observed spare CPU.
      if (!['low', 'balanced', 'high'].includes(mode)) throw new Error('low | balanced | high');
      CFG.tickMs = mode === 'low' ? 85 : mode === 'balanced' ? 65 : 55;
      CFG.radarFps = mode === 'low' ? 5 : mode === 'balanced' ? 9 : 12;
      CFG.foodRayCap = mode === 'low' ? 160 : mode === 'balanced' ? 256 : 384;
      S.q = S.maxQ = mode === 'low' ? 0 : mode === 'balanced' ? 1 : 2;
      if (mode === 'low') S.radar = false;
      return this.report();
    },
    logText: () => LOG.text(),
    pause: () => { if (!S.paused) togglePause(); }, resume: () => { if (S.paused) togglePause(); },
    get zoom() { return S.zoom; }, set zoom(v) { if (fin(v)) ZOOM.set(v); },
    report: () => ({ version: VERSION, mode: S.mode, auto: S.auto, hunt: S.hunt, paused: S.paused, danger: S.dangerLvl, trap: S.trapLvl,
                     attack: ATK.cur ? { id: ATK.cur.id, phase: ATK.cur.phase } : null, why: ATK.why, boost: S.boost, boostWhy: S.boostWhy,
                     physics: { k: PHY.k, wN: PHY.wN, wB: PHY.wB }, planMs: S.planMs, planEma: S.planEma,
                     scanMs: S.scanEma, worldMs: S.worldEma, aiMs: S.aiEma, radarMs: S.radarEma,
                     gridSegments: GRID.n, gridCells: GRID.gw * GRID.gh, foodCount: FB.orbs.n,
                     quality: S.q, fps: S.fps, zoom: ZOOM.msg }),
    _t: { CFG, S, PHY, FOOD, DEATH, TR, ATK, LOG, CapGrid, readWorld, buildTrap, simulate, kinPath, crossPaths, evalRays, scoreRay,
          harvestAlongRay, foodTargets, decide, tick, ptSeg, segSeg, segX, release, apply, BL, makeHead, boostDecide, readMe, pickGoal, WEIGHTS,
          HINT, MAINT, KC, HPOOL, GRID, LAT, CMDH, lootRush, huntPoint, hudUpdate,
          COLL, TRO, steerFromDelta, rsOf, COIL, RING, winding, simOptNow, escapeRoute, concPen, setConc: a => { CONC = a.map(concOf); }, ourPts: () => ourPts },
  };
  W.SENTINEL = api;
  W.__SENTINEL_CLEANUP__ = stop;
  ATK.reset(); COIL.reset(); RING.reset();
  ZOOM.install();
  raf = requestAnimationFrame(loop);
  console.info('[Sentinel ' + VERSION + '] tayyor. T: bot · H: hujum · Esc: pauza · Log: copy(SENTINEL.logText())');
})();