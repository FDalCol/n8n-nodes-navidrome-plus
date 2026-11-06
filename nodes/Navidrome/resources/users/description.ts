import type { IDisplayOptions, INodeProperties } from 'n8n-workflow';
import { splitIntoItemsField } from '../../shared/descriptions';

const resource = ['users'];
const NATIVE_OPERATIONS = ['update', 'changePassword', 'delete'];

function userSelectionFields(show: NonNullable<IDisplayOptions['show']>): INodeProperties[] {
	return [
		{
			displayName: 'Find User By',
			name: 'findUserBy',
			type: 'options',
			default: 'username',
			options: [
				{ name: 'Username', value: 'username' },
				{ name: 'ID', value: 'id' },
			],
			description:
				'How to identify the user. A username is resolved to its ID by listing users through the native API (requires an administrator account).',
			displayOptions: { show },
		},
		{
			displayName: 'Username',
			name: 'username',
			type: 'string',
			required: true,
			default: '',
			description: 'Login name of the user (case-insensitive)',
			displayOptions: { show: { ...show, findUserBy: ['username'] } },
		},
		{
			displayName: 'User ID',
			name: 'userId',
			type: 'string',
			required: true,
			default: '',
			description: 'Internal ID of the user (as returned by Get Many with Source = Native API)',
			displayOptions: { show: { ...show, findUserBy: ['id'] } },
		},
	];
}

export const usersOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource } },
		options: [
			{
				name: 'Change Password',
				value: 'changePassword',
				description:
					'Set a new password for a Navidrome user via the native API (requires an administrator account; the password is sent in a POST/PUT body, use HTTPS)',
				action: 'Change a user password',
			},
			{
				name: 'Create',
				value: 'create',
				description:
					'Create a new Navidrome user account via the native API (requires an administrator account)',
				action: 'Create a user',
			},
			{
				name: 'Delete',
				value: 'delete',
				description:
					'Permanently delete a Navidrome user account and its data via the native API (requires an administrator account). This cannot be undone.',
				action: 'Delete a user',
			},
			{
				name: 'Get',
				value: 'get',
				description:
					'Get a Navidrome user by username or ID (native API), or the roles of the authenticated user (Subsonic)',
				action: 'Get a user',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description:
					'List Navidrome users via the native API, or via Subsonic getUsers (which Navidrome limits to the authenticated user). Both require an administrator account.',
				action: 'Get many users',
			},
			{
				name: 'Update',
				value: 'update',
				description:
					'Change username, name, email or admin flag of a Navidrome user via the native API (requires an administrator account). Fields not set are kept unchanged.',
				action: 'Update a user',
			},
		],
		default: 'get',
	},
];

export const usersFields: INodeProperties[] = [
	{
		displayName: 'Source',
		name: 'source',
		type: 'options',
		default: 'native',
		options: [
			{
				name: 'Native API',
				value: 'native',
				description:
					'Navidrome REST API (/api/user): full user records with IDs. Requires an administrator account, except reading your own user by ID.',
			},
			{
				name: 'Subsonic',
				value: 'subsonic',
				description:
					'Subsonic getUser/getUsers: roles of the authenticated user only. Get works without an administrator account; Get Many does not.',
			},
		],
		description: 'Which Navidrome API to read users from',
		displayOptions: { show: { resource, operation: ['get', 'getAll'] } },
	},
	{
		displayName: 'Username',
		name: 'username',
		type: 'string',
		required: true,
		default: '',
		description:
			'Username to look up. Navidrome only allows the username of the authenticated user (others fail with error 50).',
		displayOptions: { show: { resource, operation: ['get'], source: ['subsonic'] } },
	},
	...userSelectionFields({ resource, operation: ['get'], source: ['native'] }),
	...userSelectionFields({ resource, operation: NATIVE_OPERATIONS }),

	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: { show: { resource, operation: ['getAll'], source: ['native'] } },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		description: 'Max number of results to return',
		displayOptions: {
			show: { resource, operation: ['getAll'], source: ['native'], returnAll: [false] },
		},
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: { resource, operation: ['getAll'], source: ['native'] } },
		options: [
			{
				displayName: 'Sort By',
				name: 'sort',
				type: 'options',
				default: 'userName',
				options: [
					{ name: 'Created At', value: 'createdAt' },
					{ name: 'Last Access At', value: 'lastAccessAt' },
					{ name: 'Last Login At', value: 'lastLoginAt' },
					{ name: 'Name', value: 'name' },
					{ name: 'Username', value: 'userName' },
				],
				description: 'Field used to sort the users',
			},
			{
				displayName: 'Sort Order',
				name: 'order',
				type: 'options',
				default: 'ASC',
				options: [
					{ name: 'Ascending', value: 'ASC' },
					{ name: 'Descending', value: 'DESC' },
				],
				description: 'Sort direction',
			},
		],
	},
	{
		displayName: 'Username',
		name: 'userName',
		type: 'string',
		required: true,
		default: '',
		description: 'Login name of the new user (must be unique)',
		displayOptions: { show: { resource, operation: ['create'] } },
	},
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		required: true,
		default: '',
		description: 'Display name of the new user',
		displayOptions: { show: { resource, operation: ['create'] } },
	},
	{
		displayName: 'Password',
		name: 'password',
		type: 'string',
		typeOptions: { password: true },
		required: true,
		default: '',
		description: 'Password of the new user (sent only in the JSON body)',
		displayOptions: { show: { resource, operation: ['create'] } },
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource, operation: ['create'] } },
		options: [
			{
				displayName: 'Email',
				name: 'email',
				type: 'string',
				placeholder: 'name@email.com',
				default: '',
				description: 'Email address of the user',
			},
			{
				displayName: 'Is Admin',
				name: 'isAdmin',
				type: 'boolean',
				default: false,
				description: 'Whether the user is an administrator',
			},
		],
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
				displayName: 'Email',
				name: 'email',
				type: 'string',
				placeholder: 'name@email.com',
				default: '',
				description: 'New email address of the user',
			},
			{
				displayName: 'Is Admin',
				name: 'isAdmin',
				type: 'boolean',
				default: false,
				description: 'Whether the user is an administrator',
			},
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				description: 'New display name of the user',
			},
			{
				displayName: 'Username',
				name: 'userName',
				type: 'string',
				default: '',
				description: 'New login name of the user (must be unique)',
			},
		],
	},
	{
		displayName: 'New Password',
		name: 'newPassword',
		type: 'string',
		typeOptions: { password: true },
		required: true,
		default: '',
		description: 'New password of the user (sent only in the JSON body)',
		displayOptions: { show: { resource, operation: ['changePassword'] } },
	},
	{
		displayName: 'Current Password',
		name: 'currentPassword',
		type: 'string',
		typeOptions: { password: true },
		default: '',
		description:
			"Current password. Navidrome requires it only when the credential's own user changes their password; leave empty when an administrator changes another user's password.",
		displayOptions: { show: { resource, operation: ['changePassword'] } },
	},
	splitIntoItemsField('users', ['getAll']),
];
