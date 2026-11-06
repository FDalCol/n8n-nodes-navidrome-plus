import { createHash, randomBytes } from 'crypto';
import type { IDataObject, IExecuteFunctions, IHttpRequestOptions, JsonObject } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import {
	describeRedirect,
	headerValue,
	isRedirect,
	redactSecrets,
	REQUEST_TIMEOUT_MS,
	validateBaseUrl,
} from './security';

export const SUBSONIC_API_VERSION = '1.16.1';
export const SUBSONIC_CLIENT_NAME = 'n8n';
export const CREDENTIAL_NAME = 'navidromePlusApi';

export interface NavidromeCredentials {
	baseUrl: string;
	username: string;
	password: string;
}

export type SubsonicParamValue =
	| string
	| number
	| boolean
	| Array<string | number>
	| undefined
	| null;

export type SubsonicParams = Record<string, SubsonicParamValue>;

const SUBSONIC_ERROR_HINTS: Record<number, string> = {
	10: 'A required parameter is missing.',
	20: 'The client is too old for this server.',
	30: 'The server is too old for this client.',
	40: 'Wrong username or password; check the Navidrome credential.',
	41: 'Token authentication is not supported for this user (e.g. LDAP/external auth).',
	42: 'The authentication mechanism is not supported by the server.',
	43: 'Multiple conflicting authentication mechanisms were provided.',
	44: 'Invalid API key.',
	50: 'The user is not authorized for this operation: it requires an administrator account.',
	70: 'The requested item was not found.',
};

export function normalizeBaseUrl(url: unknown): string {
	return String(url ?? '')
		.trim()
		.replace(/\/+$/, '');
}

export function toNavidromeCredentials(raw: IDataObject): NavidromeCredentials {
	return {
		baseUrl: normalizeBaseUrl(raw.baseUrl),
		username: String(raw.username ?? ''),
		password: String(raw.password ?? ''),
	};
}

/** New random salt on every call; t = md5(password + salt). The password is never sent. */
export function buildAuthParams(username: string, password: string): Record<string, string> {
	const salt = randomBytes(8).toString('hex');
	const token = createHash('md5')
		.update(password + salt)
		.digest('hex');
	return {
		u: username,
		t: token,
		s: salt,
		v: SUBSONIC_API_VERSION,
		c: SUBSONIC_CLIENT_NAME,
		f: 'json',
	};
}

/**
 * Arrays repeat the key (id=1&id=2). undefined/null are omitted; "" is sent so that a value
 * (e.g. a playlist comment) can be cleared.
 */
export function buildQueryString(params: SubsonicParams): string {
	const search = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (value === undefined || value === null) continue;
		if (Array.isArray(value)) {
			for (const entry of value) {
				if (entry === undefined || entry === null || entry === '') continue;
				search.append(key, String(entry));
			}
		} else {
			search.append(key, String(value));
		}
	}
	return search.toString();
}

export const ENDPOINT_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9]*$/;

export interface SubsonicRequest {
	url: string;
	/** Values to redact from messages. */
	secrets: string[];
}

/** Authentication parameters override user-supplied ones with the same name. */
export function buildSubsonicRequest(
	credentials: NavidromeCredentials,
	endpoint: string,
	params: SubsonicParams = {},
): SubsonicRequest {
	if (!ENDPOINT_NAME_PATTERN.test(endpoint)) {
		throw new Error(`Invalid Subsonic endpoint name "${endpoint}"`);
	}
	const auth = buildAuthParams(credentials.username, credentials.password);
	const query = buildQueryString({ ...params, ...auth });
	return {
		url: `${credentials.baseUrl}/rest/${endpoint}?${query}`,
		secrets: [auth.t, auth.s, credentials.password],
	};
}

export function buildSubsonicUrl(
	credentials: NavidromeCredentials,
	endpoint: string,
	params: SubsonicParams = {},
): string {
	return buildSubsonicRequest(credentials, endpoint, params).url;
}

export type ParsedSubsonicResponse =
	| { ok: true; response: IDataObject }
	| { ok: false; code: number | undefined; message: string };

