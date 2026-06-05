import { beforeEach, describe, expect, it, vi } from 'vitest';
import { graphemeLength } from './grapheme.js';

// Mock AtpAgent
function createMockAgent() {
	let callCount = 0;
	return {
		post: vi.fn(async () => ({
			uri: `at://did:plc:test/app.bsky.feed.post/${++callCount}`,
			cid: `cid${callCount}`,
		})),
		resolveHandle: vi.fn(async ({ handle }: { handle: string }) => ({
			data: { did: `did:plc:${handle}` },
		})),
	};
}

describe('grapheme pre-flight', () => {
	it('postMessageChain auto-splits oversized text (no rejection)', async () => {
		const { postMessageChain } = await import('./posting.js');
		const agent = createMockAgent();
		const oversized = 'a'.repeat(301);
		const refs = await postMessageChain(agent as never, oversized);
		expect(refs.length).toBe(2);
		expect(agent.post).toHaveBeenCalledTimes(2);
	});
});

// Tests that mock splitForPost to simulate a splitter bug — verifying doPost's safety net
describe('grapheme pre-flight safety net', () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it('rejects in doPost when splitForPost produces oversized chunk', async () => {
		vi.doMock('./text-splitter.js', () => ({
			splitForPost: (text: string) => [text],
		}));
		const { postMessageChain } = await import('./posting.js');
		const agent = createMockAgent();
		const oversized = 'a'.repeat(301);
		await expect(postMessageChain(agent as never, oversized)).rejects.toThrow(
			/exceeds 300 grapheme/,
		);
		expect(agent.post).not.toHaveBeenCalled();
	});

	it('allows text at exactly 300 graphemes', async () => {
		vi.doMock('./text-splitter.js', () => ({
			splitForPost: (text: string) => [text],
		}));
		const { postMessageChain } = await import('./posting.js');
		const agent = createMockAgent();
		const exact = 'a'.repeat(300);
		const refs = await postMessageChain(agent as never, exact);
		expect(refs.length).toBe(1);
		expect(agent.post).toHaveBeenCalledTimes(1);
	});

	it('catches oversized emoji text in doPost', async () => {
		vi.doMock('./text-splitter.js', () => ({
			splitForPost: (text: string) => [text],
		}));
		const { postMessageChain } = await import('./posting.js');
		const agent = createMockAgent();
		const text = `${'a'.repeat(299)}👨‍👩‍👧‍👦b`;
		expect(graphemeLength(text)).toBe(301);
		await expect(postMessageChain(agent as never, text)).rejects.toThrow(/exceeds 300 grapheme/);
	});

	it('pre-flight fires for reply chains too', async () => {
		vi.doMock('./text-splitter.js', () => ({
			splitForPost: (text: string) => [text],
		}));
		const { replyToPostChain } = await import('./posting.js');
		const agent = createMockAgent();
		const parent = { uri: 'at://did:plc:x/app.bsky.feed.post/1', cid: 'cid1' };
		const oversized = 'a'.repeat(301);
		await expect(replyToPostChain(agent as never, oversized, parent, parent)).rejects.toThrow(
			/exceeds 300 grapheme/,
		);
	});

	it('pre-flight fires for quote posts too', async () => {
		vi.doMock('./text-splitter.js', () => ({
			splitForPost: (text: string) => [text],
		}));
		const { postWithQuoteChain } = await import('./posting.js');
		const agent = createMockAgent();
		const quoted = { uri: 'at://did:plc:x/app.bsky.feed.post/1', cid: 'cid1' };
		const oversized = 'a'.repeat(301);
		await expect(postWithQuoteChain(agent as never, oversized, quoted)).rejects.toThrow(
			/exceeds 300 grapheme/,
		);
	});
});
