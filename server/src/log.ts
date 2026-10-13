const stamp = (): string => new Date().toISOString();

export const log = {
  info: (message: string, extra: unknown = ""): void => console.log(`${stamp()} ${message}`, extra),
  warn: (message: string, extra: unknown = ""): void => console.warn(`${stamp()} WARN ${message}`, extra),
  error: (message: string, extra: unknown = ""): void => console.error(`${stamp()} ERROR ${message}`, extra),
};
