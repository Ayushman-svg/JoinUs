/**
 * Safe cleanup of test accounts, test meetings and their chat messages.
 *
 * It only touches data that matches STRICT rules, shows every record it found,
 * and deletes nothing until you type the confirmation phrase.
 *
 * Which users count as test users:
 *   1. emails listed in TEST_EMAILS (comma-separated), and/or
 *   2. emails on the throwaway domains example.com, test.com, temp.com
 * Which meetings count as test meetings:
 *   - meetings hosted by those test users, and
 *   - meetings whose title STARTS with "test" or "smoke"
 * Real accounts and demo accounts you want to keep are never matched by a loose
 * word such as "demo", so create your evaluator demo accounts AFTER running this.
 *
 * Usage (PowerShell):
 *   $env:MONGODB_URI="mongodb+srv://..."
 *   $env:TEST_EMAILS="me.test1@gmail.com,me.test2@gmail.com"
 *   node scripts/cleanTestData.js
 */

const readline = require('readline');
const mongoose = require('mongoose');

const User = require('../src/models/User');
const Meeting = require('../src/models/Meeting');
const Message = require('../src/models/Message');
const Poll = require('../src/models/Poll');
const Vote = require('../src/models/Vote');

const THROWAWAY_EMAIL_DOMAINS = /@(example\.com|test\.com|temp\.com)$/i;
const TEST_TITLE = /^\s*(test|smoke)\b/i;
const CONFIRMATION = 'DELETE TEST DATA';

function promptConfirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function parseEmailList(value) {
  return (value || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('Error: MONGODB_URI environment variable is required.');
    process.exit(1);
  }

  const listedEmails = parseEmailList(process.env.TEST_EMAILS);

  console.log('Connecting to database...');
  await mongoose.connect(uri);
  console.log('Connected.\n');

  const userFilters = [{ email: THROWAWAY_EMAIL_DOMAINS }];
  if (listedEmails.length > 0) userFilters.push({ email: { $in: listedEmails } });

  const testUsers = await User.find({ $or: userFilters }).lean();
  const testUserIds = testUsers.map((u) => u._id);

  const testMeetings = await Meeting.find({
    $or: [{ host: { $in: testUserIds } }, { title: TEST_TITLE }],
  }).lean();
  const testMeetingIds = testMeetings.map((m) => m._id);

  // Messages reference their meeting through the "meeting" field (an ObjectId).
  const messageFilter = { meeting: { $in: testMeetingIds } };
  const testMessagesCount =
    testMeetingIds.length > 0 ? await Message.countDocuments(messageFilter) : 0;

  console.log('Found candidates for cleanup:');
  console.log(`- Test users: ${testUsers.length}`);
  testUsers.forEach((u) => console.log(`    - ${u.name} <${u.email}> (${u._id})`));
  console.log(`- Test meetings: ${testMeetings.length}`);
  testMeetings.forEach((m) => console.log(`    - "${m.title}" [${m.code}] (host: ${m.host})`));
  console.log(`- Chat messages in those meetings: ${testMessagesCount}\n`);

  if (testUsers.length === 0 && testMeetings.length === 0) {
    console.log('No test data found matching the rules. Nothing to do.');
    await mongoose.disconnect();
    return;
  }

  const confirmation = await promptConfirm(
    `Read the list above carefully. Type "${CONFIRMATION}" to delete it, anything else to abort: `
  );

  if (confirmation !== CONFIRMATION) {
    console.log('Aborted. No records were modified.');
    await mongoose.disconnect();
    return;
  }

  console.log('\nDeleting...');
  if (testMeetingIds.length > 0) {
    const messages = await Message.deleteMany(messageFilter);
    const polls = await Poll.find({ meeting: { $in: testMeetingIds } }).select('_id').lean();
    const pollIds = polls.map((p) => p._id);
    if (pollIds.length > 0) {
      await Vote.deleteMany({ poll: { $in: pollIds } });
      await Poll.deleteMany({ _id: { $in: pollIds } });
    }
    const meetings = await Meeting.deleteMany({ _id: { $in: testMeetingIds } });
    console.log(`Deleted ${messages.deletedCount} messages, ${pollIds.length} polls, and ${meetings.deletedCount} meetings.`);
  }
  if (testUserIds.length > 0) {
    const users = await User.deleteMany({ _id: { $in: testUserIds } });
    console.log(`Deleted ${users.deletedCount} users.`);
  }

  console.log('Cleanup completed.');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('Script failed:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});