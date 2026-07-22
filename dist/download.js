import download from "download-git-repo";
import { promisify } from "util";
import env from "./env.js";
const downloadAsync = promisify(download);
export async function downloadTemplate(repoUrl, destination) {
    const token = env.GITHUB_TOKEN;
    let finalUrl = repoUrl;
    if (token && repoUrl.startsWith("github:")) {
        const parts = repoUrl.replace("github:", "").split("/");
        if (parts.length === 2) {
            finalUrl = `https://oauth2:${token}@github.com/${parts[0]}/${parts[1]}`;
        }
    }
    await downloadAsync(finalUrl, destination, { clone: false });
}
//# sourceMappingURL=download.js.map