export function parseSubsonicBody(body: unknown, statusCode?: number): ParsedSubsonicResponse {
	let data: unknown = body;
	if (typeof data === 'string') {
		try {
			data = JSON.parse(data);
		} catch {
			data = undefined;
		}
	}
	const response =
		data && typeof data === 'object'
			? ((data as IDataObject)['subsonic-response'] as IDataObject | undefined)
			: undefined;

	if (!response || typeof response !== 'object') {
		const status = statusCode !== undefined ? ` (HTTP ${statusCode})` : '';
		return {
			ok: false,
			code: undefined,
			message: `Unexpected response from Navidrome${status}: no "subsonic-response" found. Check the Base URL of the credential.`,
		};
	}

	if (response.status === 'failed') {
		const error = (response.error ?? {}) as IDataObject;
		const code = typeof error.code === 'number' ? error.code : Number(error.code ?? NaN);
		const validCode = Number.isFinite(code) ? code : undefined;
		const serverMessage = String(error.message ?? 'Unknown error');
		const hint = validCode !== undefined ? SUBSONIC_ERROR_HINTS[validCode] : undefined;
		return {
			ok: false,
			code: validCode,
			message: `Navidrome error ${validCode ?? '?'}: ${serverMessage}` + (hint ? ` (${hint})` : ''),
		};
	}

	if (response.status !== 'ok') {
		return {
			ok: false,
			code: undefined,
			message: `Unexpected Subsonic status "${String(response.status)}" returned by Navidrome.`,
		};
	}

	return { ok: true, response };
}

export async function getNavidromeCredentials(
	this: IExecuteFunctions,
	itemIndex: number,
): Promise<NavidromeCredentials> {
	const raw = await this.getCredentials(CREDENTIAL_NAME, itemIndex);
	const credentials = toNavidromeCredentials(raw as IDataObject);
	const invalid = validateBaseUrl(credentials.baseUrl);
	if (invalid) throw new NodeOperationError(this.getNode(), invalid, { itemIndex });
	return credentials;
}

export async function sendSubsonicRequest(
	this: IExecuteFunctions,
	credentials: NavidromeCredentials,
	endpoint: string,
	params: SubsonicParams,
	itemIndex: number,
): Promise<IDataObject> {
	if (!ENDPOINT_NAME_PATTERN.test(endpoint)) {
		throw new NodeOperationError(this.getNode(), `Invalid Subsonic endpoint name "${endpoint}"`, {
			itemIndex,
		});
	}
	const request = buildSubsonicRequest(credentials, endpoint, params);
	const options: IHttpRequestOptions = {
		method: 'GET',
		url: request.url,
		json: true,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
		// The URL carries the token and salt: never follow a redirect.
		disableFollowRedirect: true,
		timeout: REQUEST_TIMEOUT_MS,
	};

	let raw: IDataObject;
	try {
		raw = (await this.helpers.httpRequest(options)) as IDataObject;
	} catch (error) {
		// The original error is dropped: its request URL contains the token and salt.
		throw new NodeOperationError(
			this.getNode(),
			`Could not reach the Navidrome server at ${credentials.baseUrl}: ${redactSecrets(
				(error as JsonObject).message ?? String(error),
				request.secrets,
			)}`,
			{ itemIndex },
		);
	}

	const statusCode = raw?.statusCode as number | undefined;
	if (isRedirect(statusCode)) {
		throw new NodeOperationError(
			this.getNode(),
			describeRedirect(statusCode as number, headerValue(raw.headers, 'location')),
			{ itemIndex },
		);
	}

	const parsed = parseSubsonicBody(raw?.body, statusCode);
	if (!parsed.ok) {
		throw new NodeOperationError(this.getNode(), redactSecrets(parsed.message, request.secrets), {
			itemIndex,
			description: `Endpoint: ${endpoint}`,
		});
	}
	return parsed.response;
}

export async function subsonicRequest(
	this: IExecuteFunctions,
	endpoint: string,
	params: SubsonicParams,
	itemIndex: number,
): Promise<IDataObject> {
	const credentials = await getNavidromeCredentials.call(this, itemIndex);
	return await sendSubsonicRequest.call(this, credentials, endpoint, params, itemIndex);
}
