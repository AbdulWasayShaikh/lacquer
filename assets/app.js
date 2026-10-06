window.__lq = true;
const root = document.documentElement;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ramp = (p, a, b) => clamp((p - a) / (b - a));
const ease = t => t * t * (3 - 2 * t);
const reduce = matchMedia('(prefers-reduced-motion: reduce)');
const coarse = matchMedia('(pointer: coarse)').matches;

/* nav */
const nav = $('#nav');
const onNav = () => nav.classList.toggle('solid', scrollY > 40);
addEventListener('scroll', onNav, { passive: true }); onNav();

/* reveals */
const io = new IntersectionObserver(es => es.forEach(e => {
  if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
}), { rootMargin: '0px 0px -8% 0px' });
$$('.rv').forEach(el => io.observe(el));

/* before/after: the same car in a second scene, split by screen x */
let ba = null, baVisible = false, baColor = 'obsidian', baBeads = 0, baSplitX = .5, baTried = false;
function loadBA() {
  if (baTried) return; baTried = true;
  import('./scene.js')
    .then(m => m.initScene($('#baGL'), { mode: 'ba', coarse }))
    .then(s => {
      ba = s; s.setColor(baColor, true); s.setSplit(baSplitX); s.setBeads(baBeads);
      for (let k = 0; k < 12; k++) s.render(performance.now());
      $('#ba').classList.add('ready3d');
    })
    .catch(err => { console.warn('before/after 3D unavailable', err); $('#ba').classList.add('nogl'); });
}
new IntersectionObserver(es => { if (es[0].isIntersecting) loadBA(); }, { rootMargin: '700px 0px' }).observe($('#ba'));
const baView = new IntersectionObserver(es => { baVisible = es[0].isIntersecting; }, { threshold: 0 });
baView.observe($('#ba'));

