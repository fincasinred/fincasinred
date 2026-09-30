export class EngineError extends Error {
  public readonly code: string | undefined;

  public constructor(message: string, code?: string) {
    super(message);
    this.name = "EngineError";
    this.code = code;
  }
}
