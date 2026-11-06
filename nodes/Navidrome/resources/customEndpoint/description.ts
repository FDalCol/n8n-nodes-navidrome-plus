import type { INodeProperties } from 'n8n-workflow';

const resource = ['customEndpoint'];

export const customEndpointOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource } },
		options: [
			{
				name: 'Call',
				value: 'call',
				description:
					'Call any JSON Subsonic endpoint supported by Navidrome with custom query parameters. Write endpoints change data on the server.',
				action: 'Call a custom endpoint',
			},
		],
		default: 'call',
	},
];

export const customEndpointFields: INodeProperties[] = [
	{
		displayName: 'Endpoint',
		name: 'endpoint',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'getAlbumList2',
		description:
			'Name of the Subsonic endpoint. "/rest/getAlbumList2", "getAlbumList2.view" and "getAlbumList2" are equivalent. Binary endpoints (stream, download, getCoverArt, getAvatar…) and shares are not supported.',
		displayOptions: { show: { resource, operation: ['call'] } },
	},
	{
		displayName: 'Query Parameters',
		name: 'queryParameters',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Parameter',
		default: {},
		description:
			'Parameters sent in the query string. Repeat a name to send multiple values. u, p, t and s are ignored (authentication is handled by the node); v, c and f are always set by the node.',
		displayOptions: { show: { resource, operation: ['call'] } },
		options: [
			{
				displayName: 'Parameter',
				name: 'parameter',
				values: [
					{
						displayName: 'Name',
						name: 'name',
						type: 'string',
						default: '',
						description: 'Name of the query parameter',
					},
					{
						displayName: 'Value',
						name: 'value',
						type: 'string',
						default: '',
						description: 'Value of the query parameter',
					},
				],
			},
		],
	},
];
