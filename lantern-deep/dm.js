/* Lantern Deep: the Dungeon Master, a small language model running in the player's own
   browser on WebGPU through WebLLM. Nothing is installed and nothing leaves the machine:
   the library comes from jsDelivr and the weights from Hugging Face the first time, and
   the browser keeps both, so the second visit loads from disk. It runs in a worker
   (dm-worker.js) so the page keeps drawing while it thinks.

   It is optional. The book (tell.js) tells every page instantly, and this only rewords
   what the book wrote (see prompt.js). If anything goes wrong (no WebGPU, not enough
   memory, a slow answer) the book's page stands. */

import { buildMessages, parseReply, partialStory, buildQuestMessages, parseQuestReply, buildFloorPlanMessages, parseFloorPlan, buildPlayMessages, parsePlayReply } from './prompt.js';

// ---------- constants ----------
export const WEBLLM = 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.85/lib/index.js';
const TIMEOUT = 45000;          // ms for one page before the book's words are used instead
const PLAN_TIMEOUT = 30000;     // ms for a quest or floor plan before the book's own stands
const MAX_TOKENS = 300;
const PLAN_TOKENS = 500;        // a floor plan names several rooms, so it gets more room to answer
const PLAY_TOKENS = 70;         // a move is a number and one short line
// f16 builds need the GPU's shader-f16 feature; f32 builds run anywhere WebGPU does.
// SmolLM2 (360M and 1.7B) were tried on 2026-10-08 and dropped: they made things up
// (a cougar, a hundred-foot drop, a bottle of rum) faster than any check could catch, and
// gave choices words that meant something else ("Die, as is your will" for resting).
export const MODELS = [
  { key: 'phi3', name: 'Phi-3 mini', id: 'Phi-3-mini-4k-instruct', size: '≈ 2.2 GB', note: 'The one to try first. About three seconds a page on a decent graphics card.' },
  { key: 'llama3', name: 'Llama 3 8B', id: 'Llama-3-8B-Instruct', size: '≈ 4.5 GB', note: 'The richest prose. Wants a strong graphics card with 6 GB or more.' },
];

export async function gpuInfo() {
  if (typeof navigator === 'undefined' || !navigator.gpu) return { ok: false, why: 'This browser has no WebGPU. Chrome or Edge on a recent laptop or desktop has it.' };
  try {
    const a = await navigator.gpu.requestAdapter();
    if (!a) return { ok: false, why: 'WebGPU is here but found no graphics adapter it can use.' };
    return { ok: true, f16: a.features.has('shader-f16') };
  } catch (e) { return { ok: false, why: 'WebGPU would not start: ' + e.message }; }
}

