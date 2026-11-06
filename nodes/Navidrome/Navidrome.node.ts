import type {
	ICredentialsDecrypted,
	ICredentialTestFunctions,
	IDataObject,
	IExecuteFunctions,
	INodeCredentialTestResult,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { bookmarksFields, bookmarksOperations } from './resources/bookmarks/description';
import { executeBookmarks } from './resources/bookmarks/execute';
import {
	customEndpointFields,
	customEndpointOperations,
} from './resources/customEndpoint/description';
import { executeCustomEndpoint } from './resources/customEndpoint/execute';
import { browsingFields, browsingOperations } from './resources/browsing/description';
import { executeBrowsing } from './resources/browsing/execute';
import { favoritesFields, favoritesOperations } from './resources/favorites/description';
import { executeFavorites } from './resources/favorites/execute';
import {
	internetRadioFields,
	internetRadioOperations,
} from './resources/internetRadio/description';
import { executeInternetRadio } from './resources/internetRadio/execute';
import { libraryFields, libraryOperations } from './resources/library/description';
import { executeLibrary } from './resources/library/execute';
import { listsFields, listsOperations } from './resources/lists/description';
import { executeLists } from './resources/lists/execute';
import { lyricsFields, lyricsOperations } from './resources/lyrics/description';
import { executeLyrics } from './resources/lyrics/execute';
import { playlistsFields, playlistsOperations } from './resources/playlists/description';
import { executePlaylists } from './resources/playlists/execute';
import { searchFields, searchOperations } from './resources/search/description';
import { executeSearch } from './resources/search/execute';
import { systemFields, systemOperations } from './resources/system/description';
import { executeSystem } from './resources/system/execute';
import { usersFields, usersOperations } from './resources/users/description';
import { executeUsers } from './resources/users/execute';
import type { ExecutionContext, ResourceExecutor } from './shared/utils';
import type { NativeSession } from './transport/nativeApi';
import { nativeLogin } from './transport/nativeApi';
import {
	buildSubsonicRequest,
	getNavidromeCredentials,
	parseSubsonicBody,
	toNavidromeCredentials,
} from './transport/subsonic';
import { redactSecrets, REQUEST_TIMEOUT_MS, validateBaseUrl } from './transport/security';

const EXECUTORS: Record<string, ResourceExecutor> = {
	bookmarks: executeBookmarks,
	browsing: executeBrowsing,
	customEndpoint: executeCustomEndpoint,
	favorites: executeFavorites,
	internetRadio: executeInternetRadio,
	library: executeLibrary,
	lists: executeLists,
	lyrics: executeLyrics,
	playlists: executePlaylists,
	search: executeSearch,
	system: executeSystem,
	users: executeUsers,
};

export class Navidrome implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Navidrome (Plus)',
		name: 'navidrome',
		icon: { light: 'file:navidrome.svg', dark: 'file:navidrome.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Manage a Navidrome music server: browse and search the library, playlists, favorites, radio, scans and users',
		defaults: { name: 'Navidrome (Plus)' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'navidromePlusApi',
				required: true,
				testedBy: 'navidromePlusApiTest',
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				// Labels follow the package spec; the n8n linter prefers singular names.
				/* eslint-disable n8n-nodes-base/node-param-resource-with-plural-option */
				options: [
					{ name: 'Bookmarks & Play Queue', value: 'bookmarks' },
					{ name: 'Browsing', value: 'browsing' },
					{ name: 'Custom Endpoint', value: 'customEndpoint' },
					{ name: 'Favorites & Ratings', value: 'favorites' },
					{ name: 'Internet Radio', value: 'internetRadio' },
					{ name: 'Library', value: 'library' },
					{ name: 'Lists', value: 'lists' },
					{ name: 'Lyrics', value: 'lyrics' },
					{ name: 'Playlists', value: 'playlists' },
					{ name: 'Search', value: 'search' },
					{ name: 'System', value: 'system' },
					{ name: 'Users', value: 'users' },
				],
				/* eslint-enable n8n-nodes-base/node-param-resource-with-plural-option */
				// Holds getNowPlaying: existing workflows without a resource parameter keep working.
				default: 'lists',
			},
			...bookmarksOperations,
			...bookmarksFields,
			...browsingOperations,
			...browsingFields,
			...customEndpointOperations,
			...customEndpointFields,
			...favoritesOperations,
			...favoritesFields,
			...internetRadioOperations,
			...internetRadioFields,
			...libraryOperations,
			...libraryFields,
			...listsOperations,
			...listsFields,
			...lyricsOperations,
			...lyricsFields,
			...playlistsOperations,
			...playlistsFields,
			...searchOperations,
			...searchFields,
			...systemOperations,
			...systemFields,
			...usersOperations,
			...usersFields,
		],
	};

	methods = {
		credentialTest: {
			async navidromePlusApiTest(
				this: ICredentialTestFunctions,
				credential: ICredentialsDecrypted,
			): Promise<INodeCredentialTestResult> {
				const credentials = toNavidromeCredentials((credential.data ?? {}) as IDataObject);
				if (!credentials.baseUrl) {
					return { status: 'Error', message: 'The Base URL is required' };
				}
				const invalid = validateBaseUrl(credentials.baseUrl);
				if (invalid) return { status: 'Error', message: invalid };

				const request = buildSubsonicRequest(credentials, 'ping');
				try {
					// Credential tests only expose helpers.request. Redirects are disabled so the
					// t/s pair never reaches another host.
					// eslint-disable-next-line @n8n/community-nodes/no-deprecated-workflow-functions
					const body: unknown = await this.helpers.request({
						method: 'GET',
						uri: request.url,
						json: true,
						timeout: REQUEST_TIMEOUT_MS,
						followRedirect: false,
						followAllRedirects: false,
					});
					const parsed = parseSubsonicBody(body);
					if (parsed.ok) {
						return { status: 'OK', message: 'Connection successful' };
					}
					return { status: 'Error', message: redactSecrets(parsed.message, request.secrets) };
				} catch (error) {
					return {
						status: 'Error',
						message: `Could not connect to Navidrome at ${credentials.baseUrl}: ${redactSecrets(
							(error as Error).message,
							request.secrets,
						)}`,
					};
				}
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		// One native API login per execution; a failed login is not retried.
		let sessionPromise: Promise<NativeSession> | undefined;
		const context: ExecutionContext = {
			getNativeSession: async (itemIndex: number) => {
				if (!sessionPromise) {
					sessionPromise = (async () => {
						const credentials = await getNavidromeCredentials.call(this, itemIndex);
						return await nativeLogin.call(this, credentials, itemIndex);
					})();
				}
				return await sessionPromise;
			},
		};

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				const executor = EXECUTORS[resource];
				if (!executor) {
					throw new NodeOperationError(this.getNode(), `Unsupported resource "${resource}"`, {
						itemIndex: i,
					});
				}

				const results = await executor.call(this, i, operation, context);
				for (const json of results) {
					returnData.push({ json, pairedItem: { item: i } });
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				// The constructor returns NodeOperationError instances unchanged.
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
