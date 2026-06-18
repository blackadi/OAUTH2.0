declare global {
  namespace Express {
    interface Request {
      id?: string;
      logger?: any;
    }
  }
}

export {};
