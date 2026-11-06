import type { INodeProperties } from 'n8n-workflow';
import { splitIntoItemsField } from '../../shared/descriptions';

const resource = ['internetRadio'];

export const internetRadioOperations: INodeProperties[] = [
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
				description: 'Add a new internet radio station (requires an administrator account)',
				action: 'Create an internet radio station',
			},
			{
				name: 'Delete',
				value: 'delete',
				description:
					'Permanently delete an internet radio station (requires an administrator account)',
				action: 'Delete an internet radio station',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Get many internet radio stations',
				action: 'Get many internet radio stations',
			},
			{
				name: 'Update',
				value: 'update',
				description:
					'Replace name, stream URL and homepage of an internet radio station (requires an administrator account)',
				action: 'Update an internet radio station',
			},
		],
		default: 'getAll',
	},
];

export const internetRadioFields: INodeProperties[] = [
	{
		displayName: 'Station ID',
		name: 'id',
		type: 'string',
		required: true,
		default: '',
		description: 'ID of the internet radio station',
		displayOptions: { show: { resource, operation: ['update', 'delete'] } },
	},
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		required: true,
		default: '',
		description: 'Name of the station',
		displayOptions: { show: { resource, operation: ['create', 'update'] } },
	},
	{
		displayName: 'Stream URL',
		name: 'streamUrl',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'https://stream.example.com/radio.mp3',
		description: 'URL of the audio stream',
		displayOptions: { show: { resource, operation: ['create', 'update'] } },
	},
	{
		displayName: 'Homepage URL',
		name: 'homepageUrl',
		type: 'string',
		default: '',
		placeholder: 'https://example.com',
		description:
			'Homepage of the station. On update, leaving it empty removes the current homepage.',
		displayOptions: { show: { resource, operation: ['create', 'update'] } },
	},
	splitIntoItemsField('internetRadio', ['getAll']),
];
