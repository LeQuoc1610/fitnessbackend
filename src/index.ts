import 'dotenv/config';
import { connectToDatabase } from './lib/db.js';
import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 8080);

async function main() {
  await connectToDatabase();

  const app = createApp();

  app.listen(port, () => {
    console.log(`GymBro API listening on http://localhost:${port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
