import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	buildCustomParams,
	resolveEndpoint,
} from '../nodes/Navidrome/resources/customEndpoint/execute';
import { redactSecrets, validateBaseUrl } from '../nodes/Navidrome/transport/security';
import { FakeNavidrome, JWT, PASSWORD } from './support/fakeServer';
import { httpRequest, runJson, runNode, testCredential, type HttpOptions } from './support/context';

let server: FakeNavidrome;
/** Stands in for an attacker-controlled host. */
let attacker: FakeNavidrome;

beforeEach(async () => {
	server = await new FakeNavidrome().start();
	attacker = await new FakeNavidrome().start();
	server.handlers.getAlbumList2 = () => ({ albumList2: { album: [] } });
	server.users.set('id-bob', { id: 'id-bob', userName: 'bob', name: 'Bob' });
});

afterEach(async () => {
	expect(server.violations).toEqual([]);
	expect(attacker.allRequests).toEqual([]);
	await server.stop();
	await attacker.stop();
});

const customCall = (endpoint: string, parameter: Array<{ name: string; value: string }> = []) =>
	runNode({
		baseUrl: server.baseUrl,
		params: {
			resource: 'customEndpoint',
			operation: 'call',
			endpoint,
			queryParameters: { parameter },
		},
	});

function expectNoSecrets(text: string, secrets: string[]) {
	for (const secret of secrets) expect(text).not.toContain(secret);
	expect(text).not.toMatch(/[?&](t|s|p|u)=(?!\[REDACTED\])/);
	expect(text).not.toMatch(/\/rest\/[A-Za-z0-9]+\?/);
}

describe('1. Custom Endpoint full URLs must match the Base URL origin', () => {
	it('accepts a full URL on the same protocol, host and port', async () => {
		const [item] = await customCall(`${server.baseUrl}/rest/getAlbumList2.view`, [
			{ name: 'type', value: 'newest' },
		]);
		expect(item.json).toEqual({ albumList2: { album: [] } });
		expect(server.calls('getAlbumList2')).toHaveLength(1);
	});

	it('rejects another host, port or protocol before sending anything', async () => {
		const port = new URL(server.baseUrl).port;
		for (const endpoint of [
			`${attacker.baseUrl}/rest/getAlbumList2`, // other port
			`http://localhost:${port}/rest/getAlbumList2`, // other host name
			`https://127.0.0.1:${port}/rest/getAlbumList2`, // other protocol
			`//evil.example/rest/getAlbumList2`, // protocol-relative
			`ftp://127.0.0.1:${port}/rest/getAlbumList2`,
		]) {
			await expect(customCall(endpoint)).rejects.toThrow(
				/same protocol, host and port|Invalid endpoint URL/,
			);
		}
		expect(server.allRequests).toEqual([]);
	});

	it('rejects user info, query strings and paths outside /rest/', async () => {
		const base = server.baseUrl;
		const host = base.replace('http://', '');
		await expect(customCall(`http://user:pw@${host}/rest/ping`)).rejects.toThrow(
			/username or password/,
		);
		await expect(customCall(`${base}/rest/ping?p=x`)).rejects.toThrow(/query string/);
		await expect(customCall(`${base}/api/user`)).rejects.toThrow(/must point to/);
		expect(server.allRequests).toEqual([]);
	});

	it('honours a Base URL with a path prefix', () => {
		expect(
			resolveEndpoint('https://nd.example/music/rest/ping.view', 'https://nd.example/music'),
		).toEqual({ ok: true, endpoint: 'ping' });
		expect(resolveEndpoint('https://nd.example/rest/ping', 'https://nd.example/music').ok).toBe(
			false,
		);
		expect(
			resolveEndpoint('https://nd.example:443/music/rest/ping', 'https://nd.example/music'),
		).toEqual({
			ok: true,
			endpoint: 'ping',
		});
	});
});

