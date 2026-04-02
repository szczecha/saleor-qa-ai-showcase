import type { CodegenConfig } from '@graphql-codegen/cli';
import dotenv from 'dotenv';

dotenv.config();

const apiUrl = process.env.SALEOR_API_URL;
if (!apiUrl) {
  throw new Error('SALEOR_API_URL is not set. Copy .env.example to .env and fill in the value.');
}

const config: CodegenConfig = {
  schema: apiUrl,
  documents: ['tests/**/*.ts', 'lib/**/*.ts', '!lib/generated/**'],
  ignoreNoDocuments: true,
  generates: {
    'lib/generated/graphql.ts': {
      plugins: ['typescript', 'typescript-operations'],
      config: {
        strictScalars: false,
        skipTypename: true,
      },
    },
  },
};

export default config;
