/** Estado global de la UI del comparador (code.html). */
export const state = {
  /** Valor actual de `#typeSelect` (vacío = placeholder «elige operación»). */
  selectedArtifactType: '',
  monaco: null,
  editor: null,
  diffEditor: null,
  leftOrgId: null,
  rightOrgId: null,
  selectedItem: null,
  savedItems: [],
  authStatuses: {},
  lastToastAt: 0,
  modifierKeyPressed: false,
  scrollPositions: {},
  diffChanges: [],
  currentDiffIndex: -1,
  diffListenerDisposable: null,
  updateDiffNavButtons: null,
  lastLeftContent: '',
  lastRightContent: '',
  diffDecorationsOriginal: [],
  diffDecorationsModified: [],
  bundleCollapsed: {},
  cachedLeft: null,
  cachedRight: null,
  packageXmlLocalContent: {},
  packageRetrieveZipCache: {},
  fileViewerLoadingDepth: 0,
  spinnerToast: null,
  /** Navegación por fragmentos del visor (ver `viewerLimits.js` / `viewerChunkUi.js`). */
  viewerChunk: null,
  /** Items fijados en la lista (máximo 5). Almacena claves `type:key`. */
  pinnedKeys: [],
  ignoreTrimWhitespace: false,
  orgsList: []
};
