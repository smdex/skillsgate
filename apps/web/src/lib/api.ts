const API_BASE_URL = "https://api.skillsgate.ai";

type RequestOptions = {
	headers?: Record<string, string>;
	signal?: AbortSignal;
};

async function makePublicRequest<T>(
	method: string,
	path: string,
	body?: unknown,
	options?: RequestOptions,
): Promise<{ data: T; ok: true } | { error: string; status: number; ok: false }> {
	const url = `${API_BASE_URL}${path}`;
	const headers: Record<string, string> = {
		...options?.headers,
	};

	if (body !== undefined) {
		headers["Content-Type"] = "application/json";
	}

	const res = await fetch(url, {
		method,
		headers,
		body: body !== undefined ? JSON.stringify(body) : undefined,
		signal: options?.signal,
	});

	if (res.status === 204) {
		return { data: undefined as T, ok: true };
	}

	if (!res.ok) {
		let error = `Request failed with status ${res.status}`;
		try {
			const json = await res.json();
			error = (json as { error?: string }).error ?? error;
		} catch {
			// ignore parse errors
		}
		return { error, status: res.status, ok: false };
	}

	const data = (await res.json()) as T;
	return { data, ok: true };
}

/**
 * Public API client -- no authentication required.
 * Use this for public endpoints like blog posts and catalog browsing.
 */
export const publicApi = {
	get<T>(path: string, options?: RequestOptions) {
		return makePublicRequest<T>("GET", path, undefined, options);
	},
};
