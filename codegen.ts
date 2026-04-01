import type { CodegenConfig } from '@graphql-codegen/cli';
import dotenv from 'dotenv';

dotenv.config();

const config: CodegenConfig = {
  schema: process.env.SALEOR_API_URL,
  documents: ['tests/**/*.ts', 'lib/**/*.ts'],
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
