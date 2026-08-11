// ElectronDriver — app-agnostic CDP client over chrome-remote-interface.
// Connects to a running Electron (or Chrome) instance's remote-debugging
// endpoint and drives the renderer: navigate, screenshot, eval, click, fill,
// waitFor, snapshot. No app-specific (mermaid/.collab/session) logic lives here.
//
// Connection model: one CDP client is opened per operation and closed in a
// `finally`, mirroring the proven withCDPSession pattern. Targets are resolved
// per call so the driver tolerates window/tab churn.
import { promises as fsp } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
// chrome-remote-interface ships no types. Use a STATIC import (not createRequire)
// so bundlers — notably `bun build --compile`, used to produce the packaged
// sidecar binary — can follow and include it. A dynamic createRequire is
// invisible to the compiler and the package is missing at runtime.
// @ts-ignore - no bundled type declarations
import CDPImport from 'chrome-remote-interface';
const CDP = CDPImport;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export class ElectronDriver {
    host;
    port;
    wsUrl;
    selectTarget;
    constructor(opts) {
        this.host = opts.host ?? '127.0.0.1';
        this.port = opts.port;
        this.wsUrl = opts.wsUrl;
        this.selectTarget = opts.selectTarget;
    }
    /**
     * Discover the CDP endpoint from a JSON file written by the app at launch.
     * The file may contain { port } | { cdpPort } | { wsUrl }.
     */
    static async fromDiscovery(opts) {
        const path = opts?.path ??
            join(homedir(), '.' + (opts?.appName ?? 'mermaid-collab'), 'electron-cdp.json');
        let json;
        try {
            const raw = await fsp.readFile(path, 'utf8');
            json = JSON.parse(raw);
        }
        catch (err) {
            throw new Error('ElectronDriver: could not read CDP discovery file at ' + path + ': ' + (err?.message ?? String(err)));
        }
        if (json.wsUrl) {
            return new ElectronDriver({ wsUrl: json.wsUrl, selectTarget: opts?.selectTarget });
        }
        const port = json.port ?? json.cdpPort;
        if (!port) {
            throw new Error('ElectronDriver: discovery file ' + path + ' had no usable port/cdpPort/wsUrl');
        }
        return new ElectronDriver({ host: '127.0.0.1', port, selectTarget: opts?.selectTarget });
    }
    /** Construct directly from a known WebSocket debugger URL. */
    static fromUrl(wsUrl) {
        return new ElectronDriver({ wsUrl });
    }
    /** Open a CDP client, resolving the target per call. Caller must close it. */
    async connect() {
        try {
            if (this.wsUrl) {
                return await CDP({ host: this.host, port: this.port, target: this.wsUrl });
            }
            const targets = await CDP.List({ host: this.host, port: this.port });
            const t = targets.find(this.selectTarget ?? ((x) => x.type === 'page'));
            if (!t || !t.webSocketDebuggerUrl) {
                throw new Error('ElectronDriver: no matching CDP target (port ' + this.port + ')');
            }
            return await CDP({ host: this.host, port: this.port, target: t.webSocketDebuggerUrl });
        }
        catch (err) {
            if (err?.code === 'ECONNREFUSED') {
                throw new Error('ElectronDriver: CDP not reachable on ' + this.host + ':' + this.port);
            }
            throw err;
        }
    }
    async navigate(url) {
        const client = await this.connect();
        try {
            await client.Page.enable();
            await client.Page.navigate({ url });
            await sleep(500);
            const title = (await client.Runtime.evaluate({ expression: 'document.title', returnByValue: true })).result?.value;
            return { url, title };
        }
        finally {
            try {
                await client.close();
            }
            catch { }
        }
    }
    async screenshot(opts) {
        const client = await this.connect();
        try {
            await client.Page.enable();
            const r = await client.Page.captureScreenshot({ format: opts?.format ?? 'png' });
            return { base64: r.data };
        }
        finally {
            try {
                await client.close();
            }
            catch { }
        }
    }
    async eval(expression) {
        const client = await this.connect();
        try {
            const r = await client.Runtime.evaluate({
                expression,
                returnByValue: true,
                awaitPromise: true,
            });
            if (r.exceptionDetails) {
                throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text ?? 'eval error');
            }
            return r.result?.value;
        }
        finally {
            try {
                await client.close();
            }
            catch { }
        }
    }
    async click(selector) {
        const client = await this.connect();
        try {
            const sel = JSON.stringify(selector);
            const expr = '(function(){const el=document.querySelector(' +
                sel +
                '); if(!el) return "not-found"; el.click(); return "clicked";})()';
            const r = await client.Runtime.evaluate({ expression: expr, returnByValue: true });
            if (r.result?.value === 'not-found') {
                throw new Error('Element not found: ' + selector);
            }
        }
        finally {
            try {
                await client.close();
            }
            catch { }
        }
    }
    async fill(selector, value) {
        const client = await this.connect();
        try {
            const evalResult = await client.Runtime.evaluate({
                expression: 'document.querySelector(' + JSON.stringify(selector) + ')',
                returnByValue: false,
            });
            const objectId = evalResult.result?.objectId;
            if (!objectId)
                throw new Error('Element not found: ' + selector);
            await client.Runtime.callFunctionOn({
                objectId,
                functionDeclaration: 'function(v){ this.value = v; this.dispatchEvent(new Event("input",{bubbles:true})); this.dispatchEvent(new Event("change",{bubbles:true})); }',
                arguments: [{ value }],
                returnByValue: true,
            });
        }
        finally {
            try {
                await client.close();
            }
            catch { }
        }
    }
    async waitFor(selector, timeoutMs = 5000) {
        const client = await this.connect();
        try {
            const deadline = Date.now() + timeoutMs;
            const expr = '!!document.querySelector(' + JSON.stringify(selector) + ')';
            while (Date.now() < deadline) {
                const ok = (await client.Runtime.evaluate({ expression: expr, returnByValue: true }))
                    .result?.value;
                if (ok === true)
                    return;
                await sleep(100);
            }
            throw new Error('Timeout: "' + selector + '" not found after ' + timeoutMs + 'ms');
        }
        finally {
            try {
                await client.close();
            }
            catch { }
        }
    }
    /** Build the shared page-scanning expression. `sel` selects, `verbose` keeps class lists. */
    scanExpr(sel, verbose, limit) {
        return `(function(){
      var nodes = Array.prototype.slice.call(document.querySelectorAll(${JSON.stringify(sel)}));
      var lines = [];
      for (var i = 0; i < nodes.length && lines.length < ${limit}; i++) {
        var el = nodes[i];
        var visible = el.offsetParent !== null || el.getClientRects().length > 0;
        if (!visible) continue;
        var tag = el.tagName.toLowerCase();
        var parts = [tag];
        // IDENTITY, in descending order of stability. A test id survives restyling; a Tailwind
        // class list does not, and an agent that keyed off one would break on a hover colour.
        var tid = el.getAttribute('data-testid');
        if (tid) parts.push('@' + tid);
        else if (el.id) parts.push('#' + el.id);
        var role = el.getAttribute('role');
        if (role) parts.push('role=' + role);
        var label = el.getAttribute('aria-label');
        if (label) parts.push('aria=' + JSON.stringify(label.slice(0, 40)));
        if (tag === 'input' || tag === 'textarea' || tag === 'select') {
          var ty = el.getAttribute('type'); if (ty) parts.push('type=' + ty);
          var nm = el.getAttribute('name'); if (nm) parts.push('name=' + nm);
          if (el.value) parts.push('value=' + JSON.stringify(String(el.value).slice(0, 40)));
        }
        if (el.disabled) parts.push('disabled');
        ${verbose ? `
        if (el.className && typeof el.className === 'string') {
          var c = el.className.trim().split(/\\s+/).filter(Boolean);
          if (c.length) parts.push('.' + c.join('.'));
        }` : ''}
        var txt = (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 120);
        var line = parts.join(' ');
        if (txt) line += ' "' + txt + '"';
        lines.push(line);
      }
      return lines.join('\n');
    })()`;
    }
    /**
     * Text/structure snapshot of the visible page.
     *
     * MEASURED 2026-08-11 against a real Tailwind app: emitting className made the output 90%
     * styling noise — a single screen cost ~10k tokens, most of it
     * `hover:bg-gray-100.dark:hover:bg-gray-700.transition-colors` repeated per element. An agent
     * cannot act on any of it, and a budgeted investigation burns its ceiling on one page. So the
     * default now emits IDENTITY and TEXT only; pass `verbose` to get classes back.
     */
    async snapshot(opts) {
        const sel = opts?.selector ?? 'a,button,input,textarea,select,[role],[data-testid],h1,h2,h3';
        const client = await this.connect();
        try {
            const r = await client.Runtime.evaluate({
                expression: this.scanExpr(sel, opts?.verbose === true, opts?.limit ?? 500),
                returnByValue: true,
            });
            return r.result?.value ?? '';
        }
        finally {
            try {
                await client.close();
            }
            catch { }
        }
    }
    /**
     * Read ONLY the elements matching `selector`.
     *
     * Exists so "what does the epic banner say" does not cost a whole-page read. A full snapshot
     * is the wrong instrument for checking one claim, and it is the difference between an agent
     * auditing twenty screens or three.
     */
    async query(selector, opts) {
        return this.snapshot({ selector, verbose: opts?.verbose, limit: opts?.limit ?? 100 });
    }
    async listTargets() {
        if (!this.port)
            return [];
        return await CDP.List({ host: this.host, port: this.port });
    }
    /** No-op: connections are opened and closed per operation (connect-per-op). */
    async close() {
        // intentionally empty
    }
}
