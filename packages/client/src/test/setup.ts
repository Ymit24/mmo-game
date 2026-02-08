import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

function createInMemoryStorage(): Storage {
  const map = new Map<string, string>();

  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.has(key) ? (map.get(key) ?? null) : null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

function hasStorageApi(value: unknown): value is Storage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<Storage>;

  return (
    typeof candidate.getItem === "function" &&
    typeof candidate.setItem === "function" &&
    typeof candidate.removeItem === "function" &&
    typeof candidate.clear === "function"
  );
}

function installStoragePolyfill(): void {
  const current = globalThis.localStorage;
  const usable = hasStorageApi(current);

  if (usable) {
    try {
      current.setItem("__storage_probe__", "1");
      current.removeItem("__storage_probe__");
      return;
    } catch {
      // Fall through and replace broken storage implementation.
    }
  }

  const fallbackStorage = createInMemoryStorage();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: fallbackStorage,
  });

  if (typeof window !== "undefined") {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: fallbackStorage,
    });
  }
}

installStoragePolyfill();

const mockContext2D = new Proxy(
  {
    fillStyle: "#000",
    strokeStyle: "#000",
    globalCompositeOperation: "source-over",
    getImageData: () =>
      ({
        data: new Uint8ClampedArray([0, 0, 0, 255]),
      }) as ImageData,
    putImageData: () => {},
    createImageData: () =>
      ({
        data: new Uint8ClampedArray([0, 0, 0, 255]),
      }) as ImageData,
    measureText: () => ({ width: 0 }) as TextMetrics,
    createRadialGradient: () => ({
      addColorStop: () => {},
    }),
    createLinearGradient: () => ({
      addColorStop: () => {},
    }),
  },
  {
    get(target, prop) {
      if (prop in target) {
        return target[prop as keyof typeof target];
      }

      return () => {};
    },
  },
) as unknown as CanvasRenderingContext2D;

Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
  value: (contextId: string) => {
    if (contextId === "2d") {
      return mockContext2D;
    }

    return null;
  },
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});
