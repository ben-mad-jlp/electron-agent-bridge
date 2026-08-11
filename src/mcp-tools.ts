// App-agnostic factory producing { defs, handlers } for desktop_* MCP tools.
// The host spreads these defs/handlers into its own MCP server. No app-specific
// (mermaid/.collab/session) logic lives here.

import type { ElectronDriver } from './driver.js';

export type ToolDef = {
  name: string;
  description: string;
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
};

export type ToolHandler = (args: any) => Promise<string>;

function req(args: any, key: string): any {
  const v = args?.[key];
  if (v === undefined || v === null) throw new Error('Missing required: ' + key);
  return v;
}

export function createDesktopTools(
  getDriver: () => Promise<ElectronDriver>,
): { defs: ToolDef[]; handlers: Record<string, ToolHandler> } {
  const defs: ToolDef[] = [
    {
      name: 'desktop_navigate',
      description: 'Navigate the desktop app to a URL.',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'URL to navigate the desktop app to' },
        },
        required: ['url'],
      },
    },
    {
      name: 'desktop_screenshot',
      description: 'Capture a screenshot of the desktop app.',
      inputSchema: {
        type: 'object',
        properties: {
          format: {
            type: 'string',
            enum: ['png', 'jpeg'],
            description: 'Image format (default png)',
          },
        },
      },
    },
    {
      name: 'desktop_eval',
      description: 'Evaluate a JavaScript expression in the renderer.',
      inputSchema: {
        type: 'object',
        properties: {
          expression: {
            type: 'string',
            description: 'JavaScript expression to evaluate in the renderer',
          },
        },
        required: ['expression'],
      },
    },
    {
      name: 'desktop_click',
      description: 'Click an element matching a CSS selector.',
      inputSchema: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector to click' },
        },
        required: ['selector'],
      },
    },
    {
      name: 'desktop_fill',
      description: 'Fill a field matching a CSS selector with a value.',
      inputSchema: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector of the field' },
          value: { type: 'string', description: 'Value to set' },
        },
        required: ['selector', 'value'],
      },
    },
    {
      name: 'desktop_wait_for',
      description: 'Wait for an element matching a CSS selector to appear.',
      inputSchema: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector to wait for' },
          timeoutMs: { type: 'number', description: 'Timeout in ms (default 5000)' },
        },
        required: ['selector'],
      },
    },
    {
      name: 'desktop_snapshot',
      description:
        'Text/structure snapshot of the visible page: one line per interactive or labelled element, ' +
        'as `tag @testid #id role= aria= "text"`. Styling classes are OMITTED by default — they were ' +
        '90% of the output and nothing can act on them. Pass verbose:true to include them, selector to ' +
        'narrow the scan, limit to cap the line count (default 500). For ONE element prefer desktop_query.',
      inputSchema: {
        type: 'object',
        properties: {
          selector: { type: 'string', description: 'CSS selector to scan (default: interactive + labelled elements).' },
          verbose: { type: 'boolean', description: 'Include class lists. Default false.' },
          limit: { type: 'number', description: 'Max lines returned. Default 500.' },
        },
      },
    },
    {
      name: 'desktop_query',
      description:
        'Read ONLY the elements matching a CSS selector, in the same line format as desktop_snapshot. ' +
        'Use to check a specific claim ("what does the status banner say") without paying for a whole-page ' +
        'read. Returns an empty string when nothing matches — an absent element and an empty one are ' +
        'different findings, so check the match count.',
      inputSchema: {
        type: 'object',
        properties: {
          selector: { type: 'string' },
          verbose: { type: 'boolean', description: 'Include class lists. Default false.' },
          limit: { type: 'number', description: 'Max lines returned. Default 100.' },
        },
        required: ['selector'],
      },
    },
    {
      name: 'desktop_list_targets',
      description: 'List available CDP targets.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
  ];

  const handlers: Record<string, ToolHandler> = {
    desktop_navigate: async (args) => {
      const d = await getDriver();
      return JSON.stringify(await d.navigate(req(args, 'url')));
    },
    desktop_screenshot: async (args) => {
      const d = await getDriver();
      const r = await d.screenshot({ format: args?.format });
      return JSON.stringify(r);
    },
    desktop_eval: async (args) => {
      const d = await getDriver();
      const result = await d.eval(req(args, 'expression'));
      return JSON.stringify({ result });
    },
    desktop_click: async (args) => {
      const d = await getDriver();
      await d.click(req(args, 'selector'));
      return JSON.stringify({ ok: true });
    },
    desktop_fill: async (args) => {
      const d = await getDriver();
      await d.fill(req(args, 'selector'), req(args, 'value'));
      return JSON.stringify({ ok: true });
    },
    desktop_wait_for: async (args) => {
      const d = await getDriver();
      await d.waitFor(req(args, 'selector'), args?.timeoutMs);
      return JSON.stringify({ ok: true });
    },
    desktop_snapshot: async (args) => {
      const d = await getDriver();
      const snapshot = await d.snapshot({
        selector: args?.selector as string | undefined,
        verbose: args?.verbose as boolean | undefined,
        limit: args?.limit as number | undefined,
      });
      return JSON.stringify({ snapshot, lines: snapshot ? snapshot.split('\n').length : 0 });
    },
    desktop_query: async (args) => {
      const d = await getDriver();
      const snapshot = await d.query(req(args, 'selector'), {
        verbose: args?.verbose as boolean | undefined,
        limit: args?.limit as number | undefined,
      });
      // `matches` is load-bearing: an empty result must be distinguishable from a match with no
      // text, and "the selector found nothing" is itself a finding an auditor needs to see.
      return JSON.stringify({ snapshot, matches: snapshot ? snapshot.split('\n').length : 0 });
    },
    desktop_list_targets: async () => {
      const d = await getDriver();
      return JSON.stringify(await d.listTargets());
    },
  };

  return { defs, handlers };
}
