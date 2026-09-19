/**
 * The scan stopped at its safety cap, so every other check saw part of the tree. Without this a
 * repository past the cap got "No problems found." for files nothing had read.
 */
import { SCAN_CAP_ENV, scanCap } from '../fs-scan';
import type { Profile } from '../profile';
import type { Finding } from '../report';

export function checkScanCap(profile: Profile): Finding[] {
  if (!profile.filesTruncated) {
    return [];
  }

  return [
    {
      check: 'scan-cap-reached',
      severity: 'warning',
      message: `The repository scan stopped at its safety cap of ${scanCap()} files, so every check here read only part of the tree. A clean result below is not a clean repository.`,
      fix: `Raise the cap with ${SCAN_CAP_ENV}, or run doctor with --cwd on a smaller part of the tree.`,
    },
  ];
}
