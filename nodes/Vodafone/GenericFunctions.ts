import { createHash, randomInt } from 'crypto';
import type {
  ICredentialDataDecryptedObject,
  ICredentialsDecrypted,
  ICredentialTestFunctions,
  IDataObject,
  IExecuteFunctions,
  IN8nHttpFullResponse,
  INodeCredentialTestResult,
  JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import type {
  OidcTokenResponse,
  VodafoneCableAccount,
  VodafoneCharacteristic,
  VodafoneCredentials,
  VodafoneDocumentData,
  VodafoneExternalIdentifier,
  VodafoneInvoiceList,
  VodafoneOpenIdUserInfo,
  VodafoneSession,
  VodafoneUserAsset,
  VodafoneUserInfo,
} from './interfaces.js';

const ACCEPT = 'application/json, text/plain, */*';
const ACCEPT_LANGUAGE = 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0';
const LOGIN_URL = 'https://www.vodafone.de/mint/rest/v60/session/start';
const LOGIN_REFERER = 'https://www.vodafone.de/meinvodafone/account/login';
const OIDC_AUTHORIZE_URL = 'https://www.vodafone.de/mint/oidc/authorize';
const OIDC_TOKEN_URL = 'https://www.vodafone.de/mint/oidc/token';
const OIDC_CLIENT_ID = 'b0595a44-0726-11ec-9011-9457a55a403c';
const OIDC_REDIRECT_URI = 'https://www.vodafone.de/meinvodafone/services/';
const OIDC_SCOPES =
  'openid profile webseal user-groups user-accounts validate-token update-email-username account';
const OIDC_CODE_CHALLENGE_LENGTH = 43;
const VODAFONE_API_KEY = 'aEIoMCae0A933wBL0bLlS6SwSBfkKwM5';
const USER_INFO_URL =
  'https://api.vodafone.de/meinvodafone/v2/tmf-api/openid/v4/userinfo';

interface VodafoneTokenExchange {
  cookies: Map<string, string>;
  token: OidcTokenResponse;
}

function defaultHeaders(): IDataObject {
  return {
    Accept: ACCEPT,
    'Accept-Language': ACCEPT_LANGUAGE,
    'User-Agent': USER_AGENT,
  };
}

function browserHeaders(): IDataObject {
  return {
    ...defaultHeaders(),
    Origin: 'https://www.vodafone.de',
    Referer: OIDC_REDIRECT_URI,
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
  };
}

function generateCodeVerifier(): string {
  const letters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let verifier = '';

  for (let i = 0; i < OIDC_CODE_CHALLENGE_LENGTH; i++) {
    verifier += letters[randomInt(letters.length)];
  }

  return verifier;
}

function codeChallengeFor(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

function oidcAuthorizationUrl(verifier: string, state?: string): string {
  const url = new URL(OIDC_AUTHORIZE_URL);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', OIDC_CLIENT_ID);
  url.searchParams.set('scope', OIDC_SCOPES);
  url.searchParams.set('redirect_uri', OIDC_REDIRECT_URI);
  url.searchParams.set('code_challenge', codeChallengeFor(verifier));
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('prompt', 'none');

  if (state !== undefined) {
    url.searchParams.set('state', state);
  }

  return url.toString();
}

function headerValue(headers: IDataObject, name: string): unknown {
  const lowerName = name.toLowerCase();

  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) {
      return value;
    }
  }

  return undefined;
}

function parseSetCookieHeaders(
  headers: IDataObject,
): Array<{ name: string; value: string }> {
  const rawSetCookie = headerValue(headers, 'set-cookie');
  const setCookieHeaders = Array.isArray(rawSetCookie)
    ? rawSetCookie
    : typeof rawSetCookie === 'string'
      ? [rawSetCookie]
      : [];

  return setCookieHeaders.flatMap((setCookieHeader) => {
    if (typeof setCookieHeader !== 'string') {
      return [];
    }

    const cookiePair = setCookieHeader.split(';', 1)[0];
    const separatorIndex = cookiePair.indexOf('=');

    if (separatorIndex === -1) {
      return [];
    }

    return [
      {
        name: cookiePair.slice(0, separatorIndex),
        value: cookiePair.slice(separatorIndex + 1),
      },
    ];
  });
}

