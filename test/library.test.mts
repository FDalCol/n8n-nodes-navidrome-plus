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

/** Scanner that reports `scanning: true` for the first `busyPolls` status checks. */
function scanner(busyPolls: number) {
	let polls = 0;
	server.handlers.startScan = (p) => ({
		scanStatus: { scanning: true, count: 0, scanType: p.fullScan ? 'full' : 'quick' },
	});
	server.handlers.getScanStatus = () => {
		polls++;
		const scanning = polls <= busyPolls;
		return { scanStatus: { scanning, count: scanning ? polls * 10 : 1234, folderCount: 56 } };
	};
}

describe('Start Scan', () => {
	it('Quick scan omits fullScan and returns the status immediately', async () => {
		scanner(0);
		const out = await runJson({
			baseUrl: server.baseUrl,
			params: { resource: 'library', operation: 'startScan', scanType: 'quick' },
		});
		expect(server.calls('startScan')[0].params.fullScan).toBeUndefined();
		expect(server.calls('getScanStatus')).toHaveLength(0);
		expect(out).toEqual([{ scanning: true, count: 0, scanType: 'quick' }]);
	});

	it('Full scan sends fullScan=true', async () => {
		scanner(0);
		await runJson({
			baseUrl: server.baseUrl,
			params: { resource: 'library', operation: 'startScan', scanType: 'full' },
		});
		expect(server.calls('startScan')[0].params.fullScan).toEqual(['true']);
	});

	it('Wait For Completion polls until the scan ends, at least 1 s apart (quick)', async () => {
		scanner(1);
		const out = await runJson({
			baseUrl: server.baseUrl,
			params: {
				resource: 'library',
				operation: 'startScan',
				scanType: 'quick',
				waitForCompletion: true,
				// Below the 1 s minimum: the code clamps it (UI limits can be bypassed).
				pollInterval: 0.001,
				timeout: 10,
			},
		});
		expect(server.calls('getScanStatus')).toHaveLength(2);
		expect(out[0]).toMatchObject({
			scanning: false,
			count: 1234,
			waitedForCompletion: true,
			statusChecks: 2,
		});
		expect(out[0].waitedSeconds as number).toBeGreaterThanOrEqual(1.9);
	});

	it('Wait For Completion works for a full scan too', async () => {
		scanner(0);
		const out = await runJson({
			baseUrl: server.baseUrl,
			params: {
				resource: 'library',
				operation: 'startScan',
				scanType: 'full',
				waitForCompletion: true,
				pollInterval: 1,
				timeout: 10,
			},
		});
		expect(server.calls('startScan')[0].params.fullScan).toEqual(['true']);
		expect(out[0]).toMatchObject({ scanning: false, waitedForCompletion: true });
	});

	it('does not poll when the scan already finished in the startScan response', async () => {
		server.handlers.startScan = () => ({ scanStatus: { scanning: false, count: 10 } });
		const out = await runJson({
			baseUrl: server.baseUrl,
			params: {
				resource: 'library',
				operation: 'startScan',
				waitForCompletion: true,
				pollInterval: 0.02,
				timeout: 5,
			},
		});
		expect(server.calls('getScanStatus')).toHaveLength(0);
		expect(out[0]).toMatchObject({ scanning: false, statusChecks: 0 });
	});

	it('fails with a clear error when the timeout is reached', async () => {
		scanner(Number.POSITIVE_INFINITY);
		const started = Date.now();
		await expect(
			runNode({
				baseUrl: server.baseUrl,
				params: {
					resource: 'library',
					operation: 'startScan',
					scanType: 'full',
					waitForCompletion: true,
					pollInterval: 1,
					timeout: 1.5,
				},
			}),
		).rejects.toThrow(/still running after 1.5 seconds/);
		expect(Date.now() - started).toBeLessThan(4000);
		expect(server.calls('getScanStatus')).toHaveLength(2);
	});

	it('Get Scan Status returns the scanner status', async () => {
		scanner(0);
		const out = await runJson({
			baseUrl: server.baseUrl,
			params: { resource: 'library', operation: 'getScanStatus' },
		});
		expect(out).toEqual([{ scanning: false, count: 1234, folderCount: 56 }]);
	});
});
