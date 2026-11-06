import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import {
	runSubsonicCall,
	splitArtistIndex,
	splitBy,
	str,
	toEpochMillis,
	optional,
} from '../../shared/utils';

export async function executeBrowsing(
	this: IExecuteFunctions,
	itemIndex: number,
	operation: string,
): Promise<IDataObject[]> {
	const id = () => str(this.getNodeParameter('id', itemIndex));
	const options = () => this.getNodeParameter('options', itemIndex, {}) as IDataObject;

	switch (operation) {
		case 'getMusicFolders':
			return await runSubsonicCall.call(this, itemIndex, {
				endpoint: 'getMusicFolders',
				pick: 'musicFolders',
				arrays: ['musicFolders.musicFolder'],
				split: splitBy('musicFolder'),
			});

		case 'getIndexes': {
			const opts = options();
			return await runSubsonicCall.call(this, itemIndex, {
				endpoint: 'getIndexes',
				params: {
					musicFolderId: optional(opts.musicFolderId),
					ifModifiedSince: opts.ifModifiedSince
						? toEpochMillis.call(this, opts.ifModifiedSince, 'If Modified Since', itemIndex)
						: undefined,
				},
				pick: 'indexes',
				arrays: ['indexes.index[].artist', 'indexes.shortcut', 'indexes.child'],
				split: splitArtistIndex,
			});
		}

		case 'getMusicDirectory':
			return await runSubsonicCall.call(this, itemIndex, {
				endpoint: 'getMusicDirectory',
				params: { id: id() },
				pick: 'directory',
				arrays: ['directory.child'],
			});

		case 'getGenres':
			return await runSubsonicCall.call(this, itemIndex, {
				endpoint: 'getGenres',
				pick: 'genres',
				arrays: ['genres.genre'],
				split: splitBy('genre'),
			});

		case 'getArtists':
			return await runSubsonicCall.call(this, itemIndex, {
				endpoint: 'getArtists',
				params: { musicFolderId: optional(options().musicFolderId) },
				pick: 'artists',
				arrays: ['artists.index[].artist'],
				split: splitArtistIndex,
			});

		case 'getArtist':
			return await runSubsonicCall.call(this, itemIndex, {
				endpoint: 'getArtist',
				params: { id: id() },
				pick: 'artist',
				arrays: ['artist.album'],
			});

		case 'getAlbum':
			return await runSubsonicCall.call(this, itemIndex, {
				endpoint: 'getAlbum',
				params: { id: id() },
				pick: 'album',
				arrays: ['album.song'],
			});

		case 'getSong':
			return await runSubsonicCall.call(this, itemIndex, {
				endpoint: 'getSong',
				params: { id: id() },
				pick: 'song',
			});

		case 'getArtistInfo': {
			const opts = options();
			return await runSubsonicCall.call(this, itemIndex, {
				endpoint: 'getArtistInfo2',
				params: {
					id: id(),
					count: opts.count as number | undefined,
					includeNotPresent: opts.includeNotPresent as boolean | undefined,
				},
				pick: 'artistInfo2',
				arrays: ['artistInfo2.similarArtist'],
			});
		}

		case 'getAlbumInfo':
			return await runSubsonicCall.call(this, itemIndex, {
				endpoint: 'getAlbumInfo2',
				params: { id: id() },
				pick: 'albumInfo',
			});

		case 'getSimilarSongs':
			return await runSubsonicCall.call(this, itemIndex, {
				endpoint: 'getSimilarSongs',
				params: { id: id(), count: this.getNodeParameter('count', itemIndex) as number },
				pick: 'similarSongs',
				arrays: ['similarSongs.song'],
				split: splitBy('song'),
			});

		case 'getTopSongs': {
			const findBy = this.getNodeParameter('findBy', itemIndex) as string;
			const params =
				findBy === 'id'
					? { id: str(this.getNodeParameter('artistId', itemIndex)) }
					: { artist: str(this.getNodeParameter('artist', itemIndex)) };
			return await runSubsonicCall.call(this, itemIndex, {
				endpoint: 'getTopSongs',
				params: { ...params, count: this.getNodeParameter('count', itemIndex) as number },
				pick: 'topSongs',
				arrays: ['topSongs.song'],
				split: splitBy('song'),
			});
		}

		default:
			throw new NodeOperationError(
				this.getNode(),
				`Unsupported Browsing operation "${operation}"`,
				{
					itemIndex,
				},
			);
	}
}