describe('4. No path traversal through endpoint or parameter names', () => {
	it.each([
		'../auth/login',
		'/rest/../auth/login',
		'rest/../../api/user',
		'getAlbumList2/../../auth/login',
		'..%2Fauth%2Flogin',
		'%2e%2e/auth/login',
		'..\\auth\\login',
		'getAlbumList2/extra',
		'get Album',
	])('rejects relative endpoint %s', async (endpoint) => {
		await expect(customCall(endpoint)).rejects.toThrow(/Invalid Subsonic endpoint|query string/);
		expect(server.allRequests).toEqual([]);
	});

	it('rejects full URLs that normalise outside /rest/', async () => {
		for (const path of ['/rest/../auth/login', '/rest/%2e%2e/api/user', '/rest/./../api/user']) {
			await expect(customCall(`${server.baseUrl}${path}`)).rejects.toThrow(/must point to/);
		}
		expect(server.allRequests).toEqual([]);
	});

	it.each(['../x', 'a/b', '__proto__', 'constructor.prototype', 'x y', 'a%2Fb', '1abc'])(
		'rejects parameter name %s',
		async (name) => {
			await expect(customCall('ping', [{ name, value: '1' }])).rejects.toThrow(
				/Invalid query parameter name/,
			);
			expect(server.allRequests).toEqual([]);
		},
	);

	it('parameter values are encoded and stay in the query string', async () => {
		await customCall('getAlbumList2', [{ name: 'type', value: '../../auth/login?x=1&p=leak' }]);
		const call = server.calls('getAlbumList2')[0];
		expect(call.path).toBe('/rest/getAlbumList2');
		expect(call.params.type).toEqual(['../../auth/login?x=1&p=leak']);
		expect(call.params.p).toBeUndefined();
	});

	it('builds parameters without touching object prototypes', () => {
		const built = buildCustomParams([
			{ name: 'id', value: '1' },
			{ name: 'id', value: '2' },
			{ name: 'P', value: 'ignored' },
			{ name: 'type', value: 'x' },
		]);
		expect(built).toEqual({ ok: true, params: expect.anything() });
		if (built.ok) expect({ ...built.params }).toEqual({ id: ['1', '2'], type: 'x' });
		expect(({} as Record<string, unknown>).polluted).toBeUndefined();
	});

	it('rejects "." and ".." as native user IDs', async () => {
		for (const userId of ['.', '..']) {
			await expect(
				runNode({
					baseUrl: server.baseUrl,
					params: { resource: 'users', operation: 'delete', findUserBy: 'id', userId },
				}),
			).rejects.toThrow(/Invalid user ID/);
		}
		expect(server.nativeCalls.filter((c) => c.path.startsWith('/api/'))).toEqual([]);
	});

	it('URL-encodes user IDs into a single path segment', async () => {
		await expect(
			runNode({
				baseUrl: server.baseUrl,
				params: {
					resource: 'users',
					operation: 'get',
					findUserBy: 'id',
					userId: '../../auth/login',
				},
			}),
		).rejects.toThrow(/not found/);
		const call = server.nativeCalls.find((c) => c.path.startsWith('/api/'));
		expect(call?.path).toBe('/api/user/..%2F..%2Fauth%2Flogin');
		expect(server.logins).toBe(1);
	});
});

