import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import {
	parseIdList,
	requireNonEmptyList,
	runSubsonicCall,
	splitBy,
	str,
	optional,
} from '../../shared/utils';

export async function executeBookmarks(
	this: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<IDataObject[]> {
	switch (operation) {
		case 'getBookmarks':
			return await runSubsonicCall.call(this, itemIndex, {
				endpoint: 'getBookmarks',
				pick: 'bookmarks',
				arrays: ['bookmarks.bookmark'],
				split: splitBy('bookmark'),
			});

		case 'createBookmark': {
			const id = str(this.getNodeParameter('id', itemIndex));
			const position = this.getNodeParameter('position', itemIndex) as number;
			const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;
			return await runSubsonicCall.call(this, itemIndex, {
				endpoint: 'createBookmark',
				params: { id, position, comment: options.comment as string | undefined },
				emptyResult: { success: true, id, position },
			});
		}

		case 'deleteBookmark': {
			const id = str(this.getNodeParameter('id', itemIndex));
			return await runSubsonicCall.call(this, itemIndex, {
				endpoint: 'deleteBookmark',
				params: { id },
				emptyResult: { success: true, deleted: true, id },
			});
		}

		case 'getPlayQueue':
			return await runSubsonicCall.call(this, itemIndex, {
				endpoint: 'getPlayQueue',
				pick: 'playQueue',
				arrays: ['playQueue.entry'],
			});

		case 'savePlayQueue': {
			const ids = parseIdList(this.getNodeParameter('songIds', itemIndex));
			requireNonEmptyList.call(this, ids, 'Song IDs', itemIndex);
			const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;
			const current = optional(options.current);
			return await runSubsonicCall.call(this, itemIndex, {
				endpoint: 'savePlayQueue',
				params: {
					id: ids,
					current,
					position: options.position as number | undefined,
				},
				emptyResult: {
					success: true,
					songIds: ids,
					...(current ? { current } : {}),
				},
			});
		}

		default:
			throw new NodeOperationError(
				this.getNode(),
				`Unsupported Bookmarks & Play Queue operation "${operation}"`,
				{ itemIndex },
			);
	}
}
