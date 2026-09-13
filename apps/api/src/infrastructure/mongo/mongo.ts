import { MongoClient, type Db } from 'mongodb';
import { env } from '../../config/env';

export function createMongoClient(uri: string): MongoClient {
  return new MongoClient(uri, { appName: 'nexa-api', serverSelectionTimeoutMS: 5_000 });
}

/** null when MONGODB_URI is not set: the audit log is then disabled (ADR-016). */
export const mongoClient = env.MONGODB_URI ? createMongoClient(env.MONGODB_URI) : null;

/** The database named in MONGODB_URI. */
export const mongoDb: Db | null = mongoClient ? mongoClient.db() : null;

export async function checkMongo(): Promise<void> {
  if (mongoDb) await mongoDb.command({ ping: 1 });
}
