import { composeApplicationLifecycle } from './application-lifecycle-composition.js';
import { composeApplicationSetup } from './application-setup-composition.js';

/**
 * @typedef {import('./application-contracts.js').ApplicationLifecycle} ApplicationLifecycle
 * @typedef {import('./application-contracts.js').ApplicationLifecycleDependencies} ApplicationLifecycleDependencies
 * @typedef {import('./application-dom-registry.js').ApplicationDomRegistry} ApplicationDomRegistry
 *
 * @typedef {object} ApplicationCompositionPorts
 * @property {(applicationDom: ApplicationDomRegistry) => ApplicationLifecycleDependencies} composeSetup
 * @property {(dependencies: ApplicationLifecycleDependencies) => ApplicationLifecycle} composeLifecycle
 */

/**
 * @param {ApplicationDomRegistry} applicationDom
 * @param {Partial<ApplicationCompositionPorts>} [ports]
 * @returns {ApplicationLifecycle}
 */
export function composeApplication(
  applicationDom,
  { composeSetup = composeApplicationSetup, composeLifecycle = composeApplicationLifecycle } = {},
) {
  const lifecycleDependencies = composeSetup(applicationDom);
  return composeLifecycle(lifecycleDependencies);
}
