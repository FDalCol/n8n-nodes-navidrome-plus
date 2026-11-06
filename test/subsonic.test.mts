import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FakeNavidrome } from './support/fakeServer';
import { runJson, runNode } from './support/context';

let server: FakeNavidrome;

beforeEach(async () => {
	server = await new FakeNavidrome().start();
});

afterEach(async () => {
	expect(server.violations).toEqual([]);
	await server.stop();
});

describe('authentication', () => {
	it('authenticates with a token the server can verify, fresh salt per request', async () => {
		const out = await runJson({
			baseUrl: server.baseUrl,
			items: 3,
			params: { resource: 'system', operation: 'ping' },
		});
		expect(out).toHaveLength(3);
		expect(out[0]).toMatchObject({ status: 'ok', version: '1.16.1', type: 'navidrome' });
		const salts = new Set(server.calls('ping').map((c) => c.params.s[0]));
		expect(salts.size).toBe(3);
		for (const call of server.subsonicCalls) expect(call.params.p).toBeUndefined();
	});

	it('reports wrong credentials as Navidrome error 40', async () => {
		await expect(
			runNode({
				baseUrl: server.baseUrl,
				password: 'wrong',
				params: { resource: 'system', operation: 'ping' },
			}),
		).rejects.toThrow(
			'Navidrome error 40: Wrong username or password (Wrong username or password; check the Navidrome credential.)',
		);
	});
});

describe('errors', () => {
	it('turns status "failed" into a NodeOperationError with code and message', async () => {
		server.handlers.getAlbum = () => ({ failed: [70, 'Album not found'] });
		const error = await runNode({
			baseUrl: server.baseUrl,
			params: { resource: 'browsing', operation: 'getAlbum', id: 'missing' },
		}).catch((e: Error) => e);
		expect(error).toBeInstanceOf(Error);
		expect((error as Error).constructor.name).toBe('NodeOperationError');
		expect((error as Error).message).toMatch(/Navidrome error 70: Album not found/);
	});

	it('continueOnFail outputs { error } with pairedItem and keeps going', async () => {
		server.handlers.startScan = () => ({ failed: [50, 'User not authorized'] });
		const out = await runNode({
			baseUrl: server.baseUrl,
			items: 2,
			continueOnFail: true,
			params: [
				{ resource: 'library', operation: 'startScan' },
				{ resource: 'system', operation: 'ping' },
			],
		});
		expect(out[0].pairedItem).toEqual({ item: 0 });
		expect(out[0].json.error).toMatch(/Navidrome error 50: User not authorized/);
		expect(out[0].json.error).toMatch(/administrator/);
		expect(out[1]).toMatchObject({ json: { status: 'ok' }, pairedItem: { item: 1 } });
	});
});

describe('list normalization and Split Into Items', () => {
	it('normalizes a single album object into an array and splits it', async () => {
		server.handlers.getAlbumList2 = () => ({ albumList2: { album: { id: 'al-1', name: 'Only' } } });
		const out = await runJson({
			baseUrl: server.baseUrl,
			params: {
				resource: 'lists',
				operation: 'getAlbumList',
				listType: 'byYear',
				fromYear: 1990,
				toYear: 1999,
				size: 5,
				offset: 10,
				options: { musicFolderId: '2' },
			},
		});
		expect(out).toEqual([{ id: 'al-1', name: 'Only' }]);
		const call = server.calls('getAlbumList2')[0];
		expect(call.params).toMatchObject({
			type: ['byYear'],
			fromYear: ['1990'],
			toYear: ['1999'],
			size: ['5'],
			offset: ['10'],
			musicFolderId: ['2'],
		});
	});

	it('returns one item with an (empty) array when Split Into Items is off', async () => {
		server.handlers.getAlbumList2 = () => ({ albumList2: {} });
		const out = await runJson({
			baseUrl: server.baseUrl,
			params: {
				resource: 'lists',
				operation: 'getAlbumList',
				listType: 'newest',
				size: 10,
				offset: 0,
				splitIntoItems: false,
			},
		});
		expect(out).toEqual([{ albumList2: { album: [] } }]);
	});

	it('normalizes a missing list key to [] (split → no items)', async () => {
		server.handlers.getGenres = () => ({});
		const split = await runJson({
			baseUrl: server.baseUrl,
			params: { resource: 'browsing', operation: 'getGenres' },
		});
		expect(split).toEqual([]);
		const whole = await runJson({
			baseUrl: server.baseUrl,
			params: { resource: 'browsing', operation: 'getGenres', splitIntoItems: false },
		});
		expect(whole).toEqual([{ genres: { genre: [] } }]);
	});

	it('search3: separate counts/offsets, typed split, normalized lists', async () => {
		server.handlers.search3 = () => ({
			searchResult3: { artist: { id: 'ar1' }, song: [{ id: 's1' }, { id: 's2' }] },
		});
		const out = await runJson({
			baseUrl: server.baseUrl,
			params: {
				resource: 'search',
				operation: 'search',
				query: 'beatles',
				options: {
					artistCount: 1,
					artistOffset: 2,
					albumCount: 3,
					albumOffset: 4,
					songCount: 5,
					songOffset: 6,
				},
			},
		});
		expect(out).toEqual([
			{ resultType: 'artist', id: 'ar1' },
			{ resultType: 'song', id: 's1' },
			{ resultType: 'song', id: 's2' },
		]);
		expect(server.calls('search3')[0].params).toMatchObject({
			query: ['beatles'],
			artistCount: ['1'],
			artistOffset: ['2'],
			albumCount: ['3'],
			albumOffset: ['4'],
			songCount: ['5'],
			songOffset: ['6'],
		});

		const whole = await runJson({
			baseUrl: server.baseUrl,
			params: { resource: 'search', operation: 'search', query: 'x', splitIntoItems: false },
		});
		expect(whole).toEqual([
			{
				searchResult3: { artist: [{ id: 'ar1' }], album: [], song: [{ id: 's1' }, { id: 's2' }] },
			},
		]);
	});

	it('getArtists flattens the index into one item per artist', async () => {
		server.handlers.getArtists = () => ({
			artists: {
				index: [
					{ name: 'A', artist: { id: 'a1', name: 'ABBA' } },
					{ name: 'B', artist: [{ id: 'b1' }, { id: 'b2' }] },
				],
			},
		});
		const out = await runJson({
			baseUrl: server.baseUrl,
			params: { resource: 'browsing', operation: 'getArtists' },
		});
		expect(out).toEqual([
			{ id: 'a1', name: 'ABBA', index: 'A' },
			{ id: 'b1', index: 'B' },
			{ id: 'b2', index: 'B' },
		]);
	});

	it('getAlbum returns the album with a normalized song array', async () => {
		server.handlers.getAlbum = (p) => ({ album: { id: p.id[0], song: { id: 's1' } } });
		const out = await runJson({
			baseUrl: server.baseUrl,
			params: { resource: 'browsing', operation: 'getAlbum', id: 'al-1' },
		});
		expect(out).toEqual([{ id: 'al-1', song: [{ id: 's1' }] }]);
	});
});

