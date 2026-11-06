import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError, sleep } from 'n8n-workflow';
import { subsonicRequest } from '../../transport/subsonic';
import { runSubsonicCall } from '../../shared/utils';

/** Enforced in code: UI limits can be bypassed by expressions or AI tool calls. */
const MIN_POLL_INTERVAL_MS = 1_000;
const MAX_WAIT_MS = 24 * 60 * 60 * 1000;

function scanStatusOf(response: IDataObject): IDataObject {
	return (response.scanStatus as IDataObject | undefined) ?? {};
}

function positiveSeconds(
	this: IExecuteFunctions,
	value: unknown,
	fieldName: string,
	itemIndex: number,
): number {
	const seconds = Number(value);
	if (!Number.isFinite(seconds) || seconds <= 0) {
		throw new NodeOperationError(
			this.getNode(),
			`"${fieldName}" must be a positive number of seconds`,
			{
				itemIndex,
			},
		);
	}
	return seconds;
}

async function waitForScan(
	this: IExecuteFunctions,
	initialStatus: IDataObject,
	itemIndex: number,
): Promise<IDataObject> {
	const intervalMs = Math.max(
		MIN_POLL_INTERVAL_MS,
		positiveSeconds.call(
			this,
			this.getNodeParameter('pollInterval', itemIndex, 5),
			'Poll Interval',
			itemIndex,
		) * 1000,
	);
	const timeoutMs = Math.min(
		MAX_WAIT_MS,
		positiveSeconds.call(
			this,
			this.getNodeParameter('timeout', itemIndex, 600),
			'Timeout',
			itemIndex,
		) * 1000,
	);

	const startedAt = Date.now();
	const deadline = startedAt + timeoutMs;
	let status = initialStatus;
	let polls = 0;

	while (status.scanning === true) {
		const remaining = deadline - Date.now();
		if (remaining <= 0) {
			throw new NodeOperationError(
				this.getNode(),
				`The library scan is still running after ${timeoutMs / 1000} seconds (timeout reached). The scan continues on the server.`,
				{ itemIndex, description: `Last status: ${JSON.stringify(status)}` },
			);
		}
		if (this.getExecutionCancelSignal?.()?.aborted) {
			throw new NodeOperationError(
				this.getNode(),
				'Execution cancelled while waiting for the scan',
				{
					itemIndex,
				},
			);
		}
		await sleep(Math.min(intervalMs, remaining));
		status = scanStatusOf(await subsonicRequest.call(this, 'getScanStatus', {}, itemIndex));
		polls++;
	}

	return {
		...status,
		waitedForCompletion: true,
		waitedSeconds: Math.round((Date.now() - startedAt) / 100) / 10,
		statusChecks: polls,
	};
}

export async function executeLibrary(
	this: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<IDataObject[]> {
	switch (operation) {
		case 'getScanStatus':
			return await runSubsonicCall.call(this, itemIndex, {
				endpoint: 'getScanStatus',
				pick: 'scanStatus',
			});

		case 'startScan': {
			const scanType = this.getNodeParameter('scanType', itemIndex, 'quick') as string;
			const response = await subsonicRequest.call(
				this,
				'startScan',
				// Navidrome treats an absent fullScan as false (quick scan).
				{ fullScan: scanType === 'full' ? true : undefined },
				itemIndex,
			);
			const status = scanStatusOf(response);
			const wait = this.getNodeParameter('waitForCompletion', itemIndex, false) as boolean;
			if (!wait) return [status];
			return [await waitForScan.call(this, status, itemIndex)];
		}

		default:
			throw new NodeOperationError(this.getNode(), `Unsupported Library operation "${operation}"`, {
				itemIndex,
			});
	}
}
