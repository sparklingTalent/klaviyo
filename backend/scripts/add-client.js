import bcrypt from 'bcryptjs';
import { run, query } from '../db/database.js';
import { getDb } from '../db/database.js';
import dotenv from 'dotenv';

dotenv.config();

// Initialize database
await import('../db/database.js').then(m => m.initDatabase());

async function addClient(name, email, password, klaviyoPrivateKey) {
  try {
    // Check if client already exists
    const existing = await query('SELECT * FROM clients WHERE email = ?', [email]);
    if (existing.length > 0) {
      console.error('Client with this email already exists');
      process.exit(1);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert client
    const result = await run(
      'INSERT INTO clients (name, email, password, klaviyo_private_key) VALUES (?, ?, ?, ?)',
      [name, email, hashedPassword, klaviyoPrivateKey]
    );

    console.log('Client created successfully!');
    console.log({
      id: result.id,
      name,
      email
    });

    // Close database connection
    const db = getDb();
    db.close();
  } catch (error) {
    console.error('Error creating client:', error);
    process.exit(1);
  }
}

// Get arguments from command line
const args = process.argv.slice(2);
if (args.length < 4) {
  console.error('Usage: node add-client.js <name> <email> <password> <klaviyo_private_key>');
  process.exit(1);
}

const [name, email, password, klaviyoPrivateKey] = args;
addClient(name, email, password, klaviyoPrivateKey);

