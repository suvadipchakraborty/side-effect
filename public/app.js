/* ---------- CONFIG ---------- */
const FDA_KEY = 'RfQj2Lm4z8IcRX2z7DOyRrwvehsvjEncN5hXsH9z';
const FDA = 'https://api.fda.gov/drug/';
// Indian/UK names -> US names used by openFDA
const SYN = {paracetamol:'acetaminophen',salbutamol:'albuterol',adrenaline:'epinephrine',noradrenaline:'norepinephrine',pethidine:'meperidine',frusemide:'furosemide',rifampicin:'rifampin',lignocaine:'lidocaine',glibenclamide:'glyburide',amoxycillin:'amoxicillin','amoxycillin trihydrate':'amoxicillin','amoxicillin trihydrate':'amoxicillin','clavulanic acid':'clavulanate potassium','potassium clavulanate':'clavulanate potassium','diclofenac sodium':'diclofenac','diclofenac potassium':'diclofenac',pantoprazole:'pantoprazole sodium','pantoprazole sodium':'pantoprazole sodium',ranitidine:'ranitidine','chlorpheniramine maleate':'chlorpheniramine','levocetirizine dihydrochloride':'levocetirizine',cetrizine:'cetirizine',ambroxol:'ambroxol',phenylephrine:'phenylephrine',benzhexol:'trihexyphenidyl',thyroxine:'levothyroxine',cyclizine:'cyclizine',cephalexin:'cephalexin',cefalexin:'cephalexin',mefenamic:'mefenamic acid'};
const EXAMPLES = ['Paracetamol','Amoxicillin + Clavulanic acid','Metformin','Pantoprazole','Ibuprofen + Paracetamol','Azithromycin'];

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
class AppError extends Error { constructor(title, msg){ super(msg); this.title = title; } }

/* ---------- openFDA ---------- */
async function getJSON(url, what) {
  let r;
  try { r = await fetch(url); }
  catch { throw new AppError('You look offline', `Could not reach ${what}. Check your connection and try again.`); }
  if (r.status === 429) throw new AppError('Too many requests', `${what} rate limit reached. Wait a minute and retry.`);
  if (r.status === 404) return null; // openFDA uses 404 for "no matches"
  if (!r.ok) throw new AppError('Something went wrong', `${what} returned an error (${r.status}).`);
  return r.json();
}
// "Paracetamol 650mg + Caffeine, Tramadol" -> ["paracetamol","caffeine","tramadol"]
function parseSalts(text) {
  const set = new Set();
  text.split(/\+|,|;|\band\b|\//i).forEach(p => {
    const n = p.replace(/\(.*?\)/g, '').replace(/\d+(\.\d+)?\s*(mg|mcg|gm?|ml|iu|%)?/gi, '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (n.length > 2) set.add(n);
  });
  return [...set];
}
const usName = s => SYN[s] || s;
const fdaURL = (ep, params) => `${FDA}${ep}.json?${params}&api_key=${FDA_KEY}`;

async function fetchSafety(salt) {
  const g = usName(salt), q = encodeURIComponent(`"${g}"`);
  const [label, events] = await Promise.all([
    getJSON(fdaURL('label', `search=openfda.generic_name:${q}+openfda.substance_name:${q}&limit=5`), 'openFDA labels'),
    getJSON(fdaURL('event', `search=patient.drug.openfda.generic_name:${q}&count=patient.reaction.reactionmeddrapt.exact&limit=10`), 'openFDA reports')
  ]);
  const res = label?.results || [];
  // Prefer a single-ingredient label whose name matches
  const L = res.find(r => (r.openfda?.generic_name || []).length === 1 && r.openfda.generic_name[0].toLowerCase().includes(g)) || res[0];
  const ev = events?.results || [];
  if (!L && !ev.length) throw new AppError('No FDA data', `openFDA has no records for “${g}”. Check the spelling, or try the generic name used in the US.`);
  return { name: g, label: L || {}, events: ev };
}

/* ---------- Rendering ---------- */
const first = a => Array.isArray(a) ? a.join('\n\n') : a;
const clip = t => { t = String(t || '').replace(/\s+/g, ' ').trim(); return t.length > 900 ? t.slice(0, 900) + '…' : t; };
const skeleton = () => `<div class="card"><div class="sk" style="width:55%;height:24px"></div><div class="sk"></div><div class="sk" style="width:80%"></div><div class="sk" style="width:65%"></div></div>
<div class="card"><div class="sk" style="width:40%"></div><div class="sk"></div><div class="sk"></div><div class="sk"></div></div>`;
const errCard = e => `<div class="card err"><h3>${esc(e.title || 'Something went wrong')}</h3><p class="sub">${esc(e.message)}</p></div>`;

