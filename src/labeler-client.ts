// pattern: Imperative Shell

import type { LabelerClient } from './types.js';

/** Create an HTTP client for propter-labeler service. */
export function createLabelerClient(baseUrl: string, secret: string): LabelerClient {
	async function post(path: string, body: Record<string, string>): Promise<boolean> {
		try {
			const res = await fetch(`${baseUrl}${path}`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					Authorization: `Bearer ${secret}`,
				},
				body: JSON.stringify(body),
			});
			if (!res.ok) {
				console.error(`labeler ${path} failed (${res.status}): ${await res.text()}`);
				return false;
			}
			return true;
		} catch (error) {
			console.error(`labeler ${path} error:`, error);
			return false;
		}
	}

	return {
		async labelPost(uri: string, val: string) {
			return post('/label', { uri, val });
		},
		async watchThread(threadUri: string, label: string) {
			return post('/watch', { threadUri, label });
		},
		async unwatchThread(threadUri: string) {
			try {
				const res = await fetch(`${baseUrl}/watch`, {
					method: 'DELETE',
					headers: {
						'Content-Type': 'application/json',
						Authorization: `Bearer ${secret}`,
					},
					body: JSON.stringify({ threadUri }),
				});
				if (!res.ok) {
					console.error(`labeler unwatch failed (${res.status}): ${await res.text()}`);
					return false;
				}
				return true;
			} catch (error) {
				console.error('labeler unwatch error:', error);
				return false;
			}
		},
	};
}
