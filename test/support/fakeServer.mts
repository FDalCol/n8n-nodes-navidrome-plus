import { createHash } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export const USERNAME = 'alice';
export const PASSWORD = 'S3cret-P4ss!';
export const JWT = 'jwt-test-token';

type Params = Record<string, string[]>;
type Payload = Record<string, unknown>;

/** A handler returns the payload merged into `subsonic-response`, or a failure. */
export type SubsonicHandler = (
	params: Params,
	server: FakeNavidrome,
) => Payload | { failed: [number, string] };

export interface SubsonicCall {
	endpoint: string;
	params: Params;
	path: string;
}

export interface NativeCall {
	method: string;
	path: string;
	query: Params;
	headers: IncomingMessage['headers'];
	body: unknown;
}

export interface NativeUser {
	id: string;
	userName: string;
	name: string;
	email?: string;
	isAdmin?: boolean;
	lastLoginAt?: string | null;
	[key: string]: unknown;
}

function failedBody(code: number, message: string) {
	return {
		'subsonic-response': {
			status: 'failed',
			version: '1.16.1',
			type: 'navidrome',
			serverVersion: 'fake',
			openSubsonic: true,
			error: { code, message },
		},
	};
}

function okBody(payload: Payload) {
	return {
		'subsonic-response': {
			status: 'ok',
			version: '1.16.1',
			type: 'navidrome',
			serverVersion: 'fake',
			openSubsonic: true,
			...payload,
		},
	};
}

function toParams(search: URLSearchParams): Params {
	const params: Params = {};
	for (const [key, value] of search) (params[key] ??= []).push(value);
	return params;
}

/**
 * Minimal Navidrome look-alike:
 * - /rest/<endpoint>[.view]: verifies u + t = md5(password + s), v/c/f, and rejects `p`.
 * - POST /auth/login: JSON body credentials, returns a JWT.
 * - /api/user[/id]: requires `x-nd-authorization: Bearer <JWT>`; can be forced to 403.
 */
export class FakeNavidrome {
	readonly subsonicCalls: SubsonicCall[] = [];
	readonly nativeCalls: NativeCall[] = [];
	/** Protocol violations detected by the server (must stay empty). */
	readonly violations: string[] = [];
	readonly handlers: Record<string, SubsonicHandler> = { ping: () => ({}) };
	readonly users = new Map<string, NativeUser>();
	logins = 0;
	denyNative = false;
	private server?: Server;
	baseUrl = '';

