import type { INodeProperties } from 'n8n-workflow';

const resource = ['lyrics'];

export const lyricsOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource } },
		options: [
			{
				name: 'Get Lyrics',
				value: 'getLyrics',
				description: 'Get the plain lyrics of a song, looked up by artist and title',
				action: 'Get lyrics by artist and title',
			},
			{
				name: 'Get Lyrics By Song ID',
				value: 'getLyricsBySongId',
				description:
					'Get the structured (possibly synced) lyrics of a song by ID (OpenSubsonic "songLyrics" extension)',
				action: 'Get lyrics by song ID',
			},
		],
		default: 'getLyricsBySongId',
	},
];

export const lyricsFields: INodeProperties[] = [
	{
		displayName: 'Artist',
		name: 'artist',
		type: 'string',
		default: '',
		description: 'Artist name',
		displayOptions: { show: { resource, operation: ['getLyrics'] } },
	},
	{
		displayName: 'Title',
		name: 'title',
		type: 'string',
		required: true,
		default: '',
		description: 'Song title',
		displayOptions: { show: { resource, operation: ['getLyrics'] } },
	},
	{
		displayName: 'Song ID',
		name: 'id',
		type: 'string',
		required: true,
		default: '',
		description: 'ID of the song',
		displayOptions: { show: { resource, operation: ['getLyricsBySongId'] } },
	},
];
