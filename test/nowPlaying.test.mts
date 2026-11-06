import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Navidrome } from '../nodes/Navidrome/Navidrome.node';
import { FakeNavidrome } from './support/fakeServer';
import { runNode } from './support/context';

let server: FakeNavidrome;

beforeEach(async () => {
	server = await new FakeNavidrome().start();
});

afterEach(async () => {
	expect(server.violations).toEqual([]);
	await server.stop();
});

const entry = (id: string, minutesAgo: number, username = 'alice') => ({
	id,
	title: `Song ${id}`,
	username,
	minutesAgo,
	playerId: 1,
	state: 'playing',
});

describe('Get Now Playing', () => {
	it('returns a single item with playing=false when nothing is playing', async () => {
		server.handlers.getNowPlaying = () => ({ nowPlaying: {} });
		const out = await runNode({
			baseUrl: server.baseUrl,
			params: { resource: 'lists', operation: 'getNowPlaying' },
		});
		expect(out).toEqual([
			{ json: { playing: false, count: 0, entries: [] }, pairedItem: { item: 0 } },
		]);
	});

	it('normalizes a single entry object into an array', async () => {
		server.handlers.getNowPlaying = () => ({ nowPlaying: { entry: entry('s1', 0) } });
		const out = await runNode({
			baseUrl: server.baseUrl,
			params: { resource: 'lists', operation: 'getNowPlaying' },
		});
		expect(out).toHaveLength(1);
		expect(out[0].json).toEqual({ playing: true, count: 1, entries: [entry('s1', 0)] });
	});

	it('returns one item with all entries, regardless of Split Into Items', async () => {
		const entries = [entry('s1', 0), entry('s2', 3, 'bob'), entry('s3', 12, 'carol')];
		server.handlers.getNowPlaying = () => ({ nowPlaying: { entry: entries } });
		for (const splitIntoItems of [true, false]) {
			const out = await runNode({
				baseUrl: server.baseUrl,
				params: { resource: 'lists', operation: 'getNowPlaying', splitIntoItems },
			});
			expect(out).toHaveLength(1);
			expect(out[0].json).toEqual({ playing: true, count: 3, entries });
		}
	});

	it('filters entries with Max Minutes Ago (0 = no filter)', async () => {
		server.handlers.getNowPlaying = () => ({
			nowPlaying: { entry: [entry('s1', 0), entry('s2', 5), entry('s3', 30)] },
		});
		const recent = await runNode({
			baseUrl: server.baseUrl,
			params: { resource: 'lists', operation: 'getNowPlaying', maxMinutesAgo: 5 },
		});
		expect(recent[0].json).toEqual({
			playing: true,
			count: 2,
			entries: [entry('s1', 0), entry('s2', 5)],
		});

		const none = await runNode({
			baseUrl: server.baseUrl,
			params: { resource: 'lists', operation: 'getNowPlaying', maxMinutesAgo: 0 },
		});
		expect(none[0].json.count).toBe(3);

		server.handlers.getNowPlaying = () => ({ nowPlaying: { entry: entry('old', 45) } });
		const stale = await runNode({
			baseUrl: server.baseUrl,
			params: { resource: 'lists', operation: 'getNowPlaying', maxMinutesAgo: 10 },
		});
		expect(stale[0].json).toEqual({ playing: false, count: 0, entries: [] });
	});
});

describe('backward compatibility with the existing workflow', () => {
	it('default resource is the one containing getNowPlaying, with maxMinutesAgo', () => {
		const { properties } = new Navidrome().description;
		const resource = properties.find((p) => p.name === 'resource');
		expect(resource?.default).toBe('lists');
		const listsOperation = properties.find(
			(p) => p.name === 'operation' && p.displayOptions?.show?.resource?.includes('lists'),
		);
		expect((listsOperation?.options as Array<{ value: string }>).map((o) => o.value)).toContain(
			'getNowPlaying',
		);
		const maxMinutes = properties.find((p) => p.name === 'maxMinutesAgo');
		expect(maxMinutes?.displayOptions?.show).toEqual({
			resource: ['lists'],
			operation: ['getNowPlaying'],
		});
	});

	it('runs a workflow node with only operation + maxMinutesAgo (no resource parameter)', async () => {
		server.handlers.getNowPlaying = () => ({
			nowPlaying: { entry: [entry('s1', 1), entry('s2', 20)] },
		});
		const out = await runNode({
			baseUrl: server.baseUrl,
			params: { operation: 'getNowPlaying', maxMinutesAgo: 10 },
		});
		expect(out).toHaveLength(1);
		expect(out[0].json.playing).toBe(true);
		expect(out[0].json.count).toBe(1);
		expect(server.calls('getNowPlaying')).toHaveLength(1);
	});
});