describe('2. No credentials in error messages or outputs', () => {
	it('redacts a network error that echoes the request URL and options', async () => {
		let seenUrl = '';
		const failing = async (options: HttpOptions) => {
			seenUrl = options.url ?? '';
			throw new Error(
				`connect ECONNREFUSED while requesting ${options.url} ${JSON.stringify(options)}`,
			);
		};
		const error = (await runNode({
			baseUrl: server.baseUrl,
			params: { resource: 'system', operation: 'ping' },
			httpRequest: failing,
		}).catch((e: Error) => e)) as Error;
		const query = new URL(seenUrl).searchParams;
		// n8n may replace the message (e.g. ECONNREFUSED) and keep ours in `messages`.
		const shown = [error.message, ...((error as { messages?: string[] }).messages ?? [])].join(
			' | ',
		);
		expect(shown).toMatch(/Could not reach the Navidrome server/);
		expectNoSecrets(shown, [PASSWORD, query.get('t')!, query.get('s')!]);

		const [item] = await runNode({
			baseUrl: server.baseUrl,
			continueOnFail: true,
			params: { resource: 'system', operation: 'ping' },
			httpRequest: failing,
		});
		const q2 = new URL(seenUrl).searchParams;
		expectNoSecrets(JSON.stringify(item.json), [PASSWORD, q2.get('t')!, q2.get('s')!]);
	});

	it('redacts the JWT and passwords from native API network errors', async () => {
		const failingApi = async (options: HttpOptions) => {
			if ((options.url ?? '').includes('/api/')) {
				throw new Error(`socket hang up: ${JSON.stringify(options)}`);
			}
			return await httpRequest(options);
		};
		const [item] = await runNode({
			baseUrl: server.baseUrl,
			continueOnFail: true,
			params: {
				resource: 'users',
				operation: 'changePassword',
				findUserBy: 'id',
				userId: 'id-bob',
				newPassword: 'Brand-New-Pass-123',
			},
			httpRequest: failingApi,
		});
		const text = JSON.stringify(item.json);
		expect(text).toMatch(/socket hang up/);
		expectNoSecrets(text, [PASSWORD, JWT, 'Brand-New-Pass-123']);
	});

	it('keeps Subsonic failures, 403 and wrong passwords free of t, s, password and token', async () => {
		const seen: HttpOptions[] = [];
		server.handlers.startScan = () => ({ failed: [50, 'User not authorized'] });
		const out = await runNode({
			baseUrl: server.baseUrl,
			items: 2,
			continueOnFail: true,
			params: [
				{ resource: 'library', operation: 'startScan' },
				{ resource: 'users', operation: 'delete', findUserBy: 'id', userId: 'id-missing' },
			],
			onRequest: (o) => seen.push(o),
		});
		server.denyNative = true;
		const denied = await runNode({
			baseUrl: server.baseUrl,
			continueOnFail: true,
			params: { resource: 'users', operation: 'getAll', returnAll: true },
		});
		const wrong = await runNode({
			baseUrl: server.baseUrl,
			password: 'Wrong-Password-42',
			continueOnFail: true,
			params: { resource: 'system', operation: 'ping' },
		});
		const secrets = [PASSWORD, JWT, 'Wrong-Password-42'];
		for (const o of seen.filter((r) => r.url?.includes('/rest/'))) {
			const q = new URL(o.url!).searchParams;
			secrets.push(q.get('t')!, q.get('s')!);
		}
		for (const item of [...out, ...denied, ...wrong]) {
			expect(item.json.error).toBeTypeOf('string');
			expectNoSecrets(JSON.stringify(item.json), secrets);
		}
	});

	it('truncates and redacts server error bodies', () => {
		const text = redactSecrets(
			`GET http://h/rest/ping?u=a&t=abc123&s=def456 Bearer eyJhbGciOi.x.y password=hunter22 ${PASSWORD}`,
			[PASSWORD],
		);
		expect(text).not.toMatch(/abc123|def456|eyJhbGciOi|hunter22/);
		expect(text).not.toContain(PASSWORD);
	});

	it('credential test errors never include t, s or the password', async () => {
		const seen: HttpOptions[] = [];
		const result = await testCredential(
			server.baseUrl,
			PASSWORD,
			(o) => seen.push(o),
			async (o) => {
				throw new Error(`failed ${o.uri} ${JSON.stringify(o)}`);
			},
		);
		expect(result.status).toBe('Error');
		const q = new URL(seen[0].uri!).searchParams;
		expectNoSecrets(result.message, [PASSWORD, q.get('t')!, q.get('s')!]);
	});
});

describe('Native user listing cannot loop forever', () => {
	it('stops when the server ignores _start/_end and keeps returning the same users', async () => {
		const seen: HttpOptions[] = [];
		const ignoresPaging = async (options: HttpOptions) => {
			const url = new URL(options.url ?? '');
			if (url.pathname === '/api/user') {
				const page = Array.from({ length: 100 }, (_, i) => ({ id: `u${i}`, userName: `u${i}` }));
				return { statusCode: 200, headers: {}, body: page };
			}
			return await httpRequest(options);
		};
		const out = await runJson({
			baseUrl: server.baseUrl,
			params: { resource: 'users', operation: 'getAll', returnAll: true, splitIntoItems: false },
			httpRequest: ignoresPaging,
			onRequest: (o) => seen.push(o),
		});
		expect((out[0].users as unknown[]).length).toBe(100);
		expect(seen.filter((o) => new URL(o.url!).pathname === '/api/user')).toHaveLength(2);

		seen.length = 0;
		await expect(
			runNode({
				baseUrl: server.baseUrl,
				params: { resource: 'users', operation: 'delete', username: 'nobody' },
				httpRequest: ignoresPaging,
				onRequest: (o) => seen.push(o),
			}),
		).rejects.toThrow(/user "nobody" not found/);
		expect(seen.filter((o) => new URL(o.url!).pathname === '/api/user')).toHaveLength(2);
	});

	it('stops when the server returns more records than requested', async () => {
		const tooMany = async (options: HttpOptions) => {
			if (new URL(options.url ?? '').pathname === '/api/user') {
				const page = Array.from({ length: 250 }, (_, i) => ({ id: `x${i}`, userName: `x${i}` }));
				return { statusCode: 200, headers: {}, body: page };
			}
			return await httpRequest(options);
		};
		const out = await runJson({
			baseUrl: server.baseUrl,
			params: { resource: 'users', operation: 'getAll', limit: 5 },
			httpRequest: tooMany,
		});
		expect(out).toHaveLength(5);
	});
});

