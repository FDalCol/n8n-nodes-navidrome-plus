import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import type { SubsonicParams } from '../../transport/subsonic';
import { parseIdList, parseIntegerList, runSubsonicCall, splitBy, str } from '../../shared/utils';

export async function executePlaylists(
	this: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<IDataObject[]> {
	const playlistId = () => str(this.getNodeParameter('playlistId', itemIndex));

	switch (operation) {
		case 'getAll':
			return await runSubsonicCall.call(this, itemIndex, {
				endpoint: 'getPlaylists',
				pick: 'playlists',
				arrays: ['playlists.playlist'],
				split: splitBy('playlist'),
			});

		case 'get':
			return await runSubsonicCall.call(this, itemIndex, {
				endpoint: 'getPlaylist',
				params: { id: playlistId() },
				pick: 'playlist',
				arrays: ['playlist.entry'],
			});

		case 'create':
			return await runSubsonicCall.call(this, itemIndex, {
				endpoint: 'createPlaylist',
				params: {
					name: str(this.getNodeParameter('name', itemIndex)),
					songId: parseIdList(this.getNodeParameter('songIds', itemIndex, '')),
				},
				pick: 'playlist',
				arrays: ['playlist.entry'],
			});

		case 'update': {
			const id = playlistId();
			const fields = this.getNodeParameter('updateFields', itemIndex, {}) as IDataObject;
			const params: SubsonicParams = { playlistId: id };
			if (fields.name !== undefined) params.name = str(fields.name);
			if (fields.comment !== undefined) params.comment = String(fields.comment);
			if (fields.public !== undefined) params.public = fields.public as boolean;
			const toAdd = parseIdList(fields.songIdsToAdd);
			const toRemove = parseIntegerList.call(
				this,
				fields.songIndexesToRemove,
				'Song Indexes to Remove',
				itemIndex,
			);
			if (toAdd.length) params.songIdToAdd = toAdd;
			if (toRemove.length) params.songIndexToRemove = toRemove;

			return await runSubsonicCall.call(this, itemIndex, {
				endpoint: 'updatePlaylist',
				params,
				emptyResult: {
					success: true,
					playlistId: id,
					songsAdded: toAdd.length,
					songsRemoved: toRemove.length,
				},
			});
		}

		case 'delete': {
			const id = playlistId();
			return await runSubsonicCall.call(this, itemIndex, {
				endpoint: 'deletePlaylist',
				params: { id },
				emptyResult: { success: true, deleted: true, playlistId: id },
			});
		}

		default:
			throw new NodeOperationError(
				this.getNode(),
				`Unsupported Playlists operation "${operation}"`,
				{
					itemIndex,
				},
			);
	}
}
