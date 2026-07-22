import prompts from "prompts";

export async function selectProjectType(): Promise<
  "fullstack" | "frontend" | "backend"
> {
  const { type } = await prompts({
    type: "select",
    name: "type",
    message: "Quel type de projet voulez-vous créer ?",
    choices: [
      { title: "🚀 Fullstack (Next.js + NestJS)", value: "fullstack" },
      { title: "🎨 Frontend uniquement (Next.js)", value: "frontend" },
      { title: "⚙️  Backend uniquement (NestJS)", value: "backend" },
    ],
    initial: 0,
  });
  
  return type || "fullstack";
}

export async function getProjectName(): Promise<string> {
  const { name } = await prompts({
    type: "text",
    name: "name",
    message: "Nom du projet :",
    validate: (value: string) => value.length > 0 || "Le nom est requis",
  });

  return name || "";
}
