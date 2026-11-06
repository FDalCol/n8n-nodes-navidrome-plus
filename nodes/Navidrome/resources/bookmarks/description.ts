import type { INodeProperties } from 'n8n-workflow';
import { splitIntoItemsField } from '../../shared/descriptions';

const resource = ['bookmarks'];

export const bookmarksOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource } },
		options: [
			{
				name: 'Create Bookmark',
				value: 'createBookmark',
				description:
					'Create or replace the bookmark (saved playback position) of the authenticated user on a song',
				action: 'Create a bookmark',
			},
			{
				name: 'Delete Bookmark',
				value: 'deleteBookmark',
				description: 'Delete the bookmark of the authenticated user on a song',
				action: 'Delete a bookmark',
			},
			{
				name: 'Get Bookmarks',
				value: 'getBookmarks',
				description: 'Get all bookmarks of the authenticated user',
				action: 'Get bookmarks',
			},
			{
				name: 'Get Play Queue',
				value: 'getPlayQueue',
				description: 'Get the saved play queue of the authenticated user',
				action: 'Get the play queue',
			},
			{
				name: 'Save Play Queue',
				value: 'savePlayQueue',
				description:
					'Replace the saved play queue of the authenticated user with the given songs, current song and position',
				action: 'Save the play queue',
			},
		],
		default: 'getBookmarks',
	},
];

export const bookmarksFields: INodeProperties[] = [
	{
		displayName: 'Song ID',
		name: 'id',
		type: 'string',
		required: true,
		default: '',
		description: 'ID of the song',
		displayOptions: { show: { resource, operation: ['createBookmark', 'deleteBookmark'] } },
	},
	{
		displayName: 'Position (Ms)',
		name: 'position',
		type: 'number',
		typeOptions: { minValue: 0 },
		required: true,
		default: 0,
		description: 'Playback position within the song, in milliseconds',
		displayOptions: { show: { resource, operation: ['createBookmark'] } },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: { resource, operation: ['createBookmark'] } },
		options: [
			{
				displayName: 'Comment',
				name: 'comment',
				type: 'string',
				default: '',
				description: 'Comment attached to the bookmark',
			},
		],
	},
	{
		displayName: 'Song IDs',
		name: 'songIds',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'id1, id2, id3',
		description: 'Comma-separated IDs of the songs in the queue, in order',
		displayOptions: { show: { resource, operation: ['savePlayQueue'] } },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: { resource, operation: ['savePlayQueue'] } },
		options: [
			{
				displayName: 'Current Song ID',
				name: 'current',
				type: 'string',
				default: '',
				description: 'ID of the song currently playing (must be one of the Song IDs)',
			},
			{
				displayName: 'Position (Ms)',
				name: 'position',
				type: 'number',
				typeOptions: { minValue: 0 },
				default: 0,
				description: 'Playback position within the current song, in milliseconds',
			},
		],
	},
	splitIntoItemsField('bookmarks', ['getBookmarks']),
];
