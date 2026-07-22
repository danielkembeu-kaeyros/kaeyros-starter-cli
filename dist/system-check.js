import { execaCommandSync } from 'execa';
import os from 'os';
export function checkSystem() {
    const platform = os.platform();
    const pnpmCheck = execaCommandSync('pnpm --version', { reject: false });
    const hasPnpm = pnpmCheck.exitCode === 0;
    const npmCheck = execaCommandSync('npm --version', { reject: false });
    const hasNpm = npmCheck.exitCode === 0;
    let detectedPkgm = null;
    if (hasPnpm)
        detectedPkgm = 'pnpm';
    else if (hasNpm)
        detectedPkgm = 'npm';
    return { platform, hasPnpm, hasNpm, detectedPkgm };
}
//# sourceMappingURL=system-check.js.map