function mergeCookies(
  cookies: Map<string, string>,
  response: IN8nHttpFullResponse,
): Map<string, string> {
  const mergedCookies = new Map(cookies);

  for (const cookie of parseSetCookieHeaders(response.headers)) {
    mergedCookies.set(cookie.name, cookie.value);
  }

  return mergedCookies;
}

function cookieHeader(cookies: Map<string, string>): string {
  return [...cookies.entries()]
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

function locationHeader(response: IN8nHttpFullResponse): string {
  const location = headerValue(response.headers, 'location');

  if (typeof location === 'string') {
    return location;
  }

  if (Array.isArray(location) && typeof location[0] === 'string') {
    return location[0];
  }

  return '';
}

function responseDetails(response: IN8nHttpFullResponse): string {
  const details: string[] = [];
  const contentType = headerValue(response.headers, 'content-type');

  if (typeof contentType === 'string') {
    details.push(`content-type: ${contentType}`);
  }

  if (typeof response.body === 'string' && response.body.trim()) {
    details.push(`body: ${redactResponseBody(response.body.trim())}`);
  } else if (
    response.body &&
    typeof response.body === 'object' &&
    !Buffer.isBuffer(response.body)
  ) {
    details.push(`body: ${redactResponseBody(JSON.stringify(response.body))}`);
  }

  return details.length ? `; ${details.join('; ')}` : '';
}

function redactResponseBody(body: string): string {
  return body
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, 'Bearer [redacted]')
    .replace(/access_token["']?\s*[:=]\s*["']?[^"',\s}]+/gi, 'access_token=[redacted]')
    .slice(0, 500);
}

function createApiError(
  executeFunctions: IExecuteFunctions,
  message: string,
  itemIndex: number,
  response?: IN8nHttpFullResponse,
): NodeApiError {
  const statusText = response?.statusCode
    ? `${message} (HTTP ${response.statusCode}${response.statusMessage ? ` ${response.statusMessage}` : ''})`
    : message;
  const errorMessage = response
    ? `${statusText}${responseDetails(response)}`
    : statusText;
  const errorResponse: JsonObject = {
    message: errorMessage,
  };

  if (response?.statusCode !== undefined) {
    errorResponse.statusCode = response.statusCode;
  }

  if (response?.statusMessage !== undefined) {
    errorResponse.statusMessage = response.statusMessage;
  }

  if (typeof response?.body === 'string') {
    errorResponse.body = response.body;
  }

  if (
    response?.body &&
    typeof response.body === 'object' &&
    !Buffer.isBuffer(response.body)
  ) {
    errorResponse.body = response.body as JsonObject;
  }

  return new NodeApiError(executeFunctions.getNode(), errorResponse, {
    itemIndex,
    httpCode: response?.statusCode ? String(response.statusCode) : undefined,
    message: errorMessage,
  });
}

async function credentialTestRequest(
  credentialTestFunctions: ICredentialTestFunctions,
  options: Record<string, unknown>,
): Promise<IN8nHttpFullResponse> {
  return (await credentialTestFunctions.helpers.request({
    ...options,
    resolveWithFullResponse: true,
    simple: false,
  })) as IN8nHttpFullResponse;
}

async function requestJson<T>(
  executeFunctions: IExecuteFunctions,
  session: VodafoneSession,
  url: string,
  requestName: string,
  itemIndex: number,
): Promise<T> {
  const response = (await executeFunctions.helpers.httpRequest({
    url,
    method: 'GET',
    headers: {
      ...browserHeaders(),
      'Content-Type': 'application/json',
      Authorization: `${session.token.token_type} ${session.token.access_token}`,
      Cookie: cookieHeader(session.cookies),
      'x-api-key': VODAFONE_API_KEY,
    },
    json: true,
    returnFullResponse: true,
    ignoreHttpStatusErrors: true,
  })) as IN8nHttpFullResponse;

  if (response.statusCode !== 200) {
    throw createApiError(
      executeFunctions,
      `Vodafone API request failed while ${requestName}`,
      itemIndex,
      response,
    );
  }

  return response.body as T;
}

