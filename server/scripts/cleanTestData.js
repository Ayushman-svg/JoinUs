/**
 * Safe script to clean up test accounts, test meetings, and test messages from MongoDB.
 *
 * Usage:
 *   MONGODB_URI="mongodb+srv://..." node scripts/cleanTestData.js
 *
 * NOTE: This script asks for explicit confirmation before deleting anything.
 */

const readline = require('readline');
const mongoose = require('mongoose');

const User = require('../src/models/User');
const Meeting = require('../src/models/Meeting');
const Message = require('../src/models/Message');

const TEST_EMAIL_PATTERN = /@(example\.com|test\.com|temp\.com)$|test|demo/i;

async function promptConfirm(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('Error: MONGODB_URI environment variable is required.');
    process.exit(1);
  }

  console.log('Connecting to database...');
  await mongoose.connect(uri);
  console.log('Connected.\n');

  // Find candidate test users
  const testUsers = await User.find({ email: TEST_EMAIL_PATTERN }).lean();
  const testUserIds = testUsers.map((u) => u._id);

  // Find test meetings (either hosted by test users, or title containing test/demo)
  const testMeetings = await Meeting.find({
    $or: [
      { host: { $in: testUserIds } },
      { title: /test|demo|smoke/i },
    ],
  }).lean();
  const testMeetingCodes = testMeetings.map((m) => m.code);

  const testMessagesCount = await Message.countDocuments({
    meetingCode: { $in: testMeetingCodes },
  });

  console.log('Found candidates for cleanup:');
  console.log(`- Test users: ${testUsers.length}`);
  testUsers.forEach((u) => console.log(`    • ${u.name} <${u.email}> (${u._id})`));
  console.log(`- Test meetings: ${testMeetings.length}`);
  testMeetings.forEach((m) => console.log(`    • "${m.title}" [${m.code}] (Host: ${m.host})`));
  console.log(`- Associated chat messages: ${testMessagesCount}\n`);

  if (testUsers.length === 0 && testMeetings.length === 0) {
    console.log('No test data found matching the test criteria.');
    await mongoose.disconnect();
    return;
  }

  const confirmation = await promptConfirm(
    'Are you sure you want to delete these records? Type "DELETE TEST DATA" to proceed: '
  );

  if (confirmation !== 'DELETE TEST DATA') {
    console.log('Aborted. No records were modified.');
    await mongoose.disconnect();
    return;
  }

  console.log('\nDeleting...');
  if (testMeetingCodes.length > 0) {
    await Message.deleteMany({ meetingCode: { $in: testMeetingCodes } });
  }
  if (testMeetings.length > 0) {
    await Meeting.deleteMany({ _id: { $in: testMeetings.map((m) => m._id) } });
  }
  if (testUserIds.length > 0) {
    await User.deleteMany({ _id: { $in: testUserIds } });
  }

  console.log('Cleanup completed successfully.');
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
