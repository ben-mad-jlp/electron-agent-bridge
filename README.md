# electron-agent-bridge

Drive an Electron app from an MCP server (or any Node process) over the Chrome
DevTools Protocol. Three small, dependency-light pieces:

- **`electron-main`** — call `enableCdp(app)` before `app.whenReady()` to open a
  CDP endpoint, and `publishDiscovery({ appName, port })` to write a discovery
  file (`~/.<appName>/electron-cdp.json`) so a separate process can find the app.
- **`driver`** — `ElectronDriver`, a connect-per-operation CDP client
  (`navigate`, `screenshot`, `eval`, `click`, `fill`, `waitFor`, `snapshot`,
  `listTargets`). It resolves the target on every call, so it survives renderer
  reloads/churn without caching stale target ids.
- **`mcp-tools`** — `createDesktopTools(getDriver)` returns ready-to-register
  `desktop_*` MCP tool defs + handlers (screenshot, click, navigate, eval, …).

Only runtime dependency: [`chrome-remote-interface`](https://www.npmjs.com/package/chrome-remote-interface).

## Install

```bash
npm install electron-agent-bridge
# or, as a local link:  "electron-agent-bridge": "file:../electron-agent-bridge"
```

## Usage

### 1. In the Electron main process

```ts
import { app } from 'electron';
import { enableCdp, publishDiscovery } from 'electron-agent-bridge/electron-main';

// MUST run before the app is ready, so the CDP switch is applied.
const port = await enableCdp(app);            // honours MC_CDP_PORT, else a free port
await app.whenReady();
createWindow();
await publishDiscovery({ appName: 'my-app', port });   // writes ~/.my-app/electron-cdp.json
```

### 2. In your MCP server (or any controller process)

```ts
import { ElectronDriver } from 'electron-agent-bridge/driver';
import { createDesktopTools } from 'electron-agent-bridge/mcp-tools';

let driver: ElectronDriver | null = null;
const getDriver = async () =>
  (driver ??= await ElectronDriver.fromDiscovery({
    appName: 'my-app',
    // optional: pick which CDP target to drive (default: first page)
    selectTarget: (targets) => targets.find((t) => t.title.includes('My App')) ?? targets[0],
  }));

const { defs, handlers } = createDesktopTools(getDriver);
// register `defs` with your MCP server; dispatch calls to `handlers[name](args)`.
```

## Discovery file

`publishDiscovery` writes `{ port, webSocketDebuggerUrl, pid, appName }` to
`~/.<appName>/electron-cdp.json` (override with `opts.path`). `ElectronDriver.fromDiscovery`
reads it to find the CDP WebSocket. Use `ElectronDriver.fromUrl(wsUrl)` to skip discovery.

## License

MIT
