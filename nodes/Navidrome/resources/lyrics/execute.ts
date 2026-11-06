import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { runSubsonicCall, str } from '../../shared/utils';

export async function executeLyrics(
	this: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<IDataObject[]> {
	switch (operation) {
		case 'getLyrics':
			return await runSubsonicCall.call(this, itemIndex, {
				endpoint: 'getLyrics',
				params: {
					artist: str(this.getNodeParameter('artist', itemIndex, '')),
					title: str(this.getNodeParameter('title', itemIndex)),
				},
				pick: 'lyrics',
			});

		case 'getLyricsBySongId':
			return await runSubsonicCall.call(this, itemIndex, {
				endpoint: 'getLyricsBySongId',
				params: { id: str(this.getNodeParameter('id', itemIndex)) },
				pick: 'lyricsList',
				arrays: [
					'lyricsList.structuredLyrics[].line',
					'lyricsList.structuredLyrics[].agents',
					'lyricsList.structuredLyrics[].cueLine',
				],
			});

		default:
			throw new NodeOperationError(this.getNode(), `Unsupported Lyrics operation "${operation}"`, {
				itemIndex,
			});
	}
}
