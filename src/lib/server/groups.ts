import { randomUUID } from 'node:crypto';
import { isValidColor } from '$lib/group-color';
import { listBookmarks, reassignCategory } from './bookmarks';
import { readCollection, writeCollection } from './store';

export type Group = {
	id: string;
	name: string;
	color: string;
};

// Groups used to be implicit: a category string on each bookmark, colored by
// position. They are a real collection now, but bookmarks still reference a
// group by name, so any category without a group record is adopted on read.
// That keeps pre-existing bookmarks.json files working with no migration.
export async function listGroups(): Promise<Group[]> {
	const [stored, bookmarks] = await Promise.all([
		readCollection<unknown>('groups'),
		listBookmarks()
	]);

	const groups = stored.filter(isGroup);
	const known = new Set(groups.map((group) => group.name.toLowerCase()));

	const orphans = Array.from(new Set(bookmarks.map((bookmark) => bookmark.category)))
		.filter((category) => !known.has(category.toLowerCase()))
		.sort()
		.map((category) => ({ id: randomUUID(), name: category, color: '' }));

	return [...groups, ...orphans];
}

export async function countByGroup(): Promise<Record<string, number>> {
	const bookmarks = await listBookmarks();
	const counts: Record<string, number> = {};

	for (const bookmark of bookmarks) {
		counts[bookmark.category] = (counts[bookmark.category] ?? 0) + 1;
	}

	return counts;
}

export async function createGroup(name: string, color: string): Promise<Group> {
	const groups = await listGroups();
	assertName(name, groups);
	assertColor(color);

	const group = { id: randomUUID(), name, color };
	await writeCollection('groups', [...groups, group]);
	return group;
}

export async function updateGroup(id: string, name: string, color: string): Promise<Group> {
	const groups = await listGroups();
	const index = groups.findIndex((group) => group.id === id);

	if (index === -1) {
		throw new Error('Group was not found.');
	}

	const existing = groups[index];
	assertName(name, groups, id);
	assertColor(color);

	groups[index] = { ...existing, name, color };
	await writeCollection('groups', groups);

	// Bookmarks store the category by name, so a rename has to rewrite them.
	if (existing.name !== name) {
		await reassignCategory(existing.name, name);
	}

	return groups[index];
}

// Bookmarks in the deleted group move to `moveToId`. A group with no bookmarks
// can be deleted without a destination.
export async function deleteGroup(id: string, moveToId: string): Promise<void> {
	const groups = await listGroups();
	const group = groups.find((candidate) => candidate.id === id);

	if (!group) {
		throw new Error('Group was not found.');
	}

	const counts = await countByGroup();

	if (counts[group.name]) {
		const target = groups.find((candidate) => candidate.id === moveToId);

		if (!target || target.id === id) {
			throw new Error('Pick a group to move the bookmarks into.');
		}

		await reassignCategory(group.name, target.name);
	}

	await writeCollection(
		'groups',
		groups.filter((candidate) => candidate.id !== id)
	);
}

function assertName(name: string, groups: Group[], ignoreId = '') {
	if (!name) {
		throw new Error('Group name is required.');
	}

	const taken = groups.some(
		(group) => group.id !== ignoreId && group.name.toLowerCase() === name.toLowerCase()
	);

	if (taken) {
		throw new Error(`A group named "${name}" already exists.`);
	}
}

function assertColor(color: string) {
	if (!isValidColor(color)) {
		throw new Error('Color must be a theme variable or a hex value like #b48ead.');
	}
}

function isGroup(value: unknown): value is Group {
	if (!value || typeof value !== 'object') {
		return false;
	}

	const group = value as Group;
	return (
		typeof group.id === 'string' &&
		typeof group.name === 'string' &&
		typeof group.color === 'string'
	);
}
