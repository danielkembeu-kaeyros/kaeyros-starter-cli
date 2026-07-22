#!/usr/bin/env node
import { Command } from "commander";
import { installDependencies } from "./install.js";
import ora from "ora";
import chalk from "chalk";
import { checkSystem } from "./system-check.js";
import { getProjectName } from "./prompts.js"; // MAJ : import de la nouvelle fonction getProjectName

const program = new Command();

program
  .name("create-kaeyros-app")
  .description("Scaffold un projet Kaeyros (Next.js, NestJS ou Fullstack)")
  .argument("[project-name]", "Nom du projet")
  .option("-f, --fullstack", "Mode Fullstack (Next.js + NestJS)")
  .option("-fr, --frontend", "Mode Frontend uniquement (Next.js)")
  .option("-b, --backend", "Mode Backend uniquement (NestJS)")
  .option(
    "--pkgm <manager>",
    "Gestionnaire de paquets (pnpm, npm, yarn, bun)",
    "pnpm",
  )
  .option("-i, --install", "Installer les dépendances immédiatement", false)
  .action(async (_projectName, options) => {
    // 1. Vérification du système
    const sys = checkSystem();

    if (!sys.detectedPkgm) {
      console.error(
        chalk.red(
          "\n❌ Erreur critique : Aucun gestionnaire de paquets détecté.",
        ),
      );
      console.error(
        chalk.yellow(
          "   Pour utiliser ce CLI, vous devez installer au moins npm ou pnpm.",
        ),
      );
      console.error(chalk.blue("\n   Suggestions :"));
      console.error("   - Installer pnpm : npm install -g pnpm");
      console.error(
        "   - Installer Node.js (inclut npm) : https://nodejs.org/\n",
      );

      process.exit(1);
    }

    // 2. Détermination & validation du package manager
    const validPkgm = ["pnpm", "npm", "yarn", "bun"];
    let pkgm: string;

    if (options.pkgm && validPkgm.includes(options.pkgm)) {
      pkgm = options.pkgm;
    } else if (options.pkgm && !validPkgm.includes(options.pkgm)) {
      console.warn(
        chalk.yellow(
          `\n⚠️  "${options.pkgm}" n'est pas un gestionnaire reconnu. Utilisation de "${sys.detectedPkgm}".`,
        ),
      );

      pkgm = sys.detectedPkgm;
    } else {
      pkgm = sys.detectedPkgm;
    }

    // Vérification si le package manager choisi est installé sur le système
    if (pkgm === "pnpm" && !sys.hasPnpm) {
      console.error(
        chalk.red(`❌ Vous avez demandé 'pnpm' mais il n'est pas installé.`),
      );

      process.exit(1);
    }
    if (pkgm === "npm" && !sys.hasNpm) {
      console.error(
        chalk.red(`❌ Vous avez demandé 'npm' mais il n'est pas installé.`),
      );

      process.exit(1);
    }
    // Pour yarn/bun, ajoutez les vérifications si nécessaire ici

    // 3. Validation du nom du projet
    let projectName = _projectName;
    if (!projectName) {
      projectName = await getProjectName();
      if (!projectName) {
        console.error(chalk.red("❌ Le nom du projet est requis."));
        process.exit(1);
      }
    }

    // 4. Détermination du mode de scaffold
    let mode = "fullstack"; // Défaut

    if (options.frontend && !options.backend && !options.fullstack) {
      mode = "frontend";
    } else if (options.backend && !options.frontend && !options.fullstack) {
      mode = "backend";
    } else if (options.fullstack) {
      mode = "fullstack";
    }
    // Si plusieurs options sont fournies, priorité à fullstack > frontend > backend (déjà respecté)

    console.log(
      `\n🚀 Initialisation de ${chalk.bold(projectName)} en mode ${chalk.bold(mode)}...`,
    );
    console.log(`📦 Package Manager: ${chalk.bold(pkgm)}`);

    if (options.install) {
      console.log(`⚙️  Installation automatique des dépendances activée.\n`);
    }

    // 5. Exécution du scaffold et gestion de l'installation
    const spinner = ora("Téléchargement des templates...").start();

    try {
      const fs = await import("fs/promises");
      const path = await import("path");

      // Résout le chemin absolu du dossier courant
      const rootDir = process.cwd();
      const templatesDir = path.join(rootDir, "templates");

      if (mode === "fullstack") {
        // Copie le template Next.js dans frontend et NestJS dans backend
        const frontendSrc = path.join(templatesDir, "nextjs-starter-template");
        const backendSrc = path.join(templatesDir, "nestjs-starter-template");
        const frontendDest = path.join(rootDir, projectName, "frontend");
        const backendDest = path.join(rootDir, projectName, "backend");
        await fs.cp(frontendSrc, frontendDest, { recursive: true });
        await fs.cp(backendSrc, backendDest, { recursive: true });
      } else if (mode === "frontend") {
        // Copie uniquement le template Next.js
        const frontendSrc = path.join(templatesDir, "nextjs-starter-template");
        const frontendDest = path.join(rootDir, projectName);
        await fs.cp(frontendSrc, frontendDest, { recursive: true });
      } else if (mode === "backend") {
        // Copie uniquement le template NestJS
        const backendSrc = path.join(templatesDir, "nestjs-starter-template");
        const backendDest = path.join(rootDir, projectName);
        await fs.cp(backendSrc, backendDest, { recursive: true });
      }

      spinner.succeed("Templates téléchargés avec succès !");

      if (options.install) {
        await installDependencies(projectName, mode, pkgm);
      } else {
        console.log(chalk.blue("\n💡 Prochaines étapes :"));
        console.log(`   cd ${projectName}`);
        console.log(`   ${pkgm} install`);

        if (mode === "fullstack") {
          console.log(
            "   (Répétez l'installation dans ./frontend et ./backend si nécessaire)",
          );
        }
      }
    } catch (error) {
      spinner.fail("Échec du scaffolding.");
      console.error(error);

      process.exit(1);
    }
  });

program.parse();
