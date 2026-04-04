import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const lanHttpsPfxFile = path.resolve(process.cwd(), ".certs", "misgarot-lan-dev.pfx");
const lanHttpsPassphraseFile = path.resolve(process.cwd(), ".certs", "misgarot-lan-dev.pass.txt");

function resolveLanHttpsOptions() {
  if (process.env.MISGAROT_DEV_HTTPS !== "1") return undefined;
  if (!fsSync.existsSync(lanHttpsPfxFile) || !fsSync.existsSync(lanHttpsPassphraseFile)) return undefined;
  try {
    return {
      pfx: fsSync.readFileSync(lanHttpsPfxFile),
      passphrase: fsSync.readFileSync(lanHttpsPassphraseFile, "utf8").trim(),
    };
  } catch {
    return undefined;
  }
}

function systemTemplateOverridesPlugin() {
  const route = "/api/system-template-overrides";
  const overridesFile = path.resolve(process.cwd(), "public", "systemTemplateOverrides.json");
  const emptyStore = () => ({ overrides: {}, additions: {}, deletedIds: [] });
  const localAssetUrlRe = /^(?:https?:\/\/(?:127\.0\.0\.1|0\.0\.0\.0|localhost|192\.168(?:\.\d{1,3}){2}|10(?:\.\d{1,3}){3}|172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?::\d+)?)(\/(?:elements-14\.3|bg-images|assets)\/[^?#]+)([?#].*)?$/i;
  const localAssetRelativeRe = /^(?:\.\/)?((?:elements-14\.3|bg-images|assets)\/.+)$/i;

  function normalizeScalarString(value) {
    if (typeof value !== "string") return value;
    const raw = value.trim();
    if (!raw) return value;
    const relMatch = raw.match(localAssetRelativeRe);
    if (relMatch) return `/${relMatch[1]}`;
    const absMatch = raw.match(localAssetUrlRe);
    if (absMatch) return `${absMatch[1]}${absMatch[2] || ""}`;
    return value;
  }

  function normalizeDeep(value) {
    if (typeof value === "string") return normalizeScalarString(value);
    if (Array.isArray(value)) return value.map(normalizeDeep);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, normalizeDeep(inner)]));
  }

  function normalizeRecordMap(parsed) {
    if (!parsed || typeof parsed !== "object") return {};
    const entries = Array.isArray(parsed)
      ? parsed.map((tpl) => [tpl?.id, tpl])
      : Object.entries(parsed);
    return Object.fromEntries(
      entries
        .filter(([id, tpl]) => !!id && tpl && typeof tpl === "object")
        .map(([id, tpl]) => [id, normalizeDeep({ ...tpl, id })])
    );
  }

  function normalizeStore(parsed) {
    if (!parsed || typeof parsed !== "object") return emptyStore();
    const candidate = parsed.store && typeof parsed.store === "object" ? parsed.store : parsed;
    const hasStructuredKeys = (
      Object.prototype.hasOwnProperty.call(candidate, "overrides")
      || Object.prototype.hasOwnProperty.call(candidate, "additions")
      || Object.prototype.hasOwnProperty.call(candidate, "deletedIds")
    );
    if (!hasStructuredKeys) {
      return {
        overrides: normalizeRecordMap(candidate),
        additions: {},
        deletedIds: [],
      };
    }
    return {
      overrides: normalizeRecordMap(candidate.overrides),
      additions: normalizeRecordMap(candidate.additions),
      deletedIds: Array.isArray(candidate.deletedIds)
        ? [...new Set(candidate.deletedIds.map((id) => String(id || "").trim()).filter(Boolean))]
        : [],
    };
  }

  async function ensureOverridesFile() {
    await fs.mkdir(path.dirname(overridesFile), { recursive: true });
    try {
      await fs.access(overridesFile);
    } catch {
      await fs.writeFile(overridesFile, `${JSON.stringify(emptyStore(), null, 2)}\n`, "utf8");
    }
  }

  async function readOverrides() {
    await ensureOverridesFile();
    try {
      const raw = await fs.readFile(overridesFile, "utf8");
      const parsed = JSON.parse(raw || "{}");
      return normalizeStore(parsed);
    } catch {
      return emptyStore();
    }
  }

  async function writeOverrides(overrides) {
    await ensureOverridesFile();
    await fs.writeFile(overridesFile, `${JSON.stringify(normalizeStore(overrides), null, 2)}\n`, "utf8");
  }

  function withJson(res, statusCode, payload) {
    res.statusCode = statusCode;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify(payload));
  }

  async function handleRequest(req, res, next) {
    if (!req.url || !req.url.startsWith(route)) {
      next();
      return;
    }

    if (req.method === "GET") {
      withJson(res, 200, { store: await readOverrides() });
      return;
    }

    if (req.method !== "POST") {
      withJson(res, 405, { error: "Method not allowed" });
      return;
    }

    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) {
        req.destroy();
      }
    });
    req.on("end", async () => {
      try {
        const parsed = JSON.parse(body || "{}");
        const store = normalizeStore(parsed?.store ?? parsed?.overrides ?? parsed);
        if (!store || typeof store !== "object" || Array.isArray(store)) {
          withJson(res, 400, { error: "Invalid store payload" });
          return;
        }
        await writeOverrides(store);
        withJson(res, 200, { ok: true, store });
      } catch (error) {
        withJson(res, 500, { error: error instanceof Error ? error.message : "Failed to save system template store" });
      }
    });
  }

  return {
    name: "system-template-overrides-api",
    configureServer(server) {
      server.middlewares.use(handleRequest);
    },
    configurePreviewServer(server) {
      server.middlewares.use(handleRequest);
    },
  };
}

const lanHttps = resolveLanHttpsOptions();
const devPort = Number(process.env.MISGAROT_DEV_PORT || 2001);
const previewPort = Number(process.env.MISGAROT_PREVIEW_PORT || 4173);

export default defineConfig({
  base: '/SweetLight/',
  plugins: [react(), systemTemplateOverridesPlugin()],
  build: {
    target: ["es2019", "safari13"],
    cssTarget: "safari13",
  },
  server: {
    host: "0.0.0.0",
    port: devPort,
    ...(lanHttps ? { https: lanHttps } : {}),
  },
  preview: {
    host: "0.0.0.0",
    port: previewPort,
    ...(lanHttps ? { https: lanHttps } : {}),
  },
});
