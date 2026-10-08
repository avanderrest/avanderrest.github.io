/* Lantern Deep: the worker the Dungeon Master's model runs in (see dm.js), so the page
   keeps drawing while it thinks. WebLLM does all the work; this only hands it messages. */
import { WebWorkerMLCEngineHandler } from 'https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.85/lib/index.js';

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (msg) => handler.onmessage(msg);
