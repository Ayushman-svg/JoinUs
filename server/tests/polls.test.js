const http = require('http');
const ioClient = require('socket.io-client');
const request = require('supertest');

const app = require('../src/app');
const { initSockets } = require('../src/sockets');
const Meeting = require('../src/models/Meeting');
const Poll = require('../src/models/Poll');
const Vote = require('../src/models/Vote');
const { generateMeetingCode } = require('../src/utils/meetingCode');
const { connectTestDB, clearTestDB, disconnectTestDB } = require('./helpers/db');
const { createUser } = require('./helpers/users');

beforeAll(connectTestDB, 120000);
afterEach(async () => {
  process.env.FEATURE_POLLS = 'true';
  await clearTestDB();
});
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

describe('FEATURE_POLLS: Socket & REST Integration', () => {
  let server;
  let port;
  const socketsToClose = [];

  beforeAll((done) => {
    process.env.FEATURE_POLLS = 'true';
    server = http.createServer(app);
    initSockets(server);
    server.listen(0, () => {
      port = server.address().port;
      done();
    });
  });

  afterAll((done) => {
    server.close(done);
  });

  afterEach(() => {
    while (socketsToClose.length) {
      const s = socketsToClose.pop();
      if (s.connected) s.disconnect();
    }
  });

  async function makeUserAndSocket(prefix) {
    const created = await createUser({
      name: `${prefix} User`,
      email: `${prefix.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(7)}@example.com`,
      password: 'password123',
    });
    const socket = await connectSocket(port, created.token);
    socketsToClose.push(socket);
    return { user: created.user, token: created.token, socket };
  }

  async function createMeetingDoc(hostUser, waitingRoom = false) {
    const code = generateMeetingCode();
    const hostId = hostUser.id || hostUser._id;
    const meeting = await Meeting.create({
      code,
      title: 'Polls Test Meeting',
      host: hostId,
      waitingRoom,
      startsAt: new Date(),
    });
    return meeting;
  }

  it('feature flag: rejects poll events and REST when FEATURE_POLLS is off', async () => {
    process.env.FEATURE_POLLS = 'false';
    const host = await makeUserAndSocket('Host');
    const meeting = await createMeetingDoc(host.user, false);

    await emitAck(host.socket, 'room:join', { code: meeting.code });

    const createRes = await emitAck(host.socket, 'poll:create', {
      question: 'Should this work?',
      options: [{ text: 'Yes' }, { text: 'No' }],
    });
    expect(createRes.error).toBeDefined();
    expect(createRes.error.code).toBe('FEATURE_DISABLED');

    const restRes = await request(app)
      .get(`/api/meetings/${meeting.code}/polls`)
      .set('Authorization', `Bearer ${host.token}`);
    expect(restRes.status).toBe(403);
    expect(restRes.body.error.code).toBe('FEATURE_DISABLED');
  });

  it('wrong role: participant cannot create, launch, or close a poll; co-host can', async () => {
    const host = await makeUserAndSocket('Host');
    const participant = await makeUserAndSocket('Part');
    const meeting = await createMeetingDoc(host.user, false);

    await emitAck(host.socket, 'room:join', { code: meeting.code });
    const partJoin = await emitAck(participant.socket, 'room:join', { code: meeting.code });
    expect(partJoin.status).toBe('admitted');

    // Participant attempts to create
    const createPart = await emitAck(participant.socket, 'poll:create', {
      question: 'Rogue poll?',
      options: [{ text: 'A' }, { text: 'B' }],
    });
    expect(createPart.error).toBeDefined();
    expect(createPart.error.code).toBe('FORBIDDEN');

    // Host creates poll
    const createHost = await emitAck(host.socket, 'poll:create', {
      question: 'Official poll',
      options: [{ text: 'Option 1' }, { text: 'Option 2' }],
      launchNow: false,
    });
    expect(createHost.success).toBe(true);
    const pollId = createHost.poll.id;

    // Participant attempts to launch
    const launchPart = await emitAck(participant.socket, 'poll:launch', { pollId });
    expect(launchPart.error.code).toBe('FORBIDDEN');

    // Host promotes participant to co-host
    const promoteRes = await emitAck(host.socket, 'host:promote', { peerId: participant.socket.id });
    expect(promoteRes.role).toBe('co-host');

    // Now co-host CAN launch the poll
    const launchCoHost = await emitAck(participant.socket, 'poll:launch', { pollId });
    expect(launchCoHost.success).toBe(true);

    // Co-host closes the poll
    const closeCoHost = await emitAck(participant.socket, 'poll:close', { pollId });
    expect(closeCoHost.success).toBe(true);
  });

  it('double vote: prevents participant from voting twice on the same poll', async () => {
    const host = await makeUserAndSocket('Host');
    const voter = await makeUserAndSocket('Voter');
    const meeting = await createMeetingDoc(host.user, false);

    await emitAck(host.socket, 'room:join', { code: meeting.code });
    await emitAck(voter.socket, 'room:join', { code: meeting.code });

    const createRes = await emitAck(host.socket, 'poll:create', {
      question: 'Favorite food?',
      options: [{ id: 'opt_pizza', text: 'Pizza' }, { id: 'opt_burger', text: 'Burger' }],
      launchNow: true,
    });
    const pollId = createRes.poll.id;

    // First vote
    const vote1 = await emitAck(voter.socket, 'poll:vote', {
      pollId,
      optionIds: ['opt_pizza'],
    });
    expect(vote1.success).toBe(true);
    expect(vote1.poll.hasVoted).toBe(true);
    expect(vote1.poll.userVote).toEqual(['opt_pizza']);

    // Second vote attempt (Double vote)
    const vote2 = await emitAck(voter.socket, 'poll:vote', {
      pollId,
      optionIds: ['opt_burger'],
    });
    expect(vote2.error).toBeDefined();
    expect(vote2.error.code).toBe('ALREADY_VOTED');

    // Database check: exactly 1 vote record exists
    const count = await Vote.countDocuments({ poll: pollId, user: voter.user.id || voter.user._id });
    expect(count).toBe(1);
  });

  it('vote on closed poll: rejects voting after poll is closed', async () => {
    const host = await makeUserAndSocket('Host');
    const voter = await makeUserAndSocket('Voter');
    const meeting = await createMeetingDoc(host.user, false);

    await emitAck(host.socket, 'room:join', { code: meeting.code });
    await emitAck(voter.socket, 'room:join', { code: meeting.code });

    const createRes = await emitAck(host.socket, 'poll:create', {
      question: 'Quick poll',
      options: [{ id: 'opt_1', text: '1' }, { id: 'opt_2', text: '2' }],
      launchNow: true,
    });
    const pollId = createRes.poll.id;

    // Host closes poll
    const closeRes = await emitAck(host.socket, 'poll:close', { pollId });
    expect(closeRes.success).toBe(true);

    // Participant attempts to vote on closed poll
    const voteRes = await emitAck(voter.socket, 'poll:vote', {
      pollId,
      optionIds: ['opt_1'],
    });
    expect(voteRes.error).toBeDefined();
    expect(voteRes.error.code).toBe('POLL_NOT_OPEN');
  });

  it('anonymity: anonymous polls never expose voter identities in payloads or REST responses', async () => {
    const host = await makeUserAndSocket('Host');
    const voter1 = await makeUserAndSocket('Alice');
    const voter2 = await makeUserAndSocket('Bob');
    const meeting = await createMeetingDoc(host.user, false);

    await emitAck(host.socket, 'room:join', { code: meeting.code });
    await emitAck(voter1.socket, 'room:join', { code: meeting.code });
    await emitAck(voter2.socket, 'room:join', { code: meeting.code });

    // Host listens for live counts
    let updatedPayload = null;
    host.socket.on('poll:updated', (data) => {
      updatedPayload = data;
    });

    const createRes = await emitAck(host.socket, 'poll:create', {
      question: 'Anonymous election?',
      options: [{ id: 'cand_a', text: 'Alice' }, { id: 'cand_b', text: 'Bob' }],
      anonymous: true,
      shareResults: true,
      launchNow: true,
    });
    const pollId = createRes.poll.id;

    await emitAck(voter1.socket, 'poll:vote', { pollId, optionIds: ['cand_a'] });
    await emitAck(voter2.socket, 'poll:vote', { pollId, optionIds: ['cand_b'] });

    // Wait slightly for socket broadcast
    await new Promise((r) => setTimeout(r, 100));

    expect(updatedPayload).toBeDefined();
    expect(updatedPayload.poll.totalVotes).toBe(2);
    // Anonymity: stringified payload never mentions Alice or Bob or user IDs in votes
    const payloadStr = JSON.stringify(updatedPayload);
    const u1Id = String(voter1.user.id || voter1.user._id);
    const u2Id = String(voter2.user.id || voter2.user._id);
    expect(payloadStr).not.toContain(u1Id);
    expect(payloadStr).not.toContain(u2Id);

    // REST check
    const restRes = await request(app)
      .get(`/api/meetings/${meeting.code}/polls`)
      .set('Authorization', `Bearer ${host.token}`);
    expect(restRes.status).toBe(200);
    const restStr = JSON.stringify(restRes.body);
    expect(restStr).not.toContain(u1Id);
    expect(restStr).not.toContain(u2Id);

    // CSV export for anonymous poll: NO voter names or emails
    const csvRes = await request(app)
      .get(`/api/meetings/${meeting.code}/polls/${pollId}/export.csv`)
      .set('Authorization', `Bearer ${host.token}`);
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers['content-type']).toContain('text/csv');
    const csvContent = csvRes.text;
    expect(csvContent).toContain('Anonymous,Yes');
    expect(csvContent).toContain('cand_a,Alice,1,50%');
    expect(csvContent).toContain('cand_b,Bob,1,50%');
    expect(csvContent).not.toContain(voter1.user.email);
    expect(csvContent).not.toContain(voter2.user.email);
  });

  it('CSV export: non-anonymous poll exports voter names and emails; participant export is forbidden', async () => {
    const host = await makeUserAndSocket('Host');
    const voter = await makeUserAndSocket('Charlie');
    const meeting = await createMeetingDoc(host.user, false);

    await emitAck(host.socket, 'room:join', { code: meeting.code });
    await emitAck(voter.socket, 'room:join', { code: meeting.code });

    const createRes = await emitAck(host.socket, 'poll:create', {
      question: 'Public feedback?',
      options: [{ id: 'opt_good', text: 'Good' }, { id: 'opt_bad', text: 'Bad' }],
      anonymous: false,
      shareResults: true,
      launchNow: true,
    });
    const pollId = createRes.poll.id;

    await emitAck(voter.socket, 'poll:vote', { pollId, optionIds: ['opt_good'] });

    // Participant tries CSV export -> FORBIDDEN
    const partExport = await request(app)
      .get(`/api/meetings/${meeting.code}/polls/${pollId}/export.csv`)
      .set('Authorization', `Bearer ${voter.token}`);
    expect(partExport.status).toBe(403);
    expect(partExport.body.error.code).toBe('FORBIDDEN');

    // Host export -> 200 with voter details
    const hostExport = await request(app)
      .get(`/api/meetings/${meeting.code}/polls/${pollId}/export.csv`)
      .set('Authorization', `Bearer ${host.token}`);
    expect(hostExport.status).toBe(200);
    expect(hostExport.text).toContain('Voter Name,Voter Email,Selected Options,Submitted At');
    expect(hostExport.text).toContain(voter.user.name);
    expect(hostExport.text).toContain(voter.user.email);
    expect(hostExport.text).toContain('Good');
  });

  it('late joiner & reconnect: delivers active poll on room:join and room:status; waiting guests receive nothing', async () => {
    const host = await makeUserAndSocket('Host');
    const earlyGuest = await makeUserAndSocket('Early');
    const lateGuest = await makeUserAndSocket('Late');
    const waitingGuest = await makeUserAndSocket('Waiting');

    // Meeting with waitingRoom enabled
    const meeting = await createMeetingDoc(host.user, true);

    await emitAck(host.socket, 'room:join', { code: meeting.code });

    // Early guest joins and is admitted by host
    await emitAck(earlyGuest.socket, 'room:join', { code: meeting.code });
    await emitAck(host.socket, 'host:admit', { peerId: earlyGuest.socket.id });

    // Host launches poll
    const createRes = await emitAck(host.socket, 'poll:create', {
      question: 'Joiner test poll?',
      options: [{ id: 'o1', text: 'Alpha' }, { id: 'o2', text: 'Beta' }],
      shareResults: true,
      launchNow: true,
    });
    const pollId = createRes.poll.id;

    // Early guest votes
    await emitAck(earlyGuest.socket, 'poll:vote', { pollId, optionIds: ['o1'] });

    // 1. Waiting guest joins: receives status 'waiting' and NO activePoll
    const waitingRes = await emitAck(waitingGuest.socket, 'room:join', { code: meeting.code });
    expect(waitingRes.status).toBe('waiting');
    expect(waitingRes.activePoll).toBeUndefined();

    // 2. Late guest admitted directly (or admitted by host) receives activePoll in room:admitted
    const admittedPromise = waitForEvent(lateGuest.socket, 'room:admitted');
    await emitAck(lateGuest.socket, 'room:join', { code: meeting.code });
    await emitAck(host.socket, 'host:admit', { peerId: lateGuest.socket.id });
    const admittedData = await admittedPromise;
    expect(admittedData.activePoll).toBeDefined();
    expect(admittedData.activePoll.question).toBe('Joiner test poll?');

    // Query room:status as late guest: receives activePoll without live counts
    const lateStatus = await emitAck(lateGuest.socket, 'room:status', { code: meeting.code });
    expect(lateStatus.status).toBe('admitted');
    expect(lateStatus.activePoll).toBeDefined();
    expect(lateStatus.activePoll.question).toBe('Joiner test poll?');
    expect(lateStatus.activePoll.totalVotes).toBeUndefined();
    expect(lateStatus.activePoll.options[0].voteCount).toBeUndefined();

    // Reconnecting host queries room:status: receives activePoll WITH live counts
    const hostStatus = await emitAck(host.socket, 'room:status', { code: meeting.code });
    expect(hostStatus.status).toBe('host');
    expect(hostStatus.activePoll).toBeDefined();
    expect(hostStatus.activePoll.totalVotes).toBe(1);
    expect(hostStatus.activePoll.options[0].voteCount).toBe(1);
  });
});
