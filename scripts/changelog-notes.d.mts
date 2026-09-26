export function pendingChangelog(text: string, releasedVersion: string): string;

export function hasSizeNote(pending: string, subpath: string): boolean;

export function readPendingChangelog(repoRoot: string): { version: string; pending: string };
