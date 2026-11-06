import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import type { NativeSession } from '../transport/nativeApi';
import type { SubsonicParams } from '../transport/subsonic';
import { subsonicRequest } from '../transport/subsonic';

export interface ExecutionContext {
	getNativeSession: (itemIndex: number) => Promise<NativeSession>;
}

export type ResourceExecutor = (
	this: IExecuteFunctions,
	itemIndex: number,
	operation: string,
	context: ExecutionContext,
) => Promise<IDataObject[]>;

/** Server metadata, not payload. */
const RESPONSE_METADATA_KEYS = ['status', 'version', 'type', 'serverVersion', 'openSubsonic'];

function isObject(value: unknown): value is IDataObject {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function ensureArray<T = IDataObject>(value: unknown): T[] {
	if (value === undefined || value === null) return [];
	return (Array.isArray(value) ? value : [value]) as T[];
}

function applyArrayPath(target: IDataObject, segments: string[]): void {
	const [head, ...rest] = segments;
	if (!head) return;
	const isArraySegment = head.endsWith('[]') || rest.length === 0;
	const key = head.replace(/\[\]$/, '');

	if (isArraySegment) {
		const list = ensureArray<unknown>(target[key]);
		target[key] = list as IDataObject[];
		if (rest.length > 0) {
			for (const element of list) {
				if (isObject(element)) applyArrayPath(element, rest);
			}
		}
		return;
	}

	if (!isObject(target[key])) target[key] = {};
	applyArrayPath(target[key] as IDataObject, rest);
}

/**
 * Paths are dot-separated; the last key is an array and `key[]` marks an intermediate array
 * (e.g. `artists.index[].artist`). Missing containers are created, so lists always exist.
 */
export function normalizeLists<T extends IDataObject>(root: T, paths: string[]): T {
	for (const path of paths) applyArrayPath(root, path.split('.'));
	return root;
}

export function stripResponseMetadata(response: IDataObject): IDataObject {
	const result: IDataObject = {};
	for (const [key, value] of Object.entries(response)) {
		if (!RESPONSE_METADATA_KEYS.includes(key)) result[key] = value;
	}
	return result;
}

export function parseIdList(value: unknown): string[] {
	const raw = Array.isArray(value) ? value : String(value ?? '').split(/[\n,]/);
	return raw.map((entry) => String(entry ?? '').trim()).filter((entry) => entry !== '');
}

export function parseIntegerList(
	this: IExecuteFunctions,
	value: unknown,
	fieldName: string,
	itemIndex: number,
): number[] {
	return parseIdList(value).map((entry) => {
		const parsed = Number(entry);
		if (!Number.isInteger(parsed) || parsed < 0) {
			throw new NodeOperationError(
				this.getNode(),
				`"${fieldName}" must contain non-negative integers, got "${entry}"`,
				{ itemIndex },
			);
		}
		return parsed;
	});
}

export function toEpochMillis(
	this: IExecuteFunctions,
	value: unknown,
	fieldName: string,
	itemIndex: number,
): number {
	const millis = typeof value === 'number' ? value : new Date(String(value as string)).getTime();
	if (!Number.isFinite(millis)) {
		throw new NodeOperationError(
			this.getNode(),
			`"${fieldName}" is not a valid date: ${String(value)}`,
			{
				itemIndex,
			},
		);
	}
	return millis;
}

export function requireNonEmptyList(
	this: IExecuteFunctions,
	list: unknown[],
	fieldName: string,
	itemIndex: number,
): void {
	if (list.length === 0) {
		throw new NodeOperationError(this.getNode(), `"${fieldName}" must contain at least one value`, {
			itemIndex,
		});
	}
}

export interface SubsonicCall {
	endpoint: string;
	params?: SubsonicParams;
	/** Paths relative to `subsonic-response`, see normalizeLists. */
	arrays?: string[];
	/** Payload key; when omitted, the whole response without metadata. */
	pick?: string;
	/** Used when Split Into Items is on. */
	split?: (payload: IDataObject) => IDataObject[];
	/** Output for operations whose response has no payload. */
	emptyResult?: IDataObject;
}

export async function runSubsonicCall(
	this: IExecuteFunctions,
	itemIndex: number,
	call: SubsonicCall,
): Promise<IDataObject[]> {
	const response = await subsonicRequest.call(this, call.endpoint, call.params ?? {}, itemIndex);
	normalizeLists(response, call.arrays ?? []);

	if (call.emptyResult) {
		return [call.emptyResult];
	}

	const payload: IDataObject =
		call.pick !== undefined
			? ((response[call.pick] as IDataObject | undefined) ?? {})
			: stripResponseMetadata(response);

	if (call.split) {
		const splitIntoItems = this.getNodeParameter('splitIntoItems', itemIndex, true) as boolean;
		if (splitIntoItems) return call.split(payload);
		return [call.pick !== undefined ? { [call.pick]: payload } : payload];
	}

	return [payload];
}

export function splitBy(key: string) {
	return (payload: IDataObject): IDataObject[] => ensureArray<IDataObject>(payload[key]);
}

/** search3 and getStarred2: one item per element, tagged with `resultType`. */
export function splitTypedLists(payload: IDataObject): IDataObject[] {
	const result: IDataObject[] = [];
	for (const type of ['artist', 'album', 'song']) {
		for (const element of ensureArray<IDataObject>(payload[type])) {
			result.push({ resultType: type, ...element });
		}
	}
	return result;
}

/** getArtists and getIndexes: one item per artist, with its index letter. */
export function splitArtistIndex(payload: IDataObject): IDataObject[] {
	const result: IDataObject[] = [];
	for (const index of ensureArray<IDataObject>(payload.index)) {
		for (const artist of ensureArray<IDataObject>(index.artist)) {
			result.push({ ...artist, index: index.name });
		}
	}
	return result;
}

/** Empty values become undefined, so the parameter is omitted. */
export function optional(value: unknown): string | undefined {
	const result = str(value);
	return result === '' ? undefined : result;
}

export function str(value: unknown): string {
	return String(value ?? '').trim();
}
