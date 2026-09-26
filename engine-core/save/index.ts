// engine-core/save — persistence abstraction for the versioned SaveGame blob.
//
// Exposes the async SaveRepository contract plus the browser localStorage
// adapter. A future SupabaseSaveRepository implements the same interface in the
// host layer; engine-core stays backend-free.

export type { SaveRepository } from './repository';
export { LocalStorageSaveRepository, DEFAULT_SAVE_KEY } from './localStorage';
export type { StorageLike } from './localStorage';
