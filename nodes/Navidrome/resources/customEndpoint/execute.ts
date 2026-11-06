import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import type { SubsonicParams } from '../../transport/subsonic';
import {
	ENDPOINT_NAME_PATTERN,
	getNavidromeCredentials,
	sendSubsonicRequest,
} from '../../transport/subsonic';
import { stripResponseMetadata, str } from '../../shared/utils';

/** Set by the node's own authentication. */
export const IGNORED_PARAMETERS = ['u', 'p', 't', 's'];

export const PARAMETER_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;

/** Binary responses and shares are out of scope. */
export const BLOCKED_ENDPOINTS = [
	'stream',
	'download',
	'getCoverArt',
	'getAvatar',
	'getTranscodeStream',
	'hls',
	'getShares',
	'createShare',
	'updateShare',
	'deleteShare',
];

export type EndpointResolution = { ok: true; endpoint: string } | { ok: false; message: string };

const USAGE =
	'Use a name such as "getAlbumList2", "getAlbumList2.view", "/rest/getAlbumList2" or a full URL on the Base URL of the credential.';

function endpointFromRestPath(rest: string, raw: string): EndpointResolution {
	const endpoint = rest.replace(/\.view$/i, '');
	if (!ENDPOINT_NAME_PATTERN.test(endpoint)) {
		return { ok: false, message: `Invalid Subsonic endpoint "${raw}". ${USAGE}` };
	}
	return { ok: true, endpoint };
}

/**
 * Accepts "name", "name.view", "/rest/name" or a full URL. A full URL must share the Base URL
 * origin and point to `<base path>/rest/<name>`, so authentication never leaves that server.
 */
export function resolveEndpoint(input: string, baseUrl: string): EndpointResolution {
	const raw = input.trim();
	if (raw === '') return { ok: false, message: `The endpoint is empty. ${USAGE}` };

	const isAbsolute = /^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('//');
	if (!isAbsolute) {
		if (/[?#]/.test(raw)) {
			return {
				ok: false,
				message: `The endpoint "${raw}" contains a query string: use "Query Parameters" instead.`,
			};
		}
		const rest = raw.replace(/^\/+/, '').replace(/^rest\//i, '');
		return endpointFromRestPath(rest, raw);
	}

	let url: URL;
	let base: URL;
	try {
		url = new URL(raw);
		base = new URL(baseUrl);
	} catch {
		return { ok: false, message: `Invalid endpoint URL "${raw}". ${USAGE}` };
	}
	if (url.origin !== base.origin) {
		return {
			ok: false,
			message: `The endpoint URL must use the same protocol, host and port as the Base URL of the credential (${base.origin}). Authentication is never sent to another server.`,
		};
	}
	if (url.username || url.password) {
		return { ok: false, message: 'The endpoint URL must not contain a username or password.' };
	}
	if (url.search || url.hash) {
		return {
			ok: false,
			message:
				'The endpoint URL must not contain a query string or fragment: use "Query Parameters" instead.',
		};
	}
	// new URL() has already resolved "." and ".." segments, percent-encoded ones included.
	const restPrefix = `${base.pathname.replace(/\/+$/, '')}/rest/`;
	if (!url.pathname.startsWith(restPrefix)) {
		return {
			ok: false,
			message: `The endpoint URL must point to ${base.origin}${restPrefix}<endpoint>.`,
		};
	}
	return endpointFromRestPath(url.pathname.slice(restPrefix.length), raw);
}

/** A Map keeps names such as "__proto__" away from object prototypes. */
export function buildCustomParams(
	entries: IDataObject[],
): { ok: true; params: SubsonicParams } | { ok: false; message: string } {
	const grouped = new Map<string, string[]>();
	for (const entry of entries) {
		const name = str(entry.name);
		if (name === '') continue;
		if (!PARAMETER_NAME_PATTERN.test(name)) {
			return {
				ok: false,
				message: `Invalid query parameter name "${name}": use letters, digits and underscores only.`,
			};
		}
		if (IGNORED_PARAMETERS.includes(name.toLowerCase())) continue;
		const values = grouped.get(name) ?? [];
		values.push(String(entry.value ?? ''));
		grouped.set(name, values);
	}
	const params: SubsonicParams = Object.create(null) as SubsonicParams;
	for (const [name, values] of grouped) {
		params[name] = values.length === 1 ? values[0] : values;
	}
	return { ok: true, params };
}

export async function executeCustomEndpoint(
	this: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<IDataObject[]> {
	if (operation !== 'call') {
		throw new NodeOperationError(
			this.getNode(),
			`Unsupported Custom Endpoint operation "${operation}"`,
			{ itemIndex },
		);
	}

	const credentials = await getNavidromeCredentials.call(this, itemIndex);
	const resolved = resolveEndpoint(
		str(this.getNodeParameter('endpoint', itemIndex)),
		credentials.baseUrl,
	);
	if (!resolved.ok) {
		throw new NodeOperationError(this.getNode(), resolved.message, { itemIndex });
	}
	const endpoint = resolved.endpoint;
	if (BLOCKED_ENDPOINTS.some((blocked) => blocked.toLowerCase() === endpoint.toLowerCase())) {
		throw new NodeOperationError(
			this.getNode(),
			`The endpoint "${endpoint}" is not supported by this node (binary responses and shares are excluded)`,
			{ itemIndex },
		);
	}

	const collection = this.getNodeParameter('queryParameters', itemIndex, {}) as IDataObject;
	const built = buildCustomParams((collection.parameter as IDataObject[] | undefined) ?? []);
	if (!built.ok) {
		throw new NodeOperationError(this.getNode(), built.message, { itemIndex });
	}

	const response = await sendSubsonicRequest.call(
		this,
		credentials,
		endpoint,
		built.params,
		itemIndex,
	);
	return [stripResponseMetadata(response)];
}
