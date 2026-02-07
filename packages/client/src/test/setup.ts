import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

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
