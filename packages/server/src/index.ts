/**
 * @customyai/server — verificación de identidad de Customy para cualquier
 * servidor, sobre `Request`/`Response` estándar y con adaptador para el
 * `IncomingMessage` de Node. Es el mismo verificador que usan los productos
 * de Customy. Solo servidor: nunca entra en un bundle de navegador.
 */
export { createRemoteJwks, type RemoteJwks, type RemoteJwksOptions } from "./jwks";
export {
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
export {
    ACTOR_ASSERTION_HEADER,
    MAX_ASSERTION_TTL_SECONDS,
    signActorAssertion,
    verifyActorAssertion,
    type ActorAssertion,
    type ActorAssertionOptions,
} from "./assertion";
export {
    bearerToken,
    requestFromIncomingMessage,
    verifyIncomingMessage,
    verifyMachineRequest,
    verifyRequest,
    type IncomingMessageLike,
    type RequestPrincipal,
    type VerifyRequestOptions,
} from "./request";
