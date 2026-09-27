import { z } from "zod";

/**
 * Cómo agrega un meter sus eventos. Módulo propio y sin dependencias además de
 * zod: lo comparten el catálogo de entitlements y el manifiesto `app/v1`, que
 * viaja copiado en la CLI pública (`@customyai/cli`) sin arrastrar el catálogo.
 */
export const EntitlementMeterAggregationSchema = z.enum(["sum", "count", "last"]);
