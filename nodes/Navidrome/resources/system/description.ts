import type { INodeProperties } from 'n8n-workflow';
import { splitIntoItemsField } from '../../shared/descriptions';

const showFor = { resource: ['system'] };

export const systemOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: showFor },
		options: [
			{
				name: 'Get License',
				value: 'getLicense',
				description: 'Get the license status of the server (always valid on Navidrome)',
				action: 'Get the server license',
			},
			{
				name: 'Get OpenSubsonic Extensions',
				value: 'getOpenSubsonicExtensions',
				description: 'List the OpenSubsonic extensions supported by the server',
				action: 'Get open subsonic extensions',
			},
			{
				name: 'Ping',
				value: 'ping',
				description: 'Check connectivity and credentials, and return the server version',
				action: 'Ping the server',
			},
		],
		default: 'ping',
	},
];

export const systemFields: INodeProperties[] = [
	splitIntoItemsField('system', ['getOpenSubsonicExtensions']),
];
