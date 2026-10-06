/* eslint-disable */
/**
 * Operaciones públicas de Customy Access: método, ruta y parámetros de query.
 * Generado; no editar a mano.
 */

export const ACCESS_OPERATIONS = {
  /** Adopt or rotate a customer-supplied key */
  adoptOrgCustomerKey: { method: "POST", path: "/api/admin/env/{envId}/orgs/{orgId}/customer-key" },
  /** Create a company region or site */
  createWorkspaceOperatingUnit: { method: "POST", path: "/api/access/v1/workspace/operating-units" },
  /** Delete workspace saved view */
  deleteAccessWorkspaceSavedViewsId: { method: "DELETE", path: "/api/access/v1/workspace/saved-views/{id}" },
  /** Delete application */
  deleteApplicationsId: { method: "DELETE", path: "/api/admin/applications/{id}" },
  /** Delete auth session resource */
  deleteAuthWildcard: { method: "DELETE", path: "/api/auth/{wildcard}" },
  /** Unlink my account provider */
  deleteEnvEnvIdAccountLinkingMyProvidersProviderId: { method: "DELETE", path: "/api/v1/env/{envId}/account-linking/my-providers/{providerId}" },
  /** Unlink user account provider */
  deleteEnvEnvIdAccountLinkingUserIdProviderId: { method: "DELETE", path: "/api/v1/env/{envId}/account-linking/{userId}/{providerId}" },
  /** Delete agent identity */
  deleteEnvEnvIdAgentIdentitiesAgentId: { method: "DELETE", path: "/api/admin/env/{envId}/agent-identities/{agentId}" },
  /** Delete API key */
  deleteEnvEnvIdApiKeysKeyId: { method: "DELETE", path: "/api/admin/env/{envId}/api-keys/{keyId}" },
  /** Delete approval substitute */
  deleteEnvEnvIdApprovalSubstitutesSubId: { method: "DELETE", path: "/api/admin/env/{envId}/approval-substitutes/{subId}" },
  /** Delete approval workflow */
  deleteEnvEnvIdApprovalWorkflowsWfId: { method: "DELETE", path: "/api/admin/env/{envId}/approval-workflows/{wfId}" },
  /** Delete branding template */
  deleteEnvEnvIdBrandingTemplateCatalogTemplateKey: { method: "DELETE", path: "/api/admin/env/{envId}/branding/template-catalog/{templateKey}" },
  /** Archive auth experience widget */
  deleteEnvEnvIdBrandingWidgetsWidgetKey: { method: "DELETE", path: "/api/admin/env/{envId}/branding/widgets/{widgetKey}" },
  /** Delete conditional assignment */
  deleteEnvEnvIdConditionalAssignmentsRuleId: { method: "DELETE", path: "/api/admin/env/{envId}/conditional-assignments/{ruleId}" },
  /** Delete identity-provider connection */
  deleteEnvEnvIdConnectionsConnId: { method: "DELETE", path: "/api/admin/env/{envId}/connections/{connId}" },
  /** Delete stored credential */
  deleteEnvEnvIdCredentialsCredentialId: { method: "DELETE", path: "/api/admin/env/{envId}/credentials/{credentialId}" },
  /** Delete credential grant */
  deleteEnvEnvIdCredentialsCredentialIdGrantsGrantId: { method: "DELETE", path: "/api/admin/env/{envId}/credentials/{credentialId}/grants/{grantId}" },
  /** Delete scoped delegation */
  deleteEnvEnvIdDelegationsDelegId: { method: "DELETE", path: "/api/admin/env/{envId}/delegations/{delegId}" },
  /** Delete custom domain */
  deleteEnvEnvIdDomainsDomainId: { method: "DELETE", path: "/api/admin/env/{envId}/domains/{domainId}" },
  /** Delete email template */
  deleteEnvEnvIdEmailTemplatesTemplateKey: { method: "DELETE", path: "/api/admin/env/{envId}/email-templates/{templateKey}" },
  /** Delete dynamic group rule */
  deleteEnvEnvIdGroupsDynamicRulesRuleId: { method: "DELETE", path: "/api/admin/env/{envId}/groups/dynamic-rules/{ruleId}" },
  /** Delete group */
  deleteEnvEnvIdGroupsGroupId: { method: "DELETE", path: "/api/admin/env/{envId}/groups/{groupId}" },
  /** Remove group member */
  deleteEnvEnvIdGroupsGroupIdMembersUserId: { method: "DELETE", path: "/api/admin/env/{envId}/groups/{groupId}/members/{userId}" },
  /** Remove group role */
  deleteEnvEnvIdGroupsGroupIdRolesRoleId: { method: "DELETE", path: "/api/admin/env/{envId}/groups/{groupId}/roles/{roleId}" },
  /** Delete impersonation actor token */
  deleteEnvEnvIdImpersonationActorTokensTokenId: { method: "DELETE", path: "/api/v1/env/{envId}/impersonation/actor-tokens/{tokenId}" },
  /** Delete email integration */
  deleteEnvEnvIdIntegrationsEmailId: { method: "DELETE", path: "/api/admin/env/{envId}/integrations/email/{id}" },
  /** Delete integration provider secret */
  deleteEnvEnvIdIntegrationsProvidersProviderIdSecretsEnvKey: { method: "DELETE", path: "/api/admin/env/{envId}/integrations/providers/{providerId}/secrets/{envKey}" },
  /** Delete SMS integration */
  deleteEnvEnvIdIntegrationsSmsId: { method: "DELETE", path: "/api/admin/env/{envId}/integrations/sms/{id}" },
  /** Delete invitation */
  deleteEnvEnvIdInvitationsInvitationId: { method: "DELETE", path: "/api/admin/env/{envId}/invitations/{invitationId}" },
  /** Delete limit definition */
  deleteEnvEnvIdLimitDefinitionsDefId: { method: "DELETE", path: "/api/admin/env/{envId}/limit-definitions/{defId}" },
  /** Delete limit override */
  deleteEnvEnvIdLimitsLimitId: { method: "DELETE", path: "/api/admin/env/{envId}/limits/{limitId}" },
  /** Delete admin log stream */
  deleteEnvEnvIdLogStreamsStreamId: { method: "DELETE", path: "/api/v1/admin/env/{envId}/log-streams/{streamId}" },
  /** Delete log stream */
  deleteEnvEnvIdLogStreamsStreamId2: { method: "DELETE", path: "/api/v1/env/{envId}/log-streams/{streamId}" },
  /** Delete member limit */
  deleteEnvEnvIdMemberLimitsLimitId: { method: "DELETE", path: "/api/admin/env/{envId}/member-limits/{limitId}" },
  /** Delete member permission */
  deleteEnvEnvIdMemberPermissionsPermissionId: { method: "DELETE", path: "/api/admin/env/{envId}/member-permissions/{permissionId}" },
  /** Delete member restriction */
  deleteEnvEnvIdMemberRestrictionsRestrictionId: { method: "DELETE", path: "/api/admin/env/{envId}/member-restrictions/{restrictionId}" },
  /** Delete workspace entitlement override */
  deleteEnvEnvIdOrgsOrgIdEntitlementOverrideId: { method: "DELETE", path: "/api/admin/env/{envId}/orgs/{orgId}/entitlement-override/{id}" },
  /** Delete workspace price override */
  deleteEnvEnvIdOrgsOrgIdPriceOverrideId: { method: "DELETE", path: "/api/admin/env/{envId}/orgs/{orgId}/price-override/{id}" },
  /** Delete passkey */
  deleteEnvEnvIdPasskeysPasskeyId: { method: "DELETE", path: "/api/admin/env/{envId}/passkeys/{passkeyId}" },
  /** Delete permission */
  deleteEnvEnvIdPermissionsPermissionId: { method: "DELETE", path: "/api/admin/env/{envId}/permissions/{permissionId}" },
  /** Delete policy */
  deleteEnvEnvIdPoliciesPolicyId: { method: "DELETE", path: "/api/admin/env/{envId}/policies/{policyId}" },
  /** Remove policy subject */
  deleteEnvEnvIdPoliciesPolicyIdSubjectsSubjectId: { method: "DELETE", path: "/api/admin/env/{envId}/policies/{policyId}/subjects/{subjectId}" },
  /** Delete relationship tuple */
  deleteEnvEnvIdRelationships: { method: "DELETE", path: "/api/admin/env/{envId}/relationships" },
  /** Delete role assignment */
  deleteEnvEnvIdRoleAssignmentsAssignmentId: { method: "DELETE", path: "/api/admin/env/{envId}/role-assignments/{assignmentId}" },
  /** Delete role constraint */
  deleteEnvEnvIdRoleConstraintsConstraintId: { method: "DELETE", path: "/api/admin/env/{envId}/role-constraints/{constraintId}" },
  /** Delete role */
  deleteEnvEnvIdRolesRoleId: { method: "DELETE", path: "/api/admin/env/{envId}/roles/{roleId}" },
  /** Remove role permission */
  deleteEnvEnvIdRolesRoleIdPermissionsRpId: { method: "DELETE", path: "/api/admin/env/{envId}/roles/{roleId}/permissions/{rpId}" },
  /** Delete SCIM config */
  deleteEnvEnvIdScimConfigsConfigId: { method: "DELETE", path: "/api/admin/env/{envId}/scim-configs/{configId}" },
  /** Delete SCIM group-role mapping */
  deleteEnvEnvIdScimConfigsConfigIdGroupRoleMappingsMappingId: { method: "DELETE", path: "/api/admin/env/{envId}/scim-configs/{configId}/group-role-mappings/{mappingId}" },
  /** Delete IP access rule */
  deleteEnvEnvIdSecurityIpAccessRuleId: { method: "DELETE", path: "/api/admin/env/{envId}/security/ip-access/{ruleId}" },
  /** Delete session */
  deleteEnvEnvIdSessionsSessionId: { method: "DELETE", path: "/api/admin/env/{envId}/sessions/{sessionId}" },
  /** Delete SIEM config */
  deleteEnvEnvIdSiemConfigConfigId: { method: "DELETE", path: "/api/admin/env/{envId}/siem-config/{configId}" },
  /** Delete token exchange policy */
  deleteEnvEnvIdTokenExchangePoliciesPolicyId: { method: "DELETE", path: "/api/admin/env/{envId}/token/exchange-policies/{policyId}" },
  /** Delete token exchange */
  deleteEnvEnvIdTokenExchangesExchangeId: { method: "DELETE", path: "/api/admin/env/{envId}/token/exchanges/{exchangeId}" },
  /** Delete user */
  deleteEnvEnvIdUsersUserId: { method: "DELETE", path: "/api/admin/env/{envId}/users/{userId}" },
  /** Remove user role */
  deleteEnvEnvIdUsersUserIdRolesRoleId: { method: "DELETE", path: "/api/admin/env/{envId}/users/{userId}/roles/{roleId}" },
  /** Delete user sessions */
  deleteEnvEnvIdUsersUserIdSessions: { method: "DELETE", path: "/api/admin/env/{envId}/users/{userId}/sessions" },
  /** Delete user sessions via v1 admin API */
  deleteEnvEnvIdUsersUserIdSessions2: { method: "DELETE", path: "/api/v1/admin/env/{envId}/users/{userId}/sessions" },
  /** Delete webhook */
  deleteEnvEnvIdWebhooksWebhookId: { method: "DELETE", path: "/api/admin/env/{envId}/webhooks/{webhookId}" },
  /** Delete workflow */
  deleteEnvEnvIdWorkflowsWorkflowId: { method: "DELETE", path: "/api/admin/env/{envId}/workflows/{workflowId}" },
  /** Delete workforce member */
  deleteEnvEnvIdWorkforceMembersId: { method: "DELETE", path: "/api/admin/env/{envId}/workforce-members/{id}" },
  /** Delete environment */
  deleteEnvironmentsId: { method: "DELETE", path: "/api/admin/environments/{id}" },
  /** Revoke my OAuth consent */
  deleteMeConsentsConsentId: { method: "DELETE", path: "/api/v1/me/consents/{consentId}" },
  /** Delete organization */
  deleteOrganizationsId: { method: "DELETE", path: "/api/admin/organizations/{id}" },
  /** Delete platform policy config */
  deletePolicyConfigId: { method: "DELETE", path: "/api/admin/policy-config/{id}" },
  /** Delete project */
  deleteProjectsId: { method: "DELETE", path: "/api/admin/projects/{id}" },
  /** Delete SCIM group */
  deleteScimV2EnvEnvIdGroupsGroupId: { method: "DELETE", path: "/api/scim/v2/env/{envId}/Groups/{groupId}" },
  /** Delete SCIM user */
  deleteScimV2EnvEnvIdUsersUserId: { method: "DELETE", path: "/api/scim/v2/env/{envId}/Users/{userId}" },
  /** Delete trusted origin */
  deleteTrustedOriginsOriginId: { method: "DELETE", path: "/api/admin/trusted-origins/{originId}" },
  /** Delete current user session */
  deleteUserSessionsSessionId: { method: "DELETE", path: "/api/v1/user/sessions/{sessionId}" },
  /** Get V1 Ui Layout */
  getAccessUiLayout: { method: "GET", path: "/api/access/v1/ui/layout", query: ["limit","cursor"] },
  /** Get V1 Ui Theme */
  getAccessUiTheme: { method: "GET", path: "/api/access/v1/ui/theme", query: ["limit","cursor"] },
  /** Get V1 Workspace Experiments */
  getAccessWorkspaceExperiments: { method: "GET", path: "/api/access/v1/workspace/experiments", query: ["limit","cursor"] },
  /** Get V1 Workspace Feature Flags */
  getAccessWorkspaceFeatureFlags: { method: "GET", path: "/api/access/v1/workspace/feature-flags", query: ["limit","cursor"] },
  /** Get Workspace Layouts Current */
  getAccessWorkspaceLayoutsCurrent: { method: "GET", path: "/api/access/v1/workspace/layouts/current", query: ["limit","cursor"] },
  /** Get V1 Workspace Preferences */
  getAccessWorkspacePreferences: { method: "GET", path: "/api/access/v1/workspace/preferences", query: ["limit","cursor"] },
  /** Get V1 Workspace Regional */
  getAccessWorkspaceRegional: { method: "GET", path: "/api/access/v1/workspace/regional", query: ["limit","cursor"] },
  /** Get V1 Workspace Saved Views */
  getAccessWorkspaceSavedViews: { method: "GET", path: "/api/access/v1/workspace/saved-views", query: ["limit","cursor"] },
  /** Get V1 Workspace Sdui Documents */
  getAccessWorkspaceSduiDocuments: { method: "GET", path: "/api/access/v1/workspace/sdui-documents", query: ["limit","cursor"] },
  /** Get V1 Workspace Sdui Documents */
  getAccessWorkspaceSduiDocumentsKey: { method: "GET", path: "/api/access/v1/workspace/sdui-documents/{key}" },
  /** Get Admin Applications Dependencies */
  getApplicationsAppIdDependencies: { method: "GET", path: "/api/admin/applications/{appId}/dependencies", query: ["limit","cursor"] },
  /** Get Admin Applications Dependency Candidates */
  getApplicationsAppIdDependencyCandidates: { method: "GET", path: "/api/admin/applications/{appId}/dependency-candidates", query: ["limit","cursor"] },
  /** Get Api Auth Connection Test */
  getAuthConnectionTest: { method: "GET", path: "/api/auth/connection-test", query: ["limit","cursor"] },
  /** Get Auth Device List */
  getAuthDeviceList: { method: "GET", path: "/api/auth/device/list", query: ["limit","cursor"] },
  /** Get Auth Device Pending */
  getAuthDevicePending: { method: "GET", path: "/api/auth/device/pending", query: ["limit","cursor"] },
  /** Check if current session is an impersonation session */
  getAuthImpersonationStatus: { method: "GET", path: "/api/auth/impersonation/status", query: ["limit","cursor"] },
  /** Get Api Auth */
  getAuthWildcard: { method: "GET", path: "/api/auth/{wildcard}" },
  /** Get Api Admin Authorize Scope */
  getAuthorizeScope: { method: "GET", path: "/api/admin/authorize-scope", query: ["limit","cursor"] },
  /** Get Admin Commercial Products */
  getCommercialProducts: { method: "GET", path: "/api/admin/commercial/products", query: ["limit","cursor"] },
  /** Get Commercial Products Bindings */
  getCommercialProductsProductKeyBindings: { method: "GET", path: "/api/admin/commercial/products/{productKey}/bindings", query: ["limit","cursor"] },
  /** Get Commercial Products Catalog */
  getCommercialProductsProductKeyCatalog: { method: "GET", path: "/api/admin/commercial/products/{productKey}/catalog", query: ["limit","cursor"] },
  /** Get Commercial Products Context */
  getCommercialProductsProductKeyContext: { method: "GET", path: "/api/admin/commercial/products/{productKey}/context", query: ["limit","cursor"] },
  /** Get Api Admin Console */
  getConsole: { method: "GET", path: "/api/admin/console", query: ["limit","cursor"] },
  /** Get Oauth Google Callback */
  getCredentialsOauthGoogleCallback: { method: "GET", path: "/api/admin/credentials/oauth/google/callback", query: ["limit","cursor"] },
  /** Get Admin Data Isolation Activity */
  getDataIsolationActivity: { method: "GET", path: "/api/v1/admin/data-isolation/activity", query: ["limit","cursor"] },
  /** Get Admin Data Isolation Operations */
  getDataIsolationOperations: { method: "GET", path: "/api/v1/admin/data-isolation/operations", query: ["limit","cursor"] },
  /** Get Data Isolation Operations Facets */
  getDataIsolationOperationsFacets: { method: "GET", path: "/api/v1/admin/data-isolation/operations/facets", query: ["limit","cursor"] },
  /** Get Admin Data Isolation Operations */
  getDataIsolationOperationsOperationId: { method: "GET", path: "/api/v1/admin/data-isolation/operations/{operationId}" },
  /** Get Data Isolation Operations Replay Preview */
  getDataIsolationOperationsReplayPreview: { method: "GET", path: "/api/v1/admin/data-isolation/operations/replay-preview", query: ["limit","cursor"] },
  /** Get Admin Data Isolation Overview */
  getDataIsolationOverview: { method: "GET", path: "/api/v1/admin/data-isolation/overview", query: ["limit","cursor"] },
  /** Get V1 Decision Reasons */
  getDecisionReasons: { method: "GET", path: "/api/v1/decision/reasons", query: ["limit","cursor"] },
  /** Get V1 Directory Members */
  getDirectoryMembers: { method: "GET", path: "/api/v1/directory/members", query: ["limit","cursor"] },
  /** Get Api Docs */
  getDocs: { method: "GET", path: "/api/docs" },
  /** Get agent-safe OpenAPI tool manifest */
  getDocsAgentTools: { method: "GET", path: "/api/docs/agent-tools" },
  /** Get OpenAPI contract debt promotion backlog */
  getDocsContractDebt: { method: "GET", path: "/api/docs/contract-debt" },
  /** Get OpenAPI quality coverage */
  getDocsCoverage: { method: "GET", path: "/api/docs/coverage" },
  /** Get OpenAPI domain map */
  getDocsDomains: { method: "GET", path: "/api/docs/domains" },
  /** Get Api Docs Json */
  getDocsJson: { method: "GET", path: "/api/docs/json" },
  /** Get OpenAPI world-class readiness gates */
  getDocsReadiness: { method: "GET", path: "/api/docs/readiness" },
  /** Get Docs Static Index.Html */
  getDocsStaticIndexHtml: { method: "GET", path: "/api/docs/static/index.html" },
  /** Get Docs Static Swagger Initializer.Js */
  getDocsStaticSwaggerInitializerJs: { method: "GET", path: "/api/docs/static/swagger-initializer.js" },
  /** Get Swagger UI static asset */
  getDocsStaticWildcard: { method: "GET", path: "/api/docs/static/{wildcard}" },
  /** Get Api Docs Yaml */
  getDocsYaml: { method: "GET", path: "/api/docs/yaml" },
  /** Get Ecosystem Acceptance Audit */
  getEcosystemAcceptanceAudit: { method: "GET", path: "/api/admin/ecosystem/acceptance/audit", query: ["limit","cursor"] },
  /** Get Admin Ecosystem Control Plane */
  getEcosystemControlPlane: { method: "GET", path: "/api/admin/ecosystem/control-plane", query: ["limit","cursor"] },
  /** Get A2a Federation Partners */
  getEnvEnvIdA2aFederationPartners: { method: "GET", path: "/api/admin/env/{envId}/a2a/federation/partners", query: ["limit","cursor"] },
  /** Get A2a Federation Partners */
  getEnvEnvIdA2aFederationPartnersPartnerId: { method: "GET", path: "/api/admin/env/{envId}/a2a/federation/partners/{partnerId}" },
  /** Get Env A2a Payments Posture */
  getEnvEnvIdA2aPaymentsPosture: { method: "GET", path: "/api/admin/env/{envId}/a2a-payments/posture", query: ["limit","cursor"] },
  /** Get Env A2a Posture */
  getEnvEnvIdA2aPosture: { method: "GET", path: "/api/admin/env/{envId}/a2a/posture", query: ["limit","cursor"] },
  /** Get Env A2a Tasks */
  getEnvEnvIdA2aTasks: { method: "GET", path: "/api/admin/env/{envId}/a2a/tasks", query: ["limit","cursor"] },
  /** Get Env A2a Tasks */
  getEnvEnvIdA2aTasksTaskId: { method: "GET", path: "/api/admin/env/{envId}/a2a/tasks/{taskId}" },
  /** Get Env Account Linking Callback */
  getEnvEnvIdAccountLinkingCallback: { method: "GET", path: "/api/v1/env/{envId}/account-linking/callback", query: ["limit","cursor"] },
  /** Get Env Account Linking Config */
  getEnvEnvIdAccountLinkingConfig: { method: "GET", path: "/api/v1/env/{envId}/account-linking/config", query: ["limit","cursor"] },
  /** Get Env Account Linking History */
  getEnvEnvIdAccountLinkingHistory: { method: "GET", path: "/api/v1/env/{envId}/account-linking/history", query: ["limit","cursor"] },
  /** Get Env Account Linking Trust Levels */
  getEnvEnvIdAccountLinkingTrustLevels: { method: "GET", path: "/api/v1/env/{envId}/account-linking/trust-levels", query: ["limit","cursor"] },
  /** Get Env Account Linking History */
  getEnvEnvIdAccountLinkingUserIdHistory: { method: "GET", path: "/api/v1/env/{envId}/account-linking/{userId}/history", query: ["limit","cursor"] },
  /** Get Env Account Linking Providers */
  getEnvEnvIdAccountLinkingUserIdProviders: { method: "GET", path: "/api/v1/env/{envId}/account-linking/{userId}/providers", query: ["limit","cursor"] },
  /** Get Env Agency Guardrails */
  getEnvEnvIdAgencyGuardrails: { method: "GET", path: "/api/admin/env/{envId}/agency/guardrails", query: ["limit","cursor"] },
  /** Get Env Agency Plans */
  getEnvEnvIdAgencyPlans: { method: "GET", path: "/api/admin/env/{envId}/agency/plans" },
  /** Get Env Agency Plans */
  getEnvEnvIdAgencyPlansCodeVersion: { method: "GET", path: "/api/admin/env/{envId}/agency/plans/{code}/{version}" },
  /** Get Env Agent Governance Posture */
  getEnvEnvIdAgentGovernancePosture: { method: "GET", path: "/api/admin/env/{envId}/agent-governance/posture", query: ["limit","cursor"] },
  /** Get Admin Env Agent Identities */
  getEnvEnvIdAgentIdentities: { method: "GET", path: "/api/admin/env/{envId}/agent-identities", query: ["limit","cursor"] },
  /** Get Admin Env Agent Identities */
  getEnvEnvIdAgentIdentitiesAgentId: { method: "GET", path: "/api/admin/env/{envId}/agent-identities/{agentId}" },
  /** Get Env Agent Identities Extended Agent Card */
  getEnvEnvIdAgentIdentitiesAgentIdExtendedAgentCard: { method: "GET", path: "/api/admin/env/{envId}/agent-identities/{agentId}/extended-agent-card", query: ["limit","cursor"] },
  /** Get Admin Env Agents */
  getEnvEnvIdAgents: { method: "GET", path: "/api/admin/env/{envId}/agents", query: ["limit","cursor"] },
  /** Get Agents Commerce Posture */
  getEnvEnvIdAgentsAgentIdCommercePosture: { method: "GET", path: "/api/admin/env/{envId}/agents/{agentId}/commerce/posture", query: ["limit","cursor"] },
  /** Get Agents Commerce Transactions */
  getEnvEnvIdAgentsAgentIdCommerceTransactions: { method: "GET", path: "/api/admin/env/{envId}/agents/{agentId}/commerce/transactions", query: ["limit","cursor"] },
  /** Get Agents Commerce Transactions */
  getEnvEnvIdAgentsAgentIdCommerceTransactionsTransactionId: { method: "GET", path: "/api/admin/env/{envId}/agents/{agentId}/commerce/transactions/{transactionId}" },
  /** Get Env Agents Risk Posture */
  getEnvEnvIdAgentsAgentIdRiskPosture: { method: "GET", path: "/api/admin/env/{envId}/agents/{agentId}/risk-posture", query: ["limit","cursor"] },
  /** Get Agents Ciba Requests */
  getEnvEnvIdAgentsCibaRequests: { method: "GET", path: "/api/admin/env/{envId}/agents/ciba/requests", query: ["limit","cursor"] },
  /** Get Agents Ciba Requests */
  getEnvEnvIdAgentsCibaRequestsRequestId: { method: "GET", path: "/api/admin/env/{envId}/agents/ciba/requests/{requestId}" },
  /** Get Env Agents Delegations */
  getEnvEnvIdAgentsDelegations: { method: "GET", path: "/api/admin/env/{envId}/agents/delegations", query: ["limit","cursor"] },
  /** Get Env Agents Delegations */
  getEnvEnvIdAgentsDelegationsGrantId: { method: "GET", path: "/api/admin/env/{envId}/agents/delegations/{grantId}" },
  /** Get Agents Delegations Posture */
  getEnvEnvIdAgentsDelegationsPosture: { method: "GET", path: "/api/admin/env/{envId}/agents/delegations/posture", query: ["limit","cursor"] },
  /** Get Env Agents Sessions */
  getEnvEnvIdAgentsSessions: { method: "GET", path: "/api/admin/env/{envId}/agents/sessions", query: ["limit","cursor"] },
  /** Get Env Agents Sessions */
  getEnvEnvIdAgentsSessionsSessionId: { method: "GET", path: "/api/admin/env/{envId}/agents/sessions/{sessionId}" },
  /** Get Agents Sessions Continuous Authorization */
  getEnvEnvIdAgentsSessionsSessionIdContinuousAuthorization: { method: "GET", path: "/api/admin/env/{envId}/agents/sessions/{sessionId}/continuous-authorization", query: ["limit","cursor"] },
  /** Get Agents Token Vault Consents */
  getEnvEnvIdAgentsTokenVaultConsents: { method: "GET", path: "/api/admin/env/{envId}/agents/token-vault/consents", query: ["limit","cursor"] },
  /** Get Agents Token Vault Consents */
  getEnvEnvIdAgentsTokenVaultConsentsConsentId: { method: "GET", path: "/api/admin/env/{envId}/agents/token-vault/consents/{consentId}" },
  /** Get Agents Token Vault Credentials */
  getEnvEnvIdAgentsTokenVaultCredentials: { method: "GET", path: "/api/admin/env/{envId}/agents/token-vault/credentials", query: ["limit","cursor"] },
  /** Get Agents Token Vault Credentials */
  getEnvEnvIdAgentsTokenVaultCredentialsCredentialId: { method: "GET", path: "/api/admin/env/{envId}/agents/token-vault/credentials/{credentialId}" },
  /** Get Env Ai Agent Auth Overview */
  getEnvEnvIdAiAgentAuthOverview: { method: "GET", path: "/api/admin/env/{envId}/ai-agent-auth/overview", query: ["limit","cursor"] },
  /** Get Admin Env Api Keys */
  getEnvEnvIdApiKeys: { method: "GET", path: "/api/admin/env/{envId}/api-keys", query: ["limit","cursor"] },
  /** Get Env Api Keys Audit */
  getEnvEnvIdApiKeysKeyIdAudit: { method: "GET", path: "/api/admin/env/{envId}/api-keys/{keyId}/audit", query: ["limit","cursor"] },
  /** Get Env Api Keys Usage */
  getEnvEnvIdApiKeysKeyIdUsage: { method: "GET", path: "/api/admin/env/{envId}/api-keys/{keyId}/usage", query: ["limit","cursor"] },
  /** Get Admin Env Application Contract */
  getEnvEnvIdApplicationContract: { method: "GET", path: "/api/admin/env/{envId}/application-contract", query: ["limit","cursor"] },
  /** Get Admin Env Approval Substitutes */
  getEnvEnvIdApprovalSubstitutes: { method: "GET", path: "/api/admin/env/{envId}/approval-substitutes", query: ["limit","cursor"] },
  /** Get Env Approval Substitutes Active */
  getEnvEnvIdApprovalSubstitutesActiveApproverId: { method: "GET", path: "/api/admin/env/{envId}/approval-substitutes/active/{approverId}" },
  /** Get Env Approval Substitutes My */
  getEnvEnvIdApprovalSubstitutesMy: { method: "GET", path: "/api/admin/env/{envId}/approval-substitutes/my", query: ["limit","cursor"] },
  /** Get Admin Env Approval Workflows */
  getEnvEnvIdApprovalWorkflows: { method: "GET", path: "/api/admin/env/{envId}/approval-workflows", query: ["limit","cursor"] },
  /** Get Admin Env Approvals */
  getEnvEnvIdApprovals: { method: "GET", path: "/api/admin/env/{envId}/approvals", query: ["limit","cursor"] },
  /** Get Admin Env Approvals */
  getEnvEnvIdApprovalsApprovalId: { method: "GET", path: "/api/admin/env/{envId}/approvals/{approvalId}" },
  /** Get Env Approvals Steps */
  getEnvEnvIdApprovalsApprovalIdSteps: { method: "GET", path: "/api/admin/env/{envId}/approvals/{approvalId}/steps", query: ["limit","cursor"] },
  /** Get Env Approvals My Pending */
  getEnvEnvIdApprovalsMyPending: { method: "GET", path: "/api/admin/env/{envId}/approvals/my-pending", query: ["limit","cursor"] },
  /** Get Admin Env Audit Log */
  getEnvEnvIdAuditLog: { method: "GET", path: "/api/admin/env/{envId}/audit-log", query: ["limit","cursor"] },
  /** Get Admin Env Audit Logs */
  getEnvEnvIdAuditLogs: { method: "GET", path: "/api/admin/env/{envId}/audit-logs", query: ["limit","cursor"] },
  /** Get Env Audit Logs Export */
  getEnvEnvIdAuditLogsExport: { method: "GET", path: "/api/admin/env/{envId}/audit-logs/export", query: ["limit","cursor"] },
  /** Get Env Audit Stats */
  getEnvEnvIdAuditStats: { method: "GET", path: "/api/admin/env/{envId}/audit/stats", query: ["limit","cursor"] },
  /** Get Admin Env Authorization Model */
  getEnvEnvIdAuthorizationModel: { method: "GET", path: "/api/admin/env/{envId}/authorization-model", query: ["limit","cursor"] },
  /** Get Env Authorization Model Catalog */
  getEnvEnvIdAuthorizationModelCatalog: { method: "GET", path: "/api/admin/env/{envId}/authorization-model/catalog", query: ["limit","cursor"] },
  /** Get Env Authorization Model Package */
  getEnvEnvIdAuthorizationModelPackage: { method: "GET", path: "/api/admin/env/{envId}/authorization-model/package", query: ["limit","cursor"] },
  /** Get Env Authorization Model Versions */
  getEnvEnvIdAuthorizationModelVersions: { method: "GET", path: "/api/admin/env/{envId}/authorization-model/versions", query: ["limit","cursor"] },
  /** Get Env Authorization Model Versions */
  getEnvEnvIdAuthorizationModelVersionsVersion: { method: "GET", path: "/api/admin/env/{envId}/authorization-model/versions/{version}" },
  /** Get Admin Env Authz Audit */
  getEnvEnvIdAuthzAudit: { method: "GET", path: "/api/admin/env/{envId}/authz-audit", query: ["limit","cursor"] },
  /** Get Admin Env Brain Files */
  getEnvEnvIdBrainFiles: { method: "GET", path: "/api/admin/env/{envId}/brain-files", query: ["limit","cursor"] },
  /** Get Admin Env Brain Files */
  getEnvEnvIdBrainFilesAgentIdFileName: { method: "GET", path: "/api/admin/env/{envId}/brain-files/{agentId}/{fileName}" },
  /** Get Env Brain Files Defaults */
  getEnvEnvIdBrainFilesDefaults: { method: "GET", path: "/api/admin/env/{envId}/brain-files/defaults", query: ["limit","cursor"] },
  /** Get Admin Env Branding */
  getEnvEnvIdBranding: { method: "GET", path: "/api/admin/env/{envId}/branding", query: ["limit","cursor"] },
  /** Get Env Branding Template Catalog */
  getEnvEnvIdBrandingTemplateCatalog: { method: "GET", path: "/api/admin/env/{envId}/branding/template-catalog", query: ["limit","cursor"] },
  /** Get Env Branding Widgets */
  getEnvEnvIdBrandingWidgets: { method: "GET", path: "/api/admin/env/{envId}/branding/widgets", query: ["limit","cursor"] },
  /** Get Admin Env Breach Notification Config */
  getEnvEnvIdBreachNotificationConfig: { method: "GET", path: "/api/admin/env/{envId}/breach-notification-config", query: ["limit","cursor"] },
  /** Get Env Brute Force Stats */
  getEnvEnvIdBruteForceStats: { method: "GET", path: "/api/admin/env/{envId}/brute-force/stats", query: ["limit","cursor"] },
  /** Get Admin Env Capability Check */
  getEnvEnvIdCapabilityCheckCapability: { method: "GET", path: "/api/admin/env/{envId}/capability-check/{capability}" },
  /** Get Admin Env Capability Matrix */
  getEnvEnvIdCapabilityMatrix: { method: "GET", path: "/api/admin/env/{envId}/capability-matrix", query: ["limit","cursor"] },
  /** Get Admin Env Catalog */
  getEnvEnvIdCatalog: { method: "GET", path: "/api/admin/env/{envId}/catalog", query: ["limit","cursor"] },
  /** Get Env Catalog Approval Requests */
  getEnvEnvIdCatalogApprovalRequests: { method: "GET", path: "/api/admin/env/{envId}/catalog/approval-requests", query: ["limit","cursor"] },
  /** Get Admin Env Catalog */
  getEnvEnvIdCatalogEntity: { method: "GET", path: "/api/admin/env/{envId}/catalog/{entity}" },
  /** Get Env Catalog Experiments */
  getEnvEnvIdCatalogExperiments: { method: "GET", path: "/api/admin/env/{envId}/catalog/experiments", query: ["limit","cursor"] },
  /** Get Env Catalog Versions */
  getEnvEnvIdCatalogVersions: { method: "GET", path: "/api/admin/env/{envId}/catalog/versions", query: ["limit","cursor"] },
  /** Get Env Catalog Versions */
  getEnvEnvIdCatalogVersionsVersion: { method: "GET", path: "/api/admin/env/{envId}/catalog/versions/{version}" },
  /** Get Env Commercial Agencies */
  getEnvEnvIdCommercialAgencies: { method: "GET", path: "/api/admin/env/{envId}/commercial/agencies" },
  /** Get Env Commercial Relationships */
  getEnvEnvIdCommercialRelationships: { method: "GET", path: "/api/admin/env/{envId}/commercial/relationships" },
  /** Get Env Commercial Relationships */
  getEnvEnvIdCommercialRelationshipsOrgId: { method: "GET", path: "/api/admin/env/{envId}/commercial/relationships/{orgId}" },
  /** Get Admin Env Commercial Usage */
  getEnvEnvIdCommercialUsage: { method: "GET", path: "/api/admin/env/{envId}/commercial-usage", query: ["limit","cursor"] },
  /** Get Admin Env Compliance Report */
  getEnvEnvIdComplianceReport: { method: "GET", path: "/api/admin/env/{envId}/compliance-report", query: ["limit","cursor"] },
  /** Get Env Compliance Report */
  getEnvEnvIdComplianceReport2: { method: "GET", path: "/api/admin/env/{envId}/compliance/report", query: ["limit","cursor"] },
  /** Get Compliance Report Evidence Catalog */
  getEnvEnvIdComplianceReportEvidenceCatalog: { method: "GET", path: "/api/admin/env/{envId}/compliance/report/evidence-catalog", query: ["limit","cursor"] },
  /** Get Compliance Report Export */
  getEnvEnvIdComplianceReportExport: { method: "GET", path: "/api/admin/env/{envId}/compliance/report/export", query: ["limit","cursor"] },
  /** Get Compliance Report Posture */
  getEnvEnvIdComplianceReportPosture: { method: "GET", path: "/api/admin/env/{envId}/compliance/report/posture", query: ["limit","cursor"] },
  /** Get Admin Env Conditional Assignments */
  getEnvEnvIdConditionalAssignments: { method: "GET", path: "/api/admin/env/{envId}/conditional-assignments", query: ["limit","cursor"] },
  /** Get Admin Env Connected Application */
  getEnvEnvIdConnectedApplication: { method: "GET", path: "/api/admin/env/{envId}/connected-application", query: ["limit","cursor"] },
  /** Get V1 Env Connected Application */
  getEnvEnvIdConnectedApplication2: { method: "GET", path: "/api/v1/env/{envId}/connected-application", query: ["limit","cursor"] },
  /** Get Admin Env Connected Applications */
  getEnvEnvIdConnectedApplications: { method: "GET", path: "/api/admin/env/{envId}/connected-applications", query: ["limit","cursor"] },
  /** Get Admin Env Connected Products */
  getEnvEnvIdConnectedProducts: { method: "GET", path: "/api/admin/env/{envId}/connected-products", query: ["limit","cursor"] },
  /** Get Admin Env Connections */
  getEnvEnvIdConnections: { method: "GET", path: "/api/admin/env/{envId}/connections", query: ["limit","cursor"] },
  /** Get Env Connections Callback Uri */
  getEnvEnvIdConnectionsConnIdCallbackUri: { method: "GET", path: "/api/admin/env/{envId}/connections/{connId}/callback-uri", query: ["limit","cursor"] },
  /** Get Env Connections Lifecycle */
  getEnvEnvIdConnectionsConnIdLifecycle: { method: "GET", path: "/api/admin/env/{envId}/connections/{connId}/lifecycle", query: ["limit","cursor"] },
  /** Get Env Connections Stats */
  getEnvEnvIdConnectionsStats: { method: "GET", path: "/api/admin/env/{envId}/connections/stats", query: ["limit","cursor"] },
  /** Get Admin Env Consistency Token */
  getEnvEnvIdConsistencyToken: { method: "GET", path: "/api/admin/env/{envId}/consistency-token", query: ["limit","cursor"] },
  /** Get Env Continuous Authorization Posture */
  getEnvEnvIdContinuousAuthorizationPosture: { method: "GET", path: "/api/admin/env/{envId}/continuous-authorization/posture", query: ["limit","cursor"] },
  /** Get Admin Env Credentials */
  getEnvEnvIdCredentials: { method: "GET", path: "/api/admin/env/{envId}/credentials", query: ["limit","cursor"] },
  /** Get Oauth Google Setup */
  getEnvEnvIdCredentialsOauthGoogleSetup: { method: "GET", path: "/api/admin/env/{envId}/credentials/oauth/google/setup", query: ["limit","cursor"] },
  /** Get Env Cross Org Delegations Posture */
  getEnvEnvIdCrossOrgDelegationsPosture: { method: "GET", path: "/api/admin/env/{envId}/cross-org-delegations/posture", query: ["limit","cursor"] },
  /** Get Env Crypto Agility Posture */
  getEnvEnvIdCryptoAgilityPosture: { method: "GET", path: "/api/admin/env/{envId}/crypto-agility/posture", query: ["limit","cursor"] },
  /** Get Admin Env Data Isolation */
  getEnvEnvIdDataIsolation: { method: "GET", path: "/api/v1/admin/env/{envId}/data-isolation", query: ["limit","cursor"] },
  /** Get Env Data Isolation Activity */
  getEnvEnvIdDataIsolationActivity: { method: "GET", path: "/api/v1/admin/env/{envId}/data-isolation/activity", query: ["limit","cursor"] },
  /** Get Data Isolation Operations Facets */
  getEnvEnvIdDataIsolationOperationsFacets: { method: "GET", path: "/api/v1/admin/env/{envId}/data-isolation/operations/facets", query: ["limit","cursor"] },
  /** Get Env Data Isolation Operations */
  getEnvEnvIdDataIsolationOperationsOperationId: { method: "GET", path: "/api/v1/admin/env/{envId}/data-isolation/operations/{operationId}" },
  /** Get Data Isolation Operations Replay Preview */
  getEnvEnvIdDataIsolationOperationsReplayPreview: { method: "GET", path: "/api/v1/admin/env/{envId}/data-isolation/operations/replay-preview", query: ["limit","cursor"] },
  /** Get Admin Env Decision Log */
  getEnvEnvIdDecisionLog: { method: "GET", path: "/api/admin/env/{envId}/decision-log", query: ["limit","cursor"] },
  /** Get Admin Env Delegations */
  getEnvEnvIdDelegations: { method: "GET", path: "/api/admin/env/{envId}/delegations", query: ["limit","cursor"] },
  /** Get Env Delegations Usage */
  getEnvEnvIdDelegationsDelegIdUsage: { method: "GET", path: "/api/admin/env/{envId}/delegations/{delegId}/usage", query: ["limit","cursor"] },
  /** Get Env Delegations My */
  getEnvEnvIdDelegationsMy: { method: "GET", path: "/api/admin/env/{envId}/delegations/my", query: ["limit","cursor"] },
  /** Get Admin Env Devices */
  getEnvEnvIdDevices: { method: "GET", path: "/api/admin/env/{envId}/devices", query: ["limit","cursor"] },
  /** Get Admin Env Did Registry */
  getEnvEnvIdDidRegistry: { method: "GET", path: "/api/admin/env/{envId}/did-registry", query: ["limit","cursor"] },
  /** Get Admin Env Did Registry */
  getEnvEnvIdDidRegistryDidId: { method: "GET", path: "/api/admin/env/{envId}/did-registry/{didId}" },
  /** Get Env Did Registry Posture */
  getEnvEnvIdDidRegistryPosture: { method: "GET", path: "/api/admin/env/{envId}/did-registry/posture", query: ["limit","cursor"] },
  /** Get Admin Env Domains */
  getEnvEnvIdDomains: { method: "GET", path: "/api/admin/env/{envId}/domains", query: ["limit","cursor"] },
  /** Get Env Domains Posture */
  getEnvEnvIdDomainsDomainIdPosture: { method: "GET", path: "/api/admin/env/{envId}/domains/{domainId}/posture", query: ["limit","cursor"] },
  /** Get Admin Env Email Config */
  getEnvEnvIdEmailConfig: { method: "GET", path: "/api/admin/env/{envId}/email-config", query: ["limit","cursor"] },
  /** Get Admin Env Email Templates */
  getEnvEnvIdEmailTemplates: { method: "GET", path: "/api/admin/env/{envId}/email-templates", query: ["limit","cursor"] },
  /** Get Admin Env Email Templates */
  getEnvEnvIdEmailTemplatesTemplateKey: { method: "GET", path: "/api/admin/env/{envId}/email-templates/{templateKey}" },
  /** Get Admin Env Enterprise Readiness */
  getEnvEnvIdEnterpriseReadiness: { method: "GET", path: "/api/v1/admin/env/{envId}/enterprise-readiness", query: ["limit","cursor"] },
  /** Get Admin Env Entitlements */
  getEnvEnvIdEntitlements: { method: "GET", path: "/api/admin/env/{envId}/entitlements", query: ["limit","cursor"] },
  /** Get Env Eu Ai Act Module */
  getEnvEnvIdEuAiActModule: { method: "GET", path: "/api/admin/env/{envId}/eu-ai-act/module", query: ["limit","cursor"] },
  /** Get Admin Env Explain Permission */
  getEnvEnvIdExplainPermission: { method: "GET", path: "/api/admin/env/{envId}/explain-permission", query: ["limit","cursor"] },
  /** Get Admin Env Flows */
  getEnvEnvIdFlows: { method: "GET", path: "/api/admin/env/{envId}/flows", query: ["limit","cursor"] },
  /** Get Env Gdpr Privacy Config */
  getEnvEnvIdGdprPrivacyConfig: { method: "GET", path: "/api/admin/env/{envId}/gdpr/privacy-config", query: ["limit","cursor"] },
  /** GDPR Compliance Report */
  getEnvEnvIdGdprReport: { method: "GET", path: "/api/v1/admin/env/{envId}/gdpr/report", query: ["limit","cursor"] },
  /** Get Admin Env Groups */
  getEnvEnvIdGroups: { method: "GET", path: "/api/admin/env/{envId}/groups", query: ["limit","cursor"] },
  /** Get Env Groups Dynamic Rules */
  getEnvEnvIdGroupsDynamicRules: { method: "GET", path: "/api/admin/env/{envId}/groups/dynamic-rules", query: ["limit","cursor"] },
  /** Get Env Groups Members */
  getEnvEnvIdGroupsGroupIdMembers: { method: "GET", path: "/api/admin/env/{envId}/groups/{groupId}/members", query: ["limit","cursor"] },
  /** Get Env Groups Roles */
  getEnvEnvIdGroupsGroupIdRoles: { method: "GET", path: "/api/admin/env/{envId}/groups/{groupId}/roles", query: ["limit","cursor"] },
  /** Get Admin Env Hierarchy */
  getEnvEnvIdHierarchy: { method: "GET", path: "/api/admin/env/{envId}/hierarchy", query: ["limit","cursor"] },
  /** Get Env Impersonate History */
  getEnvEnvIdImpersonateHistory: { method: "GET", path: "/api/admin/env/{envId}/impersonate/history", query: ["limit","cursor"] },
  /** List active impersonation sessions */
  getEnvEnvIdImpersonationActive: { method: "GET", path: "/api/v1/env/{envId}/impersonation/active", query: ["limit","cursor"] },
  /** Get impersonation configuration for an organization */
  getEnvEnvIdImpersonationConfig: { method: "GET", path: "/api/v1/env/{envId}/impersonation/config", query: ["limit","cursor"] },
  /** Get impersonation session history with pagination */
  getEnvEnvIdImpersonationHistory: { method: "GET", path: "/api/v1/env/{envId}/impersonation/history", query: ["limit","cursor"] },
  /** Get Admin Env Integration Profile */
  getEnvEnvIdIntegrationProfile: { method: "GET", path: "/api/admin/env/{envId}/integration-profile", query: ["limit","cursor"] },
  /** Get Env Integrations Control Plane */
  getEnvEnvIdIntegrationsControlPlane: { method: "GET", path: "/api/admin/env/{envId}/integrations/control-plane", query: ["limit","cursor"] },
  /** Get Env Integrations Email */
  getEnvEnvIdIntegrationsEmail: { method: "GET", path: "/api/admin/env/{envId}/integrations/email", query: ["limit","cursor"] },
  /** Get Env Integrations Providers */
  getEnvEnvIdIntegrationsProvidersProviderId: { method: "GET", path: "/api/admin/env/{envId}/integrations/providers/{providerId}" },
  /** Get Integrations Providers Secrets */
  getEnvEnvIdIntegrationsProvidersProviderIdSecrets: { method: "GET", path: "/api/admin/env/{envId}/integrations/providers/{providerId}/secrets", query: ["limit","cursor"] },
  /** Get Env Integrations Sms */
  getEnvEnvIdIntegrationsSms: { method: "GET", path: "/api/admin/env/{envId}/integrations/sms", query: ["limit","cursor"] },
  /** Get Integrations Tool Platform Overview */
  getEnvEnvIdIntegrationsToolPlatformOverview: { method: "GET", path: "/api/admin/env/{envId}/integrations/tool-platform/overview", query: ["limit","cursor"] },
  /** Get Admin Env Invitations */
  getEnvEnvIdInvitations: { method: "GET", path: "/api/admin/env/{envId}/invitations", query: ["limit","cursor"] },
  /** Get Admin Env Limit Definitions */
  getEnvEnvIdLimitDefinitions: { method: "GET", path: "/api/admin/env/{envId}/limit-definitions", query: ["limit","cursor"] },
  /** Get Admin Env Limits */
  getEnvEnvIdLimits: { method: "GET", path: "/api/admin/env/{envId}/limits", query: ["limit","cursor"] },
  /** Get Env Limits Usage */
  getEnvEnvIdLimitsUsage: { method: "GET", path: "/api/admin/env/{envId}/limits/usage", query: ["limit","cursor"] },
  /** Get Admin Env Log Streams */
  getEnvEnvIdLogStreams: { method: "GET", path: "/api/v1/admin/env/{envId}/log-streams", query: ["limit","cursor"] },
  /** Get V1 Env Log Streams */
  getEnvEnvIdLogStreams2: { method: "GET", path: "/api/v1/env/{envId}/log-streams", query: ["limit","cursor"] },
  /** Get Env Log Streams Contract */
  getEnvEnvIdLogStreamsContract: { method: "GET", path: "/api/v1/admin/env/{envId}/log-streams/contract", query: ["limit","cursor"] },
  /** Get Env Log Streams Contract */
  getEnvEnvIdLogStreamsContract2: { method: "GET", path: "/api/v1/env/{envId}/log-streams/contract", query: ["limit","cursor"] },
  /** Get Admin Env Machine Identities */
  getEnvEnvIdMachineIdentities: { method: "GET", path: "/api/admin/env/{envId}/machine-identities", query: ["limit","cursor"] },
  /** Get Env Mcp Clients */
  getEnvEnvIdMcpClients: { method: "GET", path: "/api/admin/env/{envId}/mcp/clients", query: ["limit","cursor"] },
  /** Get Env Mcp Clients */
  getEnvEnvIdMcpClientsClientId: { method: "GET", path: "/api/admin/env/{envId}/mcp/clients/{clientId}" },
  /** Get Mcp Clients Metadata */
  getEnvEnvIdMcpClientsClientIdMetadata: { method: "GET", path: "/api/admin/env/{envId}/mcp/clients/{clientId}/metadata", query: ["limit","cursor"] },
  /** Get Env Mcp Posture */
  getEnvEnvIdMcpPosture: { method: "GET", path: "/api/admin/env/{envId}/mcp/posture", query: ["limit","cursor"] },
  /** Get Env Mcp Rollout Status */
  getEnvEnvIdMcpRolloutStatus: { method: "GET", path: "/api/admin/env/{envId}/mcp/rollout-status", query: ["limit","cursor"] },
  /** Get Env Mcp Servers */
  getEnvEnvIdMcpServers: { method: "GET", path: "/api/admin/env/{envId}/mcp/servers", query: ["limit","cursor"] },
  /** Get Env Mcp Servers */
  getEnvEnvIdMcpServersServerId: { method: "GET", path: "/api/admin/env/{envId}/mcp/servers/{serverId}" },
  /** Get Admin Env Member Limits */
  getEnvEnvIdMemberLimits: { method: "GET", path: "/api/admin/env/{envId}/member-limits", query: ["limit","cursor"] },
  /** Get Admin Env Member Permissions */
  getEnvEnvIdMemberPermissions: { method: "GET", path: "/api/admin/env/{envId}/member-permissions", query: ["limit","cursor"] },
  /** Get Admin Env Member Restrictions */
  getEnvEnvIdMemberRestrictions: { method: "GET", path: "/api/admin/env/{envId}/member-restrictions", query: ["limit","cursor"] },
  /** Get Env Mfa Policy */
  getEnvEnvIdMfaPolicy: { method: "GET", path: "/api/admin/env/{envId}/mfa/policy", query: ["limit","cursor"] },
  /** Get Env Openid4vc Posture */
  getEnvEnvIdOpenid4vcPosture: { method: "GET", path: "/api/admin/env/{envId}/openid4vc/posture", query: ["limit","cursor"] },
  /** Get Admin Env Organization */
  getEnvEnvIdOrganization: { method: "GET", path: "/api/admin/env/{envId}/organization", query: ["limit","cursor"] },
  /** Get Admin Env Organizations */
  getEnvEnvIdOrganizations: { method: "GET", path: "/api/admin/env/{envId}/organizations", query: ["limit","cursor"] },
  /** Get Env Organizations Branding */
  getEnvEnvIdOrganizationsOrganizationIdBranding: { method: "GET", path: "/api/admin/env/{envId}/organizations/{organizationId}/branding", query: ["limit","cursor"] },
  /** Get Env Orgs Entitlement Override */
  getEnvEnvIdOrgsOrgIdEntitlementOverride: { method: "GET", path: "/api/admin/env/{envId}/orgs/{orgId}/entitlement-override", query: ["limit","cursor"] },
  /** Get Orgs Entitlements Explain */
  getEnvEnvIdOrgsOrgIdEntitlementsExplain: { method: "GET", path: "/api/admin/env/{envId}/orgs/{orgId}/entitlements/explain" },
  /** Get Env Orgs Price Override */
  getEnvEnvIdOrgsOrgIdPriceOverride: { method: "GET", path: "/api/admin/env/{envId}/orgs/{orgId}/price-override", query: ["limit","cursor"] },
  /** Get Env Orgs Subscription */
  getEnvEnvIdOrgsOrgIdSubscription: { method: "GET", path: "/api/admin/env/{envId}/orgs/{orgId}/subscription", query: ["limit","cursor"] },
  /** Get Admin Env Overview */
  getEnvEnvIdOverview: { method: "GET", path: "/api/admin/env/{envId}/overview", query: ["limit","cursor"] },
  /** Get Admin Env Passkeys */
  getEnvEnvIdPasskeys: { method: "GET", path: "/api/admin/env/{envId}/passkeys", query: ["limit","cursor"] },
  /** Get Env Passkeys Stats */
  getEnvEnvIdPasskeysStats: { method: "GET", path: "/api/admin/env/{envId}/passkeys/stats", query: ["limit","cursor"] },
  /** Get Env Passkeys User */
  getEnvEnvIdPasskeysUserUserId: { method: "GET", path: "/api/admin/env/{envId}/passkeys/user/{userId}" },
  /** Get Admin Env Permission Tree */
  getEnvEnvIdPermissionTree: { method: "GET", path: "/api/admin/env/{envId}/permission-tree", query: ["limit","cursor"] },
  /** Get Admin Env Permissions */
  getEnvEnvIdPermissions: { method: "GET", path: "/api/admin/env/{envId}/permissions", query: ["limit","cursor"] },
  /** Get Admin Env Policies */
  getEnvEnvIdPolicies: { method: "GET", path: "/api/admin/env/{envId}/policies", query: ["limit","cursor"] },
  /** Get Env Policies Conflicts */
  getEnvEnvIdPoliciesConflicts: { method: "GET", path: "/api/admin/env/{envId}/policies/conflicts", query: ["limit","cursor"] },
  /** Get Env Policies Custom Functions */
  getEnvEnvIdPoliciesCustomFunctions: { method: "GET", path: "/api/admin/env/{envId}/policies/custom-functions", query: ["limit","cursor"] },
  /** Get Env Policies Diff */
  getEnvEnvIdPoliciesPolicyIdDiff: { method: "GET", path: "/api/admin/env/{envId}/policies/{policyId}/diff", query: ["limit","cursor"] },
  /** Get Env Policies Subjects */
  getEnvEnvIdPoliciesPolicyIdSubjects: { method: "GET", path: "/api/admin/env/{envId}/policies/{policyId}/subjects", query: ["limit","cursor"] },
  /** Get Env Policies Versions */
  getEnvEnvIdPoliciesPolicyIdVersions: { method: "GET", path: "/api/admin/env/{envId}/policies/{policyId}/versions", query: ["limit","cursor"] },
  /** Get Admin Env Policy Templates */
  getEnvEnvIdPolicyTemplates: { method: "GET", path: "/api/admin/env/{envId}/policy-templates", query: ["limit","cursor"] },
  /** Get Env Pricing Billing Ops */
  getEnvEnvIdPricingBillingOps: { method: "GET", path: "/api/admin/env/{envId}/pricing/billing-ops", query: ["limit","cursor"] },
  /** Get Env Pricing Catalog */
  getEnvEnvIdPricingCatalog: { method: "GET", path: "/api/admin/env/{envId}/pricing/catalog", query: ["limit","cursor"] },
  /** Get Env Pricing Context */
  getEnvEnvIdPricingContext: { method: "GET", path: "/api/admin/env/{envId}/pricing/context", query: ["limit","cursor"] },
  /** Get Admin Env Product Governance */
  getEnvEnvIdProductGovernance: { method: "GET", path: "/api/admin/env/{envId}/product-governance", query: ["limit","cursor"] },
  /** Get Admin Env Projects */
  getEnvEnvIdProjects: { method: "GET", path: "/api/admin/env/{envId}/projects", query: ["limit","cursor"] },
  /** Get Env Rag Decisions */
  getEnvEnvIdRagDecisions: { method: "GET", path: "/api/admin/env/{envId}/rag/decisions", query: ["limit","cursor"] },
  /** Get Env Rag Dossier */
  getEnvEnvIdRagDossier: { method: "GET", path: "/api/admin/env/{envId}/rag/dossier", query: ["limit","cursor"] },
  /** Get Env Rag Evaluations */
  getEnvEnvIdRagEvaluations: { method: "GET", path: "/api/admin/env/{envId}/rag/evaluations", query: ["limit","cursor"] },
  /** Get Env Rag Evaluations */
  getEnvEnvIdRagEvaluationsEvaluationId: { method: "GET", path: "/api/admin/env/{envId}/rag/evaluations/{evaluationId}" },
  /** Get Env Rag Evidence */
  getEnvEnvIdRagEvidence: { method: "GET", path: "/api/admin/env/{envId}/rag/evidence", query: ["limit","cursor"] },
  /** Get Env Rag Posture */
  getEnvEnvIdRagPosture: { method: "GET", path: "/api/admin/env/{envId}/rag/posture", query: ["limit","cursor"] },
  /** Get Env Rag Summary */
  getEnvEnvIdRagSummary: { method: "GET", path: "/api/admin/env/{envId}/rag/summary", query: ["limit","cursor"] },
  /** Get Env Recertification Campaigns */
  getEnvEnvIdRecertificationCampaigns: { method: "GET", path: "/api/admin/env/{envId}/recertification/campaigns", query: ["limit","cursor"] },
  /** Get Admin Env Relationships */
  getEnvEnvIdRelationships: { method: "GET", path: "/api/admin/env/{envId}/relationships", query: ["limit","cursor"] },
  /** Get Env Relationships Accessible */
  getEnvEnvIdRelationshipsAccessible: { method: "GET", path: "/api/admin/env/{envId}/relationships/accessible", query: ["limit","cursor"] },
  /** Get Env Relationships Changes */
  getEnvEnvIdRelationshipsChanges: { method: "GET", path: "/api/admin/env/{envId}/relationships/changes", query: ["limit","cursor"] },
  /** Get Env Relationships Check */
  getEnvEnvIdRelationshipsCheck: { method: "GET", path: "/api/admin/env/{envId}/relationships/check", query: ["limit","cursor"] },
  /** Get Env Relationships Watch */
  getEnvEnvIdRelationshipsWatch: { method: "GET", path: "/api/admin/env/{envId}/relationships/watch", query: ["limit","cursor"] },
  /** Get Env Reseller Catalog */
  getEnvEnvIdResellerCatalog: { method: "GET", path: "/api/admin/env/{envId}/reseller/catalog", query: ["limit","cursor"] },
  /** Get Admin Env Resource Types */
  getEnvEnvIdResourceTypes: { method: "GET", path: "/api/admin/env/{envId}/resource-types", query: ["limit","cursor"] },
  /** Get Env Resource Types Relations */
  getEnvEnvIdResourceTypesTypeIdRelations: { method: "GET", path: "/api/admin/env/{envId}/resource-types/{typeId}/relations", query: ["limit","cursor"] },
  /** Get Admin Env Risk Scores */
  getEnvEnvIdRiskScores: { method: "GET", path: "/api/admin/env/{envId}/risk-scores", query: ["limit","cursor"] },
  /** Get Admin Env Role Assignments */
  getEnvEnvIdRoleAssignments: { method: "GET", path: "/api/admin/env/{envId}/role-assignments", query: ["limit","cursor"] },
  /** Get Admin Env Role Constraints */
  getEnvEnvIdRoleConstraints: { method: "GET", path: "/api/admin/env/{envId}/role-constraints", query: ["limit","cursor"] },
  /** Get Env Role Constraints History */
  getEnvEnvIdRoleConstraintsHistory: { method: "GET", path: "/api/admin/env/{envId}/role-constraints/history", query: ["limit","cursor"] },
  /** Get Env Role Constraints Scan */
  getEnvEnvIdRoleConstraintsScan: { method: "GET", path: "/api/admin/env/{envId}/role-constraints/scan", query: ["limit","cursor"] },
  /** Get Admin Env Roles */
  getEnvEnvIdRoles: { method: "GET", path: "/api/admin/env/{envId}/roles", query: ["limit","cursor"] },
  /** Get Env Roles Compare */
  getEnvEnvIdRolesCompare: { method: "GET", path: "/api/admin/env/{envId}/roles/compare", query: ["limit","cursor"] },
  /** Get Env Roles Permissions */
  getEnvEnvIdRolesRoleIdPermissions: { method: "GET", path: "/api/admin/env/{envId}/roles/{roleId}/permissions", query: ["limit","cursor"] },
  /** Get Env Scim Config */
  getEnvEnvIdScimConfig: { method: "GET", path: "/api/admin/env/{envId}/scim/config", query: ["limit","cursor"] },
  /** Get Admin Env Scim Configs */
  getEnvEnvIdScimConfigs: { method: "GET", path: "/api/admin/env/{envId}/scim-configs", query: ["limit","cursor"] },
  /** Get Env Scim Configs Group Role Mappings */
  getEnvEnvIdScimConfigsConfigIdGroupRoleMappings: { method: "GET", path: "/api/admin/env/{envId}/scim-configs/{configId}/group-role-mappings", query: ["limit","cursor"] },
  /** Get Env Scim Configs Groups */
  getEnvEnvIdScimConfigsConfigIdGroups: { method: "GET", path: "/api/admin/env/{envId}/scim-configs/{configId}/groups", query: ["limit","cursor"] },
  /** Get Env Scim Configs Logs */
  getEnvEnvIdScimConfigsConfigIdLogs: { method: "GET", path: "/api/admin/env/{envId}/scim-configs/{configId}/logs", query: ["limit","cursor"] },
  /** Get Env Scim Configs Stats */
  getEnvEnvIdScimConfigsConfigIdStats: { method: "GET", path: "/api/admin/env/{envId}/scim-configs/{configId}/stats", query: ["limit","cursor"] },
  /** Get Env Scim Configs Users */
  getEnvEnvIdScimConfigsConfigIdUsers: { method: "GET", path: "/api/admin/env/{envId}/scim-configs/{configId}/users", query: ["limit","cursor"] },
  /** Get Env Security Attack Stats */
  getEnvEnvIdSecurityAttackStats: { method: "GET", path: "/api/admin/env/{envId}/security/attack-stats", query: ["limit","cursor"] },
  /** Get Env Security Config */
  getEnvEnvIdSecurityConfig: { method: "GET", path: "/api/admin/env/{envId}/security/config", query: ["limit","cursor"] },
  /** Get Env Security Device Trust */
  getEnvEnvIdSecurityDeviceTrust: { method: "GET", path: "/api/admin/env/{envId}/security/device-trust", query: ["limit","cursor"] },
  /** Get Env Security Geo Blocking */
  getEnvEnvIdSecurityGeoBlocking: { method: "GET", path: "/api/admin/env/{envId}/security/geo-blocking", query: ["limit","cursor"] },
  /** Get Env Security Ip Access */
  getEnvEnvIdSecurityIpAccess: { method: "GET", path: "/api/admin/env/{envId}/security/ip-access", query: ["limit","cursor"] },
  /** Get Admin Env Session Logs */
  getEnvEnvIdSessionLogs: { method: "GET", path: "/api/admin/env/{envId}/session-logs", query: ["limit","cursor"] },
  /** Get Admin Env Sessions */
  getEnvEnvIdSessions: { method: "GET", path: "/api/admin/env/{envId}/sessions", query: ["limit","cursor"] },
  /** Get Admin Env Sessions */
  getEnvEnvIdSessionsSessionId: { method: "GET", path: "/api/admin/env/{envId}/sessions/{sessionId}" },
  /** Get Env Shadow Permissions Scan */
  getEnvEnvIdShadowPermissionsScan: { method: "GET", path: "/api/admin/env/{envId}/shadow-permissions/scan", query: ["limit","cursor"] },
  /** Get Admin Env Siem Config */
  getEnvEnvIdSiemConfig: { method: "GET", path: "/api/admin/env/{envId}/siem-config", query: ["limit","cursor"] },
  /** Get Admin Env Subscription Status */
  getEnvEnvIdSubscriptionStatus: { method: "GET", path: "/api/admin/env/{envId}/subscription-status", query: ["limit","cursor"] },
  /** Get Env Token Exchange Policies */
  getEnvEnvIdTokenExchangePolicies: { method: "GET", path: "/api/admin/env/{envId}/token/exchange-policies", query: ["limit","cursor"] },
  /** Get Env Token Exchanges */
  getEnvEnvIdTokenExchanges: { method: "GET", path: "/api/admin/env/{envId}/token/exchanges", query: ["limit","cursor"] },
  /** Get Admin Env Tool Catalog */
  getEnvEnvIdToolCatalog: { method: "GET", path: "/api/admin/env/{envId}/tool-catalog", query: ["limit","cursor"] },
  /** Get Admin Env Trust Registry */
  getEnvEnvIdTrustRegistry: { method: "GET", path: "/api/admin/env/{envId}/trust-registry", query: ["limit","cursor"] },
  /** Get Admin Env Trust Registry */
  getEnvEnvIdTrustRegistryEntryId: { method: "GET", path: "/api/admin/env/{envId}/trust-registry/{entryId}" },
  /** Get Admin Env Usage */
  getEnvEnvIdUsage: { method: "GET", path: "/api/admin/env/{envId}/usage", query: ["limit","cursor"] },
  /** Get Admin Env Usage Status */
  getEnvEnvIdUsageStatus: { method: "GET", path: "/api/admin/env/{envId}/usage-status", query: ["limit","cursor"] },
  /** Get Admin Env Users */
  getEnvEnvIdUsers: { method: "GET", path: "/api/admin/env/{envId}/users", query: ["limit","cursor"] },
  /** Get Env Users Export */
  getEnvEnvIdUsersExport: { method: "GET", path: "/api/v1/admin/env/{envId}/users/export", query: ["limit","cursor"] },
  /** Get Admin Env Users */
  getEnvEnvIdUsersUserId: { method: "GET", path: "/api/admin/env/{envId}/users/{userId}" },
  /** Get Env Users Activity */
  getEnvEnvIdUsersUserIdActivity: { method: "GET", path: "/api/admin/env/{envId}/users/{userId}/activity", query: ["limit","cursor"] },
  /** Get Env Users Metadata */
  getEnvEnvIdUsersUserIdMetadata: { method: "GET", path: "/api/admin/env/{envId}/users/{userId}/metadata", query: ["limit","cursor"] },
  /** Get Env Users Roles */
  getEnvEnvIdUsersUserIdRoles: { method: "GET", path: "/api/admin/env/{envId}/users/{userId}/roles", query: ["limit","cursor"] },
  /** Get Env Users Sessions */
  getEnvEnvIdUsersUserIdSessions: { method: "GET", path: "/api/v1/admin/env/{envId}/users/{userId}/sessions", query: ["limit","cursor"] },
  /** Get Admin Env Verifiable Credentials */
  getEnvEnvIdVerifiableCredentials: { method: "GET", path: "/api/admin/env/{envId}/verifiable-credentials", query: ["limit","cursor"] },
  /** Get Admin Env Verifiable Credentials */
  getEnvEnvIdVerifiableCredentialsCredentialId: { method: "GET", path: "/api/admin/env/{envId}/verifiable-credentials/{credentialId}" },
  /** Get Env Verifiable Credentials Posture */
  getEnvEnvIdVerifiableCredentialsPosture: { method: "GET", path: "/api/admin/env/{envId}/verifiable-credentials/posture", query: ["limit","cursor"] },
  /** Get Admin Env Visible Modules */
  getEnvEnvIdVisibleModules: { method: "GET", path: "/api/admin/env/{envId}/visible-modules", query: ["limit","cursor"] },
  /** Get Admin Env Webhooks */
  getEnvEnvIdWebhooks: { method: "GET", path: "/api/admin/env/{envId}/webhooks", query: ["limit","cursor"] },
  /** Get Env Webhooks Dead Letters */
  getEnvEnvIdWebhooksWebhookIdDeadLetters: { method: "GET", path: "/api/admin/env/{envId}/webhooks/{webhookId}/dead-letters", query: ["limit","cursor"] },
  /** Get Env Webhooks Logs */
  getEnvEnvIdWebhooksWebhookIdLogs: { method: "GET", path: "/api/admin/env/{envId}/webhooks/{webhookId}/logs", query: ["limit","cursor"] },
  /** Get Webhooks Logs Export */
  getEnvEnvIdWebhooksWebhookIdLogsExport: { method: "GET", path: "/api/admin/env/{envId}/webhooks/{webhookId}/logs/export", query: ["limit","cursor"] },
  /** Get Env Webhooks Stats */
  getEnvEnvIdWebhooksWebhookIdStats: { method: "GET", path: "/api/admin/env/{envId}/webhooks/{webhookId}/stats", query: ["limit","cursor"] },
  /** Get Admin Env Workflows */
  getEnvEnvIdWorkflows: { method: "GET", path: "/api/admin/env/{envId}/workflows", query: ["limit","cursor"] },
  /** Get Admin Env Workforce Members */
  getEnvEnvIdWorkforceMembers: { method: "GET", path: "/api/admin/env/{envId}/workforce-members", query: ["limit","cursor"] },
  /** Get Environments Agent Bridge Shared Resources */
  getEnvironmentsEnvIdAgentBridgeSharedResources: { method: "GET", path: "/api/admin/environments/{envId}/agent-bridge/shared-resources", query: ["limit","cursor"] },
  /** Get Admin Environments Hierarchy */
  getEnvironmentsEnvIdHierarchy: { method: "GET", path: "/api/admin/environments/{envId}/hierarchy", query: ["limit","cursor"] },
  /** Get Admin */
  getFile: { method: "GET", path: "/admin/{file}" },
  /** Get V1 Governance Verify */
  getGovernanceVerify: { method: "GET", path: "/v1/governance/verify", query: ["limit","cursor"] },
  /** Get Health */
  getHealth: { method: "GET", path: "/health" },
  /** Shortlink impersonation URL */
  getI: { method: "GET", path: "/i", query: ["limit","cursor"] },
  /** One-click impersonation URL (universal) */
  getImpersonate: { method: "GET", path: "/impersonate", query: ["limit","cursor"] },
  /** Exchange an impersonation ticket for a session token */
  getImpersonationExchange: { method: "GET", path: "/api/v1/impersonation/exchange", query: ["limit","cursor"] },
  /** Check if current session is an impersonation session */
  getImpersonationStatus: { method: "GET", path: "/api/v1/impersonation/status", query: ["limit","cursor"] },
  /** Get V1 Workspaces Regional Profile */
  getInternalWorkspacesRegionalProfile: { method: "GET", path: "/internal/v1/workspaces/regional-profile", query: ["limit","cursor"] },
  /** Get Api V1 Me */
  getMe: { method: "GET", path: "/api/v1/me", query: ["limit","cursor"] },
  /** Get V1 Me Consents */
  getMeConsents: { method: "GET", path: "/api/v1/me/consents", query: ["limit","cursor"] },
  /** Get Admin Me Context */
  getMeContext: { method: "GET", path: "/api/admin/me/context", query: ["limit","cursor"] },
  /** Get Admin Members Permissions */
  getMembersUserIdPermissions: { method: "GET", path: "/api/admin/members/{userId}/permissions", query: ["limit","cursor"] },
  /** Get Metrics */
  getMetrics: { method: "GET", path: "/metrics" },
  /** Get Metrics App */
  getMetricsApp: { method: "GET", path: "/metrics/app" },
  /** List Push MFA Challenges */
  getMfaPushChallenges: { method: "GET", path: "/api/v1/mfa/push/challenges", query: ["limit","cursor"] },
  /** Poll Push MFA Challenge Status */
  getMfaPushStatusChallengeId: { method: "GET", path: "/api/v1/mfa/push/status/{challengeId}" },
  /** Get VAPID Public Key */
  getMfaPushVapidKey: { method: "GET", path: "/api/v1/mfa/push/vapid-key", query: ["limit","cursor"] },
  /** Get Api Admin My Hierarchy */
  getMyHierarchy: { method: "GET", path: "/api/admin/my-hierarchy", query: ["limit","cursor"] },
  /** Get Api Admin My Scopes */
  getMyScopes: { method: "GET", path: "/api/admin/my-scopes", query: ["limit","cursor"] },
  /** Get Oauth Authorize */
  getOauthAuthorize: { method: "GET", path: "/oauth/authorize", query: ["limit","cursor"] },
  /** Get Oauth Jwks.Json */
  getOauthJwksJson: { method: "GET", path: "/oauth/jwks.json", query: ["limit","cursor"] },
  /** Get Oauth Userinfo */
  getOauthUserinfo: { method: "GET", path: "/oauth/userinfo", query: ["limit","cursor"] },
  /** Get Oidc Authorize */
  getOidcAuthorizeEnvIdConnectionId: { method: "GET", path: "/oidc/authorize/{envId}/{connectionId}" },
  /** Get the tenant's customer-managed key status */
  getOrgCustomerKey: { method: "GET", path: "/api/admin/env/{envId}/orgs/{orgId}/customer-key", query: ["limit","cursor"] },
  /** Get where an organization's data lives */
  getOrgDataResidency: { method: "GET", path: "/api/admin/env/{envId}/orgs/{orgId}/data-residency", query: ["limit","cursor"] },
  /** Get Org Oidc Callback */
  getOrgEnvIdOidcCallback: { method: "GET", path: "/api/org/{envId}/oidc/callback", query: ["limit","cursor"] },
  /** Get Admin Org Data Isolation */
  getOrgOrgIdDataIsolation: { method: "GET", path: "/api/v1/admin/org/{orgId}/data-isolation", query: ["limit","cursor"] },
  /** Get Org Data Isolation Activity */
  getOrgOrgIdDataIsolationActivity: { method: "GET", path: "/api/v1/admin/org/{orgId}/data-isolation/activity", query: ["limit","cursor"] },
  /** Get Org Data Isolation Migrations */
  getOrgOrgIdDataIsolationMigrations: { method: "GET", path: "/api/v1/admin/org/{orgId}/data-isolation/migrations", query: ["limit","cursor"] },
  /** Get Org Data Isolation Operations */
  getOrgOrgIdDataIsolationOperations: { method: "GET", path: "/api/v1/admin/org/{orgId}/data-isolation/operations", query: ["limit","cursor"] },
  /** Get Data Isolation Operations Facets */
  getOrgOrgIdDataIsolationOperationsFacets: { method: "GET", path: "/api/v1/admin/org/{orgId}/data-isolation/operations/facets", query: ["limit","cursor"] },
  /** Get Org Data Isolation Operations */
  getOrgOrgIdDataIsolationOperationsOperationId: { method: "GET", path: "/api/v1/admin/org/{orgId}/data-isolation/operations/{operationId}" },
  /** Get Data Isolation Operations Replay Preview */
  getOrgOrgIdDataIsolationOperationsReplayPreview: { method: "GET", path: "/api/v1/admin/org/{orgId}/data-isolation/operations/replay-preview", query: ["limit","cursor"] },
  /** Get Api Admin Organizations */
  getOrganizations: { method: "GET", path: "/api/admin/organizations", query: ["limit","cursor"] },
  /** Get Admin Organizations Descendants */
  getOrganizationsIdDescendants: { method: "GET", path: "/api/admin/organizations/{id}/descendants", query: ["limit","cursor"] },
  /** Get Admin Organizations Inventory */
  getOrganizationsIdInventory: { method: "GET", path: "/api/admin/organizations/{id}/inventory", query: ["limit","cursor"] },
  /** Get Api Admin Organizations */
  getOrganizationsOrgId: { method: "GET", path: "/api/admin/organizations/{orgId}" },
  /** Get Admin Organizations Default Environment */
  getOrganizationsOrgIdDefaultEnvironment: { method: "GET", path: "/api/admin/organizations/{orgId}/default-environment", query: ["limit","cursor"] },
  /** Get Api Admin Permissions */
  getPermissions: { method: "GET", path: "/api/admin/permissions", query: ["limit","cursor"] },
  /** Get Api Admin Plans */
  getPlans: { method: "GET", path: "/api/admin/plans", query: ["limit","cursor"] },
  /** Get Api Admin Policy Config */
  getPolicyConfig: { method: "GET", path: "/api/admin/policy-config", query: ["limit","cursor"] },
  /** Validate Portal Token */
  getPortal: { method: "GET", path: "/api/v1/portal", query: ["limit","cursor"] },
  /** Get Admin Portal State */
  getPortalStateOrganizationId: { method: "GET", path: "/api/v1/portal/state/{organizationId}" },
  /** Get Api Admin Product Catalog */
  getProductCatalog: { method: "GET", path: "/api/admin/product-catalog", query: ["limit","cursor"] },
  /** Get Admin Product Catalog Authorization */
  getProductCatalogProductKeyAuthorization: { method: "GET", path: "/api/admin/product-catalog/{productKey}/authorization", query: ["limit","cursor"] },
  /** Get Admin Product Dependencies Graph */
  getProductDependenciesGraph: { method: "GET", path: "/api/admin/product-dependencies/graph", query: ["limit","cursor"] },
  /** Get Admin Products Dependencies */
  getProductsProductKeyDependencies: { method: "GET", path: "/api/admin/products/{productKey}/dependencies", query: ["limit","cursor"] },
  /** Get Admin Products Dependency Candidates */
  getProductsProductKeyDependencyCandidates: { method: "GET", path: "/api/admin/products/{productKey}/dependency-candidates", query: ["limit","cursor"] },
  /** Get Api Public Auth Config */
  getPublicAuthConfig: { method: "GET", path: "/api/public/auth-config", query: ["limit","cursor"] },
  /** Get Api Public Health */
  getPublicHealth: { method: "GET", path: "/api/public/health" },
  /** Get Public Invite Validate */
  getPublicInviteValidate: { method: "GET", path: "/api/public/invite/validate", query: ["limit","cursor"] },
  /** Get Public Org Auth Config */
  getPublicOrgOrgSlugAuthConfig: { method: "GET", path: "/api/public/org/{orgSlug}/auth-config", query: ["limit","cursor"] },
  /** Get Wordpress Handoff Finish */
  getPublicWordpressHandoffFinish: { method: "GET", path: "/api/public/wordpress/handoff/finish", query: ["limit","cursor"] },
  /** Get Ready */
  getReady: { method: "GET", path: "/ready" },
  /** Get Platform Metadata */
  getRoot: { method: "GET", path: "/", query: ["limit","cursor"] },
  /** Get Admin */
  getRoot2: { method: "GET", path: "/admin", query: ["limit","cursor"] },
  /** SAML Single Logout Redirect */
  getSamlLogoutEnvironmentId: { method: "GET", path: "/saml/logout/{environmentId}" },
  /** SAML SP Metadata */
  getSamlMetadataEnvironmentId: { method: "GET", path: "/saml/metadata/{environmentId}" },
  /** SAML SP-initiated SSO */
  getSamlSsoEnvironmentId: { method: "GET", path: "/saml/sso/{environmentId}" },
  /** Get V2 Env Groups */
  getScimV2EnvEnvIdGroups: { method: "GET", path: "/api/scim/v2/env/{envId}/Groups", query: ["limit","cursor"] },
  /** Get V2 Env Groups */
  getScimV2EnvEnvIdGroupsGroupId: { method: "GET", path: "/api/scim/v2/env/{envId}/Groups/{groupId}" },
  /** Get V2 Env Users */
  getScimV2EnvEnvIdUsers: { method: "GET", path: "/api/scim/v2/env/{envId}/Users", query: ["limit","cursor"] },
  /** Get V2 Env Users */
  getScimV2EnvEnvIdUsersUserId: { method: "GET", path: "/api/scim/v2/env/{envId}/Users/{userId}" },
  /** Get Api Sentry Test */
  getSentryTest: { method: "GET", path: "/api/sentry-test", query: ["limit","cursor"] },
  /** Get Api Admin Trusted Origins */
  getTrustedOrigins: { method: "GET", path: "/api/admin/trusted-origins", query: ["limit","cursor"] },
  /** Get V1 User Export */
  getUserExport: { method: "GET", path: "/api/v1/user/export", query: ["limit","cursor"] },
  /** Get V1 User Sessions */
  getUserSessions: { method: "GET", path: "/api/v1/user/sessions", query: ["limit","cursor"] },
  /** Get .Well Known Agent.Json */
  getWellKnownAgentJson: { method: "GET", path: "/.well-known/agent.json" },
  /** Get .Well Known Oauth Protected Resource */
  getWellKnownOauthProtectedResource: { method: "GET", path: "/.well-known/oauth-protected-resource" },
  /** Get .Well Known Openid Configuration */
  getWellKnownOpenidConfiguration: { method: "GET", path: "/.well-known/openid-configuration" },
  /** Get .Well Known Openid Credential Issuer */
  getWellKnownOpenidCredentialIssuer: { method: "GET", path: "/.well-known/openid-credential-issuer" },
  /** Read a company operating unit */
  getWorkspaceOperatingUnit: { method: "GET", path: "/api/access/v1/workspace/operating-units/{id}" },
  /** Get Workspace Provisioning Status */
  getWorkspaceProvisioningStatus: { method: "GET", path: "/api/workspace/provisioning/status", query: ["limit","cursor"] },
  /** Get Admin Workspaces Products */
  getWorkspacesWorkspaceEnvIdProducts: { method: "GET", path: "/api/admin/workspaces/{workspaceEnvId}/products", query: ["limit","cursor"] },
  /** List company operating units */
  listWorkspaceOperatingUnits: { method: "GET", path: "/api/access/v1/workspace/operating-units", query: ["limit","cursor"] },
  /** Update V1 Workspace Saved Views */
  patchAccessWorkspaceSavedViewsId: { method: "PATCH", path: "/api/access/v1/workspace/saved-views/{id}" },
  /** Update Api Admin Applications */
  patchApplicationsId: { method: "PATCH", path: "/api/admin/applications/{id}" },
  /** Update Api Auth */
  patchAuthWildcard: { method: "PATCH", path: "/api/auth/{wildcard}" },
  /** Update Admin Env Agent Identities */
  patchEnvEnvIdAgentIdentitiesAgentId: { method: "PATCH", path: "/api/admin/env/{envId}/agent-identities/{agentId}" },
  /** Update Admin Env Api Keys */
  patchEnvEnvIdApiKeysKeyId: { method: "PATCH", path: "/api/admin/env/{envId}/api-keys/{keyId}" },
  /** Update Admin Env Applications */
  patchEnvEnvIdApplicationsAppId: { method: "PATCH", path: "/api/admin/env/{envId}/applications/{appId}" },
  /** Update Env Catalog Addons */
  patchEnvEnvIdCatalogAddonsCodeVersion: { method: "PATCH", path: "/api/admin/env/{envId}/catalog/addons/{code}/{version}" },
  /** Update Env Catalog Features */
  patchEnvEnvIdCatalogFeaturesLookupKey: { method: "PATCH", path: "/api/admin/env/{envId}/catalog/features/{lookupKey}" },
  /** Update Env Catalog Meters */
  patchEnvEnvIdCatalogMetersMeterCode: { method: "PATCH", path: "/api/admin/env/{envId}/catalog/meters/{meterCode}" },
  /** Update Env Catalog Plans */
  patchEnvEnvIdCatalogPlansCodeVersion: { method: "PATCH", path: "/api/admin/env/{envId}/catalog/plans/{code}/{version}" },
  /** Update Env Catalog Prices */
  patchEnvEnvIdCatalogPricesId: { method: "PATCH", path: "/api/admin/env/{envId}/catalog/prices/{id}" },
  /** Update Admin Env Connections */
  patchEnvEnvIdConnectionsConnId: { method: "PATCH", path: "/api/admin/env/{envId}/connections/{connId}" },
  /** Update Env Orgs Entitlement Override */
  patchEnvEnvIdOrgsOrgIdEntitlementOverrideId: { method: "PATCH", path: "/api/admin/env/{envId}/orgs/{orgId}/entitlement-override/{id}" },
  /** Update Env Orgs Price Override */
  patchEnvEnvIdOrgsOrgIdPriceOverrideId: { method: "PATCH", path: "/api/admin/env/{envId}/orgs/{orgId}/price-override/{id}" },
  /** Update Admin Env Scim Configs */
  patchEnvEnvIdScimConfigsConfigId: { method: "PATCH", path: "/api/admin/env/{envId}/scim-configs/{configId}" },
  /** Deprovision SCIM configuration */
  patchEnvEnvIdScimConfigsConfigIdDeprovision: { method: "PATCH", path: "/api/admin/env/{envId}/scim-configs/{configId}/deprovision" },
  /** Update Admin Env Sessions */
  patchEnvEnvIdSessionsSessionId: { method: "PATCH", path: "/api/admin/env/{envId}/sessions/{sessionId}" },
  /** Update Admin Env Users */
  patchEnvEnvIdUsersUserId: { method: "PATCH", path: "/api/admin/env/{envId}/users/{userId}" },
  /** Update Env Users Env Role */
  patchEnvEnvIdUsersUserIdEnvRole: { method: "PATCH", path: "/api/admin/env/{envId}/users/{userId}/env-role" },
  /** Update Admin Env Webhooks */
  patchEnvEnvIdWebhooksWebhookId: { method: "PATCH", path: "/api/admin/env/{envId}/webhooks/{webhookId}" },
  /** Update Admin Env Workforce Members */
  patchEnvEnvIdWorkforceMembersId: { method: "PATCH", path: "/api/admin/env/{envId}/workforce-members/{id}" },
  /** Update Api Admin Environments */
  patchEnvironmentsId: { method: "PATCH", path: "/api/admin/environments/{id}" },
  /** Update Api Admin Organizations */
  patchOrganizationsId: { method: "PATCH", path: "/api/admin/organizations/{id}" },
  /** Update Api Admin Projects */
  patchProjectsId: { method: "PATCH", path: "/api/admin/projects/{id}" },
  /** Update V2 Env Users */
  patchScimV2EnvEnvIdUsersUserId: { method: "PATCH", path: "/api/scim/v2/env/{envId}/Users/{userId}" },
  /** GDPR Art.16 — Right to Rectification */
  patchUserMeRectify: { method: "PATCH", path: "/api/v1/user/me/rectify" },
  /** Create or execute Access V1 Decision */
  postAccessDecision: { method: "POST", path: "/api/access/v1/decision" },
  /** Create or execute Workspace Regional Preview */
  postAccessWorkspaceRegionalPreview: { method: "POST", path: "/api/access/v1/workspace/regional/preview" },
  /** Create or execute V1 Workspace Saved Views */
  postAccessWorkspaceSavedViews: { method: "POST", path: "/api/access/v1/workspace/saved-views" },
  /** Create or execute V1 Workspace Sdui Documents */
  postAccessWorkspaceSduiDocuments: { method: "POST", path: "/api/access/v1/workspace/sdui-documents" },
  /** Create or execute Workspace Sdui Documents Publish */
  postAccessWorkspaceSduiDocumentsKeyPublish: { method: "POST", path: "/api/access/v1/workspace/sdui-documents/{key}/publish" },
  /** Create or execute Admin Api Keys Batch Status */
  postApiKeysBatchStatus: { method: "POST", path: "/api/admin/api-keys/batch-status" },
  /** Create or execute Admin Api Keys Validate */
  postApiKeysValidate: { method: "POST", path: "/api/admin/api-keys/validate" },
  /** Create or execute Admin Applications Environments */
  postApplicationsAppIdEnvironments: { method: "POST", path: "/api/admin/applications/{appId}/environments" },
  /** Create or execute Auth Device Approve */
  postAuthDeviceApprove: { method: "POST", path: "/api/auth/device/approve" },
  /** Create or execute Auth Device Session */
  postAuthDeviceSession: { method: "POST", path: "/api/auth/device/session" },
  /** Create or execute Auth Device Start */
  postAuthDeviceStart: { method: "POST", path: "/api/auth/device/start" },
  /** Create or execute Auth Device Token */
  postAuthDeviceToken: { method: "POST", path: "/api/auth/device/token" },
  /** Stop auth impersonation */
  postAuthImpersonationStop: { method: "POST", path: "/api/auth/impersonation/stop" },
  /** Create or execute Api Auth Realtime Ticket */
  postAuthRealtimeTicket: { method: "POST", path: "/api/auth/realtime-ticket" },
  /** Create or execute Api Auth */
  postAuthWildcard: { method: "POST", path: "/api/auth/{wildcard}" },
  /** Create or execute Commercial Bindings Archive */
  postCommercialBindingsBindingIdArchive: { method: "POST", path: "/api/admin/commercial/bindings/{bindingId}/archive" },
  /** Suspend commercial product binding */
  postCommercialBindingsBindingIdSuspend: { method: "POST", path: "/api/admin/commercial/bindings/{bindingId}/suspend" },
  /** Create or execute Products Catalog Draft */
  postCommercialProductsProductKeyCatalogDraft: { method: "POST", path: "/api/admin/commercial/products/{productKey}/catalog/draft" },
  /** Create or execute Products Catalog Publish */
  postCommercialProductsProductKeyCatalogPublish: { method: "POST", path: "/api/admin/commercial/products/{productKey}/catalog/publish" },
  /** Create or execute Products Environments Create And Connect */
  postCommercialProductsProductKeyEnvironmentsCreateAndConnect: { method: "POST", path: "/api/admin/commercial/products/{productKey}/environments/create-and-connect" },
  /** Create or execute Data Isolation Operations Replay */
  postDataIsolationOperationsOperationIdReplay: { method: "POST", path: "/api/v1/admin/data-isolation/operations/{operationId}/replay" },
  /** Create or execute Data Isolation Operations Replay */
  postDataIsolationOperationsReplay: { method: "POST", path: "/api/v1/admin/data-isolation/operations/replay" },
  /** Create or execute Data Isolation Operations Replay By Query */
  postDataIsolationOperationsReplayByQuery: { method: "POST", path: "/api/v1/admin/data-isolation/operations/replay-by-query" },
  /** Create or execute Data Isolation Overview Refresh */
  postDataIsolationOverviewRefresh: { method: "POST", path: "/api/v1/admin/data-isolation/overview/refresh" },
  /** Create or execute Data Isolation Worklist Recover */
  postDataIsolationWorklistRecover: { method: "POST", path: "/api/v1/admin/data-isolation/worklist/recover" },
  /** Create or execute Data Isolation Worklist Remediate */
  postDataIsolationWorklistRemediate: { method: "POST", path: "/api/v1/admin/data-isolation/worklist/remediate" },
  /** Create or execute Api V1 Decision */
  postDecision: { method: "POST", path: "/api/v1/decision" },
  /** Create or execute V1 Decision Batch */
  postDecisionBatch: { method: "POST", path: "/api/v1/decision/batch" },
  /** Create or execute Api Admin Decisions */
  postDecisions: { method: "POST", path: "/api/admin/decisions" },
  /** Create or execute A2a Federation Negotiate */
  postEnvEnvIdA2aFederationNegotiate: { method: "POST", path: "/api/admin/env/{envId}/a2a/federation/negotiate" },
  /** Create or execute A2a Federation Outbound Session */
  postEnvEnvIdA2aFederationOutboundSession: { method: "POST", path: "/api/admin/env/{envId}/a2a/federation/outbound-session" },
  /** Create or execute A2a Federation Partners */
  postEnvEnvIdA2aFederationPartners: { method: "POST", path: "/api/admin/env/{envId}/a2a/federation/partners" },
  /** Create or execute Env A2a Handshake */
  postEnvEnvIdA2aHandshake: { method: "POST", path: "/api/admin/env/{envId}/a2a/handshake" },
  /** Create or execute Env A2a Payments Authorize */
  postEnvEnvIdA2aPaymentsAuthorize: { method: "POST", path: "/api/admin/env/{envId}/a2a-payments/authorize" },
  /** Create or execute Env A2a Payments Settle */
  postEnvEnvIdA2aPaymentsTransactionIdSettle: { method: "POST", path: "/api/admin/env/{envId}/a2a-payments/{transactionId}/settle" },
  /** Create or execute Env A2a Tasks */
  postEnvEnvIdA2aTasks: { method: "POST", path: "/api/admin/env/{envId}/a2a/tasks" },
  /** Create or execute A2a Tasks Introspect */
  postEnvEnvIdA2aTasksIntrospect: { method: "POST", path: "/api/admin/env/{envId}/a2a/tasks/introspect" },
  /** Create or execute A2a Tasks Complete */
  postEnvEnvIdA2aTasksTaskIdComplete: { method: "POST", path: "/api/admin/env/{envId}/a2a/tasks/{taskId}/complete" },
  /** Create or execute Env Account Linking Auto */
  postEnvEnvIdAccountLinkingAuto: { method: "POST", path: "/api/v1/env/{envId}/account-linking/auto" },
  /** Create or execute Env Account Linking Link Provider */
  postEnvEnvIdAccountLinkingLinkProvider: { method: "POST", path: "/api/v1/env/{envId}/account-linking/link-provider" },
  /** Create or execute Env Account Linking Manual */
  postEnvEnvIdAccountLinkingManual: { method: "POST", path: "/api/v1/env/{envId}/account-linking/manual" },
  /** Create or execute Env Account Linking Rollback */
  postEnvEnvIdAccountLinkingRollbackHistoryId: { method: "POST", path: "/api/v1/env/{envId}/account-linking/rollback/{historyId}" },
  /** Create or execute Env Agency Plans */
  postEnvEnvIdAgencyPlans: { method: "POST", path: "/api/admin/env/{envId}/agency/plans" },
  /** Create or execute Agency Plans Archive */
  postEnvEnvIdAgencyPlansCodeVersionArchive: { method: "POST", path: "/api/admin/env/{envId}/agency/plans/{code}/{version}/archive" },
  /** Create or execute Agency Plans Migrate Subscribers */
  postEnvEnvIdAgencyPlansCodeVersionMigrateSubscribers: { method: "POST", path: "/api/admin/env/{envId}/agency/plans/{code}/{version}/migrate-subscribers" },
  /** Create or execute Agency Plans Simulate */
  postEnvEnvIdAgencyPlansSimulate: { method: "POST", path: "/api/admin/env/{envId}/agency/plans/simulate" },
  /** Create or execute Agency Plans Validate */
  postEnvEnvIdAgencyPlansValidate: { method: "POST", path: "/api/admin/env/{envId}/agency/plans/validate" },
  /** Activate agent governance kill switch */
  postEnvEnvIdAgentGovernanceKillSwitch: { method: "POST", path: "/api/admin/env/{envId}/agent-governance/kill-switch" },
  /** Create or execute Admin Env Agent Identities */
  postEnvEnvIdAgentIdentities: { method: "POST", path: "/api/admin/env/{envId}/agent-identities" },
  /** Decommission agent identity */
  postEnvEnvIdAgentIdentitiesAgentIdDecommission: { method: "POST", path: "/api/admin/env/{envId}/agent-identities/{agentId}/decommission" },
  /** Create or execute Env Agent Identities Reactivate */
  postEnvEnvIdAgentIdentitiesAgentIdReactivate: { method: "POST", path: "/api/admin/env/{envId}/agent-identities/{agentId}/reactivate" },
  /** Suspend agent identity */
  postEnvEnvIdAgentIdentitiesAgentIdSuspend: { method: "POST", path: "/api/admin/env/{envId}/agent-identities/{agentId}/suspend" },
  /** Create or execute Agents Commerce Authorize */
  postEnvEnvIdAgentsAgentIdCommerceAuthorize: { method: "POST", path: "/api/admin/env/{envId}/agents/{agentId}/commerce/authorize" },
  /** Reject agent commerce transaction */
  postEnvEnvIdAgentsAgentIdCommerceTransactionsTransactionIdReject: { method: "POST", path: "/api/admin/env/{envId}/agents/{agentId}/commerce/transactions/{transactionId}/reject" },
  /** Create or execute Commerce Transactions Settle */
  postEnvEnvIdAgentsAgentIdCommerceTransactionsTransactionIdSettle: { method: "POST", path: "/api/admin/env/{envId}/agents/{agentId}/commerce/transactions/{transactionId}/settle" },
  /** Create or execute Env Agents Verifiable Credentials */
  postEnvEnvIdAgentsAgentIdVerifiableCredentials: { method: "POST", path: "/api/admin/env/{envId}/agents/{agentId}/verifiable-credentials" },
  /** Create or execute Agents Ciba Requests */
  postEnvEnvIdAgentsCibaRequests: { method: "POST", path: "/api/admin/env/{envId}/agents/ciba/requests" },
  /** Create or execute Ciba Requests Approve */
  postEnvEnvIdAgentsCibaRequestsRequestIdApprove: { method: "POST", path: "/api/admin/env/{envId}/agents/ciba/requests/{requestId}/approve" },
  /** Expire agent CIBA request */
  postEnvEnvIdAgentsCibaRequestsRequestIdExpire: { method: "POST", path: "/api/admin/env/{envId}/agents/ciba/requests/{requestId}/expire" },
  /** Reject agent CIBA request */
  postEnvEnvIdAgentsCibaRequestsRequestIdReject: { method: "POST", path: "/api/admin/env/{envId}/agents/ciba/requests/{requestId}/reject" },
  /** Create or execute Env Agents Delegations */
  postEnvEnvIdAgentsDelegations: { method: "POST", path: "/api/admin/env/{envId}/agents/delegations" },
  /** Create or execute Delegations Cross Org Introspect */
  postEnvEnvIdAgentsDelegationsCrossOrgIntrospect: { method: "POST", path: "/api/admin/env/{envId}/agents/delegations/cross-org/introspect" },
  /** Create or execute Agents Delegations Cross Org Proof */
  postEnvEnvIdAgentsDelegationsGrantIdCrossOrgProof: { method: "POST", path: "/api/admin/env/{envId}/agents/delegations/{grantId}/cross-org-proof" },
  /** Create or execute Agents Delegations Proof */
  postEnvEnvIdAgentsDelegationsGrantIdProof: { method: "POST", path: "/api/admin/env/{envId}/agents/delegations/{grantId}/proof" },
  /** Revoke agent delegation */
  postEnvEnvIdAgentsDelegationsGrantIdRevoke: { method: "POST", path: "/api/admin/env/{envId}/agents/delegations/{grantId}/revoke" },
  /** Create or execute Delegations Proof Introspect */
  postEnvEnvIdAgentsDelegationsProofIntrospect: { method: "POST", path: "/api/admin/env/{envId}/agents/delegations/proof/introspect" },
  /** Create or execute Env Agents Sessions */
  postEnvEnvIdAgentsSessions: { method: "POST", path: "/api/admin/env/{envId}/agents/sessions" },
  /** Create or execute Agents Sessions Heartbeat */
  postEnvEnvIdAgentsSessionsSessionIdHeartbeat: { method: "POST", path: "/api/admin/env/{envId}/agents/sessions/{sessionId}/heartbeat" },
  /** Create or execute Agents Sessions Resume */
  postEnvEnvIdAgentsSessionsSessionIdResume: { method: "POST", path: "/api/admin/env/{envId}/agents/sessions/{sessionId}/resume" },
  /** Create or execute Agents Sessions Revalidate */
  postEnvEnvIdAgentsSessionsSessionIdRevalidate: { method: "POST", path: "/api/admin/env/{envId}/agents/sessions/{sessionId}/revalidate" },
  /** Suspend agent session */
  postEnvEnvIdAgentsSessionsSessionIdSuspend: { method: "POST", path: "/api/admin/env/{envId}/agents/sessions/{sessionId}/suspend" },
  /** Create or execute Agents Token Vault Credentials */
  postEnvEnvIdAgentsTokenVaultCredentials: { method: "POST", path: "/api/admin/env/{envId}/agents/token-vault/credentials" },
  /** Create or execute Token Vault Credentials Health */
  postEnvEnvIdAgentsTokenVaultCredentialsCredentialIdHealth: { method: "POST", path: "/api/admin/env/{envId}/agents/token-vault/credentials/{credentialId}/health" },
  /** Revoke token-vault credential */
  postEnvEnvIdAgentsTokenVaultCredentialsCredentialIdRevoke: { method: "POST", path: "/api/admin/env/{envId}/agents/token-vault/credentials/{credentialId}/revoke" },
  /** Create or execute Agents Token Vault Proxy Token */
  postEnvEnvIdAgentsTokenVaultProxyToken: { method: "POST", path: "/api/admin/env/{envId}/agents/token-vault/proxy-token" },
  /** Create or execute Token Vault Proxy Token Introspect */
  postEnvEnvIdAgentsTokenVaultProxyTokenIntrospect: { method: "POST", path: "/api/admin/env/{envId}/agents/token-vault/proxy-token/introspect" },
  /** Create or execute Admin Env Api Keys */
  postEnvEnvIdApiKeys: { method: "POST", path: "/api/admin/env/{envId}/api-keys" },
  /** Rotate API key */
  postEnvEnvIdApiKeysKeyIdRotate: { method: "POST", path: "/api/admin/env/{envId}/api-keys/{keyId}/rotate" },
  /** Create or execute Admin Env Applications */
  postEnvEnvIdApplications: { method: "POST", path: "/api/admin/env/{envId}/applications" },
  /** Create or execute Admin Env Approval Substitutes */
  postEnvEnvIdApprovalSubstitutes: { method: "POST", path: "/api/admin/env/{envId}/approval-substitutes" },
  /** Create or execute Env Approval Substitutes Check */
  postEnvEnvIdApprovalSubstitutesCheck: { method: "POST", path: "/api/admin/env/{envId}/approval-substitutes/check" },
  /** Create or execute Admin Env Approval Workflows */
  postEnvEnvIdApprovalWorkflows: { method: "POST", path: "/api/admin/env/{envId}/approval-workflows" },
  /** Create or execute Admin Env Approvals */
  postEnvEnvIdApprovals: { method: "POST", path: "/api/admin/env/{envId}/approvals" },
  /** Create or execute Env Approvals Advance */
  postEnvEnvIdApprovalsApprovalIdAdvance: { method: "POST", path: "/api/admin/env/{envId}/approvals/{approvalId}/advance" },
  /** Create or execute Env Approvals Approve */
  postEnvEnvIdApprovalsApprovalIdApprove: { method: "POST", path: "/api/admin/env/{envId}/approvals/{approvalId}/approve" },
  /** Cancel approval */
  postEnvEnvIdApprovalsApprovalIdCancel: { method: "POST", path: "/api/admin/env/{envId}/approvals/{approvalId}/cancel" },
  /** Reject approval */
  postEnvEnvIdApprovalsApprovalIdReject: { method: "POST", path: "/api/admin/env/{envId}/approvals/{approvalId}/reject" },
  /** Reject approval step */
  postEnvEnvIdApprovalsApprovalIdRejectStep: { method: "POST", path: "/api/admin/env/{envId}/approvals/{approvalId}/reject-step" },
  /** Create or execute Env Approvals Review */
  postEnvEnvIdApprovalsApprovalIdReview: { method: "POST", path: "/api/admin/env/{envId}/approvals/{approvalId}/review" },
  /** Create or execute Env Approvals Multi Step */
  postEnvEnvIdApprovalsMultiStep: { method: "POST", path: "/api/admin/env/{envId}/approvals/multi-step" },
  /** Create or execute Env Audit Log Alerts */
  postEnvEnvIdAuditLogAlerts: { method: "POST", path: "/api/admin/env/{envId}/audit-log/alerts" },
  /** Create or execute Env Authorization Model Validate */
  postEnvEnvIdAuthorizationModelValidate: { method: "POST", path: "/api/admin/env/{envId}/authorization-model/validate" },
  /** Create or execute V1 Env Authorize */
  postEnvEnvIdAuthorize: { method: "POST", path: "/api/v1/env/{envId}/authorize" },
  /** Create or execute Env Authorize Batch */
  postEnvEnvIdAuthorizeBatch: { method: "POST", path: "/api/v1/env/{envId}/authorize/batch" },
  /** Create or execute Admin Env Branding */
  postEnvEnvIdBranding: { method: "POST", path: "/api/admin/env/{envId}/branding" },
  /** Create or execute Env Branding Template Catalog */
  postEnvEnvIdBrandingTemplateCatalog: { method: "POST", path: "/api/admin/env/{envId}/branding/template-catalog" },
  /** Create or execute Env Branding Widgets */
  postEnvEnvIdBrandingWidgets: { method: "POST", path: "/api/admin/env/{envId}/branding/widgets" },
  /** Unlock brute-force protection */
  postEnvEnvIdBruteForceUnlock: { method: "POST", path: "/api/admin/env/{envId}/brute-force/unlock" },
  /** Create or execute Env Capabilities Changed */
  postEnvEnvIdCapabilitiesChanged: { method: "POST", path: "/api/admin/env/{envId}/capabilities/changed" },
  /** Create or execute Env Catalog Addon Features */
  postEnvEnvIdCatalogAddonFeatures: { method: "POST", path: "/api/admin/env/{envId}/catalog/addon-features" },
  /** Create or execute Env Catalog Addons */
  postEnvEnvIdCatalogAddons: { method: "POST", path: "/api/admin/env/{envId}/catalog/addons" },
  /** Create or execute Env Catalog Approval Requests */
  postEnvEnvIdCatalogApprovalRequests: { method: "POST", path: "/api/admin/env/{envId}/catalog/approval-requests" },
  /** Create or execute Env Catalog Experiments */
  postEnvEnvIdCatalogExperiments: { method: "POST", path: "/api/admin/env/{envId}/catalog/experiments" },
  /** Create or execute Env Catalog Features */
  postEnvEnvIdCatalogFeatures: { method: "POST", path: "/api/admin/env/{envId}/catalog/features" },
  /** Create or execute Env Catalog Meters */
  postEnvEnvIdCatalogMeters: { method: "POST", path: "/api/admin/env/{envId}/catalog/meters" },
  /** Create or execute Env Catalog Overlays */
  postEnvEnvIdCatalogOverlays: { method: "POST", path: "/api/admin/env/{envId}/catalog/overlays" },
  /** Create or execute Env Catalog Plan Features */
  postEnvEnvIdCatalogPlanFeatures: { method: "POST", path: "/api/admin/env/{envId}/catalog/plan-features" },
  /** Create or execute Env Catalog Plans */
  postEnvEnvIdCatalogPlans: { method: "POST", path: "/api/admin/env/{envId}/catalog/plans" },
  /** Create or execute Env Catalog Prices */
  postEnvEnvIdCatalogPrices: { method: "POST", path: "/api/admin/env/{envId}/catalog/prices" },
  /** Create or execute Env Catalog Publish */
  postEnvEnvIdCatalogPublish: { method: "POST", path: "/api/admin/env/{envId}/catalog/publish" },
  /** Create or execute Env Catalog Rollback */
  postEnvEnvIdCatalogRollback: { method: "POST", path: "/api/admin/env/{envId}/catalog/rollback" },
  /** Create or execute Env Catalog Seed */
  postEnvEnvIdCatalogSeed: { method: "POST", path: "/api/admin/env/{envId}/catalog/seed" },
  /** Create or execute Commercial Settlement Resolve */
  postEnvEnvIdCommercialSettlementResolve: { method: "POST", path: "/api/admin/env/{envId}/commercial/settlement/resolve" },
  /** Create or execute Admin Env Conditional Assignments */
  postEnvEnvIdConditionalAssignments: { method: "POST", path: "/api/admin/env/{envId}/conditional-assignments" },
  /** Create or execute Env Conditional Assignments Dry Run */
  postEnvEnvIdConditionalAssignmentsDryRun: { method: "POST", path: "/api/admin/env/{envId}/conditional-assignments/dry-run" },
  /** Create or execute Env Conditional Assignments Evaluate */
  postEnvEnvIdConditionalAssignmentsEvaluate: { method: "POST", path: "/api/admin/env/{envId}/conditional-assignments/evaluate" },
  /** Create or execute Connected Application Agent Authorize */
  postEnvEnvIdConnectedApplicationAgentAuthorize: { method: "POST", path: "/api/v1/env/{envId}/connected-application/agent/authorize" },
  /** Create or execute Connected Application Atlas Authorize */
  postEnvEnvIdConnectedApplicationAtlasAuthorize: { method: "POST", path: "/api/v1/env/{envId}/connected-application/atlas/authorize" },
  /** Create or execute Connected Application Atlas Authorize Execution */
  postEnvEnvIdConnectedApplicationAtlasAuthorizeExecution: { method: "POST", path: "/api/v1/env/{envId}/connected-application/atlas/authorize-execution" },
  /** Create or execute Connected Application Content Authorize */
  postEnvEnvIdConnectedApplicationContentAuthorize: { method: "POST", path: "/api/v1/env/{envId}/connected-application/content/authorize" },
  /** Create or execute Connected Application Tables Authorize */
  postEnvEnvIdConnectedApplicationTablesAuthorize: { method: "POST", path: "/api/v1/env/{envId}/connected-application/tables/authorize" },
  /** Create or execute Env Connected Applications Install */
  postEnvEnvIdConnectedApplicationsInstall: { method: "POST", path: "/api/admin/env/{envId}/connected-applications/install" },
  /** Create or execute Admin Env Connections */
  postEnvEnvIdConnections: { method: "POST", path: "/api/admin/env/{envId}/connections" },
  /** Reset identity-provider connection */
  postEnvEnvIdConnectionsConnIdReset: { method: "POST", path: "/api/admin/env/{envId}/connections/{connId}/reset" },
  /** Create or execute Env Connections Test */
  postEnvEnvIdConnectionsConnIdTest: { method: "POST", path: "/api/admin/env/{envId}/connections/{connId}/test" },
  /** Sync auth providers from another environment */
  postEnvEnvIdConnectionsSyncFromEnv: { method: "POST", path: "/api/admin/env/{envId}/connections/sync-from-env" },
  /** Create or execute Env Consistency Token Validate */
  postEnvEnvIdConsistencyTokenValidate: { method: "POST", path: "/api/admin/env/{envId}/consistency-token/validate" },
  /** Create or execute Admin Env Credentials */
  postEnvEnvIdCredentials: { method: "POST", path: "/api/admin/env/{envId}/credentials" },
  /** Create or execute Env Credentials Grants */
  postEnvEnvIdCredentialsCredentialIdGrants: { method: "POST", path: "/api/admin/env/{envId}/credentials/{credentialId}/grants" },
  /** Create or execute Oauth Google Start */
  postEnvEnvIdCredentialsOauthGoogleStart: { method: "POST", path: "/api/admin/env/{envId}/credentials/oauth/google/start" },
  /** Create or execute Data Isolation Operations Replay */
  postEnvEnvIdDataIsolationOperationsOperationIdReplay: { method: "POST", path: "/api/v1/admin/env/{envId}/data-isolation/operations/{operationId}/replay" },
  /** Create or execute Data Isolation Operations Replay */
  postEnvEnvIdDataIsolationOperationsReplay: { method: "POST", path: "/api/v1/admin/env/{envId}/data-isolation/operations/replay" },
  /** Create or execute Data Isolation Operations Replay By Query */
  postEnvEnvIdDataIsolationOperationsReplayByQuery: { method: "POST", path: "/api/v1/admin/env/{envId}/data-isolation/operations/replay-by-query" },
  /** Create or execute Env Data Isolation Refresh */
  postEnvEnvIdDataIsolationRefresh: { method: "POST", path: "/api/v1/admin/env/{envId}/data-isolation/refresh" },
  /** Create or execute Env Decision Log Cleanup */
  postEnvEnvIdDecisionLogCleanup: { method: "POST", path: "/api/admin/env/{envId}/decision-log/cleanup" },
  /** Create or execute Admin Env Delegations */
  postEnvEnvIdDelegations: { method: "POST", path: "/api/admin/env/{envId}/delegations" },
  /** Create or execute Env Delegations Extend */
  postEnvEnvIdDelegationsDelegIdExtend: { method: "POST", path: "/api/admin/env/{envId}/delegations/{delegId}/extend" },
  /** Create or execute Env Delegations Validate */
  postEnvEnvIdDelegationsDelegIdValidate: { method: "POST", path: "/api/admin/env/{envId}/delegations/{delegId}/validate" },
  /** Create or execute Env Delegations Scoped */
  postEnvEnvIdDelegationsScoped: { method: "POST", path: "/api/admin/env/{envId}/delegations/scoped" },
  /** Create or execute Env Delegations With Approval */
  postEnvEnvIdDelegationsWithApproval: { method: "POST", path: "/api/admin/env/{envId}/delegations/with-approval" },
  /** Create or execute Env Devices Trust */
  postEnvEnvIdDevicesDeviceIdTrust: { method: "POST", path: "/api/admin/env/{envId}/devices/{deviceId}/trust" },
  /** Create or execute Env Devices Trust Status */
  postEnvEnvIdDevicesDeviceIdTrustStatus: { method: "POST", path: "/api/admin/env/{envId}/devices/{deviceId}/trust-status" },
  /** Create or execute Admin Env Domains */
  postEnvEnvIdDomains: { method: "POST", path: "/api/admin/env/{envId}/domains" },
  /** Create or execute Env Domains Refresh */
  postEnvEnvIdDomainsDomainIdRefresh: { method: "POST", path: "/api/admin/env/{envId}/domains/{domainId}/refresh" },
  /** Create or execute Env Domains Verify */
  postEnvEnvIdDomainsDomainIdVerify: { method: "POST", path: "/api/admin/env/{envId}/domains/{domainId}/verify" },
  /** Create or execute Env Domains Verify Observed */
  postEnvEnvIdDomainsDomainIdVerifyObserved: { method: "POST", path: "/api/admin/env/{envId}/domains/{domainId}/verify-observed" },
  /** Create or execute Admin Env Email Config */
  postEnvEnvIdEmailConfig: { method: "POST", path: "/api/admin/env/{envId}/email-config" },
  /** Create or execute Admin Env Email Templates */
  postEnvEnvIdEmailTemplates: { method: "POST", path: "/api/admin/env/{envId}/email-templates" },
  /** Create or execute Admin Env Flows */
  postEnvEnvIdFlows: { method: "POST", path: "/api/admin/env/{envId}/flows" },
  /** Create or execute Admin Env Groups */
  postEnvEnvIdGroups: { method: "POST", path: "/api/admin/env/{envId}/groups" },
  /** Create or execute Env Groups Dynamic Rules */
  postEnvEnvIdGroupsDynamicRules: { method: "POST", path: "/api/admin/env/{envId}/groups/dynamic-rules" },
  /** Create or execute Env Groups Members */
  postEnvEnvIdGroupsGroupIdMembers: { method: "POST", path: "/api/admin/env/{envId}/groups/{groupId}/members" },
  /** Create or execute Env Groups Roles */
  postEnvEnvIdGroupsGroupIdRoles: { method: "POST", path: "/api/admin/env/{envId}/groups/{groupId}/roles" },
  /** Create or execute Env Impersonate Start */
  postEnvEnvIdImpersonateStart: { method: "POST", path: "/api/admin/env/{envId}/impersonate/start" },
  /** Stop admin impersonation */
  postEnvEnvIdImpersonateStop: { method: "POST", path: "/api/admin/env/{envId}/impersonate/stop" },
  /** Create an actor token to impersonate a user */
  postEnvEnvIdImpersonationActorTokens: { method: "POST", path: "/api/v1/env/{envId}/impersonation/actor-tokens" },
  /** Consume an actor token and create an impersonation session */
  postEnvEnvIdImpersonationAuthenticate: { method: "POST", path: "/api/v1/env/{envId}/impersonation/authenticate" },
  /** Stop impersonation */
  postEnvEnvIdImpersonationStop: { method: "POST", path: "/api/v1/env/{envId}/impersonation/stop" },
  /** Stop current impersonation */
  postEnvEnvIdImpersonationStopCurrent: { method: "POST", path: "/api/v1/env/{envId}/impersonation/stop-current" },
  /** Test webhook delivery */
  postEnvEnvIdImpersonationTestWebhook: { method: "POST", path: "/api/v1/env/{envId}/impersonation/test-webhook" },
  /** Create or execute Env Integrations Email */
  postEnvEnvIdIntegrationsEmail: { method: "POST", path: "/api/admin/env/{envId}/integrations/email" },
  /** Create or execute Integrations Email Test */
  postEnvEnvIdIntegrationsEmailTestProviderId: { method: "POST", path: "/api/admin/env/{envId}/integrations/email/test/{providerId}" },
  /** Create or execute Env Integrations Sms */
  postEnvEnvIdIntegrationsSms: { method: "POST", path: "/api/admin/env/{envId}/integrations/sms" },
  /** Create or execute Integrations Sms Test */
  postEnvEnvIdIntegrationsSmsTestProviderId: { method: "POST", path: "/api/admin/env/{envId}/integrations/sms/test/{providerId}" },
  /** Create or execute Admin Env Limit Definitions */
  postEnvEnvIdLimitDefinitions: { method: "POST", path: "/api/admin/env/{envId}/limit-definitions" },
  /** Create or execute Admin Env Limits */
  postEnvEnvIdLimits: { method: "POST", path: "/api/admin/env/{envId}/limits" },
  /** Create or execute Env Limits Assign */
  postEnvEnvIdLimitsAssign: { method: "POST", path: "/api/admin/env/{envId}/limits/assign" },
  /** Create or execute Env Limits Overrides */
  postEnvEnvIdLimitsLimitIdOverrides: { method: "POST", path: "/api/admin/env/{envId}/limits/{limitId}/overrides" },
  /** Reset environment limits */
  postEnvEnvIdLimitsReset: { method: "POST", path: "/api/admin/env/{envId}/limits/reset" },
  /** Create or execute Admin Env Log Streams */
  postEnvEnvIdLogStreams: { method: "POST", path: "/api/v1/admin/env/{envId}/log-streams" },
  /** Create or execute V1 Env Log Streams */
  postEnvEnvIdLogStreams2: { method: "POST", path: "/api/v1/env/{envId}/log-streams" },
  /** Rotate admin log-stream secret */
  postEnvEnvIdLogStreamsStreamIdRotateSecret: { method: "POST", path: "/api/v1/admin/env/{envId}/log-streams/{streamId}/rotate-secret" },
  /** Rotate log-stream secret */
  postEnvEnvIdLogStreamsStreamIdRotateSecret2: { method: "POST", path: "/api/v1/env/{envId}/log-streams/{streamId}/rotate-secret" },
  /** Create or execute Env Log Streams Test */
  postEnvEnvIdLogStreamsStreamIdTest: { method: "POST", path: "/api/v1/admin/env/{envId}/log-streams/{streamId}/test" },
  /** Create or execute Env Log Streams Test */
  postEnvEnvIdLogStreamsStreamIdTest2: { method: "POST", path: "/api/v1/env/{envId}/log-streams/{streamId}/test" },
  /** Create or execute Env Log Streams Validate */
  postEnvEnvIdLogStreamsValidate: { method: "POST", path: "/api/v1/admin/env/{envId}/log-streams/validate" },
  /** Create or execute Env Log Streams Validate */
  postEnvEnvIdLogStreamsValidate2: { method: "POST", path: "/api/v1/env/{envId}/log-streams/validate" },
  /** Create or execute Env Mcp Authorize Tool */
  postEnvEnvIdMcpAuthorizeTool: { method: "POST", path: "/api/admin/env/{envId}/mcp/authorize-tool" },
  /** Create or execute Mcp Clients Register */
  postEnvEnvIdMcpClientsRegister: { method: "POST", path: "/api/admin/env/{envId}/mcp/clients/register" },
  /** Create or execute Env Mcp Servers */
  postEnvEnvIdMcpServers: { method: "POST", path: "/api/admin/env/{envId}/mcp/servers" },
  /** Create or execute Mcp Servers Enforcement Check */
  postEnvEnvIdMcpServersServerIdEnforcementCheck: { method: "POST", path: "/api/admin/env/{envId}/mcp/servers/{serverId}/enforcement-check" },
  /** Create or execute Env Mcp Token */
  postEnvEnvIdMcpToken: { method: "POST", path: "/api/admin/env/{envId}/mcp/token" },
  /** Create or execute Mcp Token Introspect */
  postEnvEnvIdMcpTokenIntrospect: { method: "POST", path: "/api/admin/env/{envId}/mcp/token/introspect" },
  /** Create or execute Admin Env Member Limits */
  postEnvEnvIdMemberLimits: { method: "POST", path: "/api/admin/env/{envId}/member-limits" },
  /** Create or execute Admin Env Member Permissions */
  postEnvEnvIdMemberPermissions: { method: "POST", path: "/api/admin/env/{envId}/member-permissions" },
  /** Create or execute Admin Env Member Restrictions */
  postEnvEnvIdMemberRestrictions: { method: "POST", path: "/api/admin/env/{envId}/member-restrictions" },
  /** Create or execute Env Oidc Test */
  postEnvEnvIdOidcTest: { method: "POST", path: "/api/admin/env/{envId}/oidc/test" },
  /** Create or execute Env Openid4vc Credential */
  postEnvEnvIdOpenid4vcCredential: { method: "POST", path: "/api/admin/env/{envId}/openid4vc/credential" },
  /** Create or execute Env Openid4vc Credential Offers */
  postEnvEnvIdOpenid4vcCredentialOffers: { method: "POST", path: "/api/admin/env/{envId}/openid4vc/credential-offers" },
  /** Create or execute Env Openid4vc Deferred Credential */
  postEnvEnvIdOpenid4vcDeferredCredential: { method: "POST", path: "/api/admin/env/{envId}/openid4vc/deferred-credential" },
  /** Create or execute Env Openid4vc Verify Presentation */
  postEnvEnvIdOpenid4vcVerifyPresentation: { method: "POST", path: "/api/admin/env/{envId}/openid4vc/verify-presentation" },
  /** Create or execute Env Openid4vc Wallet Sessions */
  postEnvEnvIdOpenid4vcWalletSessions: { method: "POST", path: "/api/admin/env/{envId}/openid4vc/wallet-sessions" },
  /** Create or execute Openid4vc Wallet Sessions Complete */
  postEnvEnvIdOpenid4vcWalletSessionsComplete: { method: "POST", path: "/api/admin/env/{envId}/openid4vc/wallet-sessions/complete" },
  /** Create or execute Openid4vc Wallet Sessions Introspect */
  postEnvEnvIdOpenid4vcWalletSessionsIntrospect: { method: "POST", path: "/api/admin/env/{envId}/openid4vc/wallet-sessions/introspect" },
  /** Create or execute Env Organizations Branding */
  postEnvEnvIdOrganizationsOrganizationIdBranding: { method: "POST", path: "/api/admin/env/{envId}/organizations/{organizationId}/branding" },
  /** Create or execute Env Orgs Entitlement Override */
  postEnvEnvIdOrgsOrgIdEntitlementOverride: { method: "POST", path: "/api/admin/env/{envId}/orgs/{orgId}/entitlement-override" },
  /** Create or execute Env Orgs Price Override */
  postEnvEnvIdOrgsOrgIdPriceOverride: { method: "POST", path: "/api/admin/env/{envId}/orgs/{orgId}/price-override" },
  /** Create or execute Admin Env Permissions */
  postEnvEnvIdPermissions: { method: "POST", path: "/api/admin/env/{envId}/permissions" },
  /** Create or execute Env Permissions Evaluate */
  postEnvEnvIdPermissionsEvaluate: { method: "POST", path: "/api/admin/env/{envId}/permissions/evaluate" },
  /** Create or execute Admin Env Policies */
  postEnvEnvIdPolicies: { method: "POST", path: "/api/admin/env/{envId}/policies" },
  /** Create or execute Env Policies Dry Run */
  postEnvEnvIdPoliciesDryRun: { method: "POST", path: "/api/admin/env/{envId}/policies/dry-run" },
  /** Create or execute Env Policies Revert */
  postEnvEnvIdPoliciesPolicyIdRevert: { method: "POST", path: "/api/admin/env/{envId}/policies/{policyId}/revert" },
  /** Create or execute Env Policies Snapshot */
  postEnvEnvIdPoliciesPolicyIdSnapshot: { method: "POST", path: "/api/admin/env/{envId}/policies/{policyId}/snapshot" },
  /** Create or execute Env Policies Subjects */
  postEnvEnvIdPoliciesPolicyIdSubjects: { method: "POST", path: "/api/admin/env/{envId}/policies/{policyId}/subjects" },
  /** Create or execute Env Policies Toggle */
  postEnvEnvIdPoliciesPolicyIdToggle: { method: "POST", path: "/api/admin/env/{envId}/policies/{policyId}/toggle" },
  /** Create or execute Env Policies Test */
  postEnvEnvIdPoliciesTest: { method: "POST", path: "/api/admin/env/{envId}/policies/test" },
  /** Create or execute Env Policy Templates Apply */
  postEnvEnvIdPolicyTemplatesTemplateIdApply: { method: "POST", path: "/api/admin/env/{envId}/policy-templates/{templateId}/apply" },
  /** Generate Admin Portal Link */
  postEnvEnvIdPortal: { method: "POST", path: "/api/v1/admin/env/{envId}/portal" },
  /** Create or execute Pricing Catalog Publish */
  postEnvEnvIdPricingCatalogPublish: { method: "POST", path: "/api/admin/env/{envId}/pricing/catalog/publish" },
  /** Create or execute Pricing Catalog Register */
  postEnvEnvIdPricingCatalogRegister: { method: "POST", path: "/api/admin/env/{envId}/pricing/catalog/register" },
  /** Create or execute Env Product Governance Connect Agent */
  postEnvEnvIdProductGovernanceConnectAgent: { method: "POST", path: "/api/admin/env/{envId}/product-governance/connect-agent" },
  /** Create or execute Env Product Governance Materialize */
  postEnvEnvIdProductGovernanceMaterialize: { method: "POST", path: "/api/admin/env/{envId}/product-governance/materialize" },
  /** Sync governed product auth providers */
  postEnvEnvIdProductGovernanceSyncAuthProviders: { method: "POST", path: "/api/admin/env/{envId}/product-governance/sync-auth-providers" },
  /** Create or execute Admin Env Projects */
  postEnvEnvIdProjects: { method: "POST", path: "/api/admin/env/{envId}/projects" },
  /** Create or execute Admin Env Provision Ecosystem */
  postEnvEnvIdProvisionEcosystem: { method: "POST", path: "/api/admin/env/{envId}/provision-ecosystem" },
  /** Create or execute Rag Access Filter */
  postEnvEnvIdRagAccessFilter: { method: "POST", path: "/api/admin/env/{envId}/rag/access/filter" },
  /** Create or execute Env Rag Field Access */
  postEnvEnvIdRagFieldAccess: { method: "POST", path: "/api/admin/env/{envId}/rag/field-access" },
  /** Create or execute Rag Field Access Apply */
  postEnvEnvIdRagFieldAccessApply: { method: "POST", path: "/api/admin/env/{envId}/rag/field-access/apply" },
  /** Create or execute Env Rag Provenance */
  postEnvEnvIdRagProvenance: { method: "POST", path: "/api/admin/env/{envId}/rag/provenance" },
  /** Create or execute Rag Retrieve Consume */
  postEnvEnvIdRagRetrieveConsume: { method: "POST", path: "/api/admin/env/{envId}/rag/retrieve/consume" },
  /** Create or execute Rag Retrieve Evaluate */
  postEnvEnvIdRagRetrieveEvaluate: { method: "POST", path: "/api/admin/env/{envId}/rag/retrieve/evaluate" },
  /** Create or execute Admin Env Rate Limit Policies */
  postEnvEnvIdRateLimitPolicies: { method: "POST", path: "/api/admin/env/{envId}/rate-limit-policies" },
  /** Create or execute Env Recertification Campaigns */
  postEnvEnvIdRecertificationCampaigns: { method: "POST", path: "/api/admin/env/{envId}/recertification/campaigns" },
  /** Create or execute Recertification Campaigns Run */
  postEnvEnvIdRecertificationCampaignsCampaignIdRun: { method: "POST", path: "/api/admin/env/{envId}/recertification/campaigns/{campaignId}/run" },
  /** Create or execute Admin Env Relationships */
  postEnvEnvIdRelationships: { method: "POST", path: "/api/admin/env/{envId}/relationships" },
  /** Create or execute Env Relationships Batch */
  postEnvEnvIdRelationshipsBatch: { method: "POST", path: "/api/admin/env/{envId}/relationships/batch" },
  /** Create or execute Env Relationships Expand */
  postEnvEnvIdRelationshipsExpand: { method: "POST", path: "/api/admin/env/{envId}/relationships/expand" },
  /** Create or execute Admin Env Reload Auth */
  postEnvEnvIdReloadAuth: { method: "POST", path: "/api/admin/env/{envId}/reload-auth" },
  /** Create or execute Env Replay Entitlements */
  postEnvEnvIdReplayEntitlements: { method: "POST", path: "/api/admin/env/{envId}/replay/entitlements" },
  /** Create or execute Env Reseller Assign */
  postEnvEnvIdResellerAssign: { method: "POST", path: "/api/admin/env/{envId}/reseller/assign" },
  /** Create or execute Env Reseller Grant Product */
  postEnvEnvIdResellerGrantProduct: { method: "POST", path: "/api/admin/env/{envId}/reseller/grant-product" },
  /** Create or execute Admin Env Resource Types */
  postEnvEnvIdResourceTypes: { method: "POST", path: "/api/admin/env/{envId}/resource-types" },
  /** Create or execute Env Resource Types Relations */
  postEnvEnvIdResourceTypesTypeIdRelations: { method: "POST", path: "/api/admin/env/{envId}/resource-types/{typeId}/relations" },
  /** Create or execute Admin Env Role Assignments */
  postEnvEnvIdRoleAssignments: { method: "POST", path: "/api/admin/env/{envId}/role-assignments" },
  /** Create or execute Admin Env Role Constraints */
  postEnvEnvIdRoleConstraints: { method: "POST", path: "/api/admin/env/{envId}/role-constraints" },
  /** Create or execute Env Role Constraints Validate */
  postEnvEnvIdRoleConstraintsValidate: { method: "POST", path: "/api/admin/env/{envId}/role-constraints/validate" },
  /** Create or execute Admin Env Roles */
  postEnvEnvIdRoles: { method: "POST", path: "/api/admin/env/{envId}/roles" },
  /** Create or execute Env Roles Permissions */
  postEnvEnvIdRolesRoleIdPermissions: { method: "POST", path: "/api/admin/env/{envId}/roles/{roleId}/permissions" },
  /** Create or execute Env Roles Promote */
  postEnvEnvIdRolesRoleIdPromote: { method: "POST", path: "/api/admin/env/{envId}/roles/{roleId}/promote" },
  /** Rotate environment secret */
  postEnvEnvIdRotateSecret: { method: "POST", path: "/api/admin/env/{envId}/rotate-secret" },
  /** Create or execute Admin Env Scim Configs */
  postEnvEnvIdScimConfigs: { method: "POST", path: "/api/admin/env/{envId}/scim-configs" },
  /** Create or execute Env Scim Configs Dry Run */
  postEnvEnvIdScimConfigsConfigIdDryRun: { method: "POST", path: "/api/admin/env/{envId}/scim-configs/{configId}/dry-run" },
  /** Create or execute Env Scim Configs Group Role Mappings */
  postEnvEnvIdScimConfigsConfigIdGroupRoleMappings: { method: "POST", path: "/api/admin/env/{envId}/scim-configs/{configId}/group-role-mappings" },
  /** Rotate SCIM token */
  postEnvEnvIdScimConfigsConfigIdRotateToken: { method: "POST", path: "/api/admin/env/{envId}/scim-configs/{configId}/rotate-token" },
  /** Create or execute Env Scim Configs Test */
  postEnvEnvIdScimConfigsConfigIdTest: { method: "POST", path: "/api/admin/env/{envId}/scim-configs/{configId}/test" },
  /** Create or execute Env Secrets Migrate */
  postEnvEnvIdSecretsMigrate: { method: "POST", path: "/api/v1/admin/env/{envId}/secrets/migrate" },
  /** Create or execute Env Security Ip Access */
  postEnvEnvIdSecurityIpAccess: { method: "POST", path: "/api/admin/env/{envId}/security/ip-access" },
  /** Create or execute Admin Env Seed Rbac */
  postEnvEnvIdSeedRbac: { method: "POST", path: "/api/admin/env/{envId}/seed-rbac" },
  /** Create or execute Admin Env Session Policies */
  postEnvEnvIdSessionPolicies: { method: "POST", path: "/api/admin/env/{envId}/session-policies" },
  /** Create or execute Admin Env Siem Config */
  postEnvEnvIdSiemConfig: { method: "POST", path: "/api/admin/env/{envId}/siem-config" },
  /** Create or execute Env Siem Config Test */
  postEnvEnvIdSiemConfigConfigIdTest: { method: "POST", path: "/api/admin/env/{envId}/siem-config/{configId}/test" },
  /** Create or execute Env Siem Config Test */
  postEnvEnvIdSiemConfigTest: { method: "POST", path: "/api/admin/env/{envId}/siem-config/test" },
  /** Create or execute Admin Env Simulate */
  postEnvEnvIdSimulate: { method: "POST", path: "/api/admin/env/{envId}/simulate" },
  /** Create or execute Env Token Exchange */
  postEnvEnvIdTokenExchange: { method: "POST", path: "/api/admin/env/{envId}/token/exchange" },
  /** Create or execute Env Token Exchange Policies */
  postEnvEnvIdTokenExchangePolicies: { method: "POST", path: "/api/admin/env/{envId}/token/exchange-policies" },
  /** Create or execute Admin Env Trust Registry */
  postEnvEnvIdTrustRegistry: { method: "POST", path: "/api/admin/env/{envId}/trust-registry" },
  /** Create or execute Env Trust Registry Status */
  postEnvEnvIdTrustRegistryEntryIdStatus: { method: "POST", path: "/api/admin/env/{envId}/trust-registry/{entryId}/status" },
  /** Create or execute Admin Env Users */
  postEnvEnvIdUsers: { method: "POST", path: "/api/admin/env/{envId}/users" },
  /** Create or execute Env Users Import */
  postEnvEnvIdUsersImport: { method: "POST", path: "/api/v1/admin/env/{envId}/users/import" },
  /** Ban user */
  postEnvEnvIdUsersUserIdBan: { method: "POST", path: "/api/admin/env/{envId}/users/{userId}/ban" },
  /** Force user password reset */
  postEnvEnvIdUsersUserIdForcePasswordReset: { method: "POST", path: "/api/admin/env/{envId}/users/{userId}/force-password-reset" },
  /** Reset user two-factor authentication */
  postEnvEnvIdUsersUserIdReset2fa: { method: "POST", path: "/api/admin/env/{envId}/users/{userId}/reset-2fa" },
  /** Reset user password */
  postEnvEnvIdUsersUserIdResetPassword: { method: "POST", path: "/api/admin/env/{envId}/users/{userId}/reset-password" },
  /** Create or execute Env Users Roles */
  postEnvEnvIdUsersUserIdRoles: { method: "POST", path: "/api/admin/env/{envId}/users/{userId}/roles" },
  /** Create or execute Env Users Set Password */
  postEnvEnvIdUsersUserIdSetPassword: { method: "POST", path: "/api/admin/env/{envId}/users/{userId}/set-password" },
  /** Unban user */
  postEnvEnvIdUsersUserIdUnban: { method: "POST", path: "/api/admin/env/{envId}/users/{userId}/unban" },
  /** Revoke verifiable credential */
  postEnvEnvIdVerifiableCredentialsCredentialIdRevoke: { method: "POST", path: "/api/admin/env/{envId}/verifiable-credentials/{credentialId}/revoke" },
  /** Create or execute Env Verifiable Credentials Selective Disclosure */
  postEnvEnvIdVerifiableCredentialsCredentialIdSelectiveDisclosure: { method: "POST", path: "/api/admin/env/{envId}/verifiable-credentials/{credentialId}/selective-disclosure" },
  /** Create or execute Env Verifiable Credentials Verify */
  postEnvEnvIdVerifiableCredentialsVerify: { method: "POST", path: "/api/admin/env/{envId}/verifiable-credentials/verify" },
  /** Create or execute Admin Env Webhooks */
  postEnvEnvIdWebhooks: { method: "POST", path: "/api/admin/env/{envId}/webhooks" },
  /** Create or execute Env Webhooks Bulk Toggle */
  postEnvEnvIdWebhooksBulkToggle: { method: "POST", path: "/api/admin/env/{envId}/webhooks/bulk-toggle" },
  /** Create or execute Webhooks Logs Retry */
  postEnvEnvIdWebhooksWebhookIdLogsLogIdRetry: { method: "POST", path: "/api/admin/env/{envId}/webhooks/{webhookId}/logs/{logId}/retry" },
  /** Rotate webhook secret */
  postEnvEnvIdWebhooksWebhookIdRotateSecret: { method: "POST", path: "/api/admin/env/{envId}/webhooks/{webhookId}/rotate-secret" },
  /** Create or execute Env Webhooks Test */
  postEnvEnvIdWebhooksWebhookIdTest: { method: "POST", path: "/api/admin/env/{envId}/webhooks/{webhookId}/test" },
  /** Create or execute Admin Env Workflows */
  postEnvEnvIdWorkflows: { method: "POST", path: "/api/admin/env/{envId}/workflows" },
  /** Create or execute Admin Env Workforce Members */
  postEnvEnvIdWorkforceMembers: { method: "POST", path: "/api/admin/env/{envId}/workforce-members" },
  /** Create or execute Env Workforce Members Enable Login */
  postEnvEnvIdWorkforceMembersIdEnableLogin: { method: "POST", path: "/api/admin/env/{envId}/workforce-members/{id}/enable-login" },
  /** Create or execute Environments Agent Bridge Resource Shares */
  postEnvironmentsEnvIdAgentBridgeResourceShares: { method: "POST", path: "/api/admin/environments/{envId}/agent-bridge/resource-shares" },
  /** Revoke agent bridge resource share */
  postEnvironmentsEnvIdAgentBridgeResourceSharesRevoke: { method: "POST", path: "/api/admin/environments/{envId}/agent-bridge/resource-shares/revoke" },
  /** Create or execute Admin Environments Verify Sk */
  postEnvironmentsEnvIdVerifySk: { method: "POST", path: "/api/admin/environments/{envId}/verify-sk" },
  /** Create or execute V1 Governance Token */
  postGovernanceToken: { method: "POST", path: "/v1/governance/token" },
  /** Stop legacy impersonation */
  postImpersonationStop: { method: "POST", path: "/api/v1/impersonation/stop" },
  /** Create or execute V1 M2m Flow Message Grant */
  postM2mFlowMessageGrant: { method: "POST", path: "/api/v1/m2m/flow-message-grant" },
  /** Create or execute M2m Token Introspect */
  postM2mTokenIntrospect: { method: "POST", path: "/api/v1/m2m/token/introspect" },
  /** Create or execute Admin Maintenance Retention */
  postMaintenanceRetention: { method: "POST", path: "/api/admin/maintenance/retention" },
  /** Approve Push MFA Challenge */
  postMfaPushApproveChallengeId: { method: "POST", path: "/api/v1/mfa/push/approve/{challengeId}" },
  /** Deny push MFA challenge */
  postMfaPushDenyChallengeId: { method: "POST", path: "/api/v1/mfa/push/deny/{challengeId}" },
  /** Retry Push MFA Challenge */
  postMfaPushRetryChallengeId: { method: "POST", path: "/api/v1/mfa/push/retry/{challengeId}" },
  /** Rotate push MFA VAPID keys */
  postMfaPushRotateVapid: { method: "POST", path: "/api/v1/mfa/push/rotate-vapid" },
  /** Send Push MFA Challenge */
  postMfaPushSend: { method: "POST", path: "/api/v1/mfa/push/send" },
  /** Generate Recovery Codes */
  postMfaRecoveryCodesGenerate: { method: "POST", path: "/api/v1/mfa/recovery-codes/generate" },
  /** Verify & Consume Recovery Code */
  postMfaRecoveryCodesVerify: { method: "POST", path: "/api/v1/mfa/recovery-codes/verify" },
  /** Send SMS OTP */
  postMfaSmsSend: { method: "POST", path: "/api/v1/mfa/sms/send" },
  /** Verify SMS OTP */
  postMfaSmsVerify: { method: "POST", path: "/api/v1/mfa/sms/verify" },
  /** Create or execute Oauth Introspect */
  postOauthIntrospect: { method: "POST", path: "/oauth/introspect" },
  /** Create or execute Oauth Par */
  postOauthPar: { method: "POST", path: "/oauth/par" },
  /** Create or execute V1 Oauth Token */
  postOauthToken: { method: "POST", path: "/api/v1/oauth/token" },
  /** Create or execute Oauth Token */
  postOauthToken2: { method: "POST", path: "/oauth/token" },
  /** Create or execute Org Auth Discover */
  postOrgEnvIdAuthDiscover: { method: "POST", path: "/api/org/{envId}/auth/discover" },
  /** Create or execute Auth Phone Send */
  postOrgEnvIdAuthPhoneSend: { method: "POST", path: "/api/org/{envId}/auth/phone/send" },
  /** Create or execute Auth Phone Verify */
  postOrgEnvIdAuthPhoneVerify: { method: "POST", path: "/api/org/{envId}/auth/phone/verify" },
  /** Create or execute Org Oidc Authorize */
  postOrgEnvIdOidcAuthorize: { method: "POST", path: "/api/org/{envId}/oidc/authorize" },
  /** Create or execute Data Isolation Migrations Run */
  postOrgOrgIdDataIsolationMigrationsRun: { method: "POST", path: "/api/v1/admin/org/{orgId}/data-isolation/migrations/run" },
  /** Create or execute Data Isolation Operations Replay */
  postOrgOrgIdDataIsolationOperationsOperationIdReplay: { method: "POST", path: "/api/v1/admin/org/{orgId}/data-isolation/operations/{operationId}/replay" },
  /** Create or execute Data Isolation Operations Replay */
  postOrgOrgIdDataIsolationOperationsReplay: { method: "POST", path: "/api/v1/admin/org/{orgId}/data-isolation/operations/replay" },
  /** Create or execute Data Isolation Operations Replay By Query */
  postOrgOrgIdDataIsolationOperationsReplayByQuery: { method: "POST", path: "/api/v1/admin/org/{orgId}/data-isolation/operations/replay-by-query" },
  /** Create or execute Org Data Isolation Provision */
  postOrgOrgIdDataIsolationProvision: { method: "POST", path: "/api/v1/admin/org/{orgId}/data-isolation/provision" },
  /** Create or execute Org Data Isolation Recover */
  postOrgOrgIdDataIsolationRecover: { method: "POST", path: "/api/v1/admin/org/{orgId}/data-isolation/recover" },
  /** Create or execute Org Data Isolation Refresh */
  postOrgOrgIdDataIsolationRefresh: { method: "POST", path: "/api/v1/admin/org/{orgId}/data-isolation/refresh" },
  /** Create or execute Org Data Isolation Remediate */
  postOrgOrgIdDataIsolationRemediate: { method: "POST", path: "/api/v1/admin/org/{orgId}/data-isolation/remediate" },
  /** Create or execute Org Data Isolation Validate */
  postOrgOrgIdDataIsolationValidate: { method: "POST", path: "/api/v1/admin/org/{orgId}/data-isolation/validate" },
  /** Create or execute Api Admin Organizations */
  postOrganizations: { method: "POST", path: "/api/admin/organizations" },
  /** Create or execute Admin Organizations Projects */
  postOrganizationsEnvIdProjects: { method: "POST", path: "/api/admin/organizations/{envId}/projects" },
  /** Create or execute Admin Organizations Lifecycle */
  postOrganizationsIdLifecycle: { method: "POST", path: "/api/admin/organizations/{id}/lifecycle" },
  /** Create or execute Products Control Planes Bootstrap */
  postProductsControlPlanesBootstrap: { method: "POST", path: "/api/admin/products/control-planes/bootstrap" },
  /** Create or execute Admin Products Control Plane */
  postProductsProductKeyControlPlane: { method: "POST", path: "/api/admin/products/{productKey}/control-plane" },
  /** Create or execute Admin Projects Applications */
  postProjectsProjectIdApplications: { method: "POST", path: "/api/admin/projects/{projectId}/applications" },
  /** Create or execute Public Invite Accept */
  postPublicInviteAccept: { method: "POST", path: "/api/public/invite/accept" },
  /** Create or execute Wordpress Handoff Exchange */
  postPublicWordpressHandoffExchange: { method: "POST", path: "/api/public/wordpress/handoff/exchange" },
  /** Create or execute Wordpress Oauth Exchange */
  postPublicWordpressOauthExchange: { method: "POST", path: "/api/public/wordpress/oauth/exchange" },
  /** Create or execute Wordpress Oauth Start */
  postPublicWordpressOauthStart: { method: "POST", path: "/api/public/wordpress/oauth/start" },
  /** SAML ACS — Assertion Consumer Service */
  postSamlAcsEnvironmentId: { method: "POST", path: "/saml/acs/{environmentId}" },
  /** Create or execute V2 Env Groups */
  postScimV2EnvEnvIdGroups: { method: "POST", path: "/api/scim/v2/env/{envId}/Groups" },
  /** Create or execute V2 Env Users */
  postScimV2EnvEnvIdUsers: { method: "POST", path: "/api/scim/v2/env/{envId}/Users" },
  /** Create or execute Api Admin Trusted Origins */
  postTrustedOrigins: { method: "POST", path: "/api/admin/trusted-origins" },
  /** GDPR Art.17 — Right to Erasure */
  postUserMeErase: { method: "POST", path: "/api/v1/user/me/erase" },
  /** Revoke all other sessions */
  postUserSessionsRevokeAllOthers: { method: "POST", path: "/api/v1/user/sessions/revoke-all-others" },
  /** Webhook receiver for impersonation events */
  postWebhooksImpersonation: { method: "POST", path: "/api/v1/webhooks/impersonation" },
  /** Create or execute Workspaces Products Connect Env */
  postWorkspacesWorkspaceEnvIdProductsProductKeyConnectEnv: { method: "POST", path: "/api/admin/workspaces/{workspaceEnvId}/products/{productKey}/connect-env" },
  /** Create or execute Workspaces Products Disconnect Env */
  postWorkspacesWorkspaceEnvIdProductsProductKeyDisconnectEnv: { method: "POST", path: "/api/admin/workspaces/{workspaceEnvId}/products/{productKey}/disconnect-env" },
  /** Create or execute Admin Workspaces Provision User */
  postWorkspacesWorkspaceEnvIdProvisionUser: { method: "POST", path: "/api/admin/workspaces/{workspaceEnvId}/provision-user" },
  /** Replace Workspace Layouts Current */
  putAccessWorkspaceLayoutsCurrent: { method: "PUT", path: "/api/access/v1/workspace/layouts/current" },
  /** Replace V1 Workspace Preferences */
  putAccessWorkspacePreferences: { method: "PUT", path: "/api/access/v1/workspace/preferences" },
  /** Replace V1 Workspace Regional */
  putAccessWorkspaceRegional: { method: "PUT", path: "/api/access/v1/workspace/regional" },
  /** Replace Admin Applications Dependencies */
  putApplicationsAppIdDependencies: { method: "PUT", path: "/api/admin/applications/{appId}/dependencies" },
  /** Replace Api Auth */
  putAuthWildcard: { method: "PUT", path: "/api/auth/{wildcard}" },
  /** Replace Env Account Linking Config */
  putEnvEnvIdAccountLinkingConfig: { method: "PUT", path: "/api/v1/env/{envId}/account-linking/config" },
  /** Replace Env Account Linking Trust Levels */
  putEnvEnvIdAccountLinkingTrustLevels: { method: "PUT", path: "/api/v1/env/{envId}/account-linking/trust-levels" },
  /** Replace Env Agency Guardrails */
  putEnvEnvIdAgencyGuardrails: { method: "PUT", path: "/api/admin/env/{envId}/agency/guardrails" },
  /** Replace Admin Env Approval Workflows */
  putEnvEnvIdApprovalWorkflowsWfId: { method: "PUT", path: "/api/admin/env/{envId}/approval-workflows/{wfId}" },
  /** Replace Admin Env Authorization Model */
  putEnvEnvIdAuthorizationModel: { method: "PUT", path: "/api/admin/env/{envId}/authorization-model" },
  /** Replace Env Branding Template Catalog */
  putEnvEnvIdBrandingTemplateCatalogTemplateKey: { method: "PUT", path: "/api/admin/env/{envId}/branding/template-catalog/{templateKey}" },
  /** Replace Env Branding Widgets */
  putEnvEnvIdBrandingWidgetsWidgetKey: { method: "PUT", path: "/api/admin/env/{envId}/branding/widgets/{widgetKey}" },
  /** Replace Admin Env Breach Notification Config */
  putEnvEnvIdBreachNotificationConfig: { method: "PUT", path: "/api/admin/env/{envId}/breach-notification-config" },
  /** Replace Env Commercial Relationships */
  putEnvEnvIdCommercialRelationshipsOrgId: { method: "PUT", path: "/api/admin/env/{envId}/commercial/relationships/{orgId}" },
  /** Replace Admin Env Connected Application */
  putEnvEnvIdConnectedApplication: { method: "PUT", path: "/api/admin/env/{envId}/connected-application" },
  /** Replace Admin Env Connections */
  putEnvEnvIdConnectionsConnId: { method: "PUT", path: "/api/admin/env/{envId}/connections/{connId}" },
  /** Replace Admin Env Email Templates */
  putEnvEnvIdEmailTemplatesTemplateKey: { method: "PUT", path: "/api/admin/env/{envId}/email-templates/{templateKey}" },
  /** Replace Env Gdpr Privacy Config */
  putEnvEnvIdGdprPrivacyConfig: { method: "PUT", path: "/api/admin/env/{envId}/gdpr/privacy-config" },
  /** Replace Admin Env Groups */
  putEnvEnvIdGroupsGroupId: { method: "PUT", path: "/api/admin/env/{envId}/groups/{groupId}" },
  /** Update impersonation configuration for an organization */
  putEnvEnvIdImpersonationConfig: { method: "PUT", path: "/api/v1/env/{envId}/impersonation/config" },
  /** Replace Integrations Providers Secrets */
  putEnvEnvIdIntegrationsProvidersProviderIdSecrets: { method: "PUT", path: "/api/admin/env/{envId}/integrations/providers/{providerId}/secrets" },
  /** Replace Admin Env Limits */
  putEnvEnvIdLimitsLimitId: { method: "PUT", path: "/api/admin/env/{envId}/limits/{limitId}" },
  /** Replace Admin Env Log Streams */
  putEnvEnvIdLogStreamsStreamId: { method: "PUT", path: "/api/v1/admin/env/{envId}/log-streams/{streamId}" },
  /** Replace V1 Env Log Streams */
  putEnvEnvIdLogStreamsStreamId2: { method: "PUT", path: "/api/v1/env/{envId}/log-streams/{streamId}" },
  /** Replace Env Members Role */
  putEnvEnvIdMembersUserIdRole: { method: "PUT", path: "/api/admin/env/{envId}/members/{userId}/role" },
  /** Replace Env Mfa Policy */
  putEnvEnvIdMfaPolicy: { method: "PUT", path: "/api/admin/env/{envId}/mfa/policy" },
  /** Replace Env Orgs Subscription */
  putEnvEnvIdOrgsOrgIdSubscription: { method: "PUT", path: "/api/admin/env/{envId}/orgs/{orgId}/subscription" },
  /** Replace Admin Env Policies */
  putEnvEnvIdPoliciesPolicyId: { method: "PUT", path: "/api/admin/env/{envId}/policies/{policyId}" },
  /** Replace Admin Env Roles */
  putEnvEnvIdRolesRoleId: { method: "PUT", path: "/api/admin/env/{envId}/roles/{roleId}" },
  /** Replace Env Scim Config */
  putEnvEnvIdScimConfig: { method: "PUT", path: "/api/admin/env/{envId}/scim/config" },
  /** Replace Env Security Config */
  putEnvEnvIdSecurityConfig: { method: "PUT", path: "/api/admin/env/{envId}/security/config" },
  /** Replace Env Security Device Trust */
  putEnvEnvIdSecurityDeviceTrust: { method: "PUT", path: "/api/admin/env/{envId}/security/device-trust" },
  /** Replace Env Security Geo Blocking */
  putEnvEnvIdSecurityGeoBlocking: { method: "PUT", path: "/api/admin/env/{envId}/security/geo-blocking" },
  /** Replace Admin Env Siem Config */
  putEnvEnvIdSiemConfig: { method: "PUT", path: "/api/admin/env/{envId}/siem-config" },
  /** Replace Admin Env Siem Config */
  putEnvEnvIdSiemConfigConfigId: { method: "PUT", path: "/api/admin/env/{envId}/siem-config/{configId}" },
  /** Replace Env Users Metadata */
  putEnvEnvIdUsersUserIdMetadata: { method: "PUT", path: "/api/admin/env/{envId}/users/{userId}/metadata" },
  /** Replace Org Data Isolation Routing */
  putOrgOrgIdDataIsolationRouting: { method: "PUT", path: "/api/v1/admin/org/{orgId}/data-isolation/routing" },
  /** Replace Admin Organizations Org Quota */
  putOrganizationsIdOrgQuota: { method: "PUT", path: "/api/admin/organizations/{id}/org-quota" },
  /** Replace Api Admin Policy Config */
  putPolicyConfig: { method: "PUT", path: "/api/admin/policy-config" },
  /** Replace Admin Products Dependencies */
  putProductsProductKeyDependencies: { method: "PUT", path: "/api/admin/products/{productKey}/dependencies" },
  /** Replace V2 Env Groups */
  putScimV2EnvEnvIdGroupsGroupId: { method: "PUT", path: "/api/scim/v2/env/{envId}/Groups/{groupId}" },
  /** Replace V2 Env Users */
  putScimV2EnvEnvIdUsersUserId: { method: "PUT", path: "/api/scim/v2/env/{envId}/Users/{userId}" },
  /** Register where an organization's data lives */
  registerOrgDataResidency: { method: "POST", path: "/api/admin/env/{envId}/orgs/{orgId}/data-residency" },
  /** Repair credential projection */
  repairEnvEnvIdCredentialsCredentialIdProjection: { method: "POST", path: "/api/admin/env/{envId}/credentials/{credentialId}/projection/repair" },
  /** Send an organization back to the shared database */
  retireOrgDataResidency: { method: "DELETE", path: "/api/admin/env/{envId}/orgs/{orgId}/data-residency" },
  /** Revoke the customer key — irreversible */
  revokeOrgCustomerKey: { method: "DELETE", path: "/api/admin/env/{envId}/orgs/{orgId}/customer-key" },
  /** Revoke a paired device */
  revokePairedDevice: { method: "POST", path: "/api/auth/device/revoke" },
  /** Rename or reparent a company unit */
  updateWorkspaceOperatingUnit: { method: "PATCH", path: "/api/access/v1/workspace/operating-units/{id}" },
  /** Check that the stored wrapped key still opens */
  verifyOrgCustomerKey: { method: "POST", path: "/api/admin/env/{envId}/orgs/{orgId}/customer-key/verify" },
} as const;

/** 851 operaciones. */
export type AccessOperationId = keyof typeof ACCESS_OPERATIONS;
