import type { INodeProperties } from 'n8n-workflow';

const resource = ['library'];

export const libraryOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource } },
		options: [
			{
				name: 'Get Scan Status',
				value: 'getScanStatus',
				description: 'Get the status of the media library scanner (scanning, counts, last scan)',
				action: 'Get the scan status',
			},
			{
				name: 'Start Scan',
				value: 'startScan',
				description:
					'Start a media library scan on the server (requires an administrator account). A full scan re-reads every file and can take a long time on large libraries.',
				action: 'Start a library scan',
			},
		],
		default: 'getScanStatus',
	},
];

export const libraryFields: INodeProperties[] = [
	{
		displayName: 'Scan Type',
		name: 'scanType',
		type: 'options',
		default: 'quick',
		description: 'How much of the library to scan',
		displayOptions: { show: { resource, operation: ['startScan'] } },
		options: [
			{
				name: 'Quick',
				value: 'quick',
				description: 'Only process new and modified files',
			},
			{
				name: 'Full',
				value: 'full',
				description: 'Re-read the whole library (fullScan=true)',
			},
		],
	},
	{
		displayName: 'Wait For Completion',
		name: 'waitForCompletion',
		type: 'boolean',
		default: false,
		description:
			'Whether to keep polling Get Scan Status until the scan has finished before returning',
		displayOptions: { show: { resource, operation: ['startScan'] } },
	},
	{
		displayName: 'Poll Interval (Seconds)',
		name: 'pollInterval',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 5,
		description: 'Seconds between two scan status checks (minimum 1)',
		displayOptions: {
			show: { resource, operation: ['startScan'], waitForCompletion: [true] },
		},
	},
	{
		displayName: 'Timeout (Seconds)',
		name: 'timeout',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 600,
		description:
			'Maximum time to wait (at most 24 hours). If the scan is still running after this time the node fails (the scan keeps running on the server).',
		displayOptions: {
			show: { resource, operation: ['startScan'], waitForCompletion: [true] },
		},
	},
];
