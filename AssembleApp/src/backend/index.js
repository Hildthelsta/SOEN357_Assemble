const db = require('./db.js');

async function main() {
  try {
    await db.connect(); // Connect to the database

    // Example: Create a new user
    const user = await db.users.create({
      username: 'alice',
      email: 'alice@example.com',
      password_hash: 'hashed_password',
    });

    console.log('Created user:', user);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await db.disconnect();  // Disconnect when done
  }
}

main();