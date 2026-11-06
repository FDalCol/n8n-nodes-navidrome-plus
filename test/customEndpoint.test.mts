import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeNavidrome } from './support/fakeServer';
import { runJson, runNode } from './support/context';

let server: FakeNavidrome;

beforeEach(async () => {
	server = await new FakeNavidrome().start();
	server.handlers.getAlbumList2 = (p) => ({ albumList2: { album: [{ id: p.type?.[0] }] } });
});

afterEach(async () => {
	expect(server.violations).toEqual([]);
	await server.stop();
});

const call = (endpoint: string, parameter: Array<{ name: string; value: string }> = []) =>
	runJson({
		baseUrl: server.baseUrl,
		params: {
			resource: 'customEndpoint',
			operation: 'call',
			endpoint,
			queryParameters: { parameter },
		},
	});

describe('Custom Endpoint', () => {
	it('normalizes "/rest/xxx", "xxx.view" and "xxx" to the same endpoint', async () => {
		for (const endpoint of ['/rest/getAlbumList2', 'getAlbumList2.view', 'getAlbumList2']) {
			const out = await call(endpoint, [{ name: 'type', value: 'newest' }]);
			expect(out).toEqual([{ albumList2: { album: [{ id: 'newest' }] } }]);
		}
		expect(server.calls('getAlbumList2').map((c) => c.path)).toEqual([
			'/rest/getAlbumList2',
			'/rest/getAlbumList2',
			'/rest/getAlbumList2',
		]);
	});

	it('ignores u, p, t and s, keeps node auth, repeats duplicate names', async () => {
		server.handlers.star = () => ({});
		await call('star', [
			{ name: 'u', value: 'mallory' },
			{ name: 'p', value: 'leak' },
			{ name: 't', value: 'x' },
			{ name: 's', value: 'y' },
			{ name: 'id', value: 's1' },
			{ name: 'id', value: 's2' },
		]);
		const params = server.calls('star')[0].params;
		expect(params.u).toEqual(['alice']);
		expect(params.p).toBeUndefined();
		expect(params.t).toHaveLength(1);
		expect(params.s).toHaveLength(1);
		expect(params.id).toEqual(['s1', 's2']);
	});

	it('rejects binary and share endpoints and invalid names', async () => {
		for (const endpoint of [
			'stream',
			'/rest/getCoverArt.view',
			'download',
			'getAvatar',
			'createShare',
		]) {
			await expect(
				runNode({
					baseUrl: server.baseUrl,
					params: { resource: 'customEndpoint', operation: 'call', endpoint },
				}),
			).rejects.toThrow(/not supported/);
		}
		await expect(
			runNode({
				baseUrl: server.baseUrl,
				params: { resource: 'customEndpoint', operation: 'call', endpoint: '../auth/login' },
			}),
		).rejects.toThrow(/Invalid Subsonic endpoint/);
		expect(server.subsonicCalls).toHaveLength(0);
	});

	it('propagates status "failed" errors', async () => {
		await expect(call('getNothing')).rejects.toThrow(
			/Navidrome error 0: Unknown endpoint getNothing/,
		);
	});
});
