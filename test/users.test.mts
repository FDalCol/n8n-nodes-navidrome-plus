import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeNavidrome, JWT, PASSWORD, USERNAME } from './support/fakeServer';
import { runJson, runNode } from './support/context';
import { Navidrome } from '../nodes/Navidrome/Navidrome.node';

let server: FakeNavidrome;

beforeEach(async () => {
	server = await new FakeNavidrome().start();
	server.users.set('id-bob', {
		id: 'id-bob',
		userName: 'bob',
		name: 'Bob',
		email: 'bob@example.com',
		isAdmin: false,
		lastLoginAt: '2026-01-01T00:00:00Z',
		libraries: [{ id: 1 }],
	});
	server.users.set('id-carol', { id: 'id-carol', userName: 'carol', name: 'Carol' });
});

afterEach(async () => {
	expect(server.violations).toEqual([]);
	await server.stop();
});

const apiCalls = () => server.nativeCalls.filter((c) => c.path.startsWith('/api/'));

describe('Users → Get / Get Many with Source = Subsonic', () => {
	it('Get calls getUser with the username, without native login', async () => {
		server.handlers.getUser = (p) => ({
			user: { username: p.username[0], adminRole: true, streamRole: true, folder: 1 },
		});
		const out = await runJson({
			baseUrl: server.baseUrl,
			params: { resource: 'users', operation: 'get', source: 'subsonic', username: USERNAME },
		});
		expect(out).toEqual([{ username: USERNAME, adminRole: true, streamRole: true, folder: [1] }]);
		expect(server.logins).toBe(0);
		expect(apiCalls()).toHaveLength(0);
	});

	it('Get Many calls getUsers and splits the users', async () => {
		server.handlers.getUsers = () => ({ users: { user: { username: USERNAME, adminRole: true } } });
		const out = await runJson({
			baseUrl: server.baseUrl,
			params: { resource: 'users', operation: 'getAll', source: 'subsonic' },
		});
		expect(out).toEqual([{ username: USERNAME, adminRole: true, folder: [] }]);
		expect(server.logins).toBe(0);
	});

	it('Get Many reports error 50 for non-admin users', async () => {
		server.handlers.getUsers = () => ({ failed: [50, 'User not authorized'] });
		await expect(
			runNode({
				baseUrl: server.baseUrl,
				params: { resource: 'users', operation: 'getAll', source: 'subsonic' },
			}),
		).rejects.toThrow(/Navidrome error 50.*administrator/);
	});
});

describe('Users → Get / Get Many with Source = Native API', () => {
	it('Source defaults to Native API', () => {
		const source = new Navidrome().description.properties.find((p) => p.name === 'source');
		expect(source?.default).toBe('native');
		expect((source?.options as Array<{ value: string }>).map((o) => o.value)).toEqual([
			'native',
			'subsonic',
		]);
	});

	it('Get by username (default source) resolves the ID and reads GET /api/user/{id}', async () => {
		const out = await runJson({
			baseUrl: server.baseUrl,
			params: { resource: 'users', operation: 'get', username: 'BOB' },
		});
		expect(out).toEqual([server.users.get('id-bob')]);
		expect(server.calls('getUser')).toHaveLength(0);
		expect(apiCalls().map((c) => `${c.method} ${c.path}`)).toEqual([
			'GET /api/user',
			'GET /api/user/id-bob',
		]);
	});

	it('Get by ID reads the user directly', async () => {
		const out = await runJson({
			baseUrl: server.baseUrl,
			params: { resource: 'users', operation: 'get', findUserBy: 'id', userId: 'id-carol' },
		});
		expect(out[0]).toMatchObject({ id: 'id-carol', userName: 'carol' });
		expect(apiCalls().map((c) => `${c.method} ${c.path}`)).toEqual(['GET /api/user/id-carol']);
	});

	it('Get Many lists users with GET /api/user (limit, sort, split)', async () => {
		const out = await runJson({
			baseUrl: server.baseUrl,
			params: {
				resource: 'users',
				operation: 'getAll',
				limit: 1,
				options: { sort: 'name', order: 'DESC' },
			},
		});
		expect(out).toHaveLength(1);
		const list = apiCalls().find((c) => c.path === '/api/user');
		expect(list?.query).toEqual({
			_start: ['0'],
			_end: ['1'],
			_sort: ['name'],
			_order: ['DESC'],
		});
	});

	it('Get Many with Return All pages through every user; split off gives one item', async () => {
		for (let i = 0; i < 230; i++) {
			server.users.set(`id-u${i}`, {
				id: `id-u${i}`,
				userName: `u${String(i).padStart(3, '0')}`,
				name: `U${i}`,
			});
		}
		const out = await runJson({
			baseUrl: server.baseUrl,
			params: { resource: 'users', operation: 'getAll', returnAll: true, splitIntoItems: false },
		});
		expect(out).toHaveLength(1);
		expect((out[0].users as unknown[]).length).toBe(232);
		expect(apiCalls().filter((c) => c.path === '/api/user')).toHaveLength(3);
	});

	it('Get Many via the native API needs an admin: 403 → clear message', async () => {
		server.denyNative = true;
		await expect(
			runNode({
				baseUrl: server.baseUrl,
				params: { resource: 'users', operation: 'getAll', returnAll: true },
			}),
		).rejects.toThrow(/administrator account is required/);
	});
});

