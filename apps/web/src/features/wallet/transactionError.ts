export class TransactionExecutionError extends Error {
  constructor(message: string, readonly transactionHash: string) {
    super(message);
    this.name = 'TransactionExecutionError';
  }
}
