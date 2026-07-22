import { execa } from 'execa';
import { join } from 'path';
export async function installDependencies(projectName, mode, pkgm) {
    const installCmd = pkgm === 'npm' ? 'npm' : pkgm;
    const installArgs = ['install'];
    if (mode === 'fullstack') {
        console.log('\n📦 Installation des dépendances Frontend...');
        await execa(installCmd, installArgs, {
            cwd: join(process.cwd(), projectName, 'frontend'),
            stdio: 'inherit'
        });
        console.log('\n📦 Installation des dépendances Backend...');
        await execa(installCmd, installArgs, {
            cwd: join(process.cwd(), projectName, 'backend'),
            stdio: 'inherit'
        });
    }
    else {
        console.log(`\n📦 Installation des dépendances avec ${pkgm}...`);
        await execa(installCmd, installArgs, {
            cwd: join(process.cwd(), projectName),
            stdio: 'inherit'
        });
    }
    console.log('\n✅ Installation terminée !');
}
//# sourceMappingURL=install.js.map