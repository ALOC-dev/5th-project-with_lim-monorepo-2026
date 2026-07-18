const requireEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} is not set`);
  }
  return value;
};

export const JWT_SECRET = requireEnv("JWT_SECRET");
