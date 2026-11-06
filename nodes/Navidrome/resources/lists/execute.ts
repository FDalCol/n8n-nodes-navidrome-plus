import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import type { SubsonicParams } from '../../transport/subsonic';
import { subsonicRequest } from '../../transport/subsonic';
import {
	ensureArray,
	normalizeLists,
	optional,
	runSubsonicCall,
	splitBy,
	splitTypedLists,
	str,
} from '../../shared/utils';

export async function executeLists(
	this: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<IDataObject[]> {
	switch (operation) {
		case 'getAlbumList': {
			const listType = this.getNodeParameter('listType', itemIndex) as string;
			const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;
			const params: SubsonicParams = {
				type: listType,
				size: this.getNodeParameter('size', itemIndex) as number,
				offset: this.getNodeParameter('offset', itemIndex) as number,
				musicFolderId: optional(options.musicFolderId),
			};
			if (listType === 'byGenre') {
				params.genre = str(this.getNodeParameter('genre', itemIndex));
			}
			if (listType === 'byYear') {
				params.fromYear = this.getNodeParameter('fromYear', itemIndex) as number;
				params.toYear = this.getNodeParameter('toYear', itemIndex) as number;
			}
			return await runSubsonicCall.call(this, itemIndex, {
				endpoint: 'getAlbumList2',
				params,
				pick: 'albumList2',
				arrays: ['albumList2.album'],
				split: splitBy('album'),
			});
		}

		case 'getRandomSongs': {
			const filters = this.getNodeParameter('filters', itemIndex, {}) as IDataObject;
			return await runSubsonicCall.call(this, itemIndex, {
				endpoint: 'getRandomSongs',
				params: {
					size: this.getNodeParameter('size', itemIndex) as number,
					genre: optional(filters.genre),
					fromYear: filters.fromYear as number | undefined,
					toYear: filters.toYear as number | undefined,
					musicFolderId: optional(filters.musicFolderId),
				},
				pick: 'randomSongs',
				arrays: ['randomSongs.song'],
				split: splitBy('song'),
			});
		}

		case 'getSongsByGenre': {
			const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;
			return await runSubsonicCall.call(this, itemIndex, {
				endpoint: 'getSongsByGenre',
				params: {
					genre: str(this.getNodeParameter('genre', itemIndex)),
					count: this.getNodeParameter('count', itemIndex) as number,
					offset: this.getNodeParameter('offset', itemIndex) as number,
					musicFolderId: optional(options.musicFolderId),
				},
				pick: 'songsByGenre',
				arrays: ['songsByGenre.song'],
				split: splitBy('song'),
			});
		}

		case 'getStarred': {
			const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;
			return await runSubsonicCall.call(this, itemIndex, {
				endpoint: 'getStarred2',
				params: { musicFolderId: optional(options.musicFolderId) },
				pick: 'starred2',
				arrays: ['starred2.artist', 'starred2.album', 'starred2.song'],
				split: splitTypedLists,
			});
		}

		case 'getNowPlaying': {
			// Always one item, whatever Split Into Items says: existing workflows read playing/count.
			const maxMinutesAgo = Number(this.getNodeParameter('maxMinutesAgo', itemIndex, 0)) || 0;
			const response = await subsonicRequest.call(this, 'getNowPlaying', {}, itemIndex);
			normalizeLists(response, ['nowPlaying.entry']);
			const all = ensureArray<IDataObject>((response.nowPlaying as IDataObject).entry);
			const entries =
				maxMinutesAgo > 0
					? all.filter((entry) => Number(entry.minutesAgo ?? 0) <= maxMinutesAgo)
					: all;
			return [{ playing: entries.length > 0, count: entries.length, entries }];
		}

		default:
			throw new NodeOperationError(this.getNode(), `Unsupported Lists operation "${operation}"`, {
				itemIndex,
			});
	}
}