async function getInitialMintCookiesForCredentialTest(
  credentialTestFunctions: ICredentialTestFunctions,
): Promise<Map<string, string>> {
  const verifier = generateCodeVerifier();
  const response = await credentialTestRequest(credentialTestFunctions, {
    uri: oidcAuthorizationUrl(verifier),
    method: 'GET',
    headers: {
      'User-Agent': USER_AGENT,
    },
    followRedirect: false,
  });

  if (response.statusCode !== 302) {
    throw new Error('Could not start Vodafone login session');
  }

  return mergeCookies(new Map(), response);
}

async function getInitialMintCookies(
  executeFunctions: IExecuteFunctions,
  itemIndex: number,
): Promise<Map<string, string>> {
  const verifier = generateCodeVerifier();
  const response = (await executeFunctions.helpers.httpRequest({
    url: oidcAuthorizationUrl(verifier),
    method: 'GET',
    headers: {
      'User-Agent': USER_AGENT,
    },
    disableFollowRedirect: true,
    returnFullResponse: true,
    ignoreHttpStatusErrors: true,
  })) as IN8nHttpFullResponse;

  if (response.statusCode !== 302) {
    throw createApiError(
      executeFunctions,
      'Could not start Vodafone login session',
      itemIndex,
      response,
    );
  }

  return mergeCookies(new Map(), response);
}

async function exchangeCodeForTokenForCredentialTest(
  credentialTestFunctions: ICredentialTestFunctions,
  code: string,
  verifier: string,
  cookies: Map<string, string>,
): Promise<OidcTokenResponse> {
  const url = new URL(OIDC_TOKEN_URL);
  url.searchParams.set('client_id', OIDC_CLIENT_ID);
  url.searchParams.set('grant_type', 'authorization_code');
  url.searchParams.set('code', code);
  url.searchParams.set('code_verifier', verifier);
  url.searchParams.set('redirect_uri', OIDC_REDIRECT_URI);

  const response = await credentialTestRequest(credentialTestFunctions, {
    uri: url.toString(),
    method: 'POST',
    headers: {
      ...browserHeaders(),
      Cookie: cookieHeader(cookies),
    },
    json: true,
  });

  if (response.statusCode !== 200) {
    throw new Error('Could not exchange Vodafone login code for a token');
  }

  const token = response.body as Partial<OidcTokenResponse>;

  if (!token.access_token || !token.token_type) {
    throw new Error('Vodafone login response did not include an access token');
  }

  return token as OidcTokenResponse;
}

async function exchangeCodeForToken(
  executeFunctions: IExecuteFunctions,
  code: string,
  verifier: string,
  cookies: Map<string, string>,
  itemIndex: number,
): Promise<VodafoneTokenExchange> {
  const url = new URL(OIDC_TOKEN_URL);
  url.searchParams.set('client_id', OIDC_CLIENT_ID);
  url.searchParams.set('grant_type', 'authorization_code');
  url.searchParams.set('code', code);
  url.searchParams.set('code_verifier', verifier);
  url.searchParams.set('redirect_uri', OIDC_REDIRECT_URI);

  const response = (await executeFunctions.helpers.httpRequest({
    url: url.toString(),
    method: 'POST',
    headers: {
      ...browserHeaders(),
      Cookie: cookieHeader(cookies),
    },
    json: true,
    returnFullResponse: true,
    ignoreHttpStatusErrors: true,
  })) as IN8nHttpFullResponse;

  if (response.statusCode !== 200) {
    throw createApiError(
      executeFunctions,
      'Could not exchange Vodafone login code for a token',
      itemIndex,
      response,
    );
  }

  const token = response.body as Partial<OidcTokenResponse>;

  if (!token.access_token || !token.token_type) {
    throw new NodeOperationError(
      executeFunctions.getNode(),
      'Vodafone login response did not include an access token',
      {
        itemIndex,
      },
    );
  }

  return {
    cookies: mergeCookies(cookies, response),
    token: token as OidcTokenResponse,
  };
}

