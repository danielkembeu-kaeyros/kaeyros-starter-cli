import "dotenv/config";
const ORG = process.env.GITHUB_ORG || "kaeyros";
const FRONTEND_REPO = process.env.FRONTEND_REPO || "kaeyros-nextjs-starter";
const BACKEND_REPO = process.env.BACKEND_REPO || "kaeyros-nestjs-starter";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "kaeyros-nestjs-starter";
const frontendUrl = `github:${ORG}/${FRONTEND_REPO}`;
const backendUrl = `github:${ORG}/${BACKEND_REPO}`;
export default {
    frontendUrl,
    backendUrl,
    GITHUB_TOKEN,
};
//# sourceMappingURL=env.js.map