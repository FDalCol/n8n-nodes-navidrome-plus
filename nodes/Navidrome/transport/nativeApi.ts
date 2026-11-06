import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	JsonObject,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import type { NavidromeCredentials } from './subsonic';
import {
	describeRedirect,
	headerValue,
	isRedirect,
	redactSecrets,
	REQUEST_TIMEOUT_MS,
	safeServerText,
} from './security';

/** consts.UIAuthorizationHeader in Navidrome. */
export const NATIVE_AUTH_HEADER = 'x-nd-authorization';

export const ADMIN_REQUIRED_MESSAGE =
	'Navidrome denied access to the native API: an administrator account is required to manage users.';

export interface NativeSession {
	baseUrl: string;
	token: string;
}

interface FullResponse {
	body: unknown;
	statusCode: number;
	headers?: IDataObject;
}

function parseBody(body: unknown): unknown {
	if (typeof body !== 'string') return body;
	if (body.trim() === '') return undefined;
	try {
		return JSON.parse(body);
	} catch {
		return body;
	}
}

/** Navidrome REST errors are `{error}` or `{errors: {field: code}}`. */
export function describeNativeError(
	body: unknown,
	secrets: Array<string | undefined> = [],
): string {
	const data = parseBody(body);
	let text = 'no details returned';
	if (data && typeof data === 'object') {
		const obj = data as IDataObject;
		if (obj.errors && typeof obj.errors === 'object') {
			text = Object.entries(obj.errors as IDataObject)
				.map(([field, code]) => `${field}: ${String(code)}`)
				.join(', ');
		} else if (obj.error) {
			text = String(obj.error);
		} else if (obj.message) {
			text = String(obj.message);
		}
	} else if (typeof data === 'string' && data.trim() !== '') {
		text = data;
	}
	return safeServerText(text, secrets);
}

async function send(
	this: IExecuteFunctions,
	options: IHttpRequestOptions,
	baseUrl: string,
	secrets: Array<string | undefined>,
	itemIndex: number,
): Promise<FullResponse> {
	let response: FullResponse;
	try {
		response = (await this.helpers.httpRequest({
			...options,
			json: true,
			returnFullResponse: true,
			ignoreHttpStatusErrors: true,
			// A redirect could carry the login body or x-nd-authorization to another host.
			disableFollowRedirect: true,
			timeout: REQUEST_TIMEOUT_MS,
		})) as FullResponse;
	} catch (error) {
		// The original error is dropped: its options contain the password or the JWT.
		throw new NodeOperationError(
			this.getNode(),
			`Could not reach the Navidrome server at ${baseUrl}: ${redactSecrets(
				(error as JsonObject).message ?? String(error),
				secrets,
			)}`,
			{ itemIndex },
		);
	}
	if (isRedirect(response.statusCode)) {
		throw new NodeOperationError(
			this.getNode(),
			describeRedirect(response.statusCode, headerValue(response.headers, 'location')),
			{ itemIndex },
		);
	}
	return { ...response, body: parseBody(response.body) };
}

/** Credentials go in the JSON body only, never in the URL. */
export async function nativeLogin(
	this: IExecuteFunctions,
	credentials: NavidromeCredentials,
	itemIndex: number,
): Promise<NativeSession> {
	const response = await send.call(
		this,
		{
			method: 'POST',
			url: `${credentials.baseUrl}/auth/login`,
			body: { username: credentials.username, password: credentials.password },
			headers: { 'Content-Type': 'application/json' },
		},
		credentials.baseUrl,
		[credentials.password],
		itemIndex,
	);

	if (response.statusCode === 401 || response.statusCode === 403) {
		throw new NodeOperationError(
			this.getNode(),
			'Navidrome native API login failed: invalid username or password.',
			{ itemIndex },
		);
	}
	if (response.statusCode < 200 || response.statusCode >= 300) {
		throw new NodeOperationError(
			this.getNode(),
			`Navidrome native API login failed (HTTP ${response.statusCode}): ${describeNativeError(
				response.body,
				[credentials.password],
			)}`,
			{ itemIndex },
		);
	}

	const token = (response.body as IDataObject | undefined)?.token;
	if (typeof token !== 'string' || token === '') {
		throw new NodeOperationError(
			this.getNode(),
			'Navidrome native API login did not return a token. Check the Base URL of the credential.',
			{ itemIndex },
		);
	}
	return { baseUrl: credentials.baseUrl, token };
}

/** `path` is relative to /api. */
export async function nativeApiRequest(
	this: IExecuteFunctions,
	session: NativeSession,
	method: IHttpRequestMethods,
	path: string,
	itemIndex: number,
	options: { body?: IDataObject; qs?: IDataObject; secrets?: string[] } = {},
): Promise<{ body: unknown; headers: IDataObject }> {
	const request: IHttpRequestOptions = {
		method,
		url: `${session.baseUrl}/api${path}`,
		headers: { [NATIVE_AUTH_HEADER]: `Bearer ${session.token}` },
	};
	if (options.qs) request.qs = options.qs;
	if (options.body) {
		request.body = options.body;
		request.headers = { ...request.headers, 'Content-Type': 'application/json' };
	}

	const secrets = [session.token, ...(options.secrets ?? [])];
	const response = await send.call(this, request, session.baseUrl, secrets, itemIndex);
	const status = response.statusCode;

	if (status === 401 || status === 403) {
		throw new NodeOperationError(this.getNode(), ADMIN_REQUIRED_MESSAGE, {
			itemIndex,
			description: `HTTP ${status} on ${method} /api${path}. Use the credential of a Navidrome administrator.`,
		});
	}
	if (status === 404) {
		throw new NodeOperationError(
			this.getNode(),
			`Navidrome resource not found (HTTP 404) on ${method} /api${path}.`,
			{ itemIndex },
		);
	}
	if (status < 200 || status >= 300) {
		throw new NodeOperationError(
			this.getNode(),
			`Navidrome native API error (HTTP ${status}) on ${method} /api${path}: ${describeNativeError(
				response.body,
				secrets,
			)}`,
			{ itemIndex },
		);
	}
	return { body: response.body, headers: response.headers ?? {} };
}
