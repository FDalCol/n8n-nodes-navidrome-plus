import type { INodeProperties } from 'n8n-workflow';
import { splitIntoItemsField } from '../../shared/descriptions';

const resource = ['playlists'];

export const playlistsOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description:
					'Create a new playlist owned by the authenticated user, optionally with songs. Returns the created playlist.',
				action: 'Create a playlist',
			},
			{
				name: 'Delete',
				value: 'delete',
				description:
					'Permanently delete a playlist owned by the authenticated user. This cannot be undone.',
				action: 'Delete a playlist',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get a playlist with its songs',
				action: 'Get a playlist',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get the playlists visible to the authenticated user',
				action: 'Get many playlists',
			},
			{
				name: 'Update',
				value: 'update',
				description:
					'Modify a playlist: rename it, change its comment or visibility, append songs or remove songs by position',
				action: 'Update a playlist',
			},
		],
		default: 'getAll',
	},
];

export const playlistsFields: INodeProperties[] = [
	{
		displayName: 'Playlist ID',
		name: 'playlistId',
		type: 'string',
		required: true,
		default: '',
		description: 'ID of the playlist',
		displayOptions: { show: { resource, operation: ['get', 'update', 'delete'] } },
	},
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		required: true,
		default: '',
		description: 'Name of the new playlist',
		displayOptions: { show: { resource, operation: ['create'] } },
	},
	{
		displayName: 'Song IDs',
		name: 'songIds',
		type: 'string',
		default: '',
		placeholder: 'id1, id2, id3',
		description: 'Comma-separated IDs of the songs to put in the playlist, in order',
		displayOptions: { show: { resource, operation: ['create'] } },
	},
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource, operation: ['update'] } },
		options: [
			{
				displayName: 'Comment',
				name: 'comment',
				type: 'string',
				default: '',
				description: 'New comment (description) of the playlist',
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: 'New name of the playlist',
			},
			{
				displayName: 'Public',
				name: 'public',
				type: 'boolean',
				default: false,
				description: 'Whether the playlist is visible to all users',
			},
			{
				displayName: 'Song IDs to Add',
				name: 'songIdsToAdd',
				type: 'string',
				default: '',
				placeholder: 'id1, id2',
				description: 'Comma-separated IDs of songs to append at the end of the playlist',
			},
			{
				displayName: 'Song Indexes to Remove',
				name: 'songIndexesToRemove',
				type: 'string',
				default: '',
				placeholder: '0, 3',
				description:
					'Comma-separated zero-based positions of the songs to remove (as they are before this update)',
			},
		],
	},
	splitIntoItemsField('playlists', ['getAll']),
];
