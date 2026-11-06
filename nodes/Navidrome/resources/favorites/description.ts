import type { INodeProperties } from 'n8n-workflow';

const resource = ['favorites'];

export const favoritesOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource } },
		options: [
			{
				name: 'Scrobble',
				value: 'scrobble',
				description:
					'Register that songs were played (updates play counts and external scrobblers) or set the "now playing" song',
				action: 'Scrobble songs',
			},
			{
				name: 'Set Rating',
				value: 'setRating',
				description: 'Set the rating (1-5) of a song, album or artist, or remove it with 0',
				action: 'Set a rating',
			},
			{
				name: 'Star',
				value: 'star',
				description: 'Add songs, albums or artists to the favorites of the authenticated user',
				action: 'Star items',
			},
			{
				name: 'Unstar',
				value: 'unstar',
				description: 'Remove songs, albums or artists from the favorites of the authenticated user',
				action: 'Unstar items',
			},
		],
		default: 'star',
	},
];

export const favoritesFields: INodeProperties[] = [
	{
		displayName: 'Item Type',
		name: 'itemType',
		type: 'options',
		default: 'song',
		description: 'Type of the items to star or unstar',
		displayOptions: { show: { resource, operation: ['star', 'unstar'] } },
		options: [
			{ name: 'Album', value: 'album' },
			{ name: 'Artist', value: 'artist' },
			{ name: 'Song', value: 'song' },
		],
	},
	{
		displayName: 'IDs',
		name: 'ids',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'id1, id2',
		description: 'Comma-separated IDs of the items',
		displayOptions: { show: { resource, operation: ['star', 'unstar'] } },
	},
	{
		displayName: 'ID',
		name: 'id',
		type: 'string',
		required: true,
		default: '',
		description: 'ID of the song, album or artist to rate',
		displayOptions: { show: { resource, operation: ['setRating'] } },
	},
	{
		displayName: 'Rating',
		name: 'rating',
		type: 'number',
		typeOptions: { minValue: 0, maxValue: 5 },
		required: true,
		default: 5,
		description: 'Rating from 1 to 5; 0 removes the rating',
		displayOptions: { show: { resource, operation: ['setRating'] } },
	},
	{
		displayName: 'Song IDs',
		name: 'songIds',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'id1, id2',
		description:
			'Comma-separated IDs of the songs to scrobble. For a "now playing" notification only the first ID is used.',
		displayOptions: { show: { resource, operation: ['scrobble'] } },
	},
	{
		displayName: 'Submission',
		name: 'submission',
		type: 'boolean',
		default: true,
		description:
			'Whether this is a real scrobble (song played, play count increased) instead of a "now playing" notification',
		displayOptions: { show: { resource, operation: ['scrobble'] } },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: { resource, operation: ['scrobble'] } },
		options: [
			{
				displayName: 'Timestamp',
				name: 'time',
				type: 'dateTime',
				default: '',
				description:
					'When the songs were played (applied to every song). Defaults to the current time on the server.',
			},
		],
	},
];
