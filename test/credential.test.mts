import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NavidromePlusApi } from '../credentials/NavidromePlusApi.credentials';
import { Navidrome } from '../nodes/Navidrome/Navidrome.node';
import { FakeNavidrome } from './support/fakeServer';
import { testCredential } from './support/context';

let server: FakeNavidrome;

beforeEach(async () => {
	server = await new FakeNavidrome().start();
});

afterEach(async () => {
	expect(server.violations).toEqual([]);
	await server.stop();
});

describe('credential', () => {
	it('declares the expected fields and is tested by the node', () => {
		const credential = new NavidromePlusApi();
		expect(credential.name).toBe('navidromePlusApi');
		expect(credential.displayName).toBe('Navidrome API (Plus)');
		expect(credential.properties.map((p) => p.name)).toEqual(['baseUrl', 'username', 'password']);
		expect(credential.properties[2].typeOptions?.password).toBe(true);
		expect(credential).not.toHaveProperty('test');

		const { description } = new Navidrome();
		expect(description).toMatchObject({
			name: 'navidrome',
			displayName: 'Navidrome (Plus)',
			version: 1,
			usableAsTool: true,
		});
		expect(description.credentials).toEqual([
			{ name: 'navidromePlusApi', required: true, testedBy: 'navidromePlusApiTest' },
		]);
	});

	it('returns OK for a valid authenticated ping (token, never p)', async () => {
		const result = await testCredential(`${server.baseUrl}///`);
		expect(result).toEqual({ status: 'OK', message: 'Connection successful' });
		const [ping] = server.calls('ping');
		expect(ping.params.p).toBeUndefined();
		expect(ping.params.t).toHaveLength(1);
	});

	it('returns Error for wrong credentials', async () => {
		const result = await testCredential(server.baseUrl, 'wrong');
		expect(result.status).toBe('Error');
		expect(result.message).toMatch(/Navidrome error 40/);
	});

	it('returns Error when the URL is not a Navidrome server or unreachable', async () => {
		const notFound = await testCredential(`${server.baseUrl}/not-navidrome`);
		expect(notFound.status).toBe('Error');

		const unreachable = await testCredential('http://127.0.0.1:1');
		expect(unreachable.status).toBe('Error');
		expect(unreachable.message).toMatch(/Could not connect/);
	});
});
