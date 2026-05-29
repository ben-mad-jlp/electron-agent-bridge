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
    snapshot(): Promise<string>;
    listTargets(): Promise<CDPTarget[]>;
    /** No-op: connections are opened and closed per operation (connect-per-op). */
    close(): Promise<void>;
}
