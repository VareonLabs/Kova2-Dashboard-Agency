import test from 'node:test';
import assert from 'node:assert/strict';
import { groupConversations, relativeTime } from '../public/chat-page.js';

test('chat list groups by Brisbane day: today, yesterday, previous 7 days, older', () => {
  const now = new Date('2026-10-24T02:00:00Z'); // 12:00 in Brisbane
  const chat = (id, at) => ({ id, lastMessageAt: at });
  const groups = groupConversations([
    chat('a', '2026-10-23T23:30:00Z'), // 09:30 today in Brisbane, though still the 23rd in UTC
    chat('b', '2026-10-23T03:00:00Z'), // yesterday
    chat('c', '2026-10-20T03:00:00Z'), // four days ago
    chat('d', '2026-09-01T03:00:00Z')
  ], now);
  assert.deepEqual(groups.map(([label, list]) => [label, list.map(c => c.id)]), [
    ['Today', ['a']], ['Yesterday', ['b']], ['Previous 7 days', ['c']], ['Older', ['d']]
  ]);
});

test('empty groups are left out and createdAt stands in for chats with no messages yet', () => {
  const now = new Date('2026-10-24T02:00:00Z');
  const groups = groupConversations([{ id: 'new', createdAt: '2026-10-24T01:00:00Z' }], now);
  assert.deepEqual(groups.map(([label]) => label), ['Today']);
});

test('recent chats show short relative times, then a date after a week', () => {
  const now = new Date('2026-10-24T02:00:00Z');
  assert.equal(relativeTime('2026-10-24T01:59:40Z', now), 'now');
  assert.equal(relativeTime('2026-10-24T01:15:00Z', now), '45m');
  assert.equal(relativeTime('2026-10-23T23:00:00Z', now), '3h');
  assert.equal(relativeTime('2026-10-21T02:00:00Z', now), '3d');
  assert.equal(relativeTime('2026-10-12T02:00:00Z', now), '12 Oct');
});
