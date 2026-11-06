import type { INodeProperties } from 'n8n-workflow';

export function splitIntoItemsField(resource: string, operations: string[]): INodeProperties {
	return {
		displayName: 'Split Into Items',
		name: 'splitIntoItems',
		type: 'boolean',
		default: true,
		description:
			'Whether to output one n8n item per element of the returned list instead of a single item containing the whole list',
		displayOptions: { show: { resource: [resource], operation: operations } },
	};
}

export const musicFolderIdOption: INodeProperties = {
	displayName: 'Music Folder ID',
	name: 'musicFolderId',
	type: 'string',
	default: '',
	description:
		'Only return results from this music folder (Navidrome library). Get the IDs with Browsing → Get Music Folders.',
};
