export type AuthUser = {
  id: string;
  email: string;
  name: string;
  avatarColor: string;
  createdAt: Date;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