/* smooth scroll: Lenis driven by the GSAP ticker, kept in sync with ScrollTrigger */
let lenis = null;
if (!reduce.matches && window.Lenis && window.gsap && window.ScrollTrigger) {
  try {
    gsap.registerPlugin(ScrollTrigger);
    lenis = new Lenis({ lerp: .1, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  } catch (e) { lenis = null; }
}
$$('a[href^="#"]').forEach(a => a.addEventListener('click', e => {
  const t = document.querySelector(a.getAttribute('href'));
  if (t && lenis) { e.preventDefault(); lenis.scrollTo(t, { offset: -64, duration: 1.6 }); }
}));

/* 3D journey: one progress value 0..1 drives the camera, the paint and the copy */
const J = $('.journey'), beats = $$('.beat'), N = beats.length;
const railFill = $('#railFill'), idxNow = $('#idxNow'), callouts = $$('.callout');
$$('.split').forEach(h => {
  const words = h.textContent.trim().split(/\s+/);
  h.setAttribute('aria-label', words.join(' '));
  h.innerHTML = words.map((w, i) => `<span class="w" aria-hidden="true"><span style="--i:${i}">${w}</span></span>`).join(' ');
});
let target = 0, pp = 0, lastPP = -1, scene = null, journeyVisible = true, counted = false;
const readP = () => { const span = J.offsetHeight - innerHeight; return span > 0 ? clamp((scrollY - J.offsetTop) / span) : 0; };
if (window.ScrollTrigger && lenis) ScrollTrigger.create({ trigger: J, start: 'top top', end: 'bottom bottom', onUpdate: s => { target = s.progress; } });
else addEventListener('scroll', () => { target = readP(); }, { passive: true });
target = pp = readP();
window.__lqSeek = p => {
  const y = J.offsetTop + (J.offsetHeight - innerHeight) * p;
  if (lenis) lenis.scrollTo(y, { immediate: true, force: true }); else scrollTo(0, y);
  target = pp = p;
};
window.__lqState = () => ({ pp, target });

function paintBeats(p) {
  let active = 0;
  beats.forEach((b, i) => {
    const c = i / (N - 1);
    const v = 1 - ramp(Math.abs(p - c), .03, .068);
    b.style.opacity = v.toFixed(3);
    b.style.transform = `translateY(${((1 - v) * 26 * (p < c ? 1 : -1)).toFixed(1)}px)`;
    b.style.visibility = v < .01 ? 'hidden' : 'visible';
    b.classList.toggle('on', v > .5);
    if (v > .5) active = i;
  });
  idxNow.textContent = String(active + 1).padStart(2, '0');
  railFill.style.transform = `scaleY(${p.toFixed(3)})`;
  const co = 1 - ramp(Math.abs(p - 1 / (N - 1)), .03, .068);
  callouts.forEach(c => { c.style.opacity = co.toFixed(3); });
  if (co > .5 && !counted) {
    counted = true;
    $$('[data-count]').forEach(el => {
      const end = +el.dataset.count, o = { v: 0 };
      if (window.gsap) gsap.to(o, { v: end, duration: 1.4, ease: 'power3.out', onUpdate: () => { el.textContent = Math.round(o.v); } });
    });
  }
}

$$('.swatches button').forEach(b => b.addEventListener('click', () => {
  $$('.swatches button').forEach(x => x.setAttribute('aria-checked', x === b ? 'true' : 'false'));
  if (scene) scene.setColor(b.dataset.col);
}));

const loaderEl = $('#loader'), pctEl = $('#loaderPct');
const doneLoading = () => root.classList.add('loaded');
setTimeout(doneLoading, 9000);
if (reduce.matches) { root.classList.add('static'); target = pp = .32; }
import('./scene.js')
  .then(m => m.initScene($('#carGL'), { coarse, onProgress: v => { pctEl.textContent = Math.round(v * 100) + '%'; } }))
  .then(s => {
    scene = s; doneLoading();
    scene.apply(pp); lastPP = pp;
    scene.render(performance.now());
  })
  .catch(err => { console.warn('3D scene unavailable', err); root.classList.add('nogl'); doneLoading(); });
new IntersectionObserver(es => { journeyVisible = es[0].isIntersecting; }, { threshold: 0 }).observe($('.stage'));
paintBeats(pp);

/* render loop: only while the journey or a paint view is on screen */
let last = performance.now(), slow = 0, frames = 0;
function frame(now) {
  const dt = Math.min(now - last, 64); last = now;
  const moving = !reduce.matches;
  if (moving) pp += (target - pp) * (1 - Math.exp(-dt / 150)); else pp = target;
  if (Math.abs(target - pp) < 1e-5) pp = target;
  if (pp !== lastPP) { paintBeats(pp); }
  if (scene && journeyVisible && !root.classList.contains('nogl')) {
    if (pp !== lastPP) scene.apply(pp);
    const pts = scene.render(now);
    if (pts && callouts[0] && +callouts[0].style.opacity > .01) {
      callouts.forEach((c, i) => {
        const q = pts[i];
        if (!q || q.behind) { c.style.visibility = 'hidden'; return; }
        c.style.visibility = 'visible';
        c.style.transform = `translate(${q.x.toFixed(1)}px, ${q.y.toFixed(1)}px)`;
      });
    }
    if (frames < 120) {
      frames++;
      if (dt > 30) slow++;
      if (frames === 120 && slow > 60) scene.lowerQuality();
    }
  }
  lastPP = pp;
  if (ba && baVisible && !root.classList.contains('nogl')) ba.render(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
addEventListener('resize', () => {
  setSplit();
  if (scene) scene.resize();
  if (ba) ba.resize();
});

/* before / after controls */
const range = $('#baRange'), handle = $('#baHandle');
function setSplit() {
  baSplitX = range.value / 100;
  handle.style.left = (baSplitX * 100) + '%';
  if (ba) ba.setSplit(baSplitX);
}
range.addEventListener('input', setSplit); setSplit();

$$('.chip').forEach(c => c.addEventListener('click', () => {
  $$('.chip').forEach(x => x.setAttribute('aria-checked', x === c ? 'true' : 'false'));
  baColor = c.dataset.paint;
  if (ba) ba.setColor(baColor);
}));

const beadBtn = $('#beadBtn');
let beadTarget = 0, beadAnim = 0;
beadBtn.addEventListener('click', () => {
  beadTarget = beadTarget ? 0 : 1;
  beadBtn.setAttribute('aria-pressed', beadTarget ? 'true' : 'false');
  const to = beadTarget;
  if (reduce.matches) { baBeads = to; if (ba) ba.setBeads(to); return; }
  cancelAnimationFrame(beadAnim);
  const from = baBeads, t0 = performance.now();
  const step = now => {
    const k2 = ease(clamp((now - t0) / 900));
    baBeads = lerp(from, to, k2); if (ba) ba.setBeads(baBeads);
    if (k2 < 1) beadAnim = requestAnimationFrame(step);
  };
  beadAnim = requestAnimationFrame(step);
});

/* services */
const SVC = [
  { t: 'Wash & decontamination', p: 'A pH-neutral two-bucket hand wash, then iron fallout remover, tar remover and a clay bar. It strips what a normal wash leaves bonded to the paint, and it is the first step of every job we do.',
    l: ['Snow foam pre-wash and two-bucket hand wash', 'Iron fallout and tar removal', 'Clay bar on every painted panel', "Wheels, arches and tyres cleaned off the car's paint"],
    time: '3–4 hours', last: 'Until the next wash', price: 'Rs 6,500' },
  { t: 'Paint correction', p: 'Machine polishing that levels the clear coat until swirls, holograms and light scratches are gone. We tape a 50/50 line on the first panel so you can see what it does before we do the whole car.',
    l: ['Paint depth reading on every panel', 'One-step or two-stage polish, chosen per panel', 'Inspected under 6,500K and swirl-finder lights', 'Wipe-down so no filler hides defects'],
    time: '1–2 days', last: 'Permanent, until new swirls are washed in', price: 'Rs 38,000' },
  { t: 'Ceramic coating', p: 'A liquid glass layer bonded to corrected paint. It adds depth, keeps dirt and water from sticking, and makes every wash quicker. We only coat after correction, otherwise the swirls get sealed in.',
    l: ['9H coating rated for 5 years', 'Applied in the bay, cured under IR lamps', 'Glass, wheels and trims can be coated too', 'Maintenance wash plan included'],
    time: '2 days', last: 'Up to 5 years', price: 'Rs 95,000' },
  { t: 'Paint protection film', p: 'Clear self-healing urethane film, cut for your exact model and wrapped around the edges so it is close to invisible. It takes the stone chips so the paint does not.',
    l: ['Gloss or satin matte finish', 'Light scratches heal with heat', 'Partial front up to full body', 'Can be coated with ceramic on top'],
    time: '1–4 days', last: '10-year film warranty', price: 'Rs 95,000' },
  { t: 'Interior detail', p: 'Seats, carpets and headliner shampooed and extracted, leather cleaned and conditioned, and every vent and seam brushed out. Karachi dust gets everywhere, and this gets it out.',
    l: ['Hot water extraction on fabric and carpet', 'Leather clean and conditioner', 'Steam on vents, cup holders and seams', 'Odour treatment on request'],
    time: '5–6 hours', last: 'Months, with mats in', price: 'Rs 15,000' }
];
const tabs = $$('.tabs button');
function showSvc(i) {
  const d = SVC[i];
  tabs.forEach((b, k) => { b.setAttribute('aria-selected', k === i ? 'true' : 'false'); b.tabIndex = k === i ? 0 : -1; });
  $('#svcTitle').textContent = d.t;
  $('#svcText').textContent = d.p;
  $('#svcList').innerHTML = d.l.map(x => `<li>${x}</li>`).join('');
  $('#svcTime').textContent = d.time; $('#svcLast').textContent = d.last; $('#svcPrice').textContent = d.price;
  for (const el of [$('.svc-copy'), $('.svc-spec')]) { el.classList.remove('swap'); void el.offsetWidth; el.classList.add('swap'); }
}
tabs.forEach((b, i) => {
  b.addEventListener('click', () => showSvc(i));
  b.addEventListener('keydown', e => {
    const k = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!k) return;
    const n = (i + k + tabs.length) % tabs.length;
    showSvc(n); tabs[n].focus();
  });
});
tabs.forEach((b, k) => b.tabIndex = k === 0 ? 0 : -1);

/* PPF configurator */
const COV = {
  partial: { z: ['bumper', 'hoodfront', 'fenderfront', 'mirror', 'lamp'], price: 95000, label: 'Partial front',
    note: 'Bumper, headlights, front of bonnet, front of fenders, mirrors.' },
  front: { z: ['bumper', 'hoodfront', 'hoodrest', 'fenderfront', 'fenderrest', 'mirror', 'lamp'], price: 185000, label: 'Full front',
    note: 'Bumper, headlights, the whole bonnet, both front fenders and mirrors. The usual pick for highway driving.' },
  track: { z: ['bumper', 'hoodfront', 'hoodrest', 'fenderfront', 'fenderrest', 'mirror', 'lamp', 'pillar', 'rocker', 'impact'], price: 260000, label: 'Track pack',
    note: 'Full front plus A-pillars, rocker panels and the rear impact zones behind the wheels.' },
  full: { z: ['bumper', 'hoodfront', 'hoodrest', 'fenderfront', 'fenderrest', 'mirror', 'lamp', 'pillar', 'rocker', 'impact', 'roof', 'doors', 'quarter', 'trunk', 'rear'], price: 520000, label: 'Full body',
    note: 'Every painted panel, edges wrapped. The paint underneath stays as it left the factory.' }
};
const SIZE = { hatch: .85, sedan: 1, suv: 1.25 };
const ppf = { cov: 'partial', size: 'sedan', fin: 'gloss' };
const car = $('.car'), zones = $$('#carSvg .z');
const fmt = n => 'Rs ' + n.toLocaleString('en-PK');
function drawPPF() {
  const c = COV[ppf.cov];
  zones.forEach(z => z.classList.toggle('on', c.z.includes(z.dataset.z)));
  car.classList.toggle('matte', ppf.fin === 'matte');
  const price = Math.round(c.price * SIZE[ppf.size] * (ppf.fin === 'matte' ? 1.15 : 1) / 1000) * 1000;
  $('#ppfPrice').textContent = fmt(price);
  $('#ppfNote').textContent = c.note;
  $('#ppfCount').textContent = c.z.length;
}
function seg(id, key) {
  const btns = $$(`#${id} button`);
  btns.forEach(b => b.addEventListener('click', () => {
    btns.forEach(x => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
    ppf[key] = b.dataset[key]; drawPPF();
  }));
}
seg('covSeg', 'cov'); seg('sizeSeg', 'size'); seg('finSeg', 'fin');
drawPPF();

/* booking hand-offs */
const select = $('#svcSelect'), notes = $('#notes');
$('#ppfBook').addEventListener('click', () => {
  select.value = 'PPF';
  const sz = { hatch: 'Hatchback', sedan: 'Sedan', suv: 'SUV' }[ppf.size];
  notes.value = `PPF: ${COV[ppf.cov].label}, ${sz}, ${ppf.fin === 'matte' ? 'satin matte' : 'gloss'} (estimate ${$('#ppfPrice').textContent})`;
});
$$('[data-pkg]').forEach(a => a.addEventListener('click', () => { select.value = a.dataset.pkg; }));

const form = $('#bookForm');
form.addEventListener('submit', e => {
  e.preventDefault();
  let bad = null;
  $$('input[required]', form).forEach(i => {
    const ok = i.value.trim().length > 1;
    i.setAttribute('aria-invalid', ok ? 'false' : 'true');
    if (!ok && !bad) bad = i;
  });
  if (bad) { bad.focus(); return; }
  $('#formOk').hidden = false;
  form.reset();
});
