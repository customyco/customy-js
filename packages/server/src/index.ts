/**
 * @customyai/server — verificación de identidad de Customy para cualquier
 * servidor, sobre `Request`/`Response` estándar y con adaptador para el
 * `IncomingMessage` de Node. Es el mismo verificador que usan los productos
 * de Customy. Solo servidor: nunca entra en un bundle de navegador.
 */
export { createRemoteJwks, type RemoteJwks, type RemoteJwksOptions } from "./jwks";
export {
    ACCESS_UNAVAILABLE,
    isAccessUnavailable,
    MAX_MACHINE_TOKEN_LIFETIME_SECONDS,
    createAccessTokenVerifier,
    createMachineTokenVerifier,
    machinePrincipalFromClaims,
    type AccessTokenVerifierOptions,
    type KeySource,
    type MachinePrincipal,
    type MachineTokenVerifierOptions,
    type TokenVerifier,
    type UserPrincipal,
} from "./tokens";
export { fetchUserInfo, type UserInfo, type UserInfoOptions } from "./userinfo";
export {
    ACTOR_ASSERTION_HEADER,
    assertActorAssertionSecret,
    createActorAssertionVerifier,
    MAX_ASSERTION_TTL_SECONDS,
    signActorAssertion,
    verifyActorAssertion,
    type ActorAssertion,
    type ActorAssertionOptions,
    type ActorAssertionVerifier,
} from "./assertion";
export {
    bearerToken,
    createRequestVerifier,
    requestFromIncomingMessage,
    verifyIncomingMessage,
    verifyMachineRequest,
    verifyRequest,
    type IncomingMessageLike,
    type RequestPrincipal,
    type VerifyRequestOptions,
} from "./request";
