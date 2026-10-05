import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { resetGestures } from "./mocks/gesture-handler";
import { resetRn } from "./mocks/react-native";

// Los tests ejecutan componentes de React Native sobre jsdom: `react-native`, Reanimated y Gesture Handler son
// dobles de `test/mocks`. Nada de esto prueba el render nativo; ver «Qué falta para probar en dispositivo» en el README.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  cleanup();
  resetGestures();
  resetRn();
  vi.useRealTimers();
  vi.clearAllMocks();
});
