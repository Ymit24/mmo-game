import {
  existsSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";

/**
 * Resolves the directory containing shared map JSON files.
 * Works from the server package root at `packages/server`.
 */
function getMapsDirectory(): string {
  return resolve(import.meta.dir, "../../../shared/src/maps");
}

function mapIdToFilename(mapId: string): string {
  return `${mapId.replace(/:/g, "-")}.json`;
}

function filenameToMapId(filename: string): string | null {
  if (!filename.endsWith(".json")) {
    return null;
  }
  const raw = basename(filename, ".json");
  try {
    const content = readFileSync(join(getMapsDirectory(), filename), "utf-8");
    const parsed = JSON.parse(content) as { id?: string };
    return typeof parsed.id === "string" ? parsed.id : raw;
  } catch {
    return raw;
  }
}

export interface MapFileSummary {
  id: string;
  name: string;
  filename: string;
}

export function listMapFiles(): MapFileSummary[] {
  const mapsDir = getMapsDirectory();
  if (!existsSync(mapsDir)) {
    return [];
  }

  const files = readdirSync(mapsDir).filter((f) => f.endsWith(".json"));
  const summaries: MapFileSummary[] = [];

  for (const file of files) {
    try {
      const content = readFileSync(join(mapsDir, file), "utf-8");
      const parsed = JSON.parse(content) as { id?: string; name?: string };
      summaries.push({
        id: typeof parsed.id === "string" ? parsed.id : basename(file, ".json"),
        name: typeof parsed.name === "string" ? parsed.name : file,
        filename: file,
      });
    } catch {
      // skip malformed files
    }
  }

  return summaries;
}

export function readMapFile(mapId: string): unknown | null {
  const mapsDir = getMapsDirectory();
  if (!existsSync(mapsDir)) {
    return null;
  }

  const files = readdirSync(mapsDir).filter((f) => f.endsWith(".json"));
  for (const file of files) {
    try {
      const content = readFileSync(join(mapsDir, file), "utf-8");
      const parsed = JSON.parse(content) as { id?: string };
      if (parsed.id === mapId) {
        return parsed;
      }
    } catch {
      // skip unreadable files
    }
  }

  return null;
}

export function writeMapFile(mapId: string, data: unknown): boolean {
  const mapsDir = getMapsDirectory();
  if (!existsSync(mapsDir)) {
    return false;
  }

  // Try to find existing file for this mapId
  const files = readdirSync(mapsDir).filter((f) => f.endsWith(".json"));
  let targetFile: string | null = null;

  for (const file of files) {
    try {
      const content = readFileSync(join(mapsDir, file), "utf-8");
      const parsed = JSON.parse(content) as { id?: string };
      if (parsed.id === mapId) {
        targetFile = file;
        break;
      }
    } catch {
      // skip unreadable files
    }
  }

  if (!targetFile) {
    targetFile = mapIdToFilename(mapId);
  }

  const filePath = join(mapsDir, targetFile);
  const jsonContent = JSON.stringify(data, null, 2);
  writeFileSync(filePath, `${jsonContent}\n`, "utf-8");
  return true;
}

export function deleteMapFile(mapId: string): boolean {
  const mapsDir = getMapsDirectory();
  if (!existsSync(mapsDir)) {
    return false;
  }

  const files = readdirSync(mapsDir).filter((f) => f.endsWith(".json"));
  for (const file of files) {
    try {
      const content = readFileSync(join(mapsDir, file), "utf-8");
      const parsed = JSON.parse(content) as { id?: string };
      if (parsed.id === mapId) {
        unlinkSync(join(mapsDir, file));
        return true;
      }
    } catch {
      // skip unreadable files
    }
  }

  return false;
}
