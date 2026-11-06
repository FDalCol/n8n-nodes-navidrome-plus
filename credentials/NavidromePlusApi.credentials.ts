import type { ICredentialType, INodeProperties } from 'n8n-workflow';

/**
 * Authentication is done by the node, not declaratively: Subsonic needs a fresh salt per
 * request and the native API a JWT from POST /auth/login. Tested by navidromePlusApiTest.
 */
export class NavidromePlusApi implements ICredentialType {
	name = 'navidromePlusApi';

	// Name required by the package spec; the linter wants it to end with "API".
	// eslint-disable-next-line n8n-nodes-base/cred-class-field-display-name-missing-api
	displayName = 'Navidrome API (Plus)';

	icon = 'file:navidromeApi.svg' as const;

	documentationUrl = 'https://www.navidrome.org/docs/developers/subsonic-api/';

	properties: INodeProperties[] = [
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: '',
			placeholder: 'http://navidrome:4533',
			required: true,
			description:
				'Base URL of the Navidrome server, including the BasePath if one is configured (e.g. http://navidrome:4533). Trailing slashes are removed automatically.',
		},
		{
			displayName: 'Username',
			name: 'username',
			type: 'string',
			default: '',
			required: true,
		},
		{
			displayName: 'Password',
			name: 'password',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Password of the Navidrome user. It is only used to compute the per-request Subsonic token and for the native API login body; it is never sent in a URL.',
		},
	];
}
