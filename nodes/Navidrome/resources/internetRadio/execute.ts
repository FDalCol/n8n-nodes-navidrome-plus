import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { runSubsonicCall, splitBy, str } from '../../shared/utils';

export async function executeInternetRadio(
	this: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<IDataObject[]> {
	const stationFields = () => ({
		name: str(this.getNodeParameter('name', itemIndex)),
		streamUrl: str(this.getNodeParameter('streamUrl', itemIndex)),
		homepageUrl: str(this.getNodeParameter('homepageUrl', itemIndex, '')),
	});

	switch (operation) {
		case 'getAll':
			return await runSubsonicCall.call(this, itemIndex, {
				endpoint: 'getInternetRadioStations',
				pick: 'internetRadioStations',
				arrays: ['internetRadioStations.internetRadioStation'],
				split: splitBy('internetRadioStation'),
			});

		case 'create': {
			const fields = stationFields();
			return await runSubsonicCall.call(this, itemIndex, {
				endpoint: 'createInternetRadioStation',
				params: fields,
				emptyResult: { success: true, ...fields },
			});
		}

		case 'update': {
			const id = str(this.getNodeParameter('id', itemIndex));
			const fields = stationFields();
			return await runSubsonicCall.call(this, itemIndex, {
				endpoint: 'updateInternetRadioStation',
				params: { id, ...fields },
				emptyResult: { success: true, id, ...fields },
			});
		}

		case 'delete': {
			const id = str(this.getNodeParameter('id', itemIndex));
			return await runSubsonicCall.call(this, itemIndex, {
				endpoint: 'deleteInternetRadioStation',
				params: { id },
				emptyResult: { success: true, deleted: true, id },
			});
		}

		default:
			throw new NodeOperationError(
				this.getNode(),
				`Unsupported Internet Radio operation "${operation}"`,
				{ itemIndex },
			);
	}
}
