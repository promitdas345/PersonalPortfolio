const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { createMessageStore } = require('../lib/messages');

async function withStore(run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'messages-test-'));
  const messagesFile = path.join(dir, 'messages.json');
  try {
    await run(createMessageStore({ messagesFile }), messagesFile);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test('a missing messages file reads as an empty inbox', async () => {
  await withStore(async store => {
    assert.deepEqual(await store.loadMessages(), []);
  });
});

test('added messages persist to disk, newest first', async () => {
  await withStore(async (store, messagesFile) => {
    await store.addMessage({ name: 'First', email: 'first@example.com', message: 'one' });
    await store.addMessage({ name: 'Second', email: 'second@example.com', message: 'two' });

    const messages = await store.loadMessages();
    assert.equal(messages.length, 2);
    assert.equal(messages[0].name, 'Second');
    assert.equal(messages[0].read, false);

    const onDisk = JSON.parse(await fs.readFile(messagesFile, 'utf8'));
    assert.equal(onDisk.length, 2);
    assert.equal(onDisk[1].message, 'one');
  });
});

test('a failed email is recorded without losing the message', async () => {
  await withStore(async store => {
    const stored = await store.addMessage({ name: 'Visitor', email: 'visitor@example.com', message: 'hello' });
    await store.recordEmailResult(stored.id, { emailed: false, error: 'Email delivery failed.' });

    const [message] = await store.loadMessages();
    assert.equal(message.message, 'hello');
    assert.equal(message.emailed, false);
    assert.equal(message.emailError, 'Email delivery failed.');
  });
});

test('messages can be marked read and deleted', async () => {
  await withStore(async store => {
    const stored = await store.addMessage({ name: 'Visitor', email: 'visitor@example.com', message: 'hello' });

    const read = await store.setRead(stored.id, true);
    assert.equal(read.read, true);
    assert.ok(read.readAt);

    await store.deleteMessage(stored.id);
    assert.deepEqual(await store.loadMessages(), []);

    await assert.rejects(() => store.setRead(stored.id, true), /Message not found/);
    await assert.rejects(() => store.deleteMessage(stored.id), /Message not found/);
  });
});

test('a store reloaded from disk sees what an earlier store wrote', async () => {
  await withStore(async (store, messagesFile) => {
    await store.addMessage({ name: 'Visitor', email: 'visitor@example.com', message: 'persisted' });

    const reopened = createMessageStore({ messagesFile });
    const [message] = await reopened.loadMessages();
    assert.equal(message.message, 'persisted');
  });
});
