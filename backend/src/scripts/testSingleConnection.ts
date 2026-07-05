import 'dotenv/config';
import { testSqlServerConnection } from '../utils/systemConnection';

async function main(): Promise<void> {
  const url = process.argv[2];
  if (!url) {
    console.error('Missing connection URL');
    process.exit(2);
  }

  const result = await testSqlServerConnection(url);
  console.log(JSON.stringify(result));
}

main().catch((error) => {
  console.log(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Connection failed' }));
  process.exit(1);
});
