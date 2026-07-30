/**
 * Shared contracts at the boundaries between the coach service, persistence,
 * renderer, and panel controllers.
 *
 * @typedef {import('./project-payload-contract.js').ProjectIdentifier} CoachIdentifier
 * @typedef {import('./project-payload-contract.js').ProjectCoachMessageRole} CoachMessageRole
 * @typedef {import('./project-payload-contract.js').ProjectCoachMessage} CoachMessage
 * @typedef {import('./project-payload-contract.js').ProjectCoachThread} CoachThread
 *
 * @typedef {{
 *   title?: string,
 *   coachMessages?: CoachMessage[],
 *   coachThreads?: CoachThread[],
 *   activeCoachThreadId?: CoachIdentifier | null,
 *   codexThreadId?: string | null,
 *   createdAt?: string,
 *   updatedAt?: string,
 *   chatWidget?: {
 *     left: number,
 *     top: number,
 *     width: number,
 *     height: number,
 *   },
 * }} CoachSession
 *
 * @typedef {{
 *   codexPort?: string | number | null,
 *   codexToken?: string | null,
 *   openChatPopout?: (html: string) => Promise<unknown>,
 * }} CoachDesktopBridge
 *
 * @typedef {{
 *   request: string,
 *   image: string | null,
 * }} PreparedCoachRequest
 *
 * @typedef {{
 *   isActive: boolean,
 *   initialize: () => void,
 *   connect: () => Promise<void>,
 *   useThread: (threadId: string | null) => void,
 *   run: (
 *     prompt: string,
 *     imageUrl?: string | null,
 *     onDelta?: (text: string) => void,
 *   ) => Promise<string>,
 *   destroy: () => void,
 * }} CoachService
 *
 * @typedef {{
 *   appendMessage: (
 *     text: string,
 *     role: CoachMessageRole,
 *     extraClass?: string,
 *     persist?: boolean,
 *   ) => HTMLDivElement,
 *   beginAssistantReply: () => HTMLDivElement,
 *   updateAssistantReply: (message: HTMLDivElement, text: string) => void,
 *   completeAssistantReply: (message: HTMLDivElement, text: string) => void,
 *   failAssistantReply: (message: HTMLDivElement, text: string) => void,
 * }} CoachMessageRendererPort
 */

export {};
