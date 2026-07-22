import download from "download-git-repo";
import { promisify } from "util";
import env from "./env.js";

const downloadAsync = promisify(download);

export async function downloadTemplate(repoUrl: string, destination: string) {
  // Vérifiez si un token est présent dans les variables d'environnement
  const token = env.GITHUB_TOKEN;

  // Optionnel : Si le repo est privé, on peut devoir modifier l'URL ou passer le token
  // download-git-repo lit souvent GITHUB_TOKEN automatiquement,
  // mais pour être sûr avec des repos privés, on peut forcer l'auth via l'URL si nécessaire.
  // Format sécurisé : https://oauth2:TOKEN@github.com/USER/REPO

  let finalUrl = repoUrl;

  if (token && repoUrl.startsWith("github:")) {
    // Transformation pour authentification directe si nécessaire
    // Ex: github:user/repo -> https://oauth2:TOKEN@github.com/user/repo
    const parts = repoUrl.replace("github:", "").split("/");

    if (parts.length === 2) {
      finalUrl = `https://oauth2:${token}@github.com/${parts[0]}/${parts[1]}`;
      // Note: download-git-repo gère parfois mieux le format direct avec token dans l'URL pour le privé
    }
  }

  // Utilisation de clone: false pour télécharger via ZIP (plus rapide, pas besoin de git installé)
  // Si échec avec ZIP sur repo privé, passez à { clone: true } (nécessite git installé et config ssh/token git global)
  await downloadAsync(finalUrl, destination, { clone: false });
}
