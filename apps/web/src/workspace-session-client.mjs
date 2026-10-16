/**
 * Node Workspace identity gate only. A Node OIDC host must supply a live bearer
 * per call; this module never stores it and never falls back to Trial or Cloud.
 * Project, Asset and Culling callers must request a fresh gate before use.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TENANT = /^[A-Za-z0-9_-]{1,128}$/;
const ROLES = ['OWNER', 'ADMIN', 'EDITOR', 'VIEWER'];
const own = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
  Reflect.ownKeys(value).length === keys.length &&
  Reflect.ownKeys(value).every(key => typeof key === 'string' && keys.includes(key));
const subject = value => typeof value === 'string' && value.length > 0 && value.length <= 512 &&
  !/[\u0000-\u001f\u007f]/u.test(value);
const abort = signal => {if (signal?.aborted) throw new DOMException('Workspace request cancelled', 'AbortError');};
const invalid = () => {throw Error('WORKSPACE_SESSION_RESPONSE_INVALID');};

export class WorkspaceSessionHTTPError extends Error {
  constructor(status) {super(`WORKSPACE_SESSION_HTTP_${status}`); this.name = 'WorkspaceSessionHTTPError'; this.status = status;}
}

export class WorkspaceSessionClient {
  constructor({baseURL = globalThis.location?.origin, tokenProvider, fetchImpl = globalThis.fetch} = {}) {
    let url;
    try {url = new URL(baseURL);} catch {throw Error('WORKSPACE_SESSION_CONFIG_INVALID');}
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) ||
        url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
        typeof tokenProvider !== 'function' || typeof fetchImpl !== 'function')
      throw Error('WORKSPACE_SESSION_CONFIG_INVALID');
    this.baseURL = url.origin;
    this.tokenProvider = tokenProvider;
    this.fetchImpl = fetchImpl;
    Object.freeze(this);
  }

  /** No cached authority: every call obtains a new bearer and server membership. */
  async getFreshSession({workspaceId, expectedSubject, expectedTenantId, access = 'read', signal} = {}) {
    if (typeof workspaceId !== 'string' || !UUID.test(workspaceId) || !subject(expectedSubject) ||
        typeof expectedTenantId !== 'string' || !TENANT.test(expectedTenantId) ||
        !['read', 'edit'].includes(access)) throw Error('WORKSPACE_SESSION_SCOPE_INVALID');
    abort(signal);
    let token;
    try {token = await this.tokenProvider({signal});} catch (error) {
      if (signal?.aborted || error?.name === 'AbortError') throw new DOMException('Workspace request cancelled', 'AbortError');
      throw Error('WORKSPACE_SESSION_TOKEN_UNAVAILABLE');
    }
    abort(signal);
    if (typeof token !== 'string' || !token || token.length > 8192 || /\s/u.test(token))
      throw Error('WORKSPACE_SESSION_TOKEN_INVALID');
    const url = `${this.baseURL}/v1/workspaces/${workspaceId}/session`;
    let response;
    try {
      response = await this.fetchImpl(url, {method: 'GET', signal, credentials: 'omit', cache: 'no-store',
        redirect: 'error', referrerPolicy: 'no-referrer', headers: {Authorization: `Bearer ${token}`}});
    } catch (error) {
      if (signal?.aborted || error?.name === 'AbortError') throw new DOMException('Workspace request cancelled', 'AbortError');
      throw Error('WORKSPACE_SESSION_REQUEST_FAILED');
    }
    abort(signal);
    if (!response || typeof response.ok !== 'boolean' || !Number.isSafeInteger(response.status)) invalid();
    if (!response.ok) throw new WorkspaceSessionHTTPError(response.status);
    if (response.status !== 200 || response.redirected === true) invalid();
    let body;
    try {body = await response.json();} catch (error) {
      if (signal?.aborted || error?.name === 'AbortError') throw new DOMException('Workspace request cancelled', 'AbortError');
      invalid();
    }
    abort(signal);
    if (!own(body, ['session']) ||
        !own(body.session, ['subject', 'tenantId', 'workspaceId', 'membership']) ||
        !own(body.session.membership, ['userId', 'role', 'joinedAt'])) invalid();
    const session = body.session, member = session.membership;
    if (!subject(session.subject) || typeof session.tenantId !== 'string' || !TENANT.test(session.tenantId) ||
        session.workspaceId !== workspaceId || !subject(member.userId) ||
        member.userId !== session.subject || !ROLES.includes(member.role) ||
        typeof member.joinedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/u.test(member.joinedAt) ||
        !Number.isFinite(Date.parse(member.joinedAt)) || new Date(member.joinedAt).toISOString() !== member.joinedAt)
      invalid();
    if (session.subject !== expectedSubject || session.tenantId !== expectedTenantId)
      throw Error('WORKSPACE_SESSION_IDENTITY_CHANGED');
    if (access === 'edit' && member.role === 'VIEWER') throw Error('WORKSPACE_SESSION_EDIT_FORBIDDEN');
    return Object.freeze({subject: session.subject, tenantId: session.tenantId, workspaceId,
      membership: Object.freeze({userId: member.userId, role: member.role, joinedAt: member.joinedAt})});
  }
}
