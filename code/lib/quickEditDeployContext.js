import { state } from '../core/state.js';

/**
 * @typedef {object} ApexQuickEditDraft
 * @property {string} type
 * @property {string} name
 * @property {string} fileName
 * @property {string} content
 * @property {string} originalContent
 * @property {string} [tabId]
 * @property {string} [lastModifiedDate]
 */

/**
 * @typedef {object} LightningQuickEditFileDraft
 * @property {string} fileName
 * @property {string} content
 * @property {string} originalContent
 * @property {string} language
 */

/**
 * @typedef {object} LightningQuickEditDraft
 * @property {'LWC' | 'Aura'} artifactType
 * @property {string} metadataType
 * @property {string} bundleName
 * @property {string} bundleId
 * @property {string} activeFileName
 * @property {'LWC' | 'Aura'} selectedComponentType
 * @property {LightningQuickEditFileDraft[]} files
 * @property {string} [tabId]
 * @property {string} [lastModifiedDate]
 */

/**
 * @typedef {object} QuickEditDeployReturnContext
 * @property {'QuickEdit' | 'LightningQuickEdit'} tool
 * @property {string} orgId
 * @property {boolean} checkOnly
 * @property {ApexQuickEditDraft | LightningQuickEditDraft} draft
 * @property {string} [asyncId]
 */

/**
 * @param {'QuickEdit' | 'LightningQuickEdit'} [tool]
 * @returns {boolean}
 */
export function hasReturnContext(tool) {
  const ctx = state.quickEditDeployReturn;
  if (!ctx) return false;
  if (tool) return ctx.tool === tool;
  return true;
}

export function clearReturnContext() {
  state.quickEditDeployReturn = null;
}

/**
 * @returns {QuickEditDeployReturnContext | null}
 */
export function getReturnContext() {
  return state.quickEditDeployReturn;
}

/**
 * @param {string} asyncId
 */
export function updateReturnContextAsyncId(asyncId) {
  if (!state.quickEditDeployReturn) return;
  state.quickEditDeployReturn = { ...state.quickEditDeployReturn, asyncId };
}

/**
 * @param {{ orgId: string, checkOnly: boolean, tabId?: string, item: { type: string, name: string, fileName: string }, content: string, originalContent: string }} params
 */
export function saveApexDraft({ orgId, checkOnly, tabId, item, content, originalContent }) {
  /** @type {QuickEditDeployReturnContext} */
  state.quickEditDeployReturn = {
    tool: 'QuickEdit',
    orgId,
    checkOnly: !!checkOnly,
    draft: {
      type: item.type,
      name: item.name,
      fileName: item.fileName,
      content,
      originalContent,
      sourceOrgId: orgId,
      ...(tabId ? { tabId } : {})
    }
  };
}

/**
 * @param {{
 *   orgId: string,
 *   checkOnly: boolean,
 *   tabId?: string,
 *   selectedComponentType: 'LWC' | 'Aura',
 *   bundleState: {
 *     artifactType: 'LWC' | 'Aura',
 *     metadataType: string,
 *     bundleName: string,
 *     bundleId: string,
 *     activeFileName: string,
 *     lastModifiedDate?: string,
 *     files: Map<string, { content: string, originalContent: string, language: string }>
 *   }
 * }} params
 */
export function saveLightningDraft({ orgId, checkOnly, tabId, selectedComponentType, bundleState }) {
  const files = [];
  for (const [fileName, file] of bundleState.files.entries()) {
    files.push({
      fileName,
      content: file.content,
      originalContent: file.originalContent,
      language: file.language,
      lastModifiedDate: file.lastModifiedDate || '',
      lastModifiedByName: file.lastModifiedByName || '',
      lastModifiedByUsername: file.lastModifiedByUsername || ''
    });
  }
  /** @type {QuickEditDeployReturnContext} */
  state.quickEditDeployReturn = {
    tool: 'LightningQuickEdit',
    orgId,
    checkOnly: !!checkOnly,
    draft: {
      artifactType: bundleState.artifactType,
      metadataType: bundleState.metadataType,
      bundleName: bundleState.bundleName,
      bundleId: bundleState.bundleId,
      activeFileName: bundleState.activeFileName,
      selectedComponentType,
      files,
      sourceOrgId: orgId,
      ...(tabId ? { tabId } : {}),
      ...(bundleState.lastModifiedDate ? { lastModifiedDate: bundleState.lastModifiedDate } : {})
    }
  };
}

/**
 * @param {string} asyncId
 */
export async function navigateToDeployStatus(asyncId) {
  updateReturnContextAsyncId(asyncId);
  const { navigateToModeAndTool } = await import('../ui/appModeNav.js');
  const { openDeployStatusDetail } = await import('../ui/deployStatusPanel.js');
  await navigateToModeAndTool('monitoring', 'DeployStatus', { userInitiated: true });
  openDeployStatusDetail(asyncId);
}

/**
 * @param {QuickEditDeployReturnContext} ctx
 */
export async function returnToQuickEditEditor(ctx = state.quickEditDeployReturn) {
  if (!ctx?.tool || !ctx.draft) return;
  const { navigateToModeAndTool } = await import('../ui/appModeNav.js');
  await navigateToModeAndTool('development', ctx.tool, { userInitiated: true });

  if (ctx.tool === 'QuickEdit') {
    const { restoreQuickEditDraft } = await import('../ui/quickEditPanel.js');
    await restoreQuickEditDraft(/** @type {ApexQuickEditDraft} */ (ctx.draft));
  } else if (ctx.tool === 'LightningQuickEdit') {
    const { restoreLightningQuickEditDraft } = await import('../ui/lightningQuickEditPanel.js');
    await restoreLightningQuickEditDraft(/** @type {LightningQuickEditDraft} */ (ctx.draft));
  }
}
