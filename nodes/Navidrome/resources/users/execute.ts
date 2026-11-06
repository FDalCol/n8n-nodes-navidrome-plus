import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { nativeApiRequest } from '../../transport/nativeApi';
import type { NativeSession } from '../../transport/nativeApi';
import type { ExecutionContext } from '../../shared/utils';
import { ensureArray, runSubsonicCall, splitBy, str } from '../../shared/utils';

const PAGE_SIZE = 100;

/** Safety cap (100 000 users) against servers that ignore paging. */
const MAX_PAGES = 1000;

const UPDATABLE_FIELDS = ['userName', 'name', 'email', 'isAdmin'] as const;

/** Not accepted by PUT /api/user/{id}. */
const NON_WRITABLE_FIELDS = ['libraries'];

/** Removed from output even if a server returns them. */
const SECRET_FIELDS = [
	'password',
	'currentPassword',
	'newPassword',
	'token',
	'subsonicToken',
	'subsonicSalt',
];

/** Allow-list: expressions could otherwise pass arbitrary sort clauses. */
const SORT_FIELDS = ['userName', 'name', 'createdAt', 'lastLoginAt', 'lastAccessAt'];
const SORT_ORDERS = ['ASC', 'DESC'];

export function sanitizeUser(user: IDataObject): IDataObject {
	const result: IDataObject = { ...user };
	for (const key of SECRET_FIELDS) delete result[key];
	return result;
}

/** "." and ".." are rejected: URL resolution would turn them into a parent path. */
function userPath(this: IExecuteFunctions, id: string, itemIndex: number): string {
	// eslint-disable-next-line no-control-regex
	if (/^\.{1,2}$/.test(id) || /[\u0000-\u001f\u007f]/.test(id)) {
		throw new NodeOperationError(this.getNode(), `Invalid user ID "${id}"`, { itemIndex });
	}
	return `/user/${encodeURIComponent(id)}`;
}

async function getNativeUser(
	this: IExecuteFunctions,
	session: NativeSession,
	id: string,
	itemIndex: number,
): Promise<IDataObject> {
	const { body } = await nativeApiRequest.call(
		this,
		session,
		'GET',
		userPath.call(this, id, itemIndex),
		itemIndex,
	);
	return sanitizeUser((body ?? {}) as IDataObject);
}

async function listNativeUsers(
	this: IExecuteFunctions,
	session: NativeSession,
	itemIndex: number,
	options: {
		limit: number;
		sort: string;
		order: string;
		stopWhen?: (user: IDataObject) => boolean;
	},
): Promise<IDataObject[]> {
	const users: IDataObject[] = [];
	const seenIds = new Set<string>();
	let start = 0;
	for (let pageNumber = 0; users.length < options.limit; pageNumber++) {
		if (pageNumber >= MAX_PAGES) {
			throw new NodeOperationError(
				this.getNode(),
				`Stopped listing users after ${MAX_PAGES} pages: the server keeps returning results`,
				{ itemIndex },
			);
		}
		const pageSize = Math.min(PAGE_SIZE, options.limit - users.length);
		const { body } = await nativeApiRequest.call(this, session, 'GET', '/user', itemIndex, {
			qs: { _start: start, _end: start + pageSize, _sort: options.sort, _order: options.order },
		});
		const page = ensureArray<IDataObject>(body);
		// Also stop when the server ignores paging (oversized or repeated pages).
		const fresh = page.filter((user) => !seenIds.has(str(user.id)));
		for (const user of fresh) seenIds.add(str(user.id));
		users.push(...fresh.slice(0, options.limit - users.length).map(sanitizeUser));
		if (options.stopWhen && fresh.some(options.stopWhen)) break;
		if (page.length === 0 || fresh.length === 0 || page.length !== pageSize) break;
		start += page.length;
	}
	return users;
}

async function findUserIdByUsername(
	this: IExecuteFunctions,
	session: NativeSession,
	username: string,
	itemIndex: number,
): Promise<string> {
	const wanted = username.toLowerCase();
	const matches = (user: IDataObject) => str(user.userName).toLowerCase() === wanted;
	const users = await listNativeUsers.call(this, session, itemIndex, {
		limit: Number.POSITIVE_INFINITY,
		sort: 'userName',
		order: 'ASC',
		stopWhen: matches,
	});
	const match = users.find(matches);
	if (match) return str(match.id);
	throw new NodeOperationError(this.getNode(), `Navidrome user "${username}" not found`, {
		itemIndex,
	});
}

async function resolveUserId(
	this: IExecuteFunctions,
	session: NativeSession,
	itemIndex: number,
): Promise<string> {
	const findBy = this.getNodeParameter('findUserBy', itemIndex, 'username') as string;
	if (findBy === 'id') {
		const id = str(this.getNodeParameter('userId', itemIndex));
		if (!id) {
			throw new NodeOperationError(this.getNode(), 'User ID must not be empty', { itemIndex });
		}
		return id;
	}
	const username = str(this.getNodeParameter('username', itemIndex));
	if (!username) {
		throw new NodeOperationError(this.getNode(), 'Username must not be empty', { itemIndex });
	}
	return await findUserIdByUsername.call(this, session, username, itemIndex);
}

