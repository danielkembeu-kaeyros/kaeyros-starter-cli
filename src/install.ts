import { execa } from 'execa';
import { join } from 'path';

export async function installDependencies(projectName: string, mode: string, pkgm: string) {
  const installCmd = pkgm === 'npm' ? 'npm' : pkgm; // bun/yarn/pnpm utilisent leur propre cmd
  const installArgs = ['install'];

  if (mode === 'fullstack') {
    console.log('\n📦 Installation des dépendances Frontend...');

    await execa(installCmd, installArgs, { 
      cwd: join(process.cwd(), projectName, 'frontend'), 
      stdio: 'inherit' // Affiche la progression en temps réel
    });

    console.log('\n📦 Installation des dépendances Backend...');

    await execa(installCmd, installArgs, { 
      cwd: join(process.cwd(), projectName, 'backend'), 
      stdio: 'inherit' 
    });

  } else {
    console.log(`\n📦 Installation des dépendances avec ${pkgm}...`);
    
    await execa(installCmd, installArgs, { 
      cwd: join(process.cwd(), projectName), 
      stdio: 'inherit' 
    });
  }
  
  console.log('\n✅ Installation terminée !');
}   