import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import ngrok from "@ngrok/ngrok";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });

const DEFAULT_PORT = 3000;
const MANIFEST_PATH = "manifest.json";
const MANIFEST_CONFIG_PATH = ".slack/config.json";
const TEMP_MANIFEST_PATH = ".slack/cache/manifest.temp.json";
const SLACK_EVENTS_PATH = "/api/slack/events";

const authtoken = process.env.NGROK_AUTH_TOKEN;

const getDevPort = async (): Promise<number> => {
  let port = DEFAULT_PORT;

  // Check environment variable first
  if (process.env.PORT) {
    const envPort = parseInt(process.env.PORT, 10);
    if (!Number.isNaN(envPort) && envPort > 0) {
      port = envPort;
    }
  }

  // Check package.json dev script for --port flag
  try {
    const packageJson = JSON.parse(await fs.readFile("package.json", "utf-8"));
    const devScript = packageJson.scripts?.dev;
    if (devScript) {
      const portMatch = devScript.match(/--port\s+(\d+)/);
      if (portMatch) {
        const scriptPort = parseInt(portMatch[1], 10);
        if (!Number.isNaN(scriptPort) && scriptPort > 0) {
          port = scriptPort;
        }
      }
    }
  } catch {
    // Silently ignore package.json read errors
  }

  return port;
};

const isManifestConfigLocal = async (): Promise<boolean> => {
  const manifest = JSON.parse(await fs.readFile(MANIFEST_CONFIG_PATH, "utf-8"));
  return manifest?.manifest?.source === "local";
};

const startNgrok = async (): Promise<ngrok.Listener> => {
  return await ngrok.connect({
    authtoken,
    addr: await getDevPort(),
  });
};

const backupManifest = async (manifestContent: string): Promise<void> => {
  try {
    await fs.writeFile(TEMP_MANIFEST_PATH, manifestContent);
  } catch (error) {
    throw new Error(
      `Failed to backup manifest: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

const removeTempManifest = async (): Promise<void> => {
  try {
    await fs.unlink(TEMP_MANIFEST_PATH);
  } catch {
    // Silently ignore if temp file doesn't exist
  }
};

const restoreManifest = async (): Promise<void> => {
  try {
    const manifest = await fs.readFile(TEMP_MANIFEST_PATH, "utf-8");
    await fs.writeFile(MANIFEST_PATH, manifest);
  } catch (error) {
    throw new Error(
      `Failed to restore manifest: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

interface ManifestUpdateResult {
  updated: boolean;
  originalContent: string;
}

interface SlackManifest {
  features: {
    slash_commands: Array<{ url: string }>;
  };
  settings: {
    event_subscriptions: { request_url: string };
    interactivity: { request_url: string };
  };
}

const updateManifestUrls = (manifest: SlackManifest, newUrl: string): void => {
  manifest.features.slash_commands[0].url = newUrl;
  manifest.settings.event_subscriptions.request_url = newUrl;
  manifest.settings.interactivity.request_url = newUrl;
};

const updateManifest = async (
  url: string | null
): Promise<ManifestUpdateResult> => {
  if (!url) return { updated: false, originalContent: "" };

  try {
    const file = await fs.readFile(MANIFEST_PATH, "utf-8");
    const manifest: SlackManifest = JSON.parse(file);

    const newUrl = `${url}${SLACK_EVENTS_PATH}`;
    const currentUrl = manifest.settings.event_subscriptions.request_url;

    // Skip if URL hasn't changed
    if (currentUrl === newUrl) {
      return { updated: false, originalContent: "" };
    }

    updateManifestUrls(manifest, newUrl);

    await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
    return { updated: true, originalContent: file };
  } catch (error) {
    throw new Error(
      `Failed to update manifest: ${error instanceof Error ? error.message : String(error)}`
    );
  }
};

const cleanup = async (
  client: ngrok.Listener | null,
  manifestWasUpdated: boolean
) => {
  if (client) {
    await client.close();
  }
  if (manifestWasUpdated) {
    await restoreManifest();
    await removeTempManifest();
  }
};

const runDevCommand = () => {
  return spawn("pnpm", ["dev"], { stdio: "inherit" });
};

const main = async () => {
  let client: ngrok.Listener | null = null;
  let manifestWasUpdated = false;
  let isCleaningUp = false;

  const handleExit = async () => {
    if (isCleaningUp) return;
    isCleaningUp = true;
    await cleanup(client, manifestWasUpdated);
    process.exit(0);
  };

  process.on("SIGINT", handleExit);
  process.on("SIGTERM", handleExit);

  try {
    client = await startNgrok();

    // Update manifest and backup original content in one pass
    const { updated, originalContent } = await updateManifest(client.url());
    manifestWasUpdated = updated;

    if (manifestWasUpdated) {
      await backupManifest(originalContent);
    }

    console.log(
      "\x1b[90m✨ Manifest is set to local in .slack/config.json. Webhook events will be sent to your local tunnel URL: \x1b[36m%s\x1b[0m",
      `${client.url()}/api/slack/events`
    );
    const devProcess = runDevCommand();

    // Keep the script running while pnpm dev is active
    await new Promise<void>((resolve) => {
      devProcess.on("exit", () => {
        resolve();
      });
    });
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error starting ngrok tunnel:", error.message);
    } else {
      console.error("Error starting ngrok tunnel:", error);
    }
  } finally {
    if (!isCleaningUp) {
      await cleanup(client, manifestWasUpdated);
    }
  }
};

const runDevWithExit = () => {
  const devProcess = runDevCommand();

  const handleExit = () => {
    if (devProcess) {
      devProcess.kill("SIGINT");
    }
    process.exit(0);
  };

  process.on("SIGINT", handleExit);
  process.on("SIGTERM", handleExit);
};

void (async () => {
  const manifestIsLocal = await isManifestConfigLocal();

  if (manifestIsLocal && authtoken) {
    // Token and manifest is local - proceed as normal
    void main();
  } else if (manifestIsLocal && !authtoken) {
    // No token but manifest is local - dev has messed up, don't do local and warn them
    console.warn(
      "\x1b[33m\x1b[3m%s\x1b[0m",
      "⚠  Manifest is set to local in .slack/config.json but NGROK_AUTH_TOKEN is missing. Webhook events will not be sent to your local server."
    );
    runDevWithExit();
  } else {
    // Manifest isn't local - warn it isn't
    console.warn(
      "\x1b[33m\x1b[3m%s\x1b[0m",
      "⚠  Manifest is set to remote in .slack/config.json. Webhook events will not be sent to your local server."
    );
    runDevWithExit();
  }
})();
