export function required(name: string): string {
  const val = process.env[name];
  if (!val || val.trim() === "") {
    throw new Error(`${name} is required but not set. Check your .env file.`);
  }
  return val;
}
