/**
 * La categoría de iOS de un conjunto de botones, igual que la calcula Send para
 * `aps.category`: `cy_` + FNV-1a de 32 bits (hex, sobre unidades UTF-16) de
 * `id:foreground:destructive:auth_required:input` (1/0) de cada botón, ordenados
 * y unidos con «|» — ni las etiquetas, ni las urls, ni el orden cuentan. La app registra con
 * `setNotificationCategoryAsync` (Expo) o `UNNotificationCategory` una categoría
 * con este id por cada juego de botones que use.
 *
 *   actionCategoryId([{ id: "mark_paid", auth_required: true }, { id: "view" }]) // "cy_…"
 */
export type ActionCategoryInput = {
  id: string;
  foreground?: boolean;
  destructive?: boolean;
  auth_required?: boolean;
  input?: unknown;
};

export function actionCategoryId(actions: ActionCategoryInput[]): string {
  const canonical = actions.map((a) => [a.id, a.foreground ? 1 : 0, a.destructive ? 1 : 0, a.auth_required ? 1 : 0, a.input ? 1 : 0].join(":")).sort().join("|");
  let h = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i++) {
    h ^= canonical.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `cy_${h.toString(16).padStart(8, "0")}`;
}
