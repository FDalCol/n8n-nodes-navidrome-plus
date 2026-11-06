import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
	buildAuthParams,
	buildQueryString,
	buildSubsonicUrl,
	normalizeBaseUrl,
	parseSubsonicBody,
	toNavidromeCredentials,
} from '../nodes/Navidrome/transport/subsonic';
import { normalizeLists, optional, parseIdList } from '../nodes/Navidrome/shared/utils';
import { resolveEndpoint } from '../nodes/Navidrome/resources/customEndpoint/execute';

describe('Subsonic transport helpers', () => {
	it('normalizes the base URL', () => {
		expect(normalizeBaseUrl(' http://x:4533/// ')).toBe('http://x:4533');
		expect(normalizeBaseUrl('http://x/music/')).toBe('http://x/music');
		expect(normalizeBaseUrl(undefined)).toBe('');
	});

	it('builds token auth: t = md5(password + salt), 8-byte hex salt, common params, no p', () => {
		const auth = buildAuthParams('alice', 'pw');
		expect(auth.s).toMatch(/^[0-9a-f]{16}$/);
		expect(auth.t).toBe(
			createHash('md5')
				.update('pw' + auth.s)
				.digest('hex'),
		);
		expect(auth).toMatchObject({ u: 'alice', v: '1.16.1', c: 'n8n', f: 'json' });
		expect(auth).not.toHaveProperty('p');
	});

	it('uses a new salt on every call', () => {
		const salts = new Set(Array.from({ length: 50 }, () => buildAuthParams('a', 'b').s));
		expect(salts.size).toBe(50);
	});

	it('never puts the password in the URL', () => {
		const creds = toNavidromeCredentials({
			baseUrl: 'http://h/',
			username: 'u',
			password: 'Pa ss!',
		});
		const url = buildSubsonicUrl(creds, 'ping', { id: ['1', '2'] });
		expect(url.startsWith('http://h/rest/ping?')).toBe(true);
		expect(url).not.toContain('Pa ss!');
		expect(url).not.toContain(encodeURIComponent('Pa ss!'));
		expect(url).not.toMatch(/[?&]p=/);
	});

	it('serializes repeated parameters, omits undefined, keeps explicit empty strings', () => {
		const qs = buildQueryString({
			id: ['a', 'b', ''],
			x: '',
			y: undefined,
			n: null,
			z: 0,
			b: false,
		});
		expect(qs).toBe('id=a&id=b&x=&z=0&b=false');
	});

	it('parses ok, failed, unexpected and string bodies', () => {
		expect(parseSubsonicBody({ 'subsonic-response': { status: 'ok' } }).ok).toBe(true);
		const failed = parseSubsonicBody({
			'subsonic-response': { status: 'failed', error: { code: 40, message: 'Wrong' } },
		});
		expect(failed).toMatchObject({ ok: false, code: 40 });
		const html = parseSubsonicBody('<html/>', 404);
		expect(html.ok).toBe(false);
		if (!html.ok) expect(html.message).toMatch(/HTTP 404/);
		expect(parseSubsonicBody('{"subsonic-response":{"status":"ok"}}').ok).toBe(true);
	});
});

describe('shared utils', () => {
	it('normalizes single objects and missing keys into arrays', () => {
		const response: Record<string, unknown> = {
			albumList2: { album: { id: '1' } },
			artists: { index: { name: 'A', artist: { id: 'x' } } },
		};
		normalizeLists(response, [
			'albumList2.album',
			'artists.index[].artist',
			'starred2.song',
			'playlists.playlist',
		]);
		expect(response).toEqual({
			albumList2: { album: [{ id: '1' }] },
			artists: { index: [{ name: 'A', artist: [{ id: 'x' }] }] },
			starred2: { song: [] },
			playlists: { playlist: [] },
		});
	});

	it('parses ID lists and optional values', () => {
		expect(parseIdList(' a, b ,,c\nd ')).toEqual(['a', 'b', 'c', 'd']);
		expect(parseIdList(['x', ' y ', ''])).toEqual(['x', 'y']);
		expect(parseIdList(undefined)).toEqual([]);
		expect(optional('  ')).toBeUndefined();
		expect(optional(' 3 ')).toBe('3');
	});

	it('resolves relative custom endpoint names', () => {
		for (const input of [
			'getAlbumList2',
			'/rest/getAlbumList2',
			'rest/getAlbumList2.view',
			'getAlbumList2.view',
			' /rest/getAlbumList2.view ',
		]) {
			expect(resolveEndpoint(input, 'http://nd:4533')).toEqual({
				ok: true,
				endpoint: 'getAlbumList2',
			});
		}
	});
});
