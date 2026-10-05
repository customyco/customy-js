/**
 * @customyai/stories-render/widgets/react — un envoltorio de React para cualquier `mountX` de los widgets de la Ola 3:
 * `const Canvas = createReactWidget(mountCanvas)` y `<Canvas entry={…} onEvent={…} />`. Re-monta si cambia la
 * campaña o su versión; los callbacks pasan por una referencia, así que no obligan a re-montar.
 */
import { useEffect, useRef, type ComponentType } from "react";
import type { WidgetHandle } from "./common";

export type ReactWidgetProps<O extends { entry: { id: string; updated_at?: string } }> = O & { className?: string };

export function createReactWidget<O extends { entry: { id: string; updated_at?: string }; onEvent?: (e: never) => void }>(mount: (container: HTMLElement, options: O) => WidgetHandle): ComponentType<ReactWidgetProps<O>> {
  return function ReactWidget(props: ReactWidgetProps<O>) {
    const host = useRef<HTMLDivElement>(null);
    const latest = useRef(props);
    latest.current = props;
    const { entry, locale, theme, reducedMotion } = props as ReactWidgetProps<O> & { locale?: string; theme?: string; reducedMotion?: boolean };
    useEffect(() => {
      if (!host.current) return;
      const p = latest.current;
      const handle = mount(host.current, { ...p, onEvent: ((e: never) => latest.current.onEvent?.(e)) as O["onEvent"] });
      return () => handle.destroy();
    }, [entry, entry.id, entry.updated_at, locale, theme, reducedMotion]);
    return <div ref={host} className={props.className} />;
  };
}