describe('3. Passwords never appear in outputs', () => {
	it('Create User and Change Password outputs contain no password, even if the server echoes one', async () => {
		server.echoSecrets = true;
		const created = await runJson({
			baseUrl: server.baseUrl,
			params: {
				resource: 'users',
				operation: 'create',
				userName: 'eve',
				name: 'Eve',
				password: 'Eve-Pass-77',
			},
		});
		const changed = await runJson({
			baseUrl: server.baseUrl,
			params: {
				resource: 'users',
				operation: 'changePassword',
				username: 'bob',
				newPassword: 'Bob-New-Pass-88',
				currentPassword: 'Bob-Old-Pass-11',
			},
		});
		const listed = await runJson({
			baseUrl: server.baseUrl,
			params: { resource: 'users', operation: 'get', findUserBy: 'id', userId: 'id-bob' },
		});
		const text = JSON.stringify([created, changed, listed]);
		for (const secret of [
			'Eve-Pass-77',
			'Bob-New-Pass-88',
			'Bob-Old-Pass-11',
			'leaked-hash',
			PASSWORD,
			JWT,
		]) {
			expect(text).not.toContain(secret);
		}
		for (const user of [...created, ...listed]) {
			expect(user).not.toHaveProperty('password');
			expect(user).not.toHaveProperty('currentPassword');
			expect(user).not.toHaveProperty('subsonicToken');
		}
		expect(changed).toEqual([
			{ success: true, passwordChanged: true, id: 'id-bob', userName: 'bob' },
		]);
	});
});

describe('5. Timeouts and redirects', () => {
	it('every HTTP request has a timeout and does not follow redirects', async () => {
		const seen: HttpOptions[] = [];
		server.handlers.ping = () => ({});
		await runNode({
			baseUrl: server.baseUrl,
			items: 2,
			params: [
				{ resource: 'system', operation: 'ping' },
				{ resource: 'users', operation: 'get', findUserBy: 'id', userId: 'id-bob' },
			],
			onRequest: (o) => seen.push(o),
		});
		expect(seen.map((o) => new URL(o.url!).pathname)).toEqual([
			'/rest/ping',
			'/auth/login',
			'/api/user/id-bob',
		]);
		for (const o of seen) {
			expect(o.timeout).toBe(30_000);
			expect(o.disableFollowRedirect).toBe(true);
		}

		const credentialRequests: HttpOptions[] = [];
		await testCredential(server.baseUrl, PASSWORD, (o) => credentialRequests.push(o));
		expect(credentialRequests[0]).toMatchObject({
			timeout: 30_000,
			followRedirect: false,
			followAllRedirects: false,
		});
	});

	it('a redirect to another host never receives the token, the JWT or the password', async () => {
		server.redirect = { status: 307, origin: attacker.baseUrl };
		const ping = await runNode({
			baseUrl: server.baseUrl,
			continueOnFail: true,
			params: { resource: 'system', operation: 'ping' },
		});
		expect(ping[0].json.error).toMatch(/redirect \(HTTP 307\).*not followed/);
		expect(ping[0].json.error).not.toMatch(/[?&](t|s)=/);

		const login = await runNode({
			baseUrl: server.baseUrl,
			continueOnFail: true,
			params: { resource: 'users', operation: 'getAll', returnAll: true },
		});
		expect(login[0].json.error).toMatch(/redirect \(HTTP 307\)/);

		const credential = await testCredential(server.baseUrl);
		expect(credential.status).toBe('Error');
		expect(credential.message).not.toContain(PASSWORD);
		// afterEach asserts that the attacker received no request at all.
	});

	it('rejects unsafe Base URLs', () => {
		expect(validateBaseUrl('https://music.example.com/navidrome')).toBeUndefined();
		expect(validateBaseUrl('ftp://music.example.com')).toMatch(/http/);
		expect(validateBaseUrl('https://user:pw@music.example.com')).toMatch(/username or password/);
		expect(validateBaseUrl('https://music.example.com?x=1')).toMatch(/query string/);
		expect(validateBaseUrl('https://music.example.com/?')).toMatch(/query string/);
		expect(validateBaseUrl('https://music.example.com#')).toMatch(/query string/);
		expect(validateBaseUrl('not a url')).toMatch(/not a valid URL/);
	});
});
