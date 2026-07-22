import { execaCommandSync } from 'execa';
import os from 'os';

export interface SystemInfo {
  platform: string;
  hasPnpm: boolean;
  hasNpm: boolean;
  detectedPkgm: string | null;
}

export function checkSystem(): SystemInfo {
  const platform = os.platform(); // 'linux', 'darwin', 'win32'
  
  // Vérification non-bloquante de pnpm
  const pnpmCheck = execaCommandSync('pnpm --version', { reject: false });
  const hasPnpm = pnpmCheck.exitCode === 0;

  // Vérification non-bloquante de npm (toujours présent avec Node, mais on vérifie)
  const npmCheck = execaCommandSync('npm --version', { reject: false });
  const hasNpm = npmCheck.exitCode === 0;

  // Logique de détection automatique
  // Priorité à pnpm s'il est installé, sinon npm.
  let detectedPkgm: string | null = null;
  
  if (hasPnpm) detectedPkgm = 'pnpm';
  else if (hasNpm) detectedPkgm = 'npm';

  return { platform, hasPnpm, hasNpm, detectedPkgm };
}   