/** @typedef {import('./tabs.js').ApexLogTabId} ApexLogTabId */

/** @typedef {'purpose' | 'shows' | 'actions' | 'tips'} TabHelpSectionId */

/** @type {readonly TabHelpSectionId[]} */
export const TAB_HELP_SECTION_ORDER = ['purpose', 'shows', 'actions', 'tips'];

/** @type {Record<TabHelpSectionId, string>} */
export const TAB_HELP_SECTION_TITLE_KEYS = {
  purpose: 'apexLogViewer.help.section.purpose',
  shows: 'apexLogViewer.help.section.shows',
  actions: 'apexLogViewer.help.section.actions',
  tips: 'apexLogViewer.help.section.tips'
};

/** @param {ApexLogTabId} tabId @param {TabHelpSectionId} sectionId */
export function tabHelpSectionKey(tabId, sectionId) {
  return `apexLogViewer.help.${tabId}.${sectionId}`;
}
