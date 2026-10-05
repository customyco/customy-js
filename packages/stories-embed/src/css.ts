/**
 * Estilos del embed sin `style=` en línea. Orden de preferencia (compatible con una CSP estricta):
 *   1. `injectStyles: false` → la página enlaza `customy-stories-embed.css` con un <link> (CSP `style-src 'self'`).
 *   2. Hoja construible (`adoptedStyleSheets`): no es una etiqueta ni un atributo, la CSP no la bloquea.
 *   3. <style nonce="…"> con el `nonce` que declara la CSP (`style-src 'nonce-…'`).
 * Los componentes del renderer pintan con la API CSSOM (`el.style.x = …`), que `style-src` tampoco bloquea.
 */
export type CssOptions = { doc: Document; id: string; css: string; nonce?: string };

export function injectCss({ doc, id, css, nonce }: CssOptions): void {
  const win = doc.defaultView as (Window & typeof globalThis) | null;
  if (doc.querySelector(`style[data-cs-embed="${id}"]`)) return;
  const Sheet = win?.CSSStyleSheet as (typeof CSSStyleSheet & { prototype: { replaceSync?: (t: string) => void } }) | undefined;
  const adoptable = !nonce && !!Sheet && typeof Sheet.prototype.replaceSync === "function" && "adoptedStyleSheets" in doc;
  if (adoptable) {
    try {
      const sheet = new Sheet();
      sheet.replaceSync(css);
      const d = doc as Document & { adoptedStyleSheets: CSSStyleSheet[] };
      d.adoptedStyleSheets = [...d.adoptedStyleSheets, sheet];
      return;
    } catch {
      /* cae a <style> */
    }
  }
  const style = doc.createElement("style");
  style.setAttribute("data-cs-embed", id);
  if (nonce) style.setAttribute("nonce", nonce);
  style.textContent = css;
  doc.head.append(style);
}
