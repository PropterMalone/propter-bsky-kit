/**
 * One-shot script: sets the "bot" self-label on a Bluesky profile.
 *
 * Usage:
 *   BSKY_IDENTIFIER=handle BSKY_PASSWORD=app-password npx tsx scripts/set-bot-label.ts
 *
 * This adds the `!no-unauthenticated` self-label to the profile record,
 * which Bluesky displays as "Bot Account" in the app.
 */
import { AtpAgent } from "@atproto/api";

async function main() {
	const identifier = process.env.BSKY_IDENTIFIER;
	const password = process.env.BSKY_PASSWORD;
	if (!identifier || !password) {
		console.error("Set BSKY_IDENTIFIER and BSKY_PASSWORD");
		process.exit(1);
	}

	const agent = new AtpAgent({ service: "https://bsky.social" });
	await agent.login({ identifier, password });
	console.log(`Logged in as ${agent.session?.handle}`);

	await agent.upsertProfile((existing) => ({
		...existing,
		labels: {
			$type: "com.atproto.label.defs#selfLabels",
			values: [{ val: "!no-unauthenticated" }],
		},
	}));

	console.log("Bot self-label set. Profile will show as 'Bot Account'.");
}

main().catch((err) => {
	console.error("Fatal:", err);
	process.exit(1);
});
