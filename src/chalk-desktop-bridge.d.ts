export interface ChalkDesktopBridge {
  readonly codexPort: string | null;
  readonly codexToken: string | null;
  readonly platform: NodeJS.Platform;
  minimizeWindow(): void;
  toggleMaximizeWindow(): void;
  closeWindow(): void;
  openChatPopout(html: string): Promise<unknown>;
  parseModelJson(text: string): Promise<unknown>;
  onMaximizedChange(callback: (maximized: boolean) => void): () => void;
}

declare global {
  var chalkDesktop: ChalkDesktopBridge | undefined;

  interface Window {
    chalkDesktop?: ChalkDesktopBridge;
  }
}
