// @ton/core is published as a Node-compatible bundle and expects the
// standard Buffer global while its modules initialize. Install the audited
// browser implementation before any module imports @ton/core.
import { Buffer as BrowserBuffer } from 'buffer/index.js';

if (typeof globalThis.Buffer === 'undefined') globalThis.Buffer = BrowserBuffer;