export async function testVodafoneCredentials(
  this: ICredentialTestFunctions,
  credential: ICredentialsDecrypted<ICredentialDataDecryptedObject>,
): Promise<INodeCredentialTestResult> {
  try {
    const credentials = credential.data as unknown as VodafoneCredentials;
    let cookies = await getInitialMintCookiesForCredentialTest(this);

    const loginResponse = await credentialTestRequest(this, {
      uri: LOGIN_URL,
      method: 'POST',
      headers: {
        ...defaultHeaders(),
        'Content-Type': 'application/json',
        Referer: LOGIN_REFERER,
        Cookie: cookieHeader(cookies),
      },
      body: {
        authnIdentifier: credentials.username,
        context: '',
        conversation: '',
        credential: credentials.password,
        targetURL: '',
      },
      json: true,
    });

    if (loginResponse.statusCode !== 200) {
      throw new Error('Vodafone login failed');
    }

    cookies = mergeCookies(cookies, loginResponse);

    const verifier = generateCodeVerifier();
    const authorizeResponse = await credentialTestRequest(this, {
      uri: oidcAuthorizationUrl(verifier, ''),
      method: 'GET',
      headers: {
        ...defaultHeaders(),
        Cookie: cookieHeader(cookies),
      },
      followRedirect: false,
    });

    if (authorizeResponse.statusCode !== 302) {
      throw new Error('Vodafone login did not return an authorization code');
    }

    const location = locationHeader(authorizeResponse);
    const code = location
      ? new URL(location, OIDC_REDIRECT_URI).searchParams.get('code')
      : '';

    if (!code) {
      throw new Error(
        'Vodafone login response did not include an authorization code',
      );
    }

    await exchangeCodeForTokenForCredentialTest(this, code, verifier, cookies);

    return {
      status: 'OK',
      message: 'Connection successful',
    };
  } catch (error) {
    return {
      status: 'Error',
      message:
        error instanceof Error
          ? error.message
          : 'Vodafone credential test failed',
    };
  }
}

export async function login(
  executeFunctions: IExecuteFunctions,
  credentials: VodafoneCredentials,
  itemIndex: number,
): Promise<VodafoneSession> {
  let cookies = await getInitialMintCookies(executeFunctions, itemIndex);

  const loginResponse = (await executeFunctions.helpers.httpRequest({
    url: LOGIN_URL,
    method: 'POST',
    headers: {
      ...defaultHeaders(),
      'Content-Type': 'application/json',
      Referer: LOGIN_REFERER,
      Cookie: cookieHeader(cookies),
    },
    body: {
      authnIdentifier: credentials.username,
      context: '',
      conversation: '',
      credential: credentials.password,
      targetURL: '',
    },
    json: true,
    returnFullResponse: true,
    ignoreHttpStatusErrors: true,
  })) as IN8nHttpFullResponse;

  if (loginResponse.statusCode !== 200) {
    throw createApiError(
      executeFunctions,
      'Vodafone login failed',
      itemIndex,
      loginResponse,
    );
  }

  cookies = mergeCookies(cookies, loginResponse);

  const verifier = generateCodeVerifier();
  const authorizeResponse = (await executeFunctions.helpers.httpRequest({
    url: oidcAuthorizationUrl(verifier, ''),
    method: 'GET',
    headers: {
      ...defaultHeaders(),
      Cookie: cookieHeader(cookies),
    },
    disableFollowRedirect: true,
    returnFullResponse: true,
    ignoreHttpStatusErrors: true,
  })) as IN8nHttpFullResponse;

  if (authorizeResponse.statusCode !== 302) {
    throw createApiError(
      executeFunctions,
      'Vodafone login did not return an authorization code',
      itemIndex,
      authorizeResponse,
    );
  }

  cookies = mergeCookies(cookies, authorizeResponse);

  const location = locationHeader(authorizeResponse);

  if (!location) {
    throw new NodeOperationError(
      executeFunctions.getNode(),
      'Vodafone login response did not include a redirect location',
      {
        itemIndex,
      },
    );
  }

  const code = new URL(location, OIDC_REDIRECT_URI).searchParams.get('code');

  if (!code) {
    throw new NodeOperationError(
      executeFunctions.getNode(),
      'Vodafone login response did not include an authorization code',
      {
        itemIndex,
      },
    );
  }

  const tokenExchange = await exchangeCodeForToken(
    executeFunctions,
    code,
    verifier,
    cookies,
    itemIndex,
  );

  return {
    cookies: tokenExchange.cookies,
    token: tokenExchange.token,
  };
}