function renderSafety(d) {
  const L = d.label, max = d.events[0]?.count || 1, total = d.events.reduce((a, b) => a + b.count, 0);
  const secs = [['Used for', L.indications_and_usage], ['Warnings', L.warnings || L.warnings_and_cautions], ['Do not use if', L.do_not_use], ['Ask a doctor first', L.ask_doctor], ['Stop use and ask a doctor if', L.stop_use], ['Adverse reactions', L.adverse_reactions], ['Drug interactions', L.drug_interactions], ['Pregnancy', L.pregnancy || L.pregnancy_or_breast_feeding], ['Overdose', L.overdosage]].filter(s => s[1]);
  $('#safety').innerHTML = `
  ${L.boxed_warning ? `<div class="boxed"><b>Boxed warning.</b> ${esc(clip(first(L.boxed_warning)))}</div>` : ''}
  ${d.events.length ? `<div class="card"><h4 class="sec">Most reported reactions</h4>
    <div class="bars">${d.events.map(e => `<div class="bar"><div class="l"><span>${esc(e.term.toLowerCase())}</span><span>${e.count.toLocaleString()}</span></div><div class="t"><div class="f" data-w="${(e.count / max * 100).toFixed(1)}"></div></div></div>`).join('')}</div>
    <p class="sub" style="margin-top:12px">Based on ${total.toLocaleString()} reports across the top 10 reactions. Reports show what people noticed, not how likely it is.</p></div>` : ''}
  ${secs.length ? `<div class="card"><h4 class="sec">Official FDA label</h4>${secs.map(([t, v], i) => `<details class="acc" ${i === 1 ? 'open' : ''}><summary>${t}</summary><p>${esc(clip(first(v)))}</p></details>`).join('')}</div>` : ''}`;
  requestAnimationFrame(() => setTimeout(() => document.querySelectorAll('.f').forEach(f => f.style.width = f.dataset.w + '%'), 50));
}

async function selectSalt(salt) {
  document.querySelectorAll('.salts button').forEach(b => b.classList.toggle('on', b.dataset.s === salt));
  $('#safety').innerHTML = skeleton();
  try { renderSafety(await fetchSafety(salt)); }
  catch (e) { $('#safety').innerHTML = errCard(e); }
}
async function search(text) {
  text = text.trim(); if (!text) return;
  const salts = parseSalts(text);
  if (!salts.length) { $('#result').innerHTML = errCard({ title: 'Enter a salt name', message: 'Try something like Paracetamol or Amoxicillin + Clavulanic acid.' }); return; }
  $('#q').value = text; $('#q').blur();
  $('#capBrand').textContent = salts[0].length > 14 ? salts[0].slice(0, 13) + '…' : salts[0];
  const c = $('.capsule'); c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop');
  saveRecent(text);
  $('#result').innerHTML = `<div class="card"><p class="sub">${salts.length > 1 ? 'Combination' : 'Salt'}</p>
    <h3 style="text-transform:capitalize">${salts.map(esc).join(' + ')}</h3>
    ${salts.some(s => usName(s) !== s) ? `<div class="status">Searched in the US as: <b>${salts.map(s => esc(usName(s))).join(' + ')}</b></div>` : ''}
    ${salts.length > 1 ? `<div class="salts">${salts.map(s => `<button data-s="${esc(s)}">${esc(usName(s))}</button>`).join('')}</div>` : ''}
  </div><div id="safety"></div>`;
  document.querySelectorAll('.salts button').forEach(b => b.onclick = () => selectSalt(b.dataset.s));
  await selectSalt(salts[0]);
  $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ---------- Recent, tabs, toast ---------- */
function saveRecent(n) {
  try { const r = [n, ...JSON.parse(localStorage.getItem('sec_recent') || '[]').filter(x => x.toLowerCase() !== n.toLowerCase())].slice(0, 6); localStorage.setItem('sec_recent', JSON.stringify(r)); } catch {}
  drawRecent();
}
function drawRecent() {
  let r = []; try { r = JSON.parse(localStorage.getItem('sec_recent') || '[]'); } catch {}
  $('#recentWrap').hidden = !r.length;
  $('#recent').innerHTML = r.map(x => `<button>${esc(x)}</button>`).join('');
  $('#recent').querySelectorAll('button').forEach(b => b.onclick = () => search(b.textContent));
}
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2200); }

document.querySelectorAll('.tabbar button').forEach(b => b.onclick = () => {
  document.querySelectorAll('.tabbar button').forEach(x => x.classList.toggle('on', x === b));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + b.dataset.tab));
  scrollTo({ top: 0 });
});
$('#searchForm').onsubmit = e => { e.preventDefault(); search($('#q').value); };
$('#quick').innerHTML = EXAMPLES.map(x => `<button>${esc(x)}</button>`).join('');
$('#quick').querySelectorAll('button').forEach(b => b.onclick = () => search(b.textContent));
$('#clearRecent').onclick = () => { try { localStorage.removeItem('sec_recent'); } catch {} drawRecent(); };
drawRecent();

/* ---------- Share + PWA install ---------- */
$('#shareBtn').onclick = async () => {
  const data = { title: 'Side Effect Checker', text: 'Look up side effects of any medicine by its salt name:', url: 'https://side-effect.suvadipchakraborty.workers.dev/' };
  try { if (navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(data.url); toast('Link copied'); } } catch {}
};
let deferred;
const ib = $('#installBtn');
addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; ib.hidden = false; });
ib.onclick = async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; ib.hidden = true; };
addEventListener('appinstalled', () => { ib.hidden = true; toast('App saved to home screen'); });
if (/iphone|ipad/i.test(navigator.userAgent) && !navigator.standalone) { ib.hidden = false; ib.onclick = () => toast('Tap Share, then Add to Home Screen'); }
if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