describe('Users via the native API', () => {
	it('logs in once per execution and reuses the token for every item', async () => {
		const out = await runJson({
			baseUrl: server.baseUrl,
			items: 3,
			params: [
				{
					resource: 'users',
					operation: 'update',
					userId: 'id-bob',
					findUserBy: 'id',
					updateFields: { name: 'Robert' },
				},
				{
					resource: 'users',
					operation: 'update',
					username: 'CAROL',
					updateFields: { email: 'c@example.com' },
				},
				{ resource: 'users', operation: 'delete', username: 'carol' },
			],
		});
		expect(server.logins).toBe(1);
		const login = server.nativeCalls.find((c) => c.path === '/auth/login');
		expect(login?.method).toBe('POST');
		expect(login?.body).toEqual({ username: USERNAME, password: PASSWORD });
		expect(login?.query).toEqual({});
		for (const call of apiCalls()) {
			expect(call.headers['x-nd-authorization']).toBe(`Bearer ${JWT}`);
		}
		expect(out[0]).toMatchObject({ id: 'id-bob', name: 'Robert', userName: 'bob' });
		expect(out[1]).toMatchObject({ id: 'id-carol', email: 'c@example.com' });
		expect(out[2]).toEqual({ success: true, deleted: true, id: 'id-carol' });
		expect(server.users.has('id-carol')).toBe(false);
	});

	it('update preserves the fields it does not change (PUT replaces the record)', async () => {
		await runJson({
			baseUrl: server.baseUrl,
			params: {
				resource: 'users',
				operation: 'update',
				username: 'bob',
				updateFields: { isAdmin: true },
			},
		});
		const put = apiCalls().find((c) => c.method === 'PUT');
		expect(put?.path).toBe('/api/user/id-bob');
		expect(put?.body).toMatchObject({
			userName: 'bob',
			name: 'Bob',
			email: 'bob@example.com',
			isAdmin: true,
			lastLoginAt: '2026-01-01T00:00:00Z',
		});
		expect(put?.body).not.toHaveProperty('libraries');
		expect(put?.body).not.toHaveProperty('password');
	});

	it('change password sends the new (and optional current) password in the PUT body only', async () => {
		const out = await runJson({
			baseUrl: server.baseUrl,
			params: {
				resource: 'users',
				operation: 'changePassword',
				username: 'bob',
				newPassword: 'n3w-pass',
				currentPassword: 'old-pass',
			},
		});
		const put = apiCalls().find((c) => c.method === 'PUT');
		expect(put?.body).toMatchObject({
			password: 'n3w-pass',
			currentPassword: 'old-pass',
			userName: 'bob',
		});
		expect(apiCalls().every((c) => !JSON.stringify(c.query).includes('n3w-pass'))).toBe(true);
		expect(out).toEqual([{ success: true, passwordChanged: true, id: 'id-bob', userName: 'bob' }]);
	});

	it('create posts a JSON body and returns the stored user', async () => {
		const out = await runJson({
			baseUrl: server.baseUrl,
			params: {
				resource: 'users',
				operation: 'create',
				userName: 'dave',
				name: 'Dave',
				password: 'pw-dave',
				additionalFields: { email: 'd@example.com' },
			},
		});
		const post = apiCalls().find((c) => c.method === 'POST');
		expect(post?.body).toEqual({
			userName: 'dave',
			name: 'Dave',
			password: 'pw-dave',
			email: 'd@example.com',
			isAdmin: false,
		});
		expect(out[0]).toMatchObject({ id: 'id-dave', userName: 'dave' });
		expect(out[0]).not.toHaveProperty('password');
	});

	it('reports a missing username clearly', async () => {
		await expect(
			runNode({
				baseUrl: server.baseUrl,
				params: { resource: 'users', operation: 'delete', username: 'nobody' },
			}),
		).rejects.toThrow(/user "nobody" not found/);
	});

	it('403 from the native API → "administrator account is required"', async () => {
		server.denyNative = true;
		await expect(
			runNode({
				baseUrl: server.baseUrl,
				params: { resource: 'users', operation: 'delete', userId: 'id-bob', findUserBy: 'id' },
			}),
		).rejects.toThrow(/administrator account is required/);
	});

	it('a failed login is reported once and not retried for the other items', async () => {
		const out = await runNode({
			baseUrl: server.baseUrl,
			password: 'wrong',
			items: 2,
			continueOnFail: true,
			params: { resource: 'users', operation: 'delete', userId: 'id-bob', findUserBy: 'id' },
		});
		expect(server.logins).toBe(1);
		expect(out.map((o) => o.json.error)).toEqual([
			expect.stringMatching(/login failed: invalid username or password/),
			expect.stringMatching(/login failed: invalid username or password/),
		]);
	});
});
