import { randomUUID } from 'node:crypto';
import { readCollection, writeCollection } from './store';

export type Feed = {
	id: string;
	title: string;
	url: string;
};

export async function listFeeds(): Promise<Feed[]> {
	const parsed = await readCollection<unknown>('feeds');
	return parsed.filter(isFeed).sort((left, right) => left.title.localeCompare(right.title));
}

export async function createFeed(input: Omit<Feed, 'id'>): Promise<Feed> {
	const feeds = await listFeeds();
	const existing = feeds.find((feed) => feed.url === input.url);

	if (existing) {
		return existing;
	}

	const feed = { id: randomUUID(), ...input };
	await writeFeeds([...feeds, feed]);
	return feed;
}

export async function deleteFeed(id: string): Promise<boolean> {
	const feeds = await listFeeds();
	const nextFeeds = feeds.filter((feed) => feed.id !== id);

	if (nextFeeds.length === feeds.length) {
		return false;
	}

	await writeFeeds(nextFeeds);
	return true;
}

function writeFeeds(feeds: Feed[]) {
	return writeCollection('feeds', feeds);
}

function isFeed(value: unknown): value is Feed {
	if (!value || typeof value !== 'object') {
		return false;
	}

	const feed = value as Feed;
	return typeof feed.id === 'string' && typeof feed.title === 'string' && typeof feed.url === 'string';
}
