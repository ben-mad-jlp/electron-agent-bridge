/**
 * Minimal shape of the Electron `app` object needed by these helpers.
 * Pass the real Electron `app` here so this module stays free of an
 * `electron` import (and can be unit-tested without Electron present).
 */
export interface ElectronAppLike {
    commandLine: {
        appendSwitch(key: string, value?: string): void;
    };
}
/**
 * Find a free TCP port on the loopback interface.
 */
export declare function getFreePort(): Promise<number>;
/**
 * Enable the Chrome DevTools Protocol (CDP) remote debugging endpoint.
 *
 * IMPORTANT: This MUST be called BEFORE `app.whenReady()`. The
 * `remote-debugging-port` switch is ignored once the app is ready.
 *
 * @returns the port CDP is listening on.
 */
export declare function enableCdp(app: ElectronAppLike, opts?: {
    port?: number;
    address?: string;
}): Promise<number>;
/**
 * Publish a CDP discovery record so external agents can find the
 * WebSocket debugger URL. Non-fatal: any failure is logged and swallowed.
 */
export declare function publishDiscovery(opts: {
    appName: string;
    port: number;
    path?: string;
}): Promise<void>;