export async function getUserInfo(
  executeFunctions: IExecuteFunctions,
  session: VodafoneSession,
  itemIndex: number,
): Promise<VodafoneUserInfo> {
  const userInfo = await requestJson<VodafoneOpenIdUserInfo[]>(
    executeFunctions,
    session,
    USER_INFO_URL,
    'loading user info',
    itemIndex,
  );

  return {
    userAccountVBO: {
      cable: userInfo.flatMap((user) =>
        (user.userAssets ?? []).flatMap(toCableAccount),
      ),
    },
  };
}

export async function getInvoiceList(
  executeFunctions: IExecuteFunctions,
  session: VodafoneSession,
  contractId: string,
  itemIndex: number,
): Promise<VodafoneInvoiceList> {
  const url = `https://api.vodafone.de/meinvodafone/v2/customer/urn:vf-de:cable:can:${contractId}/invoice`;

  return await requestJson<VodafoneInvoiceList>(
    executeFunctions,
    session,
    url,
    `loading invoices for contract ${contractId}`,
    itemIndex,
  );
}

export async function getInvoiceDocument(
  executeFunctions: IExecuteFunctions,
  session: VodafoneSession,
  customerId: string,
  documentId: string,
  itemIndex: number,
): Promise<VodafoneDocumentData> {
  const url = `https://api.vodafone.de/meinvodafone/v2/customer/${customerId}/invoiceDocument/${documentId}`;

  return await requestJson<VodafoneDocumentData>(
    executeFunctions,
    session,
    url,
    `downloading invoice document ${documentId}`,
    itemIndex,
  );
}

function toCableAccount(asset: VodafoneUserAsset): VodafoneCableAccount[] {
  if (!isCableAsset(asset)) {
    return [];
  }

  const customerNumber =
    findExternalIdentifier(asset.externalIdentifier, 'customerNumber') ??
    findExternalIdentifier(
      asset.relatedAsset?.flatMap(
        (relatedAsset) => relatedAsset.externalIdentifier ?? [],
      ),
      'accountNumber',
    ) ??
    findCustomerNumberInUrn(asset.id);

  if (!customerNumber) {
    return [];
  }

  const relatedBillingAccount = asset.relatedAsset?.find(
    (relatedAsset) => relatedAsset.entityType === 'billingAccount',
  );
  const characteristics = [
    ...(asset.characteristic ?? []),
    ...(relatedBillingAccount?.characteristic ?? []),
  ];

  return [
    {
      id: customerNumber,
      name: asset.name,
      isActiveContract: asset.status === 'activated',
      isDefaultContract:
        characteristicValue(characteristics, 'isDefault') === 'true',
      hasCableMail:
        characteristicValue(characteristics, 'hasCableMail') === 'true',
      subscription: [
        {
          id: findExternalIdentifier(
            asset.externalIdentifier,
            'subscriptionId',
          ),
          type: characteristicValue(asset.characteristic, 'subType'),
          displayName: asset.name,
        },
      ],
    },
  ];
}

function isCableAsset(asset: VodafoneUserAsset): boolean {
  return (
    asset.status === 'activated' &&
    (asset.assetType === 'Broadband' ||
      asset.id?.includes(':cable:') === true) &&
    (asset.characteristic?.some(
      (characteristic) =>
        characteristic.name === 'stack' && characteristic.value === 'Cable',
    ) === true ||
      asset.id?.includes(':cable:') === true)
  );
}

function findExternalIdentifier(
  identifiers: VodafoneExternalIdentifier[] | undefined,
  type: string,
): string | undefined {
  return identifiers?.find((identifier) => identifier.type === type)?.id;
}

function characteristicValue(
  characteristics: VodafoneCharacteristic[] | undefined,
  name: string,
): string | undefined {
  return characteristics?.find((characteristic) => characteristic.name === name)
    ?.value;
}

function findCustomerNumberInUrn(id: string | undefined): string | undefined {
  return id?.match(/:can:(\d+)$/)?.[1];
}

export function sanitizeFileName(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
}
