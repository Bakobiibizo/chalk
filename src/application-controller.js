import { createApplicationDomRegistry } from './application-dom-registry.js';
import { composeApplication } from './application-composition.js';

/** @returns {import('./application-contracts.js').ApplicationLifecycle} */
export function bootstrapApplication() {
  const applicationDom = createApplicationDomRegistry();
  const application = composeApplication(applicationDom);
  application.start();
  return application;
}
