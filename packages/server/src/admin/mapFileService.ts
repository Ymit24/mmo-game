import {
  existsSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, isAbsolute, relative, resolve } from "node:path";

const MAP_ID_PATTERN = /^[a-z0-9][a-z0-9:_-]{0,63}$/;

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

function isPathInsideDirectory(path: string, directory: string): boolean {
  const relativePath = relative(directory, path);
  return (
    relativePath.length > 0 &&
    !relativePath.startsWith("..") &&
    !isAbsolute(relativePath)
  );
}

function resolveMapPath(mapsDir: string, filename: string): string | null {
  const filePath = resolve(mapsDir, filename);
  if (!isPathInsideDirectory(filePath, mapsDir)) {
    return null;
  }
  return filePath;
}

function readJsonFile(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

export function isValidMapId(mapId: string): boolean {
  return (
    MAP_ID_PATTERN.test(mapId) &&
    !mapId.includes("..") &&
    !mapId.includes("/") &&
    !mapId.includes("\\")
  );
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
    const filePath = resolveMapPath(mapsDir, file);
    if (!filePath) {
      continue;
    }

    try {
      const parsed = readJsonFile(filePath) as { id?: string; name?: string };
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
  if (!isValidMapId(mapId)) {
    return null;
  }

  const mapsDir = getMapsDirectory();
  if (!existsSync(mapsDir)) {
    return null;
  }

  const files = readdirSync(mapsDir).filter((f) => f.endsWith(".json"));
  for (const file of files) {
    const filePath = resolveMapPath(mapsDir, file);
    if (!filePath) {
      continue;
    }

    try {
      const parsed = readJsonFile(filePath) as { id?: string };
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
  if (!isValidMapId(mapId)) {
    return false;
  }

  const mapsDir = getMapsDirectory();
  if (!existsSync(mapsDir)) {
    return false;
  }

  // Try to find existing file for this mapId
  const files = readdirSync(mapsDir).filter((f) => f.endsWith(".json"));
  let targetFile: string | null = null;

  for (const file of files) {
    const filePath = resolveMapPath(mapsDir, file);
    if (!filePath) {
      continue;
    }

    try {
      const parsed = readJsonFile(filePath) as { id?: string };
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

  const filePath = resolveMapPath(mapsDir, targetFile);
  if (!filePath) {
    return false;
  }

  const jsonContent = JSON.stringify(data, null, 2);
  writeFileSync(filePath, `${jsonContent}\n`, "utf-8");
  return true;
}

export function deleteMapFile(mapId: string): boolean {
  if (!isValidMapId(mapId)) {
    return false;
  }

  const mapsDir = getMapsDirectory();
  if (!existsSync(mapsDir)) {
    return false;
  }

  const files = readdirSync(mapsDir).filter((f) => f.endsWith(".json"));
  for (const file of files) {
    const filePath = resolveMapPath(mapsDir, file);
    if (!filePath) {
      continue;
    }

    try {
      const parsed = readJsonFile(filePath) as { id?: string };
      if (parsed.id === mapId) {
        unlinkSync(filePath);
        return true;
      }
    } catch {
      // skip unreadable files
    }
  }

  return false;
}
