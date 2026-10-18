import type { AuthContext } from '../auth/context.js';

declare global {
  namespace Express {
    interface Request {
      id: string;
      auth?: AuthContext;
      rawBody?: Buffer;
    }
  }
}
export {};