	async start(): Promise<this> {
		this.server = createServer((req, res) => {
			void this.handle(req, res);
		});
		await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));
		const { port } = this.server.address() as AddressInfo;
		this.baseUrl = `http://127.0.0.1:${port}`;
		return this;
	}

	async stop(): Promise<void> {
		await new Promise<void>((resolve) => this.server?.close(() => resolve()));
	}

	calls(endpoint: string): SubsonicCall[] {
		return this.subsonicCalls.filter((call) => call.endpoint === endpoint);
	}

	private send(res: ServerResponse, status: number, body: unknown) {
		res.writeHead(status, { 'Content-Type': 'application/json' });
		res.end(body === undefined ? '' : JSON.stringify(body));
	}

	private async readBody(req: IncomingMessage): Promise<unknown> {
		const chunks: Buffer[] = [];
		for await (const chunk of req) chunks.push(chunk as Buffer);
		const text = Buffer.concat(chunks).toString('utf8');
		if (!text) return undefined;
		try {
			return JSON.parse(text);
		} catch {
			return text;
		}
	}

	/** Redirects every request to this origin, keeping path and query. */
	redirect?: { status: number; origin: string };
	/** Adds password-like fields to native user records. */
	echoSecrets = false;
	/** Every request received, in order. */
	readonly allRequests: Array<{
		method: string;
		url: string;
		headers: IncomingMessage['headers'];
	}> = [];

	private async handle(req: IncomingMessage, res: ServerResponse) {
		this.allRequests.push({ method: req.method ?? '', url: req.url ?? '', headers: req.headers });
		if (this.redirect) {
			res.writeHead(this.redirect.status, { Location: `${this.redirect.origin}${req.url ?? '/'}` });
			return res.end();
		}
		const url = new URL(req.url ?? '/', 'http://localhost');
		if (url.pathname.startsWith('/rest/')) return this.handleSubsonic(url, res);
		if (url.pathname === '/auth/login') return this.handleLogin(req, url, res);
		if (url.pathname.startsWith('/api/')) return this.handleNative(req, url, res);
		this.send(res, 404, { error: 'not found' });
	}

	private handleSubsonic(url: URL, res: ServerResponse) {
		const params = toParams(url.searchParams);
		const endpoint = url.pathname.replace(/^\/rest\//, '').replace(/\.view$/, '');
		this.subsonicCalls.push({ endpoint, params, path: url.pathname });

		if (params.p) {
			this.violations.push(`${endpoint}: request contains the "p" (password) parameter`);
			return this.send(
				res,
				200,
				failedBody(42, 'Password authentication is rejected by this server'),
			);
		}
		for (const [key, expected] of [
			['v', '1.16.1'],
			['c', 'n8n'],
			['f', 'json'],
		]) {
			if (params[key]?.length !== 1 || params[key][0] !== expected) {
				this.violations.push(`${endpoint}: bad "${key}" parameter ${JSON.stringify(params[key])}`);
			}
		}
		const salt = params.s?.[0];
		const token = params.t?.[0];
		if (params.s?.length !== 1 || params.t?.length !== 1 || !salt || !/^[0-9a-f]{16}$/.test(salt)) {
			this.violations.push(`${endpoint}: missing or malformed token/salt`);
			return this.send(res, 200, failedBody(10, 'Missing token or salt'));
		}
		const expectedToken = createHash('md5')
			.update(PASSWORD + salt)
			.digest('hex');
		if (params.u?.[0] !== USERNAME || token !== expectedToken) {
			return this.send(res, 200, failedBody(40, 'Wrong username or password'));
		}

		const handler = this.handlers[endpoint];
		if (!handler) return this.send(res, 200, failedBody(0, `Unknown endpoint ${endpoint}`));
		const result = handler(params, this);
		if ('failed' in result && Array.isArray(result.failed)) {
			const [code, message] = result.failed as [number, string];
			return this.send(res, 200, failedBody(code, message));
		}
		this.send(res, 200, okBody(result as Payload));
	}

	private async handleLogin(req: IncomingMessage, url: URL, res: ServerResponse) {
		const body = (await this.readBody(req)) as { username?: string; password?: string } | undefined;
		this.nativeCalls.push({
			method: req.method ?? '',
			path: url.pathname,
			query: toParams(url.searchParams),
			headers: req.headers,
			body,
		});
		if (url.search.includes(encodeURIComponent(PASSWORD)) || url.search.includes(PASSWORD)) {
			this.violations.push('login: password sent in the query string');
		}
		if (req.method !== 'POST') return this.send(res, 405, { error: 'method not allowed' });
		this.logins++;
		if (body?.username !== USERNAME || body?.password !== PASSWORD) {
			return this.send(res, 401, { error: 'Invalid username or password' });
		}
		this.send(res, 200, { id: 'admin-id', username: USERNAME, isAdmin: true, token: JWT });
	}

	private async handleNative(req: IncomingMessage, url: URL, res: ServerResponse) {
		const body = await this.readBody(req);
		const method = req.method ?? 'GET';
		const query = toParams(url.searchParams);
		this.nativeCalls.push({ method, path: url.pathname, query, headers: req.headers, body });

		if (req.headers['x-nd-authorization'] !== `Bearer ${JWT}`) {
			return this.send(res, 401, { error: 'Not authenticated' });
		}
		if (this.denyNative) return this.send(res, 403, { error: 'Permission denied' });

		const match = url.pathname.match(/^\/api\/user(?:\/([^/]+))?\/?$/);
		if (!match) return this.send(res, 404, { error: 'not found' });
		const id = match[1] ? decodeURIComponent(match[1]) : undefined;

		if (method === 'GET' && !id) {
			const start = Number(query._start?.[0] ?? 0);
			const end = Number(query._end?.[0] ?? this.users.size);
			const all = [...this.users.values()].sort((a, b) => a.userName.localeCompare(b.userName));
			return this.send(res, 200, all.slice(start, end));
		}
		if (method === 'POST' && !id) {
			const input = body as NativeUser & { password?: string };
			const newId = `id-${input.userName}`;
			const { password: _password, ...stored } = input;
			this.users.set(newId, { ...stored, id: newId, lastLoginAt: null });
			return this.send(res, 200, { id: newId });
		}
		if (!id || !this.users.has(id)) return this.send(res, 404, { error: 'Not found' });
		if (method === 'GET') {
			const user = this.users.get(id);
			return this.send(
				res,
				200,
				this.echoSecrets
					? { ...user, password: 'leaked-hash', currentPassword: 'x', subsonicToken: 'y' }
					: user,
			);
		}
		if (method === 'PUT') {
			const input = body as NativeUser & { password?: string; currentPassword?: string };
			const { password: _p, currentPassword: _c, ...stored } = input;
			this.users.set(id, { ...stored, id });
			return this.send(res, 200, { id });
		}
		if (method === 'DELETE') {
			this.users.delete(id);
			return this.send(res, 200, { id });
		}
		this.send(res, 405, { error: 'method not allowed' });
	}
}
