/**
 * Contrato del módulo OPCIONAL de Lottie: quien lo quiera pasa un cargador (`loadLottie`) que
 * resuelve una fábrica. `@customyai/stories-render/lottie` trae una sobre `lottie-web`; la app
 * puede dar la suya. Si no hay cargador, las capas Lottie no se pintan (el resto sí) y el
 * paquete no arrastra ni un byte de Lottie.
 */
export type LottieInstance = { play(): void; pause(): void; destroy(): void };
export type LottieFactory = (container: HTMLElement, url: string, options: { loop: boolean; autoplay: boolean }) => LottieInstance | Promise<LottieInstance>;
export type LottieLoader = () => Promise<LottieFactory>;
