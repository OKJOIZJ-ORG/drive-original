// Real sw.js with only the page/Drive collaborators replaced by local fakes.
importScripts('./sw.js', './__exp_sizes.js');
requestQ0Page = async (context) => ({ context: { clientId: context.clientId, fileId: context.fileId,
  sourceGeneration: context.sourceGeneration, mediaSession: '7', accountGeneration: 1, accountKey: 'acct' },
  resourceKey: null, traceId: 'exp' });
getUsableCredential = async () => ({ token: 'local', account: 'acct', revision: 1 });
getQ0RevisionPin = async (context) => ({ uri: `${self.location.origin}/__exp_media/${context.fileId}.mp4`,
  descriptor: { size: String(self.EXP_SIZES[context.fileId]), mimeType: 'video/mp4', resourceKey: null, accountKey: 'acct' } });
if (self.EXP_BASELINE) { tapQ0Continuation = body => body; adoptQ0Continuation = () => null; }
