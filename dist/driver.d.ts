export type CDPTarget = {
    id: string;
    type?: string;
    title?: string;
    url?: string;
    webSocketDebuggerUrl?: string;
};
export declare class ElectronDriver {
    private host;
    private port?;
    private wsUrl?;
    private selectTarget?;
    private constructor();
    /**
     * Discover the CDP endpoint from a JSON file written by the app at launch.
     * The file may contain { port } | { cdpPort } | { wsUrl }.
     */
    static fromDiscovery(opts?: {
        appName?: string;
        path?: string;
        selectTarget?: (t: CDPTarget) => boolean;
    }): Promise<ElectronDriver>;
    /** Construct directly from a known WebSocket debugger URL. */
    static fromUrl(wsUrl: string): ElectronDriver;
    /** Open a CDP client, resolving the target per call. Caller must close it. */
    private connect;
    navigate(url: string): Promise<{
        url: string;
        title: string;
    }>;
    screenshot(opts?: {
        format?: 'png' | 'jpeg';
    }): Promise<{
        base64: string;
    }>;
    eval(expression: string): Promise<unknown>;
    click(selector: string): Promise<void>;
    fill(selector: string, value: string): Promise<void>;
    waitFor(selector: string, timeoutMs?: number): Promise<void>;
    /** Build the shared page-scanning expression. `sel` selects, `verbose` keeps class lists. */
    private scanExpr;
    /**
     * Text/structure snapshot of the visible page.
     *
     * MEASURED 2026-08-11 against a real Tailwind app: emitting className made the output 90%
     * styling noise — a single screen cost ~10k tokens, most of it
     * `hover:bg-gray-100.dark:hover:bg-gray-700.transition-colors` repeated per element. An agent
     * cannot act on any of it, and a budgeted investigation burns its ceiling on one page. So the
     * default now emits IDENTITY and TEXT only; pass `verbose` to get classes back.
     */
    snapshot(opts?: {
        selector?: string;
        verbose?: boolean;
        limit?: number;
    }): Promise<string>;
    /**
     * Read ONLY the elements matching `selector`.
     *
     * Exists so "what does the epic banner say" does not cost a whole-page read. A full snapshot
     * is the wrong instrument for checking one claim, and it is the difference between an agent
     * auditing twenty screens or three.
     */
    query(selector: string, opts?: {
        verbose?: boolean;
        limit?: number;
    }): Promise<string>;
    listTargets(): Promise<CDPTarget[]>;
    /** No-op: connections are opened and closed per operation (connect-per-op). */
    close(): Promise<void>;
}
