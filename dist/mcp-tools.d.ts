import type { ElectronDriver } from './driver.js';
export type ToolDef = {
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, unknown>;
        required?: string[];
    };
};
export type ToolHandler = (args: any) => Promise<string>;
export declare function createDesktopTools(getDriver: () => Promise<ElectronDriver>): {
    defs: ToolDef[];
    handlers: Record<string, ToolHandler>;
};
