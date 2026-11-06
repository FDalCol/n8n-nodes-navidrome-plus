import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { runSubsonicCall, splitTypedLists, str, optional } from '../../shared/utils';

export async function executeSearch(
	this: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<IDataObject[]> {
	if (operation !== 'search') {
		throw new NodeOperationError(this.getNode(), `Unsupported Search operation "${operation}"`, {
			itemIndex,
		});
	}

	const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;
	const query = str(this.getNodeParameter('query', itemIndex, ''));
	return await runSubsonicCall.call(this, itemIndex, {
		endpoint: 'search3',
		params: {
			// Navidrome treats an empty quoted query ("") as "match everything".
			query: query === '' ? '""' : query,
			artistCount: options.artistCount as number | undefined,
			artistOffset: options.artistOffset as number | undefined,
			albumCount: options.albumCount as number | undefined,
			albumOffset: options.albumOffset as number | undefined,
			songCount: options.songCount as number | undefined,
			songOffset: options.songOffset as number | undefined,
			musicFolderId: optional(options.musicFolderId),
		},
		pick: 'searchResult3',
		arrays: ['searchResult3.artist', 'searchResult3.album', 'searchResult3.song'],
		split: splitTypedLists,
	});
}
