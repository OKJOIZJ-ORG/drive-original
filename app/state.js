'use strict';

// Application state, element references and module-level shared variables.
// One of the ordered classic scripts listed in scripts/app-scripts.cjs; all share one global scope.

const state = {
  token: null,
  expiresAt: 0,
  tokenRevision: 0,
  authAccountKey: null,
  authCapabilities: null,
  authStatus: 'anonymous',
  folders: [],
  files: [],
  nextPageToken: null,
  currentFolderId: 'root',
  currentFolderName: '내 드라이브',
  folderStack: [],
  deepScan: false,
  treeCache: null,
  loadingTree: false,
  rootFolderId: null,
  videoRotated: false,
  treeAbort: null,
  folderIndex: null,
  loadingFolderIndex: false,
  accountId: null,
  previousAccountId: null,
  accountIdentityPending: false,
  accountLocalStorageError: false,
  accountMediaState: createEmptyAccountMediaState(),
  accountStateFileId: null,
  accountStateWriterId: null,
  accountStateReadCache: new Map(),
  accountStateAbortController: null,
  accountStateLoaded: false,
  accountStateLoadingPromise: null,
  accountStateSyncPromise: null,
  accountStateSyncTimer: null,
  accountStateSyncRetryTimer: null,
  accountStateSyncRetryCount: 0,
  accountStateSyncError: null,
  accountStateRevision: 0,
  accountStateLastSyncAt: 0,
  accountStateRefreshTimer: null,
  accountStateRefreshFailures: 0,
  accountStateRefreshNotBefore: 0,
  accountStateRefreshBlocked: false,
  favoriteFiles: [],
  loadingFavorites: false,
  favoriteLoadGeneration: 0,
  favoriteLoadPromise: null,
  favoriteAbortController: null,
  libraryStatusToken: 0,
  moveTargetFolderId: null,
  moving: false,
  filter: 'all',
  query: '',
  sort: 'modifiedTime',
  selected: null,
  selectionMode: false,
  selectionGeneration: 0,
  selectedFileIds: new Set(),
  pendingActionFiles: [],
  bulkAction: false,
  serviceWorkerRegistration: null,
  loadingFiles: false,
  listLoadError: false,
  listPageTokens: new Set(),
  listGeneration: 0,
  listAbortController: null,
  listRequestPromise: null,
  populationLoadPromise: null,
  populationComplete: false,
  renderWindowStart: 0,
  renderRowHeight: 250,
  renderColumnCount: 1,
  retryAfterAuth: false,
  authRetryContext: null,
  mediaAttempt: 'idle',
  mediaPlaybackMode: '',
  mediaTransportVerified: false,
  mediaTransportStarted: false,
  mediaRangeIntegrity: 'unknown',
  mediaDecodeVerified: false,
  mediaBlobUrl: null,
  mediaAbortController: null,
  mediaSession: 0,
  mediaRetryCount: 0,
  mediaRangeRebuildCount: 0,
  mediaPermissionRetryCount: 0,
  mediaFullRequestCount: 0,
  mediaExhaustedOriginalModes: new Set(),
  mediaAbuseAcknowledged: false,
  pendingSecurityConfirmation: null,
  mediaBufferStorageMode: '',
  mediaTempStorage: null,
  pendingOriginalBuffer: null,
  drivePreviewReason: '',
  lastProxyError: null,
  playbackSession: 0,
  isSeeking: false,
  pendingPlay: false,
  resumePosition: null,
  deleting: false,
  folderIndexPromise: null,
  folderIndexAbortController: null,
  moveFolderRows: [],
  moveResultLimit: MOVE_RESULT_BATCH,
  folderRenderLimit: FOLDER_RENDER_MAX,
  treeCachePromise: null,
  authGeneration: 0,
  driveSessionGeneration: 0,
  frameDuration: DEFAULT_FRAME_DURATION,
  lastPresentedMediaTime: null,
  frameCallbackId: null,
  playbackOrderIds: [],
  playbackDeck: { anchorId: null, above: [], below: [] },
  playbackDeckComplete: false,
  demo: new URLSearchParams(location.search).get('demo') === '1'
};

const el = {};
let toastTimer = null;
let feedbackTimer = null;
let updatePending = false;
const APP_SHELL_REFRESH_PROTOCOL = 'drive-original-shell-refresh-v1';
const APP_SHELL_REFRESH_TIMEOUT_MS = 20000;
let appShellRefreshPending = null;
let appShellRefreshSequence = 0;
let updateCheckGeneration = 0;
let lastAppUpdateCheckAt = 0;
const FOREGROUND_UPDATE_CHECK_MIN_INTERVAL_MS = 60_000;
let updateCheckManualPending = false;
const UPDATE_CHECK_TIMEOUT_MS = 15000;
let controlsHideTimer = null;
let isSeekingPointer = false;
let activeSeekCleanup = null;
let isSpeedMenuOpen = false;
let isPlayerMoreOpen = false;
let tokenRenewalTimer = null;
let shuffledOrderMap = new Map();
let sortedPopulationCache = null;
let filteredPopulationCache = null;
let credentialRequestPromise = null;
let credentialRequestGeneration = -1;
let credentialRequestAbortController = null;
let credentialRequestOutcome = null;
let sessionCredentialMarker = null;
let standaloneAuthAttempt = null;
let playerReturnFocus = null;
let playbackNavigationChain = Promise.resolve();
let mediaTransitionTimers = [];
let mediaTransitionAnimations = [];
let snapBackTimer = null;
let mediaTransitionCommitting = false;
let swipeCommitPending = false;
let moveRequestGeneration = 0;
let moveParentsAbortController = null;
let mediaRecoveryTimer = null;
let mediaFrameWatchdog = null;
let mediaSeekWatchdog = null;
let completedMediaSeekPresentation = null;
let mediaSeekGeneration = 0;
let mediaSeekSettledGeneration = 0;
let mediaSourceGeneration = 0;
let initialMediaRouteGeneration = 0;
let q1Playback = null;
let playerTracksOwner = null;
let playerTracksRetirement = Promise.resolve({settled: true});
let playerTracksRetirementResult = {settled: true};
let playerSubtitleTextTrack = null;
let q3Choice = null;
let q0Playback = null;
let q0ControlWait = null;
// Private, immutable for this selected file lifetime; never persist or log.
let q0PinnedSource = null;
// One verified raster kind for this selected immutable source, never a catalog cache.
let verifiedOriginalImage = null;
let q1Retirement = Promise.resolve({ settled: true });
let q1RetirementResult = { settled: true };
let q1RetirementSequence = 0;
let pendingPlaybackRestore = null;

