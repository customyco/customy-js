/**
 * Un solo punto de entrada al núcleo compartido: este paquete NO duplica nada de `@customyai/stories-render`
 * (máquina de estados, orden, visto, precarga, gestos, layout, animación, a11y y cliente de placements/eventos);
 * lo reutiliza y lo vuelve a exportar para el modo headless.
 */
export * from "@customyai/stories-render";
export * from "@customyai/stories-render/client";
