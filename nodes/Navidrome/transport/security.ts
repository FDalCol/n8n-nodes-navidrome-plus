export const REQUEST_TIMEOUT_MS = 30_000;

const MAX_SERVER_TEXT = 300;

const REDACTED = '[REDACTED]';

/** Removes known secrets, auth parameters, URL query strings and Bearer tokens. */
export function redactSecrets(text: unknown, secrets: Array<string | undefined> = []): string {
	let out = String(text ?? '');
	const known = secrets
		.filter((secret): secret is string => typeof secret === 'string' && secret.length >= 3)
		.sort((a, b) => b.length - a.length);
	for (const secret of known) {
		out = out.split(secret).join(REDACTED);
		const encoded = encodeURIComponent(secret);
		if (encoded !== secret) out = out.split(encoded).join(REDACTED);
	}
	out = out.replace(/([?&;](?:u|p|t|s|apiKey|token|jwt|password)=)[^&\s#'"]*/gi, `$1${REDACTED}`);
	out = out.replace(
		/(\b(?:password|passwd|pwd|token|jwt|apiKey|secret)['"]?\s*[=:]\s*['"]?)[^&\s,;'"}]+/gi,
		`$1${REDACTED}`,
	);
	// URL query strings carry the Subsonic token and salt.
	out = out.replace(/(https?:\/\/[^\s?#'"]+)\?[^\s#'"]*/gi, '$1');
	out = out.replace(/(bearer\s+)[A-Za-z0-9._~+/=-]+/gi, `$1${REDACTED}`);
	return out;
}

export function safeServerText(text: unknown, secrets: Array<string | undefined> = []): string {
	const redacted = redactSecrets(text, secrets).replace(/\s+/g, ' ').trim();
	return redacted.length > MAX_SERVER_TEXT ? `${redacted.slice(0, MAX_SERVER_TEXT)}…` : redacted;
}

export function validateBaseUrl(baseUrl: string): string | undefined {
	// Raw text check: new URL() reports an empty search/hash for a bare "?" or "#".
	if (/[?#]/.test(baseUrl)) {
		return 'The Base URL of the credential must not contain a query string or fragment.';
	}
	let url: URL;
	try {
		url = new URL(baseUrl);
	} catch {
		return 'The Base URL of the credential is not a valid URL (e.g. https://music.example.com).';
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		return 'The Base URL of the credential must start with http:// or https://.';
	}
	if (url.username || url.password) {
		return 'The Base URL of the credential must not contain a username or password.';
	}
	if (url.search || url.hash) {
		return 'The Base URL of the credential must not contain a query string or fragment.';
	}
	return undefined;
}

export function isRedirect(statusCode: number | undefined): boolean {
	return statusCode !== undefined && statusCode >= 300 && statusCode < 400;
}

export function describeRedirect(statusCode: number, location: unknown): string {
	let target = '';
	if (typeof location === 'string' && location !== '') {
		try {
			const url = new URL(location, 'http://placeholder.invalid');
			target =
				url.origin === 'http://placeholder.invalid'
					? ` to ${url.pathname}`
					: ` to ${url.origin}${url.pathname}`;
		} catch {
			target = '';
		}
	}
	return (
		`Navidrome answered with a redirect (HTTP ${statusCode})${target}. ` +
		'Redirects are not followed so that credentials are never sent to another address: ' +
		'set the Base URL of the credential to the final address (for example https:// instead of http://).'
	);
}

export function headerValue(headers: unknown, name: string): unknown {
	if (!headers || typeof headers !== 'object') return undefined;
	const wanted = name.toLowerCase();
	for (const [key, value] of Object.entries(headers as Record<string, unknown>)) {
		if (key.toLowerCase() === wanted) return value;
	}
	return undefined;
}
