import path from "node:path";

export const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "admin@resume.ai";
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "Smoke123!";

export const ADMIN_STORAGE_STATE = path.resolve(__dirname, ".auth", "admin.json");
