import { describe, expect, it } from "vitest";

// `@customyai/sdk` es la única instalación: cada ruta de importación reexporta el paquete de su entorno.
// Esta prueba fija qué promete cada una, para que quitar o renombrar una pieza interna no la rompa en silencio.
const expected: Array<[string, () => Promise<Record<string, unknown>>, string[]]> = [
    ["client", () => import("./client"), ["createCustomyClient"]],
    ["client/react", () => import("./client-react"), ["CustomyProvider", "useAuth", "CapabilityGate"]],
    ["native", () => import("./native"), ["createCustomyNativeAuth"]],
    ["native/react", () => import("./native-react"), ["useCustomyNativeAuth"]],
    ["web", () => import("./web"), ["customyAuthProxyHandlers", "getServerSession", "customyMiddleware"]],
    ["server", () => import("./server"), ["verifyWebhookSignature"]],
    ["flags", () => import("./flags"), ["createFlagsClient"]],
    ["openfeature", () => import("./openfeature"), ["CustomyServerProvider"]],
    ["openfeature/web", () => import("./openfeature-web"), ["CustomyWebProvider"]],
    ["provisioning", () => import("./provisioning"), ["createProvisioning"]],
    ["access", () => import("./access"), ["createAccess", "ACCESS_SCOPES"]],
    ["core", () => import("./core"), ["createMachineTokens", "discoverPlatform"]],
];

describe("@customyai/sdk: una instalación, una ruta por entorno", () => {
    it.each(expected)("@customyai/sdk/%s exporta lo que promete", async (_path, load, names) => {
        const module = await load();
        for (const name of names) expect(module, `falta ${name}`).toHaveProperty(name);
    });

    it("los roles y permisos de la app llegan por la misma instalación", async () => {
        const { createAccess } = await import("./access");
        const access = createAccess({ baseUrl: "https://access.example", accessToken: "t", environmentId: "env_1" });
        expect(typeof access.appRoles.list).toBe("function");
        expect(typeof access.appRoles.assignments.assign).toBe("function");
        expect(typeof access.permissions.effective).toBe("function");
    });
});