describe('favorites & ratings', () => {
	it('star and unstar send repeated id/albumId/artistId parameters', async () => {
		server.handlers.star = () => ({});
		server.handlers.unstar = () => ({});
		const star = await runJson({
			baseUrl: server.baseUrl,
			params: { resource: 'favorites', operation: 'star', itemType: 'album', ids: 'a1, a2' },
		});
		expect(star[0]).toMatchObject({ success: true, operation: 'star', ids: ['a1', 'a2'] });
		expect(server.calls('star')[0].params.albumId).toEqual(['a1', 'a2']);

		await runJson({
			baseUrl: server.baseUrl,
			params: { resource: 'favorites', operation: 'unstar', itemType: 'song', ids: 's9' },
		});
		expect(server.calls('unstar')[0].params.id).toEqual(['s9']);

		await runJson({
			baseUrl: server.baseUrl,
			params: { resource: 'favorites', operation: 'star', itemType: 'artist', ids: 'ar1' },
		});
		expect(server.calls('star')[1].params.artistId).toEqual(['ar1']);
	});

	it('setRating sends id and rating, and rejects values outside 0-5', async () => {
		server.handlers.setRating = () => ({});
		const out = await runJson({
			baseUrl: server.baseUrl,
			params: { resource: 'favorites', operation: 'setRating', id: 's1', rating: 4 },
		});
		expect(out).toEqual([{ success: true, id: 's1', rating: 4 }]);
		expect(server.calls('setRating')[0].params).toMatchObject({ id: ['s1'], rating: ['4'] });

		await expect(
			runNode({
				baseUrl: server.baseUrl,
				params: { resource: 'favorites', operation: 'setRating', id: 's1', rating: 6 },
			}),
		).rejects.toThrow(/between 0 and 5/);
		expect(server.calls('setRating')).toHaveLength(1);
	});

	it('scrobble sends submission and one timestamp per song', async () => {
		server.handlers.scrobble = () => ({});
		await runJson({
			baseUrl: server.baseUrl,
			params: {
				resource: 'favorites',
				operation: 'scrobble',
				songIds: 's1,s2',
				submission: false,
				options: { time: '2026-01-02T03:04:05.000Z' },
			},
		});
		const millis = String(Date.parse('2026-01-02T03:04:05.000Z'));
		expect(server.calls('scrobble')[0].params).toMatchObject({
			id: ['s1', 's2'],
			submission: ['false'],
			time: [millis, millis],
		});
	});
});

describe('playlists', () => {
	it('creates a playlist with songs and returns it', async () => {
		server.handlers.createPlaylist = (p) => ({
			playlist: { id: 'pl-1', name: p.name[0], entry: { id: p.songId[0] } },
		});
		const out = await runJson({
			baseUrl: server.baseUrl,
			params: { resource: 'playlists', operation: 'create', name: 'Mix', songIds: 's1' },
		});
		expect(out).toEqual([{ id: 'pl-1', name: 'Mix', entry: [{ id: 's1' }] }]);
		expect(server.calls('createPlaylist')[0].params.songId).toEqual(['s1']);
	});

	it('updates name, comment, visibility, adds and removes songs', async () => {
		server.handlers.updatePlaylist = () => ({});
		const out = await runJson({
			baseUrl: server.baseUrl,
			params: {
				resource: 'playlists',
				operation: 'update',
				playlistId: 'pl-1',
				updateFields: {
					name: 'New',
					comment: '',
					public: true,
					songIdsToAdd: 's1,s2',
					songIndexesToRemove: '0, 3',
				},
			},
		});
		expect(out).toEqual([{ success: true, playlistId: 'pl-1', songsAdded: 2, songsRemoved: 2 }]);
		expect(server.calls('updatePlaylist')[0].params).toEqual(
			expect.objectContaining({
				playlistId: ['pl-1'],
				name: ['New'],
				comment: [''],
				public: ['true'],
				songIdToAdd: ['s1', 's2'],
				songIndexToRemove: ['0', '3'],
			}),
		);
	});
});
