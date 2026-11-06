import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import {
	parseIdList,
	requireNonEmptyList,
	runSubsonicCall,
	str,
	toEpochMillis,
} from '../../shared/utils';

const STAR_PARAM_BY_TYPE: Record<string, string> = {
	song: 'id',
	album: 'albumId',
	artist: 'artistId',
};

export async function executeFavorites(
	this: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<IDataObject[]> {
	switch (operation) {
		case 'star':
		case 'unstar': {
			const itemType = this.getNodeParameter('itemType', itemIndex) as string;
			const param = STAR_PARAM_BY_TYPE[itemType];
			if (!param) {
				throw new NodeOperationError(this.getNode(), `Unsupported item type "${itemType}"`, {
					itemIndex,
				});
			}
			const ids = parseIdList(this.getNodeParameter('ids', itemIndex));
			requireNonEmptyList.call(this, ids, 'IDs', itemIndex);
			return await runSubsonicCall.call(this, itemIndex, {
				endpoint: operation,
				params: { [param]: ids },
				emptyResult: { success: true, operation, itemType, ids },
			});
		}

		case 'setRating': {
			const id = str(this.getNodeParameter('id', itemIndex));
			const rating = this.getNodeParameter('rating', itemIndex) as number;
			if (!Number.isInteger(rating) || rating < 0 || rating > 5) {
				throw new NodeOperationError(
					this.getNode(),
					`Rating must be an integer between 0 and 5, got ${rating}`,
					{ itemIndex },
				);
			}
			return await runSubsonicCall.call(this, itemIndex, {
				endpoint: 'setRating',
				params: { id, rating },
				emptyResult: { success: true, id, rating },
			});
		}

		case 'scrobble': {
			const ids = parseIdList(this.getNodeParameter('songIds', itemIndex));
			requireNonEmptyList.call(this, ids, 'Song IDs', itemIndex);
			const submission = this.getNodeParameter('submission', itemIndex, true) as boolean;
			const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;
			const time = options.time
				? toEpochMillis.call(this, options.time, 'Timestamp', itemIndex)
				: undefined;
			return await runSubsonicCall.call(this, itemIndex, {
				endpoint: 'scrobble',
				params: {
					id: ids,
					submission,
					// Navidrome requires one timestamp per ID when timestamps are sent.
					time: time !== undefined ? ids.map(() => time) : undefined,
				},
				emptyResult: {
					success: true,
					submission,
					ids,
					...(time !== undefined ? { time } : {}),
				},
			});
		}

		default:
			throw new NodeOperationError(
				this.getNode(),
				`Unsupported Favorites & Ratings operation "${operation}"`,
				{ itemIndex },
			);
	}
}