/** PUT /api/user/{id} replaces the whole record, so start from the current one. */
async function putMergedUser(
	this: IExecuteFunctions,
	session: NativeSession,
	id: string,
	changes: IDataObject,
	itemIndex: number,
): Promise<IDataObject> {
	const current = await getNativeUser.call(this, session, id, itemIndex);
	const body: IDataObject = { ...current, ...changes };
	for (const key of NON_WRITABLE_FIELDS) delete body[key];
	const secrets = [changes.password, changes.currentPassword].filter(
		(value): value is string => typeof value === 'string',
	);
	await nativeApiRequest.call(this, session, 'PUT', userPath.call(this, id, itemIndex), itemIndex, {
		body,
		secrets,
	});
	return await getNativeUser.call(this, session, id, itemIndex);
}

export async function executeUsers(
	this: IExecuteFunctions,
	itemIndex: number,
	operation: string,
	context: ExecutionContext,
): Promise<IDataObject[]> {
	switch (operation) {
		case 'get': {
			const source = this.getNodeParameter('source', itemIndex, 'native') as string;
			if (source === 'subsonic') {
				return await runSubsonicCall.call(this, itemIndex, {
					endpoint: 'getUser',
					params: { username: str(this.getNodeParameter('username', itemIndex)) },
					pick: 'user',
					arrays: ['user.folder'],
				});
			}
			const session = await context.getNativeSession(itemIndex);
			const id = await resolveUserId.call(this, session, itemIndex);
			return [await getNativeUser.call(this, session, id, itemIndex)];
		}

		case 'getAll': {
			const source = this.getNodeParameter('source', itemIndex, 'native') as string;
			if (source === 'subsonic') {
				return await runSubsonicCall.call(this, itemIndex, {
					endpoint: 'getUsers',
					pick: 'users',
					arrays: ['users.user[].folder'],
					split: splitBy('user'),
				});
			}
			const session = await context.getNativeSession(itemIndex);
			const returnAll = this.getNodeParameter('returnAll', itemIndex, false) as boolean;
			const limit = returnAll
				? Number.POSITIVE_INFINITY
				: (this.getNodeParameter('limit', itemIndex, 50) as number);
			const options = this.getNodeParameter('options', itemIndex, {}) as IDataObject;
			const sort = (options.sort as string) || 'userName';
			const order = String(options.order || 'ASC').toUpperCase();
			if (!SORT_FIELDS.includes(sort) || !SORT_ORDERS.includes(order)) {
				throw new NodeOperationError(
					this.getNode(),
					`Invalid sort "${sort} ${order}". Allowed fields: ${SORT_FIELDS.join(', ')}; order: ASC or DESC.`,
					{ itemIndex },
				);
			}
			const users = await listNativeUsers.call(this, session, itemIndex, { limit, sort, order });
			const split = this.getNodeParameter('splitIntoItems', itemIndex, true) as boolean;
			return split ? users : [{ users }];
		}

		case 'create': {
			const session = await context.getNativeSession(itemIndex);
			const additional = this.getNodeParameter('additionalFields', itemIndex, {}) as IDataObject;
			const body: IDataObject = {
				userName: str(this.getNodeParameter('userName', itemIndex)),
				name: str(this.getNodeParameter('name', itemIndex)),
				password: String(this.getNodeParameter('password', itemIndex)),
				email: str(additional.email),
				isAdmin: additional.isAdmin === true,
			};
			const { body: created } = await nativeApiRequest.call(
				this,
				session,
				'POST',
				'/user',
				itemIndex,
				{ body, secrets: [body.password as string] },
			);
			const id = str((created as IDataObject | undefined)?.id);
			if (!id) return [{ success: true, userName: body.userName }];
			return [await getNativeUser.call(this, session, id, itemIndex)];
		}

		case 'update': {
			const session = await context.getNativeSession(itemIndex);
			const id = await resolveUserId.call(this, session, itemIndex);
			const fields = this.getNodeParameter('updateFields', itemIndex, {}) as IDataObject;
			const changes: IDataObject = {};
			for (const key of UPDATABLE_FIELDS) {
				if (fields[key] !== undefined) {
					changes[key] = typeof fields[key] === 'string' ? str(fields[key]) : fields[key];
				}
			}
			return [await putMergedUser.call(this, session, id, changes, itemIndex)];
		}

		case 'changePassword': {
			const session = await context.getNativeSession(itemIndex);
			const id = await resolveUserId.call(this, session, itemIndex);
			const newPassword = String(this.getNodeParameter('newPassword', itemIndex));
			if (newPassword === '') {
				throw new NodeOperationError(this.getNode(), 'New Password must not be empty', {
					itemIndex,
				});
			}
			const changes: IDataObject = { password: newPassword };
			const currentPassword = String(this.getNodeParameter('currentPassword', itemIndex, ''));
			if (currentPassword !== '') changes.currentPassword = currentPassword;
			const user = await putMergedUser.call(this, session, id, changes, itemIndex);
			return [{ success: true, passwordChanged: true, id, userName: user.userName }];
		}

		case 'delete': {
			const session = await context.getNativeSession(itemIndex);
			const id = await resolveUserId.call(this, session, itemIndex);
			await nativeApiRequest.call(
				this,
				session,
				'DELETE',
				userPath.call(this, id, itemIndex),
				itemIndex,
			);
			return [{ success: true, deleted: true, id }];
		}

		default:
			throw new NodeOperationError(this.getNode(), `Unsupported Users operation "${operation}"`, {
				itemIndex,
			});
	}
}
