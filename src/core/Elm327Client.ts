import { assertReadOnly, ReadOnlyViolationError } from '../obd/readOnlyGuard';
import type { Transport } from '../transport/Transport';

export interface Elm327Options {
  /** Délai maximal d'attente d'une réponse, en millisecondes. */
  timeoutMs?: number;
  /** Journalisation des échanges (terminal de debug). */
  onLog?: (direction: 'tx' | 'rx' | 'warn', text: string) => void;
}

interface PendingCommand {
  command: string;
  resolve: (raw: string) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/**
 * Sérialise les échanges avec l'ELM327.
 *
 * Un adaptateur ELM327 ne traite qu'une commande à la fois : toute requête
 * envoyée avant le prompt `>` est perdue ou corrompt la réponse précédente.
 * Cette classe impose donc une file stricte, et applique le garde-fou lecture
 * seule sur CHAQUE commande avant écriture.
 */
export class Elm327Client {
  private buffer = '';
  private pending: PendingCommand | null = null;
  private queue: Array<() => void> = [];
  private unsubscribe: (() => void) | null = null;
  private readonly timeoutMs: number;

  constructor(
    private readonly transport: Transport,
    private readonly options: Elm327Options = {},
  ) {
    this.timeoutMs = options.timeoutMs ?? 4000;
  }

  attach(): void {
    this.unsubscribe?.();
    this.unsubscribe = this.transport.onData((chunk) => this.handleChunk(chunk));
  }

  detach(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.failPending(new Error('Transport détaché.'));
    this.queue = [];
    this.buffer = '';
  }

  private handleChunk(chunk: string): void {
    this.buffer += chunk;
    // Le prompt `>` marque la fin de la réponse de l'adaptateur.
    const promptIndex = this.buffer.indexOf('>');
    if (promptIndex === -1) return;

    const raw = this.buffer.slice(0, promptIndex);
    this.buffer = this.buffer.slice(promptIndex + 1);

    const pending = this.pending;
    this.pending = null;
    if (!pending) {
      this.options.onLog?.('warn', `Réponse non sollicitée ignorée : ${raw.trim()}`);
      this.runNext();
      return;
    }

    clearTimeout(pending.timer);
    this.options.onLog?.('rx', raw.trim().replace(/[\r\n]+/g, ' ⏎ '));
    pending.resolve(raw);
    this.runNext();
  }

  private failPending(error: Error): void {
    const pending = this.pending;
    this.pending = null;
    if (pending) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
  }

  private runNext(): void {
    const next = this.queue.shift();
    if (next) next();
  }

  /**
   * Envoie une commande et retourne la réponse brute (prompt exclu).
   * @throws ReadOnlyViolationError si la commande n'est pas en lecture seule.
   */
  send(rawCommand: string, timeoutMs = this.timeoutMs): Promise<string> {
    // Le garde-fou est évalué immédiatement, avant même la mise en file :
    // une commande interdite ne doit jamais atteindre le transport.
    let command: string;
    try {
      command = assertReadOnly(rawCommand);
    } catch (error) {
      if (error instanceof ReadOnlyViolationError) {
        this.options.onLog?.('warn', error.message);
      }
      return Promise.reject(error);
    }

    return new Promise<string>((resolve, reject) => {
      const run = () => {
        if (!this.transport.connected) {
          reject(new Error('Adaptateur non connecté.'));
          this.runNext();
          return;
        }

        const timer = setTimeout(() => {
          this.pending = null;
          this.buffer = '';
          reject(
            new Error(
              `Aucune réponse de l'adaptateur pour « ${command} » après ${timeoutMs} ms.`,
            ),
          );
          this.runNext();
        }, timeoutMs);

        this.pending = { command, resolve, reject, timer };
        this.options.onLog?.('tx', command);
        this.transport.write(command).catch((error: Error) => {
          clearTimeout(timer);
          this.pending = null;
          reject(error);
          this.runNext();
        });
      };

      if (this.pending) this.queue.push(run);
      else run();
    });
  }
}
