const http = require('http');
const ioClient = require('socket.io-client');
const request = require('supertest');
const mongoose = require('mongoose');

const app = require('../src/app');
const { initSockets } = require('../src/sockets');
const Meeting = require('../src/models/Meeting');
const Message = require('../src/models/Message');
const { generateMeetingCode } = require('../src/utils/meetingCode');
const { connectTestDB, clearTestDB, disconnectTestDB } = require('./helpers/db');
const { createUser } = require('./helpers/users');

beforeAll(connectTestDB, 120000);
afterEach(clearTestDB);
afterAll(disconnectTestDB);

function connectSocket(port, token) {
  return new Promise((resolve, reject) => {
    const socket = ioClient(`http://localhost:${port}`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
    });
    socket.on('connect', () => resolve(socket));
    socket.on('connect_error', reject);
  });
}

function emitAck(socket, event, payload) {
  return new Promise((resolve) => {
    socket.emit(event, payload, resolve);
  });
}

function waitForEvent(socket, event, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timed out waiting for event "${event}"`));
    }, timeoutMs);

    function handler(data) {
      clearTimeout(timer);
      socket.off(event, handler);
      resolve(data);
    }

    socket.on(event, handler);
  });
}

describe('FEATURE_CHAT_PLUS: Privacy, Rejections, ReplyTo, Host and Outsider Access', () => {
  let server;
  let port;
  const socketsToClose = [];

  beforeAll((done) => {
    server = http.createServer(app);
    initSockets(server);
    server.listen(0, () => {
      port = server.address().port;
      done();
    });
  });

  afterAll((done) => {
    socketsToClose.forEach((s) => s?.disconnect?.());
    server.close(done);
  });

  afterEach(() => {
    while (socketsToClose.length) {
      const s = socketsToClose.pop();
      s?.disconnect?.();
    }
  });

  async function setupMeetingWithPeers() {
    const host = await createUser({ name: 'Host Alice' });
    const guest1 = await createUser({ name: 'Guest Bob' });
    const guest2 = await createUser({ name: 'Guest Charlie' });
    const waitingUser = await createUser({ name: 'Waiting Dave' });
    const outsider = await createUser({ name: 'Outsider Eve' });

    const code = generateMeetingCode();
    const meeting = await Meeting.create({
      code,
      title: 'Chat Plus Test Meeting',
      host: host.user.id,
      attendees: [host.user.id, guest1.user.id, guest2.user.id],
      status: 'active',
      startsAt: new Date(),
    });

    const hostSocket = await connectSocket(port, host.token);
    const guest1Socket = await connectSocket(port, guest1.token);
    const guest2Socket = await connectSocket(port, guest2.token);
    const waitingSocket = await connectSocket(port, waitingUser.token);
    socketsToClose.push(hostSocket, guest1Socket, guest2Socket, waitingSocket);

    // Host joins
    const hostJoin = await emitAck(hostSocket, 'room:join', { code });
    expect(hostJoin.role).toBe('host');

    // Guests join and host admits them
    await emitAck(guest1Socket, 'room:join', { code });
    await emitAck(guest2Socket, 'room:join', { code });
    await emitAck(waitingSocket, 'room:join', { code });

    await emitAck(hostSocket, 'host:admit', { peerId: guest1Socket.id });
    await emitAck(hostSocket, 'host:admit', { peerId: guest2Socket.id });
    // Waiting Dave is left in waiting list
    await new Promise((r) => setTimeout(r, 80));

    return {
      code,
      meeting,
      host,
      guest1,
      guest2,
      waitingUser,
      outsider,
      hostSocket,
      guest1Socket,
      guest2Socket,
      waitingSocket,
    };
  }

  test('Privacy: Host cannot read other peers private messages via socket or REST; waiting guests get nothing', async () => {
    const {
      code,
      host,
      guest1,
      guest2,
      outsider,
      hostSocket,
      guest1Socket,
      guest2Socket,
      waitingSocket,
    } = await setupMeetingWithPeers();

    let hostGotPrivateMsg = false;
    let waitingGotPrivateMsg = false;
    let guest2Received = null;
    let guest1Received = null;

    hostSocket.on('chat:message', () => { hostGotPrivateMsg = true; });
    waitingSocket.on('chat:message', () => { waitingGotPrivateMsg = true; });
    guest2Socket.on('chat:message', (m) => { guest2Received = m; });
    guest1Socket.on('chat:message', (m) => { guest1Received = m; });

    // Send private message from Guest1 to Guest2
    const sendAck = await emitAck(guest1Socket, 'chat:send', {
      text: 'Confidential: Bob to Charlie only',
      to: guest2.user.id.toString(),
    });

    expect(sendAck.ok).toBe(true);
    expect(sendAck.message.text).toBe('Confidential: Bob to Charlie only');
    expect(sendAck.message.to).toEqual({
      id: guest2.user.id.toString(),
      name: 'Guest Charlie',
    });

    await new Promise((r) => setTimeout(r, 120));

    // Socket verification
    expect(hostGotPrivateMsg).toBe(false);
    expect(waitingGotPrivateMsg).toBe(false);
    expect(guest2Received).not.toBeNull();
    expect(guest2Received.text).toBe('Confidential: Bob to Charlie only');
    expect(guest1Received).not.toBeNull();
    expect(guest1Received.text).toBe('Confidential: Bob to Charlie only');

    // Also send one public message
    await emitAck(hostSocket, 'chat:send', { text: 'Public host announcement' });
    await new Promise((r) => setTimeout(r, 80));

    // REST Verification: Host
    const hostRes = await request(app)
      .get(`/api/meetings/${code}/messages`)
      .set('Authorization', `Bearer ${host.token}`);

    expect(hostRes.status).toBe(200);
    const hostTexts = hostRes.body.messages.map((m) => m.text);
    expect(hostTexts).toContain('Public host announcement');
    expect(hostTexts).not.toContain('Confidential: Bob to Charlie only'); // HOST CANNOT READ OTHERS' PRIVATE MESSAGES

    // REST Verification: Guest 1 (Sender)
    const guest1Res = await request(app)
      .get(`/api/meetings/${code}/messages`)
      .set('Authorization', `Bearer ${guest1.token}`);

    expect(guest1Res.status).toBe(200);
    const guest1Texts = guest1Res.body.messages.map((m) => m.text);
    expect(guest1Texts).toContain('Public host announcement');
    expect(guest1Texts).toContain('Confidential: Bob to Charlie only');

    // REST Verification: Guest 2 (Recipient)
    const guest2Res = await request(app)
      .get(`/api/meetings/${code}/messages`)
      .set('Authorization', `Bearer ${guest2.token}`);

    expect(guest2Res.status).toBe(200);
    const guest2Texts = guest2Res.body.messages.map((m) => m.text);
    expect(guest2Texts).toContain('Public host announcement');
    expect(guest2Texts).toContain('Confidential: Bob to Charlie only');

    // REST Verification: Outsider
    const outsiderRes = await request(app)
      .get(`/api/meetings/${code}/messages`)
      .set('Authorization', `Bearer ${outsider.token}`);

    expect(outsiderRes.status).toBe(403);
    expect(outsiderRes.body.error.code).toBe('FORBIDDEN');
  });

  test('Rejections: CANNOT_MESSAGE_SELF, RECIPIENT_NOT_IN_ROOM (non-existent, waiting, or left)', async () => {
    const {
      guest1,
      guest2,
      waitingUser,
      guest1Socket,
      guest2Socket,
    } = await setupMeetingWithPeers();

    // 1. Cannot message self
    const selfAck = await emitAck(guest1Socket, 'chat:send', {
      text: 'Note to self',
      to: guest1.user.id.toString(),
    });
    expect(selfAck.ok).toBe(false);
    expect(selfAck.error.code).toBe('CANNOT_MESSAGE_SELF');

    // 2. Waiting guest is not in room
    const waitingAck = await emitAck(guest1Socket, 'chat:send', {
      text: 'Hey waiting dave',
      to: waitingUser.user.id.toString(),
    });
    expect(waitingAck.ok).toBe(false);
    expect(waitingAck.error.code).toBe('RECIPIENT_NOT_IN_ROOM');

    // 3. Random non-existent user
    const nonExistentId = new mongoose.Types.ObjectId().toString();
    const missingAck = await emitAck(guest1Socket, 'chat:send', {
      text: 'To ghost',
      to: nonExistentId,
    });
    expect(missingAck.ok).toBe(false);
    expect(missingAck.error.code).toBe('RECIPIENT_NOT_IN_ROOM');

    // 4. Recipient leaves room
    guest2Socket.disconnect();
    await new Promise((r) => setTimeout(r, 100));

    const leftAck = await emitAck(guest1Socket, 'chat:send', {
      text: 'Are you still there?',
      to: guest2.user.id.toString(),
    });
    expect(leftAck.ok).toBe(false);
    expect(leftAck.error.code).toBe('RECIPIENT_NOT_IN_ROOM');
  });

  test('ReplyTo validity: attaches parent info, rejects non-existent or other meetings, blocks replying to private messages of others', async () => {
    const {
      code,
      host,
      guest1,
      guest2,
      hostSocket,
      guest1Socket,
      guest2Socket,
    } = await setupMeetingWithPeers();

    // 1. Send an initial public message from Bob
    const bobMsgAck = await emitAck(guest1Socket, 'chat:send', {
      text: 'What time is the demo tomorrow?',
    });
    expect(bobMsgAck.ok).toBe(true);
    const parentMsgId = bobMsgAck.message.id;

    // 2. Charlie replies to Bob's public message
    let charlieBroadcast = null;
    hostSocket.on('chat:message', (m) => {
      if (m.text === 'Demo is at 10 AM EST') charlieBroadcast = m;
    });

    const replyAck = await emitAck(guest2Socket, 'chat:send', {
      text: 'Demo is at 10 AM EST',
      replyTo: parentMsgId,
    });

    expect(replyAck.ok).toBe(true);
    expect(replyAck.message.replyTo).toEqual({
      id: parentMsgId,
      text: 'What time is the demo tomorrow?',
      fromName: 'Guest Bob',
    });

    await new Promise((r) => setTimeout(r, 80));
    expect(charlieBroadcast).not.toBeNull();
    expect(charlieBroadcast.replyTo).toEqual({
      id: parentMsgId,
      text: 'What time is the demo tomorrow?',
      fromName: 'Guest Bob',
    });

    // Verify REST retrieves replyTo correctly
    const restRes = await request(app)
      .get(`/api/meetings/${code}/messages`)
      .set('Authorization', `Bearer ${host.token}`);

    expect(restRes.status).toBe(200);
    const repliedMsg = restRes.body.messages.find((m) => m.id === replyAck.message.id);
    expect(repliedMsg.replyTo).toEqual({
      id: parentMsgId,
      text: 'What time is the demo tomorrow?',
      fromName: 'Guest Bob',
    });

    // 3. Reject non-existent replyTo
    const fakeId = new mongoose.Types.ObjectId().toString();
    const fakeReplyAck = await emitAck(guest1Socket, 'chat:send', {
      text: 'Replying to nothing',
      replyTo: fakeId,
    });
    expect(fakeReplyAck.ok).toBe(false);
    expect(fakeReplyAck.error.code).toBe('INVALID_REPLY');

    // 4. Reject replyTo from a different meeting
    const otherMeeting = await Meeting.create({
      code: generateMeetingCode(),
      title: 'Other Room',
      host: host.user.id,
      status: 'active',
      startsAt: new Date(),
    });
    const otherMsg = await Message.create({
      meeting: otherMeeting._id,
      user: host.user.id,
      name: 'Host Alice',
      text: 'Message in another meeting',
    });

    const foreignReplyAck = await emitAck(guest1Socket, 'chat:send', {
      text: 'Replying to other meeting',
      replyTo: otherMsg._id.toString(),
    });
    expect(foreignReplyAck.ok).toBe(false);
    expect(foreignReplyAck.error.code).toBe('INVALID_REPLY');

    // 5. Reject replying to a private message you cannot see
    // Bob sends a private message to Charlie
    const privateAck = await emitAck(guest1Socket, 'chat:send', {
      text: 'Top secret idea',
      to: guest2.user.id.toString(),
    });
    expect(privateAck.ok).toBe(true);
    const privateMsgId = privateAck.message.id;

    // Host Alice tries to reply to that private message
    const hostSnoopAck = await emitAck(hostSocket, 'chat:send', {
      text: 'I want in on this secret',
      replyTo: privateMsgId,
    });
    expect(hostSnoopAck.ok).toBe(false);
    expect(hostSnoopAck.error.code).toBe('FORBIDDEN');
  });
});
