import { existsSync, cpSync } from "fs";
import path from "path";
const templatesSrc = path.resolve("templates");
const distDir = path.resolve("dist");
const templatesDest = path.join(distDir, "templates");
if (existsSync(distDir)) {
    if (existsSync(templatesSrc)) {
        cpSync(templatesSrc, templatesDest, { recursive: true });
        console.log(`✅ Dossier "templates" copié dans "dist/templates".`);
    }
    else {
        console.warn(`⚠️  Le dossier "templates" source est introuvable.`);
    }
}
else {
    console.warn(`⚠️  Le dossier "dist" est introuvable. Aucun build effectué ?`);
}
//# sourceMappingURL=post-build.js.map