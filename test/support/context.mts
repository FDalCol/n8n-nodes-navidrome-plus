import type { IDataObject, INodeProperties } from 'n8n-workflow';
import { Navidrome } from '../../nodes/Navidrome/Navidrome.node';
import { PASSWORD, USERNAME } from './fakeServer';

export type HttpOptions = {
	method?: string;
	url?: string;
	uri?: string;
	qs?: IDataObject;
	body?: unknown;
	headers?: Record<string, string>;
	json?: boolean;
	returnFullResponse?: boolean;
	ignoreHttpStatusErrors?: boolean;
	disableFollowRedirect?: boolean;
	followRedirect?: boolean;
	followAllRedirects?: boolean;
	timeout?: number;
};

export type HttpRequestFn = (options: HttpOptions) => Promise<unknown>;

/**
 * Real HTTP subset of helpers.httpRequest. Like axios it follows redirects unless
 * `disableFollowRedirect` or `followRedirect: false` is set, and it honours `timeout`.
 */
export async function httpRequest(options: HttpOptions): Promise<unknown> {
	const url = new URL(options.url ?? options.uri ?? '');
	for (const [key, value] of Object.entries(options.qs ?? {})) {
		url.searchParams.append(key, String(value));
	}
	const headers: Record<string, string> = { ...(options.headers ?? {}) };
	let body: string | undefined;
	if (options.body !== undefined) {
		body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
		headers['Content-Type'] ??= 'application/json';
	}
	const noRedirect = options.disableFollowRedirect === true || options.followRedirect === false;
	const response = await fetch(url, {
		method: options.method ?? 'GET',
		headers,
		body,
		redirect: noRedirect ? 'manual' : 'follow',
		signal: options.timeout ? AbortSignal.timeout(options.timeout) : undefined,
	});
	const text = await response.text();
	let parsed: unknown = text;
	if (options.json !== false && text) {
		try {
			parsed = JSON.parse(text);
		} catch {
			parsed = text;
		}
	}
	if (!options.ignoreHttpStatusErrors && !response.ok) {
		throw new Error(`Request failed with status code ${response.status}`);
	}
	if (options.returnFullResponse) {
		return {
			body: parsed,
			statusCode: response.status,
			headers: Object.fromEntries(response.headers),
		};
	}
	return parsed;
}

export const NODE = {
	id: 'test-node',
	name: 'Navidrome (Plus)',
	type: 'n8n-nodes-navidrome-plus.navidrome',
	typeVersion: 1,
	position: [0, 0] as [number, number],
	parameters: {},
};

const PROPERTIES: INodeProperties[] = new Navidrome().description.properties;

export interface RunOptions {
	baseUrl: string;
	params: IDataObject | IDataObject[];
	items?: number;
	continueOnFail?: boolean;
	password?: string;
	/** Replaces real HTTP, e.g. to simulate network errors. */
	httpRequest?: HttpRequestFn;
	onRequest?: (options: HttpOptions) => void;
}

/** Missing parameters resolve like in n8n: default of the property whose displayOptions match. */
export function createContext(options: RunOptions) {
	const paramsFor = (i: number): IDataObject =>
		Array.isArray(options.params) ? options.params[i] : options.params;

	const resolve = (name: string, i: number, depth = 0): unknown => {
		const given = paramsFor(i)[name];
		if (given !== undefined) return given;
		if (depth > 5) return undefined;
		const candidates = PROPERTIES.filter((p) => p.name === name);
		for (const property of candidates) {
			const show = property.displayOptions?.show ?? {};
			const visible = Object.entries(show).every(([key, allowed]) =>
				(allowed as unknown[]).includes(resolve(key, i, depth + 1)),
			);
			if (visible) return property.default;
		}
		return undefined;
	};

	return {
		getInputData: () =>
			Array.from({ length: options.items ?? 1 }, (_, i) => ({ json: { index: i } })),
		getNodeParameter(name: string, i: number, fallback?: unknown) {
			const value = resolve(name, i);
			if (value !== undefined) return value;
			if (arguments.length >= 3) return fallback;
			throw new Error(`Could not get parameter "${name}"`);
		},
		getCredentials: async () => ({
			baseUrl: `${options.baseUrl}/`,
			username: USERNAME,
			password: options.password ?? PASSWORD,
		}),
		getNode: () => NODE,
		continueOnFail: () => options.continueOnFail ?? false,
		getExecutionCancelSignal: () => undefined,
		helpers: {
			httpRequest: async (request: HttpOptions) => {
				options.onRequest?.(request);
				return await (options.httpRequest ?? httpRequest)(request);
			},
		},
	};
}

export async function runNode(options: RunOptions) {
	const node = new Navidrome();
	const context = createContext(options);
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const [output] = await node.execute.call(context as any);
	return output;
}

export async function runJson(options: RunOptions): Promise<IDataObject[]> {
	return (await runNode(options)).map((item) => item.json);
}

/** Fake ICredentialTestFunctions backed by real HTTP (helpers.request). */
export async function testCredential(
	baseUrl: string,
	password = PASSWORD,
	onRequest?: (options: HttpOptions) => void,
	request: HttpRequestFn = httpRequest,
) {
	const node = new Navidrome();
	const context = {
		helpers: {
			request: async (options: HttpOptions) => {
				onRequest?.(options);
				return await request({ ...options, json: true });
			},
		},
	};
	return await node.methods.credentialTest.navidromePlusApiTest.call(
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		context as any,
		{
			id: 'cred',
			name: 'Navidrome',
			type: 'navidromePlusApi',
			data: { baseUrl, username: USERNAME, password },
		},
	);
}
