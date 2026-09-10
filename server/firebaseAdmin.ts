import { initializeApp, getApps, getApp, cert } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

let firestoreInstance: Firestore | null = null;
let initAttempted = false;
let initError: Error | null = null;

// Read optional applet config as secondary fallback for project/database IDs
function getAppletConfig(): { projectId?: string; firestoreDatabaseId?: string } {
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      return JSON.parse(raw);
    }
  } catch {
    // Ignore read errors
  }
  return {};
}

export function isFirestoreConfigured(): boolean {
  const projectId = process.env.FIREBASE_PROJECT_ID || getAppletConfig().projectId;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  return Boolean(projectId && clientEmail && privateKey);
}

export function getAdminFirestore(): Firestore | null {
  if (firestoreInstance) {
    return firestoreInstance;
  }

  if (initAttempted && initError) {
    throw initError;
  }

  const appletConfig = getAppletConfig();
  const projectId = process.env.FIREBASE_PROJECT_ID || appletConfig.projectId;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;
  const databaseId = process.env.FIREBASE_DATABASE_ID || appletConfig.firestoreDatabaseId;

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  initAttempted = true;

  try {
    if (!getApps().length) {
      let formattedKey = privateKey.trim();
      if (
        (formattedKey.startsWith('"') && formattedKey.endsWith('"')) ||
        (formattedKey.startsWith("'") && formattedKey.endsWith("'"))
      ) {
        formattedKey = formattedKey.slice(1, -1);
      }
      formattedKey = formattedKey.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');

      initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey: formattedKey,
        }),
        projectId,
      });
    }

    const app = getApp();
    if (databaseId && databaseId !== '(default)') {
      firestoreInstance = getFirestore(app, databaseId);
    } else {
      firestoreInstance = getFirestore(app);
    }

    return firestoreInstance;
  } catch (err: any) {
    const safeError = new Error(`Firebase Admin initialization failed: ${err?.message || 'Unknown error'}`);
    console.error('Fatal Firebase Admin initialization failure:', safeError);
    initError = safeError;
    throw safeError;
  }
}

