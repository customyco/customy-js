import { describe, expect, it } from "vitest";
import {
    accessCookieBasePrefix,
    accessCookieEnvTag,
    accessCookieNames,
    accessCookiePrefix,
    isAccessSessionCookieName,
    parseAccessCookieName,
} from "./cookies";

describe("Access cookie names", () => {
    it("derives the environment tag and prefixes from APP_ENV", () => {
        expect(accessCookieEnvTag("staging")).toBe("stg");
        expect(accessCookieEnvTag("production")).toBe("prd");
        expect(accessCookieEnvTag("local")).toBe("dev");
        expect(accessCookieEnvTag(undefined)).toBe("dev");
        expect(accessCookieBasePrefix("production")).toBe("customy-prd");
        expect(accessCookiePrefix("staging")).toBe("customy-stg");
        expect(accessCookiePrefix("staging", "env_1234567890")).toBe("customy-stg-env_1234");
        expect(accessCookiePrefix("staging", null)).toBe("customy-stg");
    });

    it("builds secure and plain names for a prefix", () => {
        expect(accessCookieNames("customy-prd")).toEqual(["__Secure-customy-prd.session_token", "customy-prd.session_token"]);
        expect(accessCookieNames("customy-stg-env_1234", "state")).toEqual(["__Secure-customy-stg-env_1234.state", "customy-stg-env_1234.state"]);
    });

    it("parses base and application-scoped cookies and rejects anything else", () => {
        expect(parseAccessCookieName("__Secure-customy-prd.session_token")).toEqual({
            secure: true, prefix: "customy-prd", envTag: "prd", environmentIdPrefix: null, kind: "session_token",
        });
        expect(parseAccessCookieName("customy-stg-env_1234.state")).toEqual({
            secure: false, prefix: "customy-stg-env_1234", envTag: "stg", environmentIdPrefix: "env_1234", kind: "state",
        });
        expect(parseAccessCookieName("customy-qa.session_token")).toBeNull();
        expect(parseAccessCookieName("other.session_token")).toBeNull();
        expect(parseAccessCookieName("customy-prd.session_token.extra")).toBeNull();
    });

    it("recognizes only session cookies as sessions", () => {
        expect(isAccessSessionCookieName("__Secure-customy-dev-29375589.session_token")).toBe(true);
        expect(isAccessSessionCookieName("customy-prd.state")).toBe(false);
        expect(isAccessSessionCookieName("session_token")).toBe(false);
    });
});
