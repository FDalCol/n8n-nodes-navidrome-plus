import type { INodeProperties } from 'n8n-workflow';
import { musicFolderIdOption, splitIntoItemsField } from '../../shared/descriptions';

const resource = ['search'];

export const searchOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource } },
		options: [
			{
				name: 'Search',
				value: 'search',
				description:
					'Search artists, albums and songs by name (simple auto-complete matching, no Lucene syntax)',
				action: 'Search the library',
			},
		],
		default: 'search',
	},
];

export const searchFields: INodeProperties[] = [
	{
		displayName: 'Query',
		name: 'query',
		type: 'string',
		default: '',
		description: 'Text to search for. Leave empty to page through the whole library.',
		displayOptions: { show: { resource, operation: ['search'] } },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: { resource, operation: ['search'] } },
		options: [
			{
				displayName: 'Album Count',
				name: 'albumCount',
				type: 'number',
				typeOptions: { minValue: 0 },
				default: 20,
				description: 'Maximum number of albums to return',
			},
			{
				displayName: 'Album Offset',
				name: 'albumOffset',
				type: 'number',
				typeOptions: { minValue: 0 },
				default: 0,
				description: 'Number of albums to skip, for paging',
			},
			{
				displayName: 'Artist Count',
				name: 'artistCount',
				type: 'number',
				typeOptions: { minValue: 0 },
				default: 20,
				description: 'Maximum number of artists to return',
			},
			{
				displayName: 'Artist Offset',
				name: 'artistOffset',
				type: 'number',
				typeOptions: { minValue: 0 },
				default: 0,
				description: 'Number of artists to skip, for paging',
			},
			musicFolderIdOption,
			{
				displayName: 'Song Count',
				name: 'songCount',
				type: 'number',
				typeOptions: { minValue: 0 },
				default: 20,
				description: 'Maximum number of songs to return',
			},
			{
				displayName: 'Song Offset',
				name: 'songOffset',
				type: 'number',
				typeOptions: { minValue: 0 },
				default: 0,
				description: 'Number of songs to skip, for paging',
			},
		],
	},
	splitIntoItemsField('search', ['search']),
];
