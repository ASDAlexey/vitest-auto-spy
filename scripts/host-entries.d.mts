import type { Plugin } from 'esbuild';

export interface HostedEntriesOptions {
  root: string;
  host: string;
  publicBarrel: string;
  hostFile: string;
  satellites: string[];
  external: string[];
  plugins: () => Plugin[];
  inline?: string[];
}

export interface HostedEntries {
  hostPlugin: () => Plugin;
  satellitePlugin: () => Plugin;
  hiddenExports: number;
}

export declare function planHostedEntries(options: HostedEntriesOptions): Promise<HostedEntries>;
