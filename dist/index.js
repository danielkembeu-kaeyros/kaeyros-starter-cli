#!/usr/bin/env node
import { Command } from "commander";
import { installDependencies } from "./install.js";
import ora from "ora";
import chalk from "chalk";
import { checkSystem } from "./system-check.js";
import { getProjectName } from "./prompts.js";
import { fileURLToPath } from "url";
import path from "path";
const program = new Command();
program
    .name("create-kaeyros-app")
    .description("Scaffold un projet Kaeyros (Next.js, NestJS ou Fullstack)")
    .argument("[project-name]", "Nom du projet")
    .option("-f, --fullstack", "Mode Fullstack (Next.js + NestJS)")
    .option("-fr, --frontend", "Mode Frontend uniquement (Next.js)")
    .option("-b, --backend", "Mode Backend uniquement (NestJS)")
    .option("--pkgm <manager>", "Gestionnaire de paquets (pnpm, npm, yarn, bun)", "pnpm")
    .option("-i, --install", "Installer les dépendances immédiatement", false)
    .action(async (_projectName, options) => {
    const sys = checkSystem();
    if (!sys.detectedPkgm) {
        console.error(chalk.red("\n❌ Erreur critique : Aucun gestionnaire de paquets détecté."));
        console.error(chalk.yellow("   Pour utiliser ce CLI, vous devez installer au moins npm ou pnpm."));
        console.error(chalk.blue("\n   Suggestions :"));
        console.error("   - Installer pnpm : npm install -g pnpm");
        console.error("   - Installer Node.js (inclut npm) : https://nodejs.org/\n");
        process.exit(1);
    }
    const validPkgm = ["pnpm", "npm", "yarn", "bun"];
    let pkgm;
    if (options.pkgm && validPkgm.includes(options.pkgm)) {
        pkgm = options.pkgm;
    }
    else if (options.pkgm && !validPkgm.includes(options.pkgm)) {
        console.warn(chalk.yellow(`\n⚠️  "${options.pkgm}" n'est pas un gestionnaire reconnu. Utilisation de "${sys.detectedPkgm}".`));
        pkgm = sys.detectedPkgm;
    }
    else {
        pkgm = sys.detectedPkgm;
    }
    if (pkgm === "pnpm" && !sys.hasPnpm) {
        console.error(chalk.red(`❌ Vous avez demandé 'pnpm' mais il n'est pas installé.`));
        process.exit(1);
    }
    if (pkgm === "npm" && !sys.hasNpm) {
        console.error(chalk.red(`❌ Vous avez demandé 'npm' mais il n'est pas installé.`));
        process.exit(1);
    }
    let projectName = _projectName;
    if (!projectName) {
        projectName = await getProjectName();
        if (!projectName) {
            console.error(chalk.red("❌ Le nom du projet est requis."));
            process.exit(1);
        }
    }
    let mode = "fullstack";
    if (options.frontend && !options.backend && !options.fullstack) {
        mode = "frontend";
    }
    else if (options.backend && !options.frontend && !options.fullstack) {
        mode = "backend";
    }
    else if (options.fullstack) {
        mode = "fullstack";
    }
    console.log(`\n🚀 Initialisation de ${chalk.bold(projectName)} en mode ${chalk.bold(mode)}...`);
    console.log(`📦 Package Manager: ${chalk.bold(pkgm)}`);
    if (options.install) {
        console.log(`⚙️  Installation automatique des dépendances activée.\n`);
    }
    const spinner = ora("Téléchargement des templates...").start();
    try {
        const fs = await import("fs/promises");
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const templatesDir = path.join(__dirname, "templates");
        const rootDir = process.cwd();
        async function ensurePathExists(p, label) {
            try {
                await fs.access(p);
                return true;
            }
            catch {
                spinner.fail("Échec du scaffolding.");
                console.error(chalk.red(`\n❌ Template manquant : ${label}\n  Chemin introuvable : ${p}\n\n` +
                    `Vérifiez que le CLI publié contient bien le dossier "templates" dans le dossier "dist" :\n` +
                    `  ${chalk.bold(templatesDir)}\n` +
                    `  Et le template "${label}".\n` +
                    `  Si ce problème persiste, il s'agit d'un oubli de packaging lors du build/npm publish.\n`));
                process.exit(1);
            }
        }
        if (mode === "fullstack") {
            const frontendSrc = path.join(templatesDir, "nextjs-starter-template");
            const backendSrc = path.join(templatesDir, "nestjs-starter-template");
            const frontendDest = path.join(rootDir, projectName, "frontend");
            const backendDest = path.join(rootDir, projectName, "backend");
            await Promise.all([
                ensurePathExists(frontendSrc, "nextjs-starter-template"),
                ensurePathExists(backendSrc, "nestjs-starter-template"),
            ]);
            await fs.cp(frontendSrc, frontendDest, { recursive: true });
            await fs.cp(backendSrc, backendDest, { recursive: true });
        }
        else if (mode === "frontend") {
            const frontendSrc = path.join(templatesDir, "nextjs-starter-template");
            const frontendDest = path.join(rootDir, projectName);
            await ensurePathExists(frontendSrc, "nextjs-starter-template");
            await fs.cp(frontendSrc, frontendDest, { recursive: true });
        }
        else if (mode === "backend") {
            const backendSrc = path.join(templatesDir, "nestjs-starter-template");
            const backendDest = path.join(rootDir, projectName);
            await ensurePathExists(backendSrc, "nestjs-starter-template");
            await fs.cp(backendSrc, backendDest, { recursive: true });
        }
        spinner.succeed("Templates téléchargés avec succès !");
        if (options.install) {
            await installDependencies(projectName, mode, pkgm);
        }
        else {
            console.log(chalk.blue("\n💡 Prochaines étapes :"));
            console.log(`   cd ${projectName}`);
            console.log(`   ${pkgm} install`);
            if (mode === "fullstack") {
                console.log("   (Répétez l'installation dans ./frontend et ./backend si nécessaire)");
            }
        }
    }
    catch (error) {
        spinner.fail("Échec du scaffolding.");
        if (typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "ENOENT" &&
            "path" in error) {
            console.error(chalk.red(`❌ Fichier ou dossier introuvable : ${error.path}\n` +
                `  Veuillez vérifier que les templates nécessaires existent bien dans le CLI publié (dans dist/templates).\n` +
                `  Par exemple :\n    ${chalk.bold("templates/nextjs-starter-template")}\n    ${chalk.bold("templates/nestjs-starter-template")}\n`));
        }
        else {
            console.error(error);
        }
        process.exit(1);
    }
});
program.parse();
//# sourceMappingURL=index.js.map