export function createDM({ onStatus = () => {} } = {}) {
  let engine = null, worker = null, model = null, busy = false, state = 'off';
  const status = (s, extra = {}) => { state = s; onStatus({ state: s, model, ...extra }); };

  async function load(key) {
    const M = MODELS.find((m) => m.key === key);
    if (!M) return false;
    await unload();
    model = M;
    const gpu = await gpuInfo();
    if (!gpu.ok) { status('error', { why: gpu.why }); return false; }
    status('loading', { progress: 0, text: 'Fetching the library…' });
    try {
      const webllm = await import(WEBLLM);
      const id = `${M.id}-${gpu.f16 ? 'q4f16_1' : 'q4f32_1'}-MLC`;
      worker = new Worker(new URL('./dm-worker.js', import.meta.url), { type: 'module' });
      engine = await webllm.CreateWebWorkerMLCEngine(worker, id, {
        initProgressCallback: (p) => status('loading', { progress: p.progress || 0, text: p.text || '' }),
      });
      status('ready');
      return true;
    } catch (e) {
      console.warn('Lantern Deep: the Dungeon Master would not load', e);
      await unload(true);
      status('error', { why: /memory|OOM|allocate/i.test(String(e)) ? 'Not enough graphics memory for this one. Try a smaller model.' : String(e.message || e).slice(0, 160) });
      return false;
    }
  }

  async function unload(quiet = false) {
    try { if (engine) await engine.unload(); } catch (e) { /* already gone */ }
    if (worker) worker.terminate();
    engine = null; worker = null; busy = false;
    if (!quiet) status('off');
  }

  // Retell one page. onText(storySoFar) is called as the story streams in. Resolves to the
  // parsed reply (always usable: the book's words fill any gap), or null if not ready.
  async function tell({ facts, page, choices, onText = () => {} }) {
    if (!engine || state !== 'ready' || busy) return null;
    busy = true;
    let raw = '', timer = null, timedOut = false;
    try {
      const messages = buildMessages({ facts, page, choices });
      timer = setTimeout(() => { timedOut = true; try { engine.interruptGenerate(); } catch (e) { /* fine */ } }, TIMEOUT);
      const stream = await engine.chat.completions.create({ messages, stream: true, temperature: 0.8, top_p: 0.92, max_tokens: MAX_TOKENS });
      for await (const chunk of stream) {
        raw += (chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content) || '';
        onText(partialStory(raw));
      }
    } catch (e) {
      console.warn('Lantern Deep: the Dungeon Master lost the thread', e);
    } finally { clearTimeout(timer); busy = false; }
    const reply = parseReply(timedOut ? raw.split(/\n\s*CHOICES:/i)[0] : raw, { page, choices, facts });
    reply.raw = raw; reply.timedOut = timedOut;
    return reply;
  }

  function skip() { if (engine && busy) try { engine.interruptGenerate(); } catch (e) { /* fine */ } }

  // One short, non-streaming call: ask a question, get a whole answer back. Used for the
  // quest (once a delve) and a floor's plan (once a floor) — both are over well before a
  // page's TIMEOUT would matter, but get their own shorter one since there is no partial
  // text to show meanwhile, so waiting the full 45s on a stall would just be dead air.
  async function ask(messages, maxTokens, temperature = 0.85) {
    if (!engine || state !== 'ready' || busy) return '';
    busy = true;
    let raw = '', timer = null;
    try {
      timer = setTimeout(() => { try { engine.interruptGenerate(); } catch (e) { /* fine */ } }, PLAN_TIMEOUT);
      const res = await engine.chat.completions.create({ messages, temperature, top_p: 0.92, max_tokens: maxTokens });
      raw = (res.choices[0] && res.choices[0].message && res.choices[0].message.content) || '';
    } catch (e) {
      console.warn('Lantern Deep: the Dungeon Master could not plan', e);
    } finally { clearTimeout(timer); busy = false; }
    return raw;
  }
  // bosses: [{ key, name, blurb }]. Returns { boss, why, raw } or null (caller falls back to
  // the book's chooseQuest()); raw is the model's unparsed answer, kept for debugging.
  async function planQuest(bosses) {
    const raw = await ask(buildQuestMessages(bosses), 150, 0.9);
    const reply = parseQuestReply(raw, { bosses });
    if (reply) reply.raw = raw;
    return reply;
  }
  // menu: sim.js's floorMenu(draftFloor). Returns { premise, rooms, raw } (anything not
  // filled in is left for sim.js's applyFloorPlan() to leave at the book's own pick). A
  // lower temperature than the quest or the retelling: this is a list to fill in correctly,
  // not prose, and Llama 3 drifted off the list (stopped after one of several rooms) more
  // at the higher temperature tried first.
  async function planFloor({ quest, floor, theme, menu }) {
    const raw = await ask(buildFloorPlanMessages({ quest, floor, theme, menu }), PLAN_TOKENS, 0.5);
    const reply = parseFloorPlan(raw, { menu, quest, theme });
    reply.raw = raw;
    return reply;
  }
  // The Dungeon Master's mode turns the model round: it plays the hero. choices are the
  // enabled ones only. Returns { id, say, raw } or null (player.js then makes the move).
  async function play({ facts, page, choices }) {
    const raw = await ask(buildPlayMessages({ facts, page, choices }), PLAY_TOKENS, 0.6);
    const reply = parsePlayReply(raw, { choices, page, facts });
    if (reply) reply.raw = raw;
    return reply;
  }

  return { load, unload, tell, skip, planQuest, planFloor, play, get state() { return state; }, get model() { return model; }, get busy() { return busy; } };
}
