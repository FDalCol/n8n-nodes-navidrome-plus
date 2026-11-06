import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { subsonicRequest } from '../../transport/subsonic';
import { ensureArray, runSubsonicCall } from '../../shared/utils';

export async function executeSystem(
	this: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<IDataObject[]> {
	switch (operation) {
		case 'ping': {
			const response = await subsonicRequest.call(this, 'ping', {}, itemIndex);
			return [
				{
					status: response.status,
					version: response.version,
					type: response.type,
					serverVersion: response.serverVersion,
					openSubsonic: response.openSubsonic,
				},
			];
		}
		case 'getLicense':
			return await runSubsonicCall.call(this, itemIndex, {
				endpoint: 'getLicense',
				pick: 'license',
			});
		case 'getOpenSubsonicExtensions': {
			// The payload is a top-level array, not an object.
			const response = await subsonicRequest.call(this, 'getOpenSubsonicExtensions', {}, itemIndex);
			const extensions = ensureArray<IDataObject>(response.openSubsonicExtensions);
			const split = this.getNodeParameter('splitIntoItems', itemIndex, true) as boolean;
			return split ? extensions : [{ openSubsonicExtensions: extensions }];
		}
		default:
			throw new NodeOperationError(this.getNode(), `Unsupported System operation "${operation}"`, {
				itemIndex,
			});
	}